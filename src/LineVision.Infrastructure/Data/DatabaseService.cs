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
    private volatile string _connectionString;
    private volatile string _providerName; // "SqlServer" or "Sqlite"
    private readonly ILogger<DatabaseService> _logger;
    private readonly IConfiguration _config;
    private readonly object _lock = new();

    public string CurrentProvider => _providerName;
    public string CurrentConnectionString => _connectionString;

    public DatabaseService(IConfiguration config, ILogger<DatabaseService> logger)
    {
        _logger = logger;
        _config = config;
        _providerName = config["Database:Provider"] ?? "Sqlite";
        _connectionString = config.GetConnectionString("DefaultConnection") 
            ?? "Data Source=LineVision_DL02.db";
        
        LoadPersistedConfig();

        SqlMapper.AddTypeHandler(new GuidTypeHandler());
        EnsureInitialized();
    }

    private void LoadPersistedConfig()
    {
        try
        {
            var configPath = GetConfigFilePath();
            if (File.Exists(configPath))
            {
                var json = File.ReadAllText(configPath);
                var saved = System.Text.Json.JsonSerializer.Deserialize<DatabaseConnectionConfig>(json);
                if (saved != null && !string.IsNullOrWhiteSpace(saved.Provider) && !string.IsNullOrWhiteSpace(saved.ConnectionString))
                {
                    _providerName = saved.Provider;
                    _connectionString = saved.ConnectionString;
                    _logger.LogInformation("Loaded persisted database config: Provider={Provider}, ConnectionString={ConnStr}",
                        _providerName, MaskConnectionString(_connectionString));
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not load persisted database config");
        }
    }

    private static string GetConfigFilePath()
    {
        return Path.Combine(AppContext.BaseDirectory, "db_connection_config.json");
    }

    public static string MaskConnectionString(string connStr)
    {
        if (string.IsNullOrEmpty(connStr)) return string.Empty;
        return System.Text.RegularExpressions.Regex.Replace(connStr, "(Password|pwd)=[^;]+", "$1=••••••••", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    }

    public IDbConnection CreateConnection()
    {
        return CreateConnection(_providerName, _connectionString);
    }

    public IDbConnection CreateConnection(string provider, string connectionString)
    {
        if (string.Equals(provider, "SqlServer", StringComparison.OrdinalIgnoreCase))
        {
            return new SqlConnection(connectionString);
        }
        else
        {
            return new SqliteConnection(connectionString);
        }
    }

    public DatabaseConnectionConfig GetConfiguration()
    {
        var cfg = new DatabaseConnectionConfig
        {
            Provider = _providerName,
            ConnectionString = _connectionString
        };

        try
        {
            if (string.Equals(_providerName, "SqlServer", StringComparison.OrdinalIgnoreCase))
            {
                var builder = new SqlConnectionStringBuilder(_connectionString);
                var parts = builder.DataSource.Split(',');
                cfg.Server = parts[0];
                cfg.Port = parts.Length > 1 && int.TryParse(parts[1], out int p) ? p : 1433;
                cfg.DatabaseName = builder.InitialCatalog;
                cfg.IntegratedSecurity = builder.IntegratedSecurity;
                cfg.Username = builder.UserID;
                cfg.Password = string.IsNullOrEmpty(builder.Password) ? string.Empty : "••••••••";
                cfg.TrustServerCertificate = builder.TrustServerCertificate;
                cfg.ConnectionTimeout = builder.ConnectTimeout;
            }
            else
            {
                var builder = new SqliteConnectionStringBuilder(_connectionString);
                cfg.DatabaseName = builder.DataSource;
                cfg.Server = "Local File";
            }
        }
        catch
        {
            // raw ConnectionString is preserved
        }

        return cfg;
    }

    public static string BuildConnectionString(DatabaseConnectionConfig config)
    {
        if (string.Equals(config.Provider, "SqlServer", StringComparison.OrdinalIgnoreCase))
        {
            if (!string.IsNullOrWhiteSpace(config.Server) && !string.IsNullOrWhiteSpace(config.DatabaseName))
            {
                var builder = new SqlConnectionStringBuilder();
                builder.DataSource = config.Port > 0 && config.Port != 1433
                    ? $"{config.Server},{config.Port}"
                    : config.Server;
                builder.InitialCatalog = config.DatabaseName;
                builder.IntegratedSecurity = config.IntegratedSecurity;
                if (!config.IntegratedSecurity)
                {
                    builder.UserID = config.Username ?? "sa";
                    builder.Password = config.Password ?? string.Empty;
                }
                builder.TrustServerCertificate = config.TrustServerCertificate;
                builder.ConnectTimeout = config.ConnectionTimeout > 0 ? config.ConnectionTimeout : 15;
                return builder.ConnectionString;
            }
            return string.IsNullOrWhiteSpace(config.ConnectionString) 
                ? "Server=localhost;Database=LineVision_DL02;Integrated Security=true;TrustServerCertificate=true;"
                : config.ConnectionString;
        }
        else
        {
            if (!string.IsNullOrWhiteSpace(config.DatabaseName) && !config.DatabaseName.StartsWith("Data Source="))
            {
                return $"Data Source={config.DatabaseName}";
            }
            return string.IsNullOrWhiteSpace(config.ConnectionString)
                ? "Data Source=LineVision_DL02.db"
                : config.ConnectionString;
        }
    }

    public async Task<bool> UpdateConfigurationAsync(DatabaseConnectionConfig config, CancellationToken ct = default)
    {
        if (config == null) throw new ArgumentNullException(nameof(config));

        string targetProvider = string.Equals(config.Provider, "SqlServer", StringComparison.OrdinalIgnoreCase)
            ? "SqlServer"
            : "Sqlite";
        
        string targetConnStr = BuildConnectionString(config);

        // Verify connection before applying
        var test = await TestConnectionAsync(new DatabaseConnectionConfig
        {
            Provider = targetProvider,
            ConnectionString = targetConnStr
        }, ct);

        if (!test.Success)
        {
            _logger.LogError("Cannot apply database config. Test failed: {Msg}", test.Message);
            return false;
        }

        lock (_lock)
        {
            _providerName = targetProvider;
            _connectionString = targetConnStr;
        }

        // Persist to json
        try
        {
            var savedConfig = new DatabaseConnectionConfig
            {
                Provider = targetProvider,
                ConnectionString = targetConnStr,
                Server = config.Server,
                Port = config.Port,
                DatabaseName = config.DatabaseName,
                Username = config.Username,
                Password = config.Password,
                IntegratedSecurity = config.IntegratedSecurity,
                TrustServerCertificate = config.TrustServerCertificate,
                ConnectionTimeout = config.ConnectionTimeout
            };
            var json = System.Text.Json.JsonSerializer.Serialize(savedConfig, new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(GetConfigFilePath(), json);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to persist database config file");
        }

        _logger.LogInformation("Database connection updated successfully to {Provider} ({Conn})", targetProvider, MaskConnectionString(targetConnStr));

        // Safely verify or initialize tables on the new database without deleting anything
        await InitializeOrUpdateSchemaAsync(seedDataIfEmpty: true, ct);

        return true;
    }

    public async Task<DatabaseTestResult> TestConnectionAsync(DatabaseConnectionConfig? config = null, CancellationToken ct = default)
    {
        var targetProvider = config?.Provider ?? _providerName;
        var targetConnStr = config != null ? BuildConnectionString(config) : _connectionString;
        var sw = System.Diagnostics.Stopwatch.StartNew();

        try
        {
            using var conn = CreateConnection(targetProvider, targetConnStr);
            if (conn is DbConnection dbConn)
            {
                await dbConn.OpenAsync(ct);
            }
            else
            {
                conn.Open();
            }

            string version = "Unknown";
            var tables = new List<string>();

            if (string.Equals(targetProvider, "SqlServer", StringComparison.OrdinalIgnoreCase))
            {
                version = await conn.ExecuteScalarAsync<string>(new CommandDefinition("SELECT @@VERSION", cancellationToken: ct)) ?? "Microsoft SQL Server";
                var t = await conn.QueryAsync<string>(
                    new CommandDefinition("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME", cancellationToken: ct));
                tables.AddRange(t);
            }
            else
            {
                version = await conn.ExecuteScalarAsync<string>(new CommandDefinition("SELECT sqlite_version()", cancellationToken: ct)) ?? "SQLite";
                version = "SQLite v" + version;
                var t = await conn.QueryAsync<string>(
                    new CommandDefinition("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name", cancellationToken: ct));
                tables.AddRange(t);
            }

            sw.Stop();
            return new DatabaseTestResult
            {
                Success = true,
                Message = $"Conexión exitosa a {targetProvider}. ({tables.Count} tablas encontradas)",
                Provider = targetProvider,
                DatabaseVersion = version.Split('\n')[0].Trim(),
                ResponseTimeMs = sw.ElapsedMilliseconds,
                ExistingTables = tables
            };
        }
        catch (Exception ex)
        {
            sw.Stop();
            return new DatabaseTestResult
            {
                Success = false,
                Message = $"Fallo de conexión a {targetProvider}: {ex.Message}",
                Provider = targetProvider,
                ResponseTimeMs = sw.ElapsedMilliseconds,
                ExistingTables = new List<string>()
            };
        }
    }

    public async Task<IReadOnlyList<DatabaseTableInfo>> GetTablesAsync(CancellationToken ct = default)
    {
        var result = new List<DatabaseTableInfo>();
        try
        {
            using var conn = CreateConnection();
            if (conn is DbConnection dbConn) await dbConn.OpenAsync(ct);
            else conn.Open();

            if (string.Equals(_providerName, "SqlServer", StringComparison.OrdinalIgnoreCase))
            {
                var rows = await conn.QueryAsync<dynamic>(new CommandDefinition(@"
                    SELECT t.name AS TableName, SUM(p.rows) AS [RowCount]
                    FROM sys.tables t
                    LEFT JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0,1)
                    GROUP BY t.name
                    ORDER BY t.name", cancellationToken: ct));

                foreach (var r in rows)
                {
                    result.Add(new DatabaseTableInfo
                    {
                        TableName = (string)r.TableName,
                        RowCount = Convert.ToInt64(r.RowCount ?? 0),
                        Exists = true
                    });
                }
            }
            else
            {
                var tables = (await conn.QueryAsync<string>(
                    new CommandDefinition("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name", cancellationToken: ct))).ToList();

                foreach (var tbl in tables)
                {
                    long count = 0;
                    try {
                        count = await conn.ExecuteScalarAsync<long>(new CommandDefinition($"SELECT COUNT(1) FROM [{tbl}]", cancellationToken: ct));
                    } catch { }
                    result.Add(new DatabaseTableInfo
                    {
                        TableName = tbl,
                        RowCount = count,
                        Exists = true
                    });
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting database tables list");
        }
        return result;
    }

    public async Task<DatabaseMigrationResult> InitializeOrUpdateSchemaAsync(bool seedDataIfEmpty = true, CancellationToken ct = default)
    {
        var result = new DatabaseMigrationResult();
        try
        {
            using var conn = CreateConnection();
            if (conn is DbConnection dbConn) await dbConn.OpenAsync(ct);
            else conn.Open();

            if (string.Equals(_providerName, "SqlServer", StringComparison.OrdinalIgnoreCase))
            {
                string script = GenerateIdempotentSqlScript("SqlServer");
                // Execute in batches by splitting GO or executing commands
                var commands = script.Split(new[] { "\nGO\r\n", "\nGO\n", "\r\nGO\r\n", "\r\nGO\n" }, StringSplitOptions.RemoveEmptyEntries);
                foreach (var cmd in commands)
                {
                    if (string.IsNullOrWhiteSpace(cmd)) continue;
                    try
                    {
                        await conn.ExecuteAsync(new CommandDefinition(cmd, cancellationToken: ct));
                    }
                    catch (Exception ex)
                    {
                        result.Warnings.Add($"Batch warning: {ex.Message}");
                    }
                }
                result.Success = true;
                result.Message = "Esquema de SQL Server verificado e inicializado en modo idempotente. Ningún dato fue borrado.";
            }
            else
            {
                InitializeSqliteSchema();
                result.Success = true;
                result.Message = "Esquema SQLite verificado e inicializado en modo seguro. Ningún dato fue borrado.";
            }

            var tables = await GetTablesAsync(ct);
            result.TablesCreatedOrVerified = tables.Select(t => $"{t.TableName} ({t.RowCount} filas)").ToList();
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Message = $"Error durante la verificación/migración de base de datos: {ex.Message}";
            _logger.LogError(ex, "Database schema migration failed");
        }
        return result;
    }

    public string GenerateIdempotentSqlScript(string targetProvider = "SqlServer")
    {
        string fileName = string.Equals(targetProvider, "Sqlite", StringComparison.OrdinalIgnoreCase)
            ? "LineVision_Idempotent_Setup_Sqlite.sql"
            : "LineVision_Idempotent_Setup_SqlServer.sql";

        // Try local sql/ directory first
        var candidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "sql", fileName),
            Path.Combine(Directory.GetCurrentDirectory(), "sql", fileName),
            Path.Combine(Directory.GetCurrentDirectory(), "..", "sql", fileName),
            Path.Combine(Directory.GetCurrentDirectory(), "..", "..", "sql", fileName)
        };

        foreach (var path in candidates)
        {
            if (File.Exists(path))
            {
                return File.ReadAllText(path);
            }
        }

        return $"-- File {fileName} not found on disk. Run generator script.";
    }

    public async Task<bool> TestConnectionAsync(CancellationToken ct = default)
    {
        var test = await TestConnectionAsync(null, ct);
        return test.Success;
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
            ";

            conn.Execute(ddl);

            // Migrations for existing databases to support Cradle_Code
            try
            {
                var tableSql = conn.QueryFirstOrDefault<string>("SELECT sql FROM sqlite_master WHERE type='table' AND name='RobotRecipe'");
                if (tableSql != null && !tableSql.Contains("StationCode, Cradle_Code", StringComparison.OrdinalIgnoreCase))
                {
                    conn.Execute(@"
                        CREATE TABLE RobotRecipe_v2 (
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
                        INSERT OR IGNORE INTO RobotRecipe_v2 (Recipe_ID, StationCode, Cradle_Code, Modelo, Mano, Posicion, Recipe_A, Recipe_B, Version, Activo, CreatedAt, UpdatedAt, UpdatedBy)
                        SELECT Recipe_ID, StationCode, 'CUNA-01', Modelo, Mano, Posicion, Recipe_A, Recipe_B, Version, Activo, CreatedAt, UpdatedAt, UpdatedBy FROM RobotRecipe;
                        DROP TABLE RobotRecipe;
                        ALTER TABLE RobotRecipe_v2 RENAME TO RobotRecipe;
                    ");
                }
            } catch (Exception ex) {
                _logger.LogWarning(ex, "Failed to migrate RobotRecipe table constraint");
            }

            try
            {
                var colsCradle = conn.Query<string>("SELECT name FROM pragma_table_info('CradleQR')").ToList();
                if (!colsCradle.Contains("Cradle_Code", StringComparer.OrdinalIgnoreCase))
                {
                    conn.Execute("ALTER TABLE CradleQR ADD COLUMN Cradle_Code TEXT NOT NULL DEFAULT 'CUNA-01'");
                }
            } catch { }

            try
            {
                var colsCycle = conn.Query<string>("SELECT name FROM pragma_table_info('ProductionCycle')").ToList();
                if (!colsCycle.Contains("Cradle_Code", StringComparer.OrdinalIgnoreCase))
                {
                    conn.Execute("ALTER TABLE ProductionCycle ADD COLUMN Cradle_Code TEXT");
                }
            } catch { }

            // Ensure CUNA-02 default recipes and QR codes exist for existing databases
            try
            {
                int cuna02RecipeCount = conn.ExecuteScalar<int>("SELECT COUNT(1) FROM RobotRecipe WHERE Cradle_Code = 'CUNA-02'");
                if (cuna02RecipeCount == 0)
                {
                    string now = DateTime.UtcNow.ToString("o");
                    conn.Execute(@"
                        INSERT OR IGNORE INTO RobotRecipe (StationCode, Cradle_Code, Modelo, Mano, Posicion, Recipe_A, Recipe_B, Version, Activo, CreatedAt, UpdatedAt, UpdatedBy)
                        VALUES 
                        ('DL02', 'CUNA-02', 'P1B', 'RH', 'FRONT', 111, 211, 1, 1, @now, @now, 'SYSTEM'),
                        ('DL02', 'CUNA-02', 'P1B', 'LH', 'FRONT', 112, 212, 1, 1, @now, @now, 'SYSTEM'),
                        ('DL02', 'CUNA-02', 'P1B', 'RH', 'REAR', 113, 213, 1, 1, @now, @now, 'SYSTEM'),
                        ('DL02', 'CUNA-02', 'P1B', 'LH', 'REAR', 114, 214, 1, 1, @now, @now, 'SYSTEM');

                        INSERT OR IGNORE INTO CradleQR (Cradle_Code, QR_Pattern, Modelo, Mano, Posicion, Variante, Activo, CreatedAt)
                        VALUES 
                        ('CUNA-02', 'CUNA-02', 'P1B', 'RH', 'FRONT', 'STD', 1, @now),
                        ('CUNA-02', 'CUNA-02', 'P1B', 'LH', 'FRONT', 'STD', 1, @now),
                        ('CUNA-02', 'CUNA-02', 'P1B', 'RH', 'REAR', 'STD', 1, @now),
                        ('CUNA-02', 'CUNA-02', 'P1B', 'LH', 'REAR', 'STD', 1, @now);
                    ", new { now });
                }
            } catch (Exception ex) {
                _logger.LogWarning(ex, "Failed to insert CUNA-02 seed records");
            }

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

                INSERT INTO RobotRecipe (StationCode, Cradle_Code, Modelo, Mano, Posicion, Recipe_A, Recipe_B, Version, Activo, CreatedAt, UpdatedAt, UpdatedBy)
                VALUES 
                ('DL02', 'CUNA-01', 'P1B', 'RH', 'FRONT', 101, 201, 1, 1, @now, @now, 'SYSTEM'),
                ('DL02', 'CUNA-01', 'P1B', 'LH', 'FRONT', 102, 202, 1, 1, @now, @now, 'SYSTEM'),
                ('DL02', 'CUNA-01', 'P1B', 'RH', 'REAR', 103, 203, 1, 1, @now, @now, 'SYSTEM'),
                ('DL02', 'CUNA-01', 'P1B', 'LH', 'REAR', 104, 204, 1, 1, @now, @now, 'SYSTEM'),
                ('DL02', 'CUNA-02', 'P1B', 'RH', 'FRONT', 111, 211, 1, 1, @now, @now, 'SYSTEM'),
                ('DL02', 'CUNA-02', 'P1B', 'LH', 'FRONT', 112, 212, 1, 1, @now, @now, 'SYSTEM'),
                ('DL02', 'CUNA-02', 'P1B', 'RH', 'REAR', 113, 213, 1, 1, @now, @now, 'SYSTEM'),
                ('DL02', 'CUNA-02', 'P1B', 'LH', 'REAR', 114, 214, 1, 1, @now, @now, 'SYSTEM');

                INSERT INTO CradleQR (Cradle_Code, QR_Pattern, Modelo, Mano, Posicion, Variante, Activo, CreatedAt)
                VALUES 
                ('CUNA-01', 'CUNA-01', 'P1B', 'RH', 'FRONT', 'STD', 1, @now),
                ('CUNA-01', 'CUNA-01', 'P1B', 'LH', 'FRONT', 'STD', 1, @now),
                ('CUNA-01', 'CUNA-01', 'P1B', 'RH', 'REAR', 'STD', 1, @now),
                ('CUNA-01', 'CUNA-01', 'P1B', 'LH', 'REAR', 'STD', 1, @now),
                ('CUNA-02', 'CUNA-02', 'P1B', 'RH', 'FRONT', 'STD', 1, @now),
                ('CUNA-02', 'CUNA-02', 'P1B', 'LH', 'FRONT', 'STD', 1, @now),
                ('CUNA-02', 'CUNA-02', 'P1B', 'RH', 'REAR', 'STD', 1, @now),
                ('CUNA-02', 'CUNA-02', 'P1B', 'LH', 'REAR', 'STD', 1, @now),
                ('CUNA-01', 'CUNA-P1B-RH-FRONT-01', 'P1B', 'RH', 'FRONT', 'STD', 1, @now),
                ('CUNA-01', 'CUNA-P1B-LH-FRONT-01', 'P1B', 'LH', 'FRONT', 'STD', 1, @now),
                ('CUNA-01', 'CUNA-P1B-RH-REAR-01', 'P1B', 'RH', 'REAR', 'STD', 1, @now),
                ('CUNA-01', 'CUNA-P1B-LH-REAR-01', 'P1B', 'LH', 'REAR', 'STD', 1, @now);

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

