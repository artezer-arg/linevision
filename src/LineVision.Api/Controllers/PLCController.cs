using LineVision.Core.Domain.Enums;
using LineVision.Core.Domain.Models;
using LineVision.Infrastructure.PLC;
using Microsoft.AspNetCore.Mvc;

namespace LineVision.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PLCController : ControllerBase
{
    private readonly PLCManager _plcManager;
    private readonly ILogger<PLCController> _logger;

    public PLCController(PLCManager plcManager, ILogger<PLCController> logger)
    {
        _plcManager = plcManager;
        _logger = logger;
    }

    [HttpGet("config")]
    public async Task<IActionResult> GetConfiguration()
    {
        var config = await _plcManager.GetConfigurationAsync();
        return Ok(config);
    }

    [HttpPost("config")]
    public async Task<IActionResult> UpdateConfiguration([FromBody] PLCConfiguration config)
    {
        if (config == null)
        {
            return BadRequest(new { Message = "Configuration payload is mandatory" });
        }

        if (string.IsNullOrWhiteSpace(config.PLC_ID)) config.PLC_ID = "PLC_DL02";
        if (string.IsNullOrWhiteSpace(config.StationCode)) config.StationCode = "DL02";
        if (string.IsNullOrWhiteSpace(config.Protocol)) config.Protocol = "SIMULATOR";
        if (string.IsNullOrWhiteSpace(config.IPAddress)) config.IPAddress = "192.168.1.50";
        if (config.Port <= 0) config.Port = 44818;

        bool saved = await _plcManager.SaveConfigurationAsync(config);
        if (saved)
        {
            return Ok(new
            {
                Success = true,
                Message = $"Configuración de PLC guardada para protocolo {config.Protocol} ({config.IPAddress}:{config.Port})",
                Config = config
            });
        }

        return StatusCode(500, new { Success = false, Message = "Error al persistir la configuración del PLC en base de datos" });
    }

    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        var cfg = _plcManager.CurrentConfig;
        var state = await _plcManager.ReadCurrentStateAsync();

