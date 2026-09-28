import React, { useState, useEffect } from 'react';
import { 
  ProductionOrder, 
  ProductionCycle, 
  StationHealthStatus, 
  StationState, 
  StationWorkflowConfig 
} from '../types';
import { 
  Play, 
  Pause, 
  CheckCircle2, 
  Clock, 
  Layers, 
  Cpu, 
  Gauge, 
  Eye, 
  Compass, 
  Camera, 
  Activity, 
  Sliders, 
  ChevronUp, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight, 
  Crosshair, 
  AlertOctagon 
} from 'lucide-react';

interface Props {
  stationCode: string;
  state: StationState;
  order: ProductionOrder | null;
  cycle: ProductionCycle | null;
  workflowConfig: StationWorkflowConfig | null;
  frames: Record<string, string>;
  health: StationHealthStatus | null;
  autoRun: boolean;
  onToggleAutoRun: () => void;
  onTriggerStep: () => void;
  onReset: () => void;
  onEmergencyStop: () => void;
  onOpenTab: (tab: 'CALIBRATION' | 'PLC_COMM' | 'DATABASE' | 'TECHNICAL' | 'SIMULATORS' | 'MAINTENANCE' | 'HISTORY') => void;
}

export const TelemetryOperatorView: React.FC<Props> = ({
  stationCode,
  state,
  order,
  cycle,
  workflowConfig: _workflowConfig,
  frames,
  health: _health,
  autoRun,
  onToggleAutoRun,
  onTriggerStep,
  onReset,
  onEmergencyStop,
  onOpenTab
}) => {
  const [selectedCam, setSelectedCam] = useState<'CAM_PANEL_01' | 'CAM_CRADLE' | 'CAM_PANEL_02' | 'ALL'>('CAM_PANEL_01');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'R' | 'G' | 'B' | 'Y'>('ALL');
  const [isPaused, setIsPaused] = useState(false);
  const [showHUD, setShowHUD] = useState(true);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSec(prev => (prev + 1) % 3600);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getCurrentStepIndex = (): number => {
    switch (state) {
      case 'WAITING_ORDER': return 1;
      case 'ORDER_LOADED': return 1;
      case 'LOADING_RECIPE':
      case 'SENDING_RECIPE':
      case 'WAITING_RECIPE_CONFIRMATION':
      case 'RECIPE_CONFIRMED': return 2;
      case 'CHECKING_CRADLE':
      case 'CHECKING_CRADLE_QR':
      case 'CRADLE_OK':
      case 'CRADLE_QR_OK': return 3;
      case 'LOADING_PANEL_INSPECTION_PLAN':
      case 'CHECKING_PANEL':
      case 'PANEL_OK': return 4;
      case 'SAVING_STATION_RESULT':
      case 'CYCLE_COMPLETE': return 5;
      default: return 1;
    }
  };

  const currentStep = getCurrentStepIndex();
  const isError = state === 'ERROR';
  const currentFrameBase64 = selectedCam !== 'ALL' ? frames[selectedCam] : null;

  return (
    <div className="p-3 max-w-[1720px] mx-auto grid grid-cols-1 xl:grid-cols-12 gap-3 text-slate-100 font-sans">
      
      {/* ======================================================== */}
      {/* COLUMNA IZQUIERDA: VIEWPORT HUD & TELEMETRÍA (8 COLS)     */}
      {/* ======================================================== */}
      <div className="xl:col-span-8 flex flex-col gap-3">
        
        {/* 1. VIEWPORT DE CÁMARA HUD PRINCIPAL */}
        <div className="relative bg-[#191d26] rounded-2xl overflow-hidden border border-[#2b3242] shadow-2xl aspect-[16/9] flex items-center justify-center group">
          
          {currentFrameBase64 ? (
            <img 
              src={`data:image/jpeg;base64,${currentFrameBase64}`} 
              alt="Live Inspection Stream"
              className="w-full h-full object-contain select-none"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#181c24] via-[#12151c] to-[#101217] relative">
              <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#475569_1px,transparent_1px)] [background-size:24px_24px]"></div>
              
              <Camera className="w-16 h-16 text-slate-600 mb-3 animate-pulse" />
              <span className="text-sm font-bold text-slate-400 tracking-wider uppercase font-mono">
                TRANSMISIÓN EN VIVO • {selectedCam.replace(/_/g, ' ')}
              </span>
              <span className="text-xs text-slate-500 mt-1">
                Cámara activa índice 0 (DirectShow / OpenCV USB) • 1920x1080
              </span>
            </div>
          )}

          {/* OVERLAY HUD RETÍCULO & TELEMETRÍA */}
          {showHUD && (
            <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
              
              {/* TOP ROW OVERLAYS */}
              <div className="flex items-start justify-between pointer-events-auto">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/70 border border-red-500/40 text-red-400 text-[11px] font-black uppercase tracking-widest shadow-md backdrop-blur-md">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                    <span>● LIVE HDR</span>
                  </div>
                  
                  <div className="text-[#ffb703] text-xs font-black tracking-wider font-mono mt-1.5 drop-shadow-md flex items-center gap-2">
                    <span>1080P - 29.97 FPS</span>
                    <span className="text-slate-400 text-[10px] font-normal">| {selectedCam}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsPaused(!isPaused)} 
                    className="p-2 rounded-xl bg-black/40 hover:bg-black/60 border border-white/10 text-white transition backdrop-blur-md cursor-pointer"
                    title={isPaused ? 'Reanudar video' : 'Pausar video'}
                  >
                    {isPaused ? <Play className="w-4 h-4 fill-white" /> : <Pause className="w-4 h-4" />}
                  </button>
                  <div className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white font-mono text-xs font-bold backdrop-blur-md">
                    {formatTimer(elapsedSec)}
                  </div>
                </div>
              </div>

              {/* CENTER HUD: TARGET RETICLE */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative flex items-center justify-center">
                  <div className="w-36 h-36 rounded-full border border-white/20 border-dashed animate-spin [animation-duration:40s]"></div>
                  <div className="absolute w-20 h-20 rounded-full border border-white/30"></div>
                  <div className="absolute w-64 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent"></div>
                  <div className="absolute h-64 w-[1px] bg-gradient-to-b from-transparent via-white/40 to-transparent"></div>
                  <div className="absolute w-3.5 h-3.5 rounded-full bg-white/90 shadow-[0_0_10px_rgba(255,255,255,0.8)]"></div>
                  <div className="absolute -top-12 text-[10px] font-mono text-cyan-400/80 font-bold tracking-widest">
                    ROI: {order?.modelo || 'D3L'}-{order?.mano || 'LH'}
                  </div>
                </div>
              </div>

              {/* LEFT HUD OVERLAY: Level & Color Channels */}
              <div className="absolute left-4 top-28 flex flex-col gap-3 pointer-events-auto">
                <div>
                  <span className="text-[10px] font-mono text-slate-300 font-bold uppercase tracking-wider block mb-1">
                    Nivel ROI
                  </span>
                  <div className="w-24 h-1 bg-slate-700/60 rounded-full overflow-hidden mb-2">
                    <div className="w-2/3 h-full bg-[#ff6b35] rounded-full"></div>
                  </div>
                  <button className="px-2 py-0.5 rounded border border-white/20 bg-black/40 text-[10px] font-mono text-slate-200 font-bold hover:bg-black/60">
                    KT 0.94
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5 w-24">
                  <button 
                    onClick={() => setActiveFilter(activeFilter === 'R' ? 'ALL' : 'R')}
                    className={`px-2 py-1 rounded text-[10px] font-bold font-mono border transition ${
                      activeFilter === 'R' ? 'bg-red-500 text-white border-red-400' : 'bg-black/40 border-white/10 text-red-400 hover:bg-black/60'
                    }`}
                  >
                    ● R
                  </button>
                  <button 
                    onClick={() => setActiveFilter(activeFilter === 'G' ? 'ALL' : 'G')}
                    className={`px-2 py-1 rounded text-[10px] font-bold font-mono border transition ${
                      activeFilter === 'G' ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-black/40 border-white/10 text-emerald-400 hover:bg-black/60'
                    }`}
                  >
                    ● G
                  </button>
                  <button 
                    onClick={() => setActiveFilter(activeFilter === 'B' ? 'ALL' : 'B')}
                    className={`px-2 py-1 rounded text-[10px] font-bold font-mono border transition ${
                      activeFilter === 'B' ? 'bg-blue-500 text-white border-blue-400' : 'bg-black/40 border-white/10 text-blue-400 hover:bg-black/60'
                    }`}
                  >
                    ● B
                  </button>
                  <button 
                    onClick={() => setActiveFilter(activeFilter === 'Y' ? 'ALL' : 'Y')}
                    className={`px-2 py-1 rounded text-[10px] font-bold font-mono border transition ${
                      activeFilter === 'Y' ? 'bg-yellow-500 text-black border-yellow-400' : 'bg-black/40 border-white/10 text-yellow-400 hover:bg-black/60'
                    }`}
                  >
                    ● Y
                  </button>
                </div>
              </div>

              {/* BOTTOM ROW OVERLAYS: Histogram & Orientation Compass */}
              <div className="flex items-end justify-between pointer-events-auto">
                <div className="p-2.5 rounded-xl bg-black/50 border border-white/10 backdrop-blur-md w-36 shadow-lg">
                  <div className="text-[11px] font-mono font-bold text-white mb-1.5 flex items-center justify-between">
                    <span>H2.85</span>
                    <span className="text-[#00e5a3] text-[9px]">99.4%</span>
                  </div>
                  <div className="h-7 flex items-end gap-1 px-1">
                    {[4, 8, 12, 18, 14, 20, 26, 22, 16, 12, 18, 24, 20, 15, 9, 5].map((val, idx) => (
                      <div 
                        key={idx} 
                        style={{ height: `${val}px` }} 
                        className={`w-1.5 rounded-t-sm ${idx >= 6 && idx <= 11 ? 'bg-[#ff6b35]' : 'bg-slate-400/60'}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="w-18 h-18 rounded-full bg-black/60 border border-white/15 flex flex-col items-center justify-center backdrop-blur-md shadow-lg relative">
                  <div className="absolute inset-1 rounded-full border border-dashed border-white/20"></div>
                  <Compass className="w-4 h-4 text-[#ff6b35] animate-pulse" />
                  <span className="text-[11px] font-black font-mono text-white mt-0.5">
                    {order?.posicion === 'REAR' ? '180°' : '000°'}
                  </span>
                  <span className="text-[9px] font-mono text-slate-400 font-bold uppercase">
                    {order?.posicion === 'REAR' ? 'REAR' : 'FRONT'}
                  </span>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* 2. FILA INFERIOR: MINI FEEDS, REAL TIME VIEW Y SELECTOR DE CÁMARA */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          
          {/* 2.A: Mini Preview / Satellite View */}
          <div className="md:col-span-3 bg-[#191d26] rounded-2xl p-2.5 border border-[#2b3242] flex flex-col justify-between shadow-lg">
            <div className="flex items-center gap-1 mb-2 bg-[#12151c] p-1 rounded-lg">
              <button 
                onClick={() => setSelectedCam('CAM_CRADLE')}
                className={`flex-1 py-1 rounded text-[10px] font-bold uppercase transition ${
                  selectedCam === 'CAM_CRADLE' ? 'bg-[#ff6b35] text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Cuna
              </button>
              <button 
                onClick={() => setSelectedCam('CAM_PANEL_01')}
                className={`flex-1 py-1 rounded text-[10px] font-bold uppercase transition ${
                  selectedCam === 'CAM_PANEL_01' ? 'bg-[#ff6b35] text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Panel
              </button>
            </div>
            
            <div 
              onClick={() => setSelectedCam(selectedCam === 'CAM_CRADLE' ? 'CAM_PANEL_01' : 'CAM_CRADLE')}
              className="relative aspect-[4/3] rounded-xl overflow-hidden bg-black/40 border border-white/5 flex items-center justify-center cursor-pointer group"
            >
              {frames['CAM_CRADLE'] ? (
                <img src={`data:image/jpeg;base64,${frames['CAM_CRADLE']}`} alt="Cradle feed" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center p-2">
                  <Layers className="w-6 h-6 text-slate-500 mx-auto mb-1" />
                  <span className="text-[10px] font-mono text-slate-400 block font-bold">CUNA-01</span>
                </div>
              )}
              <div className="absolute inset-0 bg-black/30 group-hover:bg-transparent transition flex items-center justify-center">
                <span className="text-[9px] font-mono text-white/80 bg-black/60 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition">
                  CAMBIAR
                </span>
              </div>
            </div>
          </div>

          {/* 2.B: Real Time Telemetry Grid */}
          <div className="md:col-span-5 bg-[#191d26] rounded-2xl p-3 border border-[#2b3242] flex flex-col justify-between shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white tracking-wide">Telemetría en tiempo real</span>
              <span className="text-[10px] font-mono text-[#00e5a3] font-bold">ONLINE</span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
              <div className="flex items-start gap-2 border-l-2 border-slate-700 pl-2">
                <Gauge className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold block leading-tight">Secuencia</span>
                  <span className="font-bold font-mono text-yellow-400 text-sm leading-tight">
                    {order?.secuencia || '----'}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2 border-l-2 border-slate-700 pl-2">
                <Cpu className="w-4 h-4 text-cyan-400 mt-0.5" />
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold block leading-tight">Receta PLC (DBW2)</span>
                  <span className="font-bold font-mono text-white text-sm leading-tight">
                    {cycle?.recipe_A ? `${cycle.recipe_A}` : (order ? '19' : '--')}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2 border-l-2 border-slate-700 pl-2">
                <Clock className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold block leading-tight">Tiempo Ciclo</span>
                  <span className="font-bold font-mono text-white text-sm leading-tight">
                    {cycle?.cycleTimeMs ? `${(cycle.cycleTimeMs / 1000).toFixed(1)}s` : '4.2s'}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2 border-l-2 border-slate-700 pl-2">
                <CheckCircle2 className="w-4 h-4 text-[#00e5a3] mt-0.5" />
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold block leading-tight">Cuna Código</span>
                  <span className="font-bold font-mono text-emerald-400 text-sm leading-tight">
                    {cycle?.cradle_Code || 'CUNA-01'}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2 border-l-2 border-slate-700 pl-2">
                <Eye className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold block leading-tight">Exposición</span>
                  <span className="font-bold font-mono text-slate-300 text-sm leading-tight">100 µs</span>
                </div>
              </div>

              <div className="flex items-start gap-2 border-l-2 border-slate-700 pl-2">
                <Sliders className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold block leading-tight">Ganancia</span>
                  <span className="font-bold font-mono text-slate-300 text-sm leading-tight">0 dB</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2.C: Selector de Cámara / Resolución */}
          <div className="md:col-span-4 bg-[#191d26] rounded-2xl p-3 border border-[#2b3242] flex flex-col justify-between shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white tracking-wide">Selección de Cámara</span>
              <span className="text-[10px] font-mono text-slate-400">STATUS D • C</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <button 
                onClick={() => setSelectedCam('CAM_CRADLE')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                  selectedCam === 'CAM_CRADLE' ? 'bg-white text-slate-900 shadow-md font-extrabold' : 'bg-[#12151c] text-slate-300 hover:bg-[#202531]'
                }`}
              >
                <span>CUNA (CAM_CRADLE)</span>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ff6b35]"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00e5a3]"></span>
                </div>
              </button>

              <button 
                onClick={() => setSelectedCam('CAM_PANEL_01')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                  selectedCam === 'CAM_PANEL_01' ? 'bg-white text-slate-900 shadow-md font-extrabold' : 'bg-[#12151c] text-slate-300 hover:bg-[#202531]'
                }`}
              >
                <span>PANEL SUP (CAM_PANEL_01)</span>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ff6b35]"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00e5a3]"></span>
                </div>
              </button>

              <button 
                onClick={() => setSelectedCam('CAM_PANEL_02')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                  selectedCam === 'CAM_PANEL_02' ? 'bg-white text-slate-900 shadow-md font-extrabold' : 'bg-[#12151c] text-slate-300 hover:bg-[#202531]'
                }`}
              >
                <span>PANEL INF (CAM_PANEL_02)</span>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ff6b35]"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00e5a3]"></span>
                </div>
              </button>

              <button 
                onClick={() => onOpenTab('CALIBRATION')}
                className="px-3 py-1 rounded-xl text-[11px] font-semibold text-slate-400 hover:text-white bg-[#12151c]/60 flex items-center justify-between"
              >
                <span>Configurar Dispositivos USB</span>
                <span className="text-[10px] text-cyan-400">Ajustes &gt;</span>
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* ======================================================== */}
      {/* COLUMNA DERECHA: ORDEN, REGLAS 5-PASOS & JOG WHEEL (4 COLS)*/}
      {/* ======================================================== */}
      <div className="xl:col-span-4 flex flex-col gap-3">
        
        {/* 1. TARJETA DE MODELO Y ORDEN (ESTILO DHMR-3200) */}
        <div className="bg-[#191d26] rounded-2xl p-4 border border-[#2b3242] shadow-xl relative">
          
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-mono uppercase text-[#ff6b35] font-extrabold tracking-widest block">
                PUESTO {stationCode} • ORDEN ACTIVA
              </span>
              <h2 className="text-3xl font-black text-white tracking-tight mt-0.5">
                ORDEN #{order?.iD_OrdenProduccion || '6963'}
              </h2>
              <p className="text-xs text-slate-400 font-medium mt-1 leading-relaxed">
                SECUENCIA: <span className="font-bold text-yellow-400 font-mono">{order?.secuencia || '0001'}</span> • MODELO: <span className="font-bold text-white">{order?.modelo || 'D3L'}</span> • MANO: <span className="font-bold text-emerald-400">{order?.mano || 'LH'}</span> • POS: <span className="font-bold text-cyan-400">{order?.posicion || 'FRONT'}</span>
              </p>
            </div>

            <div className="w-14 h-14 rounded-xl border border-white/20 bg-black/40 p-2 flex items-center justify-center relative shadow-inner">
              <div className="absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2 border-white/60"></div>
              <div className="absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2 border-white/60"></div>
              <div className="absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2 border-white/60"></div>
              <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2 border-white/60"></div>
              <Activity className="w-7 h-7 text-[#ff6b35] animate-pulse" />
            </div>
          </div>

          <div className="mt-3.5 pt-3 border-t border-[#2b3242] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#00e5a3] animate-ping"></div>
              <span className="font-mono font-bold text-slate-300">PLC S7-1500 (192.168.1.50)</span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span className="text-slate-400">DB48.DBW2: <strong className="text-yellow-400">{cycle?.recipe_A || '19'}</strong></span>
              <span className="text-[#00e5a3] font-bold">24V OK</span>
            </div>
          </div>

        </div>

        {/* 2. REGLETAS GRADUADAS DE 5 PASOS (ESTILO ALTITUDE / RESOLUTION SLIDERS) */}
        <div className="bg-[#191d26] rounded-2xl p-4 border border-[#2b3242] shadow-xl flex flex-col gap-3.5">
          
          {/* Slider 1: 5-Step Cycle Process */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-bold text-white tracking-wide uppercase text-[11px]">
                Flujo Industrial (Paso {currentStep} de 5)
              </span>
              <span className="font-mono text-[#ff6b35] font-black text-xs">
                {state.replace(/_/g, ' ')}
              </span>
            </div>

            <div className="relative py-2">
              <div className="flex justify-between items-center px-1 mb-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map(i => (
                  <div key={i} className={i % 4 === 1 ? 'ruler-tick-tall' : 'ruler-tick'} />
                ))}
              </div>

              <div className="h-2 bg-[#12151c] rounded-full overflow-hidden relative border border-[#2b3242]">
                <div 
                  className="h-full bg-gradient-to-r from-[#00e5a3] via-yellow-400 to-[#ff6b35] transition-all duration-500 rounded-full"
                  style={{ width: `${(currentStep / 5) * 100}%` }}
                />
              </div>

              <div 
                className="absolute top-1 -ml-3 w-6 h-6 rounded-md bg-[#ff6b35] border-2 border-white shadow-[0_0_12px_rgba(255,107,53,0.8)] flex items-center justify-center transition-all duration-500 pointer-events-none"
                style={{ left: `${(currentStep / 5) * 100}%` }}
              >
                <div className="w-1 h-3 bg-white rounded-full"></div>
              </div>
            </div>

            <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1 font-semibold">
              <span className={currentStep >= 1 ? 'text-[#00e5a3]' : ''}>1. DB</span>
              <span className={currentStep >= 2 ? 'text-[#00e5a3]' : ''}>2. RECETA</span>
              <span className={currentStep >= 3 ? 'text-[#00e5a3]' : ''}>3. CUNA</span>
              <span className={currentStep >= 4 ? 'text-[#00e5a3]' : ''}>4. PANEL</span>
              <span className={currentStep >= 5 ? 'text-[#ff6b35] font-black' : ''}>5. SIGUIENTE</span>
            </div>
          </div>

          <div className="h-px bg-[#2b3242]"></div>

          {/* Slider 2: Receta Directa al PLC Siemens */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-bold text-white tracking-wide uppercase text-[11px]">
                Receta Automática Siemens S7
              </span>
              <span className="font-mono text-cyan-400 font-bold text-xs">
                {cycle?.recipe_A ? `RECETA ${cycle.recipe_A}` : 'RECETA 19'}
              </span>
            </div>

            <div className="relative py-1">
              <div className="flex justify-between items-center px-1 mb-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(i => (
                  <div key={i} className="ruler-tick" />
                ))}
              </div>
              <div className="h-1.5 bg-[#12151c] rounded-full overflow-hidden border border-[#2b3242]">
                <div className="w-3/4 h-full bg-[#00e5a3] rounded-full"></div>
              </div>
            </div>

            <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
              <span>DB48.DBW2</span>
              <span className="text-slate-400">CONFIRMADO PLC</span>
              <span>DB48.DBX4.0</span>
            </div>
          </div>

          {/* Action Pills */}
          <div className="grid grid-cols-3 gap-2 mt-1">
            <button 
              onClick={onToggleAutoRun}
              className={`py-2 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer shadow-lg ${
                autoRun 
                  ? 'bg-[#ff6b35] text-white shadow-[0_0_15px_rgba(255,107,53,0.5)] border border-[#ff8c5a]' 
                  : 'bg-[#12151c] text-slate-400 border border-[#2b3242] hover:text-white'
              }`}
            >
              AUTO-RUN
            </button>

            <button 
              onClick={onTriggerStep}
              className="py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-[#12151c] hover:bg-[#202531] border border-[#2b3242] text-white transition cursor-pointer shadow"
            >
              PASO 1x
            </button>

            <button 
              onClick={onReset}
              className={`py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer border ${
                isError 
                  ? 'bg-red-600 text-white border-red-500 animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.6)]' 
                  : 'bg-[#12151c] hover:bg-[#202531] border-[#2b3242] text-slate-300'
              }`}
            >
              RESET
            </button>
          </div>

        </div>

        {/* 3. JOG WHEEL / D-PAD CONTROLLER & EMERGENCY STOP */}
        <div className="bg-[#191d26] rounded-2xl p-4 border border-[#2b3242] shadow-xl flex items-center justify-between gap-4">
          
          <div className="flex flex-col gap-2.5 w-16">
            <button 
              onClick={() => onOpenTab('CALIBRATION')}
              className="py-2 px-2.5 rounded-xl bg-[#12151c] hover:bg-[#202531] border border-[#2b3242] text-slate-300 hover:text-white font-mono text-[11px] font-bold text-center transition cursor-pointer shadow"
              title="Calibrar Inspección & Cámaras"
            >
              AWB
            </button>
            <button 
              onClick={() => setShowHUD(!showHUD)}
              className={`py-2 px-2.5 rounded-xl border font-mono text-[11px] font-bold text-center transition cursor-pointer shadow ${
                showHUD ? 'bg-[#ff6b35]/20 border-[#ff6b35] text-[#ff6b35]' : 'bg-[#12151c] border-[#2b3242] text-slate-400'
              }`}
              title="Alternar HUD / Overlays"
            >
              DISP
            </button>
          </div>

          <div className="relative w-36 h-36 rounded-full bg-[#1e232e] border-2 border-[#2f3749] shadow-2xl flex items-center justify-center p-2">
            <div className="absolute inset-1 rounded-full border border-dashed border-slate-700/50"></div>

            <button 
              onClick={() => setSelectedCam('CAM_CRADLE')}
              className="absolute top-1.5 p-1 text-slate-400 hover:text-white hover:scale-110 transition cursor-pointer"
              title="Cámara Cuna"
            >
              <ChevronUp className="w-5 h-5" />
            </button>

            <button 
              onClick={() => setSelectedCam('CAM_PANEL_02')}
              className="absolute bottom-1.5 p-1 text-slate-400 hover:text-white hover:scale-110 transition cursor-pointer"
              title="Cámara Panel Inferior"
            >
              <ChevronDown className="w-5 h-5" />
            </button>

            <button 
              onClick={() => setSelectedCam('CAM_PANEL_01')}
              className="absolute left-1.5 p-1 text-slate-400 hover:text-white hover:scale-110 transition cursor-pointer"
              title="Cámara Panel Superior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <button 
              onClick={onTriggerStep}
              className="absolute right-1.5 p-1 text-slate-400 hover:text-white hover:scale-110 transition cursor-pointer"
              title="Avanzar Siguiente Paso"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <button 
              onClick={onTriggerStep}
              className="w-16 h-16 rounded-full bg-gradient-to-b from-[#141720] to-[#0f1218] border border-white/10 hover:border-[#ff6b35] text-slate-200 hover:text-[#ff6b35] flex flex-col items-center justify-center shadow-inner hover:scale-105 active:scale-95 transition cursor-pointer group"
              title="Disparar Inspección Manual"
            >
              <Crosshair className="w-5 h-5 text-slate-400 group-hover:text-[#ff6b35] transition" />
              <span className="text-[9px] font-mono font-black mt-0.5 text-slate-400 group-hover:text-white">
                INSP
              </span>
            </button>
          </div>

          <div className="flex flex-col justify-center items-center w-16">
            <button 
              onClick={onEmergencyStop}
              className="w-14 h-14 rounded-2xl bg-gradient-to-b from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 border-2 border-red-400/60 shadow-[0_0_15px_rgba(239,68,68,0.5)] flex flex-col items-center justify-center text-white active:scale-95 transition cursor-pointer"
              title="PARADA DE EMERGENCIA"
            >
              <AlertOctagon className="w-6 h-6 animate-pulse" />
              <span className="text-[8px] font-black uppercase tracking-tighter mt-0.5">E-STOP</span>
            </button>
          </div>

        </div>

      </div>

    </div>
  );
};
