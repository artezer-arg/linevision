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
import { Monitor, Cpu, Sliders, Wrench, History, UserCheck, Shield, Crosshair, Radio, Database } from 'lucide-react';

export const App: React.FC = () => {
  const [stationState, setStationState] = useState<StationState>('WAITING_ORDER');
  const [order, setOrder] = useState<ProductionOrder | null>(null);
  const [cycle, setCycle] = useState<ProductionCycle | null>(null);
  const [workflowConfig, setWorkflowConfig] = useState<StationWorkflowConfig | null>(null);
  const [frames, setFrames] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<StationHealthStatus | null>(null);
  const [autoRun, setAutoRun] = useState(true);
  const [activeTab, setActiveTab] = useState<'OPERATOR' | 'CALIBRATION' | 'PLC_COMM' | 'DATABASE' | 'TECHNICAL' | 'SIMULATORS' | 'MAINTENANCE' | 'HISTORY'>('OPERATOR');
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
    <div className="min-h-screen bg-industrial-dark text-slate-100 flex flex-col font-sans select-none">
      {/* 1. Header de Telemetría Estilo Centro de Comando */}
      <header className="bg-[#141720] border-b border-[#252c3c] px-4 py-2 flex items-center justify-between shadow-xl">
        {/* Left: Brand Logo & Station Badge */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#ff6b35] to-[#ff8c5a] flex items-center justify-center shadow-[0_0_12px_rgba(255,107,53,0.5)]">
              <Crosshair className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-black text-white tracking-wider font-mono">LineVision</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#ff6b35]/20 text-[#ff6b35] border border-[#ff6b35]/40 font-bold font-mono">
                  DL02
                </span>
              </div>
              <span className="text-[9px] text-slate-500 font-mono tracking-tight">AI VISION & MES CONTROL</span>
            </div>
          </div>
        </div>

        {/* Center: Capsule Pill Navigation (matching reference image) */}
        <div className="flex items-center bg-[#1b1f2b] p-1 rounded-2xl border border-[#2b3242] shadow-inner space-x-1">
          <button
            onClick={() => setActiveTab('OPERATOR')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-2 transition cursor-pointer ${
              activeTab === 'OPERATOR'
                ? 'bg-white text-slate-900 shadow-lg font-black'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Controlador HUD</span>
          </button>

          <button
            onClick={() => setActiveTab('CALIBRATION')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'CALIBRATION'
                ? 'bg-white text-slate-900 shadow-lg font-black'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Calibración</span>
          </button>

          <button
            onClick={() => setActiveTab('PLC_COMM')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'PLC_COMM'
                ? 'bg-white text-slate-900 shadow-lg font-black'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>PLC Siemens</span>
          </button>

          <button
            onClick={() => setActiveTab('DATABASE')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'DATABASE'
                ? 'bg-white text-slate-900 shadow-lg font-black'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Base de Datos</span>
          </button>

          <button
            onClick={() => setActiveTab('TECHNICAL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'TECHNICAL'
                ? 'bg-white text-slate-900 shadow-lg font-black'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Diagnóstico</span>
          </button>

          <button
            onClick={() => setActiveTab('SIMULATORS')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'SIMULATORS'
                ? 'bg-white text-slate-900 shadow-lg font-black'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Simuladores</span>
          </button>

          <button
            onClick={() => setActiveTab('MAINTENANCE')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'MAINTENANCE'
                ? 'bg-white text-slate-900 shadow-lg font-black'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Mantenimiento</span>
          </button>

          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer ${
              activeTab === 'HISTORY'
                ? 'bg-white text-slate-900 shadow-lg font-black'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Historial</span>
          </button>
        </div>

        {/* Right: Telemetry Status Badges */}
        <div className="flex items-center space-x-2.5">
          {/* DB Status Pill */}
          <div className="px-2.5 py-1 rounded-xl bg-[#1b1f2b] border border-[#2b3242] text-xs font-mono flex items-center space-x-1.5">
            <span className={`w-2 h-2 rounded-full ${health?.databaseConnected ? 'bg-[#00e5a3] shadow-[0_0_8px_#00e5a3]' : 'bg-red-500'}`}></span>
            <span className="text-slate-300 font-semibold">TB-L</span>
          </div>

          {/* PLC Status Pill */}
          <div className="px-2.5 py-1 rounded-xl bg-[#1b1f2b] border border-[#2b3242] text-xs font-mono flex items-center space-x-1.5">
            <span className={`w-2 h-2 rounded-full ${health?.plcConnected ? 'bg-[#00e5a3] shadow-[0_0_8px_#00e5a3]' : 'bg-red-500'}`}></span>
            <span className="text-slate-300 font-semibold">PLC S7</span>
          </div>

          {/* Auto-Run Ongoing Pill */}
          <button
            onClick={handleToggleAutoRun}
            className={`px-3 py-1 rounded-xl text-xs font-mono font-bold flex items-center space-x-1.5 border transition cursor-pointer ${
              autoRun
                ? 'bg-[#00e5a3]/15 border-[#00e5a3]/40 text-[#00e5a3] shadow-[0_0_10px_rgba(0,229,163,0.3)]'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${autoRun ? 'bg-[#00e5a3] animate-ping' : 'bg-slate-500'}`}></span>
            <span>{autoRun ? 'Ongoing • AUTO' : 'Pausado • MAN'}</span>
          </button>

          {/* Digital Clock */}
          <div className="px-3 py-1 rounded-xl bg-[#1b1f2b] border border-[#2b3242] text-xs font-mono font-black text-white shadow-inner">
            {currentTime || '11:43 AM'}
          </div>

          {/* User Button */}
          <button
            onClick={() => setShowLoginModal(true)}
            className="p-1.5 rounded-xl bg-[#1b1f2b] hover:bg-[#252c3c] border border-[#2b3242] text-slate-300 hover:text-white transition cursor-pointer"
            title={`Sesión: ${user.displayName} (${user.role})`}
          >
            <UserCheck className="w-4 h-4 text-cyan-400" />
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

