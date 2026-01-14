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
import { getGeometryCache } from './geometry-cache';
import { FILE_LIMITS } from '../constants';

export type ProgressCallback = (progress: LoadingProgress) => void;

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
  
  if (!isFormatSupported(format)) {
    const recommendation = getParserRecommendation(format);
    throw new Error(
      `Format not supported: ${format}. ${recommendation || ''}`
    );
  }
  
  onProgress?.({
    stage: 'parsing',
    progress: 25,
    message: `Parsing ${format.toUpperCase()} file...`,
  });
  
  // Parse based on format
  const assembly = await parseByFormat(buffer, fileName, format, (p, msg) => {
    onProgress?.({
      stage: 'parsing',
      progress: 25 + p * 0.5, // 25-75%
      message: msg,
    });
  });
  
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
  onProgress: (progress: number, message: string) => void
): Promise<CADAssembly> {
  switch (format) {
    case 'stl':
      return parseSTL(buffer, fileName, onProgress);
    case 'obj':
      return parseOBJ(buffer, fileName, onProgress);
    case 'step':
      return parseSTEP(buffer, fileName, onProgress);
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
