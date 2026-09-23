using System.Diagnostics;
using LineVision.Core.Domain.Enums;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Logging;
using OpenCvSharp;

namespace LineVision.Vision.Algorithms;

public class PresenceAbsenceAlgorithm : IVisionAlgorithm
{
    private readonly ILogger<PresenceAbsenceAlgorithm> _logger;

    public string AlgorithmType => "PRESENCE";

    public PresenceAbsenceAlgorithm(ILogger<PresenceAbsenceAlgorithm> logger)
    {
        _logger = logger;
    }

    public Task<PointInspectionResult> EvaluateAsync(
        CameraFrame frame, 
        InspectionPoint point, 
        IReadOnlyList<InspectionROI> rois, 
        CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        var result = new PointInspectionResult
        {
            InspectionPoint_ID = point.InspectionPoint_ID,
            PointCode = point.Code,
            PointName = point.Name,
            ExpectedValue = point.ExpectedValue,
            IsRequired = point.IsRequired,
            Timestamp = DateTime.UtcNow
        };

        if (frame.Data == null || frame.Data.Length == 0)
        {
            result.Result = InspectionResultStatus.NOK;
            result.DetectedValue = "EMPTY_FRAME";
            result.Confidence = 0.0;
            result.FailureReason = "Frame data is missing or corrupted";
            result.ProcessingTimeMs = (int)sw.ElapsedMilliseconds;
            return Task.FromResult(result);
        }

        using var mat = Cv2.ImDecode(frame.Data, ImreadModes.Color);
        if (mat.Empty())
        {
            result.Result = InspectionResultStatus.NOK;
            result.DetectedValue = "DECODE_FAILED";
            result.Confidence = 0.0;
            result.FailureReason = "OpenCV failed to decode image frame";
            result.ProcessingTimeMs = (int)sw.ElapsedMilliseconds;
            return Task.FromResult(result);
        }

        // Si no hay ROIs explícitas, evaluar el centro del frame
        var effectiveRois = rois.Count > 0 
            ? rois 
            : new List<InspectionROI> { new() { X = 0, Y = 0, Width = mat.Width, Height = mat.Height } };

        double totalScore = 0;
        int evaluatedCount = 0;

        foreach (var r in effectiveRois)
        {
            int rx = Math.Clamp(r.X, 0, mat.Width - 1);
            int ry = Math.Clamp(r.Y, 0, mat.Height - 1);
            int rw = Math.Clamp(r.Width, 1, mat.Width - rx);
            int rh = Math.Clamp(r.Height, 1, mat.Height - ry);

            var roiRect = new Rect(rx, ry, rw, rh);
            using var roiMat = new Mat(mat, roiRect);
            using var gray = new Mat();
            Cv2.CvtColor(roiMat, gray, ColorConversionCodes.BGR2GRAY);

            // Compute edge density / gradient variance to evaluate workpiece presence
            using var edges = new Mat();
            Cv2.Canny(gray, edges, 50, 150);

            // Mean pixel intensity & edge count
            var mean = Cv2.Mean(gray);
            int nonZeroEdges = Cv2.CountNonZero(edges);
            double edgeDensity = (double)nonZeroEdges / (rw * rh);

            // Presencia esperada: si hay bordes significativos y nivel de luz superior al fondo
            double score;
            if (mean.Val0 > 40 && nonZeroEdges > 15)
            {
                score = Math.Min(0.98, 0.75 + (edgeDensity * 4.0) + (mean.Val0 > 50 ? 0.18 : 0.05));
            }
            else
            {
                score = Math.Max(0.15, Math.Min(0.40, edgeDensity * 2.0));
            }
            totalScore += score;
            evaluatedCount++;
        }

        double confidence = evaluatedCount > 0 ? totalScore / evaluatedCount : 0.0;
        result.Confidence = Math.Round(confidence, 4);

        bool isPresent = confidence >= point.MinConfidence;
        result.DetectedValue = isPresent ? "PRESENT" : "ABSENT";

        bool matchesExpected = string.Equals(result.DetectedValue, point.ExpectedValue, StringComparison.OrdinalIgnoreCase);
        if (matchesExpected)
        {
            result.Result = InspectionResultStatus.OK;
        }
        else
        {
            result.Result = point.IsRequired ? InspectionResultStatus.NOK : InspectionResultStatus.WARNING;
            result.FailureReason = $"Confidence ({result.Confidence * 100:F1}%) below required threshold ({point.MinConfidence * 100:F1}%) or value mismatch";
        }

        sw.Stop();
        result.ProcessingTimeMs = (int)sw.ElapsedMilliseconds;

        _logger.LogDebug("Presence evaluation for {Point}: Result={Result}, Value={Val}, Conf={Conf:P1} ({Ms}ms)",
            point.Code, result.Result, result.DetectedValue, result.Confidence, result.ProcessingTimeMs);

        return Task.FromResult(result);
    }
}
