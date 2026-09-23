using LineVision.Core.Domain.Enums;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using LineVision.Service.Coordination;
using Microsoft.AspNetCore.Mvc;

namespace LineVision.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class StationController : ControllerBase
{
    private readonly IStateMachineController _stateMachine;
    private readonly StationOrchestrator _orchestrator;
    private readonly IHealthMonitoringService _healthService;
    private readonly IProductionOrderService _orderService;
    private readonly ILogger<StationController> _logger;

    public StationController(
        IStateMachineController stateMachine,
        StationOrchestrator orchestrator,
        IHealthMonitoringService healthService,
        IProductionOrderService orderService,
        ILogger<StationController> logger)
    {
        _stateMachine = stateMachine;
        _orchestrator = orchestrator;
        _healthService = healthService;
        _orderService = orderService;
        _logger = logger;
    }

    [HttpGet("state")]
    public async Task<IActionResult> GetStationState()
    {
        var health = await _healthService.CheckHealthAsync();
        return Ok(new
        {
            Station = _orchestrator.StationCode,
            State = _stateMachine.CurrentState.ToString(),
            Order = _stateMachine.CurrentOrder,
            Cycle = _stateMachine.CurrentCycle,
            IsAutoRunEnabled = _orchestrator.IsAutoRunEnabled,
            Health = health
        });
    }

    [HttpPost("trigger-step")]
    public async Task<IActionResult> TriggerStep()
    {
        _logger.LogInformation("Operator manually triggered single cycle step");
        bool success = await _orchestrator.RunFullCycleStepAsync();
        return Ok(new { Success = success, State = _stateMachine.CurrentState.ToString() });
    }

    [HttpPost("autorun")]
    public IActionResult SetAutoRun([FromBody] AutoRunRequest request)
    {
        _orchestrator.SetAutoRun(request.Enabled);
        return Ok(new { IsAutoRunEnabled = _orchestrator.IsAutoRunEnabled });
    }

    [HttpPost("reset")]
    public async Task<IActionResult> ResetFault([FromBody] ResetRequest request)
    {
        await _stateMachine.ResetFaultAsync(request.User ?? "OPERATOR");
        return Ok(new { State = _stateMachine.CurrentState.ToString() });
    }

    [HttpPost("bypass")]
    public async Task<IActionResult> Bypass([FromBody] BypassRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            return BadRequest(new { Message = "Reason is mandatory for industrial state bypass" });
        }

        if (!Enum.TryParse<StationState>(request.TargetState, true, out var target))
        {
            return BadRequest(new { Message = $"Invalid target state: {request.TargetState}" });
        }

        bool success = await _stateMachine.ForceStateAsync(target, request.Reason, request.User ?? "MAINTENANCE");
        return Ok(new { Success = success, State = _stateMachine.CurrentState.ToString() });
    }

    [HttpPost("emergency-stop")]
    public async Task<IActionResult> EmergencyStop([FromBody] EStopRequest request)
    {
        await _stateMachine.RequestEmergencyStopAsync(request.Reason ?? "Operator Emergency Stop button pressed");
        return Ok(new { State = _stateMachine.CurrentState.ToString() });
    }
}

public class AutoRunRequest { public bool Enabled { get; set; } }
public class ResetRequest { public string? User { get; set; } }
public class BypassRequest
{
    public string TargetState { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public string? User { get; set; }
}
public class EStopRequest { public string? Reason { get; set; } }
