/**
 * CAD Loader
 * Main entry point for loading CAD files
 * Handles format detection, parsing, caching, and progress reporting
 */

import type { CADAssembly, CADFormat, LoadingProgress } from '../types';
import { detectFormat, isFormatSupported, getParserRecommendation } from './format-detector';
import { parseSTL } from './stl-parser';
import { parseOBJ } from './obj-parser';
import { parseSTEP } from './step-parser';
import { parse3DS } from './tds-parser';
import { parseMTL, type MTLFile } from './mtl-parser';
import { getGeometryCache } from './geometry-cache';
import { FILE_LIMITS } from '../constants';

export type ProgressCallback = (progress: LoadingProgress) => void;

// Cache for MTL files (keyed by base filename without extension)
const mtlCache = new Map<string, MTLFile>();

/**
 * Load a CAD file from a File object
 */
export async function loadCADFile(
  file: File,
  onProgress?: ProgressCallback
): Promise<CADAssembly> {
  // Validate file size
  if (file.size > FILE_LIMITS.MAX_SIZE) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    const maxMB = (FILE_LIMITS.MAX_SIZE / 1024 / 1024).toFixed(0);
    throw new Error(`File too large: ${sizeMB}MB (max ${maxMB}MB)`);
  }
  
  onProgress?.({
    stage: 'fetching',
    progress: 0,
    message: 'Reading file...',
    bytesLoaded: 0,
    bytesTotal: file.size,
  });
  
  // Read file as ArrayBuffer
  const buffer = await readFileAsArrayBuffer(file, (loaded) => {
    onProgress?.({
      stage: 'fetching',
      progress: (loaded / file.size) * 20,
      message: 'Reading file...',
      bytesLoaded: loaded,
      bytesTotal: file.size,
    });
  });
  
  return loadCADBuffer(buffer, file.name, onProgress);
}

/**
 * Load a CAD file from a URL
 */
export async function loadCADFromURL(
  url: string,
  onProgress?: ProgressCallback
): Promise<CADAssembly> {
  onProgress?.({
    stage: 'fetching',
    progress: 0,
    message: 'Fetching file...',
  });
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
  }
  
  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength) : 0;
  
  // Validate file size if known
  if (total > FILE_LIMITS.MAX_SIZE) {
    const sizeMB = (total / 1024 / 1024).toFixed(1);
    const maxMB = (FILE_LIMITS.MAX_SIZE / 1024 / 1024).toFixed(0);
    throw new Error(`File too large: ${sizeMB}MB (max ${maxMB}MB)`);
  }
  
  // Read with progress
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('ReadableStream not supported');
  }
  
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    chunks.push(value);
    loaded += value.length;
    
    onProgress?.({
      stage: 'fetching',
      progress: total > 0 ? (loaded / total) * 20 : 10,
      message: 'Fetching file...',
      bytesLoaded: loaded,
      bytesTotal: total || undefined,
    });
  }
  
  // Combine chunks
  const buffer = new ArrayBuffer(loaded);
  const view = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    view.set(chunk, offset);
    offset += chunk.length;
  }
  
  // Extract filename from URL
  const fileName = url.split('/').pop()?.split('?')[0] || 'model';
  
  return loadCADBuffer(buffer, fileName, onProgress);
}

/**
 * Load a CAD file from an ArrayBuffer
 */
export async function loadCADBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  onProgress?: ProgressCallback
): Promise<CADAssembly> {
  // Check cache
  const cache = getGeometryCache();
  const hash = await cache.hashFile(buffer);
  
  onProgress?.({
    stage: 'parsing',
    progress: 20,
    message: 'Checking cache...',
  });
  
  const cached = await cache.get(hash);
  if (cached) {
    onProgress?.({
      stage: 'complete',
      progress: 100,
      message: 'Loaded from cache',
    });
    return cached;
  }
  
  // Detect format
  const format = detectFormat(fileName, buffer);
  
  // Handle MTL files specially - parse and cache them
  if (format === 'mtl') {
    onProgress?.({
      stage: 'parsing',
      progress: 50,
      message: 'Parsing MTL file...',
    });
    
    const mtlFile = parseMTL(buffer, fileName);
    const baseName = getBaseFileName(fileName);
    mtlCache.set(baseName, mtlFile);
    
    onProgress?.({
      stage: 'complete',
      progress: 100,
      message: 'MTL file loaded and cached',
    });
    
    // For MTL files, we cache them but don't return a renderable assembly
    // Return a minimal assembly indicating MTL was loaded successfully
    // The actual OBJ file should be loaded next to use the materials
    const assembly: CADAssembly = {
      id: crypto.randomUUID(),
      name: baseName,
      format: 'obj', // Use 'obj' since MTL is part of OBJ workflow
      parts: [],
      geometries: new Map(),
      rootPartIds: [],
      totalTriangles: 0,
      fileSize: buffer.byteLength,
      loadedAt: Date.now(),
      metadata: {
        fileName,
        properties: {
          isMTLFile: true,
          materialCount: mtlFile.materials.size,
        },
      },
    };
    
    return assembly;
  }
  
  if (!isFormatSupported(format)) {
    const recommendation = getParserRecommendation(format, fileName);
    throw new Error(
      `Format not supported: ${format}. ${recommendation || ''}`
    );
  }
  
  onProgress?.({
    stage: 'parsing',
    progress: 25,
    message: `Parsing ${format.toUpperCase()} file...`,
  });
  
  // For OBJ files, try to find cached MTL file
  let mtlFile: MTLFile | null = null;
  if (format === 'obj') {
    const baseName = getBaseFileName(fileName);
    if (mtlCache.has(baseName)) {
      mtlFile = mtlCache.get(baseName)!;
      onProgress?.({
        stage: 'parsing',
        progress: 26,
        message: 'Found and applying MTL materials...',
      });
    }
  }
  
  // Parse based on format
  const assembly = await parseByFormat(buffer, fileName, format, (p, msg) => {
    onProgress?.({
      stage: 'parsing',
      progress: 25 + p * 0.5, // 25-75%
      message: msg,
    });
  }, mtlFile);
  
  onProgress?.({
    stage: 'optimizing',
    progress: 80,
    message: 'Optimizing geometry...',
  });
  
  // Store in cache
  await cache.set(hash, assembly);
  
  onProgress?.({
    stage: 'complete',
    progress: 100,
    message: 'Ready',
  });
  
  return assembly;
}

