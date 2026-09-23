using System.Diagnostics;
using LineVision.Core.Domain.Enums;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Logging;

namespace LineVision.Service.Monitoring;

public class HealthMonitoringService : IHealthMonitoringService
{
    private readonly IDatabaseService _db;
    private readonly IPLCService _plc;
    private readonly ICameraManager _cameraManager;
    private readonly ILogger<HealthMonitoringService> _logger;
    private readonly Dictionary<string, DateTime> _heartbeats = new();

    public HealthMonitoringService(
        IDatabaseService db,
        IPLCService plc,
        ICameraManager cameraManager,
        ILogger<HealthMonitoringService> logger)
    {
        _db = db;
        _plc = plc;
        _cameraManager = cameraManager;
        _logger = logger;
    }

    public async Task<StationHealthStatus> CheckHealthAsync(CancellationToken ct = default)
    {
        var status = new StationHealthStatus
        {
            Timestamp = DateTime.UtcNow
        };

        // 1. DB Check
        status.DatabaseConnected = await _db.TestConnectionAsync(ct);

        // 2. PLC Check
        status.PLCConnected = _plc.IsConnected;

        // 3. Camera Check
        var cameras = _cameraManager.GetAllCameras();
        status.CamerasConnected = cameras.Count > 0 && cameras.All(c => c.IsConnected);

        // 4. Memory Usage (Current Process)
        using var process = Process.GetCurrentProcess();
        status.MemoryUsageMb = Math.Round(process.WorkingSet64 / (1024.0 * 1024.0), 2);

        // 5. Disk Free Space
        try
        {
            var drive = new DriveInfo(Path.GetPathRoot(AppDomain.CurrentDomain.BaseDirectory) ?? "C:\\");
            status.DiskFreeSpaceGb = Math.Round(drive.AvailableFreeSpace / (1024.0 * 1024.0 * 1024.0), 2);
        }
        catch
        {
            status.DiskFreeSpaceGb = 50.0;
        }

        // 6. Alarms assessment
        if (!status.DatabaseConnected)
        {
            status.ActiveAlarms.Add(new IndustrialAlarm
            {
                Code = "ALM_DB_DISCONNECTED",
                Description = "Database connection lost or unreachable",
                Severity = AlarmSeverity.CRITICAL
            });
        }

        if (!status.PLCConnected)
        {
            status.ActiveAlarms.Add(new IndustrialAlarm
            {
                Code = "ALM_PLC_OFFLINE",
                Description = "PLC communication offline",
                Severity = AlarmSeverity.CRITICAL
            });
        }

        if (!status.CamerasConnected)
        {
            status.ActiveAlarms.Add(new IndustrialAlarm
            {
                Code = "ALM_CAM_OFFLINE",
                Description = "One or more industrial cameras are offline",
                Severity = AlarmSeverity.WARNING
            });
        }

        if (status.DiskFreeSpaceGb < 5.0)
        {
            status.ActiveAlarms.Add(new IndustrialAlarm
            {
                Code = "ALM_DISK_LOW",
                Description = $"Low disk space for image evidence retention: {status.DiskFreeSpaceGb} GB remaining",
                Severity = AlarmSeverity.WARNING
            });
        }

        status.IsHealthy = status.DatabaseConnected && status.PLCConnected && status.CamerasConnected;
        return status;
    }

    public Task RegisterHeartbeatAsync(string componentName)
    {
        lock (_heartbeats)
        {
            _heartbeats[componentName] = DateTime.UtcNow;
        }
        return Task.CompletedTask;
    }

    public bool IsComponentAlive(string componentName, TimeSpan maxAge)
    {
        lock (_heartbeats)
        {
            if (_heartbeats.TryGetValue(componentName, out var last))
            {
                return (DateTime.UtcNow - last) <= maxAge;
            }
            return false;
        }
    }
}
