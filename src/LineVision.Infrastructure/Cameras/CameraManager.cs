using System.Diagnostics;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Logging;
using OpenCvSharp;

namespace LineVision.Infrastructure.Cameras;

public class CameraManager : ICameraManager
{
    private readonly IDatabaseService _db;
    private readonly ILoggerFactory _loggerFactory;
    private readonly ILogger<CameraManager> _logger;
    private readonly Dictionary<string, ICameraProvider> _cameras = new();
    private readonly SemaphoreSlim _lock = new(1, 1);

    public CameraManager(IDatabaseService db, ILoggerFactory loggerFactory, ILogger<CameraManager> logger)
    {
        _db = db;
        _loggerFactory = loggerFactory;
        _logger = logger;
    }

    public async Task InitializeCamerasAsync(CancellationToken ct = default)
    {
        await _lock.WaitAsync(ct);
        try
        {
            const string sql = "SELECT * FROM Camera WHERE Active = 1";
            var cameraConfigs = (await _db.QueryAsync<CameraConfig>(sql, null, ct)).ToList();

            // If table has no cameras, seed default configurations
            if (!cameraConfigs.Any())
            {
                cameraConfigs = new List<CameraConfig>
                {
                    new() { CameraId = "CAM_CRADLE", Name = "Cámara Cuna e Insertos", StationCode = "DL02", ProviderType = "SIMULATOR", ConnectionUri = "sim://cradle" },
                    new() { CameraId = "CAM_PANEL_01", Name = "Cámara Panel Superior", StationCode = "DL02", ProviderType = "SIMULATOR", ConnectionUri = "sim://panel_top" },
                    new() { CameraId = "CAM_PANEL_02", Name = "Cámara Panel Inferior", StationCode = "DL02", ProviderType = "SIMULATOR", ConnectionUri = "sim://panel_bottom" }
                };

                foreach (var cfg in cameraConfigs)
                {
                    await _db.ExecuteAsync(@"
                        INSERT OR REPLACE INTO Camera (CameraId, Name, StationCode, ProviderType, ConnectionUri, Exposure, Gain, Fps, IsColor, Active)
                        VALUES (@CameraId, @Name, @StationCode, @ProviderType, @ConnectionUri, @Exposure, @Gain, @Fps, @IsColor, @Active)", cfg, ct);
                }
            }

            foreach (var cfg in cameraConfigs)
            {
                await CreateAndRegisterProviderAsync(cfg, ct);
            }

            _logger.LogInformation("CameraManager initialized with {Count} camera providers", _cameras.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize cameras in CameraManager");
        }
        finally
        {
            _lock.Release();
        }
    }

    private async Task CreateAndRegisterProviderAsync(CameraConfig cfg, CancellationToken ct)
    {
        if (_cameras.TryGetValue(cfg.CameraId, out var oldProvider))
        {
            try
            {
                await oldProvider.DisposeAsync();
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Error disposing previous camera provider for {CameraId}", cfg.CameraId);
            }
            _cameras.Remove(cfg.CameraId);
        }

        ICameraProvider provider;
        if (string.Equals(cfg.ProviderType, "OPENCV_USB", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(cfg.ProviderType, "PHYSICAL", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(cfg.ProviderType, "RTSP", StringComparison.OrdinalIgnoreCase))
        {
            var openCvLogger = _loggerFactory.CreateLogger<OpenCvCameraProvider>();
            var openCvProvider = new OpenCvCameraProvider(cfg, openCvLogger);
            bool connected = await openCvProvider.ConnectAsync(ct);

            if (connected)
            {
                provider = openCvProvider;
                _logger.LogInformation("Registered PHYSICAL/OPENCV camera provider for {CameraId} (URI: {Uri})", cfg.CameraId, cfg.ConnectionUri);
            }
            else
            {
                _logger.LogWarning("Physical camera failed to connect for {CameraId}. Falling back to Simulator to maintain line safety.", cfg.CameraId);
                var simLogger = _loggerFactory.CreateLogger<CameraSimulator>();
                var simulator = new CameraSimulator(cfg, simLogger);
                await simulator.ConnectAsync(ct);
                provider = simulator;
            }
        }
        else
        {
            var simLogger = _loggerFactory.CreateLogger<CameraSimulator>();
            var simulator = new CameraSimulator(cfg, simLogger);
            await simulator.ConnectAsync(ct);
            provider = simulator;
            _logger.LogInformation("Registered SIMULATOR camera provider for {CameraId}", cfg.CameraId);
        }

        _cameras[cfg.CameraId] = provider;
    }

    public ICameraProvider? GetCamera(string cameraId)
    {
        _cameras.TryGetValue(cameraId, out var provider);
        return provider;
    }

    public IReadOnlyCollection<ICameraProvider> GetAllCameras()
    {
        return _cameras.Values;
    }

    public async Task<Dictionary<string, CameraFrame>> CaptureAllFramesAsync(CancellationToken ct = default)
    {
        var result = new Dictionary<string, CameraFrame>();
        var tasks = _cameras.Select(async kvp =>
        {
            try
            {
                var frame = await kvp.Value.CaptureFrameAsync(ct);
                return (Key: kvp.Key, Frame: frame, Success: true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to capture frame from camera {CameraId}", kvp.Key);
                return (Key: kvp.Key, Frame: new CameraFrame { CameraId = kvp.Key }, Success: false);
            }
        });

        var frames = await Task.WhenAll(tasks);
        foreach (var f in frames)
        {
            if (f.Success)
            {
                result[f.Key] = f.Frame;
            }
        }

        return result;
    }

    public async Task<IReadOnlyList<CameraConfig>> GetCameraConfigurationsAsync(CancellationToken ct = default)
    {
        const string sql = "SELECT * FROM Camera WHERE Active = 1";
        var list = await _db.QueryAsync<CameraConfig>(sql, null, ct);
        return list.ToList();
    }

    public async Task<bool> ConfigureCameraProviderAsync(string cameraId, string providerType, string connectionUri, CancellationToken ct = default)
    {
        await _lock.WaitAsync(ct);
        try
        {
            _logger.LogInformation("Reconfiguring camera {CameraId}: ProviderType={Provider}, Uri={Uri}",
                cameraId, providerType, connectionUri);

            const string updateSql = @"
                UPDATE Camera 
                SET ProviderType = @providerType, ConnectionUri = @connectionUri 
                WHERE CameraId = @cameraId";

            await _db.ExecuteAsync(updateSql, new { cameraId, providerType, connectionUri }, ct);

            var cfg = new CameraConfig
            {
                CameraId = cameraId,
                Name = cameraId switch
                {
                    "CAM_CRADLE" => "Cámara Cuna e Insertos",
                    "CAM_PANEL_01" => "Cámara Panel Superior",
                    "CAM_PANEL_02" => "Cámara Panel Inferior",
                    _ => cameraId
                },
                StationCode = "DL02",
                ProviderType = providerType,
                ConnectionUri = connectionUri,
                Active = true
            };

            await CreateAndRegisterProviderAsync(cfg, ct);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to configure camera {CameraId}", cameraId);
            return false;
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<IReadOnlyList<DiscoveredCameraDevice>> DiscoverAvailableDevicesAsync(CancellationToken ct = default)
    {
        var list = new List<DiscoveredCameraDevice>();

        // 1. Scan physical webcam devices via OpenCv DirectShow
        var activeConfigs = await GetCameraConfigurationsAsync(ct);
        var activePhysicalIndices = activeConfigs
            .Where(c => (c.ProviderType == "OPENCV_USB" || c.ProviderType == "PHYSICAL") && int.TryParse(c.ConnectionUri, out _))
            .Select(c => int.Parse(c.ConnectionUri))
            .ToHashSet();

        for (int i = 0; i < 4; i++)
        {
            bool isAvailable = false;
            bool hasLiveLight = false;

            if (activePhysicalIndices.Contains(i))
            {
                // Device is already actively capturing in our pipeline
                isAvailable = true;
                hasLiveLight = true;
            }
            else
            {
                try
                {
                    using var cap = new VideoCapture(i, VideoCaptureAPIs.DSHOW);
                    if (cap.IsOpened())
                    {
                        isAvailable = true;
                        using var testMat = new Mat();
                        for (int f = 0; f < 3; f++) cap.Read(testMat);
                        if (!testMat.Empty())
                        {
                            var mean = Cv2.Mean(testMat);
                            hasLiveLight = (mean.Val0 + mean.Val1 + mean.Val2) > 20.0;
                        }
                        cap.Release();
                    }
                }
                catch
                {
                    isAvailable = false;
                }
            }

            if (isAvailable)
            {
                string tag = hasLiveLight ? "🟢 IMAGEN EN VIVO DETECTADA" : "⚪ Sensor Oscuro / Virtual";
                string friendlyName = i == 0
                    ? $"📹 Webcam Física Principal (Índice DirectShow 0) [{tag}]"
                    : (i == 2 
                        ? $"📹 OBS Virtual Camera (Índice DirectShow 2) [{tag}]" 
                        : $"📹 Dispositivo USB / Webcam {i} (Índice DirectShow {i}) [{tag}]");

                list.Add(new DiscoveredCameraDevice
                {
                    DeviceIndex = i,
                    Name = friendlyName,
                    DeviceId = i.ToString(),
                    IsAvailable = isAvailable,
                    Type = "PHYSICAL"
                });
            }
        }

        // 2. Add industrial synthetic simulators
        list.Add(new DiscoveredCameraDevice
        {
            DeviceIndex = -1,
            Name = "Simulador Industrial Cuna Poka-Yoke & QR (CAM_CRADLE)",
            DeviceId = "sim://cradle",
            IsAvailable = true,
            Type = "SIMULATOR"
        });

        list.Add(new DiscoveredCameraDevice
        {
            DeviceIndex = -2,
            Name = "Simulador Industrial Panel Superior - Clips & Brackets (CAM_PANEL_01)",
            DeviceId = "sim://panel_top",
            IsAvailable = true,
            Type = "SIMULATOR"
        });

        list.Add(new DiscoveredCameraDevice
        {
            DeviceIndex = -3,
            Name = "Simulador Industrial Panel Inferior - Clips & Sellador (CAM_PANEL_02)",
            DeviceId = "sim://panel_bottom",
            IsAvailable = true,
            Type = "SIMULATOR"
        });

        list.Add(new DiscoveredCameraDevice
        {
            DeviceIndex = -4,
            Name = "Cámara de Red RTSP / IP (URI configurable)",
            DeviceId = "rtsp://",
            IsAvailable = true,
            Type = "RTSP"
        });

        return await Task.FromResult(list);
    }

    private static List<string> GetWindowsPnpCameraNames()
    {
        var names = new List<string>();
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "powershell",
                Arguments = "-NoProfile -Command \"Get-CimInstance Win32_PnPEntity | Where-Object { ($_.PNPClass -eq 'Camera' -or $_.PNPClass -eq 'Image') -and $_.Status -eq 'OK' } | Select-Object -ExpandProperty Name\"",
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var proc = Process.Start(psi);
            if (proc != null)
            {
                string output = proc.StandardOutput.ReadToEnd();
                proc.WaitForExit(3000);

                var lines = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (var l in lines)
                {
                    var clean = l.Trim();
                    if (!string.IsNullOrWhiteSpace(clean) && !names.Contains(clean))
                    {
                        names.Add(clean);
                    }
                }
            }
        }
        catch
        {
            // Fallback default list
            names.Add("Integrated Camera");
            names.Add("HD USB Camera");
        }

        return names;
    }
}
