import React from 'react';
import { ProductionOrder, StationState } from '../types';
import { ShieldAlert, Play, Pause, RefreshCw, Power } from 'lucide-react';

interface Props {
  stationCode: string;
  state: StationState;
  order: ProductionOrder | null;
  autoRun: boolean;
  onToggleAutoRun: () => void;
  onTriggerStep: () => void;
  onReset: () => void;
  onEmergencyStop: () => void;
}

export const OperatorHeader: React.FC<Props> = ({
  stationCode,
  state,
  order,
  autoRun,
  onToggleAutoRun,
  onTriggerStep,
  onReset,
  onEmergencyStop,
}) => {
  const isError = state === 'ERROR';
  const isRunning = state === 'ROBOT_RUNNING' || state === 'CHECKING_PANEL' || state === 'CHECKING_CRADLE';

  const getStateBadgeColor = (s: StationState) => {
    const stateStr = String(s || '');
    switch (stateStr) {
      case 'ERROR': return 'bg-red-600 text-white animate-pulse';
      case 'CYCLE_COMPLETE':
      case 'PANEL_OK':
      case 'CRADLE_OK':
      case 'CRADLE_QR_OK':
      case 'RECIPE_CONFIRMED': return 'bg-emerald-600 text-white';
      case 'ROBOT_RUNNING':
      case 'CHECKING_PANEL':
      case 'CHECKING_CRADLE':
      case 'SENDING_RECIPE': return 'bg-yellow-500 text-black font-bold animate-bounce';
      case 'WAITING_PLC':
      case 'WAITING_RECIPE_CONFIRMATION':
      case 'WAITING_ROBOT_FINISH': return 'bg-blue-600 text-white';
      case 'MAINTENANCE': return 'bg-purple-600 text-white';
      default: return 'bg-slate-700 text-slate-200';
    }
  };

  return (
    <header className="bg-industrial-card border-b-2 border-industrial-border p-4 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: Station & State */}
        <div className="flex items-center space-x-4">
          <div className="bg-industrial-dark border border-industrial-border px-4 py-2 rounded-lg">
            <span className="text-xs uppercase text-slate-400 font-semibold tracking-wider block">Puesto</span>
            <span className="text-3xl font-black text-blue-400 tracking-tight">{stationCode}</span>
          </div>

          <div>
            <span className="text-xs uppercase text-slate-400 font-semibold tracking-wider block">Estado de Ciclo</span>
            <div className={`px-4 py-1.5 rounded-md text-sm font-extrabold uppercase tracking-wide inline-block shadow-md ${getStateBadgeColor(state)}`}>
              {String(state ?? 'WAITING_ORDER').replace(/_/g, ' ')}
            </div>
          </div>
        </div>

        {/* Center: HIGH-CONTRAST GIANT WORKPIECE DATA FOR OPERATOR */}
        <div className="flex items-center bg-black/60 border-2 border-blue-500/40 rounded-xl px-6 py-2 gap-6 shadow-2xl">
          <div className="text-center min-w-[120px]">
            <span className="text-xs uppercase text-blue-400 font-bold tracking-widest block">SECUENCIA</span>
            <span className="text-4xl font-black text-yellow-400 tracking-wider font-mono">
              {order?.secuencia || '----'}
            </span>
          </div>

          <div className="h-10 w-px bg-slate-700"></div>

          <div className="text-center min-w-[80px]">
            <span className="text-xs uppercase text-slate-400 font-bold tracking-widest block">MODELO</span>
            <span className="text-3xl font-black text-white">
              {order?.modelo || '---'}
            </span>
          </div>

          <div className="h-10 w-px bg-slate-700"></div>

          <div className="text-center min-w-[70px]">
            <span className="text-xs uppercase text-slate-400 font-bold tracking-widest block">MANO</span>
            <span className={`text-3xl font-black px-2 py-0.5 rounded ${order?.mano === 'RH' ? 'text-emerald-400 bg-emerald-950/40' : 'text-cyan-400 bg-cyan-950/40'}`}>
              {order?.mano || '--'}
            </span>
          </div>

          <div className="h-10 w-px bg-slate-700"></div>

          <div className="text-center min-w-[130px]">
            <span className="text-xs uppercase text-slate-400 font-bold tracking-widest block">POSICIÓN</span>
            <span className="text-2xl font-black text-orange-400 tracking-tight">
              {order?.posicion ? (order.posicion === 'FRONT' ? 'DELANTERA' : 'TRASERA') : '---------'}
            </span>
          </div>
        </div>

        {/* Right: Operational Controls */}
        <div className="flex items-center space-x-3">
          {/* Step Trigger */}
          <button
            onClick={onTriggerStep}
            disabled={autoRun}
            className={`px-4 py-2.5 rounded-lg font-bold flex items-center space-x-2 transition ${
              autoRun ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg'
            }`}
            title="Avanzar manualmente 1 paso de la secuencia"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>Paso Manual</span>
          </button>

          {/* AutoRun Toggle */}
          <button
            onClick={onToggleAutoRun}
            className={`px-4 py-2.5 rounded-lg font-bold flex items-center space-x-2 transition shadow-lg ${
              autoRun ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
            }`}
          >
            {autoRun ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            <span>{autoRun ? 'Auto: ACTIVO' : 'Auto: PAUSA'}</span>
          </button>

          {/* Fault Reset */}
          {isError && (
            <button
              onClick={onReset}
              className="px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold flex items-center space-x-2 animate-pulse shadow-lg"
            >
              <RefreshCw className="w-5 h-5" />
              <span>Reset Falla</span>
            </button>
          )}

          {/* EMERGENCY STOP */}
          <button
            onClick={onEmergencyStop}
            className="px-5 py-2.5 rounded-lg bg-red-700 hover:bg-red-600 active:bg-red-800 text-white font-black uppercase tracking-wider flex items-center space-x-2 shadow-2xl border-2 border-red-500"
          >
            <ShieldAlert className="w-6 h-6" />
            <span>PARADA EMERGENCIA</span>
          </button>
        </div>
      </div>
    </header>
  );
};
