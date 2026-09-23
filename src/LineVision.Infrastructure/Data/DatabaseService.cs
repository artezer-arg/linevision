using System.Data;
using System.Data.Common;
using Dapper;
using LineVision.Core.Domain.Interfaces;
using Microsoft.Data.SqlClient;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace LineVision.Infrastructure.Data;

public class DatabaseService : IDatabaseService
{
    private readonly string _connectionString;
    private readonly string _providerName; // "SqlServer" or "Sqlite"
    private readonly ILogger<DatabaseService> _logger;

    public DatabaseService(IConfiguration config, ILogger<DatabaseService> logger)
    {
        _logger = logger;
        _providerName = config["Database:Provider"] ?? "Sqlite";
        _connectionString = config.GetConnectionString("DefaultConnection") 
            ?? "Data Source=LineVision_DL02.db";
        
        SqlMapper.AddTypeHandler(new GuidTypeHandler());
        EnsureInitialized();
    }

    public IDbConnection CreateConnection()
    {
        if (string.Equals(_providerName, "SqlServer", StringComparison.OrdinalIgnoreCase))
        {
            return new SqlConnection(_connectionString);
        }
        else
        {
            return new SqliteConnection(_connectionString);
        }
    }

    public async Task<bool> TestConnectionAsync(CancellationToken ct = default)
    {
        try
        {
            using var conn = CreateConnection();
            if (conn is DbConnection dbConn)
            {
                await dbConn.OpenAsync(ct);
                return true;
            }
            conn.Open();
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error testing database connection ({Provider})", _providerName);
            return false;
        }
    }

    public async Task<T?> QuerySingleOrDefaultAsync<T>(string sql, object? param = null, CancellationToken ct = default)
    {
        using var conn = CreateConnection();
        return await conn.QuerySingleOrDefaultAsync<T>(new CommandDefinition(sql, param, cancellationToken: ct));
    }

    public async Task<IEnumerable<T>> QueryAsync<T>(string sql, object? param = null, CancellationToken ct = default)
    {
        using var conn = CreateConnection();
        return await conn.QueryAsync<T>(new CommandDefinition(sql, param, cancellationToken: ct));
    }

    public async Task<int> ExecuteAsync(string sql, object? param = null, CancellationToken ct = default)
    {
        using var conn = CreateConnection();
        return await conn.ExecuteAsync(new CommandDefinition(sql, param, cancellationToken: ct));
    }

    private void EnsureInitialized()
    {
        if (string.Equals(_providerName, "Sqlite", StringComparison.OrdinalIgnoreCase))
        {
            InitializeSqliteSchema();
        }
    }

    private void InitializeSqliteSchema()
    {
        try
        {
            using var conn = CreateConnection();
            conn.Open();

            // Create SQLite tables mirroring our SQL Server schema for seamless standalone operation
            string ddl = @"
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
                    UNIQUE(StationCode, Modelo, Mano, Posicion, Version)
                );

                CREATE TABLE IF NOT EXISTS CradleQR (
                    QR_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                    QR_Pattern TEXT NOT NULL UNIQUE,
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
                    Enabled INTEGER NOT NULL DEFAULT 1
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
                    Detail_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                    Version_ID INTEGER NOT NULL,
                    InspectionPoint_ID TEXT NOT NULL,
                    ExecutionOrder INTEGER NOT NULL DEFAULT 1,
                    IsRequiredOverride INTEGER
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
            ";

            conn.Execute(ddl);
            SeedSqliteData(conn);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize SQLite local database");
        }
    }

