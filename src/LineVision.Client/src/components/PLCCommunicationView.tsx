import React, { useEffect, useState } from 'react';
import { PLCConfiguration, PLCStatusInfo, TcpPingResult, HandshakeTestResult } from '../types';
import { api } from '../services/api';
import { TelnetGatewaySection } from './TelnetGatewaySection';
import {
  Cpu,
  Activity,
  Wifi,
  WifiOff,
  RefreshCw,
  Save,
  CheckCircle2,
  AlertTriangle,
  Play,
  Server,
  Zap,
  RotateCcw,
  Sliders,
  Radio,
  FileCode,
  HardDrive,
  Terminal
} from 'lucide-react';

export const PLCCommunicationView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'TELNET' | 'DIRECT'>('TELNET');
  const [config, setConfig] = useState<PLCConfiguration>({
    plC_ID: 'PLC_DL02',
    stationCode: 'DL02',
    protocol: 'SIMULATOR',
    ipAddress: '192.168.1.50',
    port: 44818,
    pollingIntervalMs: 100,
    timeoutMs: 2000,
    maxRetries: 3,
    active: true,
    tagRecipeA: 'PC_To_PLC.Recipe_A',
    tagRecipeB: 'PC_To_PLC.Recipe_B',
    tagRecipeReady: 'PC_To_PLC.RecipeReady',
    tagStationState: 'PLC_To_PC.State',
    tagRecipeReceived: 'PLC_To_PC.RecipeReceived',
    tagEchoRecipeA: 'PLC_To_PC.EchoRecipe_A',
    tagEchoRecipeB: 'PLC_To_PC.EchoRecipe_B'
  });

  const [status, setStatus] = useState<PLCStatusInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pingLoading, setPingLoading] = useState(false);
  const [pingResult, setPingResult] = useState<TcpPingResult | null>(null);
  const [handshakeLoading, setHandshakeLoading] = useState(false);
  const [handshakeResult, setHandshakeResult] = useState<HandshakeTestResult | null>(null);
  const [testA, setTestA] = useState<number>(99);
  const [testB, setTestB] = useState<number>(88);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Protocols catalog
  const PROTOCOLS = [
    {
      id: 'TELNET_GATEWAY',
      name: 'Gateway Telnet (App Proveedor)',
      desc: 'App puente local en 127.0.0.1:12345 (Bridge / Socket TCP)',
      defaultPort: 12345,
      badge: 'APP LOCAL',
      color: 'emerald'
    },
    {
      id: 'SIMULATOR',
      name: 'Simulador Interno',
      desc: 'Memoria interna de alta velocidad y simulación de robot',
      defaultPort: 44818,
      badge: 'VIRTUAL',
      color: 'purple'
    },
    {
      id: 'SIEMENS_S7',
      name: 'Siemens S7 (ISO-on-TCP)',
      desc: 'S7-1200 / S7-1500 / S7-300 mediante RFC 1006',
      defaultPort: 102,
      badge: 'DIRECT S7',
      color: 'cyan'
    },
    {
      id: 'MODBUS_TCP',
      name: 'Modbus TCP/IP',
      desc: 'Holding Registers estándar industrial (Fnc 03, 06, 16)',
      defaultPort: 502,
      badge: 'MODBUS',
      color: 'amber'
    },
    {
      id: 'ETHERNET_IP',
      name: 'Allen-Bradley (EtherNet/IP)',
      desc: 'ControlLogix / CompactLogix mediante CIP Tags',
      defaultPort: 44818,
      badge: 'ROCKWELL CIP',
      color: 'blue'
    },
    {
      id: 'OPC_UA',
      name: 'OPC UA Client',
      desc: 'Arquitectura abierta binaria segura tcp://',
      defaultPort: 4840,
      badge: 'OPC UA',
      color: 'emerald'
    }
  ];

  useEffect(() => {
    loadAll();
    const interval = setInterval(fetchLiveStatus, 1500);
    return () => clearInterval(interval);
  }, []);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cfg, st] = await Promise.all([
        api.getPLCConfig().catch(() => null),
        api.getPLCStatus().catch(() => null)
      ]);

      if (cfg) {
        setConfig({
          plC_ID: cfg.plC_ID || cfg.PLC_ID || 'PLC_DL02',
          stationCode: cfg.stationCode || cfg.StationCode || 'DL02',
          protocol: cfg.protocol || cfg.Protocol || 'SIMULATOR',
          ipAddress: cfg.ipAddress || cfg.IPAddress || '192.168.1.50',
          port: Number(cfg.port || cfg.Port) || 44818,
          pollingIntervalMs: Number(cfg.pollingIntervalMs || cfg.PollingIntervalMs) || 100,
          timeoutMs: Number(cfg.timeoutMs || cfg.TimeoutMs) || 2000,
          maxRetries: Number(cfg.maxRetries || cfg.MaxRetries) || 3,
          active: cfg.active !== undefined ? cfg.active : true,
          tagRecipeA: cfg.tagRecipeA || cfg.TagRecipeA || 'PC_To_PLC.Recipe_A',
          tagRecipeB: cfg.tagRecipeB || cfg.TagRecipeB || 'PC_To_PLC.Recipe_B',
          tagRecipeReady: cfg.tagRecipeReady || cfg.TagRecipeReady || 'PC_To_PLC.RecipeReady',
          tagStationState: cfg.tagStationState || cfg.TagStationState || 'PLC_To_PC.State',
          tagRecipeReceived: cfg.tagRecipeReceived || cfg.TagRecipeReceived || 'PLC_To_PC.RecipeReceived',
          tagEchoRecipeA: cfg.tagEchoRecipeA || cfg.TagEchoRecipeA || 'PLC_To_PC.EchoRecipe_A',
          tagEchoRecipeB: cfg.tagEchoRecipeB || cfg.TagEchoRecipeB || 'PLC_To_PC.EchoRecipe_B'
        });
      }

      if (st) {
        setStatus(st);
      }
    } catch (err) {
      console.error('Error cargando configuración PLC:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLiveStatus = async () => {
    try {
      const st = await api.getPLCStatus();
      if (st) {
        setStatus(st);
      }
    } catch (e) {
      // Background poll failure
    }
  };

  const handleProtocolSelect = (protoId: any) => {
    const protoDef = PROTOCOLS.find(p => p.id === protoId);
    if (protoId === 'TELNET_GATEWAY') {
      setConfig(prev => ({
        ...prev,
        protocol: 'TELNET_GATEWAY',
        ipAddress: '127.0.0.1',
        port: 12345
      }));
      setActiveSubTab('TELNET');
      showToast('info', 'Preset aplicado: Gateway Telnet en 127.0.0.1:12345');
      return;
    }
    setConfig(prev => ({
      ...prev,
      protocol: protoId,
      port: protoDef ? protoDef.defaultPort : prev.port
    }));
  };

  const handleApplyPreset = (presetType: 'CIP' | 'MODBUS' | 'SIEMENS') => {
    if (presetType === 'CIP') {
      setConfig(prev => ({
        ...prev,
        protocol: 'ETHERNET_IP',
        port: 44818,
        tagRecipeA: 'PC_To_PLC.Recipe_A',
        tagRecipeB: 'PC_To_PLC.Recipe_B',
        tagRecipeReady: 'PC_To_PLC.RecipeReady',
        tagStationState: 'PLC_To_PC.State',
        tagRecipeReceived: 'PLC_To_PC.RecipeReceived',
        tagEchoRecipeA: 'PLC_To_PC.EchoRecipe_A',
        tagEchoRecipeB: 'PLC_To_PC.EchoRecipe_B'
      }));
      showToast('info', 'Preset aplicado: Nomenclatura Rockwell / CIP Tags');
    } else if (presetType === 'MODBUS') {
      setConfig(prev => ({
        ...prev,
        protocol: 'MODBUS_TCP',
        port: 502,
        tagRecipeA: 'HR_40001 (Recipe_A)',
        tagRecipeB: 'HR_40002 (Recipe_B)',
        tagRecipeReady: 'Coil_00001 (RecipeReady)',
        tagStationState: 'HR_40010 (State)',
        tagRecipeReceived: 'Coil_00010 (RecipeReceived)',
        tagEchoRecipeA: 'HR_40011 (Echo_A)',
        tagEchoRecipeB: 'HR_40012 (Echo_B)'
      }));
      showToast('info', 'Preset aplicado: Registros Modbus Holding Registers');
    } else if (presetType === 'SIEMENS') {
      setConfig(prev => ({
        ...prev,
        protocol: 'SIEMENS_S7',
        port: 102,
        tagRecipeA: 'DB100.DBW0 (Recipe_A)',
        tagRecipeB: 'DB100.DBW2 (Recipe_B)',
        tagRecipeReady: 'DB100.DBX4.0 (RecipeReady)',
        tagStationState: 'DB101.DBW0 (State)',
        tagRecipeReceived: 'DB101.DBX4.0 (RecipeReceived)',
        tagEchoRecipeA: 'DB101.DBW6 (Echo_A)',
        tagEchoRecipeB: 'DB101.DBW8 (Echo_B)'
      }));
      showToast('info', 'Preset aplicado: Direcciones Siemens S7 DB100/DB101');
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const res = await api.savePLCConfig(config);
      if (res && res.success) {
        showToast('success', res.message || 'Configuración de PLC guardada exitosamente');
        await fetchLiveStatus();
      } else {
        showToast('error', res?.message || 'Error al persistir la configuración');
      }
    } catch (err: any) {
      showToast('error', err.message || 'Error de red al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleTestPing = async () => {
    setPingLoading(true);
    setPingResult(null);
    try {
      const res = await api.testPLCConnection({
        ipAddress: config.ipAddress,
        port: Number(config.port),
        timeoutMs: Number(config.timeoutMs)
      });
      setPingResult(res);
      if (res.success) {
        showToast('success', `Ping exitoso: ${res.latencyMs} ms hacia ${res.ipAddress}:${res.port}`);
      } else {
        showToast('error', `Fallo de conexión: ${res.message}`);
      }
    } catch (err: any) {
      showToast('error', 'Error ejecutando prueba de ping');
    } finally {
      setPingLoading(false);
    }
  };

  const handleTestHandshake = async () => {
    setHandshakeLoading(true);
    setHandshakeResult(null);
    try {
      const res = await api.testPLCHandshake(testA, testB);
      setHandshakeResult(res);
      if (res.success) {
        showToast('success', res.message);
      } else {
        showToast('error', res.message);
      }
      await fetchLiveStatus();
    } catch (err: any) {
      showToast('error', 'Error ejecutando handshake de prueba');
    } finally {
      setHandshakeLoading(false);
    }
  };

  const handleClearSignals = async () => {
    try {
      const res = await api.clearPLCSignals();
      showToast('info', res.message || 'Señales limpiadas');
      await fetchLiveStatus();
    } catch (err) {
      showToast('error', 'Error al limpiar señales');
    }
  };

  const currentState = status?.state;
  const isConnected = status?.isConnected ?? false;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Toast Feedback */}
      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs font-bold flex items-center justify-between shadow-2xl transition animate-fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-950 border border-emerald-500 text-emerald-300'
              : feedback.type === 'error'
              ? 'bg-rose-950 border border-rose-500 text-rose-300'
              : 'bg-blue-950 border border-blue-500 text-cyan-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white ml-4 text-sm font-bold">×</button>
        </div>
      )}

      {/* 1. Header con Resumen de Enlace Industrial en Vivo */}
      <div className="bg-industrial-card border border-industrial-border rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className={`p-4 rounded-xl flex items-center justify-center ${
            isConnected ? 'bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 shadow-emerald-900/30' : 'bg-rose-950/80 border border-rose-500/40 text-rose-400 shadow-rose-900/30'
          } shadow-lg`}>
            {isConnected ? <Wifi className="w-8 h-8 animate-pulse" /> : <WifiOff className="w-8 h-8" />}
          </div>

          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-black tracking-tight text-white flex items-center space-x-2">
                <span>COMUNICACIÓN Y CONFIGURACIÓN PLC</span>
              </h2>
              <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                isConnected ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              }`}>
                {isConnected ? 'EN LÍNEA / LINK ACTIVO' : 'OFFLINE / DESCONECTADO'}
              </span>
            </div>

            <div className="flex items-center space-x-3 text-xs text-slate-400 mt-1 font-mono">
              <span>ESTACIÓN: <strong className="text-white">{config.stationCode}</strong></span>
              <span>•</span>
              <span>DRIVER: <strong className="text-cyan-400">{config.protocol}</strong></span>
              <span>•</span>
              <span>DESTINO: <strong className="text-white">{config.ipAddress}:{config.port}</strong></span>
              <span>•</span>
              <span>POLL: <strong className="text-slate-300">{config.pollingIntervalMs}ms</strong></span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchLiveStatus}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center space-x-1.5 text-xs font-bold"
            title="Refrescar estado en vivo"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refrescar</span>
          </button>

          <button
            onClick={handleSaveConfig}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-blue-900/30 flex items-center space-x-2 transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Guardando...' : 'Guardar y Aplicar'}</span>
          </button>
        </div>
      </div>

      {/* Sub Navigation Bar */}
      <div className="flex items-center space-x-3 border-b border-industrial-border pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('TELNET')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center space-x-2 transition ${
            activeSubTab === 'TELNET'
              ? 'bg-gradient-to-r from-emerald-600 to-cyan-600 text-white shadow-lg shadow-emerald-950/40 ring-2 ring-emerald-400/40'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Terminal className="w-4 h-4 text-cyan-300" />
          <span>Gateway Telnet / TCP Socket (127.0.0.1:12345)</span>
          <span className="px-1.5 py-0.5 bg-black/40 rounded text-[9px] text-emerald-300 border border-emerald-500/40 font-mono">
            APP PROVEEDOR
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('DIRECT')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2 transition ${
            activeSubTab === 'DIRECT'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/40 ring-2 ring-indigo-400/40 font-black'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Cpu className="w-4 h-4 text-indigo-300" />
          <span>Drivers Directos PLC (Siemens / Rockwell / Modbus / Simulador)</span>
        </button>
      </div>

      {activeSubTab === 'TELNET' ? (
        <TelnetGatewaySection
          plcConfig={config}
          onActivateAsMainDriver={async () => {
            const next: PLCConfiguration = { ...config, protocol: 'TELNET_GATEWAY', ipAddress: '127.0.0.1', port: 12345 };
            setConfig(next);
            await api.savePLCConfig(next);
            showToast('success', 'Gateway Telnet activado como driver principal de la estación DL02');
            await fetchLiveStatus();
          }}
          showToast={showToast}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 2. Columna Izquierda: Parámetros de Red y Protocolo */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card: Selector de Protocolo */}
          <div className="bg-industrial-card border border-industrial-border rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-industrial-border/60 pb-3">
              <h3 className="text-sm font-extrabold text-white flex items-center space-x-2">
                <Radio className="w-4 h-4 text-cyan-400" />
                <span>PROTOCOLO Y DRIVER DE COMUNICACIÓN</span>
              </h3>
              <span className="text-[11px] text-slate-400">Seleccione el driver para conectar con la celda</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {PROTOCOLS.map(proto => {
                const isSelected = config.protocol === proto.id;
                return (
                  <button
                    key={proto.id}
                    type="button"
                    onClick={() => handleProtocolSelect(proto.id)}
                    className={`p-3.5 rounded-xl text-left border transition relative flex flex-col justify-between ${
                      isSelected
                        ? 'bg-blue-950/40 border-cyan-500 ring-2 ring-cyan-500/20 shadow-lg shadow-cyan-950/40'
                        : 'bg-industrial-dark/60 border-industrial-border hover:border-slate-600 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-extrabold text-xs text-white flex items-center space-x-1.5">
                        <Cpu className={`w-3.5 h-3.5 ${isSelected ? 'text-cyan-400' : 'text-slate-400'}`} />
                        <span>{proto.name}</span>
                      </span>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded tracking-wider uppercase ${
                        isSelected ? 'bg-cyan-500 text-black font-extrabold' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {proto.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{proto.desc}</p>
                    <div className="mt-2 text-[10px] text-slate-500 font-mono">
                      Puerto estándar sugerido: <span className="text-slate-300 font-bold">{proto.defaultPort}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Card: Parámetros de Red y Tiempos */}
          <div className="bg-industrial-card border border-industrial-border rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-industrial-border/60 pb-3">
              <h3 className="text-sm font-extrabold text-white flex items-center space-x-2">
                <Server className="w-4 h-4 text-blue-400" />
                <span>PARÁMETROS DE RED INDUSTRIAL Y TIMEOUTS</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[11px] uppercase font-bold text-slate-400 block mb-1.5">
                  Dirección IP del PLC
                </label>
                <input
                  type="text"
                  value={config.ipAddress}
                  onChange={e => setConfig({ ...config, ipAddress: e.target.value })}
                  placeholder="192.168.1.50"
                  className="w-full bg-industrial-dark border border-industrial-border rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] uppercase font-bold text-slate-400 block mb-1.5">
                  Puerto TCP
                </label>
                <input
                  type="number"
                  value={config.port}
                  onChange={e => setConfig({ ...config, port: parseInt(e.target.value) || 0 })}
                  placeholder="102 / 502 / 44818"
                  className="w-full bg-industrial-dark border border-industrial-border rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] uppercase font-bold text-slate-400 block mb-1.5">
                  Intervalo de Muestreo (Polling)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={config.pollingIntervalMs}
                    onChange={e => setConfig({ ...config, pollingIntervalMs: parseInt(e.target.value) || 100 })}
                    className="w-full bg-industrial-dark border border-industrial-border rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                  <span className="absolute right-3 top-2 text-[10px] text-slate-500 font-bold">ms</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] uppercase font-bold text-slate-400 block mb-1.5">
                  Timeout de Respuesta
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={config.timeoutMs}
                    onChange={e => setConfig({ ...config, timeoutMs: parseInt(e.target.value) || 2000 })}
                    className="w-full bg-industrial-dark border border-industrial-border rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                  <span className="absolute right-3 top-2 text-[10px] text-slate-500 font-bold">ms</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] uppercase font-bold text-slate-400 block mb-1.5">
                  Reintentos Máximos
                </label>
                <input
                  type="number"
                  value={config.maxRetries}
                  onChange={e => setConfig({ ...config, maxRetries: parseInt(e.target.value) || 3 })}
                  className="w-full bg-industrial-dark border border-industrial-border rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] uppercase font-bold text-slate-400 block mb-1.5">
                  Estado de Driver
                </label>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, active: !config.active })}
                  className={`w-full py-2 rounded-xl text-xs font-extrabold flex items-center justify-center space-x-2 border transition ${
                    config.active
                      ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-400'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${config.active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  <span>{config.active ? 'DRIVER HABILITADO' : 'DRIVER PAUSADO'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Card: Mapeo de Tags y Registros */}
          <div className="bg-industrial-card border border-industrial-border rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-industrial-border/60 pb-3 flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-white flex items-center space-x-2">
                  <FileCode className="w-4 h-4 text-emerald-400" />
                  <span>MAPEO DE TAGS Y REGISTROS INDUSTRIALES</span>
                </h3>
                <span className="text-[11px] text-slate-400">Nombres de variables CIP / DB de Siemens / Holding Registers Modbus</span>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center space-x-2">
                <span className="text-[10px] uppercase font-bold text-slate-500">Presets:</span>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('CIP')}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-bold text-blue-300"
                >
                  Rockwell CIP
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('MODBUS')}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-bold text-amber-300"
                >
                  Modbus 40001
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('SIEMENS')}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-bold text-cyan-300"
                >
                  Siemens DB
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Sección PC -> PLC */}
              <div className="bg-industrial-dark/60 border border-industrial-border/70 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-industrial-border/50 pb-2">
                  <span className="text-[11px] font-extrabold uppercase text-blue-400 flex items-center space-x-1.5">
                    <Zap className="w-3.5 h-3.5" />
                    <span>PC → PLC (Envío de Recetas)</span>
                  </span>
                  <span className="text-[9px] font-mono bg-blue-950/70 text-blue-300 px-2 py-0.5 rounded border border-blue-800">ESCRITURA</span>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                    Tag Receta A (Código de Pieza)
                  </label>
                  <input
                    type="text"
                    value={config.tagRecipeA}
                    onChange={e => setConfig({ ...config, tagRecipeA: e.target.value })}
                    className="w-full bg-black/40 border border-industrial-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                    Tag Receta B (Variante / Soldadura)
                  </label>
                  <input
                    type="text"
                    value={config.tagRecipeB}
                    onChange={e => setConfig({ ...config, tagRecipeB: e.target.value })}
                    className="w-full bg-black/40 border border-industrial-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                    Bit Handshake: RecipeReady (Receta Lista)
                  </label>
                  <input
                    type="text"
                    value={config.tagRecipeReady}
                    onChange={e => setConfig({ ...config, tagRecipeReady: e.target.value })}
                    className="w-full bg-black/40 border border-industrial-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Sección PLC -> PC */}
              <div className="bg-industrial-dark/60 border border-industrial-border/70 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-industrial-border/50 pb-2">
                  <span className="text-[11px] font-extrabold uppercase text-emerald-400 flex items-center space-x-1.5">
                    <Activity className="w-3.5 h-3.5" />
                    <span>PLC → PC (Estado & Ecos)</span>
                  </span>
                  <span className="text-[9px] font-mono bg-emerald-950/70 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800">LECTURA</span>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                    Tag Estado Estación (State Word)
                  </label>
                  <input
                    type="text"
                    value={config.tagStationState}
                    onChange={e => setConfig({ ...config, tagStationState: e.target.value })}
                    className="w-full bg-black/40 border border-industrial-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                    Bit Handshake: RecipeReceived (Confirmada)
                  </label>
                  <input
                    type="text"
                    value={config.tagRecipeReceived}
                    onChange={e => setConfig({ ...config, tagRecipeReceived: e.target.value })}
                    className="w-full bg-black/40 border border-industrial-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Eco Receta A
                    </label>
                    <input
                      type="text"
                      value={config.tagEchoRecipeA}
                      onChange={e => setConfig({ ...config, tagEchoRecipeA: e.target.value })}
                      className="w-full bg-black/40 border border-industrial-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Eco Receta B
                    </label>
                    <input
                      type="text"
                      value={config.tagEchoRecipeB}
                      onChange={e => setConfig({ ...config, tagEchoRecipeB: e.target.value })}
                      className="w-full bg-black/40 border border-industrial-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Columna Derecha: Monitoreo en Vivo y Herramientas de Prueba */}
        <div className="space-y-6">
          {/* Card: Monitor de Registros PLC en Vivo */}
          <div className="bg-industrial-card border border-industrial-border rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-industrial-border/60 pb-3">
              <h3 className="text-sm font-extrabold text-white flex items-center space-x-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>TELEMETRÍA Y REGISTROS EN VIVO</span>
              </h3>
              <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
            </div>

            <div className="space-y-3 font-mono">
              {/* Estado Lógico */}
              <div className="bg-black/50 border border-industrial-border/80 rounded-xl p-3">
                <span className="text-[10px] uppercase text-slate-400 font-bold block mb-1">Estado de Celda en PLC</span>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-black text-white">
                    {currentState?.logicalState || 'UNKNOWN'}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-cyan-400 font-bold">
                    Raw: {currentState?.rawValue ?? '--'}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 block mt-1">
                  {currentState?.stateDescription || 'Sin datos de telemetría'}
                </span>
              </div>

              {/* Registros de Receta y Ecos */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-black/50 border border-industrial-border/80 rounded-xl p-3">
                  <span className="text-[9px] uppercase text-slate-400 font-bold block mb-1">Eco Receta A</span>
                  <span className="text-2xl font-black text-cyan-400">
                    {currentState?.echoRecipeA ?? 0}
                  </span>
                </div>

                <div className="bg-black/50 border border-industrial-border/80 rounded-xl p-3">
                  <span className="text-[9px] uppercase text-slate-400 font-bold block mb-1">Eco Receta B</span>
                  <span className="text-2xl font-black text-cyan-400">
                    {currentState?.echoRecipeB ?? 0}
                  </span>
                </div>
              </div>

              {/* Indicadores de Bits de Handshake */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className={`p-2.5 rounded-xl border flex items-center justify-between ${
                  currentState?.recipeReceived
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-900 border-slate-800 text-slate-500'
                }`}>
                  <span className="font-bold text-[10px]">RECIPE_RECEIVED</span>
                  <span className={`w-2.5 h-2.5 rounded-full ${currentState?.recipeReceived ? 'bg-emerald-400 shadow-lg shadow-emerald-400' : 'bg-slate-700'}`} />
                </div>

                <div className={`p-2.5 rounded-xl border flex items-center justify-between ${
                  isConnected
                    ? 'bg-blue-950/60 border-blue-500/40 text-blue-300'
                    : 'bg-slate-900 border-slate-800 text-slate-500'
                }`}>
                  <span className="font-bold text-[10px]">PLC_CONNECTED</span>
                  <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-blue-400' : 'bg-slate-700'}`} />
                </div>
              </div>

              <div className="pt-2 text-right">
                <button
                  type="button"
                  onClick={handleClearSignals}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300 border border-slate-700 flex items-center space-x-1.5 ml-auto transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Limpiar Señales en PLC</span>
                </button>
              </div>
            </div>
          </div>

          {/* Card: Diagnóstico & Prueba de Conectividad TCP (Ping Socket) */}
          <div className="bg-industrial-card border border-industrial-border rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-industrial-border/60 pb-3">
              <h3 className="text-sm font-extrabold text-white flex items-center space-x-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>PRUEBA DE CONECTIVIDAD (PING TCP)</span>
              </h3>
            </div>

            <p className="text-[11px] text-slate-400">
              Verifica apertura de socket TCP y mide el tiempo de respuesta hacia <strong className="text-white">{config.ipAddress}:{config.port}</strong>.
            </p>

            <button
              type="button"
              onClick={handleTestPing}
              disabled={pingLoading}
              className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-black font-extrabold text-xs shadow-lg shadow-amber-950/50 flex items-center justify-center space-x-2 transition disabled:opacity-50"
            >
              <Activity className="w-4 h-4" />
              <span>{pingLoading ? 'Midiendo Latencia TCP...' : 'Probar Socket TCP (Ping)'}</span>
            </button>

            {pingResult && (
              <div className={`p-3 rounded-xl border text-xs space-y-1 font-mono ${
                pingResult.success ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
              }`}>
                <div className="flex items-center justify-between">
                  <strong className="font-sans font-bold">{pingResult.success ? 'CONEXIÓN EXITOSA' : 'ERROR DE CONEXIÓN'}</strong>
                  <span className="text-[11px] font-black">{pingResult.latencyMs} ms</span>
                </div>
                <p className="text-[10px] text-slate-300">{pingResult.message}</p>
              </div>
            )}
          </div>

          {/* Card: Test de Handshake Seguro */}
          <div className="bg-industrial-card border border-industrial-border rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-industrial-border/60 pb-3">
              <h3 className="text-sm font-extrabold text-white flex items-center space-x-2">
                <Play className="w-4 h-4 text-purple-400" />
                <span>TEST DE HANDSHAKE SEGURO</span>
              </h3>
            </div>

            <p className="text-[11px] text-slate-400">
              Transfiere una receta de prueba y verifica la respuesta del bit RecipeReceived y confirmación de eco exacto.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Receta A Prueba</label>
                <input
                  type="number"
                  value={testA}
                  onChange={e => setTestA(parseInt(e.target.value) || 0)}
                  className="w-full bg-industrial-dark border border-industrial-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-white text-center"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Receta B Prueba</label>
                <input
                  type="number"
                  value={testB}
                  onChange={e => setTestB(parseInt(e.target.value) || 0)}
                  className="w-full bg-industrial-dark border border-industrial-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-white text-center"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleTestHandshake}
              disabled={handshakeLoading}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs shadow-lg shadow-purple-950/50 flex items-center justify-center space-x-2 transition disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              <span>{handshakeLoading ? 'Verificando Handshake...' : 'Ejecutar Test de Handshake'}</span>
            </button>

            {handshakeResult && (
              <div className={`p-3 rounded-xl border text-xs space-y-1 font-mono ${
                handshakeResult.success ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
              }`}>
                <div className="flex items-center justify-between">
                  <strong className="font-sans font-bold">{handshakeResult.success ? 'HANDSHAKE VERIFICADO' : 'FALLO HANDSHAKE'}</strong>
                  <span className="text-[11px] font-black">{handshakeResult.durationMs} ms</span>
                </div>
                <p className="text-[10px] text-slate-300">{handshakeResult.message}</p>
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
