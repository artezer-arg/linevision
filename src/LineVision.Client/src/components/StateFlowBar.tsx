import React from 'react';
import { StationState, ProductionCycle, StationWorkflowConfig } from '../types';
import { ArrowRight, AlertTriangle } from 'lucide-react';

interface Props {
  state: StationState;
  cycle?: ProductionCycle | null;
  workflowConfig?: StationWorkflowConfig | null;
}

type StepStatus = 'GRAY' | 'YELLOW' | 'GREEN' | 'RED' | 'BLUE';

interface FlowStep {
  id: string;
  label: string;
  sub: string;
}

const FLOW_5_STEPS_RECIPE_FIRST: FlowStep[] = [
  { id: 'ORDER', label: '1. CONSULTA DB', sub: 'Secuencia, Mano y Posición' },
  { id: 'RECIPE', label: '2. RECETA PLC', sub: 'Envío Directo a DB48.DBW2' },
  { id: 'CRADLE', label: '3. CONTROL CUNA', sub: 'Mano, Posición e Insertos (NG: Reintento)' },
  { id: 'PANEL', label: '4. CONTROL PANEL', sub: 'Inspección & Confirmación DB48.DBX4.0' },
  { id: 'NEXT', label: '5. SIGUIENTE', sub: 'Registro Trazabilidad & Avance Puntero' }
];

const FLOW_5_STEPS_CRADLE_FIRST: FlowStep[] = [
  { id: 'ORDER', label: '1. CONSULTA DB', sub: 'Secuencia, Mano y Posición' },
  { id: 'CRADLE', label: '2. CONTROL CUNA', sub: 'Mano, Posición e Insertos (NG: Reintento)' },
  { id: 'RECIPE', label: '3. RECETA PLC', sub: 'Envío Entero a DB48.DBW2' },
  { id: 'PANEL', label: '4. CONTROL PANEL', sub: 'Inspección & Confirmación DB48.DBX4.0' },
  { id: 'NEXT', label: '5. SIGUIENTE', sub: 'Registro Trazabilidad & Avance Puntero' }
];

const FLOW_6_STEPS_LEGACY: FlowStep[] = [
  { id: 'CRADLE', label: '1. CUNA', sub: 'Mano, Posición e Insertos' },
  { id: 'QR', label: '2. QR CUNA', sub: 'Validación de Código' },
  { id: 'PANEL', label: '3. PANEL', sub: 'Control de Clips e Insertos' },
  { id: 'PLC', label: '4. PLC', sub: 'Estado de Celda' },
  { id: 'RECIPE', label: '5. RECETA', sub: 'Handshake & Eco A/B' },
  { id: 'ROBOT', label: '6. ROBOT', sub: 'Soldadura y Fin de Ciclo' }
];

