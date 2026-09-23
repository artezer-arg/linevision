using LineVision.Core.Domain.Enums;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Logging;

namespace LineVision.Service.Coordination;

public class CycleRecoveryService
{
    private readonly IDatabaseService _db;
    private readonly IPLCService _plc;
    private readonly ITraceabilityService _traceability;
    private readonly IStateMachineController _stateMachine;
    private readonly ILogger<CycleRecoveryService> _logger;

    public CycleRecoveryService(
        IDatabaseService db,
        IPLCService plc,
        ITraceabilityService traceability,
        IStateMachineController stateMachine,
        ILogger<CycleRecoveryService> logger)
    {
        _db = db;
        _plc = plc;
        _traceability = traceability;
        _stateMachine = stateMachine;
        _logger = logger;
    }

    public async Task<RecoveryResult> PerformStartupReconciliationAsync(string stationCode, CancellationToken ct = default)
    {
        _logger.LogInformation("Performing post-restart industrial safety recovery for station {Station}...", stationCode);
        var result = new RecoveryResult();

        // 1. Consultar estado del PLC
        await _plc.ConnectAsync(ct);
        var plcState = await _plc.ReadCurrentStateAsync(ct);
        result.PLCState = plcState.LogicalState;
        _logger.LogInformation("Recovery Step 1: PLC state read as {State} ({Desc})", plcState.LogicalState, plcState.StateDescription);

        // 2. Consultar último ProductionCycle sin FechaFin
        const string sqlUnfinished = @"
            SELECT * FROM ProductionCycle 
            WHERE Puesto = @stationCode AND FechaFin IS NULL 
            ORDER BY FechaInicio DESC LIMIT 1";

        var unfinishedCycle = await _db.QuerySingleOrDefaultAsync<ProductionCycle>(sqlUnfinished, new { stationCode }, ct);
        result.HasUnfinishedCycle = unfinishedCycle != null;

        if (unfinishedCycle == null)
        {
            _logger.LogInformation("Recovery Step 2: No unfinished production cycle found. Station is clean to start.");
            result.ActionTaken = "NORMAL_STARTUP";
            result.RequiresOperatorIntervention = false;
            return result;
        }

        result.UnfinishedCycleId = unfinishedCycle.Cycle_ID;
        result.UnfinishedSequence = unfinishedCycle.Secuencia;
        _logger.LogWarning("Recovery Step 2: Found unfinished cycle {CycleId} for Sequence {Seq}",
            unfinishedCycle.Cycle_ID, unfinishedCycle.Secuencia);

        // 3. Consultar si Produccion_Secuencia ya tiene el resultado registrado
        bool alreadyCommitted = await _traceability.IsSequenceAlreadyProcessedAsync(unfinishedCycle.ID_Secuencia, stationCode, ct);
        result.AlreadyCommittedInOfficialTable = alreadyCommitted;

        if (alreadyCommitted)
        {
            _logger.LogWarning("Recovery Step 3: Sequence {Seq} was ALREADY committed in Produccion_Secuencia! Closing orphan cycle to prevent double-processing.",
                unfinishedCycle.Secuencia);

            await _traceability.UpdateCycleStateAsync(unfinishedCycle.Cycle_ID, c =>
            {
                c.FechaFin = DateTime.UtcNow;
                c.StationResult = "RECOVERED_ALREADY_COMMITTED";
            }, ct);

            result.ActionTaken = "CLOSED_ALREADY_COMMITTED_CYCLE";
            result.RequiresOperatorIntervention = false;
            return result;
        }

        // 4. Si el PLC está en medio de soldadura o error
        if (plcState.LogicalState == PLCLogicalState.ROBOT_PROCESSING || plcState.LogicalState == PLCLogicalState.RECIPE_RECEIVED)
        {
            _logger.LogCritical("CRITICAL RECOVERY WARNING: System rebooted while robot was active or holding recipe! Halting progression to avoid crashing workpiece.");
            await _stateMachine.TriggerAsync(StationTrigger.FaultOccurred, "SYSTEM_REBOOT_MID_CYCLE", ct);
            result.RequiresOperatorIntervention = true;
            result.ActionTaken = "BLOCKED_AWAITING_MAINTENANCE";
            return result;
        }

        // 5. Si no se había iniciado soldadura, marcar ciclo anterior como interrumpido y requerir verificación
        await _traceability.UpdateCycleStateAsync(unfinishedCycle.Cycle_ID, c =>
        {
            c.FechaFin = DateTime.UtcNow;
            c.StationResult = "ABORTED_ON_RESTART";
            c.ErrorCode = "ERR_RESTART_BEFORE_COMPLETION";
        }, ct);

        _logger.LogInformation("Recovery completed: Orphan cycle marked ABORTED_ON_RESTART. Ready for inspection.");
        result.ActionTaken = "ABORTED_AND_READY";
        result.RequiresOperatorIntervention = false;
        return result;
    }
}

public class RecoveryResult
{
    public PLCLogicalState PLCState { get; set; }
    public bool HasUnfinishedCycle { get; set; }
    public Guid? UnfinishedCycleId { get; set; }
    public string? UnfinishedSequence { get; set; }
    public bool AlreadyCommittedInOfficialTable { get; set; }
    public bool RequiresOperatorIntervention { get; set; }
    public string ActionTaken { get; set; } = string.Empty;
}
