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

    public async Task<RobotRecipe?> GetRecipeAsync(string stationCode, string modelo, string mano, string posicion, CancellationToken ct = default)
    {
        const string sql = @"
            SELECT * FROM RobotRecipe 
            WHERE StationCode = @stationCode 
              AND Modelo = @modelo 
              AND Mano = @mano 
              AND Posicion = @posicion 
              AND Activo = 1 
            ORDER BY Version DESC 
            LIMIT 1";

        var recipe = await _db.QuerySingleOrDefaultAsync<RobotRecipe>(sql, new { stationCode, modelo, mano, posicion }, ct);
        if (recipe == null)
        {
            _logger.LogWarning("No active robot recipe found for Station={Station}, Model={Model}, Hand={Hand}, Pos={Pos}",
                stationCode, modelo, mano, posicion);
        }
        else
        {
            _logger.LogInformation("Recipe found for {Station} ({Model}/{Hand}/{Pos}): Recipe_A={A}, Recipe_B={B} (v{Version})",
                stationCode, modelo, mano, posicion, recipe.Recipe_A, recipe.Recipe_B, recipe.Version);
        }

        return recipe;
    }

    public async Task<IReadOnlyList<RobotRecipe>> GetAllRecipesAsync(string stationCode, CancellationToken ct = default)
    {
        const string sql = "SELECT * FROM RobotRecipe WHERE StationCode = @stationCode ORDER BY Modelo, Mano, Posicion, Version DESC";
        var list = await _db.QueryAsync<RobotRecipe>(sql, new { stationCode }, ct);
        return list.ToList();
    }

    public async Task<bool> SaveRecipeAsync(RobotRecipe recipe, CancellationToken ct = default)
    {
        const string sql = @"
            INSERT INTO RobotRecipe 
            (StationCode, Modelo, Mano, Posicion, Recipe_A, Recipe_B, Version, Activo, CreatedAt, UpdatedAt, UpdatedBy)
            VALUES 
            (@StationCode, @Modelo, @Mano, @Posicion, @Recipe_A, @Recipe_B, @Version, @Activo, @CreatedAt, @UpdatedAt, @UpdatedBy)";

        string now = DateTime.UtcNow.ToString("o");
        int rows = await _db.ExecuteAsync(sql, new
        {
            recipe.StationCode,
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
