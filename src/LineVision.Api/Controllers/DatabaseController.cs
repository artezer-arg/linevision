using LineVision.Core.Domain.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace LineVision.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DatabaseController : ControllerBase
{
    private readonly IDatabaseService _db;
    private readonly ILogger<DatabaseController> _logger;

    public DatabaseController(IDatabaseService db, ILogger<DatabaseController> logger)
    {
        _db = db;
        _logger = logger;
    }

    [HttpGet("config")]
    public IActionResult GetConfiguration()
    {
        var config = _db.GetConfiguration();
        return Ok(config);
    }

    [HttpPost("config")]
    public async Task<IActionResult> UpdateConfiguration([FromBody] DatabaseConnectionConfig config, CancellationToken ct)
    {
        if (config == null) return BadRequest(new { Success = false, Message = "Configuration payload is mandatory" });

        bool updated = await _db.UpdateConfigurationAsync(config, ct);
        if (updated)
        {
            return Ok(new
            {
                Success = true,
                Message = $"Conexión a base de datos actualizada exitosamente a {config.Provider}",
                Config = _db.GetConfiguration()
            });
        }

        return BadRequest(new
        {
            Success = false,
            Message = "No se pudo conectar a la base de datos con los parámetros proporcionados. Se mantuvo la conexión anterior."
        });
    }

    [HttpPost("test")]
    public async Task<IActionResult> TestConnection([FromBody] DatabaseConnectionConfig? config, CancellationToken ct)
    {
        var result = await _db.TestConnectionAsync(config, ct);
        return Ok(result);
    }

    [HttpPost("migrate")]
    public async Task<IActionResult> RunMigration([FromQuery] bool seedData = true, CancellationToken ct = default)
    {
        _logger.LogInformation("Operator triggered safe idempotent database migration");
        var result = await _db.InitializeOrUpdateSchemaAsync(seedData, ct);
        return Ok(result);
    }

    [HttpGet("tables")]
    public async Task<IActionResult> GetTables(CancellationToken ct)
    {
        var tables = await _db.GetTablesAsync(ct);
        return Ok(tables);
    }

    [HttpGet("script")]
    public IActionResult GetSqlScript([FromQuery] string provider = "SqlServer")
    {
        string script = _db.GenerateIdempotentSqlScript(provider);
        string filename = string.Equals(provider, "Sqlite", StringComparison.OrdinalIgnoreCase)
            ? "LineVision_DL02_Setup_Sqlite.sql"
            : "LineVision_DL02_Setup_SqlServer.sql";

        return Ok(new
        {
            Provider = provider,
            Filename = filename,
            Content = script
        });
    }
}