        return Ok(new
        {
            PLC_ID = cfg.PLC_ID,
            StationCode = cfg.StationCode,
            Protocol = cfg.Protocol,
            IPAddress = cfg.IPAddress,
            Port = cfg.Port,
            PollingIntervalMs = cfg.PollingIntervalMs,
            TimeoutMs = cfg.TimeoutMs,
            IsConnected = _plcManager.IsConnected,
            State = state,
            Tags = new
            {
                cfg.TagRecipeA,
                cfg.TagRecipeB,
                cfg.TagRecipeReady,
                cfg.TagStationState,
                cfg.TagRecipeReceived,
                cfg.TagEchoRecipeA,
                cfg.TagEchoRecipeB
            }
        });
    }

    [HttpPost("test-connection")]
    public async Task<IActionResult> TestConnection([FromBody] TestConnectionRequest? request)
    {
        var result = await _plcManager.TestTcpConnectionAsync(request?.IPAddress, request?.Port, request?.TimeoutMs);
        return Ok(result);
    }

    [HttpPost("test-handshake")]
    public async Task<IActionResult> TestHandshake([FromBody] TestHandshakeRequest? request)
    {
        int a = request?.RecipeA ?? 99;
        int b = request?.RecipeB ?? 88;
        var result = await _plcManager.TestHandshakeAsync(a, b);
        return Ok(result);
    }

    [HttpPost("clear-signals")]
    public async Task<IActionResult> ClearSignals()
    {
        bool ok = await _plcManager.ClearSignalsAsync();
        return Ok(new { Success = ok, Message = "Señales de Handshake reseteadas en PLC" });
    }

    [HttpPost("force-state")]
    public IActionResult ForceState([FromBody] ForceStateRequest request)
    {
        if (Enum.TryParse<PLCLogicalState>(request.State, true, out var parsed))
        {
            _plcManager.SetSimulationState(parsed, request.EchoA, request.EchoB);
            return Ok(new { Success = true, State = parsed.ToString() });
        }
        return BadRequest(new { Message = $"Estado inválido: {request.State}" });
    }

    [HttpPost("write-s7-int")]
    public async Task<IActionResult> WriteS7Int([FromBody] WriteS7IntRequest request)
    {
        if (request == null)
        {
            return BadRequest(new { Message = "Payload es requerido" });
        }

        string ip = string.IsNullOrWhiteSpace(request.IPAddress) ? _plcManager.CurrentConfig.IPAddress : request.IPAddress.Trim();
        string addr = string.IsNullOrWhiteSpace(request.Address) ? "DB48.DBW2" : request.Address.Trim();
        short val = (short)request.Value;
        short rack = (short)(request.Rack ?? 0);
        short slot = (short)(request.Slot ?? 1);

        var result = await _plcManager.WriteS7DirectAsync(ip, addr, val, rack, slot);
        if (result.Success)
        {
            return Ok(result);
        }
        return StatusCode(500, result);
    }

    [HttpPost("send-s7-recipe")]
    public async Task<IActionResult> SendS7Recipe([FromBody] SendS7RecipeRequest request)
    {
        if (request == null)
        {
            return BadRequest(new { Message = "Payload es requerido" });
        }

        string ip = string.IsNullOrWhiteSpace(request.IPAddress) ? _plcManager.CurrentConfig.IPAddress : request.IPAddress.Trim();
        string recipeAddr = string.IsNullOrWhiteSpace(request.RecipeAddress) ? "DB48.DBW2" : request.RecipeAddress.Trim();
        string confirmAddr = string.IsNullOrWhiteSpace(request.ConfirmAddress) ? "DB48.DBX4.0" : request.ConfirmAddress.Trim();
        short recipeVal = (short)request.Recipe;
        short rack = (short)(request.Rack ?? 0);
        short slot = (short)(request.Slot ?? 1);

        var result = await _plcManager.WriteS7RecipeAndConfirmationAsync(
            ip,
            recipeVal,
            request.SendConfirmation,
            request.ConfirmationValue,
            recipeAddr,
            confirmAddr,
            rack,
            slot);

        if (result.Success)
        {
            return Ok(result);
        }
        return StatusCode(500, result);
    }

    [HttpGet("live")]
    public async Task<IActionResult> GetLiveTelemetry()
    {
        var result = await _plcManager.GetLiveTelemetryAsync();
        return Ok(result);
    }

    [HttpGet("read-offset6")]
    public async Task<IActionResult> ReadOffset6([FromQuery] string? ip, [FromQuery] string? address, [FromQuery] int? rack, [FromQuery] int? slot)
    {
        string plcIp = string.IsNullOrWhiteSpace(ip) ? _plcManager.CurrentConfig.IPAddress : ip.Trim();
        string addr = string.IsNullOrWhiteSpace(address) ? "DB48.DBW6" : address.Trim();
        short r = (short)(rack ?? 0);
        short s = (short)(slot ?? 1);

        var result = await _plcManager.ReadS7Offset6DirectAsync(plcIp, addr, r, s);
        return Ok(result);
    }

    [HttpPost("set-sim-offset6")]
    public IActionResult SetSimOffset6([FromBody] SetSimOffset6Request request)
    {
        if (request == null) return BadRequest();
        _plcManager.SetSimulatorOffset6(request.Value);
        return Ok(new { Success = true, Value = request.Value, Message = $"Offset 6 del simulador configurado en {request.Value}" });
    }

    [HttpPost("test-handshake-s7")]
    public async Task<IActionResult> TestHandshakeS7([FromBody] TestS7HandshakeRequest request)
    {
        if (request == null) return BadRequest(new { Message = "Payload es requerido" });

        string ip = string.IsNullOrWhiteSpace(request.IPAddress) ? _plcManager.CurrentConfig.IPAddress : request.IPAddress.Trim();
        short recipe = (short)(request.Recipe ?? 15);
        string recipeAddr = string.IsNullOrWhiteSpace(request.RecipeAddress) ? "DB48.DBW2" : request.RecipeAddress.Trim();
        string hsAddr = string.IsNullOrWhiteSpace(request.HandshakeAddress) ? "DB48.DBW6" : request.HandshakeAddress.Trim();
        short reqVal = (short)(request.ReqValue ?? 20);
        short ackVal = (short)(request.AckValue ?? 10);
        short idleVal = (short)(request.IdleValue ?? 24);
        short rack = (short)(request.Rack ?? 0);
        short slot = (short)(request.Slot ?? 1);
        int timeoutMs = request.TimeoutMs ?? 30000;
        bool isDual = request.IsDualRecipeModel ?? (!string.IsNullOrWhiteSpace(request.Modelo) && request.Modelo.Contains("D1H", StringComparison.OrdinalIgnoreCase));
        short secondRecipe = (short)(request.SecondRecipe ?? 24);

        var result = await _plcManager.ExecuteRecipeHandshakeAsync(
            ip,
            recipe,
            recipeAddr,
            hsAddr,
            reqVal,
            ackVal,
            idleVal,
            rack,
            slot,
            maxPollTimeoutMs: timeoutMs,
            isDualRecipeModel: isDual,
            secondRecipe: secondRecipe);

        if (result.Success) return Ok(result);
        return StatusCode(500, result);
    }
}

public class SendS7RecipeRequest
{
    public string? IPAddress { get; set; }
    public int Recipe { get; set; }
    public bool SendConfirmation { get; set; } = false;
    public bool ConfirmationValue { get; set; } = true;
    public string? RecipeAddress { get; set; } = "DB48.DBW2";
    public string? ConfirmAddress { get; set; } = "DB48.DBX4.0";
    public int? Rack { get; set; } = 0;
    public int? Slot { get; set; } = 1;
}

public class WriteS7IntRequest
{
    public string? IPAddress { get; set; }
    public string? Address { get; set; } = "DB48.DBW2";
    public int Value { get; set; }
    public int? Rack { get; set; } = 0;
    public int? Slot { get; set; } = 1;
}

public class TestConnectionRequest
{
    public string? IPAddress { get; set; }
    public int? Port { get; set; }
    public int? TimeoutMs { get; set; }
}

public class TestHandshakeRequest
{
    public int? RecipeA { get; set; }
    public int? RecipeB { get; set; }
}

public class ForceStateRequest
{
    public string State { get; set; } = string.Empty;
    public int? EchoA { get; set; }
    public int? EchoB { get; set; }
}

public class SetSimOffset6Request
{
    public int Value { get; set; } = 20;
}

public class TestS7HandshakeRequest
{
    public string? IPAddress { get; set; }
    public int? Recipe { get; set; } = 15;
    public string? RecipeAddress { get; set; } = "DB48.DBW2";
    public string? HandshakeAddress { get; set; } = "DB48.DBW6";
    public int? ReqValue { get; set; } = 20;
    public int? AckValue { get; set; } = 10;
    public int? IdleValue { get; set; } = 24;
    public int? Rack { get; set; } = 0;
    public int? Slot { get; set; } = 1;
    public int? TimeoutMs { get; set; } = 30000;
    public string? Modelo { get; set; }
    public bool? IsDualRecipeModel { get; set; }
    public int? SecondRecipe { get; set; } = 24;
}
