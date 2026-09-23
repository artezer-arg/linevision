using LineVision.Core.Domain.Enums;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace LineVision.Infrastructure.Services;

public class TraceabilityService : ITraceabilityService
{
    private readonly IDatabaseService _db;
    private readonly ILogger<TraceabilityService> _logger;
    private readonly string _sqlInsertSequenceResult;
    private readonly string _sqlCheckDuplicateSequence;
    private readonly SemaphoreSlim _lock = new(1, 1);

    public TraceabilityService(IDatabaseService db, IConfiguration config, ILogger<TraceabilityService> logger)
    {
        _db = db;
        _logger = logger;

        _sqlCheckDuplicateSequence = config["Queries:CheckDuplicateSequence"]
            ?? "SELECT COUNT(1) FROM Produccion_Secuencia WHERE ID_Secuencia = @sequenceId AND Puesto = @stationCode";

        _sqlInsertSequenceResult = config["Queries:InsertSequenceResult"]
            ?? @"INSERT INTO Produccion_Secuencia (ID_Secuencia, ID_OrdenProduccion, ID_OrdenCliente, Puesto, Fecha, Orden, Resultado)
                 VALUES (@ID_Secuencia, @ID_OrdenProduccion, @ID_OrdenCliente, @Puesto, @Fecha, @Orden, @Resultado)";
    }

    public async Task<Guid> StartCycleAsync(ProductionOrder order, string stationCode, string user, CancellationToken ct = default)
    {
        var cycle = new ProductionCycle
        {
            Cycle_ID = Guid.NewGuid(),
            ID_Secuencia = order.ID_Secuencia,
            ID_OrdenProduccion = order.ID_OrdenProduccion,
            ID_OrdenCliente = order.ID_OrdenCliente,
            Secuencia = order.Secuencia,
            Modelo = order.Modelo,
            Mano = order.Mano,
            Posicion = order.Posicion,
            Puesto = stationCode,
            FechaInicio = DateTime.UtcNow,
            Usuario = user
        };

        const string sql = @"
            INSERT INTO ProductionCycle (Cycle_ID, ID_Secuencia, ID_OrdenProduccion, ID_OrdenCliente, Secuencia, Modelo, Mano, Posicion, Puesto, FechaInicio, Usuario)
            VALUES (@Cycle_ID, @ID_Secuencia, @ID_OrdenProduccion, @ID_OrdenCliente, @Secuencia, @Modelo, @Mano, @Posicion, @Puesto, @FechaInicio, @Usuario)";

        await _db.ExecuteAsync(sql, new
        {
            Cycle_ID = cycle.Cycle_ID.ToString(),
            cycle.ID_Secuencia,
            cycle.ID_OrdenProduccion,
            cycle.ID_OrdenCliente,
            cycle.Secuencia,
            cycle.Modelo,
            cycle.Mano,
            cycle.Posicion,
            cycle.Puesto,
            FechaInicio = cycle.FechaInicio.ToString("o"),
            cycle.Usuario
        }, ct);

        _logger.LogInformation("Industrial cycle started: {CycleId} for Sequence {Sequence} (Model: {Model} Hand: {Hand} Pos: {Pos})",
            cycle.Cycle_ID, cycle.Secuencia, cycle.Modelo, cycle.Mano, cycle.Posicion);

        return cycle.Cycle_ID;
    }

    public async Task UpdateCycleStateAsync(Guid cycleId, Action<ProductionCycle> updateAction, CancellationToken ct = default)
    {
        const string selectSql = "SELECT * FROM ProductionCycle WHERE Cycle_ID = @id";
        var cycle = await _db.QuerySingleOrDefaultAsync<ProductionCycle>(selectSql, new { id = cycleId.ToString() }, ct);
        if (cycle == null)
        {
            _logger.LogWarning("Cycle {CycleId} not found for update", cycleId);
            return;
        }

        updateAction(cycle);

        const string updateSql = @"
            UPDATE ProductionCycle SET
                FechaFin = @FechaFin,
                QR_Cuna = @QR_Cuna,
                CradleResult = @CradleResult,
                PanelResult = @PanelResult,
                InspectionPlan = @InspectionPlan,
                InspectionPlanVersion = @InspectionPlanVersion,
                Recipe_A = @Recipe_A,
                Recipe_B = @Recipe_B,
                PLCStartState = @PLCStartState,
                PLCFinalState = @PLCFinalState,
                RobotResult = @RobotResult,
                StationResult = @StationResult,
                ErrorCode = @ErrorCode,
                ErrorDescription = @ErrorDescription,
                CycleTimeMs = @CycleTimeMs,
                VisionTimeMs = @VisionTimeMs,
                PLCTimeMs = @PLCTimeMs,
                DBTimeMs = @DBTimeMs
            WHERE Cycle_ID = @Cycle_ID";

        await _db.ExecuteAsync(updateSql, new
        {
            Cycle_ID = cycle.Cycle_ID.ToString(),
            FechaFin = cycle.FechaFin?.ToString("o"),
            cycle.QR_Cuna,
            cycle.CradleResult,
            cycle.PanelResult,
            cycle.InspectionPlan,
            cycle.InspectionPlanVersion,
            cycle.Recipe_A,
            cycle.Recipe_B,
            cycle.PLCStartState,
            cycle.PLCFinalState,
            cycle.RobotResult,
            cycle.StationResult,
            cycle.ErrorCode,
            cycle.ErrorDescription,
            cycle.CycleTimeMs,
            cycle.VisionTimeMs,
            cycle.PLCTimeMs,
            cycle.DBTimeMs
        }, ct);
    }

