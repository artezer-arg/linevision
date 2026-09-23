import React from 'react';
import { StationState, ProductionCycle } from '../types';
import { CheckCircle2, AlertCircle, Clock, ArrowRight } from 'lucide-react';

interface Props {
  state: StationState;
  cycle?: ProductionCycle | null;
}

type StepStatus = 'GRAY' | 'YELLOW' | 'GREEN' | 'RED' | 'BLUE';

interface FlowStep {
  id: string;
  label: string;
  sub: string;
}

const FLOW_STEPS: FlowStep[] = [
  { id: 'CRADLE', label: '1. CUNA', sub: 'Mano, Posición e Insertos' },
  { id: 'QR', label: '2. QR CUNA', sub: 'Validación de Código' },
  { id: 'PANEL', label: '3. PANEL', sub: 'Control de Clips e Insertos' },
  { id: 'PLC', label: '4. PLC', sub: 'Estado de Celda' },
  { id: 'RECIPE', label: '5. RECETA', sub: 'Handshake & Eco A/B' },
  { id: 'ROBOT', label: '6. ROBOT', sub: 'Soldadura y Fin de Ciclo' }
];

export const StateFlowBar: React.FC<Props> = ({ state, cycle }) => {
  const getStepStatus = (stepId: string): StepStatus => {
    const errCode = cycle?.errorCode || '';
    const isError = state === 'ERROR';

    switch (stepId) {
      case 'CRADLE':
        if (state === 'CHECKING_CRADLE') return 'YELLOW';
        if (cycle?.cradleResult === 'OK') return 'GREEN';
        if (cycle?.cradleResult === 'NOK' || (isError && errCode.includes('CRADLE'))) return 'RED';
        if (isError && !cycle) return 'RED';
        if (['CRADLE_OK', 'CHECKING_CRADLE_QR', 'CRADLE_QR_OK', 'LOADING_PANEL_INSPECTION_PLAN', 'CHECKING_PANEL', 'PANEL_OK', 'WAITING_PLC', 'PLC_READY', 'LOADING_RECIPE', 'SENDING_RECIPE', 'WAITING_RECIPE_CONFIRMATION', 'RECIPE_CONFIRMED', 'ROBOT_RUNNING', 'WAITING_ROBOT_FINISH', 'SAVING_STATION_RESULT', 'CYCLE_COMPLETE'].includes(state))
          return 'GREEN';
        return 'GRAY';

      case 'QR':
        if (state === 'CHECKING_CRADLE_QR') return 'YELLOW';
        if (cycle?.qR_Cuna && !errCode.includes('QR')) return 'GREEN';
        if (isError && errCode.includes('QR')) return 'RED';
        if (['CRADLE_QR_OK', 'LOADING_PANEL_INSPECTION_PLAN', 'CHECKING_PANEL', 'PANEL_OK', 'WAITING_PLC', 'PLC_READY', 'LOADING_RECIPE', 'SENDING_RECIPE', 'WAITING_RECIPE_CONFIRMATION', 'RECIPE_CONFIRMED', 'ROBOT_RUNNING', 'WAITING_ROBOT_FINISH', 'SAVING_STATION_RESULT', 'CYCLE_COMPLETE'].includes(state))
          return 'GREEN';
        if (state === 'CRADLE_OK') return 'BLUE';
        return 'GRAY';

      case 'PANEL':
        if (state === 'CHECKING_PANEL' || state === 'LOADING_PANEL_INSPECTION_PLAN') return 'YELLOW';
        if (cycle?.panelResult === 'OK') return 'GREEN';
        if (cycle?.panelResult === 'NOK' || (isError && errCode.includes('PANEL'))) return 'RED';
        if (['PANEL_OK', 'WAITING_PLC', 'PLC_READY', 'LOADING_RECIPE', 'SENDING_RECIPE', 'WAITING_RECIPE_CONFIRMATION', 'RECIPE_CONFIRMED', 'ROBOT_RUNNING', 'WAITING_ROBOT_FINISH', 'SAVING_STATION_RESULT', 'CYCLE_COMPLETE'].includes(state))
          return 'GREEN';
        if (state === 'CRADLE_QR_OK') return 'BLUE';
        return 'GRAY';

      case 'PLC':
        if (state === 'WAITING_PLC') return 'BLUE';
        if (isError && errCode.includes('PLC')) return 'RED';
        if (['PLC_READY', 'LOADING_RECIPE', 'SENDING_RECIPE', 'WAITING_RECIPE_CONFIRMATION', 'RECIPE_CONFIRMED', 'ROBOT_RUNNING', 'WAITING_ROBOT_FINISH', 'SAVING_STATION_RESULT', 'CYCLE_COMPLETE'].includes(state))
          return 'GREEN';
        return 'GRAY';

      case 'RECIPE':
        if (state === 'LOADING_RECIPE' || state === 'SENDING_RECIPE') return 'YELLOW';
        if (state === 'WAITING_RECIPE_CONFIRMATION') return 'BLUE';
        if (isError && errCode.includes('RECIPE')) return 'RED';
        if (['RECIPE_CONFIRMED', 'ROBOT_RUNNING', 'WAITING_ROBOT_FINISH', 'SAVING_STATION_RESULT', 'CYCLE_COMPLETE'].includes(state))
          return 'GREEN';
        return 'GRAY';

      case 'ROBOT':
        if (state === 'ROBOT_RUNNING') return 'YELLOW';
        if (state === 'WAITING_ROBOT_FINISH') return 'BLUE';
        if (isError && (errCode.includes('ROBOT') || cycle?.robotResult === 'NOK')) return 'RED';
        if (['SAVING_STATION_RESULT', 'CYCLE_COMPLETE'].includes(state))
          return 'GREEN';
        return 'GRAY';

      default:
        return 'GRAY';
    }
  };

  const getStatusStyles = (status: StepStatus) => {
    switch (status) {
      case 'GREEN':
        return {
          container: 'bg-emerald-950/70 border-emerald-500 text-emerald-300',
          badge: 'bg-emerald-500 text-white',
          text: 'CONFIRMADO OK'
        };
      case 'YELLOW':
        return {
          container: 'bg-amber-950/80 border-amber-400 text-amber-200 animate-pulse ring-2 ring-amber-400',
          badge: 'bg-amber-400 text-black font-black',
          text: 'PROCESANDO...'
        };
      case 'BLUE':
        return {
          container: 'bg-sky-950/70 border-sky-400 text-sky-200',
          badge: 'bg-sky-500 text-white',
          text: 'ESPERANDO'
        };
      case 'RED':
        return {
          container: 'bg-red-950/90 border-red-500 text-red-200 ring-2 ring-red-500',
          badge: 'bg-red-600 text-white',
          text: 'FALLA NOK'
        };
      default:
        return {
          container: 'bg-slate-900/60 border-slate-700/80 text-slate-400 opacity-60',
          badge: 'bg-slate-700 text-slate-300',
          text: 'PENDIENTE'
        };
    }
  };

  return (
    <div className="bg-industrial-dark p-4 border-b border-industrial-border">
      <div className="grid grid-cols-6 gap-3">
        {FLOW_STEPS.map((step, idx) => {
          const status = getStepStatus(step.id);
          const styles = getStatusStyles(status);

          return (
            <div
              key={step.id}
              className={`rounded-xl border-2 p-3 transition-all flex flex-col justify-between shadow-lg relative ${styles.container}`}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-black text-sm tracking-wide">{step.label}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-black tracking-wider uppercase ${styles.badge}`}>
                    {styles.text}
                  </span>
                </div>
                <p className="text-xs opacity-80 leading-snug">{step.sub}</p>
              </div>

              {/* Step indicator arrow */}
              {idx < FLOW_STEPS.length - 1 && (
                <div className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 z-10 text-slate-600">
                  <ArrowRight className="w-5 h-5" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
