using System.Text.Json;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Logging;

namespace LineVision.Infrastructure.Services;

public class WorkflowConfigService : IWorkflowConfigService
{
    private readonly IDatabaseService _db;
    private readonly ILogger<WorkflowConfigService> _logger;
    private StationWorkflowConfig _cachedConfig = new();
    private readonly SemaphoreSlim _lock = new(1, 1);

    public WorkflowConfigService(IDatabaseService db, ILogger<WorkflowConfigService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<StationWorkflowConfig> GetConfigAsync(CancellationToken ct = default)
    {
        await _lock.WaitAsync(ct);
        try
        {
            const string sql = "SELECT Value FROM AppConfiguration WHERE [Key] = 'WorkflowConfig'";
            var json = await _db.QuerySingleOrDefaultAsync<string>(sql, null, ct);
            if (!string.IsNullOrEmpty(json))
            {
                try
                {
                    var cfg = JsonSerializer.Deserialize<StationWorkflowConfig>(json);
                    if (cfg != null)
                    {
                        _cachedConfig = cfg;
                        return cfg;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to deserialize WorkflowConfig from database, using cached fallback");
                }
            }

            return _cachedConfig;
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<bool> SaveConfigAsync(StationWorkflowConfig config, CancellationToken ct = default)
    {
        await _lock.WaitAsync(ct);
        try
        {
            _cachedConfig = config;
            string json = JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true });
            string now = DateTime.UtcNow.ToString("o");

            if (_db.CurrentProvider.Equals("SqlServer", StringComparison.OrdinalIgnoreCase))
            {
                const string sqlServer = @"
                    IF EXISTS (SELECT 1 FROM AppConfiguration WHERE [Key] = 'WorkflowConfig')
                        UPDATE AppConfiguration SET Value = @json, UpdatedAt = @now WHERE [Key] = 'WorkflowConfig';
                    ELSE
                        INSERT INTO AppConfiguration ([Key], Value, Description, Category, UpdatedAt)
                        VALUES ('WorkflowConfig', @json, 'Configuracion del flujo operativo de la estacion', 'WORKFLOW', @now);";
                await _db.ExecuteAsync(sqlServer, new { json, now }, ct);
            }
            else
            {
                const string sqlite = @"
                    INSERT INTO AppConfiguration ([Key], Value, Description, Category, UpdatedAt)
                    VALUES ('WorkflowConfig', @json, 'Configuracion del flujo operativo de la estacion', 'WORKFLOW', @now)
                    ON CONFLICT([Key]) DO UPDATE SET Value = @json, UpdatedAt = @now;";
                await _db.ExecuteAsync(sqlite, new { json, now }, ct);
            }

            _logger.LogInformation("Station workflow configuration updated successfully: Mode={Mode}, RecipeAddress={Addr}, SendConfirmation={SendConf}",
                config.WorkflowMode, config.RecipeAddress, config.SendConfirmation);

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save StationWorkflowConfig to database");
            return false;
        }
        finally
        {
            _lock.Release();
        }
    }
}
