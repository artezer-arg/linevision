using LineVision.Core.Domain.Models;
using LineVision.Infrastructure.PLC;
using Microsoft.AspNetCore.Mvc;

namespace LineVision.Api.Controllers;

[ApiController]
[Route("api/plc/gateway")]
public class TelnetGatewayController : ControllerBase
{
    private readonly TelnetGatewayService _gateway;
    private readonly PLCManager _plcManager;
    private readonly ILogger<TelnetGatewayController> _logger;

    public TelnetGatewayController(
        TelnetGatewayService gateway,
        PLCManager plcManager,
        ILogger<TelnetGatewayController> logger)
    {
        _gateway = gateway;
        _plcManager = plcManager;
        _logger = logger;
    }

    [HttpGet("config")]
    public IActionResult GetConfig()
    {
        var config = _gateway.CurrentConfig;
        return Ok(new
        {
            config.Host,
            config.Port,
            config.TimeoutMs,
            config.CommandTemplate,
            config.LineTerminator,
            config.WaitForResponse,
            config.ExpectedResponsePattern,
            config.Active,
            IsMockRunning = _gateway.IsMockRunning
        });
    }

    [HttpPost("config")]
    public IActionResult UpdateConfig([FromBody] TelnetGatewayConfig config)
    {
        if (config == null) return BadRequest(new { Message = "Payload de configuración requerido" });

        bool saved = _gateway.SaveConfiguration(config);
        if (saved)
        {
            return Ok(new
            {
                Success = true,
                Message = $"Configuración de Gateway guardada para {config.Host}:{config.Port}",
                Config = config
            });
        }

        return StatusCode(500, new { Success = false, Message = "Error al persistir configuración de Gateway" });
    }

    [HttpPost("test-connection")]
    public async Task<IActionResult> TestConnection([FromBody] TelnetTestRequest? request)
    {
        var result = await _gateway.TestConnectionAsync(request?.Host, request?.Port, request?.TimeoutMs);
        return Ok(result);
    }

    [HttpPost("send-recipe")]
    public async Task<IActionResult> SendRecipe([FromBody] SendRecipeTelnetRequest request)
    {
        if (request == null) return BadRequest(new { Message = "Parámetros de receta requeridos" });

        var result = await _gateway.SendRecipeAsync(
            request.RecipeA,
            request.RecipeB,
            request.CradleCode,
            request.Model);

        return Ok(result);
    }

    [HttpPost("send-raw")]
    public async Task<IActionResult> SendRawCommand([FromBody] SendRawTelnetRequest request)
    {
        if (string.IsNullOrWhiteSpace(request?.Command))
        {
            return BadRequest(new { Message = "El comando de texto no puede estar vacío" });
        }

        var result = await _gateway.SendRawCommandAsync(request.Command);
        return Ok(result);
    }

    [HttpGet("logs")]
    public IActionResult GetLogs([FromQuery] int count = 50)
    {
        var logs = _gateway.GetLogs(count);
        return Ok(logs);
    }

    [HttpPost("clear-logs")]
    public IActionResult ClearLogs()
    {
        _gateway.ClearLogs();
        return Ok(new { Success = true, Message = "Terminal de logs Telnet reiniciada" });
    }

    [HttpPost("mock/toggle")]
    public IActionResult ToggleMock([FromBody] ToggleMockRequest request)
    {
        bool ok = _gateway.ToggleMockServer(request.Enable, request.Port ?? 12345);
        return Ok(new
        {
            Success = ok,
            IsMockRunning = _gateway.IsMockRunning,
            Message = _gateway.IsMockRunning
                ? $"Servidor simulado iniciado en 127.0.0.1:{request.Port ?? 12345}. Puede realizar pruebas de envío de inmediato."
                : "Servidor simulado detenido."
        });
    }
}

public class TelnetTestRequest
{
    public string? Host { get; set; }
    public int? Port { get; set; }
    public int? TimeoutMs { get; set; }
}

public class SendRecipeTelnetRequest
{
    public int RecipeA { get; set; }
    public int RecipeB { get; set; }
    public string? CradleCode { get; set; }
    public string? Model { get; set; }
}

public class SendRawTelnetRequest
{
    public string Command { get; set; } = string.Empty;
}

public class ToggleMockRequest
{
    public bool Enable { get; set; }
    public int? Port { get; set; }
}
