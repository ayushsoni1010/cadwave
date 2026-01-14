/**
 * Core type definitions for the Manufacturing-Grade 3D CAD Viewer
 * These types define the contract between all system layers
 */

import type * as THREE from 'three';

// ============================================================================
// CAD DATA TYPES
// ============================================================================

/**
 * Supported CAD file formats
 */
export type CADFormat = 'step' | 'iges' | 'stl' | 'obj' | 'gltf' | 'unknown';

/**
 * A single part in a CAD assembly
 */
export interface CADPart {
  id: string;
  name: string;
  parentId: string | null;
  /** Transform relative to parent */
  transform: Float32Array; // 4x4 matrix
  /** Bounding box in local space */
  boundingBox: BoundingBox;
  /** Geometry data (may be shared via instanceId) */
  geometryId: string;
  /** If this part instances another, this is the source ID */
  instanceOfId?: string;
  /** Part metadata for ERP/MES integration */
  metadata?: PartMetadata;
  /** Visibility state */
  visible: boolean;
  /** Selection state */
  selected: boolean;
}

/**
 * Geometry data for a part
 */
export interface CADGeometry {
  id: string;
  /** Indexed buffer geometry data */
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** Optional UV coordinates */
  uvs?: Float32Array;
  /** Triangle count for LOD decisions */
  triangleCount: number;
  /** Bounding sphere for culling */
  boundingSphere: BoundingSphere;
  /** BVH has been computed */
  hasBVH: boolean;
}

/**
 * Complete CAD assembly
 */
export interface CADAssembly {
  id: string;
  name: string;
  format: CADFormat;
  /** Flat list of all parts */
  parts: CADPart[];
  /** Geometry lookup by ID */
  geometries: Map<string, CADGeometry>;
  /** Assembly hierarchy root IDs */
  rootPartIds: string[];
  /** Total triangle count */
  totalTriangles: number;
  /** File size in bytes */
  fileSize: number;
  /** Load timestamp */
  loadedAt: number;
  /** Assembly-level metadata */
  metadata?: AssemblyMetadata;
}

/**
 * Part metadata for ERP/MES integration
 */
export interface PartMetadata {
  /** Part number / SKU */
  partNumber?: string;
  /** Material specification */
  material?: string;
  /** Weight in kg */
  weight?: number;
  /** Manufacturer */
  manufacturer?: string;
  /** Custom properties */
  properties?: Record<string, string | number | boolean>;
  /** Color override [r, g, b] normalized */
  color?: [number, number, number];
}

/**
 * Assembly-level metadata
 */
export interface AssemblyMetadata {
  /** Original file name */
  fileName: string;
  /** Creation software */
  createdBy?: string;
  /** Version */
  version?: string;
  /** Units (mm, inch, m) */
  units?: 'mm' | 'inch' | 'm';
  /** Custom properties */
  properties?: Record<string, string | number | boolean>;
}

// ============================================================================
// GEOMETRY PRIMITIVES
// ============================================================================

export interface BoundingBox {
  min: [number, number, number];
  max: [number, number, number];
}

export interface BoundingSphere {
  center: [number, number, number];
  radius: number;
}

// ============================================================================
// VIEWER CONFIGURATION
// ============================================================================

/**
 * Performance quality preset
 */
export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';

/**
 * Camera control mode
 */
export type CameraMode = 'orbit' | 'pan' | 'zoom' | 'none';

/**
 * Viewer configuration
 */
export interface ViewerConfig {
  /** Target FPS (default: 60) */
  targetFPS: number;
  /** Minimum acceptable FPS before quality reduction (default: 45) */
  minFPS: number;
  /** Enable BVH acceleration (default: true) */
  enableBVH: boolean;
  /** Enable LOD system (default: true) */
  enableLOD: boolean;
  /** Enable frustum culling (default: true) */
  enableFrustumCulling: boolean;
  /** Enable GPU instancing (default: true) */
  enableInstancing: boolean;
  /** Enable shadows (default: false for performance) */
  enableShadows: boolean;
  /** Enable ambient occlusion (default: false) */
  enableAO: boolean;
  /** Enable anti-aliasing (default: true) */
  enableAA: boolean;
  /** Initial quality preset */
  qualityPreset: QualityPreset;
  /** Enable gesture control (default: false) */
  enableGestures: boolean;
  /** Gesture smoothing factor 0-1 (default: 0.8) */
  gestureSmoothingFactor: number;
  /** Camera inertia/damping factor 0-1 (default: 0.92) */
  cameraDamping: number;
  /** Maximum triangles before LOD kicks in */
  maxTrianglesBeforeLOD: number;
  /** Background color */
  backgroundColor: number;
  /** Grid visible */
  showGrid: boolean;
  /** Axes helper visible */
  showAxes: boolean;
}

/**
 * Default viewer configuration
 */
export const DEFAULT_VIEWER_CONFIG: ViewerConfig = {
  targetFPS: 60,
  minFPS: 45,
  enableBVH: true,
  enableLOD: true,
  enableFrustumCulling: true,
  enableInstancing: true,
  enableShadows: false,
  enableAO: false,
  enableAA: true,
  qualityPreset: 'high',
  enableGestures: false,
  gestureSmoothingFactor: 0.8,
  cameraDamping: 0.92,
  maxTrianglesBeforeLOD: 500000,
  backgroundColor: 0x1a1a1e,
  showGrid: true,
  showAxes: true,
};

// ============================================================================
// GESTURE TYPES
// ============================================================================

/**
 * Recognized gesture types
 */
