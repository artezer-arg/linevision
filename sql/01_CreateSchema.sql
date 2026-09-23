-- ============================================================================
-- LINEVISION INDUSTRIAL AUTOMATION - STATION DL02
-- DATABASE SCHEMA DDL FOR SQL SERVER / AZURE SQL
-- ============================================================================

-- 1. Tablas Productivas de Planta (MES / SCADA Integration)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Puesto')
BEGIN
    CREATE TABLE [dbo].[Puesto] (
        [Puesto] VARCHAR(20) NOT NULL PRIMARY KEY,
        [Puntero_ID_OrdenProduccion] INT NULL,
        [Descripcion] VARCHAR(100) NOT NULL,
        [Activo] BIT NOT NULL DEFAULT 1,
        [UltimaActualizacion] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'OrdenProduccion')
BEGIN
    CREATE TABLE [dbo].[OrdenProduccion] (
        [ID_OrdenProduccion] INT NOT NULL PRIMARY KEY,
        [ID_OrdenCliente] VARCHAR(50) NOT NULL,
        [ID_Secuencia] INT NOT NULL,
        [Secuencia] VARCHAR(20) NOT NULL,
        [Modelo] VARCHAR(20) NOT NULL,
        [Mano] VARCHAR(10) NOT NULL,       -- 'RH', 'LH'
        [Posicion] VARCHAR(10) NOT NULL,   -- 'FRONT', 'REAR'
        [Orden] INT NOT NULL,
        [Estado] VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
        [FechaCreacion] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE NONCLUSTERED INDEX [IX_OrdenProduccion_Secuencia] ON [dbo].[OrdenProduccion] ([Secuencia]);
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Produccion_Secuencia')
BEGIN
    CREATE TABLE [dbo].[Produccion_Secuencia] (
        [ID_ProduccionSecuencia] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [ID_Secuencia] INT NOT NULL,
        [ID_OrdenProduccion] INT NOT NULL,
        [ID_OrdenCliente] VARCHAR(50) NOT NULL,
        [Puesto] VARCHAR(20) NOT NULL,
        [Fecha] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        [Orden] INT NOT NULL,
        [Resultado] VARCHAR(10) NOT NULL,  -- 'OK', 'NOK'
        CONSTRAINT [UQ_ProduccionSecuencia_Secuencia_Puesto] UNIQUE ([ID_Secuencia], [Puesto])
    );
    CREATE NONCLUSTERED INDEX [IX_ProduccionSecuencia_Puesto_Fecha] ON [dbo].[Produccion_Secuencia] ([Puesto], [Fecha] DESC);
END
GO

-- 2. Configuración y Seguridad
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AppConfiguration')
BEGIN
    CREATE TABLE [dbo].[AppConfiguration] (
        [Key] VARCHAR(100) NOT NULL PRIMARY KEY,
        [Value] NVARCHAR(MAX) NOT NULL,
        [Description] VARCHAR(255) NULL,
        [Category] VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Role')
BEGIN
    CREATE TABLE [dbo].[Role] (
        [Role_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [Name] VARCHAR(50) NOT NULL UNIQUE,
        [Description] VARCHAR(255) NULL
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'User')
BEGIN
    CREATE TABLE [dbo].[User] (
        [User_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [Username] VARCHAR(50) NOT NULL UNIQUE,
        [DisplayName] VARCHAR(100) NOT NULL,
        [PasswordHash] VARCHAR(255) NOT NULL,
        [Role_ID] INT NOT NULL FOREIGN KEY REFERENCES [dbo].[Role]([Role_ID]),
        [BadgeNumber] VARCHAR(50) NULL,
        [Active] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 3. Hardware: Cámaras y PLC
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Camera')
BEGIN
    CREATE TABLE [dbo].[Camera] (
        [CameraId] VARCHAR(50) NOT NULL PRIMARY KEY,
        [Name] VARCHAR(100) NOT NULL,
        [StationCode] VARCHAR(20) NOT NULL,
        [ProviderType] VARCHAR(30) NOT NULL DEFAULT 'OPENCV_USB', -- 'OPENCV_USB', 'RTSP', 'GIGE', 'SIMULATOR'
        [ConnectionUri] VARCHAR(255) NOT NULL,
        [Exposure] INT NOT NULL DEFAULT 100,
        [Gain] INT NOT NULL DEFAULT 0,
        [Fps] INT NOT NULL DEFAULT 30,
        [IsColor] BIT NOT NULL DEFAULT 1,
        [Active] BIT NOT NULL DEFAULT 1
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PLCConfiguration')
BEGIN
    CREATE TABLE [dbo].[PLCConfiguration] (
        [PLC_ID] VARCHAR(50) NOT NULL PRIMARY KEY,
        [StationCode] VARCHAR(20) NOT NULL,
        [Protocol] VARCHAR(30) NOT NULL DEFAULT 'ETHERNET_IP', -- 'ETHERNET_IP', 'MODBUS_TCP', 'OPC_UA', 'SIMULATOR'
        [IPAddress] VARCHAR(50) NOT NULL,
        [Port] INT NOT NULL DEFAULT 44818,
        [PollingIntervalMs] INT NOT NULL DEFAULT 100,
        [TimeoutMs] INT NOT NULL DEFAULT 2000,
        [MaxRetries] INT NOT NULL DEFAULT 3,
        [Active] BIT NOT NULL DEFAULT 1,
        [TagRecipeA] VARCHAR(100) NOT NULL DEFAULT 'PC_To_PLC.Recipe_A',
        [TagRecipeB] VARCHAR(100) NOT NULL DEFAULT 'PC_To_PLC.Recipe_B',
        [TagRecipeReady] VARCHAR(100) NOT NULL DEFAULT 'PC_To_PLC.RecipeReady',
        [TagStationState] VARCHAR(100) NOT NULL DEFAULT 'PLC_To_PC.State',
        [TagRecipeReceived] VARCHAR(100) NOT NULL DEFAULT 'PLC_To_PC.RecipeReceived',
        [TagEchoRecipeA] VARCHAR(100) NOT NULL DEFAULT 'PLC_To_PC.EchoRecipe_A',
        [TagEchoRecipeB] VARCHAR(100) NOT NULL DEFAULT 'PLC_To_PC.EchoRecipe_B'
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PLCStateMapping')
BEGIN
    CREATE TABLE [dbo].[PLCStateMapping] (
        [Mapping_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [EstadoLogico] VARCHAR(50) NOT NULL,  -- 'FREE', 'RECIPE_RECEIVED', 'ROBOT_PROCESSING', 'CYCLE_FINISHED', 'ERROR'
        [ValorPLC] INT NOT NULL,
        [Descripcion] VARCHAR(100) NOT NULL,
        [Activo] BIT NOT NULL DEFAULT 1,
        CONSTRAINT [UQ_PLCStateMapping_Valor] UNIQUE ([ValorPLC])
    );
END
GO

-- 4. Matriz de Recetas y QR de Cuna
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'RobotRecipe')
BEGIN
    CREATE TABLE [dbo].[RobotRecipe] (
        [Recipe_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [StationCode] VARCHAR(20) NOT NULL DEFAULT 'DL02',
        [Modelo] VARCHAR(20) NOT NULL,
        [Mano] VARCHAR(10) NOT NULL,
        [Posicion] VARCHAR(10) NOT NULL,
        [Recipe_A] INT NOT NULL,
        [Recipe_B] INT NOT NULL,
        [Version] INT NOT NULL DEFAULT 1,
        [Activo] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        [UpdatedBy] VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
        CONSTRAINT [UQ_RobotRecipe_Key] UNIQUE ([StationCode], [Modelo], [Mano], [Posicion], [Version])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CradleQR')
BEGIN
    CREATE TABLE [dbo].[CradleQR] (
        [QR_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [QR_Pattern] VARCHAR(100) NOT NULL UNIQUE,
        [Modelo] VARCHAR(20) NOT NULL,
        [Mano] VARCHAR(10) NOT NULL,
        [Posicion] VARCHAR(10) NOT NULL,
        [Variante] VARCHAR(20) NULL,
        [Activo] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 5. Motor de Inspección: Puntos, ROIs y Planes Versionados
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InspectionPoint')
BEGIN
    CREATE TABLE [dbo].[InspectionPoint] (
        [InspectionPoint_ID] VARCHAR(50) NOT NULL PRIMARY KEY,
        [Code] VARCHAR(50) NOT NULL UNIQUE,
        [Name] VARCHAR(100) NOT NULL,
        [Description] NVARCHAR(255) NULL,
        [PieceType] VARCHAR(20) NOT NULL, -- 'CRADLE', 'PANEL'
        [CameraId] VARCHAR(50) NOT NULL FOREIGN KEY REFERENCES [dbo].[Camera]([CameraId]),
        [AlgorithmType] VARCHAR(50) NOT NULL, -- 'PRESENCE', 'TEMPLATE_MATCH', 'QR', 'COLOR', 'YOLO_ONNX'
        [ExpectedValue] VARCHAR(100) NOT NULL,
        [Tolerance] FLOAT NOT NULL DEFAULT 0.0,
        [MinConfidence] FLOAT NOT NULL DEFAULT 0.85,
        [IsRequired] BIT NOT NULL DEFAULT 1,
        [ExecutionOrder] INT NOT NULL DEFAULT 1,
        [TimeoutMs] INT NOT NULL DEFAULT 1500,
        [Enabled] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        [UpdatedBy] VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InspectionROI')
BEGIN
    CREATE TABLE [dbo].[InspectionROI] (
        [ROI_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [InspectionPoint_ID] VARCHAR(50) NOT NULL FOREIGN KEY REFERENCES [dbo].[InspectionPoint]([InspectionPoint_ID]),
        [Name] VARCHAR(50) NOT NULL DEFAULT 'ROI_1',
        [X] INT NOT NULL,
        [Y] INT NOT NULL,
        [Width] INT NOT NULL,
        [Height] INT NOT NULL,
        [ShapeType] VARCHAR(20) NOT NULL DEFAULT 'RECTANGLE',
        [ReferenceImagePath] NVARCHAR(255) NULL,
        [ParametersJson] NVARCHAR(MAX) NULL
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InspectionPlan')
BEGIN
    CREATE TABLE [dbo].[InspectionPlan] (
        [Plan_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [Code] VARCHAR(50) NOT NULL UNIQUE,
        [Name] VARCHAR(100) NOT NULL,
        [PieceType] VARCHAR(20) NOT NULL, -- 'CRADLE', 'PANEL'
        [Modelo] VARCHAR(20) NOT NULL,
        [Mano] VARCHAR(10) NOT NULL,
        [Posicion] VARCHAR(10) NOT NULL,
        [ActiveVersion] INT NOT NULL DEFAULT 1,
        [Enabled] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InspectionPlanVersion')
BEGIN
    CREATE TABLE [dbo].[InspectionPlanVersion] (
        [Version_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [Plan_ID] INT NOT NULL FOREIGN KEY REFERENCES [dbo].[InspectionPlan]([Plan_ID]),
        [VersionNumber] INT NOT NULL,
        [IsLocked] BIT NOT NULL DEFAULT 0,
        [CreatedDate] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        [CreatedBy] VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
        [ChangeNotes] NVARCHAR(500) NULL,
        CONSTRAINT [UQ_InspectionPlanVersion] UNIQUE ([Plan_ID], [VersionNumber])
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InspectionPlanDetail')
BEGIN
    CREATE TABLE [dbo].[InspectionPlanDetail] (
        [Detail_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [Version_ID] INT NOT NULL FOREIGN KEY REFERENCES [dbo].[InspectionPlanVersion]([Version_ID]),
        [InspectionPoint_ID] VARCHAR(50) NOT NULL FOREIGN KEY REFERENCES [dbo].[InspectionPoint]([InspectionPoint_ID]),
        [ExecutionOrder] INT NOT NULL DEFAULT 1,
        [IsRequiredOverride] BIT NULL
    );
END
GO

-- 6. Trazabilidad de Ciclo y Resultados Detallados
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ProductionCycle')
BEGIN
    CREATE TABLE [dbo].[ProductionCycle] (
        [Cycle_ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        [ID_Secuencia] INT NOT NULL,
        [ID_OrdenProduccion] INT NOT NULL,
        [ID_OrdenCliente] VARCHAR(50) NOT NULL,
        [Secuencia] VARCHAR(20) NOT NULL,
        [Modelo] VARCHAR(20) NOT NULL,
        [Mano] VARCHAR(10) NOT NULL,
        [Posicion] VARCHAR(10) NOT NULL,
        [Puesto] VARCHAR(20) NOT NULL DEFAULT 'DL02',
        [FechaInicio] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        [FechaFin] DATETIME2 NULL,
        [QR_Cuna] VARCHAR(100) NULL,
        [CradleResult] VARCHAR(10) NULL,   -- 'OK', 'NOK', 'BYPASS'
        [PanelResult] VARCHAR(10) NULL,    -- 'OK', 'NOK', 'BYPASS'
        [InspectionPlan] VARCHAR(50) NULL,
        [InspectionPlanVersion] INT NULL,
        [Recipe_A] INT NULL,
        [Recipe_B] INT NULL,
        [PLCStartState] VARCHAR(50) NULL,
        [PLCFinalState] VARCHAR(50) NULL,
        [RobotResult] VARCHAR(10) NULL,    -- 'OK', 'NOK'
        [StationResult] VARCHAR(10) NULL,  -- 'OK', 'NOK', 'ABORTED'
        [Usuario] VARCHAR(50) NOT NULL DEFAULT 'OPERATOR',
        [ErrorCode] VARCHAR(50) NULL,
        [ErrorDescription] NVARCHAR(500) NULL,
        [CycleTimeMs] INT NULL,
        [VisionTimeMs] INT NULL,
        [PLCTimeMs] INT NULL,
        [DBTimeMs] INT NULL
    );
    CREATE NONCLUSTERED INDEX [IX_ProductionCycle_Secuencia] ON [dbo].[ProductionCycle] ([Secuencia], [FechaInicio] DESC);
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InspectionResult')
BEGIN
    CREATE TABLE [dbo].[InspectionResult] (
        [InspectionResult_ID] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [Cycle_ID] UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES [dbo].[ProductionCycle]([Cycle_ID]),
        [InspectionPoint_ID] VARCHAR(50) NOT NULL FOREIGN KEY REFERENCES [dbo].[InspectionPoint]([InspectionPoint_ID]),
        [InspectionPlan_ID] INT NULL,
        [InspectionPlanVersion] INT NULL,
        [ExpectedValue] VARCHAR(100) NOT NULL,
        [DetectedValue] VARCHAR(100) NOT NULL,
        [Confidence] FLOAT NOT NULL,
        [Result] VARCHAR(10) NOT NULL, -- 'OK', 'NOK', 'WARNING'
        [ImagePath] NVARCHAR(255) NULL,
        [ROIImagePath] NVARCHAR(255) NULL,
        [ProcessingTimeMs] INT NOT NULL DEFAULT 0,
        [Timestamp] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE NONCLUSTERED INDEX [IX_InspectionResult_Cycle] ON [dbo].[InspectionResult] ([Cycle_ID]);
END
GO

-- 7. Bitácora de Eventos, Alarmas y Bypass
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SystemLog')
BEGIN
    CREATE TABLE [dbo].[SystemLog] (
        [Log_ID] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [Timestamp] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        [Level] VARCHAR(20) NOT NULL, -- 'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'
        [Module] VARCHAR(50) NOT NULL,
        [Message] NVARCHAR(MAX) NOT NULL,
        [Cycle_ID] UNIQUEIDENTIFIER NULL,
        [Sequence] VARCHAR(20) NULL,
        [User] VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
        [ExceptionDetails] NVARCHAR(MAX) NULL
    );
    CREATE NONCLUSTERED INDEX [IX_SystemLog_Timestamp] ON [dbo].[SystemLog] ([Timestamp] DESC);
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Alarm')
BEGIN
    CREATE TABLE [dbo].[Alarm] (
        [Alarm_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [Code] VARCHAR(50) NOT NULL,
        [Description] NVARCHAR(255) NOT NULL,
        [Severity] VARCHAR(20) NOT NULL, -- 'INFO', 'WARNING', 'CRITICAL'
        [StationCode] VARCHAR(20) NOT NULL DEFAULT 'DL02',
        [TriggeredAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        [AcknowledgedAt] DATETIME2 NULL,
        [ResolvedAt] DATETIME2 NULL,
        [AcknowledgedBy] VARCHAR(50) NULL,
        [IsActive] BIT NOT NULL DEFAULT 1
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BypassLog')
BEGIN
    CREATE TABLE [dbo].[BypassLog] (
        [Bypass_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [User] VARCHAR(50) NOT NULL,
        [Timestamp] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        [PriorState] VARCHAR(50) NOT NULL,
        [TargetState] VARCHAR(50) NOT NULL,
        [Reason] NVARCHAR(500) NOT NULL,
        [Piece] VARCHAR(50) NULL,
        [Sequence] VARCHAR(20) NULL,
        [Cycle_ID] UNIQUEIDENTIFIER NULL
    );
END
GO
