import React, { useEffect, useState, useRef } from 'react';
import {
  Terminal,
  Server,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Send,
  Zap,
  RefreshCw,
  Save,
  RotateCcw,
  Sliders,
  Play,
  Check,
  Power,
  Layers,
  ArrowRight,
  Info,
  Activity
} from 'lucide-react';
import { TelnetGatewayConfig, TelnetSendResult, TelnetLogEntry, PLCConfiguration } from '../types';
import { api } from '../services/api';

interface Props {
  plcConfig: PLCConfiguration;
  onActivateAsMainDriver: () => Promise<void>;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const TelnetGatewaySection: React.FC<Props> = ({ plcConfig, onActivateAsMainDriver, showToast }) => {
  // Config state
  const [config, setConfig] = useState<TelnetGatewayConfig>({
    host: '127.0.0.1',
    port: 12345,
    timeoutMs: 3000,
    commandTemplate: 'RECIPE:{recipeA},{recipeB}',
    lineTerminator: 'CRLF',
    waitForResponse: true,
    expectedResponsePattern: 'OK|ACK|RECIPE',
    active: true,
    isMockRunning: false
  });

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pingLoading, setPingLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [toggleMockLoading, setToggleMockLoading] = useState(false);
  const [pingResult, setPingResult] = useState<TelnetSendResult | null>(null);
  const [sendResult, setSendResult] = useState<TelnetSendResult | null>(null);
  const [logs, setLogs] = useState<TelnetLogEntry[]>([]);

  // Test inputs
  const [testRecipeA, setTestRecipeA] = useState<number>(101);
  const [testRecipeB, setTestRecipeB] = useState<number>(201);
  const [testCradle, setTestCradle] = useState<string>('CUNA-01');
  const [testModel, setTestModel] = useState<string>('P1B');
  const [rawCommand, setRawCommand] = useState<string>('RECIPE:101,201');

  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Presets catalog
  const PRESETS = [
    {
      id: 'TAGGED',
      label: 'RECIPE:A,B',
      template: 'RECIPE:{recipeA},{recipeB}',
      desc: 'Comando estándar etiquetado (ej. RECIPE:101,201)'
    },
    {
      id: 'RAW_CSV',
      label: 'A,B (CSV)',
      template: '{recipeA},{recipeB}',
      desc: 'Valores separados por coma (ej. 101,201)'
    },
    {
      id: 'SET_CMD',
      label: 'SET_RECIPE A B',
      template: 'SET_RECIPE {recipeA} {recipeB}',
      desc: 'Sintaxis de comando Telnet (ej. SET_RECIPE 101 201)'
    },
    {
      id: 'JSON',
      label: 'JSON',
      template: '{"recipeA":{recipeA},"recipeB":{recipeB}}',
      desc: 'Estructura JSON serializada'
    },
    {
      id: 'EXTENDED',
      label: 'Extendido (Cuna+Modelo)',
      template: 'RECIPE:{recipeA},{recipeB},{cradleCode},{model}',
      desc: 'Incluye código de cuna física y modelo de pieza'
    }
  ];

  useEffect(() => {
    loadAll();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const cfg = await api.getTelnetConfig();
      if (cfg) {
        setConfig(cfg);
      }
      await fetchLogs();
    } catch (err: any) {
      showToast('error', 'Error al consultar configuración del Gateway: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const l = await api.getTelnetLogs(60);
      if (Array.isArray(l)) {
        setLogs(l);
      }
    } catch (err) {
      // silent
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.saveTelnetConfig(config);
      if (res && res.success) {
        showToast('success', res.message || 'Configuración guardada exitosamente');
        await fetchLogs();
      } else {
        showToast('error', res?.message || 'Error al guardar configuración');
      }
    } catch (err: any) {
      showToast('error', 'Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestPing = async () => {
    setPingLoading(true);
    setPingResult(null);
    try {
      const res = await api.testTelnetConnection({
        host: config.host,
        port: Number(config.port),
        timeoutMs: Number(config.timeoutMs)
      });
      setPingResult(res);
      if (res.success) {
        showToast('success', `¡Conexión establecida con la app del proveedor! (${res.durationMs}ms)`);
      } else {
        showToast('error', res.message);
      }
      await fetchLogs();
    } catch (err: any) {
      showToast('error', 'Error probando conexión TCP: ' + err.message);
    } finally {
      setPingLoading(false);
    }
  };

  const handleSendRecipe = async () => {
    setSendLoading(true);
    setSendResult(null);
    try {
      const res = await api.sendTelnetRecipe(testRecipeA, testRecipeB, testCradle, testModel);
      setSendResult(res);
      if (res.success) {
        showToast('success', res.message);
      } else {
        showToast('error', res.message);
      }
      await fetchLogs();
    } catch (err: any) {
      showToast('error', 'Error enviando receta: ' + err.message);
    } finally {
      setSendLoading(false);
    }
  };

  const handleSendRaw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawCommand.trim()) return;

    try {
      const res = await api.sendTelnetRawCommand(rawCommand.trim());
      if (res.success) {
        showToast('success', `Comando enviado. Respuesta: ${res.receivedResponse || 'OK'}`);
      } else {
        showToast('error', res.message);
      }
      await fetchLogs();
    } catch (err: any) {
      showToast('error', 'Error enviando comando raw: ' + err.message);
    }
  };

  const handleToggleMock = async () => {
    setToggleMockLoading(true);
    try {
      const nextState = !config.isMockRunning;
      const res = await api.toggleTelnetMock(nextState, config.port);
      setConfig(prev => ({ ...prev, isMockRunning: res.isMockRunning }));
      showToast('info', res.message);
      await fetchLogs();
    } catch (err: any) {
      showToast('error', 'Error al conmutar servidor simulado: ' + err.message);
    } finally {
      setToggleMockLoading(false);
    }
  };

  const handleClearLogs = async () => {
    await api.clearTelnetLogs();
    setLogs([]);
  };

  // Preview of the outgoing command string
  const previewPayload = config.commandTemplate
    .replace('{recipeA}', testRecipeA.toString())
    .replace('{recipeB}', testRecipeB.toString())
    .replace('{cradleCode}', testCradle)
    .replace('{model}', testModel);

  const terminatorSymbol = config.lineTerminator === 'CRLF' ? '\\r\\n (Enter)' : config.lineTerminator === 'LF' ? '\\n' : config.lineTerminator === 'CR' ? '\\r' : '(Sin fin de línea)';

  const isCurrentMainDriver = plcConfig.protocol === 'TELNET_GATEWAY';

  return (
    <div className="space-y-6">
      {/* 1. Banner Didáctico e Informativo */}
      <div className="bg-gradient-to-r from-blue-950/60 via-indigo-950/40 to-slate-900 border border-blue-500/40 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/40 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white tracking-wide flex items-center space-x-2">
                <span>¿Qué es la conexión Telnet / Socket TCP hacia la aplicación del proveedor?</span>
              </h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Su proveedor de automatización instaló un <strong>programa puente (*bridge* / *middleware*)</strong> en esta computadora que escucha localmente en la dirección IP <code className="text-cyan-300 font-mono bg-black/40 px-1.5 py-0.5 rounded">127.0.0.1</code> y el puerto TCP <code className="text-cyan-300 font-mono bg-black/40 px-1.5 py-0.5 rounded">12345</code>.
              </p>
              <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                Cuando el proveedor menciona que <em>"lo podés hacer desde un Telnet"</em>, significa que su aplicación recibe comandos de texto plano (como <code className="text-emerald-300 font-mono">RECIPE:101,201</code>). Al recibir ese texto, su programa se encarga internamente de inyectar las recetas en los bloques de datos o registros del PLC físico. <strong>LineVision gestiona esta conexión de forma nativa e industrial sin necesidad de usar la consola negra de Windows.</strong>
              </p>
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-end space-y-2">
            <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-wider uppercase border ${
              isCurrentMainDriver
                ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50 shadow-lg shadow-emerald-950/50'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}>
              {isCurrentMainDriver ? '● DRIVER ACTIVO EN CELDA DL02' : '○ DRIVER SECUNDARIO / STANDBY'}
            </span>

            {!isCurrentMainDriver && (
              <button
                type="button"
                onClick={onActivateAsMainDriver}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md transition active:scale-95 flex items-center space-x-1.5"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Usar en Producción</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLUMNA IZQUIERDA: Configuración y Pruebas (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card: Parámetros del Gateway */}
          <div className="bg-industrial-card border border-industrial-border rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-industrial-border/60 pb-3">
              <h3 className="text-sm font-extrabold text-white flex items-center space-x-2">
                <Server className="w-4 h-4 text-cyan-400" />
                <span>PARÁMETROS DEL GATEWAY TCP (APP DEL PROVEEDOR)</span>
              </h3>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-black flex items-center space-x-1.5 shadow transition active:scale-95 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Guardando...' : 'Guardar Parámetros'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                  Dirección IP (Host)
                </label>
                <input
                  type="text"
                  value={config.host}
                  onChange={e => setConfig({ ...config, host: e.target.value })}
                  className="w-full bg-industrial-dark border border-industrial-border rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  placeholder="127.0.0.1"
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">127.0.0.1 = Misma PC</span>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                  Puerto TCP
                </label>
                <input
                  type="number"
                  value={config.port}
                  onChange={e => setConfig({ ...config, port: parseInt(e.target.value) || 12345 })}
                  className="w-full bg-industrial-dark border border-industrial-border rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  placeholder="12345"
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">Definido por proveedor</span>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                  Timeout (ms)
                </label>
                <input
                  type="number"
                  value={config.timeoutMs}
                  onChange={e => setConfig({ ...config, timeoutMs: parseInt(e.target.value) || 3000 })}
                  className="w-full bg-industrial-dark border border-industrial-border rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  placeholder="3000"
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">Tiempo máx de espera</span>
              </div>
            </div>

            {/* Presets de Plantilla de Comando */}
            <div>
              <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1.5">
                Formato del Comando de Texto (Plantilla de Trama Telnet):
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                {PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setConfig({ ...config, commandTemplate: preset.template })}
                    className={`p-2 rounded-xl text-left border text-xs transition ${
                      config.commandTemplate === preset.template
                        ? 'bg-blue-950/60 border-cyan-500 text-white shadow'
                        : 'bg-industrial-dark/60 border-industrial-border text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <span className="font-bold block text-slate-200">{preset.label}</span>
                    <span className="text-[10px] text-slate-500 block truncate">{preset.template}</span>
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={config.commandTemplate}
                onChange={e => setConfig({ ...config, commandTemplate: e.target.value })}
                className="w-full bg-industrial-dark border border-industrial-border rounded-xl px-3 py-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
                placeholder="RECIPE:{recipeA},{recipeB}"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Variables disponibles: <code className="text-cyan-300 font-mono">{"{recipeA}"}</code>, <code className="text-cyan-300 font-mono">{"{recipeB}"}</code>, <code className="text-cyan-300 font-mono">{"{cradleCode}"}</code>, <code className="text-cyan-300 font-mono">{"{model}"}</code>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                  Terminador de Línea (End of Line)
                </label>
                <select
                  value={config.lineTerminator}
                  onChange={e => setConfig({ ...config, lineTerminator: e.target.value as any })}
                  className="w-full bg-industrial-dark border border-industrial-border rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="CRLF">CRLF (\r\n) - Estándar Telnet / Windows</option>
                  <option value="LF">LF (\n) - Unix / Linux</option>
                  <option value="CR">CR (\r)</option>
                  <option value="NONE">Sin terminador (Raw bytes)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                  Patrón de Respuesta Esperada (Regex)
                </label>
                <input
                  type="text"
                  value={config.expectedResponsePattern}
                  onChange={e => setConfig({ ...config, expectedResponsePattern: e.target.value })}
                  className="w-full bg-industrial-dark border border-industrial-border rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  placeholder="OK|ACK|RECIPE"
                />
              </div>
            </div>

            {/* Vista Previa de la Trama Resultante */}
            <div className="bg-black/50 border border-slate-800 rounded-xl p-3 text-xs space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Previsualización de la Trama a Transmitir:</span>
              <div className="font-mono text-emerald-400 flex items-center justify-between">
                <span>{previewPayload}</span>
                <span className="text-slate-500 text-[10px]">{terminatorSymbol}</span>
              </div>
            </div>
          </div>

          {/* Card: Diagnóstico de Socket TCP & Servidor Simulado */}
          <div className="bg-industrial-card border border-industrial-border rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-industrial-border/60 pb-3">
              <h3 className="text-sm font-extrabold text-white flex items-center space-x-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>DIAGNÓSTICO TCP Y SERVIDOR SIMULADO DE PRUEBAS</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Botón Ping TCP */}
              <button
                type="button"
                onClick={handleTestPing}
                disabled={pingLoading}
                className="py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-black font-extrabold text-xs shadow-lg shadow-amber-950/40 flex items-center justify-center space-x-2 transition active:scale-95 disabled:opacity-50"
              >
                <Activity className={`w-4 h-4 ${pingLoading ? 'animate-spin' : ''}`} />
                <span>{pingLoading ? 'Probando Socket...' : `Probar Conexión TCP (${config.host}:${config.port})`}</span>
              </button>

              {/* Botón Toggle Mock Server */}
              <button
                type="button"
                onClick={handleToggleMock}
                disabled={toggleMockLoading}
                className={`py-3 px-4 rounded-xl font-extrabold text-xs shadow-lg flex items-center justify-center space-x-2 transition active:scale-95 ${
                  config.isMockRunning
                    ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-950/50'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                }`}
              >
                <Power className={`w-4 h-4 ${config.isMockRunning ? 'text-emerald-300' : 'text-slate-400'}`} />
                <span>{config.isMockRunning ? 'Detener Servidor Simulado (12345)' : 'Iniciar Servidor Simulado (12345)'}</span>
              </button>
            </div>

            {config.isMockRunning && (
              <div className="p-3 rounded-xl bg-purple-950/50 border border-purple-500/50 text-purple-200 text-xs flex items-center space-x-3">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-ping" />
                <span><strong>Servidor Simulado Activo:</strong> Escuchando en 127.0.0.1:{config.port}. Puede presionar "Probar Conexión" y "Transmitir Receta" ahora mismo para verificar todo el flujo.</span>
              </div>
            )}

            {pingResult && (
              <div className={`p-3.5 rounded-xl border text-xs font-mono space-y-1 animate-fade-in ${
                pingResult.success ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200' : 'bg-rose-950/60 border-rose-500/50 text-rose-200'
              }`}>
                <div className="flex items-center justify-between font-bold">
                  <span className="flex items-center space-x-2">
                    {pingResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
                    <span>{pingResult.success ? 'PUERTO ABIERTO / CONEXIÓN EXITOSA' : 'ERROR: NO SE PUDO CONECTAR'}</span>
                  </span>
                  <span>{pingResult.durationMs} ms</span>
                </div>
                <p className="text-[11px] text-slate-300">{pingResult.message}</p>
              </div>
            )}
          </div>

          {/* Card: Prueba de Envío de Receta */}
          <div className="bg-industrial-card border border-industrial-border rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-industrial-border/60 pb-3">
              <h3 className="text-sm font-extrabold text-white flex items-center space-x-2">
                <Send className="w-4 h-4 text-emerald-400" />
                <span>PRUEBA DE TRANSMISIÓN DE RECETA HACIA EL PLC</span>
              </h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Receta A</label>
                <input
                  type="number"
                  value={testRecipeA}
                  onChange={e => setTestRecipeA(parseInt(e.target.value) || 0)}
                  className="w-full bg-industrial-dark border border-industrial-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-center text-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Receta B</label>
                <input
                  type="number"
                  value={testRecipeB}
                  onChange={e => setTestRecipeB(parseInt(e.target.value) || 0)}
                  className="w-full bg-industrial-dark border border-industrial-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-center text-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Cuna Física</label>
                <select
                  value={testCradle}
                  onChange={e => setTestCradle(e.target.value)}
                  className="w-full bg-industrial-dark border border-industrial-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                >
                  <option value="CUNA-01">CUNA-01</option>
                  <option value="CUNA-02">CUNA-02</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Modelo</label>
                <select
                  value={testModel}
                  onChange={e => setTestModel(e.target.value)}
                  className="w-full bg-industrial-dark border border-industrial-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                >
                  <option value="P1B">P1B</option>
                  <option value="P1C">P1C</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSendRecipe}
              disabled={sendLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-black text-xs shadow-lg shadow-emerald-950/40 flex items-center justify-center space-x-2 transition active:scale-95 disabled:opacity-50"
            >
              <Send className={`w-4 h-4 ${sendLoading ? 'animate-spin' : ''}`} />
              <span>{sendLoading ? 'Transmitiendo a la App del Proveedor...' : 'Transmitir Receta por Socket TCP'}</span>
            </button>

            {sendResult && (
              <div className={`p-3.5 rounded-xl border text-xs font-mono space-y-1.5 animate-fade-in ${
                sendResult.success ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200' : 'bg-rose-950/60 border-rose-500/50 text-rose-200'
              }`}>
                <div className="flex items-center justify-between font-bold">
                  <span className="flex items-center space-x-2">
                    {sendResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
                    <span>{sendResult.success ? 'RECETA ENVIADA Y CONFIRMADA' : 'FALLO DE ENVÍO'}</span>
                  </span>
                  <span>{sendResult.durationMs} ms</span>
                </div>
                <div className="text-[11px] text-slate-300">
                  Enviado: <strong className="text-white">"{sendResult.sentPayload}"</strong>
                </div>
                {sendResult.receivedResponse && (
                  <div className="text-[11px] text-emerald-400">
                    Respuesta del servidor: <strong className="text-white">"{sendResult.receivedResponse}"</strong>
                  </div>
                )}
                <p className="text-[10px] text-slate-400">{sendResult.message}</p>
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA: Consola y Terminal Telnet Interactiva en Vivo (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-industrial-card border border-industrial-border rounded-2xl p-5 shadow-xl space-y-3 flex flex-col h-[640px]">
            <div className="flex items-center justify-between border-b border-industrial-border/60 pb-3">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-extrabold text-white">TERMINAL TELNET BIDIRECCIONAL</h3>
              </div>
              <button
                type="button"
                onClick={handleClearLogs}
                className="text-[10px] text-slate-400 hover:text-white flex items-center space-x-1"
                title="Limpiar historial de la terminal"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Limpiar</span>
              </button>
            </div>

            {/* Pantalla de Terminal */}
            <div className="flex-1 bg-black/80 rounded-xl p-3 border border-slate-800 font-mono text-xs overflow-y-auto space-y-1.5 select-text">
              {logs.length === 0 ? (
                <div className="text-slate-600 text-center py-12 text-xs">
                  Sin actividad de socket aún.<br />
                  Presione "Probar Conexión" o envíe un comando para ver el tráfico en vivo.
                </div>
              ) : (
                logs.map((entry, idx) => {
                  const time = new Date(entry.timestamp).toLocaleTimeString();
                  let colorClass = 'text-slate-300';
                  let prefix = '•';
                  if (entry.direction === 'SEND') {
                    colorClass = 'text-cyan-400';
                    prefix = '>>';
                  } else if (entry.direction === 'RECV') {
                    colorClass = 'text-emerald-400';
                    prefix = '<<';
                  } else if (entry.direction === 'ERROR') {
                    colorClass = 'text-rose-400';
                    prefix = '✕';
                  } else if (entry.direction === 'INFO') {
                    colorClass = 'text-yellow-300';
                    prefix = 'ℹ';
                  }

                  return (
                    <div key={idx} className="leading-tight break-all">
                      <span className="text-slate-600 text-[10px] mr-2">[{time}]</span>
                      <span className={`font-bold mr-1.5 ${colorClass}`}>{prefix}</span>
                      <span className={colorClass}>{entry.content}</span>
                    </div>
                  );
                })
              )}
              <div ref={terminalEndRef} />
            </div>

            {/* Input de Comando Manual Telnet */}
            <form onSubmit={handleSendRaw} className="pt-2 flex items-center space-x-2">
              <input
                type="text"
                value={rawCommand}
                onChange={e => setRawCommand(e.target.value)}
                placeholder="Escriba un comando (ej. PING, STATUS, RECIPE:101,201)..."
                className="flex-1 bg-black/60 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow transition active:scale-95 flex items-center space-x-1"
                title="Enviar comando por Telnet"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Enviar</span>
              </button>
            </form>
            <span className="text-[10px] text-slate-500">
              Presione Enter para transmitir el comando con terminador {config.lineTerminator} hacia {config.host}:{config.port}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