export type GestureType = 
  | 'rotate'
  | 'pan'
  | 'zoom'
  | 'explode'
  | 'reset'
  | 'select'
  | 'isolate'
  | 'none';

/**
 * Hand landmark from MediaPipe
 */
export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

/**
 * Processed hand state
 */
export interface HandState {
  landmarks: HandLandmark[];
  handedness: 'left' | 'right';
  confidence: number;
}

/**
 * Gesture intent after processing
 */
export interface GestureIntent {
  type: GestureType;
  /** Normalized delta values */
  deltaX: number;
  deltaY: number;
  deltaZ: number;
  /** Scale factor for zoom/explode */
  scale: number;
  /** Confidence in this interpretation */
  confidence: number;
  /** Raw timestamp */
  timestamp: number;
}

/**
 * Gesture controller state
 */
export interface GestureControllerState {
  enabled: boolean;
  active: boolean;
  currentGesture: GestureType;
  lastIntent: GestureIntent | null;
  fps: number;
  cameraAvailable: boolean;
  error: string | null;
}

// ============================================================================
// CAMERA TYPES
// ============================================================================

/**
 * Camera state for serialization/restoration
 */
export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  fov: number;
  near: number;
  far: number;
  zoom: number;
}

/**
 * Camera controller input
 */
export interface CameraInput {
  mode: CameraMode;
  deltaX: number;
  deltaY: number;
  deltaZoom: number;
  /** Source of the input */
  source: 'mouse' | 'touch' | 'gesture' | 'keyboard';
}

// ============================================================================
// PERFORMANCE METRICS
// ============================================================================

/**
 * Frame timing metrics
 */
export interface FrameMetrics {
  /** Current FPS */
  fps: number;
  /** Frame time in ms */
  frameTime: number;
  /** Time spent in JavaScript */
  jsTime: number;
  /** Time spent rendering (GPU) */
  renderTime: number;
  /** Draw calls this frame */
  drawCalls: number;
  /** Triangles rendered this frame */
  triangles: number;
  /** Geometries in memory */
  geometries: number;
  /** Textures in memory */
  textures: number;
}

/**
 * Performance monitor state
 */
export interface PerformanceState {
  metrics: FrameMetrics;
  /** Current quality level */
  qualityLevel: QualityPreset;
  /** Is auto-quality active */
  autoQualityEnabled: boolean;
  /** Number of quality reductions made */
  qualityReductions: number;
}

// ============================================================================
// LOADING STATE
// ============================================================================

/**
 * File loading progress
 */
export interface LoadingProgress {
  stage: 'fetching' | 'parsing' | 'optimizing' | 'building' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  bytesLoaded?: number;
  bytesTotal?: number;
  partsLoaded?: number;
  partsTotal?: number;
}

// ============================================================================
// VIEWER STATE
// ============================================================================

/**
 * Complete viewer state
 */
export interface ViewerState {
  /** Current assembly */
  assembly: CADAssembly | null;
  /** Loading state */
  loading: LoadingProgress | null;
  /** Camera state */
  camera: CameraState;
  /** Selected part IDs */
  selectedParts: Set<string>;
  /** Hidden part IDs */
  hiddenParts: Set<string>;
  /** Isolated part IDs (show only these) */
  isolatedParts: Set<string> | null;
  /** Explode factor 0-1 */
  explodeFactor: number;
  /** Performance metrics */
  performance: PerformanceState;
  /** Gesture controller state */
  gestures: GestureControllerState;
  /** Current viewer config */
  config: ViewerConfig;
}

// ============================================================================
// EVENTS
// ============================================================================

/**
 * Viewer event types
 */
export type ViewerEventType =
  | 'assembly-loaded'
  | 'assembly-unloaded'
  | 'part-selected'
  | 'part-deselected'
  | 'part-hovered'
  | 'camera-changed'
  | 'explode-changed'
  | 'quality-changed'
  | 'gesture-started'
  | 'gesture-ended'
  | 'error';

export interface ViewerEvent {
  type: ViewerEventType;
  timestamp: number;
  data?: unknown;
}

// ============================================================================
// WORKER MESSAGES
// ============================================================================

/**
 * Message to CAD parser worker
 */
export interface ParserWorkerInput {
  type: 'parse';
  id: string;
  file: ArrayBuffer;
  fileName: string;
  format: CADFormat;
}

/**
 * Progress message from parser worker
 */
export interface ParserWorkerProgress {
  type: 'progress';
  id: string;
  progress: number;
  stage: string;
  message: string;
}

/**
 * Result message from parser worker
 */
export interface ParserWorkerResult {
  type: 'result';
  id: string;
  assembly: CADAssembly;
}

/**
 * Error message from parser worker
 */
export interface ParserWorkerError {
  type: 'error';
  id: string;
  error: string;
}

export type ParserWorkerOutput = ParserWorkerProgress | ParserWorkerResult | ParserWorkerError;

// ============================================================================
// THREE.JS EXTENSIONS
// ============================================================================

/**
 * Extended BufferGeometry with BVH
 * Note: boundsTree property is provided by three-mesh-bvh type extensions
 */
export type BVHBufferGeometry = THREE.BufferGeometry & {
  boundsTree?: any; // MeshBVH type from three-mesh-bvh
}

/**
 * Part mesh with metadata
 */
export interface PartMesh extends THREE.Mesh {
  userData: {
    partId: string;
    partName: string;
    originalPosition: THREE.Vector3;
    explodeDirection: THREE.Vector3;
  };
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Disposable resource interface
 */
export interface Disposable {
  dispose(): void;
}

/**
 * Deep partial type
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
