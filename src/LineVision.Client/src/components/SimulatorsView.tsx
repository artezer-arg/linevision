import React, { useState } from 'react';
import { api } from '../services/api';
import { Sliders, Cpu, Camera, PlusCircle, AlertOctagon, Check } from 'lucide-react';

export const SimulatorsView: React.FC = () => {
  const [plcStatus, setPlcStatus] = useState<string>('Nominal');
  const [lastInjectedFault, setLastInjectedFault] = useState<string>('NONE');
  const [message, setMessage] = useState<string | null>(null);

  const notify = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleInjectFault = async (fault: string) => {
    await api.injectPlcFault(fault);
    setLastInjectedFault(fault);
    notify(`Falla PLC inyectada: ${fault}`);
  };

  const handleCameraPattern = async (cameraId: string, pattern: string) => {
    await api.setCameraPattern(cameraId, pattern);
    notify(`Patrón de cámara ${cameraId} cambiado a: ${pattern}`);
  };

  const handleEnqueue = async () => {
    const order = await api.enqueueOrder('DL02');
    notify(`Orden encolada exitosamente: Secuencia ${order.secuencia} (${order.modelo} ${order.mano} ${order.posicion})`);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black tracking-tight text-white flex items-center space-x-2">
          <Sliders className="w-6 h-6 text-purple-400" />
          <span>PANEL DE SIMULADORES Y PRUEBAS SIN HARDWARE</span>
        </h2>
        {message && (
          <div className="bg-blue-600/90 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-lg animate-fade-in flex items-center space-x-2">
            <Check className="w-4 h-4" />
            <span>{message}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 1. SIMULADOR DE PLC & FALLAS */}
        <div className="bg-industrial-card border border-industrial-border rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center space-x-2 border-b border-industrial-border pb-3">
            <Cpu className="w-5 h-5 text-blue-400" />
            <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-200">Simulador de PLC</h3>
          </div>

          <p className="text-xs text-slate-400">
            Simula estados y registros del PLC para pruebas de handshake y validación fail-safe.
          </p>

          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-300 block">Inyección de Fallas al PLC:</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleInjectFault('TIMEOUT')}
                className="p-2.5 rounded bg-red-950/80 hover:bg-red-900 border border-red-600 text-red-200 text-xs font-bold"
              >
                Inyectar TIMEOUT
              </button>
              <button
                onClick={() => handleInjectFault('MISMATCH')}
                className="p-2.5 rounded bg-orange-950/80 hover:bg-orange-900 border border-orange-600 text-orange-200 text-xs font-bold"
              >
                Inyectar ECO NOK
              </button>
              <button
                onClick={() => handleInjectFault('ERROR')}
                className="p-2.5 rounded bg-red-950/80 hover:bg-red-900 border border-red-600 text-red-200 text-xs font-bold"
              >
                Parada Emergencia
              </button>
              <button
                onClick={() => handleInjectFault('DISCONNECT')}
                className="p-2.5 rounded bg-amber-950/80 hover:bg-amber-900 border border-amber-600 text-amber-200 text-xs font-bold"
              >
                Desconectar PLC
              </button>
            </div>

            <button
              onClick={() => handleInjectFault('NONE')}
              className="w-full mt-2 p-2.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-black uppercase"
            >
              Restablecer PLC a Nominal (Sin Fallas)
            </button>
          </div>

          <div className="bg-industrial-dark p-3 rounded-lg text-xs font-mono">
            <span className="text-slate-400">Falla activa: </span>
            <span className="font-bold text-yellow-400">{lastInjectedFault}</span>
          </div>
        </div>

        {/* 2. SIMULADOR DE CÁMARAS */}
        <div className="bg-industrial-card border border-industrial-border rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center space-x-2 border-b border-industrial-border pb-3">
            <Camera className="w-5 h-5 text-cyan-400" />
            <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-200">Simulador de Cámaras</h3>
          </div>

          <p className="text-xs text-slate-400">
            Cambia los patrones sintéticos generados en tiempo real para evaluar aprobaciones y rechazos.
          </p>

          <div className="space-y-3">
            <div>
              <span className="text-xs font-bold text-slate-300 block mb-1">Cámara Cuna (CAM_CRADLE):</span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => handleCameraPattern('CAM_CRADLE', 'OK')}
                  className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-emerald-400"
                >
                  Cuna OK
                </button>
                <button
                  onClick={() => handleCameraPattern('CAM_CRADLE', 'NOK_HAND')}
                  className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-red-400"
                >
                  Falla Mano
                </button>
                <button
                  onClick={() => handleCameraPattern('CAM_CRADLE', 'NOK_INSERT_A')}
                  className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-red-400"
                >
                  Falla Inserto A
                </button>
                <button
                  onClick={() => handleCameraPattern('CAM_CRADLE', 'QR_INVALID')}
                  className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-red-400"
                >
                  QR Mismatch
                </button>
              </div>
            </div>

            <div>
              <span className="text-xs font-bold text-slate-300 block mb-1">Cámara Panel (CAM_PANEL_01):</span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => handleCameraPattern('CAM_PANEL_01', 'OK')}
                  className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-emerald-400"
                >
                  Panel Clips OK
                </button>
                <button
                  onClick={() => handleCameraPattern('CAM_PANEL_01', 'NOK_CLIP')}
                  className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-red-400"
                >
                  Clip Faltante
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 3. SIMULADOR DE PRODUCCIÓN */}
        <div className="bg-industrial-card border border-industrial-border rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center space-x-2 border-b border-industrial-border pb-3">
            <PlusCircle className="w-5 h-5 text-emerald-400" />
            <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-200">Simulador de Producción</h3>
          </div>

          <p className="text-xs text-slate-400">
            Genera nuevas órdenes de producción en la base de datos sin necesidad de conexión con el MES / SAP de planta.
          </p>

          <div className="space-y-3 pt-2">
            <button
              onClick={handleEnqueue}
              className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-black text-sm uppercase tracking-wide shadow-lg flex items-center justify-center space-x-2"
            >
              <PlusCircle className="w-5 h-5" />
              <span>Generar y Encolar Orden</span>
            </button>

            <div className="bg-industrial-dark p-3 rounded-lg text-xs space-y-1 text-slate-400">
              <p>• La orden generará automáticamente:</p>
              <p className="font-mono text-slate-300 pl-2">- Nueva Secuencia incremental</p>
              <p className="font-mono text-slate-300 pl-2">- Modelo (P1B)</p>
              <p className="font-mono text-slate-300 pl-2">- Mano (RH / LH)</p>
              <p className="font-mono text-slate-300 pl-2">- Posición (FRONT / REAR)</p>
              <p className="font-mono text-slate-300 pl-2">- Actualización de puntero en [Puesto]</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
