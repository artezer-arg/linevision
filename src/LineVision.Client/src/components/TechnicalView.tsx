import React from 'react';
import { StationHealthStatus, ProductionCycle, StationState } from '../types';
import { Database, Cpu, Camera, Bot, Activity, HardDrive, CheckCircle2, XCircle } from 'lucide-react';

interface Props {
  health: StationHealthStatus | null;
  state: StationState;
  cycle: ProductionCycle | null;
}

export const TechnicalView: React.FC<Props> = ({ health, state, cycle }) => {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black tracking-tight text-white flex items-center space-x-2">
          <Activity className="w-6 h-6 text-blue-400" />
          <span>DIAGNÓSTICO TÉCNICO Y ESTADO DE COMUNICACIONES</span>
        </h2>
        <span className="text-xs font-mono text-slate-400">
          Última actualización: {health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : '--:--:--'}
        </span>
      </div>

      {/* Main Hardware Connection Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* SQL Database */}
        <div className="bg-industrial-card border border-industrial-border rounded-xl p-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-3">
            <div className={`p-3 rounded-lg ${health?.databaseConnected ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'}`}>
              <Database className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs uppercase text-slate-400 font-bold block">Base de Datos</span>
              <span className="font-extrabold text-sm text-white">SQL SERVER / LOCAL</span>
            </div>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-black ${health?.databaseConnected ? 'bg-emerald-600/30 text-emerald-400' : 'bg-red-600/30 text-red-400'}`}>
            {health?.databaseConnected ? 'CONNECTED' : 'DISCONNECTED'}
          </span>
        </div>

        {/* PLC */}
        <div className="bg-industrial-card border border-industrial-border rounded-xl p-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-3">
            <div className={`p-3 rounded-lg ${health?.plcConnected ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'}`}>
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs uppercase text-slate-400 font-bold block">Controlador PLC</span>
              <span className="font-extrabold text-sm text-white">ETHERNET/IP</span>
            </div>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-black ${health?.plcConnected ? 'bg-emerald-600/30 text-emerald-400' : 'bg-red-600/30 text-red-400'}`}>
            {health?.plcConnected ? 'CONNECTED' : 'OFFLINE'}
          </span>
        </div>

        {/* Cameras */}
        <div className="bg-industrial-card border border-industrial-border rounded-xl p-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-3">
            <div className={`p-3 rounded-lg ${health?.camerasConnected ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'}`}>
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs uppercase text-slate-400 font-bold block">Cámaras (3/3)</span>
              <span className="font-extrabold text-sm text-white">OPENCV / GIGE</span>
            </div>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-black ${health?.camerasConnected ? 'bg-emerald-600/30 text-emerald-400' : 'bg-amber-600/30 text-amber-400'}`}>
            {health?.camerasConnected ? 'ALL READY' : 'DEGRADED'}
          </span>
        </div>

        {/* Robot */}
        <div className="bg-industrial-card border border-industrial-border rounded-xl p-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-lg bg-blue-950 text-blue-400">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs uppercase text-slate-400 font-bold block">Robot Soldadura</span>
              <span className="font-extrabold text-sm text-white">RECETA A/B</span>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full font-black bg-blue-600/30 text-blue-400">
            {state === 'ROBOT_RUNNING' ? 'WELDING' : 'READY'}
          </span>
        </div>
      </div>

      {/* IPC Telemetry & Resources */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-industrial-card border border-industrial-border rounded-xl p-5 shadow-lg space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
            <HardDrive className="w-4 h-4 text-purple-400" />
            <span>Recursos de Computadora Industrial (IPC)</span>
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-industrial-dark p-3 rounded-lg">
              <span className="text-xs text-slate-400 block">Disco Disponible (Evidencias)</span>
              <span className="text-2xl font-black text-white">{health?.diskFreeSpaceGb ?? '--'} GB</span>
            </div>
            <div className="bg-industrial-dark p-3 rounded-lg">
              <span className="text-xs text-slate-400 block">Memoria RAM Proceso Core</span>
              <span className="text-2xl font-black text-white">{health?.memoryUsageMb ?? '--'} MB</span>
            </div>
          </div>
        </div>

        {/* Last Cycle Telemetry & Timings */}
        <div className="bg-industrial-card border border-industrial-border rounded-xl p-5 shadow-lg space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>Telemetría de Ciclo & Desglose de Tiempos</span>
          </h3>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-industrial-dark p-3 rounded-lg">
              <span className="text-[10px] text-slate-400 block uppercase">Tiempo Visión</span>
              <span className="text-lg font-mono font-black text-cyan-400">~120 ms</span>
            </div>
            <div className="bg-industrial-dark p-3 rounded-lg">
              <span className="text-[10px] text-slate-400 block uppercase">Handshake PLC</span>
              <span className="text-lg font-mono font-black text-blue-400">~45 ms</span>
            </div>
            <div className="bg-industrial-dark p-3 rounded-lg">
              <span className="text-[10px] text-slate-400 block uppercase">Soldadura Robot</span>
              <span className="text-lg font-mono font-black text-yellow-400">2.0 s</span>
            </div>
          </div>
        </div>
      </div>

      {/* Active Alarms Section */}
      <div className="bg-industrial-card border border-industrial-border rounded-xl p-5 shadow-lg">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-3">
          Alarmas Industriales Activas ({health?.activeAlarms.length ?? 0})
        </h3>
        {health?.activeAlarms && health.activeAlarms.length > 0 ? (
          <div className="space-y-2">
            {health.activeAlarms.map((a, i) => (
              <div key={i} className="bg-red-950/60 border border-red-500/80 p-3 rounded-lg flex items-center justify-between text-red-200">
                <span className="font-mono font-bold text-xs">{a.code}</span>
                <span className="text-sm">{a.description}</span>
                <span className="text-xs bg-red-800 px-2 py-0.5 rounded font-black">{a.severity}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm font-bold flex items-center justify-center space-x-2">
            <CheckCircle2 className="w-5 h-5" />
            <span>SIN ALARMAS ACTIVAS - SISTEMA EN CONDICIÓN NOMINAL 24/7</span>
          </div>
        )}
      </div>
    </div>
  );
};
