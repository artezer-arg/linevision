using System.Diagnostics;
using LineVision.Core.Domain.Enums;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Logging;
using OpenCvSharp;

namespace LineVision.Vision.Engine;

public class InspectionEngine : IInspectionEngine
{
    private readonly IEnumerable<IVisionAlgorithm> _algorithms;
    private readonly ILogger<InspectionEngine> _logger;
    private readonly string _evidenceDir;

    public InspectionEngine(IEnumerable<IVisionAlgorithm> algorithms, ILogger<InspectionEngine> logger)
    {
        _algorithms = algorithms;
        _logger = logger;
        _evidenceDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "evidence");
        Directory.CreateDirectory(_evidenceDir);
    }

    public async Task<InspectionReport> ExecutePlanAsync(
        InspectionPlan plan, 
        ProductContext context, 
        IReadOnlyDictionary<string, CameraFrame> frames, 
        CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        var report = new InspectionReport
        {
            PlanCode = plan.Code,
            PlanVersion = plan.ActiveVersion
        };

        var version = plan.Versions.FirstOrDefault(v => v.VersionNumber == plan.ActiveVersion) 
            ?? plan.Versions.FirstOrDefault();

        if (version == null || version.Details.Count == 0)
        {
            _logger.LogError("Inspection Plan {Code} (v{Ver}) has no inspection points configured", plan.Code, plan.ActiveVersion);
            report.OverallSuccess = false;
            return report;
        }

        var orderedDetails = version.Details
            .Where(d => d.Point != null && d.Point.Enabled)
            .OrderBy(d => d.ExecutionOrder)
            .ToList();

        report.TotalPoints = orderedDetails.Count;
        _logger.LogInformation("Executing Inspection Plan '{Code}' (v{Ver}) with {Count} points for {Model}/{Hand}/{Pos}",
            plan.Code, version.VersionNumber, report.TotalPoints, context.Modelo, context.Mano, context.Posicion);

        foreach (var detail in orderedDetails)
        {
            var point = detail.Point!;
            bool isRequired = detail.IsRequiredOverride ?? point.IsRequired;

            // 1. Obtener frame de la cámara asignada
            if (!frames.TryGetValue(point.CameraId, out var frame) || frame.Data == null || frame.Data.Length == 0)
            {
                _logger.LogWarning("Camera frame for '{CamId}' (Point {PointCode}) is not available", point.CameraId, point.Code);
                var missingResult = new PointInspectionResult
                {
                    InspectionPoint_ID = point.InspectionPoint_ID,
                    PointCode = point.Code,
                    PointName = point.Name,
                    ExpectedValue = point.ExpectedValue,
                    DetectedValue = "CAMERA_UNAVAILABLE",
                    Confidence = 0.0,
                    Result = isRequired ? InspectionResultStatus.NOK : InspectionResultStatus.WARNING,
                    IsRequired = isRequired,
                    FailureReason = $"Camera {point.CameraId} failed to supply frame"
                };
                report.Details.Add(missingResult);
                if (isRequired) report.FailedRequiredPoints.Add(point.Code);
                continue;
            }

            // 2. Localizar algoritmo correspondiente
            var algo = _algorithms.FirstOrDefault(a => string.Equals(a.AlgorithmType, point.AlgorithmType, StringComparison.OrdinalIgnoreCase))
                ?? _algorithms.FirstOrDefault(a => a.AlgorithmType == "PRESENCE");

            if (algo == null)
            {
                _logger.LogError("Algorithm '{Algo}' not found for point {PointCode}", point.AlgorithmType, point.Code);
                continue;
            }

            // 3. Ejecutar algoritmo
            var pointResult = await algo.EvaluateAsync(frame, point, point.ROIs, ct);
            pointResult.InspectionPlan_ID = plan.Plan_ID;
            pointResult.InspectionPlanVersion = version.VersionNumber;
            pointResult.IsRequired = isRequired;

            // 4. Generar y guardar imagen de evidencia anotada
            try
            {
                string evidencePath = GenerateAndSaveEvidenceImage(frame, point, pointResult);
                pointResult.ImagePath = evidencePath;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to save visual evidence for {PointCode}", point.Code);
            }

            // 5. Acumular estadísticas
            if (pointResult.Result == InspectionResultStatus.OK)
            {
                report.PassedPoints++;
            }
            else if (pointResult.Result == InspectionResultStatus.WARNING)
            {
                report.WarningPoints++;
            }
            else
            {
                report.FailedPoints++;
                if (isRequired)
                {
                    report.FailedRequiredPoints.Add(point.Code);
                }
            }

            report.Details.Add(pointResult);
        }

        sw.Stop();
        report.ExecutionDurationMs = (int)sw.ElapsedMilliseconds;

        // Regla de aprobación estricta: Todos los puntos obligatorios (Required = true) deben ser OK
        report.OverallSuccess = report.FailedRequiredPoints.Count == 0;

        _logger.LogInformation("Inspection Plan '{Code}' finished in {Ms}ms. Overall: {Status} (Passed: {P}, Failed: {F}, Warnings: {W})",
            plan.Code, report.ExecutionDurationMs, report.OverallSuccess ? "OK" : "NOK",
            report.PassedPoints, report.FailedPoints, report.WarningPoints);

        return report;
    }

    private string GenerateAndSaveEvidenceImage(CameraFrame frame, InspectionPoint point, PointInspectionResult result)
    {
        using var mat = Cv2.ImDecode(frame.Data, ImreadModes.Color);
        if (mat.Empty()) return string.Empty;

        // Color del overlay: Verde para OK, Rojo para NOK, Amarillo para Advertencia
        Scalar boxColor = result.Result switch
        {
            InspectionResultStatus.OK => new Scalar(0, 220, 0),
            InspectionResultStatus.WARNING => new Scalar(0, 220, 255),
            _ => new Scalar(0, 0, 240)
        };

        // Dibujar ROIs
        foreach (var roi in point.ROIs)
        {
            int rx = Math.Clamp(roi.X, 0, mat.Width - 1);
            int ry = Math.Clamp(roi.Y, 0, mat.Height - 1);
            int rw = Math.Clamp(roi.Width, 1, mat.Width - rx);
            int rh = Math.Clamp(roi.Height, 1, mat.Height - ry);

            var rect = new Rect(rx, ry, rw, rh);
            Cv2.Rectangle(mat, rect, boxColor, 2);
            Cv2.PutText(mat, $"{roi.Name}: {result.Result} ({result.Confidence * 100:F0}%)", 
                new Point(rx, Math.Max(20, ry - 8)), HersheyFonts.HersheySimplex, 0.45, boxColor, 1);
        }

        // HUD Banner inferior con resumen
        Cv2.Rectangle(mat, new Rect(0, mat.Height - 35, mat.Width, 35), new Scalar(20, 20, 20), -1);
        string hud = $"{point.Code} - {point.Name} | {result.Result} | Conf: {result.Confidence * 100:F1}% | {result.DetectedValue}";
        Cv2.PutText(mat, hud, new Point(15, mat.Height - 12), HersheyFonts.HersheySimplex, 0.45, boxColor, 1);

        // Guardar archivo
        string dateFolder = DateTime.UtcNow.ToString("yyyyMMdd");
        string targetDir = Path.Combine(_evidenceDir, dateFolder);
        Directory.CreateDirectory(targetDir);

        string filename = $"{point.Code}_{result.Result}_{DateTime.UtcNow:HHmmssfff}.jpg";
        string fullPath = Path.Combine(targetDir, filename);

        Cv2.ImWrite(fullPath, mat, new ImageEncodingParam(ImwriteFlags.JpegQuality, 85));
        return fullPath;
    }
}
