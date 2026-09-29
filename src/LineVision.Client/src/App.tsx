import React, { useEffect, useState } from 'react';
import { ProductionOrder, ProductionCycle, StationHealthStatus, StationState, UserSession, StationWorkflowConfig } from './types';
import { SignalRService, api } from './services/api';
import { OperatorHeader } from './components/OperatorHeader';
import { StateFlowBar } from './components/StateFlowBar';
import { CameraDisplay } from './components/CameraDisplay';
import { TechnicalView } from './components/TechnicalView';
import { SimulatorsView } from './components/SimulatorsView';
import { MaintenanceView } from './components/MaintenanceView';
import { HistoryView } from './components/HistoryView';
import { CalibrationView } from './components/CalibrationView';
import { PLCCommunicationView } from './components/PLCCommunicationView';
import { DatabaseConfigView } from './components/DatabaseConfigView';
import { TelemetryOperatorView } from './components/TelemetryOperatorView';
import { Monitor, Cpu, Sliders, Wrench, History, UserCheck, Shield, Crosshair, Radio, Database, Video } from 'lucide-react';

export const App: React.FC = () => {
  const [stationState, setStationState] = useState<StationState>('WAITING_ORDER');
  const [order, setOrder] = useState<ProductionOrder | null>(null);
  const [cycle, setCycle] = useState<ProductionCycle | null>(null);
  const [workflowConfig, setWorkflowConfig] = useState<StationWorkflowConfig | null>(null);
  const [frames, setFrames] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<StationHealthStatus | null>(null);
  const [autoRun, setAutoRun] = useState(true);
  const [activeTab, setActiveTab] = useState<'OPERATOR' | 'CALIBRATION' | 'CAMERAS' | 'PLC_COMM' | 'DATABASE' | 'TECHNICAL' | 'SIMULATORS' | 'MAINTENANCE' | 'HISTORY'>('OPERATOR');
  const [currentTime, setCurrentTime] = useState<string>('');
  const [user, setUser] = useState<UserSession>({
    username: 'operator',
    displayName: 'Operador Turno Mañana',
    role: 'OPERATOR'
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginUser, setLoginUser] = useState('admin');
  const [loginPass, setLoginPass] = useState('Industrial2026!');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString());
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const signalR = new SignalRService();

    signalR.start(
      (state, _reason) => setStationState(state),
      (ord) => setOrder(ord),
      (cyc) => setCycle(cyc),
      (camId, b64) => setFrames(prev => ({ ...prev, [camId]: b64 })),
      (hlt) => setHealth(hlt)
    );

    // Initial load via REST
    api.getStationState().then(data => {
      if (data) {
        setStationState(data.state);
        setOrder(data.order);
        setCycle(data.cycle);
        setAutoRun(data.isAutoRunEnabled);
        setHealth(data.health);
      }
    }).catch(console.error);

    api.getWorkflowConfig().then(cfg => {
      if (cfg) setWorkflowConfig(cfg);
    }).catch(console.error);

    return () => signalR.stop();
  }, []);

  const handleToggleAutoRun = async () => {
    const next = !autoRun;
    await api.setAutoRun(next);
    setAutoRun(next);
  };

  const handleTriggerStep = async () => {
    await api.triggerStep();
  };

  const handleReset = async () => {
    await api.resetFault(user.username);
  };

  const handleEmergencyStop = async () => {
    if (confirm('¿CONFIRMA PARADA DE EMERGENCIA EN EL PUESTO DL02?')) {
      await api.emergencyStop('Operador presionó botón de emergencia en HMI');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const session = await api.login(loginUser, loginPass);
    if (session) {
      setUser(session);
      setShowLoginModal(false);
    } else {
      alert('Credenciales incorrectas');
    }
  };

  return (
    <div className={`min-h-screen ${activeTab === 'OPERATOR' ? 'bg-[#e9edf2] text-slate-800' : 'bg-industrial-dark text-slate-100'} flex flex-col font-sans select-none`}>
      {/* 1. Header de Telemetría Estilo Soft Neumorphic / Command Center */}
      <header className="bg-[#edf2f7] border-b border-[#cbd5e1] px-4 py-2.5 flex items-center justify-between shadow-sm">
        {/* Left: Brand Logo & Station Badge */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#2563eb] to-[#3b82f6] flex items-center justify-center shadow-[3px_3px_8px_rgba(166,178,196,0.6),-3px_-3px_8px_rgba(255,255,255,0.9)]">
              <Crosshair className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-black text-slate-800 tracking-wider font-mono">LineVision</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 font-bold font-mono">
                  DL02
                </span>
              </div>
              <span className="text-[9px] text-slate-500 font-mono tracking-tight font-semibold">AI VISION & MES CONTROL</span>
            </div>
          </div>
        </div>

        {/* Center: Capsule Pill Navigation (matching reference image) */}
        <div className="flex items-center neo-inset p-1 rounded-full space-x-1">
          <button
            onClick={() => setActiveTab('OPERATOR')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center space-x-2 transition cursor-pointer ${
              activeTab === 'OPERATOR'
                ? 'bg-[#f1f5f9] text-[#2563eb] shadow-[3px_3px_6px_rgba(166,178,196,0.5),-3px_-3px_6px_rgba(255,255,255,0.9)] font-black'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Controlador HUD</span>
          </button>

          <button
            onClick={() => setActiveTab('CALIBRATION')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'CALIBRATION'
                ? 'bg-[#f1f5f9] text-[#2563eb] shadow-[3px_3px_6px_rgba(166,178,196,0.5),-3px_-3px_6px_rgba(255,255,255,0.9)] font-black'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Calibración</span>
          </button>

          <button
            onClick={() => setActiveTab('CAMERAS')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'CAMERAS'
                ? 'bg-[#f1f5f9] text-[#2563eb] shadow-[3px_3px_6px_rgba(166,178,196,0.5),-3px_-3px_6px_rgba(255,255,255,0.9)] font-black'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Cámaras</span>
          </button>

          <button
            onClick={() => setActiveTab('PLC_COMM')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'PLC_COMM'
                ? 'bg-[#f1f5f9] text-[#2563eb] shadow-[3px_3px_6px_rgba(166,178,196,0.5),-3px_-3px_6px_rgba(255,255,255,0.9)] font-black'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>PLC Siemens</span>
          </button>

          <button
            onClick={() => setActiveTab('DATABASE')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'DATABASE'
                ? 'bg-[#f1f5f9] text-[#2563eb] shadow-[3px_3px_6px_rgba(166,178,196,0.5),-3px_-3px_6px_rgba(255,255,255,0.9)] font-black'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Base de Datos</span>
          </button>

          <button
            onClick={() => setActiveTab('TECHNICAL')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'TECHNICAL'
                ? 'bg-[#f1f5f9] text-[#2563eb] shadow-[3px_3px_6px_rgba(166,178,196,0.5),-3px_-3px_6px_rgba(255,255,255,0.9)] font-black'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Diagnóstico</span>
          </button>

          <button
            onClick={() => setActiveTab('SIMULATORS')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'SIMULATORS'
                ? 'bg-[#f1f5f9] text-[#2563eb] shadow-[3px_3px_6px_rgba(166,178,196,0.5),-3px_-3px_6px_rgba(255,255,255,0.9)] font-black'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Simuladores</span>
          </button>

          <button
            onClick={() => setActiveTab('MAINTENANCE')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'MAINTENANCE'
                ? 'bg-[#f1f5f9] text-[#2563eb] shadow-[3px_3px_6px_rgba(166,178,196,0.5),-3px_-3px_6px_rgba(255,255,255,0.9)] font-black'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Mantenimiento</span>
          </button>

          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'HISTORY'
                ? 'bg-[#f1f5f9] text-[#2563eb] shadow-[3px_3px_6px_rgba(166,178,196,0.5),-3px_-3px_6px_rgba(255,255,255,0.9)] font-black'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Historial</span>
          </button>
        </div>

        {/* Right: Telemetry Status Badges */}
        <div className="flex items-center space-x-2.5">
          {/* DB Status Pill */}
          <div className="px-3 py-1 rounded-full neo-card text-xs font-mono flex items-center space-x-1.5">
            <span className={`w-2 h-2 rounded-full ${health?.databaseConnected ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-rose-500'}`}></span>
            <span className="text-slate-700 font-bold">TB-L</span>
          </div>

          {/* PLC Status Pill */}
          <div className="px-3 py-1 rounded-full neo-card text-xs font-mono flex items-center space-x-1.5">
            <span className={`w-2 h-2 rounded-full ${health?.plcConnected ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-rose-500'}`}></span>
            <span className="text-slate-700 font-bold">PLC S7</span>
          </div>

          {/* Auto-Run Ongoing Pill */}
          <button
            onClick={handleToggleAutoRun}
            className={`px-3 py-1 rounded-full text-xs font-mono font-bold flex items-center space-x-1.5 border transition cursor-pointer ${
              autoRun
                ? 'bg-blue-600 text-white border-blue-500 shadow-[0_0_12px_rgba(37,99,235,0.4)]'
                : 'neo-card text-slate-500 border-slate-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoRun ? 'bg-white animate-ping' : 'bg-slate-400'}`}></span>
            <span>{autoRun ? 'Ongoing • AUTO' : 'Pausado • MAN'}</span>
          </button>

          {/* Digital Clock */}
          <div className="px-3 py-1 rounded-full neo-inset text-xs font-mono font-black text-slate-800">
            {currentTime || '11:43 AM'}
          </div>

          {/* User Button */}
          <button
            onClick={() => setShowLoginModal(true)}
            className="p-1.5 rounded-full neo-card text-slate-600 hover:text-blue-600 transition cursor-pointer"
            title={`Sesión: ${user.displayName} (${user.role})`}
          >
            <UserCheck className="w-4 h-4 text-blue-600" />
          </button>
        </div>
      </header>

      {/* 2. Tab Views Content */}
      <main className="flex-1 overflow-y-auto">
        {activeTab === 'OPERATOR' && (
          <TelemetryOperatorView
            stationCode="DL02"
            state={stationState}
            order={order}
            cycle={cycle}
            workflowConfig={workflowConfig}
            frames={frames}
            health={health}
            autoRun={autoRun}
            onToggleAutoRun={handleToggleAutoRun}
            onTriggerStep={handleTriggerStep}
            onReset={handleReset}
            onEmergencyStop={handleEmergencyStop}
            onOpenTab={setActiveTab}
          />
        )}
        {activeTab === 'CALIBRATION' && <CalibrationView frames={frames} />}
        {activeTab === 'CAMERAS' && <CameraDisplay frames={frames} />}
        {activeTab === 'PLC_COMM' && (
          <PLCCommunicationView
            workflowConfig={workflowConfig}
            onWorkflowConfigUpdated={setWorkflowConfig}
          />
        )}
        {activeTab === 'DATABASE' && <DatabaseConfigView />}
        {activeTab === 'TECHNICAL' && <TechnicalView health={health} state={stationState} cycle={cycle} />}
        {activeTab === 'SIMULATORS' && <SimulatorsView />}
        {activeTab === 'MAINTENANCE' && (
          <MaintenanceView
            currentState={stationState}
            currentUser={user}
            onLoginPrompt={() => setShowLoginModal(true)}
          />
        )}
        {activeTab === 'HISTORY' && <HistoryView />}
      </main>

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fade-in">
          <form onSubmit={handleLogin} className="bg-industrial-card border border-industrial-border rounded-xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-2 border-b border-industrial-border pb-3">
              <Shield className="w-5 h-5 text-blue-400" />
              <h3 className="font-extrabold text-sm text-white">Autenticación Industrial</h3>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">Usuario:</label>
              <select
                value={loginUser}
                onChange={e => setLoginUser(e.target.value)}
                className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2 text-xs text-white"
              >
                <option value="admin">admin (ADMINISTRADOR TOTAL)</option>
                <option value="engineer">engineer (INGENIERO DE CALIDAD)</option>
                <option value="maintenance">maintenance (MANTENIMIENTO / BYPASS)</option>
                <option value="operator">operator (OPERADOR DE LÍNEA)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">Contraseña:</label>
              <input
                type="password"
                value={loginPass}
                onChange={e => setLoginPass(e.target.value)}
                className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2 text-xs text-white"
              />
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowLoginModal(false)}
                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-bold text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-black text-white"
              >
                Ingresar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default App;

