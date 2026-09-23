using System.Diagnostics;
using LineVision.Core.Domain.Enums;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Logging;
using OpenCvSharp;
using ZXing;
using ZXing.Common;

namespace LineVision.Vision.Algorithms;

public class QRCodeAlgorithm : IVisionAlgorithm
{
    private readonly ILogger<QRCodeAlgorithm> _logger;

    public string AlgorithmType => "QR";

    public QRCodeAlgorithm(ILogger<QRCodeAlgorithm> logger)
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

        Rect? roiRect = null;
        if (rois != null && rois.Count > 0)
        {
            var r = rois[0];
            roiRect = new Rect(r.X, r.Y, r.Width, r.Height);
        }

        string? decodedText = DecodeText(mat, roiRect);

        if (!string.IsNullOrEmpty(decodedText))
        {
            result.DetectedValue = decodedText;
            result.Confidence = 0.99;

            // Validación de valor esperado
            string expected = (point.ExpectedValue ?? "").Trim();
            bool isGenericExpectation = string.IsNullOrEmpty(expected) 
                || expected.Equals("PRESENT", StringComparison.OrdinalIgnoreCase) 
                || expected.Equals("MATCH", StringComparison.OrdinalIgnoreCase);

            if (isGenericExpectation)
            {
                result.Result = InspectionResultStatus.OK;
            }
            else
            {
                bool matches = decodedText.Equals(expected, StringComparison.OrdinalIgnoreCase)
                    || decodedText.Contains(expected, StringComparison.OrdinalIgnoreCase);

                if (matches)
                {
                    result.Result = InspectionResultStatus.OK;
                }
                else
                {
                    result.Result = point.IsRequired ? InspectionResultStatus.NOK : InspectionResultStatus.WARNING;
                    result.FailureReason = $"El QR decodificado '{decodedText}' no coincide con el valor esperado '{expected}'";
                }
            }
        }
        else
        {
            result.DetectedValue = "NO_QR_DETECTED";
            result.Confidence = 0.0;
            result.Result = point.IsRequired ? InspectionResultStatus.NOK : InspectionResultStatus.WARNING;
            result.FailureReason = "No se detectó ningún código QR en la zona seleccionada ni en el cuadro completo. Enfoque el código QR frente a la cámara con suficiente contraste.";
        }

        sw.Stop();
        result.ProcessingTimeMs = (int)sw.ElapsedMilliseconds;

        _logger.LogInformation("QR Algorithm for {Point}: Result={Result}, Value='{Val}' ({Ms}ms)",
            point.Code, result.Result, result.DetectedValue, result.ProcessingTimeMs);

