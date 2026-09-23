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

        // 3. Validar Regex Paramétrico (si está configurado)
        if (!string.IsNullOrEmpty(config.RegexPattern))
        {
            var match = Regex.Match(qrCode, config.RegexPattern, RegexOptions.IgnoreCase);
            if (!match.Success)
            {
                _logger.LogWarning("QR Code '{QR}' does not match regex pattern '{Regex}'", qrCode, config.RegexPattern);
                return false;
            }

            // Si el regex contiene grupos con nombre ("model", "hand", "pos"), validarlos directamente
            if (match.Groups["model"].Success && !string.Equals(match.Groups["model"].Value, expectedContext.Modelo, StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning("QR Model mismatch: Found '{Found}' vs Expected '{Expected}'",
                    match.Groups["model"].Value, expectedContext.Modelo);
                return false;
            }

            if (match.Groups["hand"].Success && !string.Equals(match.Groups["hand"].Value, expectedContext.Mano, StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning("QR Hand mismatch: Found '{Found}' vs Expected '{Expected}'",
                    match.Groups["hand"].Value, expectedContext.Mano);
                return false;
            }

            if (match.Groups["pos"].Success && !string.Equals(match.Groups["pos"].Value, expectedContext.Posicion, StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning("QR Position mismatch: Found '{Found}' vs Expected '{Expected}'",
                    match.Groups["pos"].Value, expectedContext.Posicion);
                return false;
            }
        }

        // 4. Validar contra tabla de asociación CradleQR en Base de Datos
        const string sql = "SELECT * FROM CradleQR WHERE QR_Pattern = @qrCode AND Activo = 1";
        var mapping = await _db.QuerySingleOrDefaultAsync<CradleQRMapping>(sql, new { qrCode }, ct);

        if (mapping == null)
        {
            if (config.RequireExactMatchInDatabase)
            {
                _logger.LogWarning("QR Code '{QR}' is not registered in [CradleQR] table", qrCode);
                return false;
            }
            return true;
        }

        bool matchProduct = string.Equals(mapping.Modelo, expectedContext.Modelo, StringComparison.OrdinalIgnoreCase) &&
                            string.Equals(mapping.Mano, expectedContext.Mano, StringComparison.OrdinalIgnoreCase) &&
                            string.Equals(mapping.Posicion, expectedContext.Posicion, StringComparison.OrdinalIgnoreCase);

        if (!matchProduct)
        {
            _logger.LogWarning("Cradle QR '{QR}' matches DB record but belongs to ({Model}/{Hand}/{Pos}) instead of expected ({ExpModel}/{ExpHand}/{ExpPos})",
                qrCode, mapping.Modelo, mapping.Mano, mapping.Posicion,
                expectedContext.Modelo, expectedContext.Mano, expectedContext.Posicion);
            return false;
        }

        _logger.LogInformation("Cradle QR validated OK: '{QR}' corresponds to expected order ({Model}/{Hand}/{Pos})",
            qrCode, expectedContext.Modelo, expectedContext.Mano, expectedContext.Posicion);

        return true;
    }
}