export const StateFlowBar: React.FC<Props> = ({ state, cycle, workflowConfig }) => {
  const isDirect5Step = !workflowConfig || workflowConfig.workflowMode !== 'LEGACY_ROBOT_HANDSHAKE';
  const isRecipeImmediate = !workflowConfig || workflowConfig.recipeTiming !== 'AFTER_CRADLE_OK';
  const steps = isDirect5Step
    ? (isRecipeImmediate ? FLOW_5_STEPS_RECIPE_FIRST : FLOW_5_STEPS_CRADLE_FIRST)
    : FLOW_6_STEPS_LEGACY;

  const getStepStatus = (stepId: string): StepStatus => {
    const errCode = cycle?.errorCode || '';
    const isError = state === 'ERROR';

    if (isDirect5Step) {
      switch (stepId) {
        case 'ORDER':
          if (state === 'ORDER_LOADED' || cycle != null) return 'GREEN';
          if (state === 'WAITING_ORDER') return 'YELLOW';
          return 'GRAY';

        case 'CRADLE':
          if (cycle?.cradleResult === 'OK') return 'GREEN';
          if (cycle?.cradleResult === 'NOK' || errCode.includes('CRADLE')) return 'RED';
          if (state === 'CHECKING_CRADLE') return 'YELLOW';
          if (['CRADLE_OK', 'LOADING_PANEL_INSPECTION_PLAN', 'CHECKING_PANEL', 'PANEL_OK', 'SAVING_STATION_RESULT', 'CYCLE_COMPLETE'].includes(state))
            return 'GREEN';
          if (!isRecipeImmediate && state === 'ORDER_LOADED') return 'BLUE';
          if (isRecipeImmediate && (state === 'RECIPE_CONFIRMED' || cycle?.recipe_A != null)) return 'BLUE';
          return 'GRAY';

        case 'RECIPE':
          if (cycle?.recipe_A != null || ['RECIPE_CONFIRMED', 'LOADING_PANEL_INSPECTION_PLAN', 'CHECKING_PANEL', 'PANEL_OK', 'SAVING_STATION_RESULT', 'CYCLE_COMPLETE'].includes(state))
            return 'GREEN';
          if (state === 'LOADING_RECIPE' || state === 'SENDING_RECIPE') return 'YELLOW';
          if (state === 'WAITING_RECIPE_CONFIRMATION') return 'BLUE';
          if (isError && errCode.includes('RECIPE')) return 'RED';
          if (isRecipeImmediate && state === 'ORDER_LOADED') return 'BLUE';
          if (!isRecipeImmediate && state === 'CRADLE_OK') return 'BLUE';
          return 'GRAY';

        case 'PANEL':
          if (cycle?.panelResult === 'OK') return 'GREEN';
          if (cycle?.panelResult === 'NOK' || errCode.includes('PANEL')) return 'RED';
          if (state === 'CHECKING_PANEL' || state === 'LOADING_PANEL_INSPECTION_PLAN') return 'YELLOW';
          if (['PANEL_OK', 'SAVING_STATION_RESULT', 'CYCLE_COMPLETE'].includes(state))
            return 'GREEN';
          if (cycle?.cradleResult === 'OK' || state === 'CRADLE_OK') return 'BLUE';
          return 'GRAY';

        case 'NEXT':
          if (state === 'CYCLE_COMPLETE') return 'GREEN';
          if (state === 'SAVING_STATION_RESULT') return 'YELLOW';
          if (state === 'PANEL_OK') return 'BLUE';
          return 'GRAY';

        default:
          return 'GRAY';
      }
    }

    // Flujo tradicional de 6 pasos
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
          text: 'NO CONFORME'
        };
      default:
        return {
          container: 'bg-slate-900/60 border-slate-700/80 text-slate-400 opacity-60',
          badge: 'bg-slate-700 text-slate-300',
          text: 'PENDIENTE'
        };
    }
  };

  const isNgRetry = cycle?.errorCode?.includes('NG_RETRY');

  return (
    <div className="bg-industrial-dark p-4 border-b border-industrial-border space-y-2">
      {/* Indicador de modo activo */}
      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1">
        <span className="flex items-center space-x-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping mr-1"></span>
          <span>FLUJO ACTIVO: <strong className="text-white">{isDirect5Step ? '5 PASOS DIRECTO SIEMENS S7' : '6 PASOS TRADICIONAL ROBOT'}</strong></span>
        </span>
        {isDirect5Step && (
          <span className="text-xs text-sky-400">
            Receta: <span className="font-bold text-white">{workflowConfig?.recipeAddress || 'DB48.DBW2'}</span> | Confirmación: <span className="font-bold text-white">{workflowConfig?.confirmationAddress || 'DB48.DBX4.0'}</span> {workflowConfig?.sendConfirmation ? '(Habilitada)' : '(Desactivada)'}
          </span>
        )}
      </div>

      <div className={`grid ${isDirect5Step ? 'grid-cols-5' : 'grid-cols-6'} gap-3`}>
        {steps.map((step, idx) => {
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
              {idx < steps.length - 1 && (
                <div className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 z-10 text-slate-600">
                  <ArrowRight className="w-5 h-5" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Cartel de Alerta / Reintento en NG para el operador */}
      {isNgRetry && cycle?.errorDescription && (
        <div className="mt-2 p-3 rounded-lg bg-red-950/90 border border-red-500 text-red-200 flex items-center space-x-3 animate-pulse shadow-lg">
          <AlertTriangle className="w-6 h-6 text-red-400 shrink-0" />
          <div className="flex-1">
            <span className="font-extrabold text-sm uppercase block tracking-wide text-red-300">
              ⚠️ ATENCIÓN OPERADOR (REINTENTO ACTIVO)
            </span>
            <span className="text-xs text-slate-200">{cycle.errorDescription}</span>
          </div>
          <span className="px-3 py-1 bg-red-600 text-white rounded text-xs font-black shrink-0">
            ESPERANDO CORRECCIÓN
          </span>
        </div>
      )}
    </div>
  );
};
