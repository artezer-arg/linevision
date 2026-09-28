using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Logging;
using OpenCvSharp;

namespace LineVision.Infrastructure.Cameras;

public class OpenCvCameraProvider : ICameraProvider
{
    private class SharedDeviceEntry
    {
        public string Uri { get; set; } = string.Empty;
        public VideoCapture? Capture { get; set; }
        public readonly object Lock = new();
        public int RefCount { get; set; }
        public Mat? SharedMat { get; set; }
        public DateTime LastGrabTime { get; set; } = DateTime.MinValue;
        public bool IsConnected => Capture != null && !Capture.IsDisposed && Capture.IsOpened();
    }

    private static readonly object PoolLock = new();
    private static readonly Dictionary<string, SharedDeviceEntry> SharedPool = new(StringComparer.OrdinalIgnoreCase);

    private readonly CameraConfig _config;
    private readonly ILogger<OpenCvCameraProvider> _logger;
    private SharedDeviceEntry? _entry;
    private bool _isConnected;
    private volatile bool _disposed;
    private readonly object _lock = new();
    public static readonly object DirectShowLock = new();

    public string CameraId => _config.CameraId;
    public string Name => _config.Name;
    public bool IsConnected => _isConnected && !_disposed && (_entry?.IsConnected ?? false);

    public OpenCvCameraProvider(CameraConfig config, ILogger<OpenCvCameraProvider> logger)
    {
        _config = config;
        _logger = logger;
    }

    public Task<bool> ConnectAsync(CancellationToken ct = default)
    {
        if (_disposed) return Task.FromResult(false);
        lock (_lock)
        {
            return Task.FromResult(ConnectInternal());
        }
    }

