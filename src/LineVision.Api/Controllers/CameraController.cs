using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.AspNetCore.Mvc;

namespace LineVision.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CameraController : ControllerBase
{
    private readonly ICameraManager _cameraManager;
    private readonly ILogger<CameraController> _logger;

    public CameraController(ICameraManager cameraManager, ILogger<CameraController> logger)
    {
        _cameraManager = cameraManager;
        _logger = logger;
    }

    [HttpGet("devices")]
    public async Task<IActionResult> GetAvailableDevices()
    {
        var devices = await _cameraManager.DiscoverAvailableDevicesAsync();
        return Ok(devices);
    }

    [HttpGet("configs")]
    public async Task<IActionResult> GetConfigurations()
    {
        var configs = await _cameraManager.GetCameraConfigurationsAsync();
        return Ok(configs);
    }

    [HttpPost("configure")]
    public async Task<IActionResult> ConfigureCamera([FromBody] CameraConfigureRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.CameraId))
        {
            return BadRequest(new { Message = "CameraId is required" });
        }

        string provider = string.IsNullOrWhiteSpace(request.ProviderType) ? "SIMULATOR" : request.ProviderType.ToUpperInvariant();
        string uri = request.ConnectionUri ?? "0";

        bool success = await _cameraManager.ConfigureCameraProviderAsync(request.CameraId, provider, uri);

        if (!success)
        {
            return StatusCode(500, new { Message = $"Failed to configure camera {request.CameraId}" });
        }

        return Ok(new
        {
            Message = $"Camera {request.CameraId} configured successfully to {provider} ({uri})",
            CameraId = request.CameraId,
            ProviderType = provider,
            ConnectionUri = uri
        });
    }

    [HttpPost("configure-all")]
    public async Task<IActionResult> ConfigureAllCameras([FromBody] CameraConfigureAllRequest request)
    {
        string provider = string.IsNullOrWhiteSpace(request.ProviderType) ? "OPENCV_USB" : request.ProviderType.ToUpperInvariant();
        string uri = request.ConnectionUri ?? "0";

        var configs = await _cameraManager.GetCameraConfigurationsAsync();
        foreach (var c in configs)
        {
            await _cameraManager.ConfigureCameraProviderAsync(c.CameraId, provider, uri);
        }

        return Ok(new
        {
            Message = $"Todas las {configs.Count} cámaras fueron configuradas con éxito a {provider} ({uri})",
            ProviderType = provider,
            ConnectionUri = uri,
            ConfiguredCameras = configs.Select(c => c.CameraId).ToList()
        });
    }

    [HttpGet("{id}/snapshot")]
    public async Task<IActionResult> GetSnapshot(string id)
    {
        var camera = _cameraManager.GetCamera(id);
        if (camera == null)
        {
            return NotFound(new { Message = $"Camera {id} not found" });
        }

        try
        {
            var frame = await camera.CaptureFrameAsync();
            return Ok(frame);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to capture snapshot from camera {CameraId}", id);
            return StatusCode(500, new { Message = ex.Message });
        }
    }
}

public class CameraConfigureRequest
{
    public string CameraId { get; set; } = string.Empty;
    public string ProviderType { get; set; } = "SIMULATOR"; // "SIMULATOR", "OPENCV_USB", "PHYSICAL", "RTSP"
    public string ConnectionUri { get; set; } = "0"; // Device Index e.g. "0", "1" or RTSP URL
}

public class CameraConfigureAllRequest
{
    public string ProviderType { get; set; } = "OPENCV_USB"; // "SIMULATOR", "OPENCV_USB", "PHYSICAL", "RTSP"
    public string ConnectionUri { get; set; } = "0"; // Device Index e.g. "0", "1" or RTSP URL
}
