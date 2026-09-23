using System.Text.Json;
using System.Text.RegularExpressions;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Logging;

namespace LineVision.Infrastructure.Services;

public class CradleQRService : ICradleQRService
{
    private readonly IDatabaseService _db;
    private readonly ILogger<CradleQRService> _logger;
    private CradleQRConfig _cachedConfig = new();

    public CradleQRService(IDatabaseService db, ILogger<CradleQRService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<CradleQRConfig> GetConfigAsync(CancellationToken ct = default)
    {
        const string sql = "SELECT Value FROM AppConfiguration WHERE [Key] = 'CradleQRConfig'";
        var json = await _db.QuerySingleOrDefaultAsync<string>(sql, null, ct);
        if (!string.IsNullOrEmpty(json))
        {
            try
            {
                var cfg = JsonSerializer.Deserialize<CradleQRConfig>(json);
                if (cfg != null)
                {
                    _cachedConfig = cfg;
                    return cfg;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to parse CradleQRConfig from database");
            }
        }

        return _cachedConfig;
    }

    public async Task SaveConfigAsync(CradleQRConfig config, CancellationToken ct = default)
    {
        _cachedConfig = config;
        string json = JsonSerializer.Serialize(config);
        const string sql = @"
            INSERT INTO AppConfiguration ([Key], Value, Description, Category, UpdatedAt)
            VALUES ('CradleQRConfig', @json, 'Cradle QR parsing and validation configuration', 'VISION', @now)
            ON CONFLICT([Key]) DO UPDATE SET Value = @json, UpdatedAt = @now";

        await _db.ExecuteAsync(sql, new { json, now = DateTime.UtcNow.ToString("o") }, ct);
        _logger.LogInformation("Cradle QR configuration updated successfully");
    }

    public async Task<string> ResolveCradleCodeAsync(string qrCode, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(qrCode))
            return "CUNA-01";

        qrCode = qrCode.Trim();

        // 1. Buscar coincidencia exacta en tabla CradleQR
        const string sqlExact = "SELECT Cradle_Code FROM CradleQR WHERE QR_Pattern = @qrCode AND Activo = 1 LIMIT 1";
        var code = await _db.QuerySingleOrDefaultAsync<string>(sqlExact, new { qrCode }, ct);
        if (!string.IsNullOrWhiteSpace(code))
            return code.Trim();

        // 2. Si el QR mismo tiene formato "CUNA-XX" o similar (ej. "CUNA-01", "CUNA-02")
        var matchCuna = Regex.Match(qrCode, @"^(CUNA[-_]?[0-9A-Z]+)", RegexOptions.IgnoreCase);
        if (matchCuna.Success)
        {
            string candidate = matchCuna.Groups[1].Value.ToUpperInvariant();
            // Normalizar a formato CUNA-XX si viene como CUNA01 o CUNA_01
            if (candidate.StartsWith("CUNA") && !candidate.StartsWith("CUNA-") && candidate.Length > 4)
            {
                candidate = "CUNA-" + candidate.Substring(candidate.StartsWith("CUNA_") ? 5 : 4);
            }
            return candidate;
        }

        return "CUNA-01";
    }

    public async Task<bool> ValidateCradleCompatibilityAsync(string cradleCode, ProductContext expectedContext, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(cradleCode))
            return false;

        cradleCode = cradleCode.Trim();

        // 1. Verificar si existe asociación explícita en tabla CradleQR
        const string sqlCradle = @"
            SELECT COUNT(1) FROM CradleQR 
            WHERE Cradle_Code = @cradleCode 
              AND Modelo = @Modelo 
              AND Mano = @Mano 
              AND Posicion = @Posicion 
              AND Activo = 1";

        int cradleMatches = await _db.QuerySingleOrDefaultAsync<int>(sqlCradle, new
        {
            cradleCode,
            expectedContext.Modelo,
            expectedContext.Mano,
            expectedContext.Posicion
        }, ct);

        if (cradleMatches > 0)
        {
            _logger.LogInformation("Cradle {Cradle} is authorized in CradleQR table for {Model}/{Hand}/{Pos}",
                cradleCode, expectedContext.Modelo, expectedContext.Mano, expectedContext.Posicion);
            return true;
        }

        // 2. Verificar si existe receta de soldadura activa configurada para esa cuna y panel
        const string sqlRecipe = @"
            SELECT COUNT(1) FROM RobotRecipe 
            WHERE Cradle_Code = @cradleCode 
              AND Modelo = @Modelo 
              AND Mano = @Mano 
              AND Posicion = @Posicion 
              AND Activo = 1";

        int recipeMatches = await _db.QuerySingleOrDefaultAsync<int>(sqlRecipe, new
        {
            cradleCode,
            expectedContext.Modelo,
            expectedContext.Mano,
            expectedContext.Posicion
        }, ct);

        if (recipeMatches > 0)
        {
            _logger.LogInformation("Cradle {Cradle} is authorized via RobotRecipe table for {Model}/{Hand}/{Pos}",
                cradleCode, expectedContext.Modelo, expectedContext.Mano, expectedContext.Posicion);
            return true;
        }

        _logger.LogWarning("Cradle {Cradle} is NOT compatible with Panel {Model}/{Hand}/{Pos} (No CradleQR mapping or RobotRecipe found)",
            cradleCode, expectedContext.Modelo, expectedContext.Mano, expectedContext.Posicion);
        return false;
    }

    public async Task<bool> ValidateQRAsync(string qrCode, ProductContext expectedContext, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(qrCode))
        {
            _logger.LogWarning("QR Code provided is empty or whitespace");
            return false;
        }

        var config = await GetConfigAsync(ct);

        // 1. Validar Prefijo (si está configurado)
        if (!string.IsNullOrEmpty(config.Prefix) && !qrCode.StartsWith(config.Prefix, StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning("QR Code '{QR}' does not match expected prefix '{Prefix}'", qrCode, config.Prefix);
            return false;
        }

        // 2. Validar Longitud (si está configurada)
        if (config.ExpectedLength.HasValue && qrCode.Length != config.ExpectedLength.Value)
        {
            _logger.LogWarning("QR Code '{QR}' length ({Len}) does not match expected length ({Expected})",
                qrCode, qrCode.Length, config.ExpectedLength.Value);
            return false;
        }

        // 3. Resolver código de cuna
        string cradleCode = await ResolveCradleCodeAsync(qrCode, ct);

        // 4. Validar compatibilidad de la cuna con el panel
        bool isCompatible = await ValidateCradleCompatibilityAsync(cradleCode, expectedContext, ct);
        if (!isCompatible)
        {
            _logger.LogWarning("QR '{QR}' resolved to Cradle '{Cradle}' which is not compatible with product {Model}/{Hand}/{Pos}",
                qrCode, cradleCode, expectedContext.Modelo, expectedContext.Mano, expectedContext.Posicion);
            return false;
        }

        _logger.LogInformation("Cradle QR validated OK: '{QR}' -> Cradle '{Cradle}' compatible with {Model}/{Hand}/{Pos}",
            qrCode, cradleCode, expectedContext.Modelo, expectedContext.Mano, expectedContext.Posicion);

        return true;
    }
}
