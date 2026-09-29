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
  AlertOctagon,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Hash,
  Box,
  Check,
  RotateCw,
  RefreshCw,
  Radio,
  SlidersHorizontal,
  Info,
  AlertTriangle
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
      case 'WAITING_ORDER':
      case 'ORDER_LOADED': 
        return 1;
      case 'LOADING_RECIPE':
      case 'SENDING_RECIPE':
      case 'WAITING_RECIPE_CONFIRMATION':
      case 'RECIPE_CONFIRMED': 
        return 2;
      case 'CHECKING_CRADLE':
      case 'CHECKING_CRADLE_QR':
      case 'CRADLE_OK':
      case 'CRADLE_QR_OK': 
        return 3;
      case 'LOADING_PANEL_INSPECTION_PLAN':
      case 'CHECKING_PANEL':
      case 'PANEL_OK': 
        return 4;
      case 'SAVING_STATION_RESULT':
      case 'CYCLE_COMPLETE': 
        return 5;
      default: 
        return 1;
    }
  };

  const currentStep = getCurrentStepIndex();
  const isError = state === 'ERROR';
  const currentFrameBase64 = selectedCam !== 'ALL' ? frames[selectedCam] : null;

  // Secondary stream for mini-preview
  const miniCamId = selectedCam === 'CAM_CRADLE' ? 'CAM_PANEL_01' : 'CAM_CRADLE';
  const miniFrameBase64 = frames[miniCamId];

  const stepDetails = [
    {
      num: 1,
      title: '1. CONSULTA DB',
      subtitle: 'Orden, Secuencia y Mano',
      desc: 'Lectura de orden activa en tabla Producción_Secuencia'
    },
    {
      num: 2,
      title: '2. RECETA PLC',
      subtitle: 'Siemens DB48.DBW2',
      desc: 'Escritura directa de código nModeloCamara en PLC'
    },
    {
      num: 3,
      title: '3. CONTROL CUNA',
      subtitle: 'Inspección Cuna Física',
      desc: 'Validación de posicionamiento correcto y seguro'
    },
    {
      num: 4,
      title: '4. CONTROL PANEL',
      subtitle: 'Panel + Conf. DBX4.0',
      desc: 'Inspección visual de componentes y confirmación PLC'
    },
    {
      num: 5,
      title: '5. SIGUIENTE',
      subtitle: 'Trazabilidad y Avance',
      desc: 'Registro en base de datos y avance a próxima secuencia'
    }
  ];

  const currentStepInfo = stepDetails[currentStep - 1] || stepDetails[0];

  return (
    <div className="p-3 max-w-[1720px] mx-auto flex flex-col gap-3.5 font-sans select-none text-slate-800">

      {/* ========================================================================= */}
      {/* SECCIÓN 1: HERO DASHBOARD DE PIEZA ACTIVA (REMARCADO ULTRA VISIBLE)       */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        
        {/* 1.1 SECUENCIA */}
        <div className="neo-card p-4 rounded-3xl relative overflow-hidden flex flex-col justify-between border-t-2 border-t-white">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full neo-inset-subtle flex items-center justify-center text-slate-600">
                <Hash className="w-4 h-4 stroke-[2.5]" />
              </div>
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                SECUENCIA ACTIVA
              </span>
            </div>
            <span className="text-[10px] px-2.5 py-0.5 rounded-full neo-inset-subtle font-mono font-bold text-slate-600">
              PUESTO {stationCode}
            </span>
          </div>

          <div className="neo-inset p-3.5 rounded-2xl flex items-center justify-center my-1 bg-[#e2e8f0]">
            <span className="text-5xl lg:text-6xl font-black font-mono tracking-tight text-slate-900 drop-shadow-sm">
              {order?.secuencia || '0001'}
            </span>
          </div>

          <div className="flex items-center justify-between mt-2 pt-1 text-xs font-semibold text-slate-500">
            <span>ID Orden Producción:</span>
            <span className="font-bold font-mono text-slate-800 text-sm">#{order?.iD_OrdenProduccion || '6963'}</span>
          </div>
        </div>

        {/* 1.2 MODELO */}
        <div className="neo-card p-4 rounded-3xl relative overflow-hidden flex flex-col justify-between border-t-2 border-t-white">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full neo-inset-subtle flex items-center justify-center text-blue-600">
                <Box className="w-4 h-4 stroke-[2.5]" />
              </div>
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                MODELO VEHICULAR
              </span>
            </div>
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-extrabold border border-blue-200">
              VEHÍCULO
            </span>
          </div>

          <div className="neo-inset p-3.5 rounded-2xl flex items-center justify-center my-1 bg-[#e2e8f0]">
            <span className="text-4xl lg:text-5xl font-black text-blue-700 tracking-tight drop-shadow-sm">
              {order?.modelo || 'D3L'}
            </span>
          </div>

          <div className="flex items-center justify-between mt-2 pt-1 text-xs font-semibold text-slate-500">
            <span>Receta Siemens:</span>
            <span className="font-bold font-mono px-2 py-0.5 rounded-full neo-inset-subtle text-blue-700 text-sm">
              {cycle?.recipe_A ? `ID: ${cycle.recipe_A}` : 'ID: 19'}
            </span>
          </div>
        </div>

        {/* 1.3 MANO (LH / RH) */}
        <div className="neo-card p-4 rounded-3xl relative overflow-hidden flex flex-col justify-between border-t-2 border-t-white">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full neo-inset-subtle flex items-center justify-center text-emerald-600">
                {order?.mano === 'LH' ? <ArrowLeft className="w-4 h-4 stroke-[2.5]" /> : <ArrowRight className="w-4 h-4 stroke-[2.5]" />}
              </div>
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                MANO / LADO PIEZA
              </span>
            </div>
            <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-extrabold border ${
              order?.mano === 'RH' 
                ? 'bg-blue-100 text-blue-800 border-blue-200' 
                : 'bg-emerald-100 text-emerald-800 border-emerald-200'
            }`}>
              {order?.mano === 'RH' ? 'LADO DERECHO' : 'LADO IZQUIERDO'}
            </span>
          </div>

          <div className="neo-inset p-3.5 rounded-2xl flex items-center justify-center my-1 bg-[#e2e8f0]">
            {order?.mano === 'LH' ? (
              <div className="flex items-center gap-2.5 text-emerald-700 font-black text-3xl lg:text-4xl tracking-tight drop-shadow-sm">
                <ArrowLeft className="w-8 h-8 stroke-[3.5]" />
                <span>IZQUIERDA (LH)</span>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 text-blue-700 font-black text-3xl lg:text-4xl tracking-tight drop-shadow-sm">
                <span>DERECHA (RH)</span>
                <ArrowRight className="w-8 h-8 stroke-[3.5]" />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-2 pt-1 text-xs font-semibold text-slate-500">
            <span>Cuna Física Requerida:</span>
            <span className="font-bold font-mono text-emerald-700 text-sm">{cycle?.cradle_Code || 'CUNA-01'}</span>
          </div>
        </div>

        {/* 1.4 POSICIÓN (FRONT / REAR) */}
        <div className="neo-card p-4 rounded-3xl relative overflow-hidden flex flex-col justify-between border-t-2 border-t-white">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full neo-inset-subtle flex items-center justify-center text-amber-600">
                {order?.posicion === 'FRONT' ? <ArrowUp className="w-4 h-4 stroke-[2.5]" /> : <ArrowDown className="w-4 h-4 stroke-[2.5]" />}
              </div>
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                POSICIÓN PUERTA
              </span>
            </div>
            <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-extrabold border ${
              order?.posicion === 'FRONT' 
                ? 'bg-amber-100 text-amber-800 border-amber-200' 
                : 'bg-indigo-100 text-indigo-800 border-indigo-200'
            }`}>
              {order?.posicion === 'FRONT' ? 'DELANTERA' : 'TRASERA'}
            </span>
          </div>

          <div className="neo-inset p-3.5 rounded-2xl flex items-center justify-center my-1 bg-[#e2e8f0]">
            {order?.posicion === 'FRONT' ? (
              <div className="flex items-center gap-2.5 text-amber-700 font-black text-2xl lg:text-3xl tracking-tight drop-shadow-sm">
                <ArrowUp className="w-7 h-7 stroke-[3.5]" />
                <span>DELANTERA (FRONT)</span>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 text-indigo-700 font-black text-2xl lg:text-3xl tracking-tight drop-shadow-sm">
                <ArrowDown className="w-7 h-7 stroke-[3.5]" />
                <span>TRASERA (REAR)</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-2 pt-1 text-xs font-semibold text-slate-500">
            <span>Orientación:</span>
            <span className="font-bold font-mono text-amber-700 text-sm">
              {order?.posicion === 'FRONT' ? '000° FRONT' : '180° REAR'}
            </span>
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* SECCIÓN 2: EN QUÉ PASO ESTÁ (BANNER & DESLIZADOR NEUMORPHIC 5 PASOS)       */}
      {/* ========================================================================= */}
      <div className="neo-card p-4 rounded-3xl flex flex-col gap-3.5 border-t-2 border-t-white">
        
        {/* Encabezado del Paso Actual */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-300/70">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl neo-inset flex items-center justify-center bg-blue-50 text-blue-700 font-black text-xl shadow-sm border border-blue-200">
              {currentStep}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                  PASO ACTUAL EN EJECUCIÓN [{currentStep} / 5]
                </span>
                <span className={`w-2.5 h-2.5 rounded-full ${isError ? 'bg-red-500 animate-ping' : 'bg-blue-600 animate-pulse'}`}></span>
              </div>
              <h3 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                {currentStepInfo.title} — <span className="text-blue-600 font-bold">{currentStepInfo.subtitle}</span>
              </h3>
            </div>
          </div>

          {/* Estado vivo y alerta si corresponde */}
          <div className="flex items-center gap-2">
            {isError ? (
              <div className="px-4 py-2 rounded-full bg-red-100 border-2 border-red-400 text-red-700 text-xs font-black flex items-center gap-2 shadow-md animate-pulse">
                <AlertTriangle className="w-4 h-4" />
                <span>NO CONFORME • REINTENTANDO AUTOMÁTICAMENTE</span>
              </div>
            ) : (
              <div className="px-4 py-1.5 rounded-full neo-inset-subtle text-slate-700 text-xs font-bold flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span className="font-mono uppercase">ESTADO: {state.replace(/_/g, ' ')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Deslizador Neumorphic con marcas de regla y perilla circular flotante */}
        <div className="relative py-2 px-2">
          {/* Marcas de regla milimétrica como en la imagen */}
          <div className="flex justify-between items-center px-4 mb-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map(i => (
              <div key={i} className={i % 5 === 1 ? 'ruler-tick-tall' : 'ruler-tick'} />
            ))}
          </div>

          {/* Pista embutida (Sunken Track) */}
          <div className="h-4 neo-inset rounded-full overflow-hidden relative p-0.5">
            <div 
              className="h-full bg-gradient-to-r from-blue-600 to-blue-500 rounded-full transition-all duration-500 shadow-sm"
              style={{ width: `${((currentStep - 0.5) / 5) * 100}%` }}
            />
          </div>

          {/* Perilla circular flotante (Floating Thumb Knob) con foco */}
          <div 
            className="absolute top-6.5 -ml-4 w-8 h-8 rounded-full neo-thumb-knob flex items-center justify-center transition-all duration-500 pointer-events-none z-10"
            style={{ left: `${((currentStep - 0.5) / 5) * 100}%` }}
          >
            <div className="w-3 h-3 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.7)]"></div>
          </div>
        </div>

        {/* 5 Cápsulas Táctiles para cada paso (Píldoras Neumorphic) */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 pt-1">
          {stepDetails.map((step) => {
            const isCompleted = currentStep > step.num;
            const isCurrent = currentStep === step.num;

            return (
              <div 
                key={step.num}
                className={`p-3.5 rounded-2xl flex flex-col justify-between transition-all duration-300 relative ${
                  isCurrent 
                    ? 'neo-card bg-white border-2 border-blue-500 shadow-md ring-4 ring-blue-500/10' 
                    : isCompleted 
                      ? 'neo-card bg-[#f8fafc] border border-emerald-300/80' 
                      : 'neo-inset-subtle opacity-70'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black font-mono ${
                    isCurrent 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : isCompleted 
                        ? 'bg-emerald-600 text-white' 
                        : 'bg-slate-300 text-slate-600'
                  }`}>
                    {isCompleted ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : step.num}
                  </span>

                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                    isCurrent 
                      ? 'bg-blue-100 text-blue-700' 
                      : isCompleted 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : 'text-slate-400'
                  }`}>
                    {isCurrent ? '● EN CURSO' : isCompleted ? '✓ OK' : 'PENDIENTE'}
                  </span>
                </div>

                <div>
                  <h4 className={`text-xs font-black tracking-tight ${isCurrent ? 'text-blue-900' : 'text-slate-800'}`}>
                    {step.title}
                  </h4>
                  <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                    {step.subtitle}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* ========================================================================= */}
      {/* SECCIÓN 3: VIEWPORT DE CÁMARA & CONTROLES INDUSTRIALES TÁCTILES           */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3.5">

        {/* 3.1 COLUMNA IZQUIERDA: CÁMARA STREAM & TELEMETRÍA (8 COLS) */}
        <div className="xl:col-span-8 flex flex-col gap-3">
          
          <div className="neo-card p-3.5 rounded-3xl flex flex-col gap-2.5 border-t-2 border-t-white">
            
            {/* Header de la cámara: Selector de feeds con píldoras neumorphic */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-1.5 p-1 rounded-full neo-inset-subtle">
                <button
                  onClick={() => setSelectedCam('CAM_CRADLE')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                    selectedCam === 'CAM_CRADLE'
                      ? 'bg-white text-blue-700 shadow-sm font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  CUNA (CAM_CRADLE)
                </button>
                <button
                  onClick={() => setSelectedCam('CAM_PANEL_01')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                    selectedCam === 'CAM_PANEL_01'
                      ? 'bg-white text-blue-700 shadow-sm font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  PANEL SUP (CAM_PANEL_01)
                </button>
                <button
                  onClick={() => setSelectedCam('CAM_PANEL_02')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                    selectedCam === 'CAM_PANEL_02'
                      ? 'bg-white text-blue-700 shadow-sm font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  PANEL INF (CAM_PANEL_02)
                </button>
              </div>

              {/* Botón de Pausa / Live */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full neo-inset-subtle text-xs font-mono font-bold text-slate-700">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                  <span>1080P • LIVE</span>
                </div>
                <button
                  onClick={() => setIsPaused(!isPaused)}
                  className="p-2 rounded-full neo-btn cursor-pointer"
                  title={isPaused ? 'Reanudar video' : 'Pausar video'}
                >
                  {isPaused ? <Play className="w-4 h-4 fill-slate-700" /> : <Pause className="w-4 h-4 fill-slate-700" />}
                </button>
              </div>
            </div>

            {/* Viewport Screen */}
            <div className="relative bg-slate-950 rounded-2xl overflow-hidden aspect-[16/9] flex items-center justify-center shadow-inner group border border-slate-300/40">
              {currentFrameBase64 ? (
                <img 
                  src={`data:image/jpeg;base64,${currentFrameBase64}`} 
                  alt="Live Inspection Stream"
                  className="w-full h-full object-contain select-none"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 relative text-slate-400 p-6">
                  <Camera className="w-14 h-14 text-slate-600 mb-2 animate-pulse" />
                  <span className="text-xs font-bold font-mono tracking-widest text-slate-300 uppercase">
                    TRANSMISIÓN EN VIVO • {selectedCam.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-1">
                    Cámara USB Índice 0 (DirectShow / OpenCV) • 1920x1080
                  </span>
                </div>
              )}

              {/* HUD Retículo en esquinas */}
              {showHUD && (
                <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-mono text-white font-bold border border-white/20">
                      PIEZA: {order?.modelo || 'D3L'} / {order?.mano || 'LH'} / {order?.posicion || 'FRONT'}
                    </div>
                    <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-mono text-cyan-400 font-bold border border-white/20">
                      CUNA: {cycle?.cradle_Code || 'CUNA-01'}
                    </div>
                  </div>

                  <div className="flex justify-between items-end">
                    <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-mono text-emerald-400 font-bold border border-white/20">
                      PASO {currentStep}/5: {currentStepInfo.title}
                    </div>
                    <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-mono text-white font-bold border border-white/20">
                      CRONÓMETRO: {formatTimer(elapsedSec)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Subpanel inferior: Mini Feed + Ranuras de Telemetría Embutidas */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1">
              {/* Mini Preview feed */}
              <div 
                onClick={() => setSelectedCam(miniCamId)}
                className="md:col-span-4 neo-inset p-2 rounded-2xl cursor-pointer hover:border-blue-400 transition flex flex-col justify-between"
                title="Haga clic para alternar al stream principal"
              >
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 mb-1 px-1">
                  <span>MINI FEED: {miniCamId === 'CAM_CRADLE' ? 'CUNA' : 'PANEL'}</span>
                  <span className="text-blue-600 font-mono">CAMBIAR ⮂</span>
                </div>
                <div className="w-full aspect-[16/9] bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center relative shadow-inner">
                  {miniFrameBase64 ? (
                    <img src={`data:image/jpeg;base64,${miniFrameBase64}`} alt="Mini preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                      <Camera className="w-3 h-3" />
                      <span>{miniCamId}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 4 Ranuras embutidas de datos operativos */}
              <div className="md:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="neo-inset p-3 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-extrabold uppercase text-slate-500">CUNA CÓDIGO</span>
                  <span className="text-base font-black font-mono text-emerald-700">
                    {cycle?.cradle_Code || 'CUNA-01'}
                  </span>
                </div>

                <div className="neo-inset p-3 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-extrabold uppercase text-slate-500">RECETA PLC</span>
                  <span className="text-base font-black font-mono text-blue-700">
                    {cycle?.recipe_A ? `ID: ${cycle.recipe_A}` : 'ID: 19'}
                  </span>
                </div>

                <div className="neo-inset p-3 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-extrabold uppercase text-slate-500">EXPOSICIÓN</span>
                  <span className="text-base font-black font-mono text-slate-800">100 µs</span>
                </div>

                <div className="neo-inset p-3 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-extrabold uppercase text-slate-500">GANANCIA</span>
                  <span className="text-base font-black font-mono text-slate-800">0 dB</span>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* 3.2 COLUMNA DERECHA: COMUNICACIÓN PLC, ACCIONES Y JOG WHEEL (4 COLS) */}
        <div className="xl:col-span-4 flex flex-col gap-3">

          {/* Tarjeta Siemens PLC & Enlaces de Receta */}
          <div className="neo-card p-4 rounded-3xl flex flex-col gap-3 border-t-2 border-t-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full neo-inset-subtle flex items-center justify-center text-blue-600">
                  <Cpu className="w-4 h-4" />
                </div>
                <span className="text-xs font-black uppercase text-slate-700 tracking-wider">
                  PLC SIEMENS S7-1500
                </span>
              </div>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold border border-emerald-200">
                24V ONLINE
              </span>
            </div>

            <div className="neo-inset p-3.5 rounded-2xl flex flex-col gap-2.5 bg-[#e2e8f0]">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 font-semibold">Dirección Receta Inmediata:</span>
                <span className="font-mono font-black text-blue-700">DB48.DBW2: {cycle?.recipe_A || '19'}</span>
              </div>
              <div className="h-px bg-slate-300"></div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 font-semibold">Confirmación Booleana Panel:</span>
                <span className="font-mono font-black text-emerald-700">DB48.DBX4.0: TRUE</span>
              </div>
            </div>
          </div>

          {/* Botones de Acción Estilo Píldoras Táctiles */}
          <div className="neo-card p-4 rounded-3xl flex flex-col gap-3 border-t-2 border-t-white">
            <span className="text-xs font-black uppercase text-slate-500 tracking-wider">
              CONTROLES DE CELDA
            </span>

            <div className="grid grid-cols-3 gap-2.5">
              {/* Botón AUTO-RUN con luz indicadora circular */}
              <button
                onClick={onToggleAutoRun}
                className={`py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider transition cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                  autoRun
                    ? 'neo-btn-primary shadow-lg'
                    : 'neo-btn text-slate-600 hover:text-slate-900'
                }`}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${autoRun ? 'bg-white shadow-[0_0_8px_white]' : 'bg-slate-400'}`}></div>
                <span>AUTO-RUN</span>
              </button>

              {/* Botón PASO 1x */}
              <button
                onClick={onTriggerStep}
                className="neo-btn py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider hover:text-slate-900 transition cursor-pointer flex flex-col items-center justify-center gap-1.5"
              >
                <Play className="w-4 h-4 text-blue-600" />
                <span>PASO 1x</span>
              </button>

              {/* Botón RESET */}
              <button
                onClick={onReset}
                className={`py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider transition cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                  isError
                    ? 'bg-red-600 text-white shadow-lg animate-pulse'
                    : 'neo-btn text-slate-600 hover:text-slate-900'
                }`}
              >
                <RotateCw className="w-4 h-4" />
                <span>RESET</span>
              </button>
            </div>
          </div>

          {/* D-Pad Controller & E-STOP */}
          <div className="neo-card p-4 rounded-3xl flex items-center justify-between gap-3 border-t-2 border-t-white">
            
            {/* Botones secundarios AWB / HUD */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => onOpenTab('CALIBRATION')}
                className="neo-btn px-3 py-2 rounded-xl text-xs font-extrabold text-slate-700 hover:text-blue-600 cursor-pointer"
                title="Calibrar inspección"
              >
                CALIB
              </button>
              <button
                onClick={() => setShowHUD(!showHUD)}
                className={`px-3 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                  showHUD ? 'neo-inset text-blue-600 font-black' : 'neo-btn text-slate-600'
                }`}
                title="Alternar HUD"
              >
                HUD
              </button>
            </div>

            {/* D-Pad Circular táctil */}
            <div className="relative w-36 h-36 rounded-full neo-inset flex items-center justify-center p-2">
              <button
                onClick={() => setSelectedCam('CAM_CRADLE')}
                className="absolute top-1.5 text-slate-500 hover:text-blue-600 transition cursor-pointer"
                title="Cámara Cuna"
              >
                <ChevronUp className="w-5 h-5 stroke-[2.5]" />
              </button>
              <button
                onClick={() => setSelectedCam('CAM_PANEL_02')}
                className="absolute bottom-1.5 text-slate-500 hover:text-blue-600 transition cursor-pointer"
                title="Cámara Panel Inferior"
              >
                <ChevronDown className="w-5 h-5 stroke-[2.5]" />
              </button>
              <button
                onClick={() => setSelectedCam('CAM_PANEL_01')}
                className="absolute left-1.5 text-slate-500 hover:text-blue-600 transition cursor-pointer"
                title="Cámara Panel Superior"
              >
                <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
              </button>
              <button
                onClick={onTriggerStep}
                className="absolute right-1.5 text-slate-500 hover:text-blue-600 transition cursor-pointer"
                title="Avanzar paso"
              >
                <ChevronRight className="w-5 h-5 stroke-[2.5]" />
              </button>

              <button
                onClick={onTriggerStep}
                className="w-16 h-16 rounded-full neo-btn hover:text-blue-600 flex flex-col items-center justify-center active:scale-95 transition cursor-pointer shadow-md"
                title="Disparar inspección manual"
              >
                <Crosshair className="w-5 h-5 text-blue-600 stroke-[2.5]" />
                <span className="text-[9px] font-black font-mono text-slate-700 mt-0.5">INSP</span>
              </button>
            </div>

            {/* E-STOP Parada de Emergencia */}
            <button
              onClick={onEmergencyStop}
              className="w-14 h-14 rounded-2xl bg-gradient-to-b from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white flex flex-col items-center justify-center shadow-lg active:scale-95 transition cursor-pointer border-2 border-red-300/80"
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