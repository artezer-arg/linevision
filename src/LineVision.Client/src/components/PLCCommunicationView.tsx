import React, { useEffect, useState } from 'react';
import { PLCConfiguration, PLCStatusInfo, TcpPingResult, HandshakeTestResult, StationWorkflowConfig } from '../types';
import { api } from '../services/api';
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
  Terminal,
  Send,
  ListOrdered
} from 'lucide-react';

interface Props {
  workflowConfig?: StationWorkflowConfig | null;
  onWorkflowConfigUpdated?: (cfg: StationWorkflowConfig) => void;
}

export const PLCCommunicationView: React.FC<Props> = ({ workflowConfig: initialWorkflowConfig, onWorkflowConfigUpdated }) => {
  const [activeSubTab, setActiveSubTab] = useState<'WORKFLOW' | 'SIEMENS'>('WORKFLOW');
  const [workflowConfig, setWorkflowConfig] = useState<StationWorkflowConfig>(initialWorkflowConfig || {
    workflowMode: 'DIRECT_5_STEP',
    plcIpAddress: '192.168.1.50',
    plcRack: 0,
    plcSlot: 1,
    recipeAddress: 'DB48.DBW2',
    handshakeAddress: 'DB48.DBW6',
    handshakeReqValue: 20,
    handshakeAckValue: 10,
    handshakeIdleValue: 24,
    enableRecipeHandshake: true,
    confirmationAddress: 'DB48.DBX4.0',
    sendConfirmation: true,
    recipeTiming: 'AFTER_ORDER_DETECTED',
    confirmationValue: true,
    retryIntervalMs: 1000,
    displayDelayMs: 2000,
    autoAdvanceOnSuccess: true,
    requireCradleQrMatch: false
  });
  const [savingWorkflow, setSavingWorkflow] = useState(false);
  const [config, setConfig] = useState<PLCConfiguration>({
    plC_ID: 'PLC_DL02',
    stationCode: 'DL02',
    protocol: 'SIEMENS_S7',
    ipAddress: '192.168.1.50',
    port: 102,
    pollingIntervalMs: 100,
    timeoutMs: 2000,
    maxRetries: 3,
    active: true,
    tagRecipeA: 'DB48.DBW0',
    tagRecipeB: 'DB48.DBW2',
    tagRecipeReady: 'DB48.DBX4.0',
    tagStationState: 'DB48.DBW0',
    tagRecipeReceived: 'DB48.DBX4.0',
    tagEchoRecipeA: 'DB48.DBW2',
    tagEchoRecipeB: 'DB48.DBW2'
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
  const [s7Value, setS7Value] = useState<number>(24);
  const [s7SendConfirm, setS7SendConfirm] = useState<boolean>(false);
  const [s7ConfirmVal, setS7ConfirmVal] = useState<boolean>(true);
  const [s7Loading, setS7Loading] = useState(false);
  const [s7Result, setS7Result] = useState<any>(null);

  // Siemens S7 DB48 Handshake (20 -> Receta -> 10 -> 24)
  const [s7HandshakeLoading, setS7HandshakeLoading] = useState(false);
  const [s7HandshakeResult, setS7HandshakeResult] = useState<any>(null);
  const [testRecipeVal, setTestRecipeVal] = useState<number>(15);
  const [offset6Val, setOffset6Val] = useState<number | null>(null);
  const [offset6Loading, setOffset6Loading] = useState(false);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Protocols catalog - Solo Siemens S7
  const PROTOCOLS = [
    {
      id: 'SIEMENS_S7',
      name: 'Siemens S7 (ISO-on-TCP)',
      desc: 'S7-1200 / S7-1500 / S7-300 mediante RFC 1006',
      defaultPort: 102,
      badge: 'DIRECT S7',
      color: 'cyan'
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
          protocol: 'SIEMENS_S7',
          ipAddress: cfg.ipAddress || cfg.IPAddress || '192.168.1.50',
          port: Number(cfg.port || cfg.Port) || 102,
          pollingIntervalMs: Number(cfg.pollingIntervalMs || cfg.PollingIntervalMs) || 100,
          timeoutMs: Number(cfg.timeoutMs || cfg.TimeoutMs) || 2000,
          maxRetries: Number(cfg.maxRetries || cfg.MaxRetries) || 3,
          active: cfg.active !== undefined ? cfg.active : true,
          tagRecipeA: cfg.tagRecipeA || cfg.TagRecipeA || 'DB48.DBW0',
          tagRecipeB: cfg.tagRecipeB || cfg.TagRecipeB || 'DB48.DBW2',
          tagRecipeReady: cfg.tagRecipeReady || cfg.TagRecipeReady || 'DB48.DBX4.0',
          tagStationState: cfg.tagStationState || cfg.TagStationState || 'DB48.DBW0',
          tagRecipeReceived: cfg.tagRecipeReceived || cfg.TagRecipeReceived || 'DB48.DBX4.0',
          tagEchoRecipeA: cfg.tagEchoRecipeA || cfg.TagEchoRecipeA || 'DB48.DBW2',
          tagEchoRecipeB: cfg.tagEchoRecipeB || cfg.TagEchoRecipeB || 'DB48.DBW2'
        });
      }

      if (st) {
        setStatus(st);
      }

      try {
        const wfCfg = await api.getWorkflowConfig();
        if (wfCfg) {
          setWorkflowConfig(wfCfg);
          if (onWorkflowConfigUpdated) onWorkflowConfigUpdated(wfCfg);
        }
      } catch (wfErr) {
        console.warn('Could not load workflow config:', wfErr);
      }
    } catch (err) {
      console.error('Error cargando configuración PLC:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveWorkflowConfig = async () => {
    setSavingWorkflow(true);
    try {
      const res = await api.saveWorkflowConfig(workflowConfig);
      if (res && res.success) {
        showToast('success', `Flujo operativo actualizado: ${workflowConfig.workflowMode === 'DIRECT_5_STEP' ? '5 Pasos Directo S7' : '6 Pasos Tradicional Robot'}`);
        if (onWorkflowConfigUpdated) onWorkflowConfigUpdated(workflowConfig);
      } else {
        showToast('error', 'Error al guardar la configuración del flujo');
      }
    } catch (err: any) {
      showToast('error', err.message || 'Error de red guardando flujo');
    } finally {
      setSavingWorkflow(false);
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

  const handleProtocolSelect = () => {
    setConfig(prev => ({
      ...prev,
      protocol: 'SIEMENS_S7',
      port: 102
    }));
  };

  const handleApplyPreset = () => {
    setConfig(prev => ({
      ...prev,
      protocol: 'SIEMENS_S7',
      port: 102,
      tagRecipeA: 'DB48.DBW0 (nModeloPLC)',
      tagRecipeB: 'DB48.DBW2 (nModeloCamara)',
      tagRecipeReady: 'DB48.DBX4.0 (bResultadoOK)',
      tagStationState: 'DB48.DBW0',
      tagRecipeReceived: 'DB48.DBX4.0',
      tagEchoRecipeA: 'DB48.DBW2',
      tagEchoRecipeB: 'DB48.DBW2'
    }));
    showToast('info', 'Valores estándar aplicados: Siemens S7-1500 DB48 (nModeloPLC, nModeloCamara, bResultadoOK)');
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

  const handleWriteS7Value = async () => {
    setS7Loading(true);
    setS7Result(null);
    try {
      const res = await api.sendS7Recipe({
        ipAddress: config.ipAddress,
        recipe: s7Value,
        sendConfirmation: s7SendConfirm,
        confirmationValue: s7ConfirmVal,
        recipeAddress: 'DB48.DBW2',
        confirmAddress: 'DB48.DBX4.0',
        rack: 0,
        slot: 1
      });
      setS7Result(res);
      if (res && res.success) {
        showToast('success', res.message || 'Transmisión Siemens S7-1500 completada');
      } else {
        showToast('error', res?.message || 'Error al comunicarse con Siemens S7');
      }
    } catch (err: any) {
      showToast('error', err.message || 'Error de red comunicando con PLC');
    } finally {
      setS7Loading(false);
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

  const handleReadOffset6 = async () => {
    setOffset6Loading(true);
    try {
      const res = await api.readS7Offset6(config.ipAddress, workflowConfig.handshakeAddress || 'DB48.DBW6');
      if (res && res.success) {
        setOffset6Val(res.value);
        showToast('success', `Valor leído en ${res.address}: ${res.value}`);
      } else {
        setOffset6Val(res?.value ?? null);
        showToast('error', res?.message || 'Error leyendo Offset 6');
      }
    } catch (e: any) {
      showToast('error', e.message || 'Error leyendo Offset 6');
    } finally {
      setOffset6Loading(false);
    }
  };

  const handleTestS7Handshake = async () => {
    setS7HandshakeLoading(true);
    setS7HandshakeResult(null);
    try {
      const res = await api.testS7Handshake({
        ipAddress: config.ipAddress,
        recipe: testRecipeVal,
        recipeAddress: workflowConfig.recipeAddress || 'DB48.DBW2',
        handshakeAddress: workflowConfig.handshakeAddress || 'DB48.DBW6',
        reqValue: workflowConfig.handshakeReqValue ?? 20,
        ackValue: workflowConfig.handshakeAckValue ?? 10,
        idleValue: workflowConfig.handshakeIdleValue ?? 24,
        rack: 0,
        slot: 1
      });
      setS7HandshakeResult(res);
      if (res && res.success) {
        showToast('success', res.message || 'Handshake S7 completado exitosamente');
      } else {
        showToast('error', res?.message || 'Fallo en Handshake S7');
      }
    } catch (e: any) {
      showToast('error', e.message || 'Error de red en handshake');
    } finally {
      setS7HandshakeLoading(false);
    }
  };

  const handleSetSimOffset6 = async (val: number) => {
    try {
      const res = await api.setSimOffset6(val);
      if (res && res.success) {
        setOffset6Val(val);
        showToast('info', `Offset 6 simulador forzado a ${val}`);
      }
    } catch (e: any) {
      showToast('error', 'Error forzando simulador');
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
          onClick={() => setActiveSubTab('WORKFLOW')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center space-x-2 transition ${
            activeSubTab === 'WORKFLOW'
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-950/40 ring-2 ring-blue-400/40'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Sliders className="w-4 h-4 text-cyan-300" />
          <span>Flujo de Secuencia (5 Pasos S7)</span>
          <span className="px-1.5 py-0.5 bg-black/40 rounded text-[9px] text-cyan-300 border border-cyan-500/40 font-mono">
            {workflowConfig.workflowMode === 'DIRECT_5_STEP' ? '5 PASOS S7' : 'TRADICIONAL'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('SIEMENS')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2 transition ${
            activeSubTab === 'SIEMENS'
              ? 'bg-cyan-600 text-black font-black shadow-lg shadow-cyan-950/40 ring-2 ring-cyan-400/40'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Cpu className="w-4 h-4 text-cyan-400" />
          <span>Conexión Siemens S7 (ISO-on-TCP)</span>
          <span className="px-1.5 py-0.5 bg-black/40 rounded text-[9px] text-cyan-300 border border-cyan-500/40 font-mono">
            RFC 1006 | PUERTO 102
          </span>
        </button>
      </div>

      {activeSubTab === 'WORKFLOW' ? (
        <div className="space-y-6 animate-fade-in">
          {/* Tarjeta Principal de Configuración de Flujo */}
          <div className="bg-industrial-card border border-industrial-border rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-industrial-border pb-4">
              <div>
                <h3 className="text-lg font-black text-white flex items-center space-x-2">
                  <Sliders className="w-5 h-5 text-cyan-400" />
                  <span>SELECCIÓN Y CONFIGURACIÓN DEL FLUJO OPERATIVO</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Elija el orden de los pasos del sistema y configure los parámetros de transmisión y reintento.
                </p>
              </div>

              <button
                type="button"
                onClick={handleSaveWorkflowConfig}
                disabled={savingWorkflow}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-900/30 flex items-center space-x-2 transition disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{savingWorkflow ? 'Guardando Flujo...' : 'Guardar y Aplicar Flujo'}</span>
              </button>
            </div>

            {/* Selector de Modo con Tarjetas Visuales */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Opción 1: 5 Pasos Directo Siemens S7 */}
              <div
                onClick={() => setWorkflowConfig(prev => ({ ...prev, workflowMode: 'DIRECT_5_STEP' }))}
                className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                  workflowConfig.workflowMode === 'DIRECT_5_STEP'
                    ? 'bg-blue-950/70 border-cyan-400 ring-2 ring-cyan-400/40 shadow-xl shadow-cyan-950/50'
                    : 'bg-slate-900/40 border-slate-700/70 hover:border-slate-600 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      workflowConfig.workflowMode === 'DIRECT_5_STEP' ? 'border-cyan-400 bg-cyan-400' : 'border-slate-500'
                    }`}>
                      {workflowConfig.workflowMode === 'DIRECT_5_STEP' && <div className="w-2 h-2 rounded-full bg-black"></div>}
                    </div>
                    <span className="font-black text-sm text-white">MODO 5 PASOS DIRECTO SIEMENS S7</span>
                  </div>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    ACTUAL RECOMENDADO
                  </span>
                </div>

                <p className="text-xs text-slate-300 mb-3 leading-relaxed">
                  Secuencia directa optimizada de 5 pasos con comunicación directa S7 al PLC Siemens S7-1500 (DB48) y reintentos automáticos continuos ante No Conforme (NG):
                </p>

                {workflowConfig.recipeTiming !== 'AFTER_CRADLE_OK' ? (
                  <ol className="text-xs space-y-2 text-slate-300 font-mono bg-black/40 p-3.5 rounded-xl border border-slate-800">
                    <li className="flex items-start space-x-2">
                      <span className="w-4 h-4 rounded-full bg-cyan-900 text-cyan-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                      <span><strong>1. Consulta DB:</strong> Obtiene secuencia, mano y posición automáticamente.</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="w-4 h-4 rounded-full bg-cyan-900 text-cyan-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                      <span><strong>2. Receta PLC (Directo):</strong> Escribe de inmediato el entero al PLC (DB48.DBW2).</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="w-4 h-4 rounded-full bg-cyan-900 text-cyan-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                      <span><strong>3. Control Cuna:</strong> 3.a OK pasa a 4; 3.b NG muestra error hasta colocar la correcta.</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="w-4 h-4 rounded-full bg-cyan-900 text-cyan-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">4</span>
                      <span><strong>4. Control Panel:</strong> 4.a OK envía booleano True a DB48.DBX4.0; 4.b NG reintenta.</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="w-4 h-4 rounded-full bg-cyan-900 text-cyan-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">5</span>
                      <span><strong>5. Siguiente Panel:</strong> Commit Produccion_Secuencia y avance automático de orden.</span>
                    </li>
                  </ol>
                ) : (
                  <ol className="text-xs space-y-2 text-slate-300 font-mono bg-black/40 p-3.5 rounded-xl border border-slate-800">
                    <li className="flex items-start space-x-2">
                      <span className="w-4 h-4 rounded-full bg-cyan-900 text-cyan-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                      <span><strong>1. Consulta DB:</strong> Obtiene secuencia, mano y posición automáticamente.</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="w-4 h-4 rounded-full bg-cyan-900 text-cyan-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                      <span><strong>2. Control Cuna:</strong> 2.a OK pasa a 3; 2.b NG muestra error hasta colocar la correcta.</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="w-4 h-4 rounded-full bg-cyan-900 text-cyan-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                      <span><strong>3. Receta PLC:</strong> Envío de número entero indicando qué hacer (DB48.DBW2).</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="w-4 h-4 rounded-full bg-cyan-900 text-cyan-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">4</span>
                      <span><strong>4. Control Panel:</strong> 4.a OK envía booleano True a DB48.DBX4.0; 4.b NG reintenta.</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="w-4 h-4 rounded-full bg-cyan-900 text-cyan-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">5</span>
                      <span><strong>5. Siguiente Panel:</strong> Commit Produccion_Secuencia y avance automático de orden.</span>
                    </li>
                  </ol>
                )}
              </div>

              {/* Opción 2: 6 Pasos Tradicional Robot Handshake */}
              <div
                onClick={() => setWorkflowConfig(prev => ({ ...prev, workflowMode: 'LEGACY_ROBOT_HANDSHAKE' }))}
                className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                  workflowConfig.workflowMode === 'LEGACY_ROBOT_HANDSHAKE'
                    ? 'bg-indigo-950/70 border-indigo-400 ring-2 ring-indigo-400/40 shadow-xl shadow-indigo-950/50'
                    : 'bg-slate-900/40 border-slate-700/70 hover:border-slate-600 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      workflowConfig.workflowMode === 'LEGACY_ROBOT_HANDSHAKE' ? 'border-indigo-400 bg-indigo-400' : 'border-slate-500'
                    }`}>
                      {workflowConfig.workflowMode === 'LEGACY_ROBOT_HANDSHAKE' && <div className="w-2 h-2 rounded-full bg-black"></div>}
                    </div>
                    <span className="font-black text-sm text-white">MODO 6 PASOS TRADICIONAL (ROBOT)</span>
                  </div>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-700/50 text-slate-300 border border-slate-600">
                    LEGACY
                  </span>
                </div>

                <p className="text-xs text-slate-300 mb-3 leading-relaxed">
                  Flujo original con validación de cuna, lectura estricta de QR, control de panel, verificación PLC Ready, handshake A/B con eco de receta y espera de fin de ciclo robot:
                </p>

                <ol className="text-xs space-y-2 text-slate-300 font-mono bg-black/40 p-3.5 rounded-xl border border-slate-800">
                  <li className="flex items-start space-x-2">
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                    <span><strong>1. Cuna:</strong> Visión de insertos y mano.</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                    <span><strong>2. QR Cuna:</strong> Lectura obligatoria de código QR.</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                    <span><strong>3. Panel:</strong> Calidad de clips y componentes.</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">4</span>
                    <span><strong>4. PLC Ready:</strong> Sondeo de celda libre (State=FREE).</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">5</span>
                    <span><strong>5. Receta:</strong> Handshake Recipe_A / Recipe_B con eco.</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">6</span>
                    <span><strong>6. Robot:</strong> Monitoreo de soldadura y fin de ciclo.</span>
                  </li>
                </ol>
              </div>
            </div>

            {/* Ajustes Detallados del Modo 5 Pasos */}
            {workflowConfig.workflowMode === 'DIRECT_5_STEP' && (
              <div className="pt-4 border-t border-slate-800 space-y-4">
                <h4 className="text-xs font-black text-cyan-300 uppercase tracking-wider flex items-center space-x-2">
                  <Zap className="w-4 h-4" />
                  <span>PARÁMETROS DE COMUNICACIÓN S7 Y COMPORTAMIENTO (MODO 5 PASOS)</span>
                </h4>

                {/* Selector de Momento de Envío de Receta */}
                <div className="bg-gradient-to-r from-blue-950/60 to-cyan-950/40 border border-cyan-500/40 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md">
                  <div>
                    <span className="text-xs font-black text-cyan-300 block flex items-center space-x-2">
                      <Send className="w-4 h-4 text-cyan-400" />
                      <span>MOMENTO DE ENVÍO DE LA RECETA AL PLC (DB48.DBW2)</span>
                    </span>
                    <span className="text-[11px] text-slate-300 mt-0.5 block">
                      {workflowConfig.recipeTiming !== 'AFTER_CRADLE_OK'
                        ? 'Envío Inmediato (Paso 2): Escribe la receta al Siemens S7 inmediatamente al constatar modelo, mano y posición desde la DB.'
                        : 'Envío tras Cuna (Paso 3): Espera a que el control de cuna dé OK para escribir la receta al PLC.'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setWorkflowConfig(prev => ({ ...prev, recipeTiming: 'AFTER_ORDER_DETECTED' }))}
                      className={`px-3.5 py-2 rounded-lg text-xs font-extrabold flex items-center space-x-1.5 transition ${
                        workflowConfig.recipeTiming !== 'AFTER_CRADLE_OK'
                          ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-950/60 ring-2 ring-cyan-300'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>Inmediato (Tras DB)</span>
                      {workflowConfig.recipeTiming !== 'AFTER_CRADLE_OK' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWorkflowConfig(prev => ({ ...prev, recipeTiming: 'AFTER_CRADLE_OK' }))}
                      className={`px-3.5 py-2 rounded-lg text-xs font-extrabold flex items-center space-x-1.5 transition ${
                        workflowConfig.recipeTiming === 'AFTER_CRADLE_OK'
                          ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-950/60 ring-2 ring-cyan-300'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>Tras Cuna OK</span>
                      {workflowConfig.recipeTiming === 'AFTER_CRADLE_OK' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* IP PLC */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">IP PLC Siemens S7-1500</label>
                    <input
                      type="text"
                      value={workflowConfig.plcIpAddress}
                      onChange={e => setWorkflowConfig(prev => ({ ...prev, plcIpAddress: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>

                  {/* Dirección Receta */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">
                      Dirección Receta ({workflowConfig.recipeTiming !== 'AFTER_CRADLE_OK' ? 'Paso 2' : 'Paso 3'})
                    </label>
                    <input
                      type="text"
                      value={workflowConfig.recipeAddress}
                      onChange={e => setWorkflowConfig(prev => ({ ...prev, recipeAddress: e.target.value }))}
                      placeholder="DB48.DBW2"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                    />
                    <span className="text-[10px] text-slate-400">Escribe entero Int16 (nModeloCamara)</span>
                  </div>

                  {/* Dirección Confirmación */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">
                      Dirección Confirmación (Paso 4.a)
                    </label>
                    <input
                      type="text"
                      value={workflowConfig.confirmationAddress}
                      onChange={e => setWorkflowConfig(prev => ({ ...prev, confirmationAddress: e.target.value }))}
                      placeholder="DB48.DBX4.0"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                    />
                    <span className="text-[10px] text-slate-400">Escribe bit booleano (bResultadoOK)</span>
                  </div>

                  {/* Switch Confirmación */}
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">Enviar Confirmación (Paso 4.a)</span>
                      <span className="text-[10px] text-slate-400">Desactiva el envío del bit si no se requiere</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={workflowConfig.sendConfirmation}
                        onChange={e => setWorkflowConfig(prev => ({ ...prev, sendConfirmation: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>

                  {/* Intervalo de reintento NG */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">
                      Reintento ante NG (Pasos 2.b y 4.b)
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min="200"
                        step="100"
                        value={workflowConfig.retryIntervalMs}
                        onChange={e => setWorkflowConfig(prev => ({ ...prev, retryIntervalMs: parseInt(e.target.value) || 1000 }))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                      />
                      <span className="text-xs text-slate-400 font-mono">ms</span>
                    </div>
                    <span className="text-[10px] text-slate-400">Pausa entre capturas mientras espera corrección</span>
                  </div>

                  {/* Tiempo de visualización verde */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">
                      Visualización OK antes de avanzar (Paso 5)
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min="500"
                        step="250"
                        value={workflowConfig.displayDelayMs}
                        onChange={e => setWorkflowConfig(prev => ({ ...prev, displayDelayMs: parseInt(e.target.value) || 2000 }))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                      />
                      <span className="text-xs text-slate-400 font-mono">ms</span>
                    </div>
                    <span className="text-[10px] text-slate-400">Tiempo que el HMI muestra verde</span>
                  </div>
                </div>

                {/* Toggles Adicionales */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">Avanzar Automáticamente de Panel</span>
                      <span className="text-[10px] text-slate-400">Avanza el puntero de Produccion_Secuencia al completar OK</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={workflowConfig.autoAdvanceOnSuccess}
                        onChange={e => setWorkflowConfig(prev => ({ ...prev, autoAdvanceOnSuccess: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                    </label>
                  </div>

                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">Exigir Validación QR de Cuna</span>
                      <span className="text-[10px] text-slate-400">Si está desactivado, solo valida visión física de insertos en Paso 2</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={workflowConfig.requireCradleQrMatch}
                        onChange={e => setWorkflowConfig(prev => ({ ...prev, requireCradleQrMatch: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                    </label>
                  </div>
                </div>

                {/* PROTOCOLO HANDSHAKE RECETA DB48 */}
                <div className="bg-gradient-to-r from-cyan-950/40 via-blue-950/30 to-indigo-950/40 border border-cyan-500/40 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-cyan-800/40 pb-2">
                    <div className="flex items-center space-x-2">
                      <Cpu className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-black text-cyan-300 uppercase tracking-wide">
                        PROTOCOLO HANDSHAKE DE RECETA DB48 (20 → RECETA → 10 → 24)
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={workflowConfig.enableRecipeHandshake ?? true}
                        onChange={e => setWorkflowConfig(prev => ({ ...prev, enableRecipeHandshake: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                    </label>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    <strong>Modelos estándar (ej. D3L)</strong>: Al recibir <strong>{workflowConfig.handshakeReqValue ?? 20}</strong> en {workflowConfig.handshakeAddress || 'DB48.DBW6'}, transmite la receta de la secuencia a {workflowConfig.recipeAddress || 'DB48.DBW2'} hasta confirmación <strong>{workflowConfig.handshakeAckValue ?? 10}</strong> (sin enviar receta 24).<br />
                    <strong>Modelos D1H (Doble Handshake)</strong>: Tras confirmar la primera receta con {workflowConfig.handshakeAckValue ?? 10}, espera una segunda solicitud <strong>{workflowConfig.handshakeReqValue ?? 20}</strong> para transmitir la segunda receta con valor <strong>{workflowConfig.specialSecondRecipeValue ?? 24}</strong> hasta confirmación <strong>{workflowConfig.handshakeAckValue ?? 10}</strong>.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1">
                    <div>
                      <label className="text-[10px] font-bold text-slate-300 block mb-1">Dirección Handshake (Offset 6)</label>
                      <input
                        type="text"
                        value={workflowConfig.handshakeAddress || 'DB48.DBW6'}
                        onChange={e => setWorkflowConfig(prev => ({ ...prev, handshakeAddress: e.target.value }))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-cyan-300 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-300 block mb-1">Valor Solicitud PLC (Req)</label>
                      <input
                        type="number"
                        value={workflowConfig.handshakeReqValue ?? 20}
                        onChange={e => setWorkflowConfig(prev => ({ ...prev, handshakeReqValue: parseInt(e.target.value) || 20 }))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-300 block mb-1">Valor Confirmación PLC (Ack)</label>
                      <input
                        type="number"
                        value={workflowConfig.handshakeAckValue ?? 10}
                        onChange={e => setWorkflowConfig(prev => ({ ...prev, handshakeAckValue: parseInt(e.target.value) || 10 }))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-300 block mb-1">Modelos Doble Receta</label>
                      <input
                        type="text"
                        value={workflowConfig.specialDualRecipeModels || 'D1H'}
                        onChange={e => setWorkflowConfig(prev => ({ ...prev, specialDualRecipeModels: e.target.value }))}
                        placeholder="D1H"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-amber-400 font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between pt-2 border-t border-cyan-900/40 text-[11px] gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-300 font-bold">Segunda Receta para D1H:</span>
                      <input
                        type="number"
                        value={workflowConfig.specialSecondRecipeValue ?? 24}
                        onChange={e => setWorkflowConfig(prev => ({ ...prev, specialSecondRecipeValue: parseInt(e.target.value) || 24 }))}
                        className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-emerald-400 font-mono font-bold"
                      />
                    </div>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={workflowConfig.enableDualHandshakeForSpecialModels ?? true}
                        onChange={e => setWorkflowConfig(prev => ({ ...prev, enableDualHandshakeForSpecialModels: e.target.checked }))}
                        className="rounded border-slate-700 text-cyan-600 focus:ring-0"
                      />
                      <span className="text-xs text-slate-300">Activar Doble Handshake para D1H</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
        {/* 2. Columna Izquierda: Parámetros de Red y Protocolo */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card: Selector de Protocolo Siemens S7 Exclusivo */}
          <div className="bg-industrial-card border border-industrial-border rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-industrial-border/60 pb-3">
              <h3 className="text-sm font-extrabold text-white flex items-center space-x-2">
                <Radio className="w-4 h-4 text-cyan-400" />
                <span>MÉTODO DE CONEXIÓN PLC</span>
              </h3>
              <span className="text-[11px] text-cyan-400 font-bold">MÉTODO EXCLUSIVO</span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div
                className="p-4 rounded-xl text-left border bg-blue-950/40 border-cyan-500 ring-2 ring-cyan-500/20 shadow-lg shadow-cyan-950/40 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-extrabold text-sm text-white flex items-center space-x-2">
                    <Cpu className="w-4 h-4 text-cyan-400" />
                    <span>Siemens S7 (ISO-on-TCP)</span>
                  </span>
                  <span className="text-[10px] font-black px-2.5 py-1 rounded tracking-wider uppercase bg-cyan-500 text-black font-extrabold">
                    DIRECT S7
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed mt-1">
                  S7-1200 / S7-1500 / S7-300 mediante RFC 1006. Conexión nativa industrial a Data Blocks (DB48).
                </p>
                <div className="mt-3 text-xs text-slate-400 font-mono flex items-center justify-between">
                  <div>
                    Puerto estándar sugerido: <strong className="text-white font-bold">102</strong>
                  </div>
                  <div className="flex items-center space-x-1.5 text-emerald-400 text-xs font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>DRIVER ACTIVO</span>
                  </div>
                </div>
              </div>
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
                  <span>MAPEO DE REGISTROS SIEMENS (DB48)</span>
                </h3>
                <span className="text-[11px] text-slate-400">Direccionamiento nativo S7 para variables y Data Blocks (DB48)</span>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleApplyPreset}
                  className="px-3 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/50 text-[10px] font-bold text-cyan-300 flex items-center space-x-1.5 transition"
                >
                  <RefreshCw className="w-3 h-3 text-cyan-400" />
                  <span>Restablecer Mapeo DB48 Predeterminado</span>
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

          {/* Card: Envío Directo Siemens DB48 (Receta + Confirmación Opcional) */}
          <div className="bg-industrial-card border border-industrial-border rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-industrial-border/60 pb-3">
              <h3 className="text-sm font-extrabold text-white flex items-center space-x-2">
                <Cpu className="w-4 h-4 text-cyan-400" />
                <span>COMUNICACIÓN DIRECTA SIEMENS (DB48)</span>
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold">
                DB48.DBW2 + DB48.DBX4.0
              </span>
            </div>

            <p className="text-[11px] text-slate-400">
              Envía la receta (<strong className="text-white">DB48.DBW2</strong>) y opcionalmente el bit de confirmación (<strong className="text-white">DB48.DBX4.0</strong>) a Siemens S7-1500 ({config.ipAddress}:102).
            </p>

            {/* 1. Entero de Receta */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase font-bold text-slate-400">
                  1. Receta (Entero 16-bit Int)
                </label>
                <span className="text-[9px] font-mono text-cyan-400 font-bold">DB48.DBW2 (nModeloCamara)</span>
              </div>
              <input
                type="number"
                value={s7Value}
                onChange={e => setS7Value(parseInt(e.target.value) || 0)}
                placeholder="24"
                className="w-full bg-industrial-dark border border-industrial-border rounded-lg px-2.5 py-2 text-sm font-mono text-cyan-400 font-black text-center"
              />
            </div>

            {/* 2. Switch Toggle para Confirmación Booleana */}
            <div className="bg-industrial-dark/70 border border-industrial-border rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-black text-white block">2. Señal de Confirmación</span>
                  <span className="text-[10px] font-mono text-slate-400">DB48.DBX4.0 (bResultadoOK)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setS7SendConfirm(!s7SendConfirm)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition flex items-center space-x-1.5 border ${
                    s7SendConfirm
                      ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950/50'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${s7SendConfirm ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  <span>{s7SendConfirm ? 'ACTIVADA (Se enviará)' : 'DESACTIVADA (No enviar)'}</span>
                </button>
              </div>

              {s7SendConfirm ? (
                <div className="pt-2 border-t border-industrial-border/60">
                  <span className="text-[10px] font-bold text-slate-400 block mb-1.5">Valor del Booleano a enviar:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setS7ConfirmVal(true)}
                      className={`py-1.5 rounded-lg text-xs font-black transition flex items-center justify-center space-x-1.5 border ${
                        s7ConfirmVal
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-900/40'
                          : 'bg-slate-900/80 text-slate-400 border-industrial-border hover:bg-slate-800'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>TRUE (1 - OK)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setS7ConfirmVal(false)}
                      className={`py-1.5 rounded-lg text-xs font-black transition flex items-center justify-center space-x-1.5 border ${
                        !s7ConfirmVal
                          ? 'bg-rose-600 text-white border-rose-400 shadow-md shadow-rose-900/40'
                          : 'bg-slate-900/80 text-slate-400 border-industrial-border hover:bg-slate-800'
                      }`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>FALSE (0 - NOK)</span>
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-slate-500 italic">
                  Solo se enviará el entero a DB48.DBW2. El bit bResultadoOK (DB48.DBX4.0) permanecerá intacto en el PLC.
                </p>
              )}
            </div>

            {/* Botón de Envío */}
            <button
              type="button"
              onClick={handleWriteS7Value}
              disabled={s7Loading}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-extrabold text-xs shadow-lg shadow-cyan-950/50 flex items-center justify-center space-x-2 transition disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{s7Loading ? 'Transmitiendo a Siemens S7-1500...' : (s7SendConfirm ? 'Enviar Receta + Confirmación a PLC' : 'Enviar Receta a DB48.DBW2')}</span>
            </button>

            {/* Resultado */}
            {s7Result && (
              <div className={`p-3 rounded-xl border text-xs space-y-1.5 font-mono ${
                s7Result.success ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
              }`}>
                <div className="flex items-center justify-between">
                  <strong className="font-sans font-bold">{s7Result.success ? 'TRANSMISIÓN CONFIRMADA' : 'ERROR DE TRANSMISIÓN'}</strong>
                  {s7Result.durationMs !== undefined && <span className="text-[11px] font-black">{s7Result.durationMs} ms</span>}
                </div>
                <p className="text-[10px] text-slate-300">{s7Result.message}</p>
                <div className="pt-1 border-t border-slate-700/50 text-[10px] space-y-0.5">
                  <div>Receta en DB48.DBW2: <strong className="text-white">{s7Result.recipeVerified ?? s7Result.recipeSent ?? '--'}</strong></div>
                  <div>Confirmación en DB48.DBX4.0: <strong className={s7Result.sendConfirmation ? (s7Result.confirmationVerified ? 'text-emerald-400' : 'text-rose-400') : 'text-slate-400'}>
                    {s7Result.sendConfirmation ? (s7Result.confirmationVerified ? 'TRUE (OK)' : 'FALSE (NOK)') : 'DESACTIVADA (No enviada)'}
                  </strong></div>
                </div>
              </div>
            )}
          </div>

          {/* Card: Test Protocolo Handshake DB48 (20 -> Receta -> 10 -> 24) */}
          <div className="bg-gradient-to-b from-industrial-card to-cyan-950/20 border-2 border-cyan-500/50 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-cyan-800/50 pb-3 flex-wrap gap-2">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-400 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white tracking-wide">
                    TEST HANDSHAKE DB48 (20 → RECETA → 10 → 24)
                  </h3>
                  <span className="text-[10px] text-cyan-300 font-mono">
                    Lectura Offset 6 ({workflowConfig.handshakeAddress || 'DB48.DBW6'}) & Escritura ({workflowConfig.recipeAddress || 'DB48.DBW2'})
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/40">
                PROTOCOLO PLANTA
              </span>
            </div>

            {/* Monitor en Vivo de Offset 6 */}
            <div className="bg-black/50 border border-cyan-900/60 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                  <Radio className="w-4 h-4 text-cyan-400" />
                  <span>Estado de Señal en {workflowConfig.handshakeAddress || 'DB48.DBW6'}:</span>
                </span>
                <button
                  type="button"
                  onClick={handleReadOffset6}
                  disabled={offset6Loading}
                  className="px-3 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/40 text-[10px] font-bold text-cyan-300 transition flex items-center space-x-1 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${offset6Loading ? 'animate-spin' : ''}`} />
                  <span>{offset6Loading ? 'Leyendo...' : 'Leer Offset 6 Ahora'}</span>
                </button>
              </div>

              <div className="flex items-center space-x-3">
                <div className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 font-mono text-lg font-black text-white min-w-[70px] text-center shadow-inner">
                  {offset6Val !== null ? offset6Val : '--'}
                </div>
                <div className="text-xs space-y-1">
                  {offset6Val === (workflowConfig.handshakeReqValue ?? 20) && (
                    <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold inline-block animate-pulse">
                      ● VALOR {offset6Val}: PLC SOLICITANDO RECETA
                    </span>
                  )}
                  {offset6Val === (workflowConfig.handshakeAckValue ?? 10) && (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold inline-block">
                      ✓ VALOR {offset6Val}: PLC RECETA CONFIRMADA
                    </span>
                  )}
                  {offset6Val !== (workflowConfig.handshakeReqValue ?? 20) && offset6Val !== (workflowConfig.handshakeAckValue ?? 10) && offset6Val !== null && (
                    <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 font-mono inline-block">
                      VALOR {offset6Val} (ESPERA O INACTIVO)
                    </span>
                  )}
                  {offset6Val === null && (
                    <span className="text-[11px] text-slate-500 italic block">
                      Presiona "Leer Offset 6 Ahora" para consultar el valor actual del PLC.
                    </span>
                  )}
                </div>
              </div>

              {/* Forzar Simulador (Para pruebas locales) */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                <span className="text-slate-400">Forzar Offset 6 (Banco / Simulador):</span>
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={() => handleSetSimOffset6(20)}
                    className="px-2.5 py-1 rounded bg-amber-950/80 hover:bg-amber-900 border border-amber-500/40 text-amber-300 font-bold transition"
                  >
                    Simular 20 (Pide)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetSimOffset6(10)}
                    className="px-2.5 py-1 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 font-bold transition"
                  >
                    Simular 10 (Confirma)
                  </button>
                </div>
              </div>
            </div>

            {/* Parámetros de Disparo de Prueba */}
            <div className="space-y-2">
              <label className="text-[11px] uppercase font-bold text-slate-300 block">
                Receta de Prueba para la Secuencia:
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  value={testRecipeVal}
                  onChange={e => setTestRecipeVal(parseInt(e.target.value) || 15)}
                  placeholder="15"
                  className="w-full bg-industrial-dark border border-industrial-border rounded-xl px-3 py-2 text-sm font-mono text-cyan-300 font-black text-center"
                />
                <button
                  type="button"
                  onClick={handleTestS7Handshake}
                  disabled={s7HandshakeLoading}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs shadow-lg shadow-cyan-950/60 flex items-center space-x-2 transition disabled:opacity-50 shrink-0"
                >
                  <Play className={`w-4 h-4 ${s7HandshakeLoading ? 'animate-spin' : ''}`} />
                  <span>{s7HandshakeLoading ? 'Ejecutando Handshake...' : 'Ejecutar Handshake Completo'}</span>
                </button>
              </div>
              <span className="text-[10px] text-slate-400 block">
                Simula el flujo completo: espera 20 en Offset 6 → envía {testRecipeVal} a DB48.DBW2 → espera 10 en Offset 6 → envía 24 a DB48.DBW2.
              </span>
            </div>

            {/* Resultado del Handshake */}
            {s7HandshakeResult && (
              <div className={`p-4 rounded-xl border text-xs space-y-2 font-mono ${
                s7HandshakeResult.success
                  ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-200'
                  : 'bg-rose-950/70 border-rose-500/50 text-rose-200'
              }`}>
                <div className="flex items-center justify-between">
                  <strong className="font-sans font-black flex items-center space-x-1.5">
                    {s7HandshakeResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
                    <span>{s7HandshakeResult.success ? 'HANDSHAKE COMPLETADO CON ÉXITO' : 'FALLO EN PROTOCOLO HANDSHAKE'}</span>
                  </strong>
                  <span className="text-[11px] font-black bg-black/40 px-2 py-0.5 rounded">{s7HandshakeResult.durationMs} ms</span>
                </div>
                <p className="text-[11px] text-slate-200">{s7HandshakeResult.message}</p>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700/60 text-[10px]">
                  <div>Receta enviada: <strong className="text-white">{s7HandshakeResult.sequenceRecipeSent}</strong></div>
                  <div>Solicitud PLC (Req): <strong className="text-white">{s7HandshakeResult.handshakeReqDetected}</strong></div>
                  <div>Confirmación PLC (Ack): <strong className="text-white">{s7HandshakeResult.handshakeAckReceived}</strong></div>
                  <div>Valor Reposo enviado: <strong className="text-cyan-300 font-bold">{s7HandshakeResult.idleValueSent} (en DB48.DBW2)</strong></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
