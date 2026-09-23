using LineVision.Core.Domain.Enums;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Logging;

namespace LineVision.Infrastructure.PLC;

public class PLCHandshakeCoordinator
{
    private readonly IPLCService _plc;
    private readonly ILogger<PLCHandshakeCoordinator> _logger;

    public PLCHandshakeCoordinator(IPLCService plc, ILogger<PLCHandshakeCoordinator> logger)
    {
        _plc = plc;
        _logger = logger;
    }

    public async Task<HandshakeResult> ExecuteHandshakeAsync(RobotRecipe recipe, TimeSpan timeout, CancellationToken ct = default)
    {
        var result = new HandshakeResult();

        // 1. Verificar PLC READY
        _logger.LogInformation("STEP 1: Verifying PLC is in READY state...");
        var state = await _plc.ReadCurrentStateAsync(ct);
        if (state.LogicalState != PLCLogicalState.FREE)
        {
            result.Success = false;
            result.ErrorMessage = $"PLC is not ready. Current state: {state.LogicalState} ({state.StateDescription})";
            _logger.LogError("HANDSHAKE FAILED: {Error}", result.ErrorMessage);
            return result;
        }

        // 2 & 3. PC escribe Recipe_A y Recipe_B
        _logger.LogInformation("STEP 2 & 3: Writing Recipe_A={A}, Recipe_B={B} to PLC...", recipe.Recipe_A, recipe.Recipe_B);
        bool writeSuccess = await _plc.WriteRecipeAsync(recipe.Recipe_A, recipe.Recipe_B, ct);
        if (!writeSuccess)
        {
            result.Success = false;
            result.ErrorMessage = "Failed to write recipe registers to PLC";
            _logger.LogError("HANDSHAKE FAILED: {Error}", result.ErrorMessage);
            return result;
        }

        // 4. PC activa RecipeReady
        _logger.LogInformation("STEP 4: Asserting RecipeReady handshake signal...");
        bool assertSuccess = await _plc.AssertRecipeReadyAsync(ct);
        if (!assertSuccess)
        {
            result.Success = false;
            result.ErrorMessage = "PLC failed to acknowledge RecipeReady signal (Timeout or error)";
            _logger.LogError("HANDSHAKE FAILED: {Error}", result.ErrorMessage);
            return result;
        }

        // 5 & 6. PLC lee y devuelve RecipeReceived
        _logger.LogInformation("STEP 5 & 6: Waiting for PLC to confirm RecipeReceived...");
        bool waitSuccess = await _plc.WaitForStateAsync(PLCLogicalState.RECIPE_RECEIVED, timeout, ct);
        if (!waitSuccess)
        {
            // Note: In fast PLCs or simulator, state might have quickly moved to ROBOT_PROCESSING
            var currentState = await _plc.ReadCurrentStateAsync(ct);
            if (currentState.LogicalState != PLCLogicalState.RECIPE_RECEIVED && currentState.LogicalState != PLCLogicalState.ROBOT_PROCESSING)
            {
                result.Success = false;
                result.ErrorMessage = $"PLC did not confirm RecipeReceived within timeout ({timeout.TotalMilliseconds}ms)";
                _logger.LogError("HANDSHAKE FAILED: {Error}", result.ErrorMessage);
                return result;
            }
        }

        // 7 & 8. PC vuelve a leer los dos valores y confirma que coinciden
        _logger.LogInformation("STEP 7 & 8: Reading back recipe echo from PLC...");
        var (echoA, echoB) = await _plc.ReadRecipeEchoAsync(ct);
        result.EchoRecipeA = echoA;
        result.EchoRecipeB = echoB;

        if (echoA != recipe.Recipe_A || echoB != recipe.Recipe_B)
        {
            result.Success = false;
            result.ErrorMessage = $"RECIPE MISMATCH: Sent ({recipe.Recipe_A}, {recipe.Recipe_B}) but PLC echoed ({echoA}, {echoB})";
            _logger.LogCritical("CRITICAL SAFETY FAULT: {Error}. Welding operation blocked!", result.ErrorMessage);
            return result;
        }

        _logger.LogInformation("HANDSHAKE CONFIRMED: Recipe ({A}, {B}) successfully echoed and verified by PLC", echoA, echoB);
        result.Success = true;
        return result;
    }
}

public class HandshakeResult
{
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
    public int EchoRecipeA { get; set; }
    public int EchoRecipeB { get; set; }
}
