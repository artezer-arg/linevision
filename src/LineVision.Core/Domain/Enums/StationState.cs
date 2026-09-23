namespace LineVision.Core.Domain.Enums;

/// <summary>
/// Máquina de Estados Finita Industrial para el Puesto DL02 (y estaciones homologadas).
/// Implementación con 22 estados estrictamente validados.
/// </summary>
public enum StationState
{
    WAITING_ORDER = 0,
    ORDER_LOADED = 1,
    CHECKING_CRADLE = 2,
    CRADLE_OK = 3,
    CHECKING_CRADLE_QR = 4,
    CRADLE_QR_OK = 5,
    LOADING_PANEL_INSPECTION_PLAN = 6,
    CHECKING_PANEL = 7,
    PANEL_OK = 8,
    WAITING_PLC = 9,
    PLC_READY = 10,
    LOADING_RECIPE = 11,
    SENDING_RECIPE = 12,
    WAITING_RECIPE_CONFIRMATION = 13,
    RECIPE_CONFIRMED = 14,
    ROBOT_RUNNING = 15,
    WAITING_ROBOT_FINISH = 16,
    SAVING_STATION_RESULT = 17,
    CYCLE_COMPLETE = 18,
    ERROR = 19,
    MAINTENANCE = 20,
    SIMULATION = 21
}

public enum StationTrigger
{
    OrderDetected,
    CradleCheckStarted,
    CradlePassed,
    CradleFailed,
    CradleQRRead,
    CradleQRMatched,
    CradleQRMismatched,
    PanelPlanLoaded,
    PanelCheckStarted,
    PanelPassed,
    PanelFailed,
    PLCPollReady,
    RecipeLoaded,
    RecipeSent,
    RecipeEchoVerified,
    RecipeEchoMismatch,
    RobotStarted,
    RobotFinished,
    ResultSaved,
    CycleReset,
    FaultOccurred,
    ClearFault,
    EnterMaintenance,
    ExitMaintenance
}
