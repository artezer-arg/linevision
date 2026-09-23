import React, { useState, useEffect, useRef, useCallback } from 'react';
import { InspectionPoint, InspectionROI, RobotRecipe, CradleQRMapping } from '../types';
import { api } from '../services/api';
import {
  Target,
  Eye,
  CheckCircle2,
  XCircle,
  Save,
  Play,
  QrCode,
  Cpu,
  Sliders,
  AlertTriangle,
  RefreshCw,
  Crosshair,
  Trash2,
  Plus,
  Move,
  Maximize2,
  Camera,
  Palette,
  Circle,
  Square,
  Check,
  Copy,
  Grid,
  Layers
} from 'lucide-react';

interface CalibrationViewProps {
  frames: Record<string, string>;
}

interface DragState {
  isDragging: boolean;
  mode: 'MOVE' | 'RESIZE';
  pointId: string;
  startX: number;
  startY: number;
  initialRoi: { x: number; y: number; width: number; height: number };
}

export const CalibrationView: React.FC<CalibrationViewProps> = ({ frames }) => {
  const [activeStepTab, setActiveStepTab] = useState<'CRADLE' | 'QR' | 'PANEL_TOP' | 'PANEL_BOTTOM' | 'RECIPES'>('CRADLE');
  const [points, setPoints] = useState<InspectionPoint[]>([]);
  const [recipes, setRecipes] = useState<RobotRecipe[]>([]);
  const [qrMappings, setQrMappings] = useState<CradleQRMapping[]>([]);
  const [cradles, setCradles] = useState<string[]>(['CUNA-01', 'CUNA-02']);
  const [selectedCradleFilter, setSelectedCradleFilter] = useState<string>('ALL');
  const [showNewRecipeModal, setShowNewRecipeModal] = useState<boolean>(false);
  const [newRecipeCradle, setNewRecipeCradle] = useState<string>('CUNA-01');
  const [newRecipeModel, setNewRecipeModel] = useState<string>('P1B');
  const [newRecipeHand, setNewRecipeHand] = useState<'RH' | 'LH'>('RH');
  const [newRecipePos, setNewRecipePos] = useState<'FRONT' | 'REAR'>('FRONT');
  const [newRecipeA, setNewRecipeA] = useState<number>(101);
  const [newRecipeB, setNewRecipeB] = useState<number>(201);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [testing, setTesting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Live QR Scanner State
  const [scannedQR, setScannedQR] = useState<{ text: string; matched: boolean; mapping?: CradleQRMapping } | null>(null);
  const [scanningQR, setScanningQR] = useState(false);
  const [autoScanQR, setAutoScanQR] = useState(true);

  // Variant Context State (Industrial Multi-Model Support)
  const [selectedModel, setSelectedModel] = useState<string>('P1B');
  const [selectedHand, setSelectedHand] = useState<'RH' | 'LH'>('RH');
  const [selectedPos, setSelectedPos] = useState<'FRONT' | 'REAR'>('FRONT');
  const [activePlan, setActivePlan] = useState<any | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>(['P1B']);

  // Modals for Variant Tools
  const [showMatrixModal, setShowMatrixModal] = useState<boolean>(false);
  const [matrixData, setMatrixData] = useState<any[]>([]);
  const [loadingMatrix, setLoadingMatrix] = useState<boolean>(false);

  const [showCloneModal, setShowCloneModal] = useState<boolean>(false);
  const [cloneSrcModel, setCloneSrcModel] = useState<string>('P1B');
  const [cloneSrcHand, setCloneSrcHand] = useState<'RH' | 'LH'>('RH');
  const [cloneSrcPos, setCloneSrcPos] = useState<'FRONT' | 'REAR'>('FRONT');
  const [cloneMirrorX, setCloneMirrorX] = useState<boolean>(true);
  const [cloning, setCloning] = useState<boolean>(false);

  // Modals
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPointCode, setNewPointCode] = useState('');
  const [newPointName, setNewPointName] = useState('');
  const [newPointAlgo, setNewPointAlgo] = useState('PRESENCE');
  const [newPointExpected, setNewPointExpected] = useState('PRESENT');

  // Drag & Drop State
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragRef = useRef<{
    isDragging: boolean;
    mode: 'MOVE' | 'RESIZE';
    pointId: string;
    startX: number;
    startY: number;
    initialRoi: { x: number; y: number; width: number; height: number };
  }>({
    isDragging: false,
    mode: 'MOVE',
    pointId: '',
    startX: 0,
    startY: 0,
    initialRoi: { x: 0, y: 0, width: 0, height: 0 }
  });
  const [capturingTemplate, setCapturingTemplate] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadVariantPlan = useCallback(async (step: string, model: string, hand: string, pos: string) => {
    if (step === 'QR' || step === 'RECIPES') return;
    const pieceType = step === 'CRADLE' ? 'CRADLE' : 'PANEL';
    try {
      const plan = await api.getPlan(pieceType, model, hand, pos);
      setActivePlan(plan);
      if (plan && plan.versions && plan.versions.length > 0 && plan.versions[0].details) {
        const planPoints = plan.versions[0].details
          .map((d: any) => d.point)
          .filter(Boolean);
        
        if (planPoints.length > 0) {
          setPoints(prev => {
            const planPtIds = new Set(planPoints.map((p: any) => p.inspectionPoint_ID));
            const remaining = prev.filter(p => !planPtIds.has(p.inspectionPoint_ID));
            return [...remaining, ...planPoints];
          });
          const stepCam = step === 'CRADLE' ? 'CAM_CRADLE' : step === 'PANEL_TOP' ? 'CAM_PANEL_01' : 'CAM_PANEL_02';
          const validPt = planPoints.find((p: any) => p.cameraId === stepCam);
          if (validPt) setSelectedPointId(validPt.inspectionPoint_ID);
        }
      }
    } catch (e) {
      console.error('Error loading variant plan:', e);
    }
  }, []);

  useEffect(() => {
    loadVariantPlan(activeStepTab, selectedModel, selectedHand, selectedPos);
  }, [activeStepTab, selectedModel, selectedHand, selectedPos, loadVariantPlan]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [pts, recs, qrs, crds] = await Promise.all([
        api.getAllPoints().catch(() => []),
        api.getRecipes().catch(() => []),
        api.getQRMappings().catch(() => []),
        api.getCradles().catch(() => ['CUNA-01', 'CUNA-02'])
      ]);
      setPoints(pts || []);
      setRecipes(recs || []);
      setQrMappings(qrs || []);
      if (crds && crds.length > 0) {
        setCradles(crds);
      }

      if (qrs && qrs.length > 0) {
        const models = Array.from(new Set(qrs.map((q: any) => q.modelo))).filter(Boolean);
        if (models.length > 0) setAvailableModels(models as string[]);
      }

      if (pts && pts.length > 0 && !selectedPointId) {
        setSelectedPointId(pts[0].inspectionPoint_ID);
      }
    } catch (err) {
      console.error('Error cargando datos de calibración:', err);
      showFeedback('error', 'Error al conectar con la base de datos de calibración');
    } finally {
      setLoading(false);
    }
  };

  const showFeedback = (type: 'success' | 'error' | 'info', text: string) => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  // Filter points based on active step and active plan/variant
  const getStepPoints = (): InspectionPoint[] => {
    const stepCam = activeStepTab === 'CRADLE' ? 'CAM_CRADLE' : activeStepTab === 'PANEL_TOP' ? 'CAM_PANEL_01' : 'CAM_PANEL_02';
    
    if (activePlan && activePlan.versions && activePlan.versions.length > 0 && activePlan.versions[0].details) {
      const planPoints = activePlan.versions[0].details
        .map((d: any) => {
          const ptId = d.point?.inspectionPoint_ID || d.inspectionPoint_ID;
          const livePoint = points.find(p => p.inspectionPoint_ID === ptId);
          return livePoint || d.point;
        })
        .filter((p: any) => p && p.cameraId === stepCam);
      if (planPoints.length > 0) {
        return planPoints as InspectionPoint[];
      }
    }

    if (activeStepTab === 'CRADLE') {
      return points.filter(p => p.pieceType === 'CRADLE' || p.cameraId === 'CAM_CRADLE');
    }
    if (activeStepTab === 'PANEL_TOP') {
      return points.filter(p => p.pieceType === 'PANEL' && p.cameraId === 'CAM_PANEL_01');
    }
    if (activeStepTab === 'PANEL_BOTTOM') {
      return points.filter(p => p.pieceType === 'PANEL' && p.cameraId === 'CAM_PANEL_02');
    }
    return [];
  };

  const handleClonePlan = async () => {
    const pieceType = activeStepTab === 'CRADLE' ? 'CRADLE' : 'PANEL';
    setCloning(true);
    try {
      const res = await api.clonePlan({
        pieceType,
        srcModel: cloneSrcModel,
        srcHand: cloneSrcHand,
        srcPos: cloneSrcPos,
        dstModel: selectedModel,
        dstHand: selectedHand,
        dstPos: selectedPos,
        mirrorX: cloneMirrorX,
        imageWidth: 640
      });
      if (res && (res.success || res.Success)) {
        showFeedback('success', `Se clonaron ${res.clonedCount || res.ClonedCount} puntos hacia ${selectedModel} ${selectedHand} ${selectedPos} ${cloneMirrorX ? '(con espejo X)' : ''}`);
        setShowCloneModal(false);
        await loadAllData();
        await loadVariantPlan(activeStepTab, selectedModel, selectedHand, selectedPos);
      } else {
        showFeedback('error', 'No se pudieron clonar los puntos de la variante seleccionada');
      }
    } catch (err) {
      console.error(err);
      showFeedback('error', 'Error al procesar clonado de plan');
    } finally {
      setCloning(false);
    }
  };

  const handleOpenMatrixModal = async () => {
    setShowMatrixModal(true);
    setLoadingMatrix(true);
    try {
      const data = await api.getCalibrationMatrix();
      setMatrixData(data || []);
      const models = Array.from(new Set((data || []).map((x: any) => x.modelo))).filter(Boolean);
      if (models.length > 0) setAvailableModels(models as string[]);
    } catch (err) {
      console.error(err);
      showFeedback('error', 'Error cargando matriz de calibración');
    } finally {
      setLoadingMatrix(false);
    }
  };

  const selectedPoint = points.find(p => p.inspectionPoint_ID === selectedPointId) || null;

  // Selected Camera for Step
  const getActiveCameraId = () => {
    if (activeStepTab === 'CRADLE' || activeStepTab === 'QR') return 'CAM_CRADLE';
    if (activeStepTab === 'PANEL_TOP') return 'CAM_PANEL_01';
    if (activeStepTab === 'PANEL_BOTTOM') return 'CAM_PANEL_02';
    return 'CAM_CRADLE';
  };

  const activeCameraId = getActiveCameraId();
  const currentFrame = frames[activeCameraId];

  // Real-time QR Scanner polling for CAM_CRADLE
  useEffect(() => {
    let interval: any = null;
    const shouldScan = autoScanQR && (activeStepTab === 'QR' || selectedPoint?.algorithmType === 'QR');

    if (shouldScan) {
      const runScan = async () => {
        try {
          const res = await api.scanQR('CAM_CRADLE');
          if (res && res.success && res.detectedText) {
            setScannedQR({ text: res.detectedText, matched: !!res.matched, mapping: res.mapping });
          }
        } catch {
          // silent background polling
        }
      };
      runScan();
      interval = setInterval(runScan, 1400);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoScanQR, activeStepTab, selectedPoint?.algorithmType]);

  const handleManualScanQR = async () => {
    setScanningQR(true);
    try {
      const res = await api.scanQR('CAM_CRADLE');
      if (res && res.success && res.detectedText) {
        setScannedQR({ text: res.detectedText, matched: !!res.matched, mapping: res.mapping });
        showFeedback('success', `¡Código QR detectado!: "${res.detectedText}"`);
      } else {
        showFeedback('error', 'No se detectó ningún código QR en la cámara');
      }
    } catch (err) {
      console.error(err);
      showFeedback('error', 'Error al escanear QR de la cámara');
    } finally {
      setScanningQR(false);
    }
  };

  const handleApplyScannedQRToPoint = () => {
    if (!selectedPoint || !scannedQR?.text) return;
    handleUpdatePointField('expectedValue', scannedQR.text);
    showFeedback('success', `Valor esperado actualizado con QR leído: "${scannedQR.text}"`);
  };

  const handleRegisterScannedQRMapping = async (modelo = 'P1B', mano = 'RH', posicion = 'FRONT') => {
    if (!scannedQR?.text) return;
    const newMapping: CradleQRMapping = {
      qR_ID: 0,
      cradle_Code: scannedQR.mapping?.cradle_Code || (scannedQR.text.includes('02') ? 'CUNA-02' : 'CUNA-01'),
      qR_Pattern: scannedQR.text,
      modelo,
      mano,
      posicion,
      variante: 'STD',
      activo: true
    };
    try {
      await api.saveQRMapping(newMapping);
      const updated = await api.getQRMappings();
      setQrMappings(updated || []);
      setScannedQR(prev => prev ? { ...prev, matched: true, mapping: newMapping } : null);
      showFeedback('success', `Patrón QR "${scannedQR.text}" asignado a cuna ${modelo} ${mano} ${posicion}`);
    } catch (err) {
      console.error(err);
      showFeedback('error', 'Error al guardar patrón QR en base de datos');
    }
  };

  // Update field of selected point
  const handleUpdatePointField = (field: keyof InspectionPoint, value: any) => {
    if (!selectedPoint) return;
    setPoints(prev =>
      prev.map(p => {
        if (p.inspectionPoint_ID === selectedPoint.inspectionPoint_ID) {
          return { ...p, [field]: value };
        }
        return p;
      })
    );
  };

  // Direct ROI update - synchronizes both points and activePlan
  const handleUpdateRoiDirect = useCallback((pointId: string, roiIndex: number, newValues: Partial<InspectionROI>) => {
    setPoints(prev =>
      prev.map(p => {
        if (p.inspectionPoint_ID === pointId) {
          const rois = p.roIs && p.roIs.length > 0
            ? [...p.roIs]
            : [{
                roI_ID: 0,
                inspectionPoint_ID: pointId,
                name: 'ROI_1',
                x: 100,
                y: 100,
                width: 150,
                height: 150,
                shapeType: 'RECTANGLE'
              }];
          rois[roiIndex] = { ...rois[roiIndex], ...newValues };
          return { ...p, roIs: rois };
        }
        return p;
      })
    );

    setActivePlan((prevPlan: any) => {
      if (!prevPlan || !prevPlan.versions || prevPlan.versions.length === 0 || !prevPlan.versions[0].details) {
        return prevPlan;
      }
      const updatedDetails = prevPlan.versions[0].details.map((d: any) => {
        const ptId = d.point?.inspectionPoint_ID || d.inspectionPoint_ID;
        if (ptId === pointId) {
          const rois = d.point?.roIs && d.point.roIs.length > 0
            ? [...d.point.roIs]
            : [{ roI_ID: 0, inspectionPoint_ID: pointId, name: 'ROI_1', x: 100, y: 100, width: 150, height: 150, shapeType: 'RECTANGLE' }];
          rois[roiIndex] = { ...rois[roiIndex], ...newValues };
          return { ...d, point: { ...d.point, roIs: rois } };
        }
        return d;
      });
      return {
        ...prevPlan,
        versions: [{ ...prevPlan.versions[0], details: updatedDetails }, ...prevPlan.versions.slice(1)]
      };
    });
  }, []);

  // Update ROI by manual input
  const handleUpdateRoiInput = (roiIndex: number, field: keyof InspectionROI, value: any) => {
    if (!selectedPoint) return;
    handleUpdateRoiDirect(selectedPoint.inspectionPoint_ID, roiIndex, { [field]: Number(value) || 0 });
  };

  // Convert Mouse/Touch client coords to 640x480 SVG space
  const getSvgCoords = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = 'touches' in e && e.touches.length > 0
      ? e.touches[0].clientX
      : (e as MouseEvent).clientX;
    const clientY = 'touches' in e && e.touches.length > 0
      ? e.touches[0].clientY
      : (e as MouseEvent).clientY;
    const scaleX = 640 / (rect.width || 640);
    const scaleY = 480 / (rect.height || 480);
    const x = Math.round((clientX - rect.left) * scaleX);
    const y = Math.round((clientY - rect.top) * scaleY);
    return { x, y };
  }, []);

  // Start Moving ROI (Drag & Drop)
  const handleStartMove = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent, point: InspectionPoint) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedPointId(point.inspectionPoint_ID);
    const livePoint = points.find(p => p.inspectionPoint_ID === point.inspectionPoint_ID) || point;
    const roi = livePoint.roIs && livePoint.roIs.length > 0
      ? livePoint.roIs[0]
      : { x: 100, y: 100, width: 150, height: 150 };
    const coords = getSvgCoords(e);
    dragRef.current = {
      isDragging: true,
      mode: 'MOVE',
      pointId: point.inspectionPoint_ID,
      startX: coords.x,
      startY: coords.y,
      initialRoi: { x: roi.x, y: roi.y, width: roi.width, height: roi.height }
    };
    setDragState({ ...dragRef.current });
  };

  // Start Resizing ROI
  const handleStartResize = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent, point: InspectionPoint) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedPointId(point.inspectionPoint_ID);
    const livePoint = points.find(p => p.inspectionPoint_ID === point.inspectionPoint_ID) || point;
    const roi = livePoint.roIs && livePoint.roIs.length > 0
      ? livePoint.roIs[0]
      : { x: 100, y: 100, width: 150, height: 150 };
    const coords = getSvgCoords(e);
    dragRef.current = {
      isDragging: true,
      mode: 'RESIZE',
      pointId: point.inspectionPoint_ID,
      startX: coords.x,
      startY: coords.y,
      initialRoi: { x: roi.x, y: roi.y, width: roi.width, height: roi.height }
    };
    setDragState({ ...dragRef.current });
  };

  // Global window listeners for drag & drop so mouse moves and releases smoothly everywhere
  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent | PointerEvent) => {
      if (!dragRef.current.isDragging) return;
      e.preventDefault();
      const coords = getSvgCoords(e);
      const dx = coords.x - dragRef.current.startX;
      const dy = coords.y - dragRef.current.startY;

      if (dragRef.current.mode === 'MOVE') {
        let newX = Math.round(dragRef.current.initialRoi.x + dx);
        let newY = Math.round(dragRef.current.initialRoi.y + dy);
        // Clamp within 640x480 frame
        newX = Math.max(0, Math.min(640 - dragRef.current.initialRoi.width, newX));
        newY = Math.max(0, Math.min(480 - dragRef.current.initialRoi.height, newY));
        handleUpdateRoiDirect(dragRef.current.pointId, 0, { x: newX, y: newY });
      } else if (dragRef.current.mode === 'RESIZE') {
        let newW = Math.round(Math.max(25, Math.min(640 - dragRef.current.initialRoi.x, dragRef.current.initialRoi.width + dx)));
        let newH = Math.round(Math.max(25, Math.min(480 - dragRef.current.initialRoi.y, dragRef.current.initialRoi.height + dy)));
        handleUpdateRoiDirect(dragRef.current.pointId, 0, { width: newW, height: newH });
      }
    };

    const onUp = async (e: MouseEvent | TouchEvent | PointerEvent) => {
      if (!dragRef.current.isDragging) return;
      e.preventDefault();
      const ptId = dragRef.current.pointId;
      dragRef.current.isDragging = false;
      setDragState(null);

      // Persist the updated ROI to the backend
      setPoints(currentPoints => {
        const target = currentPoints.find(p => p.inspectionPoint_ID === ptId);
        if (target && target.roIs && target.roIs.length > 0) {
          const roi = target.roIs[0];
          api.savePoint(target).then(() => {
            showFeedback('info', `ROI guardada: X=${roi.x}, Y=${roi.y} [${roi.width}x${roi.height}]`);
          }).catch(err => {
            console.error('Error auto-guardando ROI:', err);
          });
        }
        return currentPoints;
      });
    };

    window.addEventListener('mousemove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [getSvgCoords, handleUpdateRoiDirect]);

  // Save Point explicitly
  const handleSavePoint = async () => {
    if (!selectedPoint) return;
    setSaving(true);
    try {
      const res = await api.savePoint(selectedPoint);
      if (res && (res.success || res.Success)) {
        showFeedback('success', `Punto "${selectedPoint.name}" guardado exitosamente`);
      } else {
        showFeedback('error', 'No se pudo guardar el punto de inspección');
      }
    } catch (err) {
      console.error(err);
      showFeedback('error', 'Error de red al guardar punto');
    } finally {
      setSaving(false);
    }
  };

  // Capture Template (Master Shape)
  const handleCaptureTemplate = async () => {
    if (!selectedPoint) return;
    setCapturingTemplate(true);
    try {
      const res = await api.captureTemplate(selectedPoint.inspectionPoint_ID);
      if (res && (res.success || res.Success)) {
        const imagePath = res.imagePath || res.ImagePath;
        handleUpdateRoiDirect(selectedPoint.inspectionPoint_ID, 0, { referenceImagePath: imagePath });
        showFeedback('success', `Forma Master capturada correctamente: ${res.fileName || res.FileName}`);
      } else {
        showFeedback('error', 'No se pudo capturar la plantilla de la cámara');
      }
    } catch (err) {
      console.error(err);
      showFeedback('error', 'Error de red al capturar plantilla');
    } finally {
      setCapturingTemplate(false);
    }
  };

  // Select Color Preset
  const handleSelectColorPreset = (presetKey: string) => {
    if (!selectedPoint) return;
    handleUpdatePointField('algorithmType', 'COLOR');
    handleUpdatePointField('expectedValue', presetKey);
    showFeedback('info', `Color seleccionado: ${presetKey}`);
  };

  // Update Shape Type
  const handleUpdateShapeType = (shape: string) => {
    if (!selectedPoint) return;
    handleUpdateRoiDirect(selectedPoint.inspectionPoint_ID, 0, { shapeType: shape });
    showFeedback('info', `Forma de ROI cambiada a: ${shape === 'CIRCLE' ? 'CÍRCULO' : 'RECTÁNGULO'}`);
  };

  // Delete Point
  const handleConfirmDeletePoint = async () => {
    if (!selectedPoint) return;
    setSaving(true);
    try {
      const idToDelete = selectedPoint.inspectionPoint_ID;
      const res = await api.deletePoint(idToDelete);
      if (res && (res.success || res.Success)) {
        const remaining = points.filter(p => p.inspectionPoint_ID !== idToDelete);
        setPoints(remaining);
        const stepRemaining = remaining.filter(p =>
          activeStepTab === 'CRADLE' ? (p.pieceType === 'CRADLE' || p.cameraId === 'CAM_CRADLE') :
          activeStepTab === 'PANEL_TOP' ? (p.pieceType === 'PANEL' && p.cameraId === 'CAM_PANEL_01') :
          (p.pieceType === 'PANEL' && p.cameraId === 'CAM_PANEL_02')
        );
        setSelectedPointId(stepRemaining.length > 0 ? stepRemaining[0].inspectionPoint_ID : null);
        setShowDeleteModal(false);
        showFeedback('success', `Punto "${selectedPoint.name}" eliminado correctamente`);
      } else {
        showFeedback('error', res?.message || 'Error al eliminar punto');
      }
    } catch (err) {
      console.error(err);
      showFeedback('error', 'Error al procesar eliminación en el servidor');
    } finally {
      setSaving(false);
    }
  };

  // Create New Point
  const handleCreatePoint = async (e: React.FormEvent) => {
    e.preventDefault();
    const pieceType = activeStepTab === 'CRADLE' ? 'CRADLE' : 'PANEL';
    const cameraId = getActiveCameraId();

    const newPt: any = {
      inspectionPoint_ID: `IP_${pieceType}_${selectedModel}_${selectedHand}_${selectedPos}_${Date.now().toString(36).toUpperCase()}`,
      code: newPointCode.trim().toUpperCase() || `PT_${Date.now().toString(36).substring(4).toUpperCase()}`,
      name: newPointName.trim() || 'Nuevo Punto de Inspección',
      description: `Punto calibrado para ${selectedModel} ${selectedHand} ${selectedPos} (${activeStepTab})`,
      pieceType,
      cameraId,
      modelo: selectedModel,
      mano: selectedHand,
      posicion: selectedPos,
      algorithmType: newPointAlgo,
      expectedValue: newPointExpected.trim() || 'PRESENT',
      tolerance: 0,
      minConfidence: 0.85,
      isRequired: true,
      executionOrder: getStepPoints().length + 1,
      timeoutMs: 1500,
      enabled: true,
      roIs: [
        {
          roI_ID: 0,
          inspectionPoint_ID: '',
          name: 'ROI_1',
          x: 220,
          y: 180,
          width: 140,
          height: 120,
          shapeType: 'RECTANGLE'
        }
      ]
    };

    setSaving(true);
    try {
      const res = await api.createPoint(newPt);
      if (res && (res.success || res.Success)) {
        const created = res.point || newPt;
        setPoints(prev => [...prev, created]);
        setSelectedPointId(created.inspectionPoint_ID);
        setShowCreateModal(false);
        setNewPointCode('');
        setNewPointName('');
        showFeedback('success', `Nuevo punto "${created.name}" asignado a ${selectedModel} ${selectedHand} ${selectedPos}`);
        await loadVariantPlan(activeStepTab, selectedModel, selectedHand, selectedPos);
      } else {
        showFeedback('error', 'Error al crear punto en base de datos');
      }
    } catch (err) {
      console.error(err);
      showFeedback('error', 'Error de red al crear punto');
    } finally {
      setSaving(false);
    }
  };

  // Test Point Live
  const handleTestPoint = async () => {
    if (!selectedPoint) return;
    setTesting(true);
    setTestResult(null);
    try {
      const rois = selectedPoint.roIs && selectedPoint.roIs.length > 0
        ? selectedPoint.roIs
        : [{
            roI_ID: 0,
            inspectionPoint_ID: selectedPoint.inspectionPoint_ID,
            name: 'ROI_1',
            x: 100,
            y: 100,
            width: 150,
            height: 150,
            shapeType: 'RECTANGLE'
          }];

      const res = await api.testPoint(selectedPoint, rois);
      setTestResult(res);
      showFeedback(res.result === 'OK' ? 'success' : 'error', `Prueba finalizada: ${res.result || 'OK'}`);
    } catch (err) {
      console.error(err);
      showFeedback('error', 'Error al ejecutar prueba de visión en vivo');
    } finally {
      setTesting(false);
    }
  };

  // Recipe Edit
  const handleUpdateRecipe = async (index: number, field: keyof RobotRecipe, value: any) => {
    const updated = [...recipes];
    updated[index] = { ...updated[index], [field]: value };
    setRecipes(updated);
  };

  const handleSaveRecipe = async (recipe: RobotRecipe) => {
    setSaving(true);
    try {
      await api.saveRecipe(recipe);
      showFeedback('success', `Receta para Cuna ${recipe.cradle_Code || 'CUNA-01'} (${recipe.modelo} ${recipe.mano} ${recipe.posicion}) guardada`);
    } catch (err) {
      showFeedback('error', 'Error al guardar receta');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const crdCode = newRecipeCradle.trim().toUpperCase() || 'CUNA-01';
      const newRec: RobotRecipe = {
        stationCode: 'DL02',
        cradle_Code: crdCode,
        modelo: newRecipeModel,
        mano: newRecipeHand,
        posicion: newRecipePos,
        recipe_A: newRecipeA,
        recipe_B: newRecipeB,
        version: 1,
        activo: true
      };
      await api.saveRecipe(newRec);
      await loadAllData();
      setShowNewRecipeModal(false);
      showFeedback('success', `Receta para Cuna ${crdCode} (${newRec.modelo} ${newRec.mano} ${newRec.posicion}) creada exitosamente`);
    } catch (err) {
      console.error(err);
      showFeedback('error', 'Error al guardar nueva receta');
    } finally {
      setSaving(false);
    }
  };

  // QR Mapping Edit
  const handleUpdateQR = (index: number, field: keyof CradleQRMapping, value: any) => {
    const updated = [...qrMappings];
    updated[index] = { ...updated[index], [field]: value };
    setQrMappings(updated);
  };

  const handleSaveQR = async (mapping: CradleQRMapping) => {
    setSaving(true);
    try {
      await api.saveQRMapping(mapping);
      showFeedback('success', `Patrón QR "${mapping.qR_Pattern}" guardado`);
    } catch (err) {
      showFeedback('error', 'Error al guardar patrón QR');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="ml-3 text-slate-300 font-bold">Cargando puntos de inspección y recetas de DL02...</span>
      </div>
    );
  }

  const stepPoints = getStepPoints();
  const currentRoi: InspectionROI = selectedPoint?.roIs && selectedPoint.roIs.length > 0
    ? selectedPoint.roIs[0]
    : { roI_ID: 0, inspectionPoint_ID: '', name: 'ROI_1', x: 100, y: 100, width: 150, height: 150, shapeType: 'RECTANGLE', referenceImagePath: undefined };

  return (
    <div className="p-4 space-y-4 max-w-7xl mx-auto">
      {/* Toast Feedback */}
      {feedbackMsg && (
        <div
          className={`p-3 rounded-lg text-xs font-bold flex items-center justify-between shadow-lg animate-fade-in ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-950 border border-emerald-500 text-emerald-300'
              : feedbackMsg.type === 'error'
              ? 'bg-rose-950 border border-rose-500 text-rose-300'
              : 'bg-blue-950 border border-blue-500 text-cyan-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : feedbackMsg.type === 'error' ? (
              <AlertTriangle className="w-4 h-4" />
            ) : (
              <Move className="w-4 h-4" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
        </div>
      )}

      {/* Header Info Banner */}
      <div className="bg-industrial-card border border-industrial-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-blue-400" />
            <h2 className="text-sm font-black tracking-wider uppercase text-white">
              Configuración & Calibración de Pasos de Inspección — Puesto DL02
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            <span className="text-cyan-300 font-semibold">&bull; Mover zonas:</span> Haga clic y arrastre cualquier recuadro sobre la imagen en vivo. Use la esquina inferior derecha para redimensionar.
            <span className="text-rose-300 font-semibold ml-2">&bull; Eliminar:</span> Seleccione el punto y presione "Eliminar Punto".
          </p>
        </div>

        <button
          onClick={loadAllData}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold flex items-center space-x-1.5 border border-industrial-border transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Recargar de BD</span>
        </button>
      </div>

      {/* Step Tabs Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-industrial-border pb-2">
        <button
          onClick={() => {
            setActiveStepTab('CRADLE');
            const p = points.find(x => x.pieceType === 'CRADLE' || x.cameraId === 'CAM_CRADLE');
            if (p) setSelectedPointId(p.inspectionPoint_ID);
          }}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition ${
            activeStepTab === 'CRADLE'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
              : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          <Crosshair className="w-4 h-4" />
          <span>1. Poka-Yoke Cuna (CAM_CRADLE)</span>
        </button>

        <button
          onClick={() => setActiveStepTab('QR')}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition ${
            activeStepTab === 'QR'
              ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/50'
              : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          <QrCode className="w-4 h-4" />
          <span>2. Código QR Cuna (Validación)</span>
        </button>

        <button
          onClick={() => {
            setActiveStepTab('PANEL_TOP');
            const p = points.find(x => x.cameraId === 'CAM_PANEL_01');
            if (p) setSelectedPointId(p.inspectionPoint_ID);
          }}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition ${
            activeStepTab === 'PANEL_TOP'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50'
              : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          <Eye className="w-4 h-4" />
          <span>3. Panel Superior (CAM_PANEL_01)</span>
        </button>

        <button
          onClick={() => {
            setActiveStepTab('PANEL_BOTTOM');
            const p = points.find(x => x.cameraId === 'CAM_PANEL_02');
            if (p) setSelectedPointId(p.inspectionPoint_ID);
          }}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition ${
            activeStepTab === 'PANEL_BOTTOM'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/50'
              : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          <Eye className="w-4 h-4" />
          <span>4. Panel Inferior (CAM_PANEL_02)</span>
        </button>

        <button
          onClick={() => setActiveStepTab('RECIPES')}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition ${
            activeStepTab === 'RECIPES'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50'
              : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>5. Recetas PLC / Robot de Soldadura</span>
        </button>
      </div>

      {/* VARIANT CONTEXT SELECTOR BAR */}
      <div className="bg-slate-900/90 border border-industrial-border rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-1.5 text-xs font-mono font-bold text-slate-300">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span className="text-[11px] uppercase tracking-wider text-slate-400">Variante a Calibrar:</span>
          </div>

          {/* Model Selector */}
          <div className="flex items-center space-x-1">
            <span className="text-[10px] text-slate-500 font-bold uppercase">Modelo:</span>
            <select
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-white font-mono font-bold text-xs rounded px-2 py-1 focus:border-cyan-500 focus:outline-none"
            >
              {availableModels.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Hand Selector (LH / RH) */}
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-500 font-bold uppercase px-1">Mano:</span>
            <button
              type="button"
              onClick={() => setSelectedHand('LH')}
              className={`px-2.5 py-0.5 rounded text-xs font-mono font-black transition ${
                selectedHand === 'LH'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              LH (Izq)
            </button>
            <button
              type="button"
              onClick={() => setSelectedHand('RH')}
              className={`px-2.5 py-0.5 rounded text-xs font-mono font-black transition ${
                selectedHand === 'RH'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              RH (Der)
            </button>
          </div>

          {/* Position Selector (FRONT / REAR) */}
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-500 font-bold uppercase px-1">Posición:</span>
            <button
              type="button"
              onClick={() => setSelectedPos('FRONT')}
              className={`px-2.5 py-0.5 rounded text-xs font-mono font-black transition ${
                selectedPos === 'FRONT'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              FRONT (Delantera)
            </button>
            <button
              type="button"
              onClick={() => setSelectedPos('REAR')}
              className={`px-2.5 py-0.5 rounded text-xs font-mono font-black transition ${
                selectedPos === 'REAR'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              REAR (Trasera)
            </button>
          </div>

          {/* Active Plan Badge */}
          {activePlan && (
            <div className="hidden xl:flex items-center space-x-1.5 px-2.5 py-1 bg-slate-800/80 border border-slate-700/80 rounded-lg text-[11px] font-mono text-cyan-300">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              <span className="font-bold">{activePlan.code}</span>
              <span className="text-slate-400">(v{activePlan.activeVersion})</span>
            </div>
          )}
        </div>

        {/* Action Tools */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => {
              setCloneSrcModel(selectedModel);
              setCloneSrcHand(selectedHand === 'RH' ? 'LH' : 'RH');
              setCloneSrcPos(selectedPos);
              setShowCloneModal(true);
            }}
            className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 border border-indigo-500 transition shadow-sm"
            title="Copiar puntos y ROIs desde otra variante con opción de espejo"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copiar / Espejo</span>
          </button>

          <button
            type="button"
            onClick={handleOpenMatrixModal}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-xs font-bold flex items-center space-x-1.5 border border-cyan-800/80 transition shadow-sm"
            title="Ver matriz de control de todas las variantes"
          >
            <Grid className="w-3.5 h-3.5 text-cyan-400" />
            <span>Matriz Global</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: VISION STEPS (CRADLE, PANEL TOP, PANEL BOTTOM) */}
      {(activeStepTab === 'CRADLE' || activeStepTab === 'PANEL_TOP' || activeStepTab === 'PANEL_BOTTOM') && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: Points List & Interactive Camera View (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            {/* Step Points Sub-Navigation + Add Point Button */}
            <div className="bg-industrial-card border border-industrial-border rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase">
                  Puntos de Inspección configurados para esta fase:
                </span>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center space-x-1 shadow-md transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nuevo Punto</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {stepPoints.map(pt => {
                  const isSel = pt.inspectionPoint_ID === selectedPointId;
                  return (
                    <button
                      key={pt.inspectionPoint_ID}
                      onClick={() => {
                        setSelectedPointId(pt.inspectionPoint_ID);
                        setTestResult(null);
                      }}
                      className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center space-x-2 transition border ${
                        isSel
                          ? 'bg-blue-600 border-blue-400 text-white shadow-md'
                          : 'bg-slate-800/80 border-industrial-border text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <Target className="w-3.5 h-3.5" />
                      <span>{pt.code}: {pt.name}</span>
                      {pt.isRequired && (
                        <span className="px-1 py-0.2 bg-amber-500/30 text-amber-300 text-[9px] rounded font-mono">REQ</span>
                      )}
                    </button>
                  );
                })}

                {stepPoints.length === 0 && (
                  <span className="text-xs text-slate-500 italic">No hay puntos configurados para este paso</span>
                )}
              </div>
            </div>

            {/* Live Camera Feed with Drag & Drop SVG Overlay */}
            <div className="bg-industrial-card border border-industrial-border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-xs font-bold text-slate-200">
                    Cámara Asignada: <span className="text-cyan-400 font-mono">{activeCameraId}</span> (640x480)
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-[10px] text-cyan-400 bg-cyan-950/60 px-2 py-1 rounded border border-cyan-800">
                  <Move className="w-3 h-3" />
                  <span>Arrastrar para mover &bull; Manija inferior derecha para redimensionar</span>
                </div>
              </div>

              {/* Prominent Live QR Detection Bar */}
              {selectedPoint?.algorithmType === 'QR' && (
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between transition-all shadow-lg animate-fade-in ${
                    scannedQR?.text
                      ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
                      : 'bg-slate-900/90 border-cyan-800/80 text-cyan-300'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    {scannedQR?.text ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <RefreshCw className={`w-5 h-5 text-cyan-400 flex-shrink-0 ${autoScanQR ? 'animate-spin' : ''}`} />
                    )}
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-black uppercase tracking-wider">
                          {scannedQR?.text ? 'CÓDIGO QR DETECTADO EN VIVO:' : 'BUSCANDO CÓDIGO QR EN VIVO...'}
                        </span>
                        {scannedQR?.matched ? (
                          <span className="px-2 py-0.5 bg-emerald-500/30 text-emerald-300 text-[10px] font-mono rounded font-bold">
                            ASOCIADO A CUNA POKA-YOKE
                          </span>
                        ) : scannedQR?.text ? (
                          <span className="px-2 py-0.5 bg-amber-500/30 text-amber-300 text-[10px] font-mono rounded font-bold">
                            NO ASIGNADO A CUNA
                          </span>
                        ) : null}
                      </div>
                      <span className="text-xs font-mono font-bold text-white block mt-0.5">
                        {scannedQR?.text
                          ? `"${scannedQR.text}" ${scannedQR.mapping ? `(Cuna: ${scannedQR.mapping.modelo} ${scannedQR.mapping.mano} ${scannedQR.mapping.posicion})` : ''}`
                          : 'Apunte el celular o etiqueta hacia el recuadro para decodificar automáticamente.'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {scannedQR?.text && (
                      <button
                        type="button"
                        onClick={handleApplyScannedQRToPoint}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-extrabold flex items-center space-x-1.5 shadow transition"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Copiar a Esperado</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleManualScanQR}
                      disabled={scanningQR}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${scanningQR ? 'animate-spin' : ''}`} />
                      <span>{scanningQR ? 'Leyendo...' : 'Forzar Lectura'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Display Frame + Interactive SVG */}
              <div
                className="relative aspect-video max-h-[460px] w-full bg-black rounded-lg overflow-hidden border border-slate-700 flex items-center justify-center select-none"
              >
                {currentFrame ? (
                  <img
                    src={`data:image/jpeg;base64,${currentFrame}`}
                    alt="Live Stream"
                    className="w-full h-full object-contain pointer-events-none"
                  />
                ) : (
                  <div className="text-center text-slate-500 p-8 pointer-events-none">
                    <Eye className="w-12 h-12 mx-auto mb-2 opacity-30 animate-pulse" />
                    <span className="text-xs block">Esperando flujo de video para {activeCameraId}...</span>
                    <span className="text-[10px] text-slate-600">Verifique la pestaña "Pantalla Operador" o la configuración USB</span>
                  </div>
                )}

                {/* Interactive SVG Overlay (640x480) */}
                <svg
                  ref={svgRef}
                  viewBox="0 0 640 480"
                  className="absolute inset-0 w-full h-full cursor-crosshair"
                  style={{ touchAction: 'none' }}
                >
                  {/* Grid lines */}
                  <line x1="320" y1="0" x2="320" y2="480" stroke="rgba(255,255,255,0.06)" strokeDasharray="4" />
                  <line x1="0" y1="240" x2="640" y2="240" stroke="rgba(255,255,255,0.06)" strokeDasharray="4" />

                  {/* Draw each inspection point ROI */}
                  {stepPoints.map(p => {
                    const r = p.roIs && p.roIs.length > 0 ? p.roIs[0] : null;
                    if (!r) return null;
                    const isCurrent = p.inspectionPoint_ID === selectedPointId;

                    return (
                      <g key={p.inspectionPoint_ID}>
                        {/* Main Draggable Bounding Box or Circle */}
                        {r.shapeType === 'CIRCLE' ? (
                          <>
                            <ellipse
                              cx={r.x + r.width / 2}
                              cy={r.y + r.height / 2}
                              rx={r.width / 2}
                              ry={r.height / 2}
                              fill={isCurrent ? 'rgba(59, 130, 246, 0.22)' : 'rgba(16, 185, 129, 0.08)'}
                              stroke={isCurrent ? '#3b82f6' : '#10b981'}
                              strokeWidth={isCurrent ? '3' : '1.5'}
                              strokeDasharray={isCurrent ? 'none' : '4 2'}
                              className="cursor-move transition-colors"
                              style={{ touchAction: 'none' }}
                              onPointerDown={e => handleStartMove(e, p)}
                              onMouseDown={e => handleStartMove(e, p)}
                              onTouchStart={e => handleStartMove(e, p)}
                            />
                            <line
                              x1={r.x + r.width / 2 - 8}
                              y1={r.y + r.height / 2}
                              x2={r.x + r.width / 2 + 8}
                              y2={r.y + r.height / 2}
                              stroke={isCurrent ? '#60a5fa' : '#34d399'}
                              strokeWidth="1.5"
                            />
                            <line
                              x1={r.x + r.width / 2}
                              y1={r.y + r.height / 2 - 8}
                              x2={r.x + r.width / 2}
                              y2={r.y + r.height / 2 + 8}
                              stroke={isCurrent ? '#60a5fa' : '#34d399'}
                              strokeWidth="1.5"
                            />
                          </>
                        ) : (
                          <rect
                            x={r.x}
                            y={r.y}
                            width={r.width}
                            height={r.height}
                            fill={isCurrent ? 'rgba(59, 130, 246, 0.22)' : 'rgba(16, 185, 129, 0.08)'}
                            stroke={isCurrent ? '#3b82f6' : '#10b981'}
                            strokeWidth={isCurrent ? '3' : '1.5'}
                            strokeDasharray={isCurrent ? 'none' : '4 2'}
                            className="cursor-move transition-colors"
                            style={{ touchAction: 'none' }}
                            onPointerDown={e => handleStartMove(e, p)}
                            onMouseDown={e => handleStartMove(e, p)}
                            onTouchStart={e => handleStartMove(e, p)}
                          />
                        )}

                        {/* Title Bar Handle */}
                        <rect
                          x={r.x}
                          y={Math.max(0, r.y - 20)}
                          width={Math.max(110, (p.code.length + 6) * 8)}
                          height={20}
                          fill={isCurrent ? '#1d4ed8' : '#047857'}
                          className="cursor-move"
                          style={{ touchAction: 'none' }}
                          onPointerDown={e => handleStartMove(e, p)}
                          onMouseDown={e => handleStartMove(e, p)}
                          onTouchStart={e => handleStartMove(e, p)}
                        />
                        <text
                          x={r.x + 6}
                          y={Math.max(0, r.y - 20) + 14}
                          fill="#ffffff"
                          fontSize="11"
                          fontWeight="bold"
                          fontFamily="monospace"
                          className="cursor-move pointer-events-none"
                        >
                          {p.code} (ROI)
                        </text>

                        {/* Corner Crosshairs */}
                        {isCurrent && (
                          <>
                            {/* Top-Left crosshair */}
                            <circle cx={r.x} cy={r.y} r="3" fill="#60a5fa" />
                            {/* Top-Right crosshair */}
                            <circle cx={r.x + r.width} cy={r.y} r="3" fill="#60a5fa" />
                            {/* Bottom-Left crosshair */}
                            <circle cx={r.x} cy={r.y + r.height} r="3" fill="#60a5fa" />

                            {/* Resize Handle (Bottom-Right) */}
                            <rect
                              x={r.x + r.width - 12}
                              y={r.y + r.height - 12}
                              width="12"
                              height="12"
                              fill="#38bdf8"
                              stroke="#0284c7"
                              strokeWidth="1.5"
                              className="cursor-se-resize"
                              style={{ touchAction: 'none' }}
                              onPointerDown={e => handleStartResize(e, p)}
                              onMouseDown={e => handleStartResize(e, p)}
                              onTouchStart={e => handleStartResize(e, p)}
                            />

                            {/* Coordinate Tooltip while dragging */}
                            <text
                              x={r.x + 6}
                              y={r.y + r.height - 8}
                              fill="#93c5fd"
                              fontSize="10"
                              fontFamily="monospace"
                              className="pointer-events-none"
                            >
                              {r.x},{r.y} [{r.width}x{r.height}]
                            </text>
                          </>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Live Test Outcome Panel */}
              {testResult && (
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between animate-fade-in ${
                    testResult.result === 'OK'
                      ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200'
                      : 'bg-rose-950/60 border-rose-500 text-rose-200'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    {testResult.result === 'OK' ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    ) : (
                      <XCircle className="w-6 h-6 text-rose-400" />
                    )}
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-black uppercase">
                          RESULTADO: {testResult.result}
                        </span>
                        <span className="text-[11px] font-mono opacity-80">
                          (Detectado: "{testResult.detectedValue}" vs Esperado: "{testResult.expectedValue}")
                        </span>
                      </div>
                      <div className="text-[11px] opacity-75">
                        Confianza: {(testResult.confidence * 100).toFixed(1)}% | Tiempo: {testResult.processingTimeMs}ms
                        {testResult.failureReason && ` | Causa: ${testResult.failureReason}`}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`px-3 py-1 rounded text-xs font-black font-mono ${
                      testResult.result === 'OK' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                    }`}
                  >
                    {testResult.result === 'OK' ? 'PASA POKA-YOKE' : 'FALLA INSPECCIÓN'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Point Configuration & ROI Coordinates (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            {selectedPoint ? (
              <div className="bg-industrial-card border border-industrial-border rounded-xl p-4 space-y-4 shadow-xl">
                <div className="border-b border-industrial-border pb-3 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase block">
                      {selectedPoint.pieceType} &bull; {selectedPoint.code}
                    </span>
                    <h3 className="text-sm font-black text-white">{selectedPoint.name}</h3>
                  </div>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="p-1.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-700 text-rose-300 rounded-lg transition"
                    title="Eliminar este punto de inspección"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Form Fields */}
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Nombre Descriptivo:</label>
                    <input
                      type="text"
                      value={selectedPoint.name}
                      onChange={e => handleUpdatePointField('name', e.target.value)}
                      className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2 text-white font-semibold focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Algoritmo de Visión:</label>
                    <select
                      value={selectedPoint.algorithmType}
                      onChange={e => handleUpdatePointField('algorithmType', e.target.value)}
                      className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2 text-white font-semibold focus:border-blue-500 focus:outline-none"
                    >
                      <option value="PRESENCE">PRESENCE (Presencia por Brillo / Bordes)</option>
                      <option value="TEMPLATE_MATCH">TEMPLATE_MATCH (Patrón por Plantilla OpenCV)</option>
                      <option value="QR">QR / DataMatrix (Decodificador Industrial)</option>
                      <option value="COLOR">COLOR (Segmentación HSV de Sellador)</option>
                      <option value="YOLO_ONNX">YOLO_ONNX (Inferencia por Red Neuronal)</option>
                    </select>
                  </div>

                  {/* 1. PANEL ESPECIALIZADO: CÓDIGO QR / DATAMATRIX (POKA-YOKE) */}
                  {selectedPoint.algorithmType === 'QR' && (
                    <div className="bg-slate-950/90 border border-cyan-700/80 rounded-lg p-3 space-y-3 shadow-lg animate-fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-cyan-400 uppercase tracking-wide flex items-center space-x-1.5">
                          <QrCode className="w-4 h-4 text-cyan-400" />
                          <span>Decodificador de Código QR (Poka-Yoke)</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setAutoScanQR(!autoScanQR)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                            autoScanQR ? 'bg-cyan-900/60 border-cyan-500 text-cyan-300' : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}
                        >
                          {autoScanQR ? 'Auto-Scan: ACTIVO' : 'Auto-Scan: PAUSA'}
                        </button>
                      </div>

                      {/* Display del QR Detectado */}
                      {scannedQR?.text ? (
                        <div className="p-2.5 bg-emerald-950/70 border border-emerald-500 rounded-lg space-y-2 animate-fade-in">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center space-x-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Código QR Detectado en Cámara:</span>
                            </span>
                            <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 text-[9px] font-mono rounded font-bold">
                              CONF: 99%
                            </span>
                          </div>

                          <div className="p-2 bg-slate-900/90 rounded border border-slate-700 font-mono text-xs text-white font-black break-all select-all">
                            "{scannedQR.text}"
                          </div>

                          {scannedQR.matched && scannedQR.mapping ? (
                            <div className="text-[10px] text-emerald-300 font-semibold flex items-center space-x-1">
                              <span>✓ Registrado para Cuna:</span>
                              <span className="font-mono font-bold bg-emerald-900/50 px-1 rounded">
                                {scannedQR.mapping.modelo} {scannedQR.mapping.mano} {scannedQR.mapping.posicion}
                              </span>
                            </div>
                          ) : (
                            <div className="text-[10px] text-amber-300 font-semibold flex items-center space-x-1">
                              <AlertTriangle className="w-3 h-3 text-amber-400" />
                              <span>QR no asociado en tabla [CradleQR]</span>
                            </div>
                          )}

                          <div className="flex space-x-1.5 pt-1">
                            <button
                              type="button"
                              onClick={handleApplyScannedQRToPoint}
                              className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-extrabold flex items-center justify-center space-x-1 shadow transition"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Usar como Valor Esperado</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRegisterScannedQRMapping()}
                              className="py-1.5 px-2.5 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-[11px] font-bold flex items-center justify-center space-x-1 transition"
                              title="Registrar este QR en la tabla de cunas"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Asignar Cuna</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg text-center space-y-1.5">
                          <div className="flex items-center justify-center space-x-2 text-cyan-400">
                            <RefreshCw className={`w-4 h-4 ${autoScanQR ? 'animate-spin' : ''}`} />
                            <span className="text-xs font-bold">Buscando código QR en {activeCameraId}...</span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Apunte la cámara hacia el código QR (o amplíe el recuadro azul para abarcarlo completamente).
                          </p>
                          <button
                            type="button"
                            onClick={handleManualScanQR}
                            disabled={scanningQR}
                            className="px-3 py-1 bg-cyan-800 hover:bg-cyan-700 text-white rounded text-[11px] font-bold transition"
                          >
                            {scanningQR ? 'Escaneando...' : 'Escanear Ahora'}
                          </button>
                        </div>
                      )}

                      {/* Modo de Validación Rápido */}
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-1 font-bold">Modo de Aprobación:</span>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <button
                            type="button"
                            onClick={() => handleUpdatePointField('expectedValue', 'PRESENT')}
                            className={`p-1.5 rounded border text-left font-bold transition ${
                              selectedPoint.expectedValue === 'PRESENT'
                                ? 'bg-blue-600 border-blue-400 text-white'
                                : 'bg-slate-900 border-slate-800 text-slate-300'
                            }`}
                          >
                            <span className="block text-[10px] text-slate-300 font-mono">Modo Flexible</span>
                            <span>Cualquier QR Válido</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (scannedQR?.text) handleUpdatePointField('expectedValue', scannedQR.text);
                            }}
                            className={`p-1.5 rounded border text-left font-bold transition ${
                              selectedPoint.expectedValue !== 'PRESENT' && selectedPoint.expectedValue !== ''
                                ? 'bg-blue-600 border-blue-400 text-white'
                                : 'bg-slate-900 border-slate-800 text-slate-300'
                            }`}
                          >
                            <span className="block text-[10px] text-slate-300 font-mono">Modo Estricto</span>
                            <span>Texto Específico</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2. SELECCIÓN DE FORMA GEOMÉTRICA & PLANTILLA MASTER (Template Match o Presence) */}
                  {(selectedPoint.algorithmType === 'TEMPLATE_MATCH' || selectedPoint.algorithmType === 'PRESENCE') && (
                    <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-cyan-400 uppercase tracking-wide flex items-center space-x-1.5">
                          <Square className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Forma a Buscar & Plantilla Master</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {currentRoi.shapeType === 'CIRCLE' ? 'CÍRCULO' : 'RECTÁNGULO'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleUpdateShapeType('RECTANGLE')}
                          className={`py-1.5 px-2 rounded border text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
                            currentRoi.shapeType !== 'CIRCLE'
                              ? 'bg-blue-600 border-blue-400 text-white shadow'
                              : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'
                          }`}
                        >
                          <Square className="w-3.5 h-3.5" />
                          <span>Rectangular</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleUpdateShapeType('CIRCLE')}
                          className={`py-1.5 px-2 rounded border text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
                            currentRoi.shapeType === 'CIRCLE'
                              ? 'bg-blue-600 border-blue-400 text-white shadow'
                              : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'
                          }`}
                        >
                          <Circle className="w-3.5 h-3.5" />
                          <span>Circular</span>
                        </button>
                      </div>

                      {/* Captura de Plantilla Master (Template Match) */}
                      {selectedPoint.algorithmType === 'TEMPLATE_MATCH' && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={handleCaptureTemplate}
                            disabled={capturingTemplate}
                            className="w-full py-2 bg-indigo-700 hover:bg-indigo-600 disabled:bg-slate-800 text-white rounded text-xs font-black flex items-center justify-center space-x-1.5 shadow-md transition"
                          >
                            {capturingTemplate ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Camera className="w-3.5 h-3.5" />
                            )}
                            <span>Aprender Forma Master de la Cámara</span>
                          </button>

                          {currentRoi.referenceImagePath ? (
                            <div className="mt-1.5 p-1.5 bg-emerald-950/60 border border-emerald-600/70 rounded text-[10px] text-emerald-300 flex items-center space-x-1.5 font-mono">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                              <span className="truncate">Forma Master Asentada: {currentRoi.referenceImagePath.split('\\').pop()?.split('/').pop()}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-500 block mt-1 italic">
                              * Posicione la forma deseada en el cuadro y presione "Aprender Forma Master" para fijar la plantilla.
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3. COINCIDENCIA DE COLOR (HSV & PRESETS) */}
                  {selectedPoint.algorithmType === 'COLOR' && (
                    <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-amber-400 uppercase tracking-wide flex items-center space-x-1.5">
                          <Palette className="w-3.5 h-3.5 text-amber-400" />
                          <span>Color que debe Coincidir</span>
                        </span>
                        <span className="text-[10px] font-mono font-bold text-slate-300">
                          {selectedPoint.expectedValue || 'PRESENT'}
                        </span>
                      </div>

                      <span className="text-[10px] text-slate-400 block">
                        Seleccione el preset de color industrial para validar:
                      </span>

                      <div className="grid grid-cols-3 gap-1.5 text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() => handleSelectColorPreset('SELLADOR_AZUL')}
                          className={`p-1.5 rounded border flex items-center space-x-1.5 transition ${
                            selectedPoint.expectedValue === 'SELLADOR_AZUL'
                              ? 'bg-blue-600 text-white border-blue-400 shadow'
                              : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                          <span className="truncate">Sellador Azul</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectColorPreset('SELLADOR_NEGRO')}
                          className={`p-1.5 rounded border flex items-center space-x-1.5 transition ${
                            selectedPoint.expectedValue === 'SELLADOR_NEGRO'
                              ? 'bg-slate-700 text-white border-slate-400 shadow'
                              : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span className="w-2.5 h-2.5 rounded-full bg-zinc-900 border border-slate-500"></span>
                          <span className="truncate">Sellador Negro</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectColorPreset('CLIP_AMARILLO')}
                          className={`p-1.5 rounded border flex items-center space-x-1.5 transition ${
                            selectedPoint.expectedValue === 'CLIP_AMARILLO'
                              ? 'bg-amber-600 text-white border-amber-400 shadow'
                              : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400"></span>
                          <span className="truncate">Clip Amarillo</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectColorPreset('CLIP_BLANCO')}
                          className={`p-1.5 rounded border flex items-center space-x-1.5 transition ${
                            selectedPoint.expectedValue === 'CLIP_BLANCO'
                              ? 'bg-slate-200 text-black border-white shadow'
                              : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span className="w-2.5 h-2.5 rounded-full bg-white border border-slate-400"></span>
                          <span className="truncate">Clip Blanco</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectColorPreset('MARCADOR_VERDE')}
                          className={`p-1.5 rounded border flex items-center space-x-1.5 transition ${
                            selectedPoint.expectedValue === 'MARCADOR_VERDE'
                              ? 'bg-emerald-600 text-white border-emerald-400 shadow'
                              : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                          <span className="truncate">Marca Verde</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectColorPreset('CLIP_ROJO')}
                          className={`p-1.5 rounded border flex items-center space-x-1.5 transition ${
                            selectedPoint.expectedValue === 'CLIP_ROJO'
                              ? 'bg-rose-600 text-white border-rose-400 shadow'
                              : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                          <span className="truncate">Clip Rojo</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Valor Esperado:</label>
                      <input
                        type="text"
                        value={selectedPoint.expectedValue}
                        onChange={e => handleUpdatePointField('expectedValue', e.target.value)}
                        className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2 text-white font-mono font-bold focus:border-blue-500 focus:outline-none"
                        placeholder="PRESENT / MATCH"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Tolerancia (&plusmn;):</label>
                      <input
                        type="number"
                        step="0.05"
                        value={selectedPoint.tolerance}
                        onChange={e => handleUpdatePointField('tolerance', parseFloat(e.target.value) || 0)}
                        className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2 text-white font-mono focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-slate-400 font-bold">Umbral de Confianza Mínimo:</label>
                      <span className="font-mono font-black text-cyan-400">
                        {(selectedPoint.minConfidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.4"
                      max="0.99"
                      step="0.01"
                      value={selectedPoint.minConfidence}
                      onChange={e => handleUpdatePointField('minConfidence', parseFloat(e.target.value))}
                      className="w-full accent-blue-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                      <span>40% (Permisivo)</span>
                      <span>85% (Recomendado)</span>
                      <span>99% (Estricto)</span>
                    </div>
                  </div>

                  {/* Mandatory Checkbox */}
                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="checkbox"
                      id="isRequiredCheck"
                      checked={selectedPoint.isRequired}
                      onChange={e => handleUpdatePointField('isRequired', e.target.checked)}
                      className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                    />
                    <label htmlFor="isRequiredCheck" className="text-slate-300 font-semibold cursor-pointer">
                      Punto Obligatorio (Si falla &rarr; Parada de Emergencia / NOK)
                    </label>
                  </div>

                  {/* ROI Coordinate Inputs with Drag & Drop Guidance */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black text-amber-400 uppercase tracking-wide flex items-center space-x-1">
                        <Move className="w-3.5 h-3.5 inline text-amber-300" />
                        <span>Coordenadas ROI (Arrastrable)</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">640x480</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 font-mono">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Posición X:</span>
                        <input
                          type="number"
                          value={currentRoi.x}
                          onChange={e => handleUpdateRoiInput(0, 'x', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Posición Y:</span>
                        <input
                          type="number"
                          value={currentRoi.y}
                          onChange={e => handleUpdateRoiInput(0, 'y', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Ancho (Width):</span>
                        <input
                          type="number"
                          value={currentRoi.width}
                          onChange={e => handleUpdateRoiInput(0, 'width', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Alto (Height):</span>
                        <input
                          type="number"
                          value={currentRoi.height}
                          onChange={e => handleUpdateRoiInput(0, 'height', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Actions: Test, Save, Delete */}
                  <div className="space-y-2 pt-2">
                    <div className="flex space-x-2">
                      <button
                        onClick={handleTestPoint}
                        disabled={testing}
                        className="flex-1 py-2.5 bg-cyan-700 hover:bg-cyan-600 disabled:bg-slate-700 rounded-lg text-xs font-black text-white flex items-center justify-center space-x-1.5 shadow-md transition"
                      >
                        {testing ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current" />
                        )}
                        <span>Probar en Vivo</span>
                      </button>

                      <button
                        onClick={handleSavePoint}
                        disabled={saving}
                        className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 rounded-lg text-xs font-black text-white flex items-center justify-center space-x-1.5 shadow-md transition"
                      >
                        {saving ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        <span>Guardar Punto</span>
                      </button>
                    </div>

                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className="w-full py-2 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-700/80 text-rose-300 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Eliminar Este Punto</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-industrial-card border border-industrial-border rounded-xl p-6 text-center text-slate-500">
                Seleccione un punto de inspección arriba para configurar sus parámetros o presione "+ Nuevo Punto" para agregar uno.
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: STEP 2 - QR VALIDATION MAPPINGS */}
      {activeStepTab === 'QR' && (
        <div className="space-y-4">
          {/* Header */}
          <div className="bg-industrial-card border border-industrial-border rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-cyan-950 border border-cyan-700 rounded-xl text-cyan-400">
                <QrCode className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white uppercase">
                  Paso 2: Validación de Código QR de Cuna Mecánica (Poka-Yoke)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  La cámara CAM_CRADLE escanea en tiempo real el código QR / DataMatrix para verificar que la cuna instalada corresponda al Modelo, Mano y Posición de la orden activa.
                </p>
              </div>
            </div>

            <button
              onClick={handleManualScanQR}
              disabled={scanningQR}
              className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 disabled:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 transition shadow"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanningQR ? 'animate-spin' : ''}`} />
              <span>{scanningQR ? 'Escaneando...' : 'Forzar Escaneo'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Col: Live Stream CAM_CRADLE (5 cols) */}
            <div className="lg:col-span-5 bg-industrial-card border border-industrial-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Cámara en Vivo: <span className="font-mono text-cyan-400">CAM_CRADLE</span></span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">640x480</span>
              </div>

              <div className="relative aspect-video w-full bg-black rounded-lg overflow-hidden border border-slate-700 flex items-center justify-center">
                {frames['CAM_CRADLE'] ? (
                  <img
                    src={`data:image/jpeg;base64,${frames['CAM_CRADLE']}`}
                    alt="Live CAM_CRADLE"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center text-slate-500 p-6">
                    <Eye className="w-10 h-10 mx-auto mb-2 opacity-30 animate-pulse" />
                    <span className="text-xs block">Esperando video CAM_CRADLE...</span>
                  </div>
                )}

                {/* Target overlay guide */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-44 h-44 border-2 border-cyan-400/60 border-dashed rounded-lg flex items-center justify-center">
                    <div className="w-4 h-4 border border-cyan-400/80 rounded-full"></div>
                  </div>
                </div>
              </div>

              {/* Status Box */}
              {scannedQR?.text ? (
                <div className="p-3 bg-emerald-950/80 border border-emerald-500 rounded-lg space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-emerald-300 uppercase tracking-wider flex items-center space-x-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>QR Detectado en Vivo</span>
                    </span>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-mono rounded font-bold">
                      100% LEGIBLE
                    </span>
                  </div>

                  <div className="p-2 bg-slate-900/90 rounded border border-slate-700 font-mono text-xs text-white font-black break-all select-all">
                    "{scannedQR.text}"
                  </div>

                  {scannedQR.matched && scannedQR.mapping ? (
                    <div className="text-xs text-emerald-300 font-bold flex items-center space-x-1.5">
                      <span>✓ Coincide con Cuna:</span>
                      <span className="font-mono bg-emerald-900/60 px-1.5 py-0.5 rounded text-white">
                        {scannedQR.mapping.modelo} {scannedQR.mapping.mano} {scannedQR.mapping.posicion} ({scannedQR.mapping.variante})
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="text-xs text-amber-300 font-semibold flex items-center space-x-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <span>Este código QR aún no está registrado en la base de datos de cunas.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRegisterScannedQRMapping()}
                        className="w-full py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-xs font-bold flex items-center justify-center space-x-1.5 shadow transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Registrar como Cuna P1B RH FRONT</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg text-center space-y-1">
                  <div className="flex items-center justify-center space-x-2 text-cyan-400 text-xs font-bold">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Buscando código QR en CAM_CRADLE...</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Coloque el celular o la etiqueta QR frente a la cámara dentro de la guía central.
                  </p>
                </div>
              )}
            </div>

            {/* Right Col: Table of QR Mappings (7 cols) */}
            <div className="lg:col-span-7 bg-industrial-card border border-industrial-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-white uppercase tracking-wider">
                  Tabla de Asociación de Cunas Físicas (CradleQR)
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {qrMappings.length} patrones cargados
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-900 text-slate-400 uppercase font-mono text-[11px]">
                    <tr>
                      <th className="p-2.5">Cuna</th>
                      <th className="p-2.5">Patrón QR Esperado</th>
                      <th className="p-2.5">Modelo</th>
                      <th className="p-2.5">Mano</th>
                      <th className="p-2.5">Posición</th>
                      <th className="p-2.5">Estado</th>
                      <th className="p-2.5 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {qrMappings.map((qr, idx) => {
                      const isMatched = scannedQR?.text && (
                        qr.qR_Pattern.trim().toLowerCase() === scannedQR.text.trim().toLowerCase() ||
                        scannedQR.text.trim().toLowerCase().includes(qr.qR_Pattern.trim().toLowerCase())
                      );

                      return (
                        <tr
                          key={qr.qR_ID || idx}
                          className={`transition ${
                            isMatched
                              ? 'bg-emerald-950/70 border-l-4 border-emerald-400 font-bold'
                              : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={qr.cradle_Code || 'CUNA-01'}
                              onChange={e => handleUpdateQR(idx, 'cradle_Code', e.target.value.toUpperCase())}
                              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-yellow-300 font-mono font-bold w-20"
                              placeholder="CUNA-01"
                            />
                          </td>
                          <td className="p-2.5 font-mono font-bold text-cyan-300">
                            <input
                              type="text"
                              value={qr.qR_Pattern}
                              onChange={e => handleUpdateQR(idx, 'qR_Pattern', e.target.value)}
                              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono w-full max-w-[200px]"
                            />
                            {isMatched && (
                              <span className="block text-[10px] text-emerald-400 font-sans font-bold mt-0.5">
                                ✓ COINCIDE CON LECTURA EN VIVO
                              </span>
                            )}
                          </td>
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={qr.modelo}
                              onChange={e => handleUpdateQR(idx, 'modelo', e.target.value)}
                              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono w-16"
                            />
                          </td>
                          <td className="p-2.5">
                            <select
                              value={qr.mano}
                              onChange={e => handleUpdateQR(idx, 'mano', e.target.value)}
                              className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-white font-mono text-xs"
                            >
                              <option value="RH">RH (Der)</option>
                              <option value="LH">LH (Izq)</option>
                            </select>
                          </td>
                          <td className="p-2.5">
                            <select
                              value={qr.posicion}
                              onChange={e => handleUpdateQR(idx, 'posicion', e.target.value)}
                              className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-white font-mono text-xs"
                            >
                              <option value="FRONT">FRONT</option>
                              <option value="REAR">REAR</option>
                            </select>
                          </td>
                          <td className="p-2.5">
                            <button
                              onClick={() => handleUpdateQR(idx, 'activo', !qr.activo)}
                              className={`px-2 py-0.5 rounded text-[10px] font-black font-mono ${
                                qr.activo ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-500' : 'bg-slate-800 text-slate-500'
                              }`}
                            >
                              {qr.activo ? 'ACTIVO' : 'INACTIVO'}
                            </button>
                          </td>
                          <td className="p-2.5 text-right">
                            <button
                              onClick={() => handleSaveQR(qr)}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold transition flex items-center space-x-1 ml-auto"
                            >
                              <Save className="w-3 h-3" />
                              <span>Guardar</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: STEP 5 - RECIPES CONFIGURATION */}
      {activeStepTab === 'RECIPES' && (
        <div className="bg-industrial-card border border-industrial-border rounded-xl p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-industrial-border pb-4 gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-emerald-950 border border-emerald-700 rounded-xl text-emerald-400">
                <Cpu className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white uppercase flex items-center space-x-2">
                  <span>Paso 5: Mapeo de Recetas de Soldadura Robot & Handshake PLC</span>
                  <span className="px-2 py-0.5 bg-cyan-900/60 text-cyan-300 text-[10px] font-mono rounded border border-cyan-700">
                    INDEXADO POR CUNA
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  La <strong>Cuna física</strong> determina la receta de soldadura enviada al PLC y Robot. Un mismo panel puede ir en distintas cunas con recetas diferenciadas.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowNewRecipeModal(true)}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black flex items-center space-x-1.5 shadow-lg transition self-start md:self-center"
            >
              <Plus className="w-4 h-4" />
              <span>+ Nueva Receta Cuna-Panel</span>
            </button>
          </div>

          {/* Filter Bar by Cradle */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/70 p-3 rounded-xl border border-slate-800">
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Filtrar por Cuna:</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedCradleFilter('ALL')}
                  className={`px-3 py-1 rounded text-xs font-bold transition ${
                    selectedCradleFilter === 'ALL'
                      ? 'bg-blue-600 text-white shadow'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Todas ({recipes.length})
                </button>
                {cradles.map(c => {
                  const count = recipes.filter(r => (r.cradle_Code || 'CUNA-01') === c).length;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedCradleFilter(c)}
                      className={`px-3 py-1 rounded text-xs font-bold transition font-mono ${
                        selectedCradleFilter === c
                          ? 'bg-emerald-600 text-white shadow'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {c} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            <span className="text-[11px] text-slate-400 font-mono">
              Mostrando {recipes.filter(r => selectedCradleFilter === 'ALL' || (r.cradle_Code || 'CUNA-01') === selectedCradleFilter).length} recetas
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-900 text-slate-400 uppercase font-mono text-[11px]">
                <tr>
                  <th className="p-3">Cuna (Útil Físico)</th>
                  <th className="p-3">Modelo</th>
                  <th className="p-3">Mano</th>
                  <th className="p-3">Posición</th>
                  <th className="p-3">Receta A (PLC Tag)</th>
                  <th className="p-3">Receta B (Robot Prog)</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {recipes
                  .filter(rec => selectedCradleFilter === 'ALL' || (rec.cradle_Code || 'CUNA-01') === selectedCradleFilter)
                  .map((rec, idx) => {
                    const originalIndex = recipes.findIndex(r => r === rec);
                    return (
                      <tr key={rec.recipe_ID || idx} className="hover:bg-slate-800/40">
                        <td className="p-3">
                          <input
                            type="text"
                            value={rec.cradle_Code || 'CUNA-01'}
                            onChange={e => handleUpdateRecipe(originalIndex, 'cradle_Code', e.target.value.toUpperCase())}
                            className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-yellow-300 font-mono font-bold w-24"
                            placeholder="CUNA-01"
                          />
                        </td>
                        <td className="p-3 font-mono font-bold text-white">{rec.modelo}</td>
                        <td className="p-3 font-mono text-cyan-400 font-bold">{rec.mano}</td>
                        <td className="p-3 font-mono text-purple-400 font-bold">{rec.posicion}</td>
                        <td className="p-3">
                          <input
                            type="number"
                            value={rec.recipe_A}
                            onChange={e => handleUpdateRecipe(originalIndex, 'recipe_A', parseInt(e.target.value) || 0)}
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-emerald-300 font-mono font-bold w-24"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="number"
                            value={rec.recipe_B}
                            onChange={e => handleUpdateRecipe(originalIndex, 'recipe_B', parseInt(e.target.value) || 0)}
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-emerald-300 font-mono font-bold w-24"
                          />
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => handleUpdateRecipe(originalIndex, 'activo', !rec.activo)}
                            className={`px-2 py-1 rounded text-[10px] font-black font-mono ${
                              rec.activo ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-500' : 'bg-slate-800 text-slate-500'
                            }`}
                          >
                            {rec.activo ? 'ACTIVA' : 'INACTIVA'}
                          </button>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleSaveRecipe(rec)}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition flex items-center space-x-1 ml-auto"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>Guardar</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM DELETE POINT */}
      {showDeleteModal && selectedPoint && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-industrial-card border border-rose-600 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 border-b border-industrial-border pb-3">
              <div className="p-2 bg-rose-950 rounded-lg text-rose-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-white uppercase">Eliminar Punto de Inspección</h3>
                <span className="text-xs text-rose-400 font-mono font-bold">{selectedPoint.code}</span>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              ¿Está seguro que desea eliminar definitivamente el punto <strong className="text-white">"{selectedPoint.name}"</strong>?
            </p>
            <p className="text-[11px] text-slate-400 bg-slate-900 p-2.5 rounded border border-slate-800">
              Esta acción eliminará de forma permanente sus regiones de interés (ROI) y su vinculación en los planes de inspección de la base de datos.
            </p>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeletePoint}
                disabled={saving}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-700 rounded-lg text-xs font-black text-white flex items-center justify-center space-x-1.5 shadow-lg"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Eliminar Definitivamente</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE NEW POINT */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fade-in">
          <form onSubmit={handleCreatePoint} className="bg-industrial-card border border-industrial-border rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 border-b border-industrial-border pb-3">
              <div className="p-2 bg-blue-950 rounded-lg text-blue-400">
                <Plus className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-white uppercase">Crear Nuevo Punto de Inspección</h3>
                <span className="text-xs text-slate-400 font-mono">Fase: {activeStepTab} ({getActiveCameraId()})</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-bold block mb-1">Código del Punto (ej. CRD_05, PNL_04):</label>
                <input
                  type="text"
                  required
                  value={newPointCode}
                  onChange={e => setNewPointCode(e.target.value)}
                  placeholder="CRD_05"
                  className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2 text-white font-mono uppercase focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">Nombre Descriptivo:</label>
                <input
                  type="text"
                  required
                  value={newPointName}
                  onChange={e => setNewPointName(e.target.value)}
                  placeholder="Presencia de Clip Central"
                  className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">Algoritmo:</label>
                <select
                  value={newPointAlgo}
                  onChange={e => setNewPointAlgo(e.target.value)}
                  className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="PRESENCE">PRESENCE (Presencia por Brillo / Bordes)</option>
                  <option value="TEMPLATE_MATCH">TEMPLATE_MATCH (Patrón por Plantilla OpenCV)</option>
                  <option value="QR">QR / DataMatrix</option>
                  <option value="COLOR">COLOR (Segmentación HSV)</option>
                  <option value="YOLO_ONNX">YOLO_ONNX (Inferencia Neuronal)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">Valor Nominal Esperado:</label>
                <input
                  type="text"
                  required
                  value={newPointExpected}
                  onChange={e => setNewPointExpected(e.target.value)}
                  placeholder="PRESENT"
                  className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2 text-white font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 rounded-lg text-xs font-black text-white flex items-center justify-center space-x-1.5 shadow-lg"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>Crear y Posicionar</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: CLONE / MIRROR VARIANT POINTS */}
      {showCloneModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-industrial-card border border-indigo-500 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 border-b border-industrial-border pb-3">
              <div className="p-2 bg-indigo-950 rounded-lg text-indigo-400">
                <Copy className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-white uppercase">Clonar Puntos entre Variantes</h3>
                <span className="text-xs text-indigo-300 font-mono">Fase: {activeStepTab}</span>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              Copie los puntos de inspección y sus regiones de interés (ROI) desde una variante ya calibrada hacia la variante destino activa.
            </p>

            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-900 rounded-lg border border-slate-800 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Variante Origen (Fuente):</span>
                <div className="space-y-1.5">
                  <select
                    value={cloneSrcModel}
                    onChange={e => setCloneSrcModel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-1 text-white font-mono"
                  >
                    {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => setCloneSrcHand('LH')}
                      className={`p-1 rounded text-xs font-mono font-bold border ${cloneSrcHand === 'LH' ? 'bg-cyan-700 text-white border-cyan-500' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                    >
                      LH
                    </button>
                    <button
                      type="button"
                      onClick={() => setCloneSrcHand('RH')}
                      className={`p-1 rounded text-xs font-mono font-bold border ${cloneSrcHand === 'RH' ? 'bg-cyan-700 text-white border-cyan-500' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                    >
                      RH
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => setCloneSrcPos('FRONT')}
                      className={`p-1 rounded text-xs font-mono font-bold border ${cloneSrcPos === 'FRONT' ? 'bg-purple-700 text-white border-purple-500' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                    >
                      FRONT
                    </button>
                    <button
                      type="button"
                      onClick={() => setCloneSrcPos('REAR')}
                      className={`p-1 rounded text-xs font-mono font-bold border ${cloneSrcPos === 'REAR' ? 'bg-purple-700 text-white border-purple-500' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                    >
                      REAR
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Variante Destino (A Calibrar):</span>
                <div className="p-2.5 bg-slate-950 border border-slate-700 rounded space-y-1">
                  <div className="text-white font-mono font-bold text-sm">
                    {selectedModel} • {selectedHand} • {selectedPos}
                  </div>
                  <span className="text-[10px] text-emerald-400 font-mono block">
                    &rarr; Se actualizarán las ROIs para este plan
                  </span>
                </div>
              </div>
            </div>

            {/* Mirror Option */}
            <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 flex items-start space-x-2.5">
              <input
                type="checkbox"
                id="mirrorCheck"
                checked={cloneMirrorX}
                onChange={e => setCloneMirrorX(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0"
              />
              <label htmlFor="mirrorCheck" className="text-xs text-slate-300 cursor-pointer">
                <span className="font-bold text-white block">Invertir Coordenada X Horizontalmente (Efecto Espejo)</span>
                <span className="text-[11px] text-slate-400">
                  Ideal al clonar de mano derecha (RH) a izquierda (LH) o viceversa. Calcula automáticamente <code className="text-cyan-300 font-mono">X = 640 - X - Ancho</code>.
                </span>
              </label>
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCloneModal(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleClonePlan}
                disabled={cloning}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 rounded-lg text-xs font-black text-white flex items-center justify-center space-x-1.5 shadow-lg"
              >
                {cloning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Confirmar y Clonar Puntos</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GLOBAL CALIBRATION MATRIX */}
      {showMatrixModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-industrial-card border border-cyan-600 rounded-xl max-w-4xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-industrial-border pb-3">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-cyan-950 rounded-lg text-cyan-400">
                  <Grid className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white uppercase">Matriz de Control Global de Variantes — DL02</h3>
                  <span className="text-xs text-slate-400">Consolidado de Puntos Ópticos, QR de Cuna y Recetas de Soldadura</span>
                </div>
              </div>
              <button
                onClick={() => setShowMatrixModal(false)}
                className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 bg-slate-800 rounded"
              >
                Cerrar ✕
              </button>
            </div>

            {loadingMatrix ? (
              <div className="p-8 text-center text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-400" />
                <span>Cargando matriz de control...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-900 text-slate-400 uppercase font-mono text-[10px]">
                    <tr>
                      <th className="p-2.5">Modelo</th>
                      <th className="p-2.5">Mano</th>
                      <th className="p-2.5">Posición</th>
                      <th className="p-2.5">Patrón QR Cuna</th>
                      <th className="p-2.5 text-center">Pts Cuna</th>
                      <th className="p-2.5 text-center">Pts Panel</th>
                      <th className="p-2.5 text-center">Receta A/B</th>
                      <th className="p-2.5 text-center">Estado</th>
                      <th className="p-2.5 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {matrixData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="p-2.5 font-bold text-white">{row.modelo}</td>
                        <td className="p-2.5 font-bold text-cyan-400">{row.mano}</td>
                        <td className="p-2.5 font-bold text-purple-400">{row.posicion}</td>
                        <td className="p-2.5 text-slate-300">
                          {row.cradleQR ? (
                            <span className="text-emerald-400 font-bold">{row.cradleQR}</span>
                          ) : (
                            <span className="text-rose-400 italic">No asignado</span>
                          )}
                        </td>
                        <td className="p-2.5 text-center text-slate-300">{row.cradlePointsCount} pts</td>
                        <td className="p-2.5 text-center text-slate-300">{row.panelPointsCount} pts</td>
                        <td className="p-2.5 text-center text-amber-300">
                          {row.recipeA != null ? `${row.recipeA} / ${row.recipeB}` : '-'}
                        </td>
                        <td className="p-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                            row.status === 'COMPLETO'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-500'
                              : 'bg-amber-950 text-amber-300 border border-amber-500'
                          }`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="p-2.5 text-right">
                          <button
                            onClick={() => {
                              setSelectedModel(row.modelo);
                              setSelectedHand(row.mano);
                              setSelectedPos(row.posicion);
                              setShowMatrixModal(false);
                              showFeedback('info', `Cargando variante ${row.modelo} ${row.mano} ${row.posicion}`);
                            }}
                            className="px-2 py-1 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-[10px] font-sans font-bold transition"
                          >
                            Calibrar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: CREATE NEW RECIPE (CRADLE + PANEL) */}
      {showNewRecipeModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fade-in">
          <form onSubmit={handleCreateRecipe} className="bg-industrial-card border border-industrial-border rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 border-b border-industrial-border pb-3">
              <div className="p-2 bg-emerald-950 rounded-lg text-emerald-400">
                <Cpu className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-white uppercase">Nueva Receta de Soldadura</h3>
                <span className="text-xs text-slate-400 font-mono">Asociación Cuna Física &bull; Panel de Puerta</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-bold block mb-1">Cuna Física (Útil de Montaje):</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={newRecipeCradle}
                    onChange={e => setNewRecipeCradle(e.target.value.toUpperCase())}
                    placeholder="CUNA-01"
                    className="flex-1 bg-industrial-dark border border-industrial-border rounded-lg p-2 text-yellow-300 font-mono font-bold uppercase focus:border-blue-500 focus:outline-none"
                  />
                  <select
                    value={cradles.includes(newRecipeCradle) ? newRecipeCradle : ''}
                    onChange={e => { if (e.target.value) setNewRecipeCradle(e.target.value); }}
                    className="bg-industrial-dark border border-industrial-border rounded-lg px-2 text-slate-300 font-mono"
                  >
                    <option value="">Existentes...</option>
                    {cradles.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Modelo:</label>
                  <input
                    type="text"
                    required
                    value={newRecipeModel}
                    onChange={e => setNewRecipeModel(e.target.value.toUpperCase())}
                    className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2 text-white font-mono uppercase focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Mano:</label>
                  <select
                    value={newRecipeHand}
                    onChange={e => setNewRecipeHand(e.target.value as 'RH' | 'LH')}
                    className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2 text-cyan-400 font-mono font-bold focus:border-blue-500 focus:outline-none"
                  >
                    <option value="RH">RH (Der)</option>
                    <option value="LH">LH (Izq)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Posición:</label>
                  <select
                    value={newRecipePos}
                    onChange={e => setNewRecipePos(e.target.value as 'FRONT' | 'REAR')}
                    className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2 text-purple-400 font-mono font-bold focus:border-blue-500 focus:outline-none"
                  >
                    <option value="FRONT">FRONT</option>
                    <option value="REAR">REAR</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Receta A (PLC Tag):</label>
                  <input
                    type="number"
                    required
                    value={newRecipeA}
                    onChange={e => setNewRecipeA(parseInt(e.target.value) || 0)}
                    className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2 text-emerald-400 font-mono font-black focus:border-blue-500 focus:outline-none text-base"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Receta B (Robot Prog):</label>
                  <input
                    type="number"
                    required
                    value={newRecipeB}
                    onChange={e => setNewRecipeB(parseInt(e.target.value) || 0)}
                    className="w-full bg-industrial-dark border border-industrial-border rounded-lg p-2 text-emerald-400 font-mono font-black focus:border-blue-500 focus:outline-none text-base"
                  />
                </div>
              </div>

              <div className="p-2.5 bg-blue-950/40 border border-blue-900 rounded-lg text-[11px] text-slate-300">
                Esta receta se transmitirá al PLC cuando la cámara detecte la cuna <strong className="text-yellow-300">{newRecipeCradle}</strong> con la orden <strong className="text-white">{newRecipeModel} {newRecipeHand} {newRecipePos}</strong>.
              </div>
            </div>

            <div className="flex space-x-2 pt-2 border-t border-industrial-border">
              <button
                type="button"
                onClick={() => setShowNewRecipeModal(false)}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 rounded-lg text-xs font-black text-white flex items-center justify-center space-x-1.5 shadow-lg"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Crear Receta</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
