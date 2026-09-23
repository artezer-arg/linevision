using LineVision.Core.Domain.Enums;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Logging;

namespace LineVision.Infrastructure.PLC;

public class PLCSimulator : IPLCService
{
    private readonly ILogger<PLCSimulator> _logger;
    private readonly PLCConfiguration _config;
    private bool _isConnected;
    
    // Internal PLC Simulated Registers / Tags
    private int _rawState = 0; // 0 = FREE
    private bool _recipeReadyBit = false;
    private bool _recipeReceivedBit = false;
    private int _recipeARegister = 0;
    private int _recipeBRegister = 0;
    private int _echoARegister = 0;
    private int _echoBRegister = 0;

    // Fault Injection Flags
    private bool _simulateTimeout = false;
    private bool _simulateEchoMismatch = false;
    private bool _simulateErrorState = false;
    private bool _simulateConnectionLost = false;

    // Auto-advance robot timer
    private CancellationTokenSource? _robotRunCts;

    public string PLCId => _config.PLC_ID;
    public bool IsConnected => _isConnected && !_simulateConnectionLost;

    public PLCSimulator(PLCConfiguration config, ILogger<PLCSimulator> logger)
    {
        _config = config;
        _logger = logger;
    }

    public Task<bool> ConnectAsync(CancellationToken ct = default)
    {
        if (_simulateConnectionLost)
        {
            _logger.LogWarning("PLC simulator connection failed: SIMULATED_CONNECTION_LOST active");
            _isConnected = false;
            return Task.FromResult(false);
        }

        _isConnected = true;
        _logger.LogInformation("PLC simulator connected ({Protocol} @ {IP}:{Port})",
            _config.Protocol, _config.IPAddress, _config.Port);
        return Task.FromResult(true);
    }

    public Task DisconnectAsync()
    {
        _isConnected = false;
        _robotRunCts?.Cancel();
        _logger.LogInformation("PLC simulator disconnected");
        return Task.CompletedTask;
    }

    public Task<PLCStateInfo> ReadCurrentStateAsync(CancellationToken ct = default)
    {
        if (!IsConnected)
        {
            return Task.FromResult(new PLCStateInfo
            {
                IsConnected = false,
                LogicalState = PLCLogicalState.Unknown,
                StateDescription = "DISCONNECTED"
            });
        }

        if (_simulateErrorState)
        {
            return Task.FromResult(new PLCStateInfo
            {
                IsConnected = true,
                RawValue = 4,
                LogicalState = PLCLogicalState.ERROR,
                StateDescription = "EMERGENCY STOP / HARDWARE FAULT",
                EchoRecipeA = _echoARegister,
                EchoRecipeB = _echoBRegister,
                RecipeReceived = _recipeReceivedBit
            });
        }

        var logical = _rawState switch
        {
            0 => PLCLogicalState.FREE,
            1 => PLCLogicalState.RECIPE_RECEIVED,
            2 => PLCLogicalState.ROBOT_PROCESSING,
            3 => PLCLogicalState.CYCLE_FINISHED,
            _ => PLCLogicalState.ERROR
        };

        string desc = logical switch
        {
            PLCLogicalState.FREE => "LIBRE / ESPERANDO PIEZA",
            PLCLogicalState.RECIPE_RECEIVED => "RECETA RECIBIDA Y CONFIRMADA",
            PLCLogicalState.ROBOT_PROCESSING => "ROBOT EN EJECUCION (SOLDADURA)",
            PLCLogicalState.CYCLE_FINISHED => "CICLO COMPLETADO OK",
            _ => "FALLA / ERROR"
        };

        return Task.FromResult(new PLCStateInfo
        {
            IsConnected = true,
            RawValue = _rawState,
            LogicalState = logical,
            StateDescription = desc,
            RecipeReceived = _recipeReceivedBit,
            EchoRecipeA = _echoARegister,
            EchoRecipeB = _echoBRegister,
            Timestamp = DateTime.UtcNow
        });
    }

    public Task<bool> WriteRecipeAsync(int recipeA, int recipeB, CancellationToken ct = default)
    {
        if (!IsConnected) return Task.FromResult(false);

        _recipeARegister = recipeA;
        _recipeBRegister = recipeB;

        _logger.LogInformation("PLC SIMULATOR: Wrote Recipe_A={A}, Recipe_B={B} to registers", recipeA, recipeB);
        return Task.FromResult(true);
    }

