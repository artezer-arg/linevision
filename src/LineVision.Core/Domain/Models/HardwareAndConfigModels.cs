using LineVision.Core.Domain.Enums;

namespace LineVision.Core.Domain.Models;

public class RobotRecipe
{
    public int Recipe_ID { get; set; }
    public string StationCode { get; set; } = "DL02";
    public string Cradle_Code { get; set; } = "CUNA-01";
    public string Modelo { get; set; } = string.Empty;
    public string Mano { get; set; } = string.Empty;
    public string Posicion { get; set; } = string.Empty;
    public int Recipe_A { get; set; }
    public int Recipe_B { get; set; }
    public int Version { get; set; } = 1;
    public bool Activo { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string UpdatedBy { get; set; } = "SYSTEM";
}

public class CradleQRMapping
{
    public int QR_ID { get; set; }
    public string Cradle_Code { get; set; } = "CUNA-01";
    public string QR_Pattern { get; set; } = string.Empty;
    public string Modelo { get; set; } = string.Empty;
    public string Mano { get; set; } = string.Empty;
    public string Posicion { get; set; } = string.Empty;
    public string? Variante { get; set; }
    public bool Activo { get; set; } = true;
}

public class CradleQRConfig
{
    public string Prefix { get; set; } = "CUNA-";
    public int? ExpectedLength { get; set; }
    public string RegexPattern { get; set; } = @"^CUNA-(?<model>[A-Z0-9]+)-(?<hand>RH|LH)-(?<pos>FRONT|REAR)-(?<id>\d+)$";
    public string Delimiter { get; set; } = "-";
    public bool RequireExactMatchInDatabase { get; set; } = true;
}

public class CameraConfig
{
    public string CameraId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string StationCode { get; set; } = "DL02";
    public string ProviderType { get; set; } = "SIMULATOR"; // "SIMULATOR", "OPENCV_USB", "RTSP", "GIGE"
    public string ConnectionUri { get; set; } = string.Empty;
    public int Exposure { get; set; } = 100;
    public int Gain { get; set; } = 0;
    public int Fps { get; set; } = 30;
    public bool IsColor { get; set; } = true;
    public bool Active { get; set; } = true;
}

public class DiscoveredCameraDevice
{
    public int DeviceIndex { get; set; }
    public string Name { get; set; } = string.Empty;
    public string DeviceId { get; set; } = string.Empty;
    public bool IsAvailable { get; set; }
    public string Type { get; set; } = "PHYSICAL"; // "PHYSICAL", "SIMULATOR", "VIRTUAL"
}

public class CameraFrame
{
    public string CameraId { get; set; } = string.Empty;
    public int Width { get; set; }
    public int Height { get; set; }
    public int Channels { get; set; }
    public byte[] Data { get; set; } = Array.Empty<byte>();
    public string? Base64Jpeg { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

public class PLCConfiguration
{
    public string PLC_ID { get; set; } = "PLC_DL02";
    public string StationCode { get; set; } = "DL02";
    public string Protocol { get; set; } = "SIMULATOR"; // "SIMULATOR", "ETHERNET_IP", "MODBUS_TCP", "OPC_UA"
    public string IPAddress { get; set; } = "192.168.1.50";
    public int Port { get; set; } = 44818;
    public int PollingIntervalMs { get; set; } = 100;
    public int TimeoutMs { get; set; } = 2000;
    public int MaxRetries { get; set; } = 3;
    public bool Active { get; set; } = true;

    // Parametric Tag Names
    public string TagRecipeA { get; set; } = "PC_To_PLC.Recipe_A";
    public string TagRecipeB { get; set; } = "PC_To_PLC.Recipe_B";
    public string TagRecipeReady { get; set; } = "PC_To_PLC.RecipeReady";
    public string TagStationState { get; set; } = "PLC_To_PC.State";
    public string TagRecipeReceived { get; set; } = "PLC_To_PC.RecipeReceived";
    public string TagEchoRecipeA { get; set; } = "PLC_To_PC.EchoRecipe_A";
    public string TagEchoRecipeB { get; set; } = "PLC_To_PC.EchoRecipe_B";
}

public class PLCStateMapping
{
    public int Mapping_ID { get; set; }
    public string EstadoLogico { get; set; } = "FREE";
    public int ValorPLC { get; set; }
    public string Descripcion { get; set; } = string.Empty;
    public bool Activo { get; set; } = true;
}

public class PLCStateInfo
{
    public int RawValue { get; set; }
    public PLCLogicalState LogicalState { get; set; } = PLCLogicalState.Unknown;
    public string StateDescription { get; set; } = string.Empty;
    public bool RecipeReceived { get; set; }
    public int EchoRecipeA { get; set; }
    public int EchoRecipeB { get; set; }
    public bool IsConnected { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

public class SystemLogEntry
{
    public long Log_ID { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public SystemLogLevel Level { get; set; } = SystemLogLevel.INFO;
    public string Module { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public Guid? Cycle_ID { get; set; }
    public string? Sequence { get; set; }
    public string User { get; set; } = "SYSTEM";
    public string? ExceptionDetails { get; set; }
}

public class IndustrialAlarm
{
    public int Alarm_ID { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public AlarmSeverity Severity { get; set; } = AlarmSeverity.WARNING;
    public string StationCode { get; set; } = "DL02";
    public DateTime TriggeredAt { get; set; } = DateTime.UtcNow;
    public DateTime? AcknowledgedAt { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public string? AcknowledgedBy { get; set; }
    public bool IsActive { get; set; } = true;
}

public class BypassRecord
{
    public int Bypass_ID { get; set; }
    public string User { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public StationState PriorState { get; set; }
    public StationState TargetState { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string? Piece { get; set; }
    public string? Sequence { get; set; }
    public Guid? Cycle_ID { get; set; }
}

public class User
{
    public int User_ID { get; set; }
    public string Username { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public int Role_ID { get; set; }
    public string RoleName { get; set; } = "OPERATOR";
    public string? BadgeNumber { get; set; }
    public bool Active { get; set; } = true;
}

public class Role
{
    public int Role_ID { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
}

public class TelnetGatewayConfig
{
    public string Host { get; set; } = "127.0.0.1";
    public int Port { get; set; } = 12345;
    public int TimeoutMs { get; set; } = 3000;
    public string CommandTemplate { get; set; } = "RECIPE:{recipeA},{recipeB}";
    public string LineTerminator { get; set; } = "CRLF"; // "CRLF", "LF", "CR", "NONE"
    public bool WaitForResponse { get; set; } = true;
    public string ExpectedResponsePattern { get; set; } = "OK|ACK|RECIPE";
    public bool MockServerEnabled { get; set; } = false;
    public bool Active { get; set; } = true;
}

public class TelnetSendResult
{
    public bool Success { get; set; }
    public string SentPayload { get; set; } = string.Empty;
    public string? ReceivedResponse { get; set; }
    public int DurationMs { get; set; }
    public string Message { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

public class TelnetLogEntry
{
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string Direction { get; set; } = "SEND"; // "SEND", "RECV", "INFO", "ERROR"
    public string Content { get; set; } = string.Empty;
}

public class StationWorkflowConfig
{
    /// <summary>
    /// Modo de operación: "DIRECT_5_STEP" o "LEGACY_ROBOT_HANDSHAKE"
    /// </summary>
    public string WorkflowMode { get; set; } = "DIRECT_5_STEP";

    /// <summary>
    /// IP del PLC Siemens
    /// </summary>
    public string PlcIpAddress { get; set; } = "192.168.1.50";

    /// <summary>
    /// Rack de la CPU Siemens (default 0)
    /// </summary>
    public short PlcRack { get; set; } = 0;

    /// <summary>
    /// Slot de la CPU Siemens (default 1 para S7-1500)
    /// </summary>
    public short PlcSlot { get; set; } = 1;

    /// <summary>
    /// Dirección del bloque de datos y offset para la receta (ej. DB48.DBW2)
    /// </summary>
    public string RecipeAddress { get; set; } = "DB48.DBW2";

    /// <summary>
    /// Dirección del bloque de datos y offset para el handshake de receta (ej. DB48.DBW6)
    /// </summary>
    public string HandshakeAddress { get; set; } = "DB48.DBW6";

    /// <summary>
    /// Valor con el que el PLC solicita el envío de receta en Offset 6 (default 20)
    /// </summary>
    public short HandshakeReqValue { get; set; } = 20;

    /// <summary>
    /// Valor con el que el PLC confirma haber recibido y aplicado la receta en Offset 6 (default 10)
    /// </summary>
    public short HandshakeAckValue { get; set; } = 10;

    /// <summary>
    /// Valor de reposo enviado a RecipeAddress (DB48.DBW2) una vez confirmado el 10, hasta la próxima receta (default 24)
    /// </summary>
    public short HandshakeIdleValue { get; set; } = 24;

    /// <summary>
    /// Activa el protocolo de Handshake 20 -> Receta -> 10 -> 24 en DB48
    /// </summary>
    public bool EnableRecipeHandshake { get; set; } = true;

    /// <summary>
    /// Dirección del bloque de datos y bit para la confirmación (ej. DB48.DBX4.0)
    /// </summary>
    public string ConfirmationAddress { get; set; } = "DB48.DBX4.0";

    /// <summary>
    /// Habilita o deshabilita el envío del booleano de confirmación en el Paso 4.a
    /// </summary>
    public bool SendConfirmation { get; set; } = true;

    /// <summary>
    /// Momento de envío de la receta al PLC Siemens (DB48.DBW2):
    /// "AFTER_ORDER_DETECTED": Inmediatamente después de constatar modelo, mano y posición (Paso 2 directo).
    /// "AFTER_CRADLE_OK": Luego de validar que la cuna esté OK.
    /// </summary>
    public string RecipeTiming { get; set; } = "AFTER_ORDER_DETECTED";

    /// <summary>
    /// Valor del booleano de confirmación enviado en caso de OK (default true)
    /// </summary>
    public bool ConfirmationValue { get; set; } = true;

    /// <summary>
    /// Intervalo en milisegundos para reintentar la inspección cuando da NG (Paso 2.b y 4.b)
    /// </summary>
    public int RetryIntervalMs { get; set; } = 1000;

    /// <summary>
    /// Tiempo de visualización de resultado en verde antes de avanzar al siguiente panel (ms)
    /// </summary>
    public int DisplayDelayMs { get; set; } = 2000;

    /// <summary>
    /// Avanzar automáticamente al siguiente panel al completar con éxito
    /// </summary>
    public bool AutoAdvanceOnSuccess { get; set; } = true;

    /// <summary>
    /// Permite saltar validación QR de cuna si no hay código configurado
    /// </summary>
    public bool RequireCradleQrMatch { get; set; } = false;
}

public class PLCLiveTelemetry
{
    public bool IsConnected { get; set; }
    public string Protocol { get; set; } = "SIEMENS_S7";
    public string IPAddress { get; set; } = "192.168.1.50";
    public int Port { get; set; } = 102;
    public int Offset6_Value { get; set; } = 20;
    public string Offset6_Address { get; set; } = "DB48.DBW6";
    public string Offset6_Status { get; set; } = "REQ (20)";
    public int Offset2_Recipe { get; set; } = 19;
    public string Offset2_Address { get; set; } = "DB48.DBW2";
    public bool Offset4_Confirmation { get; set; } = true;
    public string Offset4_Address { get; set; } = "DB48.DBX4.0";
    public string HandshakeStage { get; set; } = "IDLE";
    public double LatencyMs { get; set; } = 0;
    public DateTime LastReadTimestamp { get; set; } = DateTime.UtcNow;
}