    private bool ConnectInternal()
    {
        if (_disposed) return false;
        string uri = _config.ConnectionUri?.Trim() ?? "0";

        lock (PoolLock)
        {
            DisconnectInternal();
            if (_disposed) return false;

            if (!SharedPool.TryGetValue(uri, out var entry))
            {
                entry = new SharedDeviceEntry { Uri = uri };
                SharedPool[uri] = entry;
            }

            _entry = entry;

            lock (entry.Lock)
            {
                if (entry.Capture == null || entry.Capture.IsDisposed || !entry.Capture.IsOpened())
                {
                    try
                    {
                        if (int.TryParse(uri, out int deviceIndex))
                        {
                            entry.Capture = new VideoCapture(deviceIndex, VideoCaptureAPIs.DSHOW);
                        }
                        else if (uri.StartsWith("dshow://", StringComparison.OrdinalIgnoreCase) && 
                                 int.TryParse(uri.Substring(8), out int parsedIdx))
                        {
                            entry.Capture = new VideoCapture(parsedIdx, VideoCaptureAPIs.DSHOW);
                        }
                        else if (!string.IsNullOrWhiteSpace(uri))
                        {
                            entry.Capture = new VideoCapture(uri);
                        }
                        else
                        {
                            entry.Capture = new VideoCapture(0, VideoCaptureAPIs.DSHOW);
                        }

                        if (entry.Capture.IsOpened())
                        {
                            entry.Capture.Set(VideoCaptureProperties.FrameWidth, 640);
                            entry.Capture.Set(VideoCaptureProperties.FrameHeight, 480);
                            _logger.LogInformation("Opened physical VideoCapture for shared device {Uri}", uri);
                        }
                        else
                        {
                            _logger.LogWarning("VideoCapture could not open physical device {Uri}", uri);
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Exception opening shared physical camera {Uri} for {CameraId}", uri, CameraId);
                    }
                }

                if (entry.IsConnected)
                {
                    entry.RefCount++;
                    _isConnected = true;
                    _logger.LogInformation("OpenCvCameraProvider connected for {CameraId} on shared device {Uri} (RefCount={Count})",
                        CameraId, uri, entry.RefCount);
                    return true;
                }
                else
                {
                    _isConnected = false;
                    return false;
                }
            }
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
        lock (PoolLock)
        {
            if (_entry != null)
            {
                string uri = _entry.Uri;
                lock (_entry.Lock)
                {
                    _entry.RefCount--;
                    _logger.LogInformation("OpenCvCameraProvider disconnected for {CameraId} on shared device {Uri} (Remaining RefCount={Count})",
                        CameraId, uri, _entry.RefCount);

                    if (_entry.RefCount <= 0)
                    {
                        try
                        {
                            if (_entry.Capture != null)
                            {
                                if (!_entry.Capture.IsDisposed && _entry.Capture.IsOpened())
                                {
                                    _entry.Capture.Release();
                                }
                                _entry.Capture.Dispose();
                                _entry.Capture = null;
                            }
                            _entry.SharedMat?.Dispose();
                            _entry.SharedMat = null;
                        }
                        catch (Exception ex)
                        {
                            _logger.LogDebug(ex, "Error releasing shared VideoCapture for {Uri}", uri);
                        }

                        SharedPool.Remove(uri);
                    }
                }
                _entry = null;
            }
        }
    }

    private CameraFrame? _lastFrame;
    private DateTime _lastReconnectAttempt = DateTime.MinValue;

    public Task<CameraFrame> CaptureFrameAsync(CancellationToken ct = default)
    {
        if (_disposed)
        {
            return Task.FromResult(GetFallbackFrame());
        }

        var entry = _entry;
        if (!_isConnected || entry == null || !entry.IsConnected)
        {
            if ((DateTime.UtcNow - _lastReconnectAttempt).TotalSeconds >= 5)
            {
                _lastReconnectAttempt = DateTime.UtcNow;
                ConnectInternal();
                entry = _entry;
            }
        }

        if (entry == null || !entry.IsConnected)
        {
            if (_lastFrame != null) return Task.FromResult(_lastFrame);
            return Task.FromResult(GetFallbackFrame());
        }

        lock (entry.Lock)
        {
            if (!entry.IsConnected || entry.Capture == null)
            {
                if (_lastFrame != null) return Task.FromResult(_lastFrame);
                return Task.FromResult(GetFallbackFrame());
            }

            try
            {
                bool needGrab = entry.SharedMat == null || (DateTime.UtcNow - entry.LastGrabTime).TotalMilliseconds > 40;
                if (needGrab)
                {
                    entry.SharedMat ??= new Mat();
                    bool grabbed = entry.Capture.Read(entry.SharedMat);
                    if (grabbed && !entry.SharedMat.Empty())
                    {
                        entry.LastGrabTime = DateTime.UtcNow;
                    }
                    else
                    {
                        _logger.LogWarning("Camera frame read returned empty for shared device {Uri}", entry.Uri);
                    }
                }

                if (entry.SharedMat != null && !entry.SharedMat.Empty())
                {
                    using var cloneMat = entry.SharedMat.Clone();
                    Cv2.PutText(cloneMat, $"{CameraId} | LIVE USB | {DateTime.UtcNow:HH:mm:ss.fff}", new Point(15, 25),
                        HersheyFonts.HersheySimplex, 0.45, new Scalar(0, 255, 120), 1);

                    Cv2.ImEncode(".jpg", cloneMat, out byte[] jpgBytes, new ImageEncodingParam(ImwriteFlags.JpegQuality, 80));

                    _lastFrame = new CameraFrame
                    {
                        CameraId = CameraId,
                        Width = cloneMat.Width,
                        Height = cloneMat.Height,
                        Channels = cloneMat.Channels(),
                        Data = cloneMat.ToBytes(),
                        Base64Jpeg = Convert.ToBase64String(jpgBytes),
                        Timestamp = DateTime.UtcNow
                    };

                    return Task.FromResult(_lastFrame);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Exception capturing frame for {CameraId} from shared device {Uri}", CameraId, entry.Uri);
            }
        }

        if (_lastFrame != null)
        {
            return Task.FromResult(_lastFrame);
        }

        return Task.FromResult(GetFallbackFrame());
    }

    private CameraFrame GetFallbackFrame()
    {
        try
        {
            using var fallbackMat = new Mat(480, 640, MatType.CV_8UC3, new Scalar(25, 25, 30));
            Cv2.PutText(fallbackMat, $"{CameraId}: CONECTANDO A CAMARA USB...", new Point(80, 240),
                HersheyFonts.HersheySimplex, 0.6, new Scalar(0, 200, 255), 2);
            Cv2.ImEncode(".jpg", fallbackMat, out byte[] fallbackBytes, new ImageEncodingParam(ImwriteFlags.JpegQuality, 80));

            return new CameraFrame
            {
                CameraId = CameraId,
                Width = 640,
                Height = 480,
                Channels = 3,
                Data = fallbackMat.ToBytes(),
                Base64Jpeg = Convert.ToBase64String(fallbackBytes),
                Timestamp = DateTime.UtcNow
            };
        }
        catch
        {
            // Pure managed BMP fallback
            const int width = 640;
            const int height = 480;
            const int headerSize = 54;
            const int imageSize = width * height * 3;
            var fullBmp = new byte[headerSize + imageSize];
            fullBmp[0] = 0x42; fullBmp[1] = 0x4D;
            BitConverter.GetBytes(headerSize + imageSize).CopyTo(fullBmp, 2);
            fullBmp[10] = headerSize;
            fullBmp[14] = 40;
            BitConverter.GetBytes(width).CopyTo(fullBmp, 18);
            BitConverter.GetBytes(-height).CopyTo(fullBmp, 22);
            fullBmp[26] = 1; fullBmp[28] = 24;
            BitConverter.GetBytes(imageSize).CopyTo(fullBmp, 34);
            return new CameraFrame
            {
                CameraId = CameraId,
                Width = width,
                Height = height,
                Channels = 3,
                Data = fullBmp,
                Base64Jpeg = Convert.ToBase64String(fullBmp),
                Timestamp = DateTime.UtcNow
            };
        }
    }

    public void SetSimulationImage(byte[] imageBytes)
    {
    }

    public void SetSimulationPattern(string pattern)
    {
    }

    public async ValueTask DisposeAsync()
    {
        _disposed = true;
        await DisconnectAsync();
    }
}
