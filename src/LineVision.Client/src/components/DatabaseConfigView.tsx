import React, { useEffect, useState } from 'react';
import {
  Database,
  Server,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Save,
  Download,
  Copy,
  Check,
  ShieldCheck,
  Play,
  HardDrive,
  FileCode,
  Eye,
  EyeOff,
  Layers
} from 'lucide-react';
import {
  DatabaseConnectionConfig,
  DatabaseTestResult,
  DatabaseMigrationResult,
  DatabaseTableInfo,
  SqlScriptInfo
} from '../types';
import { api } from '../services/api';

export const DatabaseConfigView: React.FC = () => {
  // Config state
  const [config, setConfig] = useState<DatabaseConnectionConfig>({
    provider: 'Sqlite',
    connectionString: 'Data Source=LineVision_DL02.db',
    server: 'localhost',
    port: 1433,
    databaseName: 'LineVision_DL02',
    username: 'sa',
    password: '',
    integratedSecurity: false,
    trustServerCertificate: true,
    connectionTimeout: 30
  });

  // UI state
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [migrating, setMigrating] = useState<boolean>(false);
  const [loadingTables, setLoadingTables] = useState<boolean>(false);
  const [loadingScript, setLoadingScript] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Results
  const [testResult, setTestResult] = useState<DatabaseTestResult | null>(null);
  const [migrationResult, setMigrationResult] = useState<DatabaseMigrationResult | null>(null);
  const [tables, setTables] = useState<DatabaseTableInfo[]>([]);
  const [sqlScript, setSqlScript] = useState<SqlScriptInfo | null>(null);
  const [selectedScriptProvider, setSelectedScriptProvider] = useState<'SqlServer' | 'Sqlite'>('SqlServer');
  const [seedMasterData, setSeedMasterData] = useState<boolean>(true);
  const [useCustomConnString, setUseCustomConnString] = useState<boolean>(false);

  // Helper to recompute SQL Server connection string
  const computeSqlServerConnString = (cfg: DatabaseConnectionConfig) => {
    const srv = cfg.port && cfg.port !== 1433 ? `${cfg.server || 'localhost'},${cfg.port}` : (cfg.server || 'localhost');
    let cs = `Server=${srv};Database=${cfg.databaseName || 'LineVision_DL02'};`;
    if (cfg.integratedSecurity) {
      cs += 'Integrated Security=True;';
    } else {
      cs += `User Id=${cfg.username || 'sa'};Password=${cfg.password || ''};`;
    }
    if (cfg.trustServerCertificate) {
      cs += 'TrustServerCertificate=True;';
    }
    if (cfg.connectionTimeout) {
      cs += `Connect Timeout=${cfg.connectionTimeout};`;
    }
    return cs;
  };

  // Load initial data
  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const cfg = await api.getDatabaseConfig();
      if (cfg) {
        setConfig(cfg);
      }
      await refreshTables();
      await fetchScript(cfg?.provider === 'SqlServer' ? 'SqlServer' : 'SqlServer');
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Error al conectar con el backend: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const refreshTables = async () => {
    setLoadingTables(true);
    try {
      const tbls = await api.getDatabaseTables();
      if (tbls && Array.isArray(tbls)) {
        setTables(tbls);
      }
    } catch (err: any) {
      console.error('Error fetching tables', err);
    } finally {
      setLoadingTables(false);
    }
  };

  const fetchScript = async (provider: 'SqlServer' | 'Sqlite') => {
    setLoadingScript(true);
    try {
      const scr = await api.getDatabaseSqlScript(provider);
      if (scr) {
        setSqlScript(scr);
      }
    } catch (err: any) {
      console.error('Error fetching script', err);
    } finally {
      setLoadingScript(false);
    }
  };

  // Handlers
  const handleProviderChange = (newProvider: 'Sqlite' | 'SqlServer') => {
    const next = { ...config, provider: newProvider };
    if (newProvider === 'Sqlite') {
      next.connectionString = 'Data Source=LineVision_DL02.db';
    } else {
      next.connectionString = computeSqlServerConnString(next);
    }
    setConfig(next);
    fetchScript(newProvider);
  };

  const handleFieldChange = (field: keyof DatabaseConnectionConfig, value: any) => {
    const next = { ...config, [field]: value };
    if (!useCustomConnString && next.provider === 'SqlServer') {
      next.connectionString = computeSqlServerConnString(next);
    }
    setConfig(next);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setFeedback(null);
    setTestResult(null);
    try {
      const res = await api.testDatabaseConnection(config);
      setTestResult(res);
      if (res.success) {
        setFeedback({
          type: 'success',
          text: `¡Conexión Exitosa con ${res.provider}! Latencia: ${res.responseTimeMs}ms. Tablas detectadas: ${res.tableCount}`
        });
        await refreshTables();
      } else {
        setFeedback({
          type: 'error',
          text: `Fallo de conexión: ${res.message}`
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Error al ejecutar test: ' + err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await api.updateDatabaseConfig(config);
      if (res && res.success) {
        setFeedback({ type: 'success', text: 'Configuración guardada y conexión en caliente establecida.' });
        await refreshTables();
      } else {
        setFeedback({ type: 'error', text: res?.message || 'Error al guardar configuración.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Excepción al guardar: ' + err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleRunMigration = async () => {
    if (!confirm('¿Desea inicializar/verificar las tablas en la base de datos seleccionada?\n\nNOTA: Esta operación es 100% segura. Solo crea tablas y columnas faltantes, NO borra ningún dato existente.')) {
      return;
    }
    setMigrating(true);
    setFeedback(null);
    setMigrationResult(null);
    try {
      const res = await api.runDatabaseMigration(seedMasterData);
      setMigrationResult(res);
      if (res.success) {
        setFeedback({
          type: 'success',
          text: `Esquema verificado correctamente. Tablas operativas: ${res.tablesCreatedOrVerified.length}.`
        });
        await refreshTables();
      } else {
        setFeedback({ type: 'error', text: 'Error durante la migración: ' + res.message });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: 'Error: ' + err.message });
    } finally {
      setMigrating(false);
    }
  };

  const handleCopyScript = () => {
    if (!sqlScript?.content) return;
    navigator.clipboard.writeText(sqlScript.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadScript = () => {
    if (!sqlScript?.content) return;
    const blob = new Blob([sqlScript.content], { type: 'text/sql;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', sqlScript.filename || 'LineVision_Setup.sql');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* 1. Header con Resumen de Estado */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between bg-industrial-card border border-industrial-border rounded-xl p-6 shadow-xl gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-xl bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-inner">
            <Database className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-black text-white tracking-wide">
                Configuración de Base de Datos Industrial
              </h1>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase ${
                config.provider === 'SqlServer'
                  ? 'bg-blue-900/60 text-blue-300 border border-blue-500/50'
                  : 'bg-emerald-950 text-emerald-400 border border-emerald-500/50'
              }`}>
                {config.provider === 'SqlServer' ? 'Microsoft SQL Server' : 'SQLite Local'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">
              Gestione la conexión a bases de datos relacionales para trazabilidad de piezas, almacenamiento de recetas por cuna,
              inspecciones y logs. Incluye scripts idempotentes con protección garantizada contra pérdida de datos.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 w-full md:w-auto justify-end">
          <button
            onClick={loadAll}
            disabled={loading}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold flex items-center space-x-2 border border-slate-700 transition"
            title="Recargar configuración y estado"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Actualizar</span>
          </button>
          <button
            onClick={handleSaveConfig}
            disabled={saving}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black flex items-center space-x-2 shadow-lg shadow-emerald-900/40 transition active:scale-95"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Guardando...' : 'Guardar y Conectar'}</span>
          </button>
        </div>
      </div>

      {/* Alerta de Feedback Global */}
      {feedback && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-xs font-bold animate-fade-in ${
          feedback.type === 'success'
            ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
            : feedback.type === 'error'
            ? 'bg-rose-950/80 border-rose-500/50 text-rose-200'
            : 'bg-blue-950/80 border-blue-500/50 text-blue-200'
        }`}>
          <div className="flex items-center space-x-3">
            {feedback.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            {feedback.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />}
            {feedback.type === 'info' && <Database className="w-5 h-5 text-blue-400 shrink-0" />}
            <span>{feedback.text}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white ml-4 text-sm"
          >
            &times;
          </button>
        </div>
      )}

      {/* Grid Principal: Parámetros a la izquierda, Estado y Migraciones a la derecha */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLUMNA IZQUIERDA: Formulario de Conexión (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-industrial-card border border-industrial-border rounded-xl p-5 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-industrial-border pb-3">
              <div className="flex items-center space-x-2">
                <Server className="w-5 h-5 text-cyan-400" />
                <h2 className="font-extrabold text-sm text-white uppercase tracking-wider">
                  Parámetros de Conexión
                </h2>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                Puesto: DL02 (Línea de Ensamble)
              </span>
            </div>

            {/* Selector de Motor de Base de Datos */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-2">
                Motor de Base de Datos:
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleProviderChange('Sqlite')}
                  className={`p-3 rounded-xl border text-left flex items-start space-x-3 transition ${
                    config.provider === 'Sqlite'
                      ? 'bg-emerald-950/40 border-emerald-500 text-white shadow-md'
                      : 'bg-slate-900/60 border-industrial-border text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <HardDrive className={`w-5 h-5 mt-0.5 ${config.provider === 'Sqlite' ? 'text-emerald-400' : 'text-slate-500'}`} />
                  <div>
                    <span className="font-bold text-xs block text-slate-200">SQLite (Local Standalone)</span>
                    <span className="text-[11px] text-slate-400">Archivo local ligero .db, sin requerir servidor externo</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleProviderChange('SqlServer')}
                  className={`p-3 rounded-xl border text-left flex items-start space-x-3 transition ${
                    config.provider === 'SqlServer'
                      ? 'bg-blue-900/40 border-blue-500 text-white shadow-md'
                      : 'bg-slate-900/60 border-industrial-border text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <Server className={`w-5 h-5 mt-0.5 ${config.provider === 'SqlServer' ? 'text-blue-400' : 'text-slate-500'}`} />
                  <div>
                    <span className="font-bold text-xs block text-slate-200">Microsoft SQL Server</span>
                    <span className="text-[11px] text-slate-400">Estándar de planta / SCADA / MES / Azure SQL</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Campos condicionales según el motor */}
            {config.provider === 'Sqlite' ? (
              <div className="space-y-3 bg-slate-900/40 p-4 rounded-xl border border-industrial-border">
                <label className="text-xs font-bold text-slate-300 block">
                  Cadena de Conexión SQLite (Ruta del Archivo):
                </label>
                <input
                  type="text"
                  value={config.connectionString}
                  onChange={e => setConfig({ ...config, connectionString: e.target.value })}
                  className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2.5 text-xs text-white font-mono"
                  placeholder="Data Source=LineVision_DL02.db"
                />
                <p className="text-[11px] text-slate-400">
                  Nota: El archivo se almacena en la carpeta del servicio y se inicializa automáticamente de forma segura si no existe.
                </p>
              </div>
            ) : (
              <div className="space-y-4 bg-slate-900/40 p-4 rounded-xl border border-industrial-border">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Servidor / Host (IP o Nombre):
                    </label>
                    <input
                      type="text"
                      value={config.server || ''}
                      onChange={e => handleFieldChange('server', e.target.value)}
                      className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2 text-xs text-white font-mono"
                      placeholder="192.168.1.100 o localhost"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Puerto TCP:
                    </label>
                    <input
                      type="number"
                      value={config.port || 1433}
                      onChange={e => handleFieldChange('port', parseInt(e.target.value) || 1433)}
                      className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2 text-xs text-white font-mono"
                      placeholder="1433"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Nombre de la Base de Datos:
                  </label>
                  <input
                    type="text"
                    value={config.databaseName || ''}
                    onChange={e => handleFieldChange('databaseName', e.target.value)}
                    className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2 text-xs text-white font-mono"
                    placeholder="LineVision_DL02"
                  />
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="integratedSec"
                    checked={config.integratedSecurity || false}
                    onChange={e => handleFieldChange('integratedSecurity', e.target.checked)}
                    className="rounded bg-industrial-dark border-industrial-border text-blue-600 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="integratedSec" className="text-xs font-bold text-slate-300 cursor-pointer">
                    Autenticación Integrada de Windows (Windows Auth / SSPI)
                  </label>
                </div>

                {!config.integratedSecurity && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-xs font-bold text-slate-300 block mb-1">
                        Usuario SQL (SQL User):
                      </label>
                      <input
                        type="text"
                        value={config.username || ''}
                        onChange={e => handleFieldChange('username', e.target.value)}
                        className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2 text-xs text-white font-mono"
                        placeholder="sa o linevision_app"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-300 block mb-1">
                        Contraseña (Password):
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={config.password || ''}
                          onChange={e => handleFieldChange('password', e.target.value)}
                          className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2 pr-9 text-xs text-white font-mono"
                          placeholder="••••••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 top-2.5 text-slate-400 hover:text-white"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="trustCert"
                      checked={config.trustServerCertificate ?? true}
                      onChange={e => handleFieldChange('trustServerCertificate', e.target.checked)}
                      className="rounded bg-industrial-dark border-industrial-border text-blue-600 w-4 h-4 cursor-pointer"
                    />
                    <label htmlFor="trustCert" className="text-xs font-semibold text-slate-300 cursor-pointer">
                      Confiar en Certificado SSL (TrustServerCertificate)
                    </label>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-0.5">
                      Timeout de Conexión (segundos):
                    </label>
                    <input
                      type="number"
                      value={config.connectionTimeout || 30}
                      onChange={e => handleFieldChange('connectionTimeout', parseInt(e.target.value) || 30)}
                      className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-1.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                {/* Connection String Preview / Custom Edit */}
                <div className="pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-400">
                      Cadena de Conexión Resultante:
                    </label>
                    <button
                      type="button"
                      onClick={() => setUseCustomConnString(!useCustomConnString)}
                      className="text-[10px] text-cyan-400 hover:underline font-semibold"
                    >
                      {useCustomConnString ? 'Regenerar desde campos' : 'Editar manualmente'}
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    readOnly={!useCustomConnString}
                    value={config.connectionString}
                    onChange={e => setConfig({ ...config, connectionString: e.target.value })}
                    className={`w-full bg-industrial-dark border rounded-lg p-2 text-xs font-mono break-all ${
                      useCustomConnString ? 'border-cyan-500 text-white' : 'border-industrial-border text-slate-300'
                    }`}
                  />
                </div>
              </div>
            )}

            {/* Botones de Prueba y Guardado */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black flex items-center justify-center space-x-2 shadow-lg shadow-blue-900/30 transition active:scale-95 disabled:opacity-50"
              >
                <Play className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} />
                <span>{testing ? 'Probando Conexión...' : 'Probar Conexión (Ping & Latencia)'}</span>
              </button>
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={saving}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center justify-center space-x-2 shadow-lg shadow-emerald-900/30 transition active:scale-95 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Guardando...' : 'Guardar y Aplicar en Caliente'}</span>
              </button>
            </div>

            {/* Resultado del Test de Conexión */}
            {testResult && (
              <div className={`p-4 rounded-xl border space-y-2 text-xs font-mono animate-fade-in ${
                testResult.success
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold flex items-center space-x-2">
                    {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
                    <span>{testResult.success ? 'CONEXIÓN EXITOSA' : 'ERROR DE CONEXIÓN'}</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-black/40 border border-current text-[10px]">
                    {testResult.responseTimeMs} ms
                  </span>
                </div>
                <div className="text-[11px] text-slate-300">
                  {testResult.message}
                </div>
                {testResult.databaseVersion && (
                  <div className="text-[10px] text-slate-400 border-t border-slate-800 pt-1 truncate">
                    Motor: {testResult.databaseVersion}
                  </div>
                )}
                {testResult.success && (
                  <div className="text-[11px] text-emerald-400 flex items-center space-x-2 pt-1">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Tablas existentes identificadas en la base de datos: {testResult.tableCount}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA: Esquema, Verificación y Migración Segura (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-industrial-card border border-industrial-border rounded-xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-industrial-border pb-3">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h2 className="font-extrabold text-sm text-white uppercase tracking-wider">
                  Verificación de Tablas & Esquema
                </h2>
              </div>
              <button
                onClick={refreshTables}
                disabled={loadingTables}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center space-x-1"
                title="Re-inspeccionar tablas"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingTables ? 'animate-spin' : ''}`} />
                <span>Re-inspeccionar</span>
              </button>
            </div>

            {/* Banner de Garantía de Protección de Datos */}
            <div className="p-3.5 rounded-xl bg-blue-950/40 border border-blue-500/40 text-xs text-blue-200 space-y-1.5">
              <div className="flex items-center space-x-2 font-black text-blue-300">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                <span>PROTECCIÓN DE DATOS EXISTENTES</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-300">
                El sistema ejecuta verificaciones previas con <code className="text-cyan-300 font-mono">IF NOT EXISTS</code> en tablas (<code className="text-cyan-300 font-mono">sys.tables</code>) y columnas (<code className="text-cyan-300 font-mono">sys.columns</code>). 
                <strong> No se ejecuta DROP TABLE ni se alteran datos existentes.</strong>
              </p>
            </div>

            {/* Listado de Tablas de la BD */}
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-2">
                <span>Inventario de Tablas de Producción:</span>
                <span className="text-[10px] text-emerald-400 font-mono">
                  {tables.filter(t => t.exists).length} / {tables.length} Activas
                </span>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 border border-industrial-border/60 rounded-xl p-2 bg-slate-950/40">
                {tables.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-500">
                    No se detectaron tablas aún. Presione "Ejecutar Inicialización Segura".
                  </div>
                ) : (
                  tables.map((t, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-xs"
                    >
                      <div className="flex items-center space-x-2">
                        <span className={`w-2 h-2 rounded-full ${t.exists ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-slate-600'}`} />
                        <span className="font-mono font-bold text-slate-200">{t.tableName}</span>
                      </div>
                      <div className="flex items-center space-x-3 text-[11px]">
                        {t.exists ? (
                          <span className="text-slate-400 font-mono">
                            {t.rowCount.toLocaleString()} filas
                          </span>
                        ) : (
                          <span className="text-amber-400 font-semibold">Pendiente</span>
                        )}
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          t.exists ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {t.exists ? 'OK' : 'CREAR'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Opciones de Migración Segura */}
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="seedMaster"
                  checked={seedMasterData}
                  onChange={e => setSeedMasterData(e.target.checked)}
                  className="rounded bg-industrial-dark border-industrial-border text-emerald-600 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="seedMaster" className="text-xs font-semibold text-slate-300 cursor-pointer">
                  Insertar maestros y recetas base de prueba (solo si no existen)
                </label>
              </div>

              <button
                type="button"
                onClick={handleRunMigration}
                disabled={migrating}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white rounded-xl text-xs font-black flex items-center justify-center space-x-2 shadow-lg shadow-emerald-950/50 transition active:scale-95 disabled:opacity-50"
              >
                <Layers className={`w-4 h-4 ${migrating ? 'animate-spin' : ''}`} />
                <span>{migrating ? 'Verificando y Aplicando...' : 'Ejecutar Inicialización / Migración Segura'}</span>
              </button>
            </div>

            {/* Reporte de Migración */}
            {migrationResult && (
              <div className={`p-4 rounded-xl border text-xs font-mono space-y-2 animate-fade-in ${
                migrationResult.success
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                  : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
              }`}>
                <div className="flex items-center space-x-2 font-bold">
                  {migrationResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
                  <span>{migrationResult.message}</span>
                </div>
                <div className="text-[11px] text-slate-300">
                  Tablas verificadas/creadas: <strong className="text-emerald-400">{migrationResult.tablesCreatedOrVerified.length}</strong>
                </div>
                {migrationResult.columnsAdded.length > 0 && (
                  <div className="text-[11px] text-cyan-300">
                    Columnas aseguradas: {migrationResult.columnsAdded.join(', ')}
                  </div>
                )}
                {migrationResult.seedRecordsInserted.length > 0 && (
                  <div className="text-[11px] text-slate-400">
                    Maestros insertados: {migrationResult.seedRecordsInserted.join(', ')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Sección Inferior: Visor y Descarga de Script SQL Idempotente */}
      <div className="bg-industrial-card border border-industrial-border rounded-xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-industrial-border pb-4">
          <div className="flex items-center space-x-3">
            <FileCode className="w-6 h-6 text-yellow-400" />
            <div>
              <h2 className="font-black text-sm text-white uppercase tracking-wider">
                Script SQL Idempotente para el DBA de Planta
              </h2>
              <p className="text-xs text-slate-400">
                Descargue o revise el script completo para ejecutarlo directamente en SSMS o Azure Data Studio.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 w-full sm:w-auto">
            {/* Selector de Dialecto SQL */}
            <div className="flex bg-slate-900 border border-slate-700 rounded-lg p-0.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => { setSelectedScriptProvider('SqlServer'); fetchScript('SqlServer'); }}
                className={`px-3 py-1.5 rounded-md transition ${
                  selectedScriptProvider === 'SqlServer' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                MS SQL Server (T-SQL)
              </button>
              <button
                type="button"
                onClick={() => { setSelectedScriptProvider('Sqlite'); fetchScript('Sqlite'); }}
                className={`px-3 py-1.5 rounded-md transition ${
                  selectedScriptProvider === 'Sqlite' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                SQLite
              </button>
            </div>

            <button
              onClick={handleCopyScript}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition"
              title="Copiar SQL al portapapeles"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>

            <button
              onClick={handleDownloadScript}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-black flex items-center space-x-2 shadow-md shadow-blue-950 transition active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Descargar .sql</span>
            </button>
          </div>
        </div>

        {/* Visor de Código SQL con Syntax Highlights */}
        <div className="relative">
          <div className="text-[11px] font-mono text-slate-400 bg-slate-950 px-4 py-2 border-t border-x border-slate-800 rounded-t-xl flex items-center justify-between">
            <span>Archivo: {sqlScript?.filename || `${selectedScriptProvider}_Setup.sql`}</span>
            <span className="text-emerald-400">100% Idempotente (IF NOT EXISTS en tablas y columnas)</span>
          </div>
          <pre className="w-full bg-industrial-dark border border-slate-800 rounded-b-xl p-4 text-xs font-mono text-emerald-300 overflow-x-auto max-h-96 overflow-y-auto leading-relaxed select-text">
            {loadingScript ? (
              <div className="text-center py-10 text-slate-500 flex items-center justify-center space-x-2">
                <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                <span>Generando script SQL idempotente...</span>
              </div>
            ) : (
              sqlScript?.content || '-- No se pudo cargar el script'
            )}
          </pre>
        </div>
      </div>
    </div>
  );
};
