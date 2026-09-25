using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Logging;
using OpenCvSharp;

namespace LineVision.Infrastructure.Cameras;

public class OpenCvCameraProvider : ICameraProvider
{
    private readonly CameraConfig _config;
    private readonly ILogger<OpenCvCameraProvider> _logger;
    private VideoCapture? _capture;
    private bool _isConnected;
    private readonly object _lock = new();

    public string CameraId => _config.CameraId;
    public string Name => _config.Name;
    public bool IsConnected => _isConnected;

    public OpenCvCameraProvider(CameraConfig config, ILogger<OpenCvCameraProvider> logger)
    {
        _config = config;
        _logger = logger;
    }

    public Task<bool> ConnectAsync(CancellationToken ct = default)
    {
        lock (_lock)
        {
            return Task.FromResult(ConnectInternal());
        }
    }

    private bool ConnectInternal()
    {
        try
        {
            DisconnectInternal();

            string uri = _config.ConnectionUri?.Trim() ?? "0";

            if (int.TryParse(uri, out int deviceIndex))
            {
                _capture = new VideoCapture(deviceIndex, VideoCaptureAPIs.DSHOW);
            }
            else if (uri.StartsWith("dshow://", StringComparison.OrdinalIgnoreCase) && 
                     int.TryParse(uri.Substring(8), out int parsedIdx))
            {
                _capture = new VideoCapture(parsedIdx, VideoCaptureAPIs.DSHOW);
            }
            else if (!string.IsNullOrWhiteSpace(uri))
            {
                _capture = new VideoCapture(uri);
            }
            else
            {
                _capture = new VideoCapture(0, VideoCaptureAPIs.DSHOW);
            }

            if (_capture.IsOpened())
            {
                _capture.Set(VideoCaptureProperties.FrameWidth, 640);
                _capture.Set(VideoCaptureProperties.FrameHeight, 480);
                _isConnected = true;
                _logger.LogInformation("OpenCvCameraProvider connected for {CameraId} on {Uri}", CameraId, uri);
                return true;
            }
            else
            {
                _logger.LogWarning("OpenCvCameraProvider could not open device {Uri} for {CameraId}", uri, CameraId);
                _isConnected = false;
                return false;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception opening physical camera {CameraId}", CameraId);
            _isConnected = false;
            return false;
        }
    }

    public Task DisconnectAsync()
    {
        lock (_lock)
        {
            DisconnectInternal();
        }
        return Task.CompletedTask;
    }

    private void DisconnectInternal()
    {
        _isConnected = false;
        try
        {
            if (_capture != null)
            {
                if (_capture.IsOpened())
                {
                    _capture.Release();
                }
                _capture.Dispose();
                _capture = null;
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Error releasing VideoCapture for {CameraId}", CameraId);
        }
    }

    private CameraFrame? _lastFrame;

    private DateTime _lastReconnectAttempt = DateTime.MinValue;

    public Task<CameraFrame> CaptureFrameAsync(CancellationToken ct = default)
    {
        lock (_lock)
        {
            if (!_isConnected || _capture == null || !_capture.IsOpened())
            {
                if ((DateTime.UtcNow - _lastReconnectAttempt).TotalSeconds >= 5)
                {
                    _lastReconnectAttempt = DateTime.UtcNow;
                    ConnectInternal();
                }
            }

            using var mat = new Mat();
            bool grabbed = false;

            if (_isConnected && _capture != null && _capture.IsOpened())
            {
                try
                {
                    grabbed = _capture.Read(mat);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning("Exception reading from camera {CameraId}: {Err}", CameraId, ex.Message);
                    grabbed = false;
                }
            }

            if (!grabbed || mat.Empty())
            {
                if (_isConnected)
                {
                    _logger.LogWarning("Camera frame read failed for {CameraId}, marking disconnected", CameraId);
                    DisconnectInternal();
                }
            }

            if (grabbed && !mat.Empty())
            {
                // Draw industrial HUD timestamp on physical frame
                Cv2.PutText(mat, $"{CameraId} | LIVE USB | {DateTime.UtcNow:HH:mm:ss.fff}", new Point(15, 25),
                    HersheyFonts.HersheySimplex, 0.45, new Scalar(0, 255, 120), 1);

                Cv2.ImEncode(".jpg", mat, out byte[] jpgBytes, new ImageEncodingParam(ImwriteFlags.JpegQuality, 80));

                _lastFrame = new CameraFrame
                {
                    CameraId = CameraId,
                    Width = mat.Width,
                    Height = mat.Height,
                    Channels = mat.Channels(),
                    Data = mat.ToBytes(),
                    Base64Jpeg = Convert.ToBase64String(jpgBytes),
                    Timestamp = DateTime.UtcNow
                };

                return Task.FromResult(_lastFrame);
            }

            // If still empty but have previous frame, return last known good frame
            if (_lastFrame != null)
            {
                return Task.FromResult(_lastFrame);
            }

            // Emergency fallback frame so caller never crashes
            using var fallbackMat = new Mat(480, 640, MatType.CV_8UC3, new Scalar(25, 25, 30));
            Cv2.PutText(fallbackMat, $"{CameraId}: CONECTANDO A CAMARA USB...", new Point(80, 240),
                HersheyFonts.HersheySimplex, 0.6, new Scalar(0, 200, 255), 2);
            Cv2.ImEncode(".jpg", fallbackMat, out byte[] fallbackBytes, new ImageEncodingParam(ImwriteFlags.JpegQuality, 80));

            return Task.FromResult(new CameraFrame
            {
                CameraId = CameraId,
                Width = 640,
                Height = 480,
                Channels = 3,
                Data = fallbackMat.ToBytes(),
                Base64Jpeg = Convert.ToBase64String(fallbackBytes),
                Timestamp = DateTime.UtcNow
            });
        }
    }

    public void SetSimulationImage(byte[] imageBytes)
    {
        // Physical camera does not use synthetic simulation image
    }

    public void SetSimulationPattern(string pattern)
    {
        // Physical camera does not use synthetic simulation pattern
    }

    public async ValueTask DisposeAsync()
    {
        await DisconnectAsync();
    }
}
