import * as signalR from '@microsoft/signalr';
import { ProductionOrder, ProductionCycle, StationHealthStatus, StationState, UserSession } from '../types';

const API_BASE = typeof window !== 'undefined' && window.location.port === '5173'
  ? 'http://localhost:5000' 
  : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000');

export const STATE_NUMERIC_MAP: Record<number, StationState> = {
  0: 'WAITING_ORDER',
  1: 'ORDER_LOADED',
  2: 'CHECKING_CRADLE',
  3: 'CRADLE_OK',
  4: 'CHECKING_CRADLE_QR',
  5: 'CRADLE_QR_OK',
  6: 'LOADING_PANEL_INSPECTION_PLAN',
  7: 'CHECKING_PANEL',
  8: 'PANEL_OK',
  9: 'WAITING_PLC',
  10: 'PLC_READY',
  11: 'LOADING_RECIPE',
  12: 'SENDING_RECIPE',
  13: 'WAITING_RECIPE_CONFIRMATION',
  14: 'RECIPE_CONFIRMED',
  15: 'ROBOT_RUNNING',
  16: 'WAITING_ROBOT_FINISH',
  17: 'SAVING_STATION_RESULT',
  18: 'CYCLE_COMPLETE',
  19: 'ERROR',
  20: 'MAINTENANCE',
  21: 'SIMULATION'
};

export function normalizeStationState(state: unknown): StationState {
  if (typeof state === 'number') {
    return STATE_NUMERIC_MAP[state] || 'WAITING_ORDER';
  }
  if (typeof state === 'string' && state) {
    return state as StationState;
  }
  return 'WAITING_ORDER';
}

export class SignalRService {
  private connection: signalR.HubConnection | null = null;

