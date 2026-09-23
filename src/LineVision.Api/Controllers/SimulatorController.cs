using LineVision.Core.Domain.Enums;
using LineVision.Core.Domain.Interfaces;
using LineVision.Infrastructure.PLC;
using LineVision.Infrastructure.Simulators;
using Microsoft.AspNetCore.Mvc;

namespace LineVision.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SimulatorController : ControllerBase
{
    private readonly IPLCService _plc;
    private readonly ICameraManager _cameraManager;
    private readonly ProductionSimulator _productionSimulator;
    private readonly ILogger<SimulatorController> _logger;

    public SimulatorController(
        IPLCService plc,
        ICameraManager cameraManager,
        ProductionSimulator productionSimulator,
        ILogger<SimulatorController> logger)
    {
        _plc = plc;
        _cameraManager = cameraManager;
        _productionSimulator = productionSimulator;
        _logger = logger;
    }

    [HttpPost("plc/state")]
    public IActionResult SetPlcState([FromBody] SetPlcStateRequest req)
    {
        if (Enum.TryParse<PLCLogicalState>(req.State, true, out var state))
        {
            _plc.SetSimulationState(state, req.EchoA, req.EchoB);
            return Ok(new { Success = true, State = state.ToString() });
        }
        return BadRequest(new { Message = $"Invalid PLC state: {req.State}" });
    }

    [HttpPost("plc/fault")]
    public IActionResult InjectPlcFault([FromBody] InjectFaultRequest req)
    {
        _plc.InjectFault(req.FaultType);
        return Ok(new { InjectedFault = req.FaultType });
    }

    [HttpPost("camera/pattern")]
    public IActionResult SetCameraPattern([FromBody] SetCameraPatternRequest req)
    {
        var cam = _cameraManager.GetCamera(req.CameraId);
        if (cam == null) return NotFound(new { Message = $"Camera {req.CameraId} not found" });

        cam.SetSimulationPattern(req.Pattern);
        return Ok(new { CameraId = req.CameraId, Pattern = req.Pattern });
    }

    [HttpPost("production/enqueue")]
    public async Task<IActionResult> EnqueueOrder([FromQuery] string stationCode = "DL02")
    {
        var order = await _productionSimulator.EnqueueRandomOrderAsync(stationCode);
        return Ok(order);
    }

    [HttpPost("production/pointer")]
    public async Task<IActionResult> SetPointer([FromBody] SetPointerRequest req)
    {
        await _productionSimulator.SetStationPointerAsync(req.StationCode ?? "DL02", req.OrderId);
        return Ok(new { StationCode = req.StationCode ?? "DL02", OrderId = req.OrderId });
    }
}

public class SetPlcStateRequest
{
    public string State { get; set; } = "FREE";
    public int? EchoA { get; set; }
    public int? EchoB { get; set; }
}

public class InjectFaultRequest
{
    public string FaultType { get; set; } = "NONE"; // "TIMEOUT", "MISMATCH", "ERROR", "DISCONNECT", "NONE"
}

public class SetCameraPatternRequest
{
    public string CameraId { get; set; } = "CAM_PANEL_01";
    public string Pattern { get; set; } = "OK"; // "OK", "NOK_CLIP", "NOK_HAND", "QR_INVALID"
}

public class SetPointerRequest
{
    public string? StationCode { get; set; } = "DL02";
    public int OrderId { get; set; }
}
