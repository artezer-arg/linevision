import React, { useState, useEffect } from 'react';
import { 
  ProductionOrder, 
  ProductionCycle, 
  StationHealthStatus, 
  StationState, 
  StationWorkflowConfig,
  PLCLiveTelemetry
} from '../types';
import { 
  Play, 
  Pause, 
  Cpu, 
  Camera, 
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
  AlertTriangle,
  Settings
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
  plcLive?: PLCLiveTelemetry | null;
  onOpenTab: (tab: 'CALIBRATION' | 'CAMERAS' | 'PLC_COMM' | 'DATABASE' | 'TECHNICAL' | 'SIMULATORS' | 'MAINTENANCE' | 'HISTORY') => void;
}

export const TelemetryOperatorView: React.FC<Props> = ({
  stationCode,
  state,
  order,
  cycle,
  workflowConfig: _workflowConfig,
  frames,
  health: _health,
  plcLive,
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
    <div className="w-full px-3 py-2.5 lg:px-5 flex flex-col gap-2.5 font-sans select-none text-slate-800">

      {/* ========================================================================= */}
      {/* SECCIÓN 1: HERO DASHBOARD DE PIEZA ACTIVA (COMPACTO, ANCHO TOTAL & ULTRA VISIBLE) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        
        {/* 1.1 SECUENCIA */}
        <div className="neo-card px-4 py-2.5 rounded-2xl flex flex-col justify-between border-t border-t-white shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-500">
              <Hash className="w-3.5 h-3.5 stroke-[2.5]" />
              <span className="text-[10px] font-black uppercase tracking-wider">
                SECUENCIA ACTIVA
              </span>
            </div>
            <span className="text-[9px] px-2 py-0.5 rounded-full neo-inset-subtle font-mono font-bold text-slate-600">
              PUESTO {stationCode}
            </span>
          </div>

          <div className="flex items-baseline justify-between mt-1">
            <span className="text-3xl xl:text-4xl font-black font-mono tracking-tight text-slate-900 drop-shadow-sm">
              {order?.secuencia || '0001'}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 font-mono">
              ID: <span className="font-bold text-slate-700">#{order?.iD_OrdenProduccion || '6961'}</span>
            </span>
          </div>
        </div>

        {/* 1.2 MODELO */}
        <div className="neo-card px-4 py-2.5 rounded-2xl flex flex-col justify-between border-t border-t-white shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-blue-600">
              <Box className="w-3.5 h-3.5 stroke-[2.5]" />
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                MODELO VEHICULAR
              </span>
            </div>
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-extrabold border border-blue-200">
              VEHÍCULO
            </span>
          </div>

          <div className="flex items-baseline justify-between mt-1">
            <span className="text-3xl xl:text-4xl font-black tracking-tight text-blue-700 drop-shadow-sm">
              {order?.modelo || 'D3L'}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 font-mono">
              Receta: <span className="font-bold text-blue-700">{cycle?.recipe_A ? `ID: ${cycle.recipe_A}` : 'ID: 19'}</span>
            </span>
          </div>
        </div>

        {/* 1.3 MANO (LH / RH) */}
        <div className="neo-card px-4 py-2.5 rounded-2xl flex flex-col justify-between border-t border-t-white shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-emerald-600">
              {order?.mano === 'LH' ? <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" /> : <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />}
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                MANO / LADO PIEZA
              </span>
            </div>
            <span className={`text-[9px] px-2 py-0.5 rounded-full font-extrabold border ${
              order?.mano === 'RH' 
                ? 'bg-blue-100 text-blue-800 border-blue-200' 
                : 'bg-emerald-100 text-emerald-800 border-emerald-200'
            }`}>
              {order?.mano === 'RH' ? 'LADO DERECHO' : 'LADO IZQUIERDO'}
            </span>
          </div>

          <div className="flex items-baseline justify-between mt-1">
            <div className={`flex items-center gap-1.5 font-black text-2xl xl:text-3xl tracking-tight drop-shadow-sm ${
              order?.mano === 'RH' ? 'text-blue-700' : 'text-emerald-700'
            }`}>
              {order?.mano === 'LH' && <ArrowLeft className="w-6 h-6 stroke-[3]" />}
              <span>{order?.mano === 'RH' ? 'DERECHA (RH)' : 'IZQUIERDA (LH)'}</span>
              {order?.mano === 'RH' && <ArrowRight className="w-6 h-6 stroke-[3]" />}
            </div>
            <span className="text-[11px] font-semibold text-slate-500 font-mono">
              Cuna: <span className="font-bold text-emerald-700">{cycle?.cradle_Code || 'CUNA-01'}</span>
            </span>
          </div>
        </div>

        {/* 1.4 POSICIÓN (FRONT / REAR) */}
        <div className="neo-card px-4 py-2.5 rounded-2xl flex flex-col justify-between border-t border-t-white shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-amber-600">
              {order?.posicion === 'FRONT' ? <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" /> : <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />}
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                POSICIÓN PUERTA
              </span>
            </div>
            <span className={`text-[9px] px-2 py-0.5 rounded-full font-extrabold border ${
              order?.posicion === 'FRONT' 
                ? 'bg-amber-100 text-amber-800 border-amber-200' 
                : 'bg-indigo-100 text-indigo-800 border-indigo-200'
            }`}>
              {order?.posicion === 'FRONT' ? 'DELANTERA' : 'TRASERA'}
            </span>
          </div>

          <div className="flex items-baseline justify-between mt-1">
            <div className={`flex items-center gap-1.5 font-black text-2xl xl:text-3xl tracking-tight drop-shadow-sm ${
              order?.posicion === 'FRONT' ? 'text-amber-700' : 'text-indigo-700'
            }`}>
              {order?.posicion === 'FRONT' ? <ArrowUp className="w-6 h-6 stroke-[3]" /> : <ArrowDown className="w-6 h-6 stroke-[3]" />}
              <span>{order?.posicion === 'FRONT' ? 'DELANTERA (FRONT)' : 'TRASERA (REAR)'}</span>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 font-mono">
              {order?.posicion === 'FRONT' ? '000° FRONT' : '180° REAR'}
            </span>
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* SECCIÓN 2: EN QUÉ PASO ESTÁ (BARRA DE PROGRESO COMPACTA & INTUITIVA)       */}
      {/* ========================================================================= */}
      <div className="neo-card px-4 py-2 rounded-2xl flex flex-wrap lg:flex-nowrap items-center justify-between gap-3 border-t border-t-white shadow-sm">
        
        {/* Paso actual e información principal */}
        <div className="flex items-center gap-2.5 min-w-[280px]">
          <div className="w-8 h-8 rounded-xl neo-inset flex items-center justify-center bg-blue-50 text-blue-700 font-black text-sm border border-blue-200 shadow-inner shrink-0">
            {currentStep}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                PASO {currentStep}/5
              </span>
              <span className={`w-2 h-2 rounded-full ${isError ? 'bg-red-500 animate-ping' : 'bg-blue-600 animate-pulse'}`}></span>
              <span className="text-xs font-black text-slate-900 tracking-tight">
                {currentStepInfo.title}
              </span>
            </div>
            <span className="text-[11px] text-blue-600 font-semibold">
              {currentStepInfo.subtitle}
            </span>
          </div>
        </div>

        {/* 5 Cápsulas de paso horizontales */}
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-1.5 items-center">
          {stepDetails.map((step) => {
            const isCompleted = currentStep > step.num;
            const isCurrent = currentStep === step.num;

            return (
              <div 
                key={step.num}
                className={`px-2.5 py-1.5 rounded-xl flex items-center justify-between text-xs transition-all ${
                  isCurrent 
                    ? 'bg-blue-600 text-white font-black shadow-sm ring-2 ring-blue-500/20' 
                    : isCompleted 
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold' 
                      : 'neo-inset-subtle text-slate-400 font-medium'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                    isCurrent 
                      ? 'bg-white text-blue-700' 
                      : isCompleted 
                        ? 'bg-emerald-600 text-white' 
                        : 'bg-slate-300 text-slate-600'
                  }`}>
                    {isCompleted ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : step.num}
                  </span>
                  <span className="truncate text-[11px] tracking-tight">{step.title.replace(/^\d+\.\s*/, '')}</span>
                </div>
                <span className={`text-[9px] font-black px-1 rounded ml-1 hidden xl:inline ${
                  isCurrent ? 'bg-blue-700 text-blue-100' : isCompleted ? 'text-emerald-700' : 'text-slate-400'
                }`}>
                  {isCurrent ? 'EN CURSO' : isCompleted ? 'OK' : ''}
                </span>
              </div>
            );
          })}
        </div>

        {/* Estado actual / Alerta */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isError ? (
            <div className="px-3 py-1 rounded-full bg-red-100 border border-red-400 text-red-700 text-[11px] font-black flex items-center gap-1.5 animate-pulse shadow-sm">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>REINTENTANDO</span>
            </div>
          ) : (
            <div className="px-3 py-1 rounded-full neo-inset-subtle text-slate-700 text-[11px] font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="font-mono uppercase">{state.replace(/_/g, ' ')}</span>
            </div>
          )}
        </div>

      </div>

      {/* ========================================================================= */}
      {/* SECCIÓN 3: VIEWPORT DE CÁMARA & CONTROLES INDUSTRIALES TÁCTILES           */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5">

        {/* 3.1 COLUMNA IZQUIERDA: CÁMARA STREAM & TELEMETRÍA (8 COLS) */}
        <div className="lg:col-span-8 flex flex-col gap-2 neo-card p-3 rounded-2xl border-t border-t-white shadow-sm">
          
          {/* Header de la cámara: Selector de feeds con píldoras neumorphic */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-1 p-0.5 rounded-full neo-inset-subtle">
              <button
                onClick={() => setSelectedCam('CAM_CRADLE')}
                className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                  selectedCam === 'CAM_CRADLE'
                    ? 'bg-white text-blue-700 shadow-sm font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                CUNA (CAM_CRADLE)
              </button>
              <button
                onClick={() => setSelectedCam('CAM_PANEL_01')}
                className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                  selectedCam === 'CAM_PANEL_01'
                    ? 'bg-white text-blue-700 shadow-sm font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                PANEL SUP (CAM_PANEL_01)
              </button>
              <button
                onClick={() => setSelectedCam('CAM_PANEL_02')}
                className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                  selectedCam === 'CAM_PANEL_02'
                    ? 'bg-white text-blue-700 shadow-sm font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                PANEL INF (CAM_PANEL_02)
              </button>
              <button
                onClick={() => onOpenTab('CAMERAS')}
                className="px-2 py-1 rounded-full text-xs font-bold text-slate-500 hover:text-blue-700 transition cursor-pointer flex items-center gap-1"
                title="Configurar orígenes físicos de cámaras USB / Simulador"
              >
                <Settings className="w-3 h-3" />
                <span className="hidden sm:inline text-[10px]">Elegir Origen</span>
              </button>
            </div>

            {/* Botón de Pausa / Live */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full neo-inset-subtle text-[11px] font-mono font-bold text-slate-700">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                <span>1080P • LIVE</span>
              </div>
              <button
                onClick={() => setIsPaused(!isPaused)}
                className="p-1.5 rounded-full neo-btn cursor-pointer"
                title={isPaused ? 'Reanudar video' : 'Pausar video'}
              >
                {isPaused ? <Play className="w-3.5 h-3.5 fill-slate-700" /> : <Pause className="w-3.5 h-3.5 fill-slate-700" />}
              </button>
            </div>
          </div>

          {/* Viewport Screen con tamaño adaptable sin recortar (object-contain) */}
          <div className="relative bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center shadow-inner group border border-slate-300/40 h-[380px] xl:h-[460px] 2xl:h-[520px]">
            {currentFrameBase64 ? (
              <img 
                src={`data:image/jpeg;base64,${currentFrameBase64}`} 
                alt="Live Inspection Stream"
                className="w-full h-full object-contain select-none"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 relative text-slate-400 p-6">
                <Camera className="w-12 h-12 text-slate-600 mb-2 animate-pulse" />
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
              <div className="absolute inset-0 pointer-events-none p-3 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <div className="bg-black/65 backdrop-blur-md px-2.5 py-1 rounded-lg text-[11px] font-mono text-white font-bold border border-white/20">
                    PIEZA: {order?.modelo || 'D3L'} / {order?.mano || 'LH'} / {order?.posicion || 'FRONT'}
                  </div>
                  <div className="bg-black/65 backdrop-blur-md px-2.5 py-1 rounded-lg text-[11px] font-mono text-cyan-400 font-bold border border-white/20">
                    CUNA: {cycle?.cradle_Code || 'CUNA-01'}
                  </div>
                </div>

                <div className="flex justify-between items-end">
                  <div className="bg-black/65 backdrop-blur-md px-2.5 py-1 rounded-lg text-[11px] font-mono text-emerald-400 font-bold border border-white/20">
                    PASO {currentStep}/5: {currentStepInfo.title}
                  </div>
                  <div className="bg-black/65 backdrop-blur-md px-2.5 py-1 rounded-lg text-[11px] font-mono text-white font-bold border border-white/20">
                    CRONÓMETRO: {formatTimer(elapsedSec)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Subpanel inferior: Mini Feed compacto + Ranuras de Telemetría */}
          <div className="flex items-center gap-2 pt-0.5">
            {/* Mini Preview feed con click para alternar */}
            <div 
              onClick={() => setSelectedCam(miniCamId)}
              className="neo-inset p-1 rounded-xl cursor-pointer hover:border-blue-400 transition flex items-center gap-2 shrink-0 pr-2.5"
              title="Haga clic para alternar al stream principal"
            >
              <div className="w-16 h-10 bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center relative shadow-inner shrink-0">
                {miniFrameBase64 ? (
                  <img src={`data:image/jpeg;base64,${miniFrameBase64}`} alt="Mini preview" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-3.5 h-3.5 text-slate-500" />
                )}
              </div>
              <div className="flex flex-col text-[10px] leading-tight">
                <span className="font-extrabold text-slate-700">{miniCamId === 'CAM_CRADLE' ? 'CUNA' : 'PANEL'}</span>
                <span className="text-blue-600 font-mono font-bold text-[9px]">CAMBIAR ⮂</span>
              </div>
            </div>

            {/* 4 Ranuras embutidas de datos operativos */}
            <div className="flex-1 grid grid-cols-4 gap-1.5">
              <div className="neo-inset px-2.5 py-1 rounded-xl flex flex-col justify-center">
                <span className="text-[9px] font-extrabold uppercase text-slate-500">CUNA CÓDIGO</span>
                <span className="text-xs font-black font-mono text-emerald-700 truncate">
                  {cycle?.cradle_Code || 'CUNA-01'}
                </span>
              </div>

              <div className="neo-inset px-2.5 py-1 rounded-xl flex flex-col justify-center">
                <span className="text-[9px] font-extrabold uppercase text-slate-500">RECETA PLC</span>
                <span className="text-xs font-black font-mono text-blue-700 truncate">
                  {cycle?.recipe_A ? `ID: ${cycle.recipe_A}` : 'ID: 19'}
                </span>
              </div>

              <div className="neo-inset px-2.5 py-1 rounded-xl flex flex-col justify-center">
                <span className="text-[9px] font-extrabold uppercase text-slate-500">EXPOSICIÓN</span>
                <span className="text-xs font-black font-mono text-slate-800">100 µs</span>
              </div>

              <div className="neo-inset px-2.5 py-1 rounded-xl flex flex-col justify-center">
                <span className="text-[9px] font-extrabold uppercase text-slate-500">GANANCIA</span>
                <span className="text-xs font-black font-mono text-slate-800">0 dB</span>
              </div>
            </div>
          </div>

        </div>

        {/* 3.2 COLUMNA DERECHA: COMUNICACIÓN PLC, ACCIONES Y JOG WHEEL (4 COLS) */}
        <div className="lg:col-span-4 flex flex-col gap-2.5">

          {/* Tarjeta Siemens PLC & Lectura en Vivo */}
          <div className="neo-card p-3 rounded-2xl flex flex-col gap-2 border-t border-t-white shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-full neo-inset-subtle flex items-center justify-center text-blue-600">
                  <Cpu className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] font-black uppercase text-slate-700 tracking-wider">
                  PLC SIEMENS S7-1500 (DB48)
                </span>
              </div>
              <span className={`text-[9px] px-2 py-0.5 rounded-full font-extrabold border ${
                plcLive?.isConnected
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : (plcLive?.protocol === 'SIMULATOR' ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-rose-100 text-rose-800 border-rose-200')
              }`}>
                {plcLive?.isConnected ? 'ONLINE 24V' : (plcLive?.protocol === 'SIMULATOR' ? 'SIMULADOR' : 'OFFLINE')}
              </span>
            </div>

            {/* Cuadro de Lectura En Vivo de Registros DB48 */}
            <div className="neo-inset px-3 py-2 rounded-xl flex flex-col gap-1.5 bg-[#e2e8f0]">
              {/* Offset 6: Handshake principal leído */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-600">Lectura Offset 6 (DB48.DBW6):</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-black font-mono text-purple-700 bg-white/80 px-2 py-0.5 rounded-lg shadow-xs border border-purple-200">
                    {plcLive?.offset6_Value ?? 20}
                  </span>
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                    (plcLive?.offset6_Value ?? 20) === 20
                      ? 'bg-blue-600 text-white'
                      : (plcLive?.offset6_Value === 10 ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-700')
                  }`}>
                    {(plcLive?.offset6_Value ?? 20) === 20 ? 'REQ RECETA' : ((plcLive?.offset6_Value) === 10 ? 'ACK RECIBIDO' : 'REPOSO (24)')}
                  </span>
                </div>
              </div>

              <div className="h-px bg-slate-300"></div>

              {/* Offset 2: Receta / Reposo */}
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-600 font-semibold">Valor en DB48.DBW2:</span>
                <span className={`font-mono font-black px-1.5 py-0.5 rounded text-xs ${(plcLive?.offset2_Recipe ?? 24) === 24 ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                  {(plcLive?.offset2_Recipe ?? 24) === 24 ? '24 (REPOSO)' : `ID: ${plcLive?.offset2_Recipe ?? cycle?.recipe_A} (RECETA)`}
                </span>
              </div>

              <div className="h-px bg-slate-300"></div>

              {/* Offset 4.0: Confirmación */}
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-600 font-semibold">Confirmación DB48.DBX4.0:</span>
                <span className={`font-mono font-black ${
                  (plcLive?.offset4_Confirmation ?? true) ? 'text-emerald-700' : 'text-slate-500'
                }`}>
                  {(plcLive?.offset4_Confirmation ?? true) ? 'TRUE (Confirmado)' : 'FALSE'}
                </span>
              </div>

              <div className="h-px bg-slate-300"></div>

              {/* Estado Handshake & Latencia */}
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span className="truncate max-w-[170px]" title={cycle?.plcStartState || plcLive?.handshakeStage || 'HANDSHAKE_ACTIVO'}>
                  Estado: <strong className="text-slate-700 font-mono">{cycle?.plcStartState || plcLive?.handshakeStage || 'HANDSHAKE_ACTIVO'}</strong>
                </span>
                <span className="font-mono font-bold text-slate-600">
                  {plcLive?.latencyMs ? `${plcLive.latencyMs}ms` : '3ms'}
                </span>
              </div>
            </div>
          </div>

          {/* Botones de Acción Estilo Píldoras Táctiles */}
          <div className="neo-card p-3 rounded-2xl flex flex-col gap-2 border-t border-t-white shadow-sm">
            <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
              CONTROLES DE CELDA
            </span>

            <div className="grid grid-cols-3 gap-2">
              {/* Botón AUTO-RUN con luz indicadora circular */}
              <button
                onClick={onToggleAutoRun}
                className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  autoRun
                    ? 'neo-btn-primary shadow-md'
                    : 'neo-btn text-slate-600 hover:text-slate-900'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${autoRun ? 'bg-white shadow-[0_0_6px_white]' : 'bg-slate-400'}`}></div>
                <span>AUTO-RUN</span>
              </button>

              {/* Botón PASO 1x */}
              <button
                onClick={onTriggerStep}
                className="neo-btn py-2.5 rounded-xl text-xs font-black uppercase tracking-wider hover:text-slate-900 transition cursor-pointer flex flex-col items-center justify-center gap-1"
              >
                <Play className="w-3.5 h-3.5 text-blue-600" />
                <span>PASO 1x</span>
              </button>

              {/* Botón RESET */}
              <button
                onClick={onReset}
                className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  isError
                    ? 'bg-red-600 text-white shadow-lg animate-pulse'
                    : 'neo-btn text-slate-600 hover:text-slate-900'
                }`}
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>RESET</span>
              </button>
            </div>
          </div>

          {/* D-Pad Controller & E-STOP */}
          <div className="neo-card p-3 rounded-2xl flex items-center justify-between gap-3 border-t border-t-white shadow-sm flex-1 min-h-[140px]">
            
            {/* Botones secundarios AWB / HUD */}
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => onOpenTab('CALIBRATION')}
                className="neo-btn px-3 py-1.5 rounded-xl text-xs font-extrabold text-slate-700 hover:text-blue-600 cursor-pointer"
                title="Calibrar inspección"
              >
                CALIB
              </button>
              <button
                onClick={() => setShowHUD(!showHUD)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                  showHUD ? 'neo-inset text-blue-600 font-black' : 'neo-btn text-slate-600'
                }`}
                title="Alternar HUD"
              >
                HUD
              </button>
            </div>

            {/* D-Pad Circular táctil */}
            <div className="relative w-28 h-28 rounded-full neo-inset flex items-center justify-center p-1.5">
              <button
                onClick={() => setSelectedCam('CAM_CRADLE')}
                className="absolute top-1 text-slate-500 hover:text-blue-600 transition cursor-pointer"
                title="Cámara Cuna"
              >
                <ChevronUp className="w-4 h-4 stroke-[2.5]" />
              </button>
              <button
                onClick={() => setSelectedCam('CAM_PANEL_02')}
                className="absolute bottom-1 text-slate-500 hover:text-blue-600 transition cursor-pointer"
                title="Cámara Panel Inferior"
              >
                <ChevronDown className="w-4 h-4 stroke-[2.5]" />
              </button>
              <button
                onClick={() => setSelectedCam('CAM_PANEL_01')}
                className="absolute left-1 text-slate-500 hover:text-blue-600 transition cursor-pointer"
                title="Cámara Panel Superior"
              >
                <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
              </button>
              <button
                onClick={onTriggerStep}
                className="absolute right-1 text-slate-500 hover:text-blue-600 transition cursor-pointer"
                title="Avanzar paso"
              >
                <ChevronRight className="w-4 h-4 stroke-[2.5]" />
              </button>

              <button
                onClick={onTriggerStep}
                className="w-12 h-12 rounded-full neo-btn hover:text-blue-600 flex flex-col items-center justify-center active:scale-95 transition cursor-pointer shadow-sm"
                title="Disparar inspección manual"
              >
                <Crosshair className="w-4 h-4 text-blue-600 stroke-[2.5]" />
                <span className="text-[8px] font-black font-mono text-slate-700">INSP</span>
              </button>
            </div>

            {/* E-STOP Parada de Emergencia */}
            <button
              onClick={onEmergencyStop}
              className="w-14 h-14 rounded-2xl bg-gradient-to-b from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white flex flex-col items-center justify-center shadow-lg active:scale-95 transition cursor-pointer border-2 border-red-300/80 shrink-0"
              title="PARADA DE EMERGENCIA"
            >
              <AlertOctagon className="w-5 h-5 animate-pulse" />
              <span className="text-[8px] font-black uppercase tracking-tighter mt-0.5">E-STOP</span>
            </button>

          </div>

        </div>

      </div>

    </div>
  );
};
