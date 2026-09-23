using LineVision.Core.Domain.Enums;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using LineVision.Infrastructure.PLC;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace LineVision.Service.Coordination;

public class StationOrchestrator : BackgroundService
{
    private readonly string _stationCode;
    private readonly IProductionOrderService _orderService;
    private readonly IInspectionPlanService _planService;
    private readonly ICradleQRService _qrService;
    private readonly IRecipeService _recipeService;
    private readonly ICameraManager _cameraManager;
    private readonly IInspectionEngine _inspectionEngine;
    private readonly IPLCService _plcService;
    private readonly PLCHandshakeCoordinator _handshakeCoordinator;
    private readonly ITraceabilityService _traceability;
    private readonly IStateMachineController _stateMachine;
    private readonly ILogger<StationOrchestrator> _logger;

    private bool _autoRunEnabled = true;

    public bool IsAutoRunEnabled => _autoRunEnabled;
    public string StationCode => _stationCode;

    public StationOrchestrator(
        IConfiguration config,
        IProductionOrderService orderService,
        IInspectionPlanService planService,
        ICradleQRService qrService,
        IRecipeService recipeService,
        ICameraManager cameraManager,
        IInspectionEngine inspectionEngine,
        IPLCService plcService,
        PLCHandshakeCoordinator handshakeCoordinator,
        ITraceabilityService traceability,
        IStateMachineController stateMachine,
        ILogger<StationOrchestrator> logger)
    {
        _stationCode = config["Station:Code"] ?? "DL02";
        _orderService = orderService;
        _planService = planService;
        _qrService = qrService;
        _recipeService = recipeService;
        _cameraManager = cameraManager;
        _inspectionEngine = inspectionEngine;
        _plcService = plcService;
        _handshakeCoordinator = handshakeCoordinator;
        _traceability = traceability;
        _stateMachine = stateMachine;
        _logger = logger;
    }

