'use client';

import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { 
  SceneManager, 
  loadCADFile,
  loadCADFiles,
  FrameMonitor, 
  GestureController,
  DEFAULT_VIEWER_CONFIG,
  SHORTCUTS,
} from '@/lib/viewer';
import type { 
  CADAssembly, 
  ViewerConfig, 
  LoadingProgress, 
  FrameMetrics,
  QualityPreset,
  GestureControllerState,
} from '@/lib/viewer/types';
import { Toolbar } from './toolbar';
import { PartTree } from './part-tree';
import { MetadataPanel } from './metadata-panel';
import { LoadingOverlay } from './loading-overlay';
import { EmptyState } from './empty-state';
import { StatusBar } from './status-bar';
import { CameraFeed } from './camera-feed';
import { GestureGuide } from './gesture-guide';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface ViewerShellProps {
  initialConfig?: Partial<ViewerConfig>;
}

export function ViewerShell({ initialConfig = {} }: ViewerShellProps) {
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const frameMonitorRef = useRef<FrameMonitor | null>(null);
  const gestureControllerRef = useRef<GestureController | null>(null);
  
  // Config
  const [config] = useState<ViewerConfig>(() => ({
    ...DEFAULT_VIEWER_CONFIG,
    ...initialConfig,
  }));
  
  // State
  const [assembly, setAssembly] = useState<CADAssembly | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgress | null>(null);
  const [selectedParts, setSelectedParts] = useState<Set<string>>(new Set());
  const [hiddenParts, setHiddenParts] = useState<Set<string>>(new Set());
  const [explodeFactor, setExplodeFactor] = useState(0);
  const [showGrid, setShowGrid] = useState(config.showGrid);
  const [showAxes, setShowAxes] = useState(config.showAxes);
  const [metrics, setMetrics] = useState<FrameMetrics | null>(null);
  const [quality, setQuality] = useState<QualityPreset>(config.qualityPreset);
  const [gesturesEnabled, setGesturesEnabled] = useState(false);
  const [gesturesAvailable, setGesturesAvailable] = useState(false);
  const [gestureState, setGestureState] = useState<GestureControllerState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [gestureGuideOpen, setGestureGuideOpen] = useState(false);
  const [cameraFeedVisible, setCameraFeedVisible] = useState(false);
  
  // Initialize scene manager
  useEffect(() => {
    if (!containerRef.current) return;
    
    const sceneManager = new SceneManager(
      containerRef.current,
      config,
      {
        onPartHover: (partId) => {
          // Optional: highlight part on hover
        },
        onPartSelect: (partId, additive) => {
          handlePartSelect(partId, additive);
        },
        onCameraChange: () => {
          // Optional: camera change callback
        },
      }
    );
    
    sceneManagerRef.current = sceneManager;
    
    // Initialize frame monitor
    const frameMonitor = new FrameMonitor({
      autoQuality: true,
      onQualityChange: (newQuality, reason) => {
        setQuality(newQuality);
        toast.info(`Quality adjusted to ${newQuality}: ${reason}`);
      },
    });
    frameMonitorRef.current = frameMonitor;
    
    // Update metrics periodically
    const metricsInterval = setInterval(() => {
      if (frameMonitorRef.current) {
        setMetrics({ ...frameMonitorRef.current.getMetrics() });
      }
    }, 500);
    
    // Check for camera availability
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const hasCamera = devices.some(d => d.kind === 'videoinput');
        setGesturesAvailable(hasCamera);
      });
    }
    
    return () => {
      clearInterval(metricsInterval);
      sceneManager.dispose();
      gestureControllerRef.current?.dispose();
    };
  }, [config]);
  
  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && sceneManagerRef.current) {
        sceneManagerRef.current.resize(
          containerRef.current.clientWidth,
          containerRef.current.clientHeight
        );
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      switch (e.key.toLowerCase()) {
        case SHORTCUTS.RESET_VIEW:
          handleResetView();
          break;
        case SHORTCUTS.TOGGLE_GRID:
          handleToggleGrid();
          break;
        case SHORTCUTS.TOGGLE_AXES:
          handleToggleAxes();
          break;
        case SHORTCUTS.FIT_SELECTION:
          handleFitToView();
          break;
        case SHORTCUTS.TOGGLE_GESTURES:
          if (gesturesAvailable) {
            handleToggleGestures();
          }
          break;
        case SHORTCUTS.EXPLODE_MORE:
          setExplodeFactor(f => Math.min(1, f + 0.1));
          break;
        case SHORTCUTS.EXPLODE_LESS:
          setExplodeFactor(f => Math.max(0, f - 0.1));
          break;
        case 'escape':
          setSelectedParts(new Set());
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gesturesAvailable]);
  
  // Update explode factor in scene
  useEffect(() => {
    sceneManagerRef.current?.setExplodeFactor(explodeFactor);
  }, [explodeFactor]);
  
  // Handle file loading (single or multiple files)
  const handleLoadFile = useCallback(async (fileOrFiles: File | File[]) => {
    setLoadingProgress({ stage: 'fetching', progress: 0, message: 'Starting...' });
    
    try {
      const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
      
      // Check if we have MTL-only files
      const allMTL = files.every(f => {
        const ext = f.name.split('.').pop()?.toLowerCase();
        return ext === 'mtl';
      });
      
      if (allMTL && files.length > 0) {
        // Load MTL file(s) - they'll be cached for later use with OBJ
        for (const file of files) {
          await loadCADFile(file, (progress) => {
            setLoadingProgress(progress);
          });
        }
        toast.success('MTL file(s) loaded', {
          description: 'Materials cached. Load the associated .obj file to apply them.',
        });
        setTimeout(() => setLoadingProgress(null), 1000);
        return;
      }
      
      // Load CAD file(s)
      const loadedAssembly = files.length > 1
        ? await loadCADFiles(files, (progress) => {
            setLoadingProgress(progress);
          })
        : await loadCADFile(files[0], (progress) => {
            setLoadingProgress(progress);
          });
      
      // Check if this was just an MTL file (returns minimal assembly with no parts)
      if (loadedAssembly.format === 'obj' && loadedAssembly.parts.length === 0 && 
          loadedAssembly.metadata?.properties?.isMTLFile) {
        toast.success('MTL file loaded and cached', {
          description: 'Load the associated .obj file to apply materials.',
        });
        setTimeout(() => setLoadingProgress(null), 1000);
        return;
      }
      
      setAssembly(loadedAssembly);
      sceneManagerRef.current?.loadAssembly(loadedAssembly);
      setSelectedParts(new Set());
      setHiddenParts(new Set());
      setExplodeFactor(0);
      
      toast.success(`Loaded ${loadedAssembly.name}`, {
        description: `${loadedAssembly.parts.length} parts, ${formatNumber(loadedAssembly.totalTriangles)} triangles`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load file';
      setLoadingProgress({ stage: 'error', progress: 0, message });
      toast.error('Failed to load file', { description: message });
    } finally {
      setTimeout(() => setLoadingProgress(null), 1000);
    }
  }, []);
  
  // Handle file input
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files);
      handleLoadFile(fileArray.length > 1 ? fileArray : fileArray[0]);
    }
    e.target.value = ''; // Reset input
  }, [handleLoadFile]);
  
  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleLoadFile(files.length > 1 ? files : files[0]);
    }
  }, [handleLoadFile]);
  
  // Part selection
  const handlePartSelect = useCallback((partId: string, additive: boolean) => {
    setSelectedParts(prev => {
      const next = new Set(additive ? prev : []);
      if (next.has(partId)) {
        next.delete(partId);
      } else {
        next.add(partId);
      }
      return next;
    });
    
    // Update visual state in scene
    sceneManagerRef.current?.setPartSelected(partId, true);
  }, []);
  
  // Part visibility
  const handleToggleVisibility = useCallback((partId: string) => {
    setHiddenParts(prev => {
      const next = new Set(prev);
      const isHidden = next.has(partId);
      if (isHidden) {
        next.delete(partId);
      } else {
        next.add(partId);
      }
      sceneManagerRef.current?.setPartVisible(partId, isHidden);
      return next;
    });
  }, []);
  
  // View controls
  const handleResetView = useCallback(() => {
    sceneManagerRef.current?.resetCamera();
  }, []);
  
  const handleFitToView = useCallback(() => {
    sceneManagerRef.current?.fitToAssembly();
  }, []);
  
  const handleToggleGrid = useCallback(() => {
    setShowGrid(prev => {
      sceneManagerRef.current?.setGridVisible(!prev);
      return !prev;
    });
  }, []);
  
  const handleToggleAxes = useCallback(() => {
    setShowAxes(prev => {
      sceneManagerRef.current?.setAxesVisible(!prev);
      return !prev;
    });
  }, []);
  
  // Gesture controls
  const handleToggleGestures = useCallback(async () => {
    if (gesturesEnabled) {
      // Disable gestures
      gestureControllerRef.current?.stop();
      setGesturesEnabled(false);
      setCameraFeedVisible(false);
      toast.info('Gesture control disabled');
    } else {
      // Enable gestures
      try {
        if (!gestureControllerRef.current) {
          const controller = new GestureController({
            onGestureStart: (gesture) => {
              // Handle gesture start
            },
            onGestureEnd: () => {
              // Handle gesture end
            },
            onCameraInput: (input) => {
              sceneManagerRef.current?.getCameraController().applyInput(input);
            },
            onSelectGesture: () => {
              // Handle select gesture - could trigger part selection via raycast
              toast.info('Select gesture detected', {
                description: 'Point at a part to select it',
              });
            },
            onIsolateGesture: () => {
              // Handle isolate gesture
              if (selectedParts.size > 0) {
                // Isolate selected parts
                toast.success('Isolating selected parts');
              } else {
                toast.info('Select parts first, then use isolate gesture');
              }
            },
            onError: (error) => {
              toast.error('Gesture error', { description: error });
            },
            onStateChange: (state) => {
              setGestureState(state);
            },
          });
          
          await controller.initialize();
          
          // Set video element reference
          if (videoRef.current && controller.getState().cameraAvailable) {
            const video = controller.getVideoElement();
            if (video && videoRef.current) {
              videoRef.current.srcObject = video.srcObject;
            }
          }
          
          gestureControllerRef.current = controller;
        }
        
        gestureControllerRef.current.start();
        setGesturesEnabled(true);
        setCameraFeedVisible(true);
        toast.success('Gesture control enabled', {
          description: 'Use hand gestures to navigate the model',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to enable gestures';
        toast.error('Failed to enable gestures', { description: message });
      }
    }
  }, [gesturesEnabled]);
  
  const handleOpenFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  
  const handleShowInfo = useCallback(() => {
    setRightPanelOpen(true);
  }, []);
  
  return (
    <div 
      className="flex h-full flex-col bg-zinc-950"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".stl,.obj,.gltf,.glb,.step,.stp,.iges,.igs,.3ds,.max,.mtl"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />
      
      {/* Toolbar */}
      <Toolbar
        onOpenFile={handleOpenFile}
        onResetView={handleResetView}
        onFitToView={handleFitToView}
        onToggleGrid={handleToggleGrid}
        onToggleAxes={handleToggleAxes}
        onToggleGestures={handleToggleGestures}
        onExplodeChange={setExplodeFactor}
        onShowInfo={handleShowInfo}
        onShowGestureGuide={() => setGestureGuideOpen(true)}
        showGrid={showGrid}
        showAxes={showAxes}
        gesturesEnabled={gesturesEnabled}
        gesturesAvailable={gesturesAvailable}
        explodeFactor={explodeFactor}
        hasModel={!!assembly}
        isLoading={!!loadingProgress && loadingProgress.stage !== 'complete' && loadingProgress.stage !== 'error'}
      />
      
      {/* Main Content */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Left Panel - Part Tree */}
        {assembly && (
          <div className={cn(
            'w-64 flex-shrink-0 border-r border-zinc-800/50 bg-zinc-950/50 transition-all duration-200',
            !leftPanelOpen && '-ml-64'
          )}>
            <div className="flex h-8 items-center border-b border-zinc-800/50 px-3">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Parts
              </span>
            </div>
            <div className="h-[calc(100%-2rem)]">
              <PartTree
                assembly={assembly}
                selectedParts={selectedParts}
                hiddenParts={hiddenParts}
                onSelectPart={handlePartSelect}
                onToggleVisibility={handleToggleVisibility}
                onHoverPart={() => {}}
              />
            </div>
          </div>
        )}
        
        {/* 3D Viewport */}
        <div className="relative flex-1">
          <div
            ref={containerRef}
            className="absolute inset-0"
          />
          
          {/* Empty State */}
          {!assembly && !loadingProgress && (
            <EmptyState onOpenFile={handleOpenFile} isDragging={isDragging} />
          )}
          
          {/* Loading Overlay */}
          <LoadingOverlay progress={loadingProgress} />
        </div>
        
        {/* Right Panel - Metadata */}
        {assembly && (
          <div className={cn(
            'w-64 flex-shrink-0 border-l border-zinc-800/50 bg-zinc-950/50 transition-all duration-200',
            !rightPanelOpen && '-mr-64'
          )}>
            <div className="flex h-8 items-center border-b border-zinc-800/50 px-3">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Info
              </span>
            </div>
            <div className="h-[calc(100%-2rem)]">
              <MetadataPanel
                assembly={assembly}
                selectedParts={selectedParts}
                metrics={metrics}
                quality={quality}
                gesturesEnabled={gesturesEnabled}
                gestureFps={gestureState?.fps ?? 0}
              />
            </div>
          </div>
        )}
      </div>
      
      {/* Status Bar */}
      <StatusBar
        metrics={metrics}
        quality={quality}
        triangleCount={assembly?.totalTriangles ?? 0}
        partCount={assembly?.parts.length ?? 0}
        selectedCount={selectedParts.size}
        gesturesEnabled={gesturesEnabled}
        gestureStatus={gestureState?.currentGesture ?? 'none'}
      />
      
      {/* Camera Feed */}
      <CameraFeed
        videoRef={videoRef}
        isActive={cameraFeedVisible && gesturesEnabled}
        onClose={() => setCameraFeedVisible(false)}
      />
      
      {/* Gesture Guide */}
      <GestureGuide
        isOpen={gestureGuideOpen}
        onOpenChange={setGestureGuideOpen}
      />
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return num.toString();
}
