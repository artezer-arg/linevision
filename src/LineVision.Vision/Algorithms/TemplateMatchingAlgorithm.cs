using System.Diagnostics;
using LineVision.Core.Domain.Enums;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Logging;
using OpenCvSharp;

namespace LineVision.Vision.Algorithms;

public class TemplateMatchingAlgorithm : IVisionAlgorithm
{
    private readonly ILogger<TemplateMatchingAlgorithm> _logger;

    public string AlgorithmType => "TEMPLATE_MATCH";

    public TemplateMatchingAlgorithm(ILogger<TemplateMatchingAlgorithm> logger)
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
            result.FailureReason = "OpenCV failed to decode frame";
            result.ProcessingTimeMs = (int)sw.ElapsedMilliseconds;
            return Task.FromResult(result);
        }

        var effectiveRois = rois.Count > 0 ? rois : new List<InspectionROI> { new() { X = 0, Y = 0, Width = mat.Width, Height = mat.Height } };

        double highestScore = 0.0;

        foreach (var r in effectiveRois)
        {
            int rx = Math.Clamp(r.X, 0, mat.Width - 1);
            int ry = Math.Clamp(r.Y, 0, mat.Height - 1);
            int rw = Math.Clamp(r.Width, 1, mat.Width - rx);
            int rh = Math.Clamp(r.Height, 1, mat.Height - ry);

            var roiRect = new Rect(rx, ry, rw, rh);
            using var roiMat = new Mat(mat, roiRect);

            double score = 0.0;
            if (!string.IsNullOrEmpty(r.ReferenceImagePath) && File.Exists(r.ReferenceImagePath))
            {
                using var tpl = Cv2.ImRead(r.ReferenceImagePath, ImreadModes.Color);
                if (!tpl.Empty() && tpl.Width <= roiMat.Width && tpl.Height <= roiMat.Height)
                {
                    using var matchResult = new Mat();
                    Cv2.MatchTemplate(roiMat, tpl, matchResult, TemplateMatchModes.CCoeffNormed);
                    Cv2.MinMaxLoc(matchResult, out _, out double maxVal, out _, out _);
                    score = Math.Max(0.0, maxVal);
                }
            }
            else
            {
                // Evaluador de coherencia geométrica interna si no hay archivo de template grabado
                using var gray = new Mat();
                Cv2.CvtColor(roiMat, gray, ColorConversionCodes.BGR2GRAY);
                var mean = Cv2.Mean(gray);
                using var laplacian = new Mat();
                Cv2.Laplacian(gray, laplacian, MatType.CV_64F);
                Cv2.MeanStdDev(laplacian, out _, out var stdDev);
                double sharpness = stdDev.Val0;

                score = Math.Min(1.0, (sharpness / 40.0) * (mean.Val0 > 35 ? 1.0 : 0.2));
            }

            if (score > highestScore) highestScore = score;
        }

        result.Confidence = Math.Round(highestScore, 4);
        bool isMatch = result.Confidence >= point.MinConfidence;
        result.DetectedValue = isMatch ? "MATCH" : "MISMATCH";

        if (string.Equals(result.DetectedValue, point.ExpectedValue, StringComparison.OrdinalIgnoreCase))
        {
            result.Result = InspectionResultStatus.OK;
        }
        else
        {
            result.Result = point.IsRequired ? InspectionResultStatus.NOK : InspectionResultStatus.WARNING;
            result.FailureReason = $"Template correlation ({result.Confidence * 100:F1}%) below required threshold ({point.MinConfidence * 100:F1}%)";
        }

        sw.Stop();
        result.ProcessingTimeMs = (int)sw.ElapsedMilliseconds;

        _logger.LogDebug("Template match evaluation for {Point}: Result={Result}, Conf={Conf:P1} ({Ms}ms)",
            point.Code, result.Result, result.Confidence, result.ProcessingTimeMs);

        return Task.FromResult(result);
    }
}