/**
 * Parse file based on detected format
 */
async function parseByFormat(
  buffer: ArrayBuffer,
  fileName: string,
  format: CADFormat,
  onProgress: (progress: number, message: string) => void,
  mtlFile?: MTLFile | null
): Promise<CADAssembly> {
  switch (format) {
    case 'stl':
      return parseSTL(buffer, fileName, onProgress);
    case 'obj':
      return parseOBJ(buffer, fileName, onProgress, mtlFile);
    case 'step':
      return parseSTEP(buffer, fileName, onProgress);
    case '3ds':
      return parse3DS(buffer, fileName, onProgress);
    case 'mtl':
      throw new Error('MTL files must be loaded with their associated OBJ file. Please load the .obj file instead.');
    case 'gltf':
      // GLTF loading will be handled by Three.js GLTFLoader
      // For now, throw an error - we'll integrate later
      throw new Error('GLTF support requires Three.js GLTFLoader');
    default:
      throw new Error(`Parser not implemented for format: ${format}`);
  }
}

/**
 * Read file as ArrayBuffer with progress
 */
function readFileAsArrayBuffer(
  file: File,
  onProgress?: (loaded: number) => void
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file as ArrayBuffer'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('File read error'));
    };
    
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(event.loaded);
      }
    };
    
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Get base filename without extension
 */
function getBaseFileName(fileName: string): string {
  const lastSlash = Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\'));
  const name = lastSlash >= 0 ? fileName.slice(lastSlash + 1) : fileName;
  const lastDot = name.lastIndexOf('.');
  return lastDot >= 0 ? name.slice(0, lastDot) : name;
}

/**
 * Load multiple CAD files (e.g., OBJ + MTL)
 * This is useful when loading OBJ files with associated MTL files
 */
export async function loadCADFiles(
  files: File[],
  onProgress?: ProgressCallback
): Promise<CADAssembly> {
  if (files.length === 0) {
    throw new Error('No files provided');
  }
  
  // Sort files: MTL files first, then other files
  const sortedFiles = [...files].sort((a, b) => {
    const aExt = a.name.split('.').pop()?.toLowerCase();
    const bExt = b.name.split('.').pop()?.toLowerCase();
    if (aExt === 'mtl' && bExt !== 'mtl') return -1;
    if (aExt !== 'mtl' && bExt === 'mtl') return 1;
    return 0;
  });
  
  // Load MTL files first
  for (const file of sortedFiles) {
    const format = detectFormat(file.name, await file.arrayBuffer());
    if (format === 'mtl') {
      await loadCADFile(file, onProgress);
    }
  }
  
  // Find the main CAD file (non-MTL)
  const mainFile = sortedFiles.find(file => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    return ext !== 'mtl';
  });
  
  if (!mainFile) {
    throw new Error('No valid CAD file found (only MTL files provided)');
  }
  
  // Load the main file (which will now find the cached MTL files)
  return loadCADFile(mainFile, onProgress);
}

/**
 * Get statistics about a loaded assembly
 */
export function getAssemblyStats(assembly: CADAssembly): {
  partCount: number;
  triangleCount: number;
  vertexCount: number;
  fileSize: string;
  format: string;
} {
  let vertexCount = 0;
  for (const geom of assembly.geometries.values()) {
    vertexCount += geom.positions.length / 3;
  }
  
  return {
    partCount: assembly.parts.length,
    triangleCount: assembly.totalTriangles,
    vertexCount,
    fileSize: formatBytes(assembly.fileSize),
    format: assembly.format.toUpperCase(),
  };
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