    private void SeedSqliteData(IDbConnection conn)
    {
        // Seed default station DL02 pointer if empty
        int stationCount = conn.ExecuteScalar<int>("SELECT COUNT(1) FROM Puesto WHERE Puesto = 'DL02'");
        if (stationCount == 0)
        {
            string now = DateTime.UtcNow.ToString("o");
            conn.Execute(@"
                INSERT INTO Puesto (Puesto, Puntero_ID_OrdenProduccion, Descripcion, Activo, UltimaActualizacion)
                VALUES ('DL02', 1001, 'Soldadura Panel Interno Puerta DL02', 1, @now);

                INSERT INTO OrdenProduccion (ID_OrdenProduccion, ID_OrdenCliente, ID_Secuencia, Secuencia, Modelo, Mano, Posicion, Orden, Estado, FechaCreacion)
                VALUES 
                (1001, 'CLI-2026-9901', 382, '0382', 'P1B', 'RH', 'FRONT', 1, 'EN_CURSO', @now),
                (1002, 'CLI-2026-9902', 383, '0383', 'P1B', 'LH', 'FRONT', 2, 'PENDIENTE', @now),
                (1003, 'CLI-2026-9903', 384, '0384', 'P1B', 'RH', 'REAR', 3, 'PENDIENTE', @now),
                (1004, 'CLI-2026-9904', 385, '0385', 'P1B', 'LH', 'REAR', 4, 'PENDIENTE', @now);

                INSERT INTO PLCConfiguration (PLC_ID, StationCode, Protocol, IPAddress, Port, PollingIntervalMs, TimeoutMs, MaxRetries, Active, TagRecipeA, TagRecipeB, TagRecipeReady, TagStationState, TagRecipeReceived, TagEchoRecipeA, TagEchoRecipeB)
                VALUES ('PLC_DL02', 'DL02', 'SIMULATOR', '192.168.1.50', 44818, 100, 2000, 3, 1, 'PC_To_PLC.Recipe_A', 'PC_To_PLC.Recipe_B', 'PC_To_PLC.RecipeReady', 'PLC_To_PC.State', 'PLC_To_PC.RecipeReceived', 'PLC_To_PC.EchoRecipe_A', 'PLC_To_PC.EchoRecipe_B');

                INSERT INTO PLCStateMapping (EstadoLogico, ValorPLC, Descripcion)
                VALUES 
                ('FREE', 0, 'PLC Libre / Esperando Pieza'),
                ('RECIPE_RECEIVED', 1, 'Receta Recibida y Confirmada'),
                ('ROBOT_PROCESSING', 2, 'Robot de Soldadura en Ejecución'),
                ('CYCLE_FINISHED', 3, 'Ciclo de Soldadura Completado OK'),
                ('ERROR', 4, 'Falla en Celda o Parada de Emergencia');

                INSERT INTO RobotRecipe (StationCode, Modelo, Mano, Posicion, Recipe_A, Recipe_B, Version, Activo, CreatedAt, UpdatedAt, UpdatedBy)
                VALUES 
                ('DL02', 'P1B', 'RH', 'FRONT', 12, 4, 1, 1, @now, @now, 'SYSTEM'),
                ('DL02', 'P1B', 'LH', 'FRONT', 13, 4, 1, 1, @now, @now, 'SYSTEM'),
                ('DL02', 'P1B', 'RH', 'REAR', 21, 7, 1, 1, @now, @now, 'SYSTEM'),
                ('DL02', 'P1B', 'LH', 'REAR', 22, 7, 1, 1, @now, @now, 'SYSTEM');

                INSERT INTO CradleQR (QR_Pattern, Modelo, Mano, Posicion, Variante, Activo, CreatedAt)
                VALUES 
                ('CUNA-P1B-RH-FRONT-01', 'P1B', 'RH', 'FRONT', 'STD', 1, @now),
                ('CUNA-P1B-LH-FRONT-01', 'P1B', 'LH', 'FRONT', 'STD', 1, @now),
                ('CUNA-P1B-RH-REAR-01', 'P1B', 'RH', 'REAR', 'STD', 1, @now),
                ('CUNA-P1B-LH-REAR-01', 'P1B', 'LH', 'REAR', 'STD', 1, @now);

                INSERT INTO Camera (CameraId, Name, StationCode, ProviderType, ConnectionUri, Exposure, Gain, Fps, IsColor, Active)
                VALUES 
                ('CAM_CRADLE', 'Cámara Cuna e Insertos', 'DL02', 'SIMULATOR', 'sim://cradle', 100, 0, 30, 1, 1),
                ('CAM_PANEL_01', 'Cámara Panel Superior', 'DL02', 'SIMULATOR', 'sim://panel_top', 120, 0, 30, 1, 1),
                ('CAM_PANEL_02', 'Cámara Panel Inferior', 'DL02', 'SIMULATOR', 'sim://panel_bottom', 120, 0, 30, 1, 1);

                INSERT INTO InspectionPoint (InspectionPoint_ID, Code, Name, Description, PieceType, CameraId, AlgorithmType, ExpectedValue, MinConfidence, IsRequired, ExecutionOrder)
                VALUES 
                ('IP_CRADLE_HAND', 'CRD_01', 'Mano de Cuna RH/LH', 'Verifica polaridad de cuna para mano derecha o izquierda', 'CRADLE', 'CAM_CRADLE', 'PRESENCE', 'PRESENT', 0.90, 1, 1),
                ('IP_CRADLE_POS', 'CRD_02', 'Posición Delantera/Trasera', 'Verifica insertos delanteros', 'CRADLE', 'CAM_CRADLE', 'PRESENCE', 'PRESENT', 0.90, 1, 2),
                ('IP_CRADLE_INSERT_A', 'CRD_03', 'Inserto Guía A', 'Presencia y asiento de inserto A de cuna', 'CRADLE', 'CAM_CRADLE', 'TEMPLATE_MATCH', 'MATCH', 0.85, 1, 3),
                ('IP_CRADLE_INSERT_B', 'CRD_04', 'Inserto Guía B', 'Presencia y asiento de inserto B de cuna', 'CRADLE', 'CAM_CRADLE', 'TEMPLATE_MATCH', 'MATCH', 0.85, 1, 4),
                ('IP_PANEL_01', 'PNL_01', 'Inserto Superior Izquierdo', 'Control de clip y seguro superior izquierdo', 'PANEL', 'CAM_PANEL_01', 'PRESENCE', 'PRESENT', 0.88, 1, 1),
                ('IP_PANEL_02', 'PNL_02', 'Inserto Superior Derecho', 'Control de inserción y acabado de clip derecho', 'PANEL', 'CAM_PANEL_01', 'TEMPLATE_MATCH', 'MATCH', 0.85, 1, 2),
                ('IP_PANEL_03', 'PNL_03', 'Clip Lateral Inferior', 'Control de posición y clip de terminación inferior', 'PANEL', 'CAM_PANEL_02', 'PRESENCE', 'PRESENT', 0.85, 1, 3);

                INSERT INTO InspectionROI (InspectionPoint_ID, Name, X, Y, Width, Height)
                VALUES 
                ('IP_CRADLE_HAND', 'ROI_Mano', 50, 50, 120, 100),
                ('IP_CRADLE_POS', 'ROI_Pos', 200, 50, 120, 100),
                ('IP_CRADLE_INSERT_A', 'ROI_InsA', 350, 80, 140, 120),
                ('IP_CRADLE_INSERT_B', 'ROI_InsB', 500, 80, 140, 120),
                ('IP_PANEL_01', 'ROI_Panel_TopLeft', 80, 70, 160, 140),
                ('IP_PANEL_02', 'ROI_Panel_TopRight', 420, 70, 160, 140),
                ('IP_PANEL_03', 'ROI_Panel_BottomClip', 250, 320, 180, 150);

                INSERT INTO InspectionPlan (Code, Name, PieceType, Modelo, Mano, Posicion, ActiveVersion, Enabled, CreatedAt)
                VALUES 
                ('PLAN_CRADLE_P1B_RH_FRONT', 'Plan Cuna P1B RH Delantera', 'CRADLE', 'P1B', 'RH', 'FRONT', 1, 1, @now),
                ('PLAN_PANEL_P1B_RH_FRONT', 'Plan Panel Puerta P1B RH Delantera', 'PANEL', 'P1B', 'RH', 'FRONT', 1, 1, @now),
                ('PLAN_CRADLE_P1B_LH_FRONT', 'Plan Cuna P1B LH Delantera', 'CRADLE', 'P1B', 'LH', 'FRONT', 1, 1, @now),
                ('PLAN_PANEL_P1B_LH_FRONT', 'Plan Panel Puerta P1B LH Delantera', 'PANEL', 'P1B', 'LH', 'FRONT', 1, 1, @now),
                ('PLAN_CRADLE_P1B_RH_REAR', 'Plan Cuna P1B RH Trasera', 'CRADLE', 'P1B', 'RH', 'REAR', 1, 1, @now),
                ('PLAN_PANEL_P1B_RH_REAR', 'Plan Panel Puerta P1B RH Trasera', 'PANEL', 'P1B', 'RH', 'REAR', 1, 1, @now),
                ('PLAN_CRADLE_P1B_LH_REAR', 'Plan Cuna P1B LH Trasera', 'CRADLE', 'P1B', 'LH', 'REAR', 1, 1, @now),
                ('PLAN_PANEL_P1B_LH_REAR', 'Plan Panel Puerta P1B LH Trasera', 'PANEL', 'P1B', 'LH', 'REAR', 1, 1, @now);

                INSERT INTO InspectionPlanVersion (Plan_ID, VersionNumber, IsLocked, CreatedDate, CreatedBy, ChangeNotes)
                VALUES 
                (1, 1, 1, @now, 'SYSTEM', 'Versión inicial cuna RH FRONT'),
                (2, 1, 1, @now, 'SYSTEM', 'Versión inicial panel RH FRONT'),
                (3, 1, 1, @now, 'SYSTEM', 'Versión inicial cuna LH FRONT'),
                (4, 1, 1, @now, 'SYSTEM', 'Versión inicial panel LH FRONT'),
                (5, 1, 1, @now, 'SYSTEM', 'Versión inicial cuna RH REAR'),
                (6, 1, 1, @now, 'SYSTEM', 'Versión inicial panel RH REAR'),
                (7, 1, 1, @now, 'SYSTEM', 'Versión inicial cuna LH REAR'),
                (8, 1, 1, @now, 'SYSTEM', 'Versión inicial panel LH REAR');

                INSERT INTO InspectionPlanDetail (Version_ID, InspectionPoint_ID, ExecutionOrder)
                VALUES 
                (1, 'IP_CRADLE_HAND', 1), (1, 'IP_CRADLE_POS', 2), (1, 'IP_CRADLE_INSERT_A', 3), (1, 'IP_CRADLE_INSERT_B', 4),
                (2, 'IP_PANEL_01', 1), (2, 'IP_PANEL_02', 2), (2, 'IP_PANEL_03', 3),
                (3, 'IP_CRADLE_HAND', 1), (3, 'IP_CRADLE_POS', 2), (3, 'IP_CRADLE_INSERT_A', 3), (3, 'IP_CRADLE_INSERT_B', 4),
                (4, 'IP_PANEL_01', 1), (4, 'IP_PANEL_02', 2), (4, 'IP_PANEL_03', 3),
                (5, 'IP_CRADLE_HAND', 1), (5, 'IP_CRADLE_POS', 2), (5, 'IP_CRADLE_INSERT_A', 3), (5, 'IP_CRADLE_INSERT_B', 4),
                (6, 'IP_PANEL_01', 1), (6, 'IP_PANEL_02', 2), (6, 'IP_PANEL_03', 3),
                (7, 'IP_CRADLE_HAND', 1), (7, 'IP_CRADLE_POS', 2), (7, 'IP_CRADLE_INSERT_A', 3), (7, 'IP_CRADLE_INSERT_B', 4),
                (8, 'IP_PANEL_01', 1), (8, 'IP_PANEL_02', 2), (8, 'IP_PANEL_03', 3);

                INSERT INTO User (Username, DisplayName, PasswordHash, RoleName)
                VALUES 
                ('admin', 'Administrador General', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'ADMIN'),
                ('operator', 'Operador Turno Mañana', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'OPERATOR'),
                ('engineer', 'Ingeniero de Calidad', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'ENGINEER'),
                ('maintenance', 'Técnico de Mantenimiento', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'MAINTENANCE');
            ", new { now });
        }
    }
}

public class GuidTypeHandler : SqlMapper.TypeHandler<Guid>
{
    public override void SetValue(IDbDataParameter parameter, Guid value) => parameter.Value = value.ToString();
    public override Guid Parse(object value) => Guid.Parse(value.ToString()!);
}

