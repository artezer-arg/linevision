import React, { useState, useEffect, useRef } from 'react';
import { Camera, ZoomIn, AlertTriangle, Settings, RefreshCw, Check, Video, Monitor, LayoutGrid, Maximize2, Minimize2 } from 'lucide-react';
import { api } from '../services/api';

interface Props {
  frames: Record<string, string>; // cameraId -> base64
  activeFailures?: string[];
}

interface DiscoveredDevice {
  deviceIndex: number;
  name: string;
  deviceId: string;
  isAvailable: boolean;
  type: string;
}

interface CameraConfigItem {
  cameraId: string;
  name: string;
  providerType: string;
  connectionUri: string;
  active: boolean;
}

export const CameraDisplay: React.FC<Props> = ({ frames, activeFailures = [] }) => {
  const [selectedCam, setSelectedCam] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'GRID' | 'SINGLE'>('GRID');
  const [activeSingleCam, setActiveSingleCam] = useState<string>('CAM_CRADLE');
  
  // Camera Configuration Modal
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [configs, setConfigs] = useState<CameraConfigItem[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>('CAM_CRADLE');
  const [targetProvider, setTargetProvider] = useState<string>('OPENCV_USB');
  const [targetUri, setTargetUri] = useState<string>('0');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Browser Direct Webcam (Local fallback / tester)
  const [useBrowserWebcam, setUseBrowserWebcam] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const cameras = [
    { id: 'CAM_CRADLE', title: 'CÁMARA CUNA E INSERTOS', tag: 'CUNA', role: 'Poka-Yoke de Polaridad, Guías y Código QR' },
    { id: 'CAM_PANEL_01', title: 'CÁMARA PANEL SUPERIOR', tag: 'PANEL TOP', role: 'Inspección de Clips, Brackets y Tuercas Soldadas' },
    { id: 'CAM_PANEL_02', title: 'CÁMARA PANEL INFERIOR', tag: 'PANEL BOT', role: 'Inspección de Clips Inferiores y Cordón Sellador' },
  ];

  const loadCameraData = async () => {
    try {
      const [devList, cfgList] = await Promise.all([
        api.getDiscoveredCameras(),
        api.getCameraConfigs()
      ]);
      if (devList && Array.isArray(devList)) setDevices(devList);
      if (cfgList && Array.isArray(cfgList)) setConfigs(cfgList);
    } catch (e) {
      console.error('Failed to load camera devices', e);
    }
  };

  useEffect(() => {
    loadCameraData();
  }, []);

  const handleOpenConfig = (slotId?: string) => {
    if (slotId) setSelectedSlot(slotId);
    setShowConfigModal(true);
    loadCameraData();
  };

  const handleApplyConfig = async () => {
    setIsSaving(true);
    try {
      await api.configureCamera(selectedSlot, targetProvider, targetUri);
      setSaveSuccess(`Cámara ${selectedSlot} vinculada con éxito a ${targetProvider} (${targetUri})`);
      await loadCameraData();
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (e) {
      console.error(e);
      alert('Error configurando la cámara seleccionada');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleBrowserWebcam = async () => {
    if (!useBrowserWebcam) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setUseBrowserWebcam(true);
      } catch (err) {
        console.error('Could not access browser webcam:', err);
        alert('No se pudo acceder a la webcam desde el navegador. Verifique los permisos de cámara.');
      }
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
      setUseBrowserWebcam(false);
    }
  };

  const getCameraSourceLabel = (camId: string) => {
    const cfg = configs.find(c => c.cameraId === camId);
    if (!cfg) return 'SIMULADOR';
    if (cfg.providerType === 'OPENCV_USB' || cfg.providerType === 'PHYSICAL') {
      return `USB DISP. ${cfg.connectionUri}`;
    }
    return cfg.providerType;
  };

  return (
    <div className="p-4 space-y-4">
      {/* 1. Header Toolbar de Cámaras */}
      <div className="bg-industrial-card border border-industrial-border rounded-xl px-4 py-2.5 shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-white font-black text-sm">
            <Video className="w-5 h-5 text-blue-400" />
            <span>SISTEMA DE VISIÓN INDUSTRIAL (3 CÁMARAS)</span>
          </div>

          <div className="hidden sm:flex items-center space-x-1 bg-industrial-dark p-1 rounded-lg border border-industrial-border text-xs">
            <button
              onClick={() => setViewMode('GRID')}
              className={`px-3 py-1 rounded font-bold flex items-center space-x-1.5 transition ${
                viewMode === 'GRID' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cuadrícula (3x)</span>
            </button>
            <button
              onClick={() => setViewMode('SINGLE')}
              className={`px-3 py-1 rounded font-bold flex items-center space-x-1.5 transition ${
                viewMode === 'SINGLE' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Individual Enriquecida</span>
            </button>
          </div>
        </div>

        {/* View Mode Selector Tabs when in SINGLE mode */}
        {viewMode === 'SINGLE' && (
          <div className="flex items-center space-x-2">
            {cameras.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveSingleCam(c.id)}
                className={`px-3 py-1 text-xs rounded-lg font-bold border transition ${
                  activeSingleCam === c.id 
                    ? 'bg-emerald-600 border-emerald-400 text-white shadow-md' 
                    : 'bg-industrial-dark border-industrial-border text-slate-400 hover:text-slate-200'
                }`}
              >
                {c.tag}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center space-x-2">
          {/* Botón Probar Webcam del Navegador */}
          <button
            onClick={toggleBrowserWebcam}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center space-x-1.5 transition ${
              useBrowserWebcam
                ? 'bg-amber-600 border-amber-400 text-black font-black animate-pulse'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
            title="Activa directamente la cámara web local de la computadora en el navegador"
          >
            <Camera className="w-4 h-4" />
            <span>{useBrowserWebcam ? 'Webcam Local: ACTIVA' : 'Ver Webcam Local PC'}</span>
          </button>

          {/* Botón Selector / Configurar Fuentes de Cámara */}
          <button
            onClick={() => handleOpenConfig()}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-black flex items-center space-x-1.5 shadow-md transition"
          >
            <Settings className="w-4 h-4" />
            <span>Elegir / Configurar Cámaras</span>
          </button>
        </div>
      </div>

      {/* Browser Local Webcam View Container (when toggled) */}
      {useBrowserWebcam && (
        <div className="bg-industrial-card border-2 border-amber-500 rounded-xl p-4 shadow-2xl space-y-2 animate-fade-in">
          <div className="flex items-center justify-between text-xs">
            <span className="font-extrabold text-amber-400 flex items-center space-x-2">
              <Camera className="w-4 h-4" />
              <span>FEED DIRECTO DE WEBCAM LOCAL (NAVEGADOR / HTML5 MEDIA)</span>
            </span>
            <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-mono font-bold">
              DIRECTSHOW / MEDIASTREAM LIVE
            </span>
          </div>
          <div className="relative bg-black rounded-lg overflow-hidden flex items-center justify-center max-h-[380px]">
            <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-[380px] object-contain" />
          </div>
        </div>
      )}

      {/* 2. Main Camera Grid or Single Display */}
      {viewMode === 'GRID' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {cameras.map(cam => {
            const frameData = frames[cam.id];
            const isFailing = activeFailures.some(f => f.includes(cam.id) || f.includes(cam.tag));
            const sourceLabel = getCameraSourceLabel(cam.id);

            return (
              <div
                key={cam.id}
                className={`bg-industrial-card border-2 rounded-xl overflow-hidden shadow-xl transition-all flex flex-col ${
                  isFailing ? 'border-red-500 ring-2 ring-red-500 animate-pulse' : 'border-industrial-border hover:border-slate-500'
                }`}
              >
                {/* Camera Card Header */}
                <div className="bg-industrial-dark/95 px-3 py-2 border-b border-industrial-border flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Camera className="w-4 h-4 text-blue-400" />
                    <span className="font-bold text-xs tracking-wider text-slate-100">{cam.title}</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[10px] bg-blue-950 text-blue-300 border border-blue-800 font-mono px-2 py-0.5 rounded">
                      {sourceLabel}
                    </span>
                    <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-700 font-mono px-2 py-0.5 rounded font-bold">
                      LIVE
                    </span>
                  </div>
                </div>

                {/* Video Frame Canvas / Viewer */}
                <div className="relative bg-black flex-1 min-h-[280px] flex items-center justify-center overflow-hidden group">
                  {frameData ? (
                    <img
                      src={`data:image/jpeg;base64,${frameData}`}
                      alt={cam.title}
                      className="w-full h-full object-contain select-none"
                    />
                  ) : (
                    <div className="text-center text-slate-500 p-6">
                      <Camera className="w-12 h-12 mx-auto mb-2 opacity-30 animate-pulse text-blue-400" />
                      <p className="text-xs font-mono font-bold text-slate-400">INICIALIZANDO STREAM DE CÁMARA...</p>
                      <p className="text-[10px] text-slate-600 mt-1">Haga clic en 'Elegir Cámara' para vincular con Webcam USB</p>
                    </div>
                  )}

                  {/* Failure Indicator */}
                  {isFailing && (
                    <div className="absolute top-2 left-2 right-2 bg-red-600/90 text-white p-2 rounded-md flex items-center space-x-2 shadow-lg">
                      <AlertTriangle className="w-5 h-5 flex-shrink-0 animate-bounce" />
                      <span className="text-xs font-black uppercase tracking-wide">
                        DISCORDANCIA DETECTADA EN {cam.tag}
                      </span>
                    </div>
                  )}

                  {/* Hover Quick Action Buttons */}
                  <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2">
                    <button
                      onClick={() => handleOpenConfig(cam.id)}
                      className="px-2.5 py-1 bg-black/80 hover:bg-black text-white text-[11px] rounded border border-slate-600 flex items-center space-x-1"
                    >
                      <Settings className="w-3.5 h-3.5 text-yellow-400" />
                      <span>Elegir Origen</span>
                    </button>
                    <button
                      onClick={() => {
                        setActiveSingleCam(cam.id);
                        setViewMode('SINGLE');
                      }}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[11px] rounded font-bold flex items-center space-x-1 shadow"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Ampliar</span>
                    </button>
                  </div>
                </div>

                {/* Footer with Controls */}
                <div className="bg-industrial-dark/90 px-3 py-1.5 border-t border-industrial-border flex items-center justify-between text-xs text-slate-400">
                  <span className="font-mono text-[11px] text-slate-300">{cam.id}</span>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => handleOpenConfig(cam.id)}
                      className="hover:text-blue-400 flex items-center space-x-1 text-[11px]"
                    >
                      <Settings className="w-3 h-3" />
                      <span>Cambiar Fuente</span>
                    </button>
                    <button
                      onClick={() => {
                        setActiveSingleCam(cam.id);
                        setViewMode('SINGLE');
                      }}
                      className="hover:text-white flex items-center space-x-1 text-[11px]"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                      <span>Detalle</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* SINGLE ENRICHED CAMERA VIEW */
        <div className="bg-industrial-card border-2 border-industrial-border rounded-xl overflow-hidden shadow-2xl space-y-3 p-4">
          <div className="flex items-center justify-between border-b border-industrial-border pb-3">
            <div>
              <div className="flex items-center space-x-3">
                <span className="font-mono font-black text-blue-400 bg-blue-950 px-2.5 py-1 rounded border border-blue-800 text-xs">
                  {activeSingleCam}
                </span>
                <h3 className="font-black text-lg text-white">
                  {cameras.find(c => c.id === activeSingleCam)?.title}
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {cameras.find(c => c.id === activeSingleCam)?.role}
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-xs px-2.5 py-1 bg-industrial-dark rounded border border-industrial-border text-slate-300 font-mono">
                Origen: <strong className="text-emerald-400">{getCameraSourceLabel(activeSingleCam)}</strong>
              </span>
              <button
                onClick={() => handleOpenConfig(activeSingleCam)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold border border-slate-600 flex items-center space-x-1"
              >
                <Settings className="w-4 h-4 text-amber-400" />
                <span>Asignar Dispositivo</span>
              </button>
              <button
                onClick={() => setViewMode('GRID')}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center space-x-1"
              >
                <Minimize2 className="w-4 h-4" />
                <span>Volver a Cuadrícula</span>
              </button>
            </div>
          </div>

          <div className="relative bg-black rounded-xl overflow-hidden flex items-center justify-center min-h-[460px] border border-slate-800">
            {frames[activeSingleCam] ? (
              <img
                src={`data:image/jpeg;base64,${frames[activeSingleCam]}`}
                alt={activeSingleCam}
                className="w-full max-h-[520px] object-contain select-none"
              />
            ) : (
              <div className="text-center text-slate-500 p-8">
                <Camera className="w-16 h-16 mx-auto mb-3 opacity-30 animate-pulse text-blue-400" />
                <p className="text-sm font-mono font-bold text-slate-300">SIN SEÑAL DE CÁMARA</p>
                <p className="text-xs text-slate-500 mt-1">Seleccione un dispositivo de captura en 'Asignar Dispositivo'</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Modal Interactivo de Selección y Asignación de Cámaras */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-industrial-card border-2 border-blue-500 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-industrial-border pb-3">
              <div className="flex items-center space-x-2">
                <Settings className="w-6 h-6 text-blue-400" />
                <h3 className="font-black text-base text-white">
                  Selector de Origen de Cámaras DL02
                </h3>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-white font-bold p-1"
              >
                ✕
              </button>
            </div>

            {saveSuccess && (
              <div className="bg-emerald-600/30 border border-emerald-500 text-emerald-300 p-3 rounded-xl text-xs font-bold flex items-center space-x-2">
                <Check className="w-4 h-4" />
                <span>{saveSuccess}</span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-bold block mb-1.5">
                  1. Seleccione la Posición / Slot a Configurar:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {cameras.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedSlot(c.id);
                        const cfg = configs.find(item => item.cameraId === c.id);
                        if (cfg) {
                          setTargetProvider(cfg.providerType);
                          setTargetUri(cfg.connectionUri);
                        }
                      }}
                      className={`p-3 rounded-xl border text-left font-bold transition ${
                        selectedSlot === c.id
                          ? 'bg-blue-600 border-blue-400 text-white shadow-lg'
                          : 'bg-industrial-dark border-industrial-border text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      <div className="font-mono text-[10px] text-blue-200">{c.id}</div>
                      <div className="text-xs">{c.tag}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-300 font-bold block">
                    2. Dispositivo / Fuente de Video:
                  </label>
                  <button
                    type="button"
                    onClick={loadCameraData}
                    className="text-blue-400 hover:text-blue-300 text-[11px] flex items-center space-x-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Redetectar Dispositivos PC</span>
                  </button>
                </div>

                {/* Quick 1-Click Action for Real Webcam */}
                <div className="mb-2 p-2 bg-emerald-950/50 border border-emerald-500/60 rounded-lg flex items-center justify-between">
                  <span className="text-[11px] text-emerald-300 font-bold">
                    💡 Tu cámara web física activa está en el <strong className="underline">Índice DirectShow 0</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetProvider('OPENCV_USB');
                      setTargetUri('0');
                    }}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-black shadow transition"
                  >
                    Usar Índice 0
                  </button>
                </div>

                <select
                  value={`${targetProvider}|${targetUri}`}
                  onChange={e => {
                    const [prov, uri] = e.target.value.split('|');
                    setTargetProvider(prov);
                    setTargetUri(uri);
                  }}
                  className="w-full bg-industrial-dark border border-industrial-border rounded-xl p-3 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                >
                  <optgroup label="Cámaras Físicas Detectadas en la PC (USB / Webcam)">
                    {devices.filter(d => d.type === 'PHYSICAL').map(d => (
                      <option key={d.deviceId} value={`OPENCV_USB|${d.deviceId}`}>
                        {d.name}
                      </option>
                    ))}
                    {devices.filter(d => d.type === 'PHYSICAL').length === 0 && (
                      <option value="OPENCV_USB|0">📹 Webcam Principal (Índice 0)</option>
                    )}
                  </optgroup>

                  <optgroup label="Simuladores Industriales DL02 (Poka-Yoke)">
                    <option value="SIMULATOR|sim://cradle">🧪 Simulador Cuna e Insertos + QR (CAM_CRADLE)</option>
                    <option value="SIMULATOR|sim://panel_top">🧪 Simulador Panel Superior - Clips (CAM_PANEL_01)</option>
                    <option value="SIMULATOR|sim://panel_bottom">🧪 Simulador Panel Inferior - Brackets (CAM_PANEL_02)</option>
                  </optgroup>

                  <optgroup label="Red / IP / RTSP">
                    <option value="RTSP|rtsp://192.168.1.100:554/stream">🌐 Cámara RTSP / GigE IP Industrial</option>
                  </optgroup>
                </select>
              </div>

              {targetProvider === 'RTSP' && (
                <div>
                  <label className="text-slate-300 font-bold block mb-1">
                    URI / Dirección RTSP Personalizada:
                  </label>
                  <input
                    type="text"
                    value={targetUri}
                    onChange={e => setTargetUri(e.target.value)}
                    placeholder="rtsp://usuario:pass@192.168.1.101:554/live"
                    className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2.5 text-xs text-white font-mono"
                  />
                </div>
              )}

              <div className="bg-industrial-dark p-3 rounded-xl border border-industrial-border text-slate-400 space-y-1">
                <div className="text-[11px] text-slate-300 font-bold">Estado Actual del Slot:</div>
                <div className="font-mono text-[11px] flex justify-between">
                  <span>Slot Seleccionado:</span>
                  <strong className="text-white">{selectedSlot}</strong>
                </div>
                <div className="font-mono text-[11px] flex justify-between">
                  <span>Proveedor Asignado:</span>
                  <strong className="text-yellow-400">{targetProvider} ({targetUri})</strong>
                </div>
              </div>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-300 transition"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleApplyConfig}
                disabled={isSaving}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded-xl text-xs font-black text-white shadow-lg transition flex items-center justify-center space-x-2"
              >
                {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>{isSaving ? 'Conectando...' : 'Aplicar Fuente en Vivo'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CameraDisplay;
