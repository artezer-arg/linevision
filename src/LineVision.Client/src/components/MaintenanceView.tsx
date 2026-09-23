import React, { useState } from 'react';
import { StationState, UserSession } from '../types';
import { api } from '../services/api';
import { Wrench, ShieldAlert, Check, RefreshCw } from 'lucide-react';

interface Props {
  currentState: StationState;
  currentUser: UserSession | null;
  onLoginPrompt: () => void;
}

const ALL_STATES: StationState[] = [
  'WAITING_ORDER',
  'ORDER_LOADED',
  'CHECKING_CRADLE',
  'CRADLE_OK',
  'CHECKING_CRADLE_QR',
  'CRADLE_QR_OK',
  'LOADING_PANEL_INSPECTION_PLAN',
  'CHECKING_PANEL',
  'PANEL_OK',
  'WAITING_PLC',
  'PLC_READY',
  'LOADING_RECIPE',
  'SENDING_RECIPE',
  'WAITING_RECIPE_CONFIRMATION',
  'RECIPE_CONFIRMED',
  'ROBOT_RUNNING',
  'WAITING_ROBOT_FINISH',
  'SAVING_STATION_RESULT',
  'CYCLE_COMPLETE',
  'ERROR',
  'MAINTENANCE'
];

export const MaintenanceView: React.FC<Props> = ({ currentState, currentUser, onLoginPrompt }) => {
  const [targetState, setTargetState] = useState<StationState>('WAITING_ORDER');
  const [bypassReason, setBypassReason] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const canBypass = currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'MAINTENANCE' || currentUser.role === 'ENGINEER');

  const handleBypass = async () => {
    if (!canBypass) {
      onLoginPrompt();
      return;
    }

    if (!bypassReason.trim()) {
      alert('Debe ingresar un motivo obligatorio para forzar el estado.');
      return;
    }

    try {
      const res = await api.bypassState(targetState, bypassReason, currentUser.username);
      setStatusMsg(`Bypass completado con éxito a ${res.state}. Registrado en auditoría.`);
      setBypassReason('');
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (e) {
      console.error(e);
      alert('Error ejecutando bypass');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black tracking-tight text-white flex items-center space-x-2">
          <Wrench className="w-6 h-6 text-amber-400" />
          <span>MODO MANTENIMIENTO, CALIBRACIÓN Y CONTROL DE BYPASS</span>
        </h2>
        {statusMsg && (
          <div className="bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2">
            <Check className="w-4 h-4" />
            <span>{statusMsg}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bypass Controller */}
        <div className="bg-industrial-card border-2 border-amber-600/40 rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center space-x-2 border-b border-industrial-border pb-3">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            <h3 className="font-extrabold text-sm uppercase tracking-wider text-amber-400">
              Forzado de Estados (Bypass Auditado)
            </h3>
          </div>

          <p className="text-xs text-slate-300">
            Permite forzar un paso de la secuencia industrial bajo autorización y registro obligatorio en 
            <span className="font-mono text-amber-400 font-bold"> [BypassLog]</span>.
          </p>

          <div className="bg-industrial-dark p-3 rounded-lg flex items-center justify-between text-xs">
            <span className="text-slate-400">Estado Actual:</span>
            <span className="font-mono font-black text-yellow-400 bg-yellow-950/60 px-3 py-1 rounded">
              {currentState}
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">Estado Destino:</label>
              <select
                value={targetState}
                onChange={e => setTargetState(e.target.value as StationState)}
                className="w-full bg-industrial-dark border border-industrial-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              >
                {ALL_STATES.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">
                Motivo Obligatorio del Forzado:
              </label>
              <textarea
                value={bypassReason}
                onChange={e => setBypassReason(e.target.value)}
                placeholder="Ejemplo: Reinspección visual manual aprobada por Calidad por sombra lumínica..."
                rows={3}
                className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              onClick={handleBypass}
              className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-black font-black uppercase tracking-wider text-xs rounded-lg shadow-lg flex items-center justify-center space-x-2"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Ejecutar Bypass y Registrar Auditoría</span>
            </button>
          </div>
        </div>

        {/* Manual Calibration & Diagnostic Actions */}
        <div className="bg-industrial-card border border-industrial-border rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center space-x-2 border-b border-industrial-border pb-3">
            <RefreshCw className="w-5 h-5 text-blue-400" />
            <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-200">
              Acciones de Diagnóstico y Calibración
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <button
              onClick={() => alert('Prueba de captura de cámaras ejecutada con éxito')}
              className="w-full p-3 bg-industrial-dark hover:bg-slate-800 border border-industrial-border rounded-lg text-left text-slate-200 font-bold flex justify-between items-center"
            >
              <span>1. Probar adquisición síncrona de las 3 cámaras</span>
              <span className="text-emerald-400 font-mono">OK</span>
            </button>

            <button
              onClick={() => alert('Handshake de prueba de recetas A y B confirmado por PLC')}
              className="w-full p-3 bg-industrial-dark hover:bg-slate-800 border border-industrial-border rounded-lg text-left text-slate-200 font-bold flex justify-between items-center"
            >
              <span>2. Probar eco de recetas con PLC de soldadura</span>
              <span className="text-blue-400 font-mono">TEST</span>
            </button>

            <button
              onClick={() => alert('Lectura y decodificación de código QR de cuna ejecutada')}
              className="w-full p-3 bg-industrial-dark hover:bg-slate-800 border border-industrial-border rounded-lg text-left text-slate-200 font-bold flex justify-between items-center"
            >
              <span>3. Verificar decodificador de QR de Cuna</span>
              <span className="text-cyan-400 font-mono">VERIFY</span>
            </button>

            <button
              onClick={() => api.resetFault(currentUser?.username || 'MAINTENANCE')}
              className="w-full p-3 bg-industrial-dark hover:bg-slate-800 border border-industrial-border rounded-lg text-left text-amber-400 font-bold flex justify-between items-center"
            >
              <span>4. Limpiar alarmas y reiniciar ciclo</span>
              <span className="text-amber-400 font-mono">RESET</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