        return Task.FromResult(result);
    }

    /// <summary>
    /// Decodificador industrial multi-paso utilizando ZXing.Net con preprocesamiento OpenCV (Quiet Zone, CLAHE, Adaptive Threshold).
    /// </summary>
    public string? DecodeText(Mat mat, Rect? roi = null)
    {
        if (mat.Empty()) return null;

        var reader = new BarcodeReaderGeneric
        {
            AutoRotate = true,
            Options = new DecodingOptions
            {
                TryHarder = true,
                PossibleFormats = new[] { BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX }
            }
        };

        // -------------------------------------------------------------
        // FASE 1: BÚSQUEDA PRIORITARIA EN LA REGIÓN DE INTERÉS (ROI)
        // -------------------------------------------------------------
        if (roi.HasValue && roi.Value.Width > 15 && roi.Value.Height > 15)
        {
            // Margen de seguridad de 30px para evitar cortes y garantizar Quiet Zone
            int margin = 30;
            int rx = Math.Max(0, roi.Value.X - margin);
            int ry = Math.Max(0, roi.Value.Y - margin);
            int rw = Math.Min(mat.Width - rx, roi.Value.Width + margin * 2);
            int rh = Math.Min(mat.Height - ry, roi.Value.Height + margin * 2);

            using var crop = new Mat(mat, new Rect(rx, ry, rw, rh));
            using var grayCrop = new Mat();
            if (crop.Channels() > 1)
                Cv2.CvtColor(crop, grayCrop, ColorConversionCodes.BGR2GRAY);
            else
                crop.CopyTo(grayCrop);

            // Padding blanco perimetral obligatorio para la especificación QR ISO/IEC
            using var padded = new Mat();
            Cv2.CopyMakeBorder(grayCrop, padded, 25, 25, 25, 25, BorderTypes.Constant, Scalar.White);

            // Paso 1A: ZXing directo sobre escala de grises con padding
            var text = TryDecodeZxing(padded, reader);
            if (!string.IsNullOrEmpty(text)) return text;

            // Paso 1B: Reescalado adaptativo (para ROIs pequeñas < 320px)
            using var upscaled = new Mat();
            int targetW = Math.Max(padded.Width, 320);
            int targetH = (int)(padded.Height * ((double)targetW / padded.Width));
            Cv2.Resize(padded, upscaled, new Size(targetW, targetH), interpolation: InterpolationFlags.Cubic);

            text = TryDecodeZxing(upscaled, reader);
            if (!string.IsNullOrEmpty(text)) return text;

            // Paso 1C: CLAHE (Contrast Limited Adaptive Histogram Equalization) para celulares y brillos
            using var clahe = new Mat();
            using var cvClahe = Cv2.CreateCLAHE(3.0, new Size(8, 8));
            cvClahe.Apply(upscaled, clahe);
            text = TryDecodeZxing(clahe, reader);
            if (!string.IsNullOrEmpty(text)) return text;

            // Paso 1D: Binarización adaptativa Gaussiana
            using var adapt = new Mat();
            Cv2.AdaptiveThreshold(upscaled, adapt, 255, AdaptiveThresholdTypes.GaussianC, ThresholdTypes.Binary, 25, 5);
            text = TryDecodeZxing(adapt, reader);
            if (!string.IsNullOrEmpty(text)) return text;

            // Paso 1E: Binarización Otsu
            using var otsu = new Mat();
            Cv2.Threshold(upscaled, otsu, 0, 255, ThresholdTypes.Binary | ThresholdTypes.Otsu);
            text = TryDecodeZxing(otsu, reader);
            if (!string.IsNullOrEmpty(text)) return text;

            // Paso 1F: OpenCV QRCodeDetector envuelto en try-catch seguro
            try
            {
                using var cvQr = new QRCodeDetector();
                string cvRes = cvQr.DetectAndDecode(padded, out Point2f[] _);
                if (!string.IsNullOrEmpty(cvRes)) return cvRes;
            }
            catch (Exception ex)
            {
                _logger.LogDebug("OpenCV QRCodeDetector fallback skipped: {Msg}", ex.Message);
            }
        }

        // -------------------------------------------------------------
        // FASE 2: BÚSQUEDA EN FRAME COMPLETO (Si el ROI no lo capturó)
        // -------------------------------------------------------------
        using var grayFull = new Mat();
        if (mat.Channels() > 1)
            Cv2.CvtColor(mat, grayFull, ColorConversionCodes.BGR2GRAY);
        else
            mat.CopyTo(grayFull);

        var fullText = TryDecodeZxing(grayFull, reader);
        if (!string.IsNullOrEmpty(fullText)) return fullText;

        // Intentar con CLAHE en full frame
        using var fullClahe = new Mat();
        using var fullCvClahe = Cv2.CreateCLAHE(3.0, new Size(8, 8));
        fullCvClahe.Apply(grayFull, fullClahe);
        fullText = TryDecodeZxing(fullClahe, reader);
        if (!string.IsNullOrEmpty(fullText)) return fullText;

        // Intentar OpenCV en full frame con try-catch seguro
        try
        {
            using var cvQrFull = new QRCodeDetector();
            string cvResFull = cvQrFull.DetectAndDecode(grayFull, out Point2f[] _);
            if (!string.IsNullOrEmpty(cvResFull)) return cvResFull;
        }
        catch (Exception ex)
        {
            _logger.LogDebug("OpenCV full frame fallback skipped: {Msg}", ex.Message);
        }

        return null;
    }

    private static string? TryDecodeZxing(Mat m, BarcodeReaderGeneric reader)
    {
        if (m.Empty()) return null;
        try
        {
            byte[] bytes = new byte[m.Total() * m.ElemSize()];
            System.Runtime.InteropServices.Marshal.Copy(m.Data, bytes, 0, bytes.Length);
            var lum = new PlanarYUVLuminanceSource(bytes, m.Width, m.Height, 0, 0, m.Width, m.Height, false);
            var res = reader.Decode(lum);
            return res?.Text;
        }
        catch
        {
            return null;
        }
    }
}
