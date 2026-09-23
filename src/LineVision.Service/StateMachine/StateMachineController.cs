using LineVision.Core.Domain.Enums;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Logging;

namespace LineVision.Service.StateMachine;

public class StateMachineController : IStateMachineController
{
    private readonly ILogger<StateMachineController> _logger;
    private readonly ITraceabilityService _traceability;
    private readonly SemaphoreSlim _stateLock = new(1, 1);

    public StationState CurrentState { get; private set; } = StationState.WAITING_ORDER;
    public ProductionOrder? CurrentOrder { get; private set; }
    public ProductionCycle? CurrentCycle { get; private set; }

    public event EventHandler<StationStateChangedEventArgs>? StateChanged;

    public StateMachineController(ILogger<StateMachineController> logger, ITraceabilityService traceability)
    {
        _logger = logger;
        _traceability = traceability;
    }

    public async Task<bool> TriggerAsync(StationTrigger trigger, object? payload = null, CancellationToken ct = default)
    {
        await _stateLock.WaitAsync(ct);
        try
        {
            var nextState = EvaluateTransition(CurrentState, trigger, payload);
            if (!nextState.HasValue)
            {
                _logger.LogWarning("INVALID TRANSITION REJECTED: CurrentState={Current}, Trigger={Trigger}", CurrentState, trigger);
                return false;
            }

            var previousState = CurrentState;
            CurrentState = nextState.Value;

            if (payload is ProductionOrder order)
            {
                CurrentOrder = order;
            }

            _logger.LogInformation("STATE TRANSITION: [{Prev}] ===( {Trigger} )===> [{Next}]",
                previousState, trigger, CurrentState);

            StateChanged?.Invoke(this, new StationStateChangedEventArgs
            {
                PreviousState = previousState,
                NewState = CurrentState,
                Trigger = trigger,
                Reason = payload as string
            });

            return true;
        }
        finally
        {
            _stateLock.Release();
        }
    }

    public Task<bool> StartCycleAsync(CancellationToken ct = default)
    {
        return TriggerAsync(StationTrigger.CycleReset, null, ct);
    }

    public async Task RequestEmergencyStopAsync(string reason, CancellationToken ct = default)
    {
        _logger.LogCritical("EMERGENCY STOP REQUESTED: {Reason}", reason);
        await TriggerAsync(StationTrigger.FaultOccurred, reason, ct);
    }

    public async Task<bool> ForceStateAsync(StationState targetState, string reason, string authorizedUser, CancellationToken ct = default)
    {
        await _stateLock.WaitAsync(ct);
        try
        {
            var prior = CurrentState;
            CurrentState = targetState;

            _logger.LogWarning("MANUAL BYPASS EXECUTED by {User}: [{Prior}] ===> [{Target}]. Reason: {Reason}",
                authorizedUser, prior, targetState, reason);

            // Registrar auditoría estricta de Bypass
            await _traceability.RecordBypassAsync(new BypassRecord
            {
                User = authorizedUser,
                Timestamp = DateTime.UtcNow,
                PriorState = prior,
                TargetState = targetState,
                Reason = reason,
                Sequence = CurrentOrder?.Secuencia,
                Piece = CurrentOrder?.VariantKey,
                Cycle_ID = CurrentCycle?.Cycle_ID
            }, ct);

            StateChanged?.Invoke(this, new StationStateChangedEventArgs
            {
                PreviousState = prior,
                NewState = targetState,
                Trigger = StationTrigger.ClearFault,
                Reason = $"Manual Bypass by {authorizedUser}: {reason}"
            });

            return true;
        }
        finally
        {
            _stateLock.Release();
        }
    }

    public Task ResetFaultAsync(string authorizedUser, CancellationToken ct = default)
    {
        _logger.LogInformation("Fault reset requested by {User}", authorizedUser);
        return TriggerAsync(StationTrigger.ClearFault, $"Fault reset by {authorizedUser}", ct);
    }

    public void AttachActiveCycle(ProductionCycle? cycle)
    {
        CurrentCycle = cycle;
    }

