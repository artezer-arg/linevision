using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Logging;

namespace LineVision.Infrastructure.Services;

public class RecipeService : IRecipeService
{
    private readonly IDatabaseService _db;
    private readonly ILogger<RecipeService> _logger;

    public RecipeService(IDatabaseService db, ILogger<RecipeService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<RobotRecipe?> GetRecipeAsync(string stationCode, string cradleCode, string modelo, string mano, string posicion, CancellationToken ct = default)
    {
        cradleCode = string.IsNullOrWhiteSpace(cradleCode) ? "CUNA-01" : cradleCode.Trim();

        const string sql = @"
            SELECT * FROM RobotRecipe 
            WHERE StationCode = @stationCode 
              AND (Cradle_Code = @cradleCode OR Cradle_Code = 'CUNA-01')
              AND Modelo = @modelo 
              AND Mano = @mano 
              AND Posicion = @posicion 
              AND Activo = 1 
            ORDER BY (CASE WHEN Cradle_Code = @cradleCode THEN 0 ELSE 1 END), Version DESC 
            LIMIT 1";

        var recipe = await _db.QuerySingleOrDefaultAsync<RobotRecipe>(sql, new { stationCode, cradleCode, modelo, mano, posicion }, ct);
        if (recipe == null)
        {
            _logger.LogWarning("No active robot recipe found for Station={Station}, Cradle={Cradle}, Model={Model}, Hand={Hand}, Pos={Pos}",
                stationCode, cradleCode, modelo, mano, posicion);
        }
        else
        {
            _logger.LogInformation("Recipe found for {Station} [Cradle={Cradle}] ({Model}/{Hand}/{Pos}): Recipe_A={A}, Recipe_B={B} (v{Version})",
                stationCode, recipe.Cradle_Code, modelo, mano, posicion, recipe.Recipe_A, recipe.Recipe_B, recipe.Version);
        }

        return recipe;
    }

    public Task<RobotRecipe?> GetRecipeAsync(string stationCode, string modelo, string mano, string posicion, CancellationToken ct = default)
    {
        return GetRecipeAsync(stationCode, "CUNA-01", modelo, mano, posicion, ct);
    }

    public async Task<IReadOnlyList<RobotRecipe>> GetAllRecipesAsync(string stationCode, string? cradleCode = null, CancellationToken ct = default)
    {
        string sql = @"
            SELECT * FROM RobotRecipe 
            WHERE StationCode = @stationCode " +
            (!string.IsNullOrEmpty(cradleCode) ? "AND Cradle_Code = @cradleCode " : "") +
            "ORDER BY Cradle_Code, Modelo, Mano, Posicion, Version DESC";

        var list = await _db.QueryAsync<RobotRecipe>(sql, new { stationCode, cradleCode }, ct);
        return list.ToList();
    }

    public async Task<IReadOnlyList<string>> GetAvailableCradlesAsync(string stationCode, CancellationToken ct = default)
    {
        const string sql = @"
            SELECT DISTINCT Cradle_Code FROM RobotRecipe WHERE StationCode = @stationCode AND Activo = 1
            UNION
            SELECT DISTINCT Cradle_Code FROM CradleQR WHERE Activo = 1
            ORDER BY 1";

        var list = await _db.QueryAsync<string>(sql, new { stationCode }, ct);
        var cradles = list.Where(c => !string.IsNullOrWhiteSpace(c)).ToList();
        if (!cradles.Contains("CUNA-01")) cradles.Insert(0, "CUNA-01");
        if (!cradles.Contains("CUNA-02")) cradles.Add("CUNA-02");
        return cradles;
    }

    public async Task<bool> SaveRecipeAsync(RobotRecipe recipe, CancellationToken ct = default)
    {
        recipe.Cradle_Code = string.IsNullOrWhiteSpace(recipe.Cradle_Code) ? "CUNA-01" : recipe.Cradle_Code.Trim();

        const string sql = @"
            INSERT INTO RobotRecipe 
            (StationCode, Cradle_Code, Modelo, Mano, Posicion, Recipe_A, Recipe_B, Version, Activo, CreatedAt, UpdatedAt, UpdatedBy)
            VALUES 
            (@StationCode, @Cradle_Code, @Modelo, @Mano, @Posicion, @Recipe_A, @Recipe_B, @Version, @Activo, @CreatedAt, @UpdatedAt, @UpdatedBy)";

        string now = DateTime.UtcNow.ToString("o");
        int rows = await _db.ExecuteAsync(sql, new
        {
            recipe.StationCode,
            recipe.Cradle_Code,
            recipe.Modelo,
            recipe.Mano,
            recipe.Posicion,
            recipe.Recipe_A,
            recipe.Recipe_B,
            recipe.Version,
            Activo = recipe.Activo ? 1 : 0,
            CreatedAt = now,
            UpdatedAt = now,
            recipe.UpdatedBy
        }, ct);

        return rows > 0;
    }
}
