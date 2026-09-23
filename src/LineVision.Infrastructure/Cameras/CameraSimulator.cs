using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Logging;
using OpenCvSharp;

namespace LineVision.Infrastructure.Cameras;

public class CameraSimulator : ICameraProvider
{
    private readonly CameraConfig _config;
    private readonly ILogger<CameraSimulator> _logger;
    private bool _isConnected;
    private string _activePattern = "OK";
    private byte[]? _customImageBytes;

    public string CameraId => _config.CameraId;
    public string Name => _config.Name;
    public bool IsConnected => _isConnected;

    public CameraSimulator(CameraConfig config, ILogger<CameraSimulator> logger)
    {
        _config = config;
        _logger = logger;
    }

    public Task<bool> ConnectAsync(CancellationToken ct = default)
    {
        _isConnected = true;
        _logger.LogInformation("Camera simulator {CameraId} connected successfully", CameraId);
        return Task.FromResult(true);
    }

    public Task DisconnectAsync()
    {
        _isConnected = false;
        _logger.LogInformation("Camera simulator {CameraId} disconnected", CameraId);
        return Task.CompletedTask;
    }

    public Task<CameraFrame> CaptureFrameAsync(CancellationToken ct = default)
    {
        if (!_isConnected)
        {
            throw new InvalidOperationException($"Camera {CameraId} is not connected");
        }

        // If a custom image was injected, return it
        if (_customImageBytes != null && _customImageBytes.Length > 0)
        {
            using var mat = Cv2.ImDecode(_customImageBytes, ImreadModes.Color);
            return Task.FromResult(CreateFrameFromMat(mat));
        }

        // Generate synthetic industrial camera frame
        using var frameMat = GenerateSyntheticFrame();
        return Task.FromResult(CreateFrameFromMat(frameMat));
    }

    private Mat GenerateSyntheticFrame()
    {
        // 640x480 3-channel BGR industrial image
        var mat = new Mat(480, 640, MatType.CV_8UC3, new Scalar(35, 35, 38));

        // Draw camera HUD overlay
        Cv2.PutText(mat, $"SIM_CAM: {CameraId} | {DateTime.UtcNow:HH:mm:ss.fff}", new Point(15, 25), 
            HersheyFonts.HersheySimplex, 0.5, new Scalar(0, 255, 120), 1);
        Cv2.PutText(mat, $"PATTERN: {_activePattern}", new Point(15, 45), 
            HersheyFonts.HersheySimplex, 0.5, new Scalar(200, 200, 200), 1);

        if (CameraId == "CAM_CRADLE")
        {
            DrawCradleScene(mat);
        }
        else if (CameraId == "CAM_PANEL_01")
        {
            DrawPanelTopScene(mat);
        }
        else if (CameraId == "CAM_PANEL_02")
        {
            DrawPanelBottomScene(mat);
        }
        else
        {
            // Generic workpiece
            Cv2.Rectangle(mat, new Rect(100, 100, 440, 280), new Scalar(70, 70, 75), -1);
            Cv2.Rectangle(mat, new Rect(100, 100, 440, 280), new Scalar(180, 180, 180), 2);
        }

        return mat;
    }

    private void DrawCradleScene(Mat mat)
    {
        // Cradle physical contour
        Cv2.Rectangle(mat, new Rect(40, 40, 560, 400), new Scalar(50, 50, 55), -1);
        Cv2.Rectangle(mat, new Rect(40, 40, 560, 400), new Scalar(100, 100, 110), 3);

        // Inserto Mano (ROI_Mano at 50, 50, 120, 100)
        bool handOk = !_activePattern.Contains("NOK_HAND");
        Cv2.Rectangle(mat, new Rect(60, 60, 100, 80), handOk ? new Scalar(0, 160, 0) : new Scalar(0, 0, 160), -1);
        Cv2.PutText(mat, handOk ? "HAND: RH" : "HAND: LH", new Point(65, 105), HersheyFonts.HersheySimplex, 0.45, new Scalar(255, 255, 255), 1);

        // Posición (ROI_Pos at 200, 50, 120, 100)
        bool posOk = !_activePattern.Contains("NOK_POS");
        Cv2.Rectangle(mat, new Rect(210, 60, 100, 80), posOk ? new Scalar(140, 120, 0) : new Scalar(0, 0, 140), -1);
        Cv2.PutText(mat, posOk ? "POS: FRONT" : "POS: REAR", new Point(215, 105), HersheyFonts.HersheySimplex, 0.45, new Scalar(255, 255, 255), 1);

        // Inserto A (ROI_InsA at 350, 80, 140, 120)
        bool insertAOk = !_activePattern.Contains("NOK_INSERT_A");
        if (insertAOk)
        {
            Cv2.Circle(mat, new Point(420, 140), 35, new Scalar(200, 200, 220), -1);
            Cv2.Circle(mat, new Point(420, 140), 20, new Scalar(80, 80, 90), -1);
            Cv2.PutText(mat, "PIN A", new Point(405, 145), HersheyFonts.HersheySimplex, 0.4, new Scalar(0, 0, 0), 1);
        }

        // Inserto B (ROI_InsB at 500, 80, 140, 120)
        bool insertBOk = !_activePattern.Contains("NOK_INSERT_B");
        if (insertBOk)
        {
            Cv2.Circle(mat, new Point(570, 140), 35, new Scalar(200, 200, 220), -1);
            Cv2.Circle(mat, new Point(570, 140), 20, new Scalar(80, 80, 90), -1);
            Cv2.PutText(mat, "PIN B", new Point(555, 145), HersheyFonts.HersheySimplex, 0.4, new Scalar(0, 0, 0), 1);
        }

        // Synthetic QR Code Zone
        string qrText = "CUNA-01";
        if (_activePattern.Contains("QR_INVALID")) 
            qrText = "CUNA-INCOMPATIBLE-99";
        else if (_activePattern.Contains("CUNA-02")) 
            qrText = "CUNA-02";
        else if (_activePattern.Contains("CUNA-01")) 
            qrText = "CUNA-01";
        else if (_activePattern.StartsWith("CUNA-", StringComparison.OrdinalIgnoreCase)) 
            qrText = _activePattern;
        
        Cv2.Rectangle(mat, new Rect(220, 260, 200, 120), new Scalar(255, 255, 255), -1);
        Cv2.Rectangle(mat, new Rect(225, 265, 40, 40), new Scalar(0, 0, 0), -1);
        Cv2.Rectangle(mat, new Rect(375, 265, 40, 40), new Scalar(0, 0, 0), -1);
        Cv2.Rectangle(mat, new Rect(225, 335, 40, 40), new Scalar(0, 0, 0), -1);
        Cv2.PutText(mat, "QR SIMULATOR", new Point(275, 290), HersheyFonts.HersheySimplex, 0.35, new Scalar(0, 0, 0), 1);
        Cv2.PutText(mat, qrText, new Point(230, 370), HersheyFonts.HersheySimplex, 0.35, new Scalar(0, 0, 180), 1);
    }

