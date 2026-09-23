-- ============================================================================
-- LINEVISION INDUSTRIAL AUTOMATION - STATION DL02
-- SEED DATA & CONFIGURATION FOR DL02
-- ============================================================================

-- Roles
IF NOT EXISTS (SELECT 1 FROM [Role] WHERE [Name] = 'ADMIN')
    INSERT INTO [Role] ([Name], [Description]) VALUES ('ADMIN', 'Administrador total de sistema y calibraciones');
IF NOT EXISTS (SELECT 1 FROM [Role] WHERE [Name] = 'ENGINEER')
    INSERT INTO [Role] ([Name], [Description]) VALUES ('ENGINEER', 'Ingeniero de Procesos y Visión Artificial');
IF NOT EXISTS (SELECT 1 FROM [Role] WHERE [Name] = 'MAINTENANCE')
    INSERT INTO [Role] ([Name], [Description]) VALUES ('MAINTENANCE', 'Técnico de Mantenimiento y Diagnóstico');
IF NOT EXISTS (SELECT 1 FROM [Role] WHERE [Name] = 'OPERATOR')
    INSERT INTO [Role] ([Name], [Description]) VALUES ('OPERATOR', 'Operador de Línea');

-- Usuarios Iniciales (Password: 'Industrial2026!')
DECLARE @AdminRoleId INT = (SELECT Role_ID FROM [Role] WHERE [Name] = 'ADMIN');
DECLARE @EngRoleId INT = (SELECT Role_ID FROM [Role] WHERE [Name] = 'ENGINEER');
DECLARE @MaintRoleId INT = (SELECT Role_ID FROM [Role] WHERE [Name] = 'MAINTENANCE');
DECLARE @OpRoleId INT = (SELECT Role_ID FROM [Role] WHERE [Name] = 'OPERATOR');