    public async Task LogInspectionResultsAsync(Guid cycleId, IEnumerable<PointInspectionResult> results, CancellationToken ct = default)
    {
        const string sql = @"
            INSERT INTO InspectionResult 
            (Cycle_ID, InspectionPoint_ID, InspectionPlan_ID, InspectionPlanVersion, ExpectedValue, DetectedValue, Confidence, Result, ImagePath, ROIImagePath, ProcessingTimeMs, Timestamp)
            VALUES 
            (@Cycle_ID, @InspectionPoint_ID, @InspectionPlan_ID, @InspectionPlanVersion, @ExpectedValue, @DetectedValue, @Confidence, @Result, @ImagePath, @ROIImagePath, @ProcessingTimeMs, @Timestamp)";

        foreach (var r in results)
        {
            await _db.ExecuteAsync(sql, new
            {
                Cycle_ID = cycleId.ToString(),
                r.InspectionPoint_ID,
                r.InspectionPlan_ID,
                r.InspectionPlanVersion,
                r.ExpectedValue,
                r.DetectedValue,
                r.Confidence,
                Result = r.Result.ToString(),
                r.ImagePath,
                r.ROIImagePath,
                r.ProcessingTimeMs,
                Timestamp = r.Timestamp.ToString("o")
            }, ct);
        }
    }

    public async Task<bool> IsSequenceAlreadyProcessedAsync(int sequenceId, string stationCode, CancellationToken ct = default)
    {
        int count = await _db.QuerySingleOrDefaultAsync<int>(_sqlCheckDuplicateSequence, new { sequenceId, stationCode }, ct);
        return count > 0;
    }

    public async Task<bool> CommitStationResultAsync(Guid cycleId, StationResultOutcome outcome, CancellationToken ct = default)
    {
        await _lock.WaitAsync(ct);
        try
        {
            const string selectCycleSql = "SELECT * FROM ProductionCycle WHERE Cycle_ID = @id";
            var cycle = await _db.QuerySingleOrDefaultAsync<ProductionCycle>(selectCycleSql, new { id = cycleId.ToString() }, ct);
            if (cycle == null)
            {
                _logger.LogError("Cannot commit station result: Cycle {CycleId} not found", cycleId);
                return false;
            }

            // 1. Verificación estricta de Idempotencia
            bool alreadyProcessed = await IsSequenceAlreadyProcessedAsync(cycle.ID_Secuencia, cycle.Puesto, ct);
            if (alreadyProcessed)
            {
                _logger.LogWarning("IDEMPOTENCY TRIGGERED: Sequence {SequenceId} for Station {Station} was already recorded in Produccion_Secuencia. Skipping duplicate insertion.",
                    cycle.ID_Secuencia, cycle.Puesto);
            }
            else
            {
                // 2. Inserción en la tabla productiva oficial
                string now = DateTime.UtcNow.ToString("o");
                await _db.ExecuteAsync(_sqlInsertSequenceResult, new
                {
                    cycle.ID_Secuencia,
                    cycle.ID_OrdenProduccion,
                    cycle.ID_OrdenCliente,
                    cycle.Puesto,
                    Fecha = now,
                    Orden = 1,
                    Resultado = outcome.ToString()
                }, ct);

                _logger.LogInformation("Station result committed to [Produccion_Secuencia]: Sequence={SequenceId}, Station={Station}, Outcome={Outcome}",
                    cycle.ID_Secuencia, cycle.Puesto, outcome);
            }

            // 3. Cierre del ciclo interno
            DateTime end = DateTime.UtcNow;
            int totalMs = (int)(end - cycle.FechaInicio).TotalMilliseconds;

            await UpdateCycleStateAsync(cycleId, c =>
            {
                c.FechaFin = end;
                c.StationResult = outcome.ToString();
                c.CycleTimeMs = totalMs;
            }, ct);

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Critical failure committing station result for cycle {CycleId}", cycleId);
            return false;
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task RecordBypassAsync(BypassRecord bypass, CancellationToken ct = default)
    {
        const string sql = @"
            INSERT INTO BypassLog (User, Timestamp, PriorState, TargetState, Reason, Piece, Sequence, Cycle_ID)
            VALUES (@User, @Timestamp, @PriorState, @TargetState, @Reason, @Piece, @Sequence, @Cycle_ID)";

        await _db.ExecuteAsync(sql, new
        {
            bypass.User,
            Timestamp = bypass.Timestamp.ToString("o"),
            PriorState = bypass.PriorState.ToString(),
            TargetState = bypass.TargetState.ToString(),
            bypass.Reason,
            bypass.Piece,
            bypass.Sequence,
            Cycle_ID = bypass.Cycle_ID?.ToString()
        }, ct);

        _logger.LogWarning("BYPASS RECORDED by {User}: State changed from {PriorState} to {TargetState}. Reason: {Reason}. Piece: {Piece}",
            bypass.User, bypass.PriorState, bypass.TargetState, bypass.Reason, bypass.Piece);
    }

    public async Task<IReadOnlyList<ProductionCycle>> QueryCyclesAsync(DateTime from, DateTime to, string? sequence = null, string? outcome = null, CancellationToken ct = default)
    {
        string sql = @"
            SELECT * FROM ProductionCycle 
            WHERE FechaInicio >= @from AND FechaInicio <= @to";

        if (!string.IsNullOrEmpty(sequence))
            sql += " AND Secuencia LIKE '%' || @sequence || '%'";

        if (!string.IsNullOrEmpty(outcome))
            sql += " AND StationResult = @outcome";

        sql += " ORDER BY FechaInicio DESC LIMIT 100";

        var cycles = await _db.QueryAsync<ProductionCycle>(sql, new
        {
            from = from.ToString("o"),
            to = to.ToString("o"),
            sequence,
            outcome
        }, ct);

        return cycles.ToList();
    }
}
