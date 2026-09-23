namespace LineVision.Core.Domain.Enums;

public enum PLCLogicalState
{
    Unknown = -1,
    FREE = 0,
    RECIPE_RECEIVED = 1,
    ROBOT_PROCESSING = 2,
    CYCLE_FINISHED = 3,
    ERROR = 4
}

public enum InspectionResultStatus
{
    OK,
    NOK,
    WARNING,
    SKIPPED
}

public enum StationResultOutcome
{
    OK,
    NOK,
    ABORTED
}

public enum SystemLogLevel
{
    DEBUG,
    INFO,
    WARNING,
    ERROR,
    CRITICAL
}

public enum AlarmSeverity
{
    INFO,
    WARNING,
    CRITICAL
}
