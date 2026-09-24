export type StationState =
  | 'WAITING_ORDER'
  | 'ORDER_LOADED'
  | 'CHECKING_CRADLE'
  | 'CRADLE_OK'
  | 'CHECKING_CRADLE_QR'
  | 'CRADLE_QR_OK'
  | 'LOADING_PANEL_INSPECTION_PLAN'
  | 'CHECKING_PANEL'
  | 'PANEL_OK'
  | 'WAITING_PLC'
  | 'PLC_READY'
  | 'LOADING_RECIPE'
  | 'SENDING_RECIPE'
  | 'WAITING_RECIPE_CONFIRMATION'
  | 'RECIPE_CONFIRMED'
  | 'ROBOT_RUNNING'
  | 'WAITING_ROBOT_FINISH'
  | 'SAVING_STATION_RESULT'
  | 'CYCLE_COMPLETE'
  | 'ERROR'
  | 'MAINTENANCE'
  | 'SIMULATION';

export interface ProductionOrder {
  iD_OrdenProduccion: number;
  iD_OrdenCliente: string;
  iD_Secuencia: number;
  secuencia: string;
  modelo: string;
  mano: string; // 'RH' | 'LH'
  posicion: string; // 'FRONT' | 'REAR'
  orden: number;
  estado: string;
  fechaCreacion: string;
}

export interface ProductionCycle {
  cycle_ID: string;
  iD_Secuencia: number;
  secuencia: string;
  modelo: string;
  mano: string;
  posicion: string;
  puesto: string;
  fechaInicio: string;
  fechaFin?: string;
  qR_Cuna?: string;
  cradle_Code?: string;
  cradleResult?: string;
  panelResult?: string;
  inspectionPlan?: string;
  inspectionPlanVersion?: number;
  recipe_A?: number;
  recipe_B?: number;
  robotResult?: string;
  stationResult?: string;
  usuario: string;
  errorCode?: string;
  errorDescription?: string;
  cycleTimeMs?: number;
}

export interface IndustrialAlarm {
  alarm_ID: number;
  code: string;
  description: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  stationCode: string;
  triggeredAt: string;
  isActive: boolean;
}

export interface StationHealthStatus {
  isHealthy: boolean;
  databaseConnected: boolean;
  plcConnected: boolean;
  camerasConnected: boolean;
  diskFreeSpaceGb: number;
  memoryUsageMb: number;
  activeAlarms: IndustrialAlarm[];
  timestamp: string;
}

export interface InspectionROI {
  roI_ID: number;
  inspectionPoint_ID: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shapeType: string;
  referenceImagePath?: string;
}

export interface InspectionPoint {
  inspectionPoint_ID: string;
  code: string;
  name: string;
  description?: string;
  pieceType: string;
  cameraId: string;
  algorithmType: string;
  expectedValue: string;
  tolerance: number;
  minConfidence: number;
  isRequired: boolean;
  executionOrder: number;
  timeoutMs: number;
  enabled: boolean;
  roIs: InspectionROI[];
}

export interface PointInspectionResult {
  inspectionResult_ID: number;
  cycle_ID: string;
  inspectionPoint_ID: string;
  pointCode: string;
  pointName: string;
  expectedValue: string;
  detectedValue: string;
  confidence: number;
  result: 'OK' | 'NOK' | 'WARNING' | 'SKIPPED';
  isRequired: boolean;
  imagePath?: string;
  processingTimeMs: number;
  timestamp: string;
  failureReason?: string;
}

export interface UserSession {
  username: string;
  displayName: string;
  role: 'OPERATOR' | 'MAINTENANCE' | 'ENGINEER' | 'ADMIN';
  badgeNumber?: string;
}

export interface RobotRecipe {
  recipe_ID?: number;
  stationCode: string;
  cradle_Code: string;
  modelo: string;
  mano: string;
  posicion: string;
  recipe_A: number;
  recipe_B: number;
  version?: number;
  activo: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface CradleQRMapping {
  qR_ID: number;
  cradle_Code: string;
  qR_Pattern: string;
  modelo: string;
  mano: string;
  posicion: string;
  variante?: string;
  activo: boolean;
}

export interface PLCConfiguration {
  plC_ID: string;
  stationCode: string;
  protocol: 'SIMULATOR' | 'SIEMENS_S7' | 'MODBUS_TCP' | 'ETHERNET_IP' | 'OPC_UA';
  ipAddress: string;
  port: number;
  pollingIntervalMs: number;
  timeoutMs: number;
  maxRetries: number;
  active: boolean;
  tagRecipeA: string;
  tagRecipeB: string;
  tagRecipeReady: string;
  tagStationState: string;
  tagRecipeReceived: string;
  tagEchoRecipeA: string;
  tagEchoRecipeB: string;
}

export interface PLCStateInfo {
  rawValue: number;
  logicalState: string;
  stateDescription: string;
  recipeReceived: boolean;
  echoRecipeA: number;
  echoRecipeB: number;
  isConnected: boolean;
  timestamp: string;
}

export interface PLCStatusInfo {
  plC_ID: string;
  stationCode: string;
  protocol: string;
  ipAddress: string;
  port: number;
  pollingIntervalMs: number;
  timeoutMs: number;
  isConnected: boolean;
  state: PLCStateInfo;
  tags: {
    tagRecipeA: string;
    tagRecipeB: string;
    tagRecipeReady: string;
    tagStationState: string;
    tagRecipeReceived: string;
    tagEchoRecipeA: string;
    tagEchoRecipeB: string;
  };
}

export interface TcpPingResult {
  success: boolean;
  ipAddress: string;
  port: number;
  latencyMs: number;
  message: string;
  protocol: string;
}

export interface HandshakeTestResult {
  success: boolean;
  sentRecipeA?: number;
  sentRecipeB?: number;
  echoRecipeA?: number;
  echoRecipeB?: number;
  message: string;
  durationMs: number;
}

export interface DatabaseConnectionConfig {
  provider: 'Sqlite' | 'SqlServer';
  connectionString: string;
  server?: string;
  port?: number;
  databaseName?: string;
  username?: string;
  password?: string;
  integratedSecurity?: boolean;
  trustServerCertificate?: boolean;
  connectionTimeout?: number;
}

export interface DatabaseTestResult {
  success: boolean;
  message: string;
  provider: string;
  databaseVersion?: string;
  responseTimeMs: number;
  existingTables: string[];
  tableCount: number;
}

export interface DatabaseMigrationResult {
  success: boolean;
  message: string;
  tablesCreatedOrVerified: string[];
  columnsAdded: string[];
  seedRecordsInserted: string[];
  warnings: string[];
}

export interface DatabaseTableInfo {
  tableName: string;
  rowCount: number;
  exists: boolean;
  description?: string;
}

export interface SqlScriptInfo {
  provider: string;
  filename: string;
  content: string;
}
