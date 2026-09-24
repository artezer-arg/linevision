-- ============================================================================
-- LINEVISION INDUSTRIAL AUTOMATION - ESTACIÓN DL02
-- ESQUEMA COMPLETO IDEMPOTENTE PARA MICROSOFT SQL SERVER / AZURE SQL
-- ============================================================================
-- * GARANTÍA DE NO DESTRUCCIÓN:
--   Este script verifica previamente la existencia de cada tabla, columna e
--   índice antes de crearla o modificarla.
--   SI LAS TABLAS O DATOS YA EXISTEN EN LA BD, NO BORRA NINGÚN DATO.
-- ============================================================================

SET NOCOUNT ON;

PRINT '======================================================================';
PRINT '  INICIANDO VERIFICACIÓN E INICIALIZACIÓN IDEMPOTENTE DE LINEVISION DL02';
PRINT '======================================================================';

-- ----------------------------------------------------------------------------
-- 1. TABLA: AppConfiguration
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AppConfiguration')
BEGIN
    PRINT 'Creando tabla: AppConfiguration...';
    CREATE TABLE [dbo].[AppConfiguration] (
        [Key] VARCHAR(100) NOT NULL PRIMARY KEY,
        [Value] NVARCHAR(MAX) NOT NULL,
        [Description] VARCHAR(255) NULL,
        [Category] VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
ELSE
BEGIN
    PRINT 'Tabla AppConfiguration ya existe. Omitiendo creación.';
END;

-- ----------------------------------------------------------------------------
-- 2. TABLA: Puesto (Control de Puntero de Orden DL02)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Puesto')
BEGIN
    PRINT 'Creando tabla: Puesto...';
    CREATE TABLE [dbo].[Puesto] (
        [Puesto] VARCHAR(20) NOT NULL PRIMARY KEY,
        [Puntero_ID_OrdenProduccion] INT NULL,
        [Descripcion] VARCHAR(100) NOT NULL,
        [Activo] BIT NOT NULL DEFAULT 1,
        [UltimaActualizacion] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
ELSE
BEGIN
    PRINT 'Tabla Puesto ya existe. Omitiendo creación.';
END;

-- ----------------------------------------------------------------------------
-- 3. TABLA: OrdenProduccion
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'OrdenProduccion')
BEGIN
    PRINT 'Creando tabla: OrdenProduccion...';
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
ELSE
BEGIN
    PRINT 'Tabla OrdenProduccion ya existe. Omitiendo creación.';
END;

-- ----------------------------------------------------------------------------
-- 4. TABLA: Produccion_Secuencia (Trazabilidad MES / Poka-Yoke)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Produccion_Secuencia')
BEGIN
    PRINT 'Creando tabla: Produccion_Secuencia...';
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
ELSE
BEGIN
    PRINT 'Tabla Produccion_Secuencia ya existe. Omitiendo creación.';
END;

-- ----------------------------------------------------------------------------
-- 5. TABLA: Camera (Configuración de Cámaras de Visión)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Camera')
BEGIN
    PRINT 'Creando tabla: Camera...';
    CREATE TABLE [dbo].[Camera] (
        [CameraId] VARCHAR(50) NOT NULL PRIMARY KEY,
        [Name] VARCHAR(100) NOT NULL,
        [StationCode] VARCHAR(20) NOT NULL,
        [ProviderType] VARCHAR(30) NOT NULL DEFAULT 'SIMULATOR',
        [ConnectionUri] VARCHAR(255) NOT NULL,
        [Exposure] INT NOT NULL DEFAULT 100,
        [Gain] INT NOT NULL DEFAULT 0,
        [Fps] INT NOT NULL DEFAULT 30,
        [IsColor] BIT NOT NULL DEFAULT 1,
        [Active] BIT NOT NULL DEFAULT 1
    );
END
ELSE
BEGIN
    PRINT 'Tabla Camera ya existe. Omitiendo creación.';
END;

-- ----------------------------------------------------------------------------
-- 6. TABLA: PLCConfiguration (Driver y Comunicación de Campo)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PLCConfiguration')
BEGIN
    PRINT 'Creando tabla: PLCConfiguration...';
    CREATE TABLE [dbo].[PLCConfiguration] (
        [PLC_ID] VARCHAR(50) NOT NULL PRIMARY KEY,
        [StationCode] VARCHAR(20) NOT NULL,
        [Protocol] VARCHAR(30) NOT NULL DEFAULT 'SIMULATOR',
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
ELSE
BEGIN
    PRINT 'Tabla PLCConfiguration ya existe. Omitiendo creación.';
END;

-- ----------------------------------------------------------------------------
-- 7. TABLA: PLCStateMapping
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PLCStateMapping')
BEGIN
    PRINT 'Creando tabla: PLCStateMapping...';
    CREATE TABLE [dbo].[PLCStateMapping] (
        [Mapping_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [EstadoLogico] VARCHAR(50) NOT NULL,
        [ValorPLC] INT NOT NULL,
        [Descripcion] VARCHAR(100) NOT NULL,
        [Activo] BIT NOT NULL DEFAULT 1,
        CONSTRAINT [UQ_PLCStateMapping_Valor] UNIQUE ([ValorPLC])
    );
END
ELSE
BEGIN
    PRINT 'Tabla PLCStateMapping ya existe. Omitiendo creación.';
END;

-- ----------------------------------------------------------------------------
-- 8. TABLA: RobotRecipe (Matriz de Recetas Desacoplada por Cuna Física)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'RobotRecipe')
BEGIN
    PRINT 'Creando tabla: RobotRecipe...';
    CREATE TABLE [dbo].[RobotRecipe] (
        [Recipe_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [StationCode] VARCHAR(20) NOT NULL DEFAULT 'DL02',
        [Cradle_Code] VARCHAR(50) NOT NULL DEFAULT 'CUNA-01',
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
        CONSTRAINT [UQ_RobotRecipe_Station_Cradle_Variant_Version] UNIQUE ([StationCode], [Cradle_Code], [Modelo], [Mano], [Posicion], [Version])
    );
END
ELSE
BEGIN
    PRINT 'Tabla RobotRecipe ya existe. Verificando columna Cradle_Code...';
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('RobotRecipe') AND name = 'Cradle_Code')
    BEGIN
        PRINT 'Agregando columna faltante Cradle_Code a RobotRecipe...';
        ALTER TABLE [dbo].[RobotRecipe] ADD [Cradle_Code] VARCHAR(50) NOT NULL DEFAULT 'CUNA-01';
    END;
END;

-- ----------------------------------------------------------------------------
-- 9. TABLA: CradleQR (Mapeo de Patrones QR a Cunas Físicas)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CradleQR')
BEGIN
    PRINT 'Creando tabla: CradleQR...';
    CREATE TABLE [dbo].[CradleQR] (
        [QR_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [Cradle_Code] VARCHAR(50) NOT NULL DEFAULT 'CUNA-01',
        [QR_Pattern] VARCHAR(100) NOT NULL,
        [Modelo] VARCHAR(20) NOT NULL,
        [Mano] VARCHAR(10) NOT NULL,
        [Posicion] VARCHAR(10) NOT NULL,
        [Variante] VARCHAR(20) NULL,
        [Activo] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
ELSE
BEGIN
    PRINT 'Tabla CradleQR ya existe. Verificando columna Cradle_Code...';
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CradleQR') AND name = 'Cradle_Code')
    BEGIN
        PRINT 'Agregando columna faltante Cradle_Code a CradleQR...';
        ALTER TABLE [dbo].[CradleQR] ADD [Cradle_Code] VARCHAR(50) NOT NULL DEFAULT 'CUNA-01';
    END;
END;

-- ----------------------------------------------------------------------------
-- 10. TABLA: InspectionPoint
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InspectionPoint')
BEGIN
    PRINT 'Creando tabla: InspectionPoint...';
    CREATE TABLE [dbo].[InspectionPoint] (
        [InspectionPoint_ID] VARCHAR(50) NOT NULL PRIMARY KEY,
        [Code] VARCHAR(50) NOT NULL UNIQUE,
        [Name] VARCHAR(100) NOT NULL,
        [Description] NVARCHAR(255) NULL,
        [PieceType] VARCHAR(20) NOT NULL, -- 'CRADLE', 'PANEL'
        [CameraId] VARCHAR(50) NOT NULL,
        [AlgorithmType] VARCHAR(50) NOT NULL,
        [ExpectedValue] VARCHAR(100) NOT NULL,
        [Tolerance] FLOAT NOT NULL DEFAULT 0.0,
        [MinConfidence] FLOAT NOT NULL DEFAULT 0.85,
        [IsRequired] BIT NOT NULL DEFAULT 1,
        [ExecutionOrder] INT NOT NULL DEFAULT 1,
        [TimeoutMs] INT NOT NULL DEFAULT 1500,
        [Enabled] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
ELSE
BEGIN
    PRINT 'Tabla InspectionPoint ya existe. Omitiendo creación.';
END;

-- ----------------------------------------------------------------------------
-- 11. TABLA: InspectionROI
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InspectionROI')
BEGIN
    PRINT 'Creando tabla: InspectionROI...';
    CREATE TABLE [dbo].[InspectionROI] (
        [ROI_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [InspectionPoint_ID] VARCHAR(50) NOT NULL,
        [Name] VARCHAR(100) NOT NULL,
        [X] INT NOT NULL,
        [Y] INT NOT NULL,
        [Width] INT NOT NULL,
        [Height] INT NOT NULL,
        [ShapeType] VARCHAR(20) NOT NULL DEFAULT 'RECTANGLE',
        [ReferenceImagePath] VARCHAR(255) NULL,
        [ParametersJson] NVARCHAR(MAX) NULL
    );
END
ELSE
BEGIN
    PRINT 'Tabla InspectionROI ya existe. Omitiendo creación.';
END;

-- ----------------------------------------------------------------------------
-- 12. TABLAS: InspectionPlan, InspectionPlanVersion, InspectionPlanDetail
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InspectionPlan')
BEGIN
    PRINT 'Creando tabla: InspectionPlan...';
    CREATE TABLE [dbo].[InspectionPlan] (
        [Plan_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [Code] VARCHAR(50) NOT NULL UNIQUE,
        [Name] VARCHAR(100) NOT NULL,
        [PieceType] VARCHAR(20) NOT NULL,
        [Modelo] VARCHAR(20) NOT NULL,
        [Mano] VARCHAR(10) NOT NULL,
        [Posicion] VARCHAR(10) NOT NULL,
        [ActiveVersion] INT NOT NULL DEFAULT 1,
        [Enabled] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InspectionPlanVersion')
BEGIN
    PRINT 'Creando tabla: InspectionPlanVersion...';
    CREATE TABLE [dbo].[InspectionPlanVersion] (
        [Version_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [Plan_ID] INT NOT NULL,
        [VersionNumber] INT NOT NULL,
        [IsLocked] BIT NOT NULL DEFAULT 0,
        [CreatedDate] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        [CreatedBy] VARCHAR(50) NOT NULL,
        [ChangeNotes] NVARCHAR(255) NULL,
        CONSTRAINT [UQ_InspectionPlanVersion_Plan_Version] UNIQUE ([Plan_ID], [VersionNumber])
    );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InspectionPlanDetail')
BEGIN
    PRINT 'Creando tabla: InspectionPlanDetail...';
    CREATE TABLE [dbo].[InspectionPlanDetail] (
        [PlanDetail_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [Version_ID] INT NOT NULL,
        [InspectionPoint_ID] VARCHAR(50) NOT NULL,
        [ExecutionOrder] INT NOT NULL,
        CONSTRAINT [UQ_InspectionPlanDetail_Version_Point] UNIQUE ([Version_ID], [InspectionPoint_ID])
    );
END;

-- ----------------------------------------------------------------------------
-- 13. TABLA: ProductionCycle (Trazabilidad Industrial por Pieza)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ProductionCycle')
BEGIN
    PRINT 'Creando tabla: ProductionCycle...';
    CREATE TABLE [dbo].[ProductionCycle] (
        [Cycle_ID] NVARCHAR(50) NOT NULL PRIMARY KEY,
        [ID_Secuencia] INT NOT NULL,
        [ID_OrdenProduccion] INT NOT NULL,
        [ID_OrdenCliente] VARCHAR(50) NOT NULL,
        [Secuencia] VARCHAR(20) NOT NULL,
        [Modelo] VARCHAR(20) NOT NULL,
        [Mano] VARCHAR(10) NOT NULL,
        [Posicion] VARCHAR(10) NOT NULL,
        [Puesto] VARCHAR(20) NOT NULL,
        [FechaInicio] DATETIME2 NOT NULL,
        [FechaFin] DATETIME2 NULL,
        [QR_Cuna] VARCHAR(100) NULL,
        [Cradle_Code] VARCHAR(50) NULL,
        [CradleResult] VARCHAR(10) NULL,
        [PanelResult] VARCHAR(10) NULL,
        [InspectionPlan] VARCHAR(50) NULL,
        [InspectionPlanVersion] INT NULL,
        [Recipe_A] INT NULL,
        [Recipe_B] INT NULL,
        [PLCStartState] VARCHAR(50) NULL,
        [PLCFinalState] VARCHAR(50) NULL,
        [RobotResult] VARCHAR(10) NULL,
        [StationResult] VARCHAR(10) NULL,
        [Usuario] VARCHAR(50) NOT NULL,
        [ErrorCode] VARCHAR(50) NULL,
        [ErrorDescription] NVARCHAR(255) NULL,
        [CycleTimeMs] INT NULL,
        [VisionTimeMs] INT NULL,
        [PLCTimeMs] INT NULL,
        [DBTimeMs] INT NULL
    );
    CREATE NONCLUSTERED INDEX [IX_ProductionCycle_Secuencia] ON [dbo].[ProductionCycle] ([Secuencia], [FechaInicio] DESC);
END
ELSE
BEGIN
    PRINT 'Tabla ProductionCycle ya existe. Verificando columna Cradle_Code...';
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('ProductionCycle') AND name = 'Cradle_Code')
    BEGIN
        PRINT 'Agregando columna faltante Cradle_Code a ProductionCycle...';
        ALTER TABLE [dbo].[ProductionCycle] ADD [Cradle_Code] VARCHAR(50) NULL;
    END;
END;

-- ----------------------------------------------------------------------------
-- 14. TABLAS DE RESULTADOS, LOGS Y ALARMAS
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InspectionResult')
BEGIN
    CREATE TABLE [dbo].[InspectionResult] (
        [InspectionResult_ID] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [Cycle_ID] NVARCHAR(50) NOT NULL,
        [InspectionPoint_ID] VARCHAR(50) NOT NULL,
        [InspectionPlan_ID] INT NULL,
        [InspectionPlanVersion] INT NULL,
        [ExpectedValue] VARCHAR(100) NOT NULL,
        [DetectedValue] VARCHAR(100) NOT NULL,
        [Confidence] FLOAT NOT NULL,
        [Result] VARCHAR(10) NOT NULL,
        [ImagePath] VARCHAR(255) NULL,
        [ROIImagePath] VARCHAR(255) NULL,
        [ProcessingTimeMs] INT NOT NULL DEFAULT 0,
        [Timestamp] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SystemLog')
BEGIN
    CREATE TABLE [dbo].[SystemLog] (
        [Log_ID] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [Timestamp] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        [Level] VARCHAR(20) NOT NULL,
        [Module] VARCHAR(50) NOT NULL,
        [Message] NVARCHAR(MAX) NOT NULL,
        [Cycle_ID] NVARCHAR(50) NULL,
        [Sequence] VARCHAR(20) NULL,
        [User] VARCHAR(50) NOT NULL,
        [ExceptionDetails] NVARCHAR(MAX) NULL
    );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Alarm')
BEGIN
    CREATE TABLE [dbo].[Alarm] (
        [Alarm_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [Code] VARCHAR(50) NOT NULL,
        [Description] NVARCHAR(255) NOT NULL,
        [Severity] VARCHAR(20) NOT NULL,
        [StationCode] VARCHAR(20) NOT NULL,
        [TriggeredAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        [AcknowledgedAt] DATETIME2 NULL,
        [ResolvedAt] DATETIME2 NULL,
        [AcknowledgedBy] VARCHAR(50) NULL,
        [IsActive] BIT NOT NULL DEFAULT 1
    );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BypassLog')
BEGIN
    CREATE TABLE [dbo].[BypassLog] (
        [Bypass_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [User] VARCHAR(50) NOT NULL,
        [Timestamp] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        [PriorState] VARCHAR(50) NOT NULL,
        [TargetState] VARCHAR(50) NOT NULL,
        [Reason] NVARCHAR(255) NOT NULL,
        [Piece] VARCHAR(50) NULL,
        [Sequence] VARCHAR(20) NULL,
        [Cycle_ID] NVARCHAR(50) NULL
    );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'User')
BEGIN
    CREATE TABLE [dbo].[User] (
        [User_ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [Username] VARCHAR(50) NOT NULL UNIQUE,
        [DisplayName] VARCHAR(100) NOT NULL,
        [PasswordHash] VARCHAR(255) NOT NULL,
        [RoleName] VARCHAR(50) NOT NULL DEFAULT 'OPERATOR',
        [BadgeNumber] VARCHAR(50) NULL,
        [Active] BIT NOT NULL DEFAULT 1
    );
END;

-- ----------------------------------------------------------------------------
-- 15. SEED DATA IDEMPOTENTE (INSERTA SOLO SI NO EXISTE REGISTRO PREVIO)
-- ----------------------------------------------------------------------------
PRINT 'Verificando datos maestros iniciales...';

IF NOT EXISTS (SELECT 1 FROM [Puesto] WHERE [Puesto] = 'DL02')
BEGIN
    PRINT 'Insertando configuración de Puesto DL02...';
    INSERT INTO [Puesto] ([Puesto], [Puntero_ID_OrdenProduccion], [Descripcion], [Activo])
    VALUES ('DL02', 1001, 'Soldadura Panel Interno Puerta DL02', 1);
END;

IF NOT EXISTS (SELECT 1 FROM [OrdenProduccion] WHERE [ID_OrdenProduccion] = 1001)
BEGIN
    PRINT 'Insertando órdenes iniciales de prueba...';
    INSERT INTO [OrdenProduccion] ([ID_OrdenProduccion], [ID_OrdenCliente], [ID_Secuencia], [Secuencia], [Modelo], [Mano], [Posicion], [Orden], [Estado])
    VALUES 
    (1001, 'CLI-2026-9901', 382, '0382', 'P1B', 'RH', 'FRONT', 1, 'EN_CURSO'),
    (1002, 'CLI-2026-9902', 383, '0383', 'P1B', 'LH', 'FRONT', 2, 'PENDIENTE'),
    (1003, 'CLI-2026-9903', 384, '0384', 'P1B', 'RH', 'REAR', 3, 'PENDIENTE'),
    (1004, 'CLI-2026-9904', 385, '0385', 'P1B', 'LH', 'REAR', 4, 'PENDIENTE');
END;

IF NOT EXISTS (SELECT 1 FROM [PLCConfiguration] WHERE [PLC_ID] = 'PLC_DL02')
BEGIN
    PRINT 'Insertando configuración inicial PLC...';
    INSERT INTO [PLCConfiguration] 
    ([PLC_ID], [StationCode], [Protocol], [IPAddress], [Port], [PollingIntervalMs], [TimeoutMs], [MaxRetries], [Active])
    VALUES 
    ('PLC_DL02', 'DL02', 'SIMULATOR', '192.168.1.50', 44818, 100, 2000, 3, 1);
END;

-- Recetas para CUNA-01
IF NOT EXISTS (SELECT 1 FROM [RobotRecipe] WHERE [StationCode] = 'DL02' AND [Cradle_Code] = 'CUNA-01' AND [Modelo] = 'P1B' AND [Mano] = 'RH' AND [Posicion] = 'FRONT')
BEGIN
    PRINT 'Insertando recetas robot para CUNA-01...';
    INSERT INTO [RobotRecipe] ([StationCode], [Cradle_Code], [Modelo], [Mano], [Posicion], [Recipe_A], [Recipe_B], [Version], [Activo])
    VALUES 
    ('DL02', 'CUNA-01', 'P1B', 'RH', 'FRONT', 101, 201, 1, 1),
    ('DL02', 'CUNA-01', 'P1B', 'LH', 'FRONT', 102, 202, 1, 1),
    ('DL02', 'CUNA-01', 'P1B', 'RH', 'REAR', 103, 203, 1, 1),
    ('DL02', 'CUNA-01', 'P1B', 'LH', 'REAR', 104, 204, 1, 1);
END;

-- Recetas para CUNA-02
IF NOT EXISTS (SELECT 1 FROM [RobotRecipe] WHERE [StationCode] = 'DL02' AND [Cradle_Code] = 'CUNA-02' AND [Modelo] = 'P1B' AND [Mano] = 'RH' AND [Posicion] = 'FRONT')
BEGIN
    PRINT 'Insertando recetas robot para CUNA-02...';
    INSERT INTO [RobotRecipe] ([StationCode], [Cradle_Code], [Modelo], [Mano], [Posicion], [Recipe_A], [Recipe_B], [Version], [Activo])
    VALUES 
    ('DL02', 'CUNA-02', 'P1B', 'RH', 'FRONT', 111, 211, 1, 1),
    ('DL02', 'CUNA-02', 'P1B', 'LH', 'FRONT', 112, 212, 1, 1),
    ('DL02', 'CUNA-02', 'P1B', 'RH', 'REAR', 113, 213, 1, 1),
    ('DL02', 'CUNA-02', 'P1B', 'LH', 'REAR', 114, 214, 1, 1);
END;

-- Mapeos QR Cuna
IF NOT EXISTS (SELECT 1 FROM [CradleQR] WHERE [Cradle_Code] = 'CUNA-01' AND [QR_Pattern] = 'CUNA-01')
BEGIN
    PRINT 'Insertando patrones QR de Cuna...';
    INSERT INTO [CradleQR] ([Cradle_Code], [QR_Pattern], [Modelo], [Mano], [Posicion], [Variante], [Activo])
    VALUES 
    ('CUNA-01', 'CUNA-01', 'P1B', 'RH', 'FRONT', 'STD', 1),
    ('CUNA-01', 'CUNA-01', 'P1B', 'LH', 'FRONT', 'STD', 1),
    ('CUNA-01', 'CUNA-01', 'P1B', 'RH', 'REAR', 'STD', 1),
    ('CUNA-01', 'CUNA-01', 'P1B', 'LH', 'REAR', 'STD', 1),
    ('CUNA-02', 'CUNA-02', 'P1B', 'RH', 'FRONT', 'STD', 1),
    ('CUNA-02', 'CUNA-02', 'P1B', 'LH', 'FRONT', 'STD', 1),
    ('CUNA-02', 'CUNA-02', 'P1B', 'RH', 'REAR', 'STD', 1),
    ('CUNA-02', 'CUNA-02', 'P1B', 'LH', 'REAR', 'STD', 1);
END;

-- Usuarios del Sistema
IF NOT EXISTS (SELECT 1 FROM [User] WHERE [Username] = 'admin')
BEGIN
    PRINT 'Insertando usuarios iniciales...';
    INSERT INTO [User] ([Username], [DisplayName], [PasswordHash], [RoleName])
    VALUES 
    ('admin', 'Administrador General', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'ADMIN'),
    ('operator', 'Operador Turno Mañana', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'OPERATOR'),
    ('engineer', 'Ingeniero de Calidad', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'ENGINEER'),
    ('maintenance', 'Técnico de Mantenimiento', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'MAINTENANCE');
END;

PRINT '======================================================================';
PRINT '  ESQUEMA IDEMPOTENTE FINALIZADO CON ÉXITO. NINGÚN DATO FUE BORRADO.';
PRINT '======================================================================';
