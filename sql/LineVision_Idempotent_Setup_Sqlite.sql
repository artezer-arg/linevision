-- ============================================================================
-- LINEVISION INDUSTRIAL AUTOMATION - ESTACIÓN DL02
-- ESQUEMA COMPLETO IDEMPOTENTE PARA SQLITE
-- * No borra ni sobreescribe tablas o datos existentes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS AppConfiguration (
    [Key] TEXT PRIMARY KEY,
    Value TEXT NOT NULL,
    Description TEXT,
    Category TEXT NOT NULL DEFAULT 'SYSTEM',
    UpdatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Puesto (
    Puesto TEXT PRIMARY KEY,
    Puntero_ID_OrdenProduccion INTEGER,
    Descripcion TEXT NOT NULL,
    Activo INTEGER NOT NULL DEFAULT 1,
    UltimaActualizacion TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS OrdenProduccion (
    ID_OrdenProduccion INTEGER PRIMARY KEY,
    ID_OrdenCliente TEXT NOT NULL,
    ID_Secuencia INTEGER NOT NULL,
    Secuencia TEXT NOT NULL,
    Modelo TEXT NOT NULL,
    Mano TEXT NOT NULL,
    Posicion TEXT NOT NULL,
    Orden INTEGER NOT NULL,
    Estado TEXT NOT NULL DEFAULT 'PENDIENTE',
    FechaCreacion TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Produccion_Secuencia (
    ID_ProduccionSecuencia INTEGER PRIMARY KEY AUTOINCREMENT,
    ID_Secuencia INTEGER NOT NULL,
    ID_OrdenProduccion INTEGER NOT NULL,
    ID_OrdenCliente TEXT NOT NULL,
    Puesto TEXT NOT NULL,
    Fecha TEXT NOT NULL,
    Orden INTEGER NOT NULL,
    Resultado TEXT NOT NULL,
    UNIQUE(ID_Secuencia, Puesto)
);

CREATE TABLE IF NOT EXISTS Camera (
    CameraId TEXT PRIMARY KEY,
    Name TEXT NOT NULL,
    StationCode TEXT NOT NULL,
    ProviderType TEXT NOT NULL,
    ConnectionUri TEXT NOT NULL,
    Exposure INTEGER NOT NULL DEFAULT 100,
    Gain INTEGER NOT NULL DEFAULT 0,
    Fps INTEGER NOT NULL DEFAULT 30,
    IsColor INTEGER NOT NULL DEFAULT 1,
    Active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS PLCConfiguration (
    PLC_ID TEXT PRIMARY KEY,
    StationCode TEXT NOT NULL,
    Protocol TEXT NOT NULL,
    IPAddress TEXT NOT NULL,
    Port INTEGER NOT NULL,
    PollingIntervalMs INTEGER NOT NULL,
    TimeoutMs INTEGER NOT NULL,
    MaxRetries INTEGER NOT NULL,
    Active INTEGER NOT NULL DEFAULT 1,
    TagRecipeA TEXT NOT NULL,
    TagRecipeB TEXT NOT NULL,
    TagRecipeReady TEXT NOT NULL,
    TagStationState TEXT NOT NULL,
    TagRecipeReceived TEXT NOT NULL,
    TagEchoRecipeA TEXT NOT NULL,
    TagEchoRecipeB TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS PLCStateMapping (
    Mapping_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    EstadoLogico TEXT NOT NULL,
    ValorPLC INTEGER NOT NULL UNIQUE,
    Descripcion TEXT NOT NULL,
    Activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS RobotRecipe (
    Recipe_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    StationCode TEXT NOT NULL,
    Cradle_Code TEXT NOT NULL DEFAULT 'CUNA-01',
    Modelo TEXT NOT NULL,
    Mano TEXT NOT NULL,
    Posicion TEXT NOT NULL,
    Recipe_A INTEGER NOT NULL,
    Recipe_B INTEGER NOT NULL,
    Version INTEGER NOT NULL DEFAULT 1,
    Activo INTEGER NOT NULL DEFAULT 1,
    CreatedAt TEXT NOT NULL,
    UpdatedAt TEXT NOT NULL,
    UpdatedBy TEXT NOT NULL,
    UNIQUE(StationCode, Cradle_Code, Modelo, Mano, Posicion, Version)
);

CREATE TABLE IF NOT EXISTS CradleQR (
    QR_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    Cradle_Code TEXT NOT NULL DEFAULT 'CUNA-01',
    QR_Pattern TEXT NOT NULL,
    Modelo TEXT NOT NULL,
    Mano TEXT NOT NULL,
    Posicion TEXT NOT NULL,
    Variante TEXT,
    Activo INTEGER NOT NULL DEFAULT 1,
    CreatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS InspectionPoint (
    InspectionPoint_ID TEXT PRIMARY KEY,
    Code TEXT NOT NULL UNIQUE,
    Name TEXT NOT NULL,
    Description TEXT,
    PieceType TEXT NOT NULL,
    CameraId TEXT NOT NULL,
    AlgorithmType TEXT NOT NULL,
    ExpectedValue TEXT NOT NULL,
    Tolerance REAL NOT NULL DEFAULT 0.0,
    MinConfidence REAL NOT NULL DEFAULT 0.85,
    IsRequired INTEGER NOT NULL DEFAULT 1,
    ExecutionOrder INTEGER NOT NULL DEFAULT 1,
    TimeoutMs INTEGER NOT NULL DEFAULT 1500,
    Enabled INTEGER NOT NULL DEFAULT 1,
    CreatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS InspectionROI (
    ROI_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    InspectionPoint_ID TEXT NOT NULL,
    Name TEXT NOT NULL,
    X INTEGER NOT NULL,
    Y INTEGER NOT NULL,
    Width INTEGER NOT NULL,
    Height INTEGER NOT NULL,
    ShapeType TEXT NOT NULL DEFAULT 'RECTANGLE',
    ReferenceImagePath TEXT,
    ParametersJson TEXT
);

CREATE TABLE IF NOT EXISTS InspectionPlan (
    Plan_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    Code TEXT NOT NULL UNIQUE,
    Name TEXT NOT NULL,
    PieceType TEXT NOT NULL,
    Modelo TEXT NOT NULL,
    Mano TEXT NOT NULL,
    Posicion TEXT NOT NULL,
    ActiveVersion INTEGER NOT NULL DEFAULT 1,
    Enabled INTEGER NOT NULL DEFAULT 1,
    CreatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS InspectionPlanVersion (
    Version_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    Plan_ID INTEGER NOT NULL,
    VersionNumber INTEGER NOT NULL,
    IsLocked INTEGER NOT NULL DEFAULT 0,
    CreatedDate TEXT NOT NULL,
    CreatedBy TEXT NOT NULL,
    ChangeNotes TEXT,
    UNIQUE(Plan_ID, VersionNumber)
);

CREATE TABLE IF NOT EXISTS InspectionPlanDetail (
    PlanDetail_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    Version_ID INTEGER NOT NULL,
    InspectionPoint_ID TEXT NOT NULL,
    ExecutionOrder INTEGER NOT NULL,
    UNIQUE(Version_ID, InspectionPoint_ID)
);

CREATE TABLE IF NOT EXISTS ProductionCycle (
    Cycle_ID TEXT PRIMARY KEY,
    ID_Secuencia INTEGER NOT NULL,
    ID_OrdenProduccion INTEGER NOT NULL,
    ID_OrdenCliente TEXT NOT NULL,
    Secuencia TEXT NOT NULL,
    Modelo TEXT NOT NULL,
    Mano TEXT NOT NULL,
    Posicion TEXT NOT NULL,
    Puesto TEXT NOT NULL,
    FechaInicio TEXT NOT NULL,
    FechaFin TEXT,
    QR_Cuna TEXT,
    Cradle_Code TEXT,
    CradleResult TEXT,
    PanelResult TEXT,
    InspectionPlan TEXT,
    InspectionPlanVersion INTEGER,
    Recipe_A INTEGER,
    Recipe_B INTEGER,
    PLCStartState TEXT,
    PLCFinalState TEXT,
    RobotResult TEXT,
    StationResult TEXT,
    Usuario TEXT NOT NULL,
    ErrorCode TEXT,
    ErrorDescription TEXT,
    CycleTimeMs INTEGER,
    VisionTimeMs INTEGER,
    PLCTimeMs INTEGER,
    DBTimeMs INTEGER
);

CREATE TABLE IF NOT EXISTS InspectionResult (
    InspectionResult_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    Cycle_ID TEXT NOT NULL,
    InspectionPoint_ID TEXT NOT NULL,
    InspectionPlan_ID INTEGER,
    InspectionPlanVersion INTEGER,
    ExpectedValue TEXT NOT NULL,
    DetectedValue TEXT NOT NULL,
    Confidence REAL NOT NULL,
    Result TEXT NOT NULL,
    ImagePath TEXT,
    ROIImagePath TEXT,
    ProcessingTimeMs INTEGER NOT NULL DEFAULT 0,
    Timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS SystemLog (
    Log_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    Timestamp TEXT NOT NULL,
    Level TEXT NOT NULL,
    Module TEXT NOT NULL,
    Message TEXT NOT NULL,
    Cycle_ID TEXT,
    Sequence TEXT,
    User TEXT NOT NULL,
    ExceptionDetails TEXT
);

CREATE TABLE IF NOT EXISTS Alarm (
    Alarm_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    Code TEXT NOT NULL,
    Description TEXT NOT NULL,
    Severity TEXT NOT NULL,
    StationCode TEXT NOT NULL,
    TriggeredAt TEXT NOT NULL,
    AcknowledgedAt TEXT,
    ResolvedAt TEXT,
    AcknowledgedBy TEXT,
    IsActive INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS BypassLog (
    Bypass_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    User TEXT NOT NULL,
    Timestamp TEXT NOT NULL,
    PriorState TEXT NOT NULL,
    TargetState TEXT NOT NULL,
    Reason TEXT NOT NULL,
    Piece TEXT,
    Sequence TEXT,
    Cycle_ID TEXT
);

CREATE TABLE IF NOT EXISTS User (
    User_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    Username TEXT NOT NULL UNIQUE,
    DisplayName TEXT NOT NULL,
    PasswordHash TEXT NOT NULL,
    RoleName TEXT NOT NULL DEFAULT 'OPERATOR',
    BadgeNumber TEXT,
    Active INTEGER NOT NULL DEFAULT 1
);