-- SHA256 / PBKDF2 hash placeholder for 'Industrial2026!'
IF NOT EXISTS (SELECT 1 FROM [User] WHERE [Username] = 'admin')
    INSERT INTO [User] ([Username], [DisplayName], [PasswordHash], [Role_ID], [BadgeNumber]) 
    VALUES ('admin', 'Administrador General', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', @AdminRoleId, 'ADM001');

IF NOT EXISTS (SELECT 1 FROM [User] WHERE [Username] = 'operator')
    INSERT INTO [User] ([Username], [DisplayName], [PasswordHash], [Role_ID], [BadgeNumber]) 
    VALUES ('operator', 'Operador Turno Mañana', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', @OpRoleId, 'OP042');

-- Puesto DL02
IF NOT EXISTS (SELECT 1 FROM [Puesto] WHERE [Puesto] = 'DL02')
    INSERT INTO [Puesto] ([Puesto], [Puntero_ID_OrdenProduccion], [Descripcion], [Activo])
    VALUES ('DL02', 1001, 'Soldadura Panel Interno Puerta DL02', 1);

-- Órdenes de Producción Iniciales
IF NOT EXISTS (SELECT 1 FROM [OrdenProduccion] WHERE [ID_OrdenProduccion] = 1001)
    INSERT INTO [OrdenProduccion] ([ID_OrdenProduccion], [ID_OrdenCliente], [ID_Secuencia], [Secuencia], [Modelo], [Mano], [Posicion], [Orden], [Estado])
    VALUES (1001, 'CLI-2026-9901', 382, '0382', 'P1B', 'RH', 'FRONT', 1, 'EN_CURSO');

IF NOT EXISTS (SELECT 1 FROM [OrdenProduccion] WHERE [ID_OrdenProduccion] = 1002)
    INSERT INTO [OrdenProduccion] ([ID_OrdenProduccion], [ID_OrdenCliente], [ID_Secuencia], [Secuencia], [Modelo], [Mano], [Posicion], [Orden], [Estado])
    VALUES (1002, 'CLI-2026-9902', 383, '0383', 'P1B', 'LH', 'FRONT', 2, 'PENDIENTE');

IF NOT EXISTS (SELECT 1 FROM [OrdenProduccion] WHERE [ID_OrdenProduccion] = 1003)
    INSERT INTO [OrdenProduccion] ([ID_OrdenProduccion], [ID_OrdenCliente], [ID_Secuencia], [Secuencia], [Modelo], [Mano], [Posicion], [Orden], [Estado])
    VALUES (1003, 'CLI-2026-9903', 384, '0384', 'P1B', 'RH', 'REAR', 3, 'PENDIENTE');

-- Cámaras Industriales
IF NOT EXISTS (SELECT 1 FROM [Camera] WHERE [CameraId] = 'CAM_CRADLE')
    INSERT INTO [Camera] ([CameraId], [Name], [StationCode], [ProviderType], [ConnectionUri], [Exposure], [Gain], [Fps], [IsColor])
    VALUES ('CAM_CRADLE', 'Cámara Cuna e Insertos', 'DL02', 'SIMULATOR', 'sim://cradle', 100, 0, 30, 1);

IF NOT EXISTS (SELECT 1 FROM [Camera] WHERE [CameraId] = 'CAM_PANEL_01')
    INSERT INTO [Camera] ([CameraId], [Name], [StationCode], [ProviderType], [ConnectionUri], [Exposure], [Gain], [Fps], [IsColor])
    VALUES ('CAM_PANEL_01', 'Cámara Panel Superior', 'DL02', 'SIMULATOR', 'sim://panel_top', 120, 0, 30, 1);

IF NOT EXISTS (SELECT 1 FROM [Camera] WHERE [CameraId] = 'CAM_PANEL_02')
    INSERT INTO [Camera] ([CameraId], [Name], [StationCode], [ProviderType], [ConnectionUri], [Exposure], [Gain], [Fps], [IsColor])
    VALUES ('CAM_PANEL_02', 'Cámara Panel Inferior', 'DL02', 'SIMULATOR', 'sim://panel_bottom', 120, 0, 30, 1);

-- Configuración PLC
IF NOT EXISTS (SELECT 1 FROM [PLCConfiguration] WHERE [PLC_ID] = 'PLC_DL02')
    INSERT INTO [PLCConfiguration] 
    ([PLC_ID], [StationCode], [Protocol], [IPAddress], [Port], [PollingIntervalMs], [TimeoutMs], [MaxRetries], [Active])
    VALUES 
    ('PLC_DL02', 'DL02', 'SIMULATOR', '192.168.1.50', 44818, 100, 2000, 3, 1);

-- Mapeo de Estados PLC
IF NOT EXISTS (SELECT 1 FROM [PLCStateMapping] WHERE [ValorPLC] = 0)
    INSERT INTO [PLCStateMapping] ([EstadoLogico], [ValorPLC], [Descripcion]) VALUES ('FREE', 0, 'PLC Libre / Esperando Pieza');
IF NOT EXISTS (SELECT 1 FROM [PLCStateMapping] WHERE [ValorPLC] = 1)
    INSERT INTO [PLCStateMapping] ([EstadoLogico], [ValorPLC], [Descripcion]) VALUES ('RECIPE_RECEIVED', 1, 'Receta Recibida y Confirmada');
IF NOT EXISTS (SELECT 1 FROM [PLCStateMapping] WHERE [ValorPLC] = 2)
    INSERT INTO [PLCStateMapping] ([EstadoLogico], [ValorPLC], [Descripcion]) VALUES ('ROBOT_PROCESSING', 2, 'Robot de Soldadura en Ejecución');
IF NOT EXISTS (SELECT 1 FROM [PLCStateMapping] WHERE [ValorPLC] = 3)
    INSERT INTO [PLCStateMapping] ([EstadoLogico], [ValorPLC], [Descripcion]) VALUES ('CYCLE_FINISHED', 3, 'Ciclo de Soldadura Completado OK');
IF NOT EXISTS (SELECT 1 FROM [PLCStateMapping] WHERE [ValorPLC] = 4)
    INSERT INTO [PLCStateMapping] ([EstadoLogico], [ValorPLC], [Descripcion]) VALUES ('ERROR', 4, 'Falla en Celda o Parada de Emergencia');

-- Matriz de Recetas de Soldadura
IF NOT EXISTS (SELECT 1 FROM [RobotRecipe] WHERE [Modelo] = 'P1B' AND [Mano] = 'RH' AND [Posicion] = 'FRONT')
    INSERT INTO [RobotRecipe] ([StationCode], [Modelo], [Mano], [Posicion], [Recipe_A], [Recipe_B], [Version], [Activo])
    VALUES ('DL02', 'P1B', 'RH', 'FRONT', 12, 4, 1, 1);

IF NOT EXISTS (SELECT 1 FROM [RobotRecipe] WHERE [Modelo] = 'P1B' AND [Mano] = 'LH' AND [Posicion] = 'FRONT')
    INSERT INTO [RobotRecipe] ([StationCode], [Modelo], [Mano], [Posicion], [Recipe_A], [Recipe_B], [Version], [Activo])
    VALUES ('DL02', 'P1B', 'LH', 'FRONT', 13, 4, 1, 1);

IF NOT EXISTS (SELECT 1 FROM [RobotRecipe] WHERE [Modelo] = 'P1B' AND [Mano] = 'RH' AND [Posicion] = 'REAR')
    INSERT INTO [RobotRecipe] ([StationCode], [Modelo], [Mano], [Posicion], [Recipe_A], [Recipe_B], [Version], [Activo])
    VALUES ('DL02', 'P1B', 'RH', 'REAR', 21, 7, 1, 1);

IF NOT EXISTS (SELECT 1 FROM [RobotRecipe] WHERE [Modelo] = 'P1B' AND [Mano] = 'LH' AND [Posicion] = 'REAR')
    INSERT INTO [RobotRecipe] ([StationCode], [Modelo], [Mano], [Posicion], [Recipe_A], [Recipe_B], [Version], [Activo])
    VALUES ('DL02', 'P1B', 'LH', 'REAR', 22, 7, 1, 1);

-- Asociación de Códigos QR de Cunas
IF NOT EXISTS (SELECT 1 FROM [CradleQR] WHERE [QR_Pattern] = 'CUNA-P1B-RH-FRONT-01')
    INSERT INTO [CradleQR] ([QR_Pattern], [Modelo], [Mano], [Posicion], [Variante], [Activo])
    VALUES ('CUNA-P1B-RH-FRONT-01', 'P1B', 'RH', 'FRONT', 'STD', 1);

IF NOT EXISTS (SELECT 1 FROM [CradleQR] WHERE [QR_Pattern] = 'CUNA-P1B-LH-FRONT-01')
    INSERT INTO [CradleQR] ([QR_Pattern], [Modelo], [Mano], [Posicion], [Variante], [Activo])
    VALUES ('CUNA-P1B-LH-FRONT-01', 'P1B', 'LH', 'FRONT', 'STD', 1);

IF NOT EXISTS (SELECT 1 FROM [CradleQR] WHERE [QR_Pattern] = 'CUNA-P1B-RH-REAR-01')
    INSERT INTO [CradleQR] ([QR_Pattern], [Modelo], [Mano], [Posicion], [Variante], [Activo])
    VALUES ('CUNA-P1B-RH-REAR-01', 'P1B', 'RH', 'REAR', 'STD', 1);

-- Puntos de Inspección (Cuna)
IF NOT EXISTS (SELECT 1 FROM [InspectionPoint] WHERE [InspectionPoint_ID] = 'IP_CRADLE_HAND')
    INSERT INTO [InspectionPoint] 
    ([InspectionPoint_ID], [Code], [Name], [Description], [PieceType], [CameraId], [AlgorithmType], [ExpectedValue], [MinConfidence], [IsRequired], [ExecutionOrder])
    VALUES 
    ('IP_CRADLE_HAND', 'CRD_01', 'Mano de Cuna RH/LH', 'Verifica polaridad de cuna para mano derecha o izquierda', 'CRADLE', 'CAM_CRADLE', 'PRESENCE', 'PRESENT', 0.90, 1, 1);

IF NOT EXISTS (SELECT 1 FROM [InspectionPoint] WHERE [InspectionPoint_ID] = 'IP_CRADLE_POS')
    INSERT INTO [InspectionPoint] 
    ([InspectionPoint_ID], [Code], [Name], [Description], [PieceType], [CameraId], [AlgorithmType], [ExpectedValue], [MinConfidence], [IsRequired], [ExecutionOrder])
    VALUES 
    ('IP_CRADLE_POS', 'CRD_02', 'Posición Delantera/Trasera', 'Verifica insertos delanteros', 'CRADLE', 'CAM_CRADLE', 'PRESENCE', 'PRESENT', 0.90, 1, 2);

IF NOT EXISTS (SELECT 1 FROM [InspectionPoint] WHERE [InspectionPoint_ID] = 'IP_CRADLE_INSERT_A')
    INSERT INTO [InspectionPoint] 
    ([InspectionPoint_ID], [Code], [Name], [Description], [PieceType], [CameraId], [AlgorithmType], [ExpectedValue], [MinConfidence], [IsRequired], [ExecutionOrder])
    VALUES 
    ('IP_CRADLE_INSERT_A', 'CRD_03', 'Inserto Guía A', 'Presencia y asiento de inserto A de cuna', 'CRADLE', 'CAM_CRADLE', 'TEMPLATE_MATCH', 'MATCH', 0.85, 1, 3);

IF NOT EXISTS (SELECT 1 FROM [InspectionPoint] WHERE [InspectionPoint_ID] = 'IP_CRADLE_INSERT_B')
    INSERT INTO [InspectionPoint] 
    ([InspectionPoint_ID], [Code], [Name], [Description], [PieceType], [CameraId], [AlgorithmType], [ExpectedValue], [MinConfidence], [IsRequired], [ExecutionOrder])
    VALUES 
    ('IP_CRADLE_INSERT_B', 'CRD_04', 'Inserto Guía B', 'Presencia y asiento de inserto B de cuna', 'CRADLE', 'CAM_CRADLE', 'TEMPLATE_MATCH', 'MATCH', 0.85, 1, 4);

-- Puntos de Inspección (Panel de Puerta)
IF NOT EXISTS (SELECT 1 FROM [InspectionPoint] WHERE [InspectionPoint_ID] = 'IP_PANEL_01')
    INSERT INTO [InspectionPoint] 
    ([InspectionPoint_ID], [Code], [Name], [Description], [PieceType], [CameraId], [AlgorithmType], [ExpectedValue], [MinConfidence], [IsRequired], [ExecutionOrder])
    VALUES 
    ('IP_PANEL_01', 'PNL_01', 'Inserto Superior Izquierdo', 'Control de clip y seguro superior izquierdo', 'PANEL', 'CAM_PANEL_01', 'PRESENCE', 'PRESENT', 0.88, 1, 1);

IF NOT EXISTS (SELECT 1 FROM [InspectionPoint] WHERE [InspectionPoint_ID] = 'IP_PANEL_02')
    INSERT INTO [InspectionPoint] 
    ([InspectionPoint_ID], [Code], [Name], [Description], [PieceType], [CameraId], [AlgorithmType], [ExpectedValue], [MinConfidence], [IsRequired], [ExecutionOrder])
    VALUES 
    ('IP_PANEL_02', 'PNL_02', 'Inserto Superior Derecho', 'Control de inserción y acabado de clip derecho', 'PANEL', 'CAM_PANEL_01', 'TEMPLATE_MATCH', 'MATCH', 0.85, 1, 2);

IF NOT EXISTS (SELECT 1 FROM [InspectionPoint] WHERE [InspectionPoint_ID] = 'IP_PANEL_03')
    INSERT INTO [InspectionPoint] 
    ([InspectionPoint_ID], [Code], [Name], [Description], [PieceType], [CameraId], [AlgorithmType], [ExpectedValue], [MinConfidence], [IsRequired], [ExecutionOrder])
    VALUES 
    ('IP_PANEL_03', 'PNL_03', 'Clip Lateral Inferior', 'Control de posición y clip de terminación inferior', 'PANEL', 'CAM_PANEL_02', 'PRESENCE', 'PRESENT', 0.85, 1, 3);

-- ROIs asociadas
IF NOT EXISTS (SELECT 1 FROM [InspectionROI] WHERE [InspectionPoint_ID] = 'IP_CRADLE_HAND')
    INSERT INTO [InspectionROI] ([InspectionPoint_ID], [Name], [X], [Y], [Width], [Height]) VALUES ('IP_CRADLE_HAND', 'ROI_Mano', 50, 50, 120, 100);

IF NOT EXISTS (SELECT 1 FROM [InspectionROI] WHERE [InspectionPoint_ID] = 'IP_CRADLE_POS')
    INSERT INTO [InspectionROI] ([InspectionPoint_ID], [Name], [X], [Y], [Width], [Height]) VALUES ('IP_CRADLE_POS', 'ROI_Pos', 200, 50, 120, 100);

IF NOT EXISTS (SELECT 1 FROM [InspectionROI] WHERE [InspectionPoint_ID] = 'IP_CRADLE_INSERT_A')
    INSERT INTO [InspectionROI] ([InspectionPoint_ID], [Name], [X], [Y], [Width], [Height]) VALUES ('IP_CRADLE_INSERT_A', 'ROI_InsA', 350, 80, 140, 120);

IF NOT EXISTS (SELECT 1 FROM [InspectionROI] WHERE [InspectionPoint_ID] = 'IP_CRADLE_INSERT_B')
    INSERT INTO [InspectionROI] ([InspectionPoint_ID], [Name], [X], [Y], [Width], [Height]) VALUES ('IP_CRADLE_INSERT_B', 'ROI_InsB', 500, 80, 140, 120);

IF NOT EXISTS (SELECT 1 FROM [InspectionROI] WHERE [InspectionPoint_ID] = 'IP_PANEL_01')
    INSERT INTO [InspectionROI] ([InspectionPoint_ID], [Name], [X], [Y], [Width], [Height]) VALUES ('IP_PANEL_01', 'ROI_Panel_TopLeft', 80, 70, 160, 140);

IF NOT EXISTS (SELECT 1 FROM [InspectionROI] WHERE [InspectionPoint_ID] = 'IP_PANEL_02')
    INSERT INTO [InspectionROI] ([InspectionPoint_ID], [Name], [X], [Y], [Width], [Height]) VALUES ('IP_PANEL_02', 'ROI_Panel_TopRight', 420, 70, 160, 140);

IF NOT EXISTS (SELECT 1 FROM [InspectionROI] WHERE [InspectionPoint_ID] = 'IP_PANEL_03')
    INSERT INTO [InspectionROI] ([InspectionPoint_ID], [Name], [X], [Y], [Width], [Height]) VALUES ('IP_PANEL_03', 'ROI_Panel_BottomClip', 250, 320, 180, 150);

-- Planes de Inspección y Versiones
-- Plan Cuna P1B RH FRONT
IF NOT EXISTS (SELECT 1 FROM [InspectionPlan] WHERE [Code] = 'PLAN_CRADLE_P1B_RH_FRONT')
BEGIN
    INSERT INTO [InspectionPlan] ([Code], [Name], [PieceType], [Modelo], [Mano], [Posicion], [ActiveVersion], [Enabled])
    VALUES ('PLAN_CRADLE_P1B_RH_FRONT', 'Plan Cuna P1B RH Delantera', 'CRADLE', 'P1B', 'RH', 'FRONT', 1, 1);
    
    DECLARE @CrdPlanId INT = SCOPE_IDENTITY();
    INSERT INTO [InspectionPlanVersion] ([Plan_ID], [VersionNumber], [IsLocked], [CreatedBy], [ChangeNotes])
    VALUES (@CrdPlanId, 1, 1, 'SYSTEM', 'Versión inicial de producción');
    
    DECLARE @CrdVerId INT = SCOPE_IDENTITY();
    INSERT INTO [InspectionPlanDetail] ([Version_ID], [InspectionPoint_ID], [ExecutionOrder])
    VALUES 
    (@CrdVerId, 'IP_CRADLE_HAND', 1),
    (@CrdVerId, 'IP_CRADLE_POS', 2),
    (@CrdVerId, 'IP_CRADLE_INSERT_A', 3),
    (@CrdVerId, 'IP_CRADLE_INSERT_B', 4);
END

-- Plan Panel P1B RH FRONT
IF NOT EXISTS (SELECT 1 FROM [InspectionPlan] WHERE [Code] = 'PLAN_PANEL_P1B_RH_FRONT')
BEGIN
    INSERT INTO [InspectionPlan] ([Code], [Name], [PieceType], [Modelo], [Mano], [Posicion], [ActiveVersion], [Enabled])
    VALUES ('PLAN_PANEL_P1B_RH_FRONT', 'Plan Panel Puerta P1B RH Delantera', 'PANEL', 'P1B', 'RH', 'FRONT', 1, 1);
    
    DECLARE @PnlPlanId INT = SCOPE_IDENTITY();
    INSERT INTO [InspectionPlanVersion] ([Plan_ID], [VersionNumber], [IsLocked], [CreatedBy], [ChangeNotes])
    VALUES (@PnlPlanId, 1, 1, 'SYSTEM', 'Versión inicial de producción con 3 puntos de control');
    
    DECLARE @PnlVerId INT = SCOPE_IDENTITY();
    INSERT INTO [InspectionPlanDetail] ([Version_ID], [InspectionPoint_ID], [ExecutionOrder])
    VALUES 
    (@PnlVerId, 'IP_PANEL_01', 1),
    (@PnlVerId, 'IP_PANEL_02', 2),
    (@PnlVerId, 'IP_PANEL_03', 3);
END
GO
