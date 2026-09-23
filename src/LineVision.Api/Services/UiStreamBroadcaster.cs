using LineVision.Api.Hubs;
using LineVision.Core.Domain.Interfaces;
using Microsoft.AspNetCore.SignalR;

namespace LineVision.Api.Services;

public class UiStreamBroadcaster : BackgroundService
{
    private readonly IHubContext<LineVisionHub, ILineVisionClient> _hub;
    private readonly IStateMachineController _stateMachine;
    private readonly ICameraManager _cameraManager;
    private readonly IHealthMonitoringService _healthService;
    private readonly ILogger<UiStreamBroadcaster> _logger;

    public UiStreamBroadcaster(
        IHubContext<LineVisionHub, ILineVisionClient> hub,
        IStateMachineController stateMachine,
        ICameraManager cameraManager,
        IHealthMonitoringService healthService,
        ILogger<UiStreamBroadcaster> logger)
    {
        _hub = hub;
        _stateMachine = stateMachine;
        _cameraManager = cameraManager;
        _healthService = healthService;
        _logger = logger;

        // Suscribirse a cambios de estado inmediatos
        _stateMachine.StateChanged += async (_, e) =>
        {
            try
            {
                await _hub.Clients.All.StateChanged(e.NewState, e.Reason);
                await _hub.Clients.All.OrderUpdated(_stateMachine.CurrentOrder);
                await _hub.Clients.All.CycleUpdated(_stateMachine.CurrentCycle);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to broadcast state change to SignalR clients");
            }
        };
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        int tick = 0;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                tick++;

                // Broadcast camera frames every 200ms (~5 fps streaming to keep industrial PC lightweight)
                var cameras = _cameraManager.GetAllCameras();
                foreach (var cam in cameras)
                {
                    if (cam.IsConnected)
                    {
                        var frame = await cam.CaptureFrameAsync(stoppingToken);
                        if (!string.IsNullOrEmpty(frame.Base64Jpeg))
                        {
                            await _hub.Clients.All.CameraFrameReceived(cam.CameraId, frame.Base64Jpeg, frame.Width, frame.Height);
                        }
                    }
                }

                // Broadcast health and current order every 1000ms
                if (tick % 5 == 0)
                {
                    var health = await _healthService.CheckHealthAsync(stoppingToken);
                    await _hub.Clients.All.HealthStatusReceived(health);
                    await _hub.Clients.All.OrderUpdated(_stateMachine.CurrentOrder);
                    await _hub.Clients.All.CycleUpdated(_stateMachine.CurrentCycle);
                    await _hub.Clients.All.StateChanged(_stateMachine.CurrentState, null);
                }

                await Task.Delay(200, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Broadcaster stream tick error");
                await Task.Delay(500, stoppingToken);
            }
        }
    }
}
