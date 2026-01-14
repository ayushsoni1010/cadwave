/**
 * Constants for the Manufacturing-Grade 3D CAD Viewer
 * Centralized configuration - no magic numbers in the codebase
 */

// ============================================================================
// PERFORMANCE CONSTANTS
// ============================================================================

/** Target frame time in ms (60 FPS) */
export const TARGET_FRAME_TIME_MS = 16.67;

/** Minimum acceptable frame time (45 FPS) */
export const MIN_FRAME_TIME_MS = 22.22;

/** Frame budget allocation (ms) */
export const FRAME_BUDGET = {
  TOTAL: 16.67,
  JS_MAX: 8,
  RENDER_MAX: 8,
  GESTURE_MAX: 2,
} as const;

/** Quality reduction thresholds */
export const QUALITY_THRESHOLDS = {
  /** FPS below this triggers quality reduction */
  REDUCE_FPS: 45,
  /** FPS above this allows quality increase */
  INCREASE_FPS: 58,
  /** Consecutive bad frames before reduction */
  BAD_FRAME_COUNT: 30,
  /** Consecutive good frames before increase */
  GOOD_FRAME_COUNT: 120,
} as const;

/** LOD distance thresholds (relative to bounding sphere) */
export const LOD_DISTANCES = {
  HIGH: 2,
  MEDIUM: 5,
  LOW: 10,
  CULL: 20,
} as const;

/** Triangle count thresholds for LOD generation */
export const LOD_TRIANGLE_THRESHOLDS = {
  /** Always use full detail below this */
  FULL_DETAIL: 10000,
  /** Generate medium LOD above this */
  MEDIUM_LOD: 50000,
  /** Generate low LOD above this */
  LOW_LOD: 200000,
} as const;

// ============================================================================
// CAMERA CONSTANTS
// ============================================================================

/** Camera movement constants */
export const CAMERA = {
  /** Default field of view */
  DEFAULT_FOV: 45,
  /** Near clipping plane */
  NEAR: 0.1,
  /** Far clipping plane */
  FAR: 10000,
  /** Orbit rotation speed (radians per pixel) */
  ROTATE_SPEED: 0.005,
  /** Pan speed (world units per pixel) */
  PAN_SPEED: 0.01,
  /** Zoom speed (multiplier per scroll) */
  ZOOM_SPEED: 0.001,
  /** Minimum zoom distance */
  MIN_DISTANCE: 0.1,
  /** Maximum zoom distance */
  MAX_DISTANCE: 5000,
  /** Default damping factor */
  DAMPING: 0.92,
  /** Default up vector */
  UP: [0, 1, 0] as const,
} as const;

// ============================================================================
// GESTURE CONSTANTS
// ============================================================================

/** Gesture detection thresholds */
export const GESTURE = {
  /** Minimum confidence to accept gesture */
  MIN_CONFIDENCE: 0.7,
  /** EMA smoothing alpha (0-1, higher = less smoothing) */
  SMOOTHING_ALPHA: 0.2,
  /** Pinch distance threshold for zoom start */
  PINCH_THRESHOLD: 0.05,
  /** Spread threshold for explode gesture */
  SPREAD_THRESHOLD: 0.3,
  /** Minimum movement to register as intentional */
  DEADZONE: 0.02,
  /** Rate limit for gesture updates (ms) */
  UPDATE_INTERVAL_MS: 33, // ~30Hz
  /** Timeout for gesture inactivity (ms) */
  INACTIVE_TIMEOUT_MS: 1000,
} as const;

/** MediaPipe hand landmark indices */
export const HAND_LANDMARKS = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

// ============================================================================
// RENDERING CONSTANTS
// ============================================================================

/** Material defaults */
export const MATERIAL = {
  /** Default part color */
  DEFAULT_COLOR: 0x808080,
  /** Selected part color */
  SELECTED_COLOR: 0x4a9eff,
  /** Hovered part color */
  HOVERED_COLOR: 0x66b3ff,
  /** Default metalness */
  METALNESS: 0.1,
  /** Default roughness */
  ROUGHNESS: 0.7,
  /** Wireframe line width */
  WIREFRAME_WIDTH: 1,
} as const;