    public void SetAutoRun(bool enabled)
    {
        _autoRunEnabled = enabled;
        _logger.LogInformation("Station {Station} AutoRun state set to {Enabled}", _stationCode, enabled);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Industrial Station Orchestrator started for station {Station}", _stationCode);

        // Inicializar cámaras y conexión PLC
        await _cameraManager.InitializeCamerasAsync(stoppingToken);
        await _plcService.ConnectAsync(stoppingToken);

        // Restaurar último ciclo para alimentar HMI de inmediato
        try
        {
            var recent = await _traceability.QueryCyclesAsync(DateTime.UtcNow.AddDays(-1), DateTime.UtcNow.AddDays(1), ct: stoppingToken);
            var latest = recent.FirstOrDefault();
            if (latest != null)
            {
                _stateMachine.AttachActiveCycle(latest);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not restore latest cycle on startup");
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (!_autoRunEnabled)
                {
                    await Task.Delay(500, stoppingToken);
                    continue;
                }

                if (_stateMachine.CurrentState == StationState.ERROR || _stateMachine.CurrentState == StationState.MAINTENANCE)
                {
                    await Task.Delay(500, stoppingToken);
                    continue;
                }

                if (_stateMachine.CurrentState == StationState.WAITING_ORDER || _stateMachine.CurrentState == StationState.ORDER_LOADED || _stateMachine.CurrentState == StationState.CYCLE_COMPLETE)
                {
                    await ProcessOrderStepAsync(stoppingToken);
                }

                await Task.Delay(200, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unhandled exception in StationOrchestrator loop");
                await _stateMachine.TriggerAsync(StationTrigger.FaultOccurred, ex.Message, stoppingToken);
                await Task.Delay(1000, stoppingToken);
            }
        }

        _logger.LogInformation("Station Orchestrator background service shutting down");
    }

    public async Task<bool> RunFullCycleStepAsync(CancellationToken ct = default)
    {
        return await ProcessOrderStepAsync(ct);
    }

    private async Task<bool> ProcessOrderStepAsync(CancellationToken ct)
    {
        // ---------------------------------------------------------------------
        // PASO 0: LEER PUNTERO DE ORDEN PARA LA ESTACIÓN DL02
        // ---------------------------------------------------------------------
        var order = await _orderService.GetCurrentOrderForStationAsync(_stationCode, ct);
        if (order == null)
        {
            return false;
        }

        // Validación de idempotencia: si la secuencia ya fue registrada, no reprocesar a ciegas
        bool alreadyDone = await _traceability.IsSequenceAlreadyProcessedAsync(order.ID_Secuencia, _stationCode, ct);
        if (alreadyDone)
        {
            _logger.LogWarning("Sequence {Seq} is already completed in Produccion_Secuencia for {Station}. Advancing pointer.",
                order.Secuencia, _stationCode);
            await _orderService.AdvanceStationPointerAsync(_stationCode, order.ID_OrdenProduccion + 1, ct);
            return false;
        }

        // Iniciar Ciclo de Trazabilidad
        var cycleId = await _traceability.StartCycleAsync(order, _stationCode, "OPERATOR", ct);
        var activeCycle = new ProductionCycle
        {
            Cycle_ID = cycleId,
            ID_Secuencia = order.ID_Secuencia,
            ID_OrdenProduccion = order.ID_OrdenProduccion,
            ID_OrdenCliente = order.ID_OrdenCliente,
            Secuencia = order.Secuencia,
            Modelo = order.Modelo,
            Mano = order.Mano,
            Posicion = order.Posicion,
            Puesto = _stationCode,
            FechaInicio = DateTime.UtcNow,
            Usuario = "OPERATOR"
        };
        _stateMachine.AttachActiveCycle(activeCycle);
        await _stateMachine.TriggerAsync(StationTrigger.OrderDetected, order, ct);

        var context = new ProductContext
        {
            Modelo = order.Modelo,
            Mano = order.Mano,
            Posicion = order.Posicion,
            Secuencia = order.Secuencia,
            ID_Secuencia = order.ID_Secuencia,
            ID_OrdenProduccion = order.ID_OrdenProduccion
        };

        // ---------------------------------------------------------------------
        // PASO 1: VALIDACIÓN DE CUNA E INSERTOS MEDIANTE CÁMARAS
        // ---------------------------------------------------------------------
        await _stateMachine.TriggerAsync(StationTrigger.CradleCheckStarted, null, ct);
        var cradlePlan = await _planService.GetActivePlanForVariantAsync("CRADLE", order.Modelo, order.Mano, order.Posicion, ct);
        if (cradlePlan == null)
        {
            _logger.LogError("CRADLE NOK: No inspection plan configured for Cradle {Model}/{Hand}/{Pos}", order.Modelo, order.Mano, order.Posicion);
            activeCycle.CradleResult = "NOK";
            activeCycle.ErrorCode = "ERR_NO_CRADLE_PLAN";
            _stateMachine.AttachActiveCycle(activeCycle);
            await _stateMachine.TriggerAsync(StationTrigger.CradleFailed, "No Cradle Plan found", ct);
            await _traceability.UpdateCycleStateAsync(cycleId, c => { c.CradleResult = "NOK"; c.ErrorCode = "ERR_NO_CRADLE_PLAN"; }, ct);
            return false;
        }

        var frames = await _cameraManager.CaptureAllFramesAsync(ct);
        var cradleReport = await _inspectionEngine.ExecutePlanAsync(cradlePlan, context, frames, ct);
        await _traceability.LogInspectionResultsAsync(cycleId, cradleReport.Details, ct);

        if (!cradleReport.OverallSuccess)
        {
            _logger.LogWarning("CRADLE NOK: Fixture validation failed. Failed points: {Points}",
                string.Join(", ", cradleReport.FailedRequiredPoints));
            activeCycle.CradleResult = "NOK";
            activeCycle.ErrorCode = "ERR_CRADLE_CHECK_FAILED";
            _stateMachine.AttachActiveCycle(activeCycle);
            await _stateMachine.TriggerAsync(StationTrigger.CradleFailed, "Cradle vision check failed", ct);
            await _traceability.UpdateCycleStateAsync(cycleId, c => { c.CradleResult = "NOK"; c.ErrorCode = "ERR_CRADLE_CHECK_FAILED"; }, ct);
            return false;
        }

        activeCycle.CradleResult = "OK";
        _stateMachine.AttachActiveCycle(activeCycle);
        await _traceability.UpdateCycleStateAsync(cycleId, c => c.CradleResult = "OK", ct);
        await _stateMachine.TriggerAsync(StationTrigger.CradlePassed, null, ct);

        // ---------------------------------------------------------------------
        // PASO 2: LECTURA Y VALIDACIÓN DE QR DE CUNA
        // ---------------------------------------------------------------------
        await _stateMachine.TriggerAsync(StationTrigger.CradleQRRead, null, ct);
        // Obtener QR leído por el punto o cámara
        var qrResult = cradleReport.Details.FirstOrDefault(d => d.ExpectedValue == "CUNA" || d.PointCode.Contains("QR"))
            ?? new PointInspectionResult { DetectedValue = "CUNA-01" };

        string readQR = qrResult.DetectedValue;
        string cradleCode = await _qrService.ResolveCradleCodeAsync(readQR, ct);
        bool qrValid = await _qrService.ValidateCradleCompatibilityAsync(cradleCode, context, ct);

        activeCycle.QR_Cuna = readQR;
        activeCycle.Cradle_Code = cradleCode;
        _stateMachine.AttachActiveCycle(activeCycle);
        await _traceability.UpdateCycleStateAsync(cycleId, c => { c.QR_Cuna = readQR; c.Cradle_Code = cradleCode; }, ct);

        if (!qrValid)
        {
            _logger.LogError("CRADLE QR NOK: Cradle '{Cradle}' (QR '{QR}') is not compatible with order {Model}/{Hand}/{Pos}",
                cradleCode, readQR, order.Modelo, order.Mano, order.Posicion);
            activeCycle.CradleResult = "NOK";
            activeCycle.ErrorCode = "ERR_QR_MISMATCH";
            _stateMachine.AttachActiveCycle(activeCycle);
            await _stateMachine.TriggerAsync(StationTrigger.CradleQRMismatched, $"Cradle {cradleCode} mismatch", ct);
            await _traceability.UpdateCycleStateAsync(cycleId, c => { c.CradleResult = "NOK"; c.ErrorCode = "ERR_QR_MISMATCH"; }, ct);
            return false;
        }

        await _stateMachine.TriggerAsync(StationTrigger.CradleQRMatched, null, ct);

        // ---------------------------------------------------------------------
        // PASO 3: CONTROL DE PANEL DE PUERTA (INSPECTION POINTS)
        // ---------------------------------------------------------------------
        await _stateMachine.TriggerAsync(StationTrigger.PanelPlanLoaded, null, ct);
        var panelPlan = await _planService.GetActivePlanForVariantAsync("PANEL", order.Modelo, order.Mano, order.Posicion, ct);
        if (panelPlan == null)
        {
            _logger.LogError("PANEL NOK: No inspection plan configured for Panel {Model}/{Hand}/{Pos}", order.Modelo, order.Mano, order.Posicion);
            activeCycle.PanelResult = "NOK";
            activeCycle.ErrorCode = "ERR_NO_PANEL_PLAN";
            _stateMachine.AttachActiveCycle(activeCycle);
            await _stateMachine.TriggerAsync(StationTrigger.PanelFailed, "No Panel Plan found", ct);
            await _traceability.UpdateCycleStateAsync(cycleId, c => { c.PanelResult = "NOK"; c.ErrorCode = "ERR_NO_PANEL_PLAN"; }, ct);
            return false;
        }

        await _stateMachine.TriggerAsync(StationTrigger.PanelCheckStarted, null, ct);
        frames = await _cameraManager.CaptureAllFramesAsync(ct);
        var panelReport = await _inspectionEngine.ExecutePlanAsync(panelPlan, context, frames, ct);
        await _traceability.LogInspectionResultsAsync(cycleId, panelReport.Details, ct);

        if (!panelReport.OverallSuccess)
        {
            _logger.LogWarning("PANEL NOK: Quality inspection failed. Failed required points: {Points}",
                string.Join(", ", panelReport.FailedRequiredPoints));
            activeCycle.PanelResult = "NOK";
            activeCycle.ErrorCode = "ERR_PANEL_CHECK_FAILED";
            _stateMachine.AttachActiveCycle(activeCycle);
            await _stateMachine.TriggerAsync(StationTrigger.PanelFailed, "Panel vision check failed", ct);
            await _traceability.UpdateCycleStateAsync(cycleId, c => { c.PanelResult = "NOK"; c.ErrorCode = "ERR_PANEL_CHECK_FAILED"; }, ct);
            return false;
        }

        activeCycle.PanelResult = "OK";
        activeCycle.InspectionPlan = panelPlan.Code;
        activeCycle.InspectionPlanVersion = panelPlan.ActiveVersion;
        _stateMachine.AttachActiveCycle(activeCycle);
        await _traceability.UpdateCycleStateAsync(cycleId, c =>
        {
            c.PanelResult = "OK";
            c.InspectionPlan = panelPlan.Code;
            c.InspectionPlanVersion = panelPlan.ActiveVersion;
        }, ct);
        await _stateMachine.TriggerAsync(StationTrigger.PanelPassed, null, ct);

        // ---------------------------------------------------------------------
        // PASO 4: VERIFICACIÓN DEL PLC Y ESTADO READY
        // ---------------------------------------------------------------------
        await _stateMachine.TriggerAsync(StationTrigger.PLCPollReady, null, ct);
        var plcState = await _plcService.ReadCurrentStateAsync(ct);
        if (plcState.LogicalState != PLCLogicalState.FREE)
        {
            _logger.LogWarning("PLC not in FREE state: {State} ({Desc})", plcState.LogicalState, plcState.StateDescription);
            await _stateMachine.TriggerAsync(StationTrigger.FaultOccurred, $"PLC busy or not ready: {plcState.StateDescription}", ct);
            return false;
        }

        await _stateMachine.TriggerAsync(StationTrigger.PLCPollReady, null, ct);

        // ---------------------------------------------------------------------
        // PASO 5: OBTENER Y ENVIAR RECETA AL ROBOT (HANDSHAKE CON ECO)
        // ---------------------------------------------------------------------
        string activeCradle = activeCycle.Cradle_Code ?? "CUNA-01";
        var recipe = await _recipeService.GetRecipeAsync(_stationCode, activeCradle, order.Modelo, order.Mano, order.Posicion, ct);
        if (recipe == null)
        {
            _logger.LogError("RECIPE NOK: No welding recipe configured for Cradle '{Cradle}' with Panel {Model}/{Hand}/{Pos}",
                activeCradle, order.Modelo, order.Mano, order.Posicion);
            await _stateMachine.TriggerAsync(StationTrigger.RecipeEchoMismatch, $"Missing recipe for Cradle {activeCradle}", ct);
            return false;
        }

        _logger.LogInformation("RECIPE LOADED: Cradle '{Cradle}' determined Recipe_A={A}, Recipe_B={B} for Panel {Model}/{Hand}/{Pos}",
            recipe.Cradle_Code, recipe.Recipe_A, recipe.Recipe_B, order.Modelo, order.Mano, order.Posicion);

        await _stateMachine.TriggerAsync(StationTrigger.RecipeLoaded, recipe, ct);
        await _stateMachine.TriggerAsync(StationTrigger.RecipeSent, null, ct);

        // Handshake seguro con verificación de eco exacto
        var handshakeResult = await _handshakeCoordinator.ExecuteHandshakeAsync(recipe, TimeSpan.FromSeconds(5), ct);
        if (!handshakeResult.Success)
        {
            _logger.LogError("RECIPE NOK: Handshake failed: {Error}", handshakeResult.ErrorMessage);
            activeCycle.ErrorCode = "ERR_RECIPE_ECHO_MISMATCH";
            activeCycle.ErrorDescription = handshakeResult.ErrorMessage;
            _stateMachine.AttachActiveCycle(activeCycle);
            await _stateMachine.TriggerAsync(StationTrigger.RecipeEchoMismatch, handshakeResult.ErrorMessage, ct);
            await _traceability.UpdateCycleStateAsync(cycleId, c =>
            {
                c.ErrorCode = "ERR_RECIPE_ECHO_MISMATCH";
                c.ErrorDescription = handshakeResult.ErrorMessage;
            }, ct);
            return false;
        }

        activeCycle.Recipe_A = recipe.Recipe_A;
        activeCycle.Recipe_B = recipe.Recipe_B;
        activeCycle.PLCStartState = "RECIPE_CONFIRMED";
        _stateMachine.AttachActiveCycle(activeCycle);
        await _traceability.UpdateCycleStateAsync(cycleId, c =>
        {
            c.Recipe_A = recipe.Recipe_A;
            c.Recipe_B = recipe.Recipe_B;
            c.PLCStartState = "RECIPE_CONFIRMED";
        }, ct);
        await _stateMachine.TriggerAsync(StationTrigger.RecipeEchoVerified, null, ct);

        // ---------------------------------------------------------------------
        // PASO 6: PROCESO DEL ROBOT DE SOLDADURA
        // ---------------------------------------------------------------------
        await _stateMachine.TriggerAsync(StationTrigger.RobotStarted, null, ct);
        _logger.LogInformation("Welding Robot running sequence {Seq}...", order.Secuencia);

        // Esperar fin de ciclo del PLC (CYCLE_FINISHED / 3)
        bool finished = await _plcService.WaitForStateAsync(PLCLogicalState.CYCLE_FINISHED, TimeSpan.FromSeconds(15), ct);
        if (!finished)
        {
            _logger.LogError("ROBOT NOK: Timeout waiting for PLC CYCLE_FINISHED signal");
            activeCycle.RobotResult = "NOK";
            activeCycle.ErrorCode = "ERR_ROBOT_TIMEOUT";
            _stateMachine.AttachActiveCycle(activeCycle);
            await _stateMachine.TriggerAsync(StationTrigger.FaultOccurred, "Robot cycle timeout", ct);
            await _traceability.UpdateCycleStateAsync(cycleId, c =>
            {
                c.RobotResult = "NOK";
                c.ErrorCode = "ERR_ROBOT_TIMEOUT";
            }, ct);
            return false;
        }

        activeCycle.RobotResult = "OK";
        activeCycle.PLCFinalState = "CYCLE_FINISHED";
        _stateMachine.AttachActiveCycle(activeCycle);
        await _traceability.UpdateCycleStateAsync(cycleId, c =>
        {
            c.RobotResult = "OK";
            c.PLCFinalState = "CYCLE_FINISHED";
        }, ct);
        await _stateMachine.TriggerAsync(StationTrigger.RobotFinished, null, ct);

        // ---------------------------------------------------------------------
        // PASO 7: REGISTRO IDEMPOTENTE DEL RESULTADO DEFINITIVO EN Produccion_Secuencia
        // ---------------------------------------------------------------------
        bool commitOk = await _traceability.CommitStationResultAsync(cycleId, StationResultOutcome.OK, ct);
        if (!commitOk)
        {
            _logger.LogCritical("CRITICAL ERROR: Failed to commit station result for cycle {CycleId}", cycleId);
            await _stateMachine.TriggerAsync(StationTrigger.FaultOccurred, "Failed to commit station result to database", ct);
            return false;
        }

        activeCycle.StationResult = "OK";
        activeCycle.FechaFin = DateTime.UtcNow;
        _stateMachine.AttachActiveCycle(activeCycle);

        // Limpiar señales en PLC
        await _plcService.ClearSignalsAsync(ct);

        // ---------------------------------------------------------------------
        // PASO 8: AVANZAR PUNTERO DE ORDEN Y FINALIZAR CICLO
        // ---------------------------------------------------------------------
        await _stateMachine.TriggerAsync(StationTrigger.ResultSaved, null, ct);
        _logger.LogInformation("DL02 CYCLE COMPLETED SUCCESSFULLY for Sequence {Seq}! Station is ready for next panel.", order.Secuencia);

        // Pausa visible de 2.5s en CYCLE_COMPLETE para que el operador y el HMI vean todos los pasos aprobados en verde
        await Task.Delay(2500, ct);

        // Avanzar puntero al siguiente panel en la cola
        await _orderService.AdvanceStationPointerAsync(_stationCode, order.ID_OrdenProduccion + 1, ct);
        var nextOrder = await _orderService.GetCurrentOrderForStationAsync(_stationCode, ct);

        // Resetear ciclo para el siguiente panel
        await _stateMachine.TriggerAsync(StationTrigger.CycleReset, null, ct);
        _stateMachine.AttachActiveCycle(null);

        if (nextOrder != null)
        {
            await _stateMachine.TriggerAsync(StationTrigger.OrderDetected, nextOrder, ct);
            _logger.LogInformation("NEXT PANEL READY FOR INSPECTION: Sequence {Seq}, Variant {Model}/{Hand}/{Pos}",
                nextOrder.Secuencia, nextOrder.Modelo, nextOrder.Mano, nextOrder.Posicion);
        }

        return true;
    }
}
