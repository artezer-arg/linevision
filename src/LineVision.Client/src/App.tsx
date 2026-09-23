import React, { useEffect, useState } from 'react';
import { ProductionOrder, ProductionCycle, StationHealthStatus, StationState, UserSession } from './types';
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
import { Monitor, Cpu, Sliders, Wrench, History, UserCheck, Shield, Crosshair, Radio } from 'lucide-react';

export const App: React.FC = () => {
  const [stationState, setStationState] = useState<StationState>('WAITING_ORDER');
  const [order, setOrder] = useState<ProductionOrder | null>(null);
  const [cycle, setCycle] = useState<ProductionCycle | null>(null);
  const [frames, setFrames] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<StationHealthStatus | null>(null);
  const [autoRun, setAutoRun] = useState(true);
  const [activeTab, setActiveTab] = useState<'OPERATOR' | 'CALIBRATION' | 'PLC_COMM' | 'TECHNICAL' | 'SIMULATORS' | 'MAINTENANCE' | 'HISTORY'>('OPERATOR');
  const [user, setUser] = useState<UserSession>({
    username: 'operator',
    displayName: 'Operador Turno Mañana',
    role: 'OPERATOR'
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginUser, setLoginUser] = useState('admin');
  const [loginPass, setLoginPass] = useState('Industrial2026!');

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
      {/* 1. Header Operativo Industrial con Datos Gigantes de la Pieza */}
      <OperatorHeader
        stationCode="DL02"
        state={stationState}
        order={order}
        cradleCode={cycle?.cradle_Code}
        autoRun={autoRun}
        onToggleAutoRun={handleToggleAutoRun}
        onTriggerStep={handleTriggerStep}
        onReset={handleReset}
        onEmergencyStop={handleEmergencyStop}
      />

      {/* 2. Barra Visual de Flujo de Secuencia (Cuna -> QR -> Panel -> PLC -> Receta -> Robot) */}
      <StateFlowBar state={stationState} cycle={cycle} />

      {/* 3. Navigation Bar */}
      <nav className="bg-industrial-card border-b border-industrial-border px-4 py-2 flex items-center justify-between">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('OPERATOR')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center space-x-2 transition ${
              activeTab === 'OPERATOR' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Monitor className="w-4 h-4" />
            <span>Pantalla Operador</span>
          </button>

          <button
            onClick={() => setActiveTab('CALIBRATION')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center space-x-2 transition ${
              activeTab === 'CALIBRATION' ? 'bg-cyan-600 text-white shadow-md font-black' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Crosshair className="w-4 h-4" />
            <span>Calibración de Pasos</span>
          </button>

          <button
            onClick={() => setActiveTab('PLC_COMM')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center space-x-2 transition ${
              activeTab === 'PLC_COMM' ? 'bg-indigo-600 text-white shadow-md font-black ring-2 ring-indigo-400/40' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Radio className="w-4 h-4 text-cyan-400" />
            <span>Comunicación PLC</span>
          </button>

          <button
            onClick={() => setActiveTab('TECHNICAL')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center space-x-2 transition ${
              activeTab === 'TECHNICAL' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Diagnóstico Técnico</span>
          </button>

          <button
            onClick={() => setActiveTab('SIMULATORS')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center space-x-2 transition ${
              activeTab === 'SIMULATORS' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Consola de Simuladores</span>
          </button>

          <button
            onClick={() => setActiveTab('MAINTENANCE')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center space-x-2 transition ${
              activeTab === 'MAINTENANCE' ? 'bg-amber-600 text-black shadow-md font-black' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Wrench className="w-4 h-4" />
            <span>Mantenimiento & Bypass</span>
          </button>

          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center space-x-2 transition ${
              activeTab === 'HISTORY' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Historial Trazabilidad</span>
          </button>
        </div>

        {/* User Badge */}
        <div className="flex items-center space-x-3">
          <div className="text-right">
            <span className="text-[10px] uppercase text-slate-400 font-bold block">{user.role}</span>
            <span className="text-xs font-extrabold text-white">{user.displayName}</span>
          </div>
          <button
            onClick={() => setShowLoginModal(true)}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
            title="Cambiar usuario / Login"
          >
            <UserCheck className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* 4. Tab Views Content */}
      <main className="flex-1 overflow-y-auto">
        {activeTab === 'OPERATOR' && (
          <div className="space-y-4">
            <CameraDisplay frames={frames} />

            {/* Current Process Summary Banner */}
            <div className="mx-4 p-4 rounded-xl bg-industrial-card border border-industrial-border shadow-lg flex items-center justify-between text-xs">
              <div className="flex items-center space-x-6">
                <div>
                  <span className="text-slate-400 block font-semibold">CUNA FÍSICA:</span>
                  <span className="font-bold text-emerald-400 font-mono">
                    {cycle?.cradle_Code ? `${cycle.cradle_Code} (ASIGNADA)` : 'CUNA-01 (BASE)'}
                  </span>
                </div>
                <div className="h-6 w-px bg-slate-700"></div>
                <div>
                  <span className="text-slate-400 block font-semibold">QR ESCANEADO:</span>
                  <span className="font-bold text-cyan-400 font-mono">
                    {cycle?.qR_Cuna || 'CUNA-01'}
                  </span>
                </div>
                <div className="h-6 w-px bg-slate-700"></div>
                <div>
                  <span className="text-slate-400 block font-semibold">RECETA ROBOT:</span>
                  <span className="font-bold text-yellow-400 font-mono">
                    {cycle?.recipe_A ? `A:${cycle.recipe_A} / B:${cycle.recipe_B}` : 'PENDIENTE PASO 5'}
                  </span>
                </div>
                <div className="h-6 w-px bg-slate-700"></div>
                <div>
                  <span className="text-slate-400 block font-semibold">PLAN DE INSPECCIÓN:</span>
                  <span className="font-bold text-slate-200">
                    {cycle?.inspectionPlan || 'PLAN_PANEL_P1B_RH_FRONT (v1)'}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <span className="font-mono text-slate-400">
                  Ciclo ID: {cycle?.cycle_ID?.substring(0, 8) || 'INITIALIZING'}
                </span>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'CALIBRATION' && <CalibrationView frames={frames} />}
        {activeTab === 'PLC_COMM' && <PLCCommunicationView />}
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