/** Scene setup */
export const SCENE = {
  /** Background color */
  BACKGROUND: 0x1a1a1e,
  /** Ambient light intensity */
  AMBIENT_INTENSITY: 0.4,
  /** Key light intensity */
  KEY_LIGHT_INTENSITY: 0.8,
  /** Fill light intensity */
  FILL_LIGHT_INTENSITY: 0.3,
  /** Key light position */
  KEY_LIGHT_POS: [10, 10, 10] as const,
  /** Fill light position */
  FILL_LIGHT_POS: [-5, 5, -10] as const,
  /** Grid size */
  GRID_SIZE: 100,
  /** Grid divisions */
  GRID_DIVISIONS: 100,
  /** Grid color 1 */
  GRID_COLOR_1: 0x2a2a2e,
  /** Grid color 2 */
  GRID_COLOR_2: 0x3a3a3e,
} as const;

// ============================================================================
// CACHE CONSTANTS
// ============================================================================

/** IndexedDB cache configuration */
export const CACHE = {
  /** Database name */
  DB_NAME: 'cad-viewer-cache',
  /** Store name for assemblies */
  ASSEMBLY_STORE: 'assemblies',
  /** Store name for geometries */
  GEOMETRY_STORE: 'geometries',
  /** Maximum cache size in bytes */
  MAX_SIZE_BYTES: 500 * 1024 * 1024, // 500MB
  /** Cache entry TTL in ms */
  TTL_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
  /** LRU memory cache size */
  LRU_SIZE: 10,
} as const;

// ============================================================================
// FILE CONSTANTS
// ============================================================================

/** File format detection */
export const FILE_SIGNATURES = {
  /** STL ASCII header */
  STL_ASCII: 'solid',
  /** OBJ comment/vertex prefix */
  OBJ_PREFIX: ['#', 'v', 'vn', 'vt', 'f', 'g', 'o', 'mtllib', 'usemtl'],
  /** GLTF JSON start */
  GLTF_JSON: '{"',
  /** GLB magic number */
  GLB_MAGIC: 0x46546C67,
} as const;

/** Maximum file sizes */
export const FILE_LIMITS = {
  /** Maximum file size to load (500MB) */
  MAX_SIZE: 500 * 1024 * 1024,
  /** Size threshold for progressive loading */
  PROGRESSIVE_THRESHOLD: 10 * 1024 * 1024,
  /** Chunk size for streaming (1MB) */
  CHUNK_SIZE: 1024 * 1024,
} as const;

// ============================================================================
// UI CONSTANTS
// ============================================================================

/** Animation timings (ms) */
export const ANIMATION = {
  /** Camera transition duration */
  CAMERA_TRANSITION: 300,
  /** Part highlight transition */
  HIGHLIGHT_TRANSITION: 150,
  /** Panel slide duration */
  PANEL_SLIDE: 200,
  /** Explode animation duration */
  EXPLODE_DURATION: 500,
} as const;

/** Z-index layers */
export const Z_INDEX = {
  CANVAS: 0,
  GRID: 1,
  OVERLAY: 10,
  TOOLBAR: 20,
  PANEL: 30,
  TOOLTIP: 40,
  MODAL: 50,
} as const;

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

export const SHORTCUTS = {
  /** Reset camera view */
  RESET_VIEW: 'r',
  /** Toggle grid */
  TOGGLE_GRID: 'g',
  /** Toggle axes */
  TOGGLE_AXES: 'a',
  /** Toggle wireframe */
  TOGGLE_WIREFRAME: 'w',
  /** Fit to selection */
  FIT_SELECTION: 'f',
  /** Toggle gesture mode */
  TOGGLE_GESTURES: 'h', // h for hands
  /** Increase explode */
  EXPLODE_MORE: ']',
  /** Decrease explode */
  EXPLODE_LESS: '[',
  /** Select all */
  SELECT_ALL: 'ctrl+a',
  /** Deselect all */
  DESELECT_ALL: 'escape',
  /** Hide selected */
  HIDE_SELECTED: 'h',
  /** Show all */
  SHOW_ALL: 'shift+h',
  /** Isolate selected */
  ISOLATE: 'i',
} as const;
