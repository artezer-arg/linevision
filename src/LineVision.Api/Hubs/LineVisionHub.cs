using LineVision.Core.Domain.Enums;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.AspNetCore.SignalR;

namespace LineVision.Api.Hubs;

public interface ILineVisionClient
{
    Task StateChanged(StationState state, string? description);
    Task OrderUpdated(ProductionOrder? order);
    Task CycleUpdated(ProductionCycle? cycle);
    Task CameraFrameReceived(string cameraId, string base64Jpeg, int width, int height);
    Task HealthStatusReceived(StationHealthStatus health);
    Task LogReceived(SystemLogEntry log);
}

public class LineVisionHub : Hub<ILineVisionClient>
{
    private readonly ILogger<LineVisionHub> _logger;

    public LineVisionHub(ILogger<LineVisionHub> logger)
    {
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation("HMI Client connected to LineVisionHub: {ConnectionId}", Context.ConnectionId);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogInformation("HMI Client disconnected: {ConnectionId}", Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }
}