  public async start(
    onState: (state: StationState, reason?: string) => void,
    onOrder: (order: ProductionOrder | null) => void,
    onCycle: (cycle: ProductionCycle | null) => void,
    onFrame: (cameraId: string, base64: string, w: number, h: number) => void,
    onHealth: (health: StationHealthStatus) => void
  ) {
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE}/hubs/linevision`, {
        skipNegotiation: true,
        transport: signalR.HttpTransportType.WebSockets
      })
      .withAutomaticReconnect([0, 1000, 3000, 5000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    this.connection.on('StateChanged', (state: unknown, reason?: string) => onState(normalizeStationState(state), reason));
    this.connection.on('OrderUpdated', (order: ProductionOrder | null) => onOrder(order));
    this.connection.on('CycleUpdated', (cycle: ProductionCycle | null) => onCycle(cycle));
    this.connection.on('CameraFrameReceived', (cam: string, b64: string, w: number, h: number) => onFrame(cam, b64, w, h));
    this.connection.on('HealthStatusReceived', (health: StationHealthStatus) => onHealth(health));

    try {
      await this.connection.start();
      console.log('Connected to LineVision SignalR Hub');
    } catch (err) {
      console.warn('Initial SignalR connection failed, will retry in background:', err);
    }
  }

  public stop() {
    this.connection?.stop();
  }
}

export const api = {
  async getStationState() {
    const res = await fetch(`${API_BASE}/api/station/state`);
    const data = await res.json();
    if (data && data.state) {
      data.state = normalizeStationState(data.state);
    }
    return data;
  },

  async triggerStep() {
    const res = await fetch(`${API_BASE}/api/station/trigger-step`, { method: 'POST' });
    return await res.json();
  },

  async setAutoRun(enabled: boolean) {
    const res = await fetch(`${API_BASE}/api/station/autorun`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
    return await res.json();
  },

  async resetFault(user = 'OPERATOR') {
    const res = await fetch(`${API_BASE}/api/station/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user })
    });
    return await res.json();
  },

  async bypassState(targetState: string, reason: string, user = 'MAINTENANCE') {
    const res = await fetch(`${API_BASE}/api/station/bypass`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetState, reason, user })
    });
    return await res.json();
  },

  async emergencyStop(reason = 'E-Stop triggered from UI') {
    const res = await fetch(`${API_BASE}/api/station/emergency-stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    return await res.json();
  },

  // Simulators
  async setPlcState(state: string, echoA?: number, echoB?: number) {
    const res = await fetch(`${API_BASE}/api/simulator/plc/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, echoA, echoB })
    });
    return await res.json();
  },

  async injectPlcFault(faultType: string) {
    const res = await fetch(`${API_BASE}/api/simulator/plc/fault`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faultType })
    });
    return await res.json();
  },

  async setCameraPattern(cameraId: string, pattern: string) {
    const res = await fetch(`${API_BASE}/api/simulator/camera/pattern`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cameraId, pattern })
    });
    return await res.json();
  },

  async enqueueOrder(stationCode = 'DL02') {
    const res = await fetch(`${API_BASE}/api/simulator/production/enqueue?stationCode=${stationCode}`, { method: 'POST' });
    return await res.json();
  },

  // Calibration & Inspection Configuration
  async getPlans() {
    const res = await fetch(`${API_BASE}/api/calibration/plans`);
    return await res.json();
  },

  async getPlan(pieceType: string, model: string, hand: string, pos: string) {
    const res = await fetch(`${API_BASE}/api/calibration/plan/${encodeURIComponent(pieceType)}/${encodeURIComponent(model)}/${encodeURIComponent(hand)}/${encodeURIComponent(pos)}`);
    if (!res.ok) return null;
    return await res.json();
  },

  async clonePlan(data: {
    pieceType: string;
    srcModel: string;
    srcHand: string;
    srcPos: string;
    dstModel: string;
    dstHand: string;
    dstPos: string;
    mirrorX: boolean;
    imageWidth?: number;
  }) {
    const res = await fetch(`${API_BASE}/api/calibration/plan/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  async getCalibrationMatrix() {
    const res = await fetch(`${API_BASE}/api/calibration/matrix`);
    return await res.json();
  },

  async getAllPoints() {
    const res = await fetch(`${API_BASE}/api/calibration/points`);
    return await res.json();
  },

  async savePoint(point: any) {
    const res = await fetch(`${API_BASE}/api/calibration/point`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(point)
    });
    return await res.json();
  },

  async saveROI(roi: any) {
    const res = await fetch(`${API_BASE}/api/calibration/roi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roi)
    });
    return await res.json();
  },

  async createPoint(point: any) {
    const res = await fetch(`${API_BASE}/api/calibration/point/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(point)
    });
    return await res.json();
  },

  async deletePoint(id: string) {
    const res = await fetch(`${API_BASE}/api/calibration/point/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    return await res.json();
  },

  async captureTemplate(id: string) {
    const res = await fetch(`${API_BASE}/api/calibration/point/${encodeURIComponent(id)}/capture-template`, {
      method: 'POST'
    });
    return await res.json();
  },

  async savePointParameters(id: string, params: any) {
    const res = await fetch(`${API_BASE}/api/calibration/point/${encodeURIComponent(id)}/parameters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    return await res.json();
  },

  async getRecipes(cradleCode?: string) {
    const url = cradleCode 
      ? `${API_BASE}/api/calibration/recipes?cradleCode=${encodeURIComponent(cradleCode)}`
      : `${API_BASE}/api/calibration/recipes`;
    const res = await fetch(url);
    return await res.json();
  },

  async getCradles() {
    const res = await fetch(`${API_BASE}/api/calibration/cradles`);
    return await res.json();
  },

  async saveRecipe(recipe: any) {
    const res = await fetch(`${API_BASE}/api/calibration/recipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recipe)
    });
    return await res.json();
  },

  async getQRMappings() {
    const res = await fetch(`${API_BASE}/api/calibration/qr-mappings`);
    return await res.json();
  },

  async saveQRMapping(mapping: any) {
    const res = await fetch(`${API_BASE}/api/calibration/qr-mapping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mapping)
    });
    return await res.json();
  },

  async saveRoi(roi: any) {
    const res = await fetch(`${API_BASE}/api/calibration/roi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roi)
    });
    return await res.json();
  },

  async testPoint(point: any, rois: any[]) {
    const res = await fetch(`${API_BASE}/api/calibration/test-point`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ point, rois })
    });
    return await res.json();
  },

  async scanQR(cameraId = 'CAM_CRADLE') {
    const res = await fetch(`${API_BASE}/api/calibration/scan-qr?cameraId=${encodeURIComponent(cameraId)}`);
    return await res.json();
  },

  // History
  async getCycles(sequence?: string, outcome?: string) {
    let url = `${API_BASE}/api/history/cycles?`;
    if (sequence) url += `sequence=${encodeURIComponent(sequence)}&`;
    if (outcome) url += `outcome=${encodeURIComponent(outcome)}&`;
    const res = await fetch(url);
    return await res.json();
  },

  async getCycleDetails(id: string) {
    const res = await fetch(`${API_BASE}/api/history/cycle/${id}`);
    return await res.json();
  },

  // Auth
  async login(username: string, password: string): Promise<UserSession | null> {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) return null;
    return await res.json();
  },

  // Cameras Discovery & Real-Time Configuration
  async getDiscoveredCameras() {
    const res = await fetch(`${API_BASE}/api/camera/devices`);
    return await res.json();
  },

  async getCameraConfigs() {
    const res = await fetch(`${API_BASE}/api/camera/configs`);
    return await res.json();
  },

  async configureCamera(cameraId: string, providerType: string, connectionUri: string) {
    const res = await fetch(`${API_BASE}/api/camera/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cameraId, providerType, connectionUri })
    });
    return await res.json();
  },

  async getCameraSnapshot(cameraId: string) {
    const res = await fetch(`${API_BASE}/api/camera/${cameraId}/snapshot`);
    return await res.json();
  },

  // PLC Communication & Configuration
  async getPLCConfig() {
    const res = await fetch(`${API_BASE}/api/plc/config`);
    return await res.json();
  },

  async savePLCConfig(config: any) {
    const res = await fetch(`${API_BASE}/api/plc/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    return await res.json();
  },

  async getPLCStatus() {
    const res = await fetch(`${API_BASE}/api/plc/status`);
    return await res.json();
  },

  async testPLCConnection(params?: { ipAddress?: string; port?: number; timeoutMs?: number }) {
    const res = await fetch(`${API_BASE}/api/plc/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params || {})
    });
    return await res.json();
  },

  async testPLCHandshake(recipeA: number = 99, recipeB: number = 88) {
    const res = await fetch(`${API_BASE}/api/plc/test-handshake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeA, recipeB })
    });
    return await res.json();
  },

  async clearPLCSignals() {
    const res = await fetch(`${API_BASE}/api/plc/clear-signals`, { method: 'POST' });
    return await res.json();
  },

  async forcePLCState(state: string, echoA?: number, echoB?: number) {
    const res = await fetch(`${API_BASE}/api/plc/force-state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, echoA, echoB })
    });
    return await res.json();
  },

  // DATABASE CONFIGURATION & SAFE IDEMPOTENT MIGRATIONS
  async getDatabaseConfig() {
    const res = await fetch(`${API_BASE}/api/database/config`);
    return await res.json();
  },

  async updateDatabaseConfig(config: any) {
    const res = await fetch(`${API_BASE}/api/database/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    return await res.json();
  },

  async testDatabaseConnection(config?: any) {
    const res = await fetch(`${API_BASE}/api/database/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config || null)
    });
    return await res.json();
  },

  async runDatabaseMigration(seedData: boolean = true) {
    const res = await fetch(`${API_BASE}/api/database/migrate?seedData=${seedData}`, {
      method: 'POST'
    });
    return await res.json();
  },

  async getDatabaseTables() {
    const res = await fetch(`${API_BASE}/api/database/tables`);
    return await res.json();
  },

  async getDatabaseSqlScript(provider: string = 'SqlServer') {
    const res = await fetch(`${API_BASE}/api/database/script?provider=${encodeURIComponent(provider)}`);
    return await res.json();
  },

  // TELNET / TCP SOCKET GATEWAY (APP PROVEEDOR 127.0.0.1:12345)
  async getTelnetConfig() {
    const res = await fetch(`${API_BASE}/api/plc/gateway/config`);
    return await res.json();
  },

  async saveTelnetConfig(config: any) {
    const res = await fetch(`${API_BASE}/api/plc/gateway/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    return await res.json();
  },

  async testTelnetConnection(params?: { host?: string; port?: number; timeoutMs?: number }) {
    const res = await fetch(`${API_BASE}/api/plc/gateway/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params || {})
    });
    return await res.json();
  },

  async sendTelnetRecipe(recipeA: number, recipeB: number, cradleCode?: string, model?: string) {
    const res = await fetch(`${API_BASE}/api/plc/gateway/send-recipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeA, recipeB, cradleCode, model })
    });
    return await res.json();
  },

  async sendTelnetRawCommand(command: string) {
    const res = await fetch(`${API_BASE}/api/plc/gateway/send-raw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command })
    });
    return await res.json();
  },

  async getTelnetLogs(count: number = 50) {
    const res = await fetch(`${API_BASE}/api/plc/gateway/logs?count=${count}`);
    return await res.json();
  },

  async clearTelnetLogs() {
    const res = await fetch(`${API_BASE}/api/plc/gateway/clear-logs`, { method: 'POST' });
    return await res.json();
  },

  async toggleTelnetMock(enable: boolean, port: number = 12345) {
    const res = await fetch(`${API_BASE}/api/plc/gateway/mock/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enable, port })
    });
    return await res.json();
  }
};