    public Task<bool> AssertRecipeReadyAsync(CancellationToken ct = default)
    {
        if (!IsConnected) return Task.FromResult(false);

        if (_simulateTimeout)
        {
            _logger.LogWarning("PLC SIMULATOR: RecipeReady ignored due to injected TIMEOUT");
            return Task.FromResult(false);
        }

        _recipeReadyBit = true;

        // PLC logic triggers: reads inputs, sets echoes, sets RecipeReceived
        if (_simulateEchoMismatch)
        {
            _echoARegister = _recipeARegister + 99; // Corrupt echo
            _echoBRegister = _recipeBRegister;
            _logger.LogWarning("PLC SIMULATOR: Injected recipe mismatch! Echo_A set to {EchoA}", _echoARegister);
        }
        else
        {
            _echoARegister = _recipeARegister;
            _echoBRegister = _recipeBRegister;
        }

        _recipeReceivedBit = true;
        _rawState = 1; // RECIPE_RECEIVED

        _logger.LogInformation("PLC SIMULATOR: Recipe handshake accepted. Echo_A={A}, Echo_B={B}, State=RECIPE_RECEIVED",
            _echoARegister, _echoBRegister);

        // Schedule simulated robot welding cycle (simulates PLC transitioning to ROBOT_PROCESSING then CYCLE_FINISHED)
        TriggerSimulatedWeldingSequence();

        return Task.FromResult(true);
    }

    private void TriggerSimulatedWeldingSequence()
    {
        _robotRunCts?.Cancel();
        _robotRunCts = new CancellationTokenSource();
        var ct = _robotRunCts.Token;

        Task.Run(async () =>
        {
            try
            {
                await Task.Delay(300, ct); // Handshake settlement
                _rawState = 2; // ROBOT_PROCESSING
                _logger.LogInformation("PLC SIMULATOR: Robot welding started (State = ROBOT_PROCESSING)");

                await Task.Delay(2000, ct); // Simulated welding duration

                if (!ct.IsCancellationRequested)
                {
                    _rawState = 3; // CYCLE_FINISHED
                    _logger.LogInformation("PLC SIMULATOR: Robot welding finished (State = CYCLE_FINISHED)");
                }
            }
            catch (OperationCanceledException) { }
        }, ct);
    }

    public Task<(int recipeA, int recipeB)> ReadRecipeEchoAsync(CancellationToken ct = default)
    {
        if (!IsConnected) return Task.FromResult((-1, -1));
        return Task.FromResult((_echoARegister, _echoBRegister));
    }

    public Task<bool> ClearSignalsAsync(CancellationToken ct = default)
    {
        _recipeReadyBit = false;
        _recipeReceivedBit = false;
        _rawState = 0; // FREE
        _logger.LogInformation("PLC SIMULATOR: Signals cleared, state reset to FREE");
        return Task.FromResult(true);
    }

    public async Task<bool> WaitForStateAsync(PLCLogicalState targetState, TimeSpan timeout, CancellationToken ct = default)
    {
        var start = DateTime.UtcNow;
        while (DateTime.UtcNow - start < timeout && !ct.IsCancellationRequested)
        {
            var current = await ReadCurrentStateAsync(ct);
            if (current.LogicalState == targetState) return true;
            if (current.LogicalState == PLCLogicalState.ERROR && targetState != PLCLogicalState.ERROR)
            {
                _logger.LogWarning("PLC entered ERROR state while waiting for {Target}", targetState);
                return false;
            }
            await Task.Delay(100, ct);
        }

        _logger.LogWarning("Timeout waiting for PLC state {Target} after {Ms}ms", targetState, timeout.TotalMilliseconds);
        return false;
    }

    public void SetSimulationState(PLCLogicalState state, int? echoA = null, int? echoB = null)
    {
        _rawState = (int)state;
        if (echoA.HasValue) _echoARegister = echoA.Value;
        if (echoB.HasValue) _echoBRegister = echoB.Value;
        _logger.LogInformation("PLC SIMULATOR: State explicitly set to {State}", state);
    }

    public void InjectFault(string faultType)
    {
        _simulateTimeout = false;
        _simulateEchoMismatch = false;
        _simulateErrorState = false;
        _simulateConnectionLost = false;

        switch (faultType.ToUpperInvariant())
        {
            case "TIMEOUT":
                _simulateTimeout = true;
                _logger.LogWarning("FAULT INJECTED: PLC Timeout");
                break;
            case "MISMATCH":
                _simulateEchoMismatch = true;
                _logger.LogWarning("FAULT INJECTED: Recipe Echo Mismatch");
                break;
            case "ERROR":
                _simulateErrorState = true;
                _logger.LogWarning("FAULT INJECTED: PLC Cell Error / E-Stop");
                break;
            case "DISCONNECT":
                _simulateConnectionLost = true;
                _logger.LogWarning("FAULT INJECTED: PLC Connection Lost");
                break;
            case "NONE":
            case "CLEAR":
                _logger.LogInformation("ALL FAULTS CLEARED on PLC Simulator");
                break;
        }
    }

    public ValueTask DisposeAsync()
    {
        _robotRunCts?.Cancel();
        _isConnected = false;
        return ValueTask.CompletedTask;
    }
}
