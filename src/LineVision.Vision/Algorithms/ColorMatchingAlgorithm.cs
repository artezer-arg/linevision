using System.Diagnostics;
using System.Text.Json;
using LineVision.Core.Domain.Enums;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Logging;
using OpenCvSharp;

namespace LineVision.Vision.Algorithms;

public class ColorMatchingAlgorithm : IVisionAlgorithm
{
    private readonly ILogger<ColorMatchingAlgorithm> _logger;

    public string AlgorithmType => "COLOR";

    public ColorMatchingAlgorithm(ILogger<ColorMatchingAlgorithm> logger)
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
            result.FailureReason = "Frame data is missing";
            result.ProcessingTimeMs = (int)sw.ElapsedMilliseconds;
            return Task.FromResult(result);
        }

        using var mat = Cv2.ImDecode(frame.Data, ImreadModes.Color);
        if (mat.Empty())
        {
            result.Result = InspectionResultStatus.NOK;
            result.DetectedValue = "DECODE_FAILED";
            result.Confidence = 0.0;
            result.FailureReason = "Failed to decode frame";
            result.ProcessingTimeMs = (int)sw.ElapsedMilliseconds;
            return Task.FromResult(result);
        }

        var effectiveRois = rois.Count > 0 ? rois : new List<InspectionROI> { new() { X = 0, Y = 0, Width = mat.Width, Height = mat.Height } };

        // Parse color preset or custom HSV ranges
        var (lowerHsv, upperHsv, minCoverage) = ResolveColorThresholds(point, effectiveRois.FirstOrDefault());

        double totalCoverage = 0;
        int evaluated = 0;

        foreach (var r in effectiveRois)
        {
            int rx = Math.Clamp(r.X, 0, mat.Width - 1);
            int ry = Math.Clamp(r.Y, 0, mat.Height - 1);
            int rw = Math.Clamp(r.Width, 1, mat.Width - rx);
            int rh = Math.Clamp(r.Height, 1, mat.Height - ry);

            var roiRect = new Rect(rx, ry, rw, rh);
            using var roiMat = new Mat(mat, roiRect);

            // Convert BGR to HSV
            using var hsv = new Mat();
            Cv2.CvtColor(roiMat, hsv, ColorConversionCodes.BGR2HSV);

            // InRange thresholding
            using var mask = new Mat();
            if (lowerHsv.Val0 > upperHsv.Val0)
            {
                // Red wrap-around (e.g. 170-179 and 0-10)
                using var mask1 = new Mat();
                using var mask2 = new Mat();
                Cv2.InRange(hsv, new Scalar(0, lowerHsv.Val1, lowerHsv.Val2), new Scalar(upperHsv.Val0, upperHsv.Val1, upperHsv.Val2), mask1);
                Cv2.InRange(hsv, new Scalar(lowerHsv.Val0, lowerHsv.Val1, lowerHsv.Val2), new Scalar(179, upperHsv.Val1, upperHsv.Val2), mask2);
                Cv2.BitwiseOr(mask1, mask2, mask);
            }
            else
            {
                Cv2.InRange(hsv, lowerHsv, upperHsv, mask);
            }

            int matchingPixels = Cv2.CountNonZero(mask);
            double coverage = (double)matchingPixels / (rw * rh);
            totalCoverage += coverage;
            evaluated++;
        }

        double avgCoverage = evaluated > 0 ? totalCoverage / evaluated : 0.0;
        double confidence = Math.Min(1.0, avgCoverage / Math.Max(0.01, minCoverage));

        result.ProcessingTimeMs = (int)sw.ElapsedMilliseconds;
        result.DetectedValue = $"COLOR_{Math.Round(avgCoverage * 100, 1)}%_MATCH";
        result.Confidence = Math.Round(confidence, 3);

        if (avgCoverage >= minCoverage && confidence >= point.MinConfidence)
        {
            result.Result = InspectionResultStatus.OK;
        }
        else
        {
            result.Result = InspectionResultStatus.NOK;
            result.FailureReason = $"Color coverage ({Math.Round(avgCoverage * 100, 1)}%) below required threshold ({Math.Round(minCoverage * 100, 1)}%)";
        }

        return Task.FromResult(result);
    }

    private static (Scalar lower, Scalar upper, double minCoverage) ResolveColorThresholds(InspectionPoint point, InspectionROI? roi)
    {
        // Try parsing ParametersJson
        if (roi != null && !string.IsNullOrWhiteSpace(roi.ParametersJson))
        {
            try
            {
                using var doc = JsonDocument.Parse(roi.ParametersJson);
                var root = doc.RootElement;
                if (root.TryGetProperty("hMin", out var hMin) &&
                    root.TryGetProperty("hMax", out var hMax) &&
                    root.TryGetProperty("sMin", out var sMin) &&
                    root.TryGetProperty("sMax", out var sMax) &&
                    root.TryGetProperty("vMin", out var vMin) &&
                    root.TryGetProperty("vMax", out var vMax))
                {
                    double cov = root.TryGetProperty("minCoverage", out var c) ? c.GetDouble() : 0.15;
                    return (
                        new Scalar(hMin.GetInt32(), sMin.GetInt32(), vMin.GetInt32()),
                        new Scalar(hMax.GetInt32(), sMax.GetInt32(), vMax.GetInt32()),
                        cov
                    );
                }
            }
            catch
            {
                // Fall back to ExpectedValue presets
            }
        }

        // Standard Industrial Presets
        string key = (point.ExpectedValue ?? "").ToUpperInvariant();

        return key switch
        {
            // Mastic / Sealer Blue: H 100..130, S 80..255, V 50..255
            "BLUE" or "SELLADOR_AZUL" or "MASTIC_BLUE" =>
                (new Scalar(100, 80, 50), new Scalar(130, 255, 255), 0.12),

            // Mastic / Sealer Black: Low value V < 50
            "BLACK" or "SELLADOR_NEGRO" or "MASTIC_BLACK" =>
                (new Scalar(0, 0, 0), new Scalar(179, 100, 50), 0.15),

            // Yellow Plastic Clip: H 20..35, S 100..255, V 100..255
            "YELLOW" or "CLIP_AMARILLO" =>
                (new Scalar(20, 100, 100), new Scalar(35, 255, 255), 0.15),

            // White Plastic Clip: S < 40, V > 160
            "WHITE" or "CLIP_BLANCO" =>
                (new Scalar(0, 0, 160), new Scalar(179, 45, 255), 0.10),

            // Green Paint Dot / Seal: H 35..85, S 80..255, V 60..255
            "GREEN" or "MARCADOR_VERDE" =>
                (new Scalar(35, 80, 60), new Scalar(85, 255, 255), 0.10),

            // Red Clip / Seal: H 170..10
            "RED" or "CLIP_ROJO" =>
                (new Scalar(170, 100, 80), new Scalar(10, 255, 255), 0.12),

            // Default
            _ => (new Scalar(100, 70, 50), new Scalar(135, 255, 255), 0.10)
        };
    }
}