    private static StationState? EvaluateTransition(StationState current, StationTrigger trigger, object? payload)
    {
        // Transición global de falla
        if (trigger == StationTrigger.FaultOccurred)
        {
            return StationState.ERROR;
        }

        // Transición a mantenimiento
        if (trigger == StationTrigger.EnterMaintenance)
        {
            return StationState.MAINTENANCE;
        }

        if (current == StationState.MAINTENANCE && trigger == StationTrigger.ExitMaintenance)
        {
            return StationState.WAITING_ORDER;
        }

        // Recuperación de error
        if (current == StationState.ERROR)
        {
            if (trigger == StationTrigger.ClearFault || trigger == StationTrigger.CycleReset)
                return StationState.WAITING_ORDER;
            return null;
        }

        // Matriz estricta de transiciones industriales
        return (current, trigger) switch
        {
            (StationState.WAITING_ORDER, StationTrigger.OrderDetected) => StationState.ORDER_LOADED,
            (StationState.ORDER_LOADED, StationTrigger.OrderDetected) => StationState.ORDER_LOADED,
            (StationState.ORDER_LOADED, StationTrigger.CradleCheckStarted) => StationState.CHECKING_CRADLE,
            
            (StationState.CHECKING_CRADLE, StationTrigger.CradlePassed) => StationState.CRADLE_OK,
            (StationState.CHECKING_CRADLE, StationTrigger.CradleFailed) => StationState.ERROR,

            (StationState.CRADLE_OK, StationTrigger.CradleQRRead) => StationState.CHECKING_CRADLE_QR,
            (StationState.CHECKING_CRADLE_QR, StationTrigger.CradleQRMatched) => StationState.CRADLE_QR_OK,
            (StationState.CHECKING_CRADLE_QR, StationTrigger.CradleQRMismatched) => StationState.ERROR,

            (StationState.CRADLE_QR_OK, StationTrigger.PanelPlanLoaded) => StationState.LOADING_PANEL_INSPECTION_PLAN,
            (StationState.LOADING_PANEL_INSPECTION_PLAN, StationTrigger.PanelCheckStarted) => StationState.CHECKING_PANEL,

            (StationState.CHECKING_PANEL, StationTrigger.PanelPassed) => StationState.PANEL_OK,
            (StationState.CHECKING_PANEL, StationTrigger.PanelFailed) => StationState.ERROR,

            (StationState.PANEL_OK, StationTrigger.PLCPollReady) => StationState.WAITING_PLC,
            (StationState.WAITING_PLC, StationTrigger.PLCPollReady) => StationState.PLC_READY,

            (StationState.PLC_READY, StationTrigger.RecipeLoaded) => StationState.LOADING_RECIPE,
            (StationState.LOADING_RECIPE, StationTrigger.RecipeSent) => StationState.SENDING_RECIPE,
            (StationState.SENDING_RECIPE, StationTrigger.RecipeSent) => StationState.WAITING_RECIPE_CONFIRMATION,
            (StationState.SENDING_RECIPE, StationTrigger.RecipeEchoVerified) => StationState.RECIPE_CONFIRMED,
            (StationState.SENDING_RECIPE, StationTrigger.RecipeEchoMismatch) => StationState.ERROR,

            (StationState.WAITING_RECIPE_CONFIRMATION, StationTrigger.RecipeEchoVerified) => StationState.RECIPE_CONFIRMED,
            (StationState.WAITING_RECIPE_CONFIRMATION, StationTrigger.RecipeEchoMismatch) => StationState.ERROR,

            (StationState.RECIPE_CONFIRMED, StationTrigger.RobotStarted) => StationState.ROBOT_RUNNING,
            (StationState.ROBOT_RUNNING, StationTrigger.RobotStarted) => StationState.WAITING_ROBOT_FINISH,
            (StationState.ROBOT_RUNNING, StationTrigger.RobotFinished) => StationState.SAVING_STATION_RESULT,
            (StationState.WAITING_ROBOT_FINISH, StationTrigger.RobotFinished) => StationState.SAVING_STATION_RESULT,

            (StationState.SAVING_STATION_RESULT, StationTrigger.ResultSaved) => StationState.CYCLE_COMPLETE,
            (StationState.CYCLE_COMPLETE, StationTrigger.CycleReset) => StationState.WAITING_ORDER,

            _ => null // Transición inválida / Salto de estado no permitido
        };
    }
}