    private void DrawPanelTopScene(Mat mat)
    {
        // Door panel top section contour
        Cv2.Rectangle(mat, new Rect(50, 40, 540, 400), new Scalar(60, 60, 65), -1);
        Cv2.Rectangle(mat, new Rect(50, 40, 540, 400), new Scalar(120, 120, 130), 2);

        // IP_PANEL_01: Upper Left Clip (ROI at 80, 70, 160, 140)
        bool clip1Ok = !_activePattern.Contains("NOK_PANEL_01") && !_activePattern.Contains("NOK_CLIP");
        if (clip1Ok)
        {
            // Clip present (white/metallic fastener)
            Cv2.Rectangle(mat, new Rect(110, 100, 100, 80), new Scalar(180, 190, 200), -1);
            Cv2.Circle(mat, new Point(160, 140), 15, new Scalar(40, 40, 45), -1);
            Cv2.PutText(mat, "CLIP TOP-L", new Point(115, 120), HersheyFonts.HersheySimplex, 0.35, new Scalar(10, 10, 10), 1);
        }
        else
        {
            // Clip missing / empty dark slot
            Cv2.Rectangle(mat, new Rect(110, 100, 100, 80), new Scalar(30, 30, 35), -1);
            Cv2.PutText(mat, "SLOT EMPTY", new Point(115, 145), HersheyFonts.HersheySimplex, 0.35, new Scalar(0, 0, 200), 1);
        }

        // IP_PANEL_02: Upper Right Insert (ROI at 420, 70, 160, 140)
        bool clip2Ok = !_activePattern.Contains("NOK_PANEL_02");
        if (clip2Ok)
        {
            Cv2.Rectangle(mat, new Rect(450, 100, 100, 80), new Scalar(210, 180, 140), -1);
            Cv2.Circle(mat, new Point(500, 140), 20, new Scalar(50, 50, 55), -1);
            Cv2.PutText(mat, "INSERT R", new Point(460, 120), HersheyFonts.HersheySimplex, 0.35, new Scalar(10, 10, 10), 1);
        }
        else
        {
            // Degraded / wrong insert
            Cv2.Rectangle(mat, new Rect(450, 100, 100, 80), new Scalar(90, 90, 90), -1);
        }
    }

    private void DrawPanelBottomScene(Mat mat)
    {
        // Door panel lower section contour
        Cv2.Rectangle(mat, new Rect(50, 40, 540, 400), new Scalar(55, 55, 60), -1);

        // IP_PANEL_03: Bottom Center Clip (ROI at 250, 320, 180, 150)
        bool clip3Ok = !_activePattern.Contains("NOK_PANEL_03");
        if (clip3Ok)
        {
            Cv2.Rectangle(mat, new Rect(280, 340, 120, 100), new Scalar(190, 190, 210), -1);
            Cv2.Circle(mat, new Point(340, 390), 22, new Scalar(30, 30, 35), -1);
            Cv2.PutText(mat, "CLIP BOT", new Point(310, 370), HersheyFonts.HersheySimplex, 0.4, new Scalar(0, 0, 0), 1);
        }
        else
        {
            Cv2.Rectangle(mat, new Rect(280, 340, 120, 100), new Scalar(25, 25, 30), -1);
        }
    }

    private CameraFrame CreateFrameFromMat(Mat mat)
    {
        // Encode to JPEG for base64 streaming
        Cv2.ImEncode(".jpg", mat, out byte[] jpgBytes, new ImageEncodingParam(ImwriteFlags.JpegQuality, 80));

        return new CameraFrame
        {
            CameraId = CameraId,
            Width = mat.Width,
            Height = mat.Height,
            Channels = mat.Channels(),
            Data = mat.ToBytes(),
            Base64Jpeg = Convert.ToBase64String(jpgBytes),
            Timestamp = DateTime.UtcNow
        };
    }

    public void SetSimulationImage(byte[] imageBytes)
    {
        _customImageBytes = imageBytes;
    }

    public void SetSimulationPattern(string pattern)
    {
        _activePattern = pattern;
        _logger.LogInformation("Camera {CameraId} simulation pattern set to: {Pattern}", CameraId, pattern);
    }

    public ValueTask DisposeAsync()
    {
        _isConnected = false;
        return ValueTask.CompletedTask;
    }
}
