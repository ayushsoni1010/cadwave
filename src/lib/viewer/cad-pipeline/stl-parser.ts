/**
 * STL Parser
 * High-performance STL file parser supporting both ASCII and binary formats
 */

import type { CADAssembly, CADPart, CADGeometry, BoundingBox, BoundingSphere } from '../types';

interface STLParseResult {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
}

/**
 * Parse STL file (auto-detects ASCII vs binary)
 */
export function parseSTL(
  buffer: ArrayBuffer,
  fileName: string,
  onProgress?: (progress: number, message: string) => void
): CADAssembly {
  onProgress?.(0, 'Detecting STL format...');
  
  const isBinary = isSTLBinary(buffer);
  
  onProgress?.(5, isBinary ? 'Parsing binary STL...' : 'Parsing ASCII STL...');
  
  const result = isBinary 
    ? parseSTLBinary(buffer, onProgress) 
    : parseSTLAscii(buffer, onProgress);
  
  onProgress?.(80, 'Building geometry...');
  
  const boundingBox = computeBoundingBox(result.positions);
  const boundingSphere = computeBoundingSphere(result.positions, boundingBox);
  
  const geometryId = crypto.randomUUID();
  const partId = crypto.randomUUID();
  const assemblyId = crypto.randomUUID();
  
  const geometry: CADGeometry = {
    id: geometryId,
    positions: result.positions,
    normals: result.normals,
    indices: result.indices,
    triangleCount: result.triangleCount,
    boundingSphere,
    hasBVH: false,
  };
  
  const part: CADPart = {
    id: partId,
    name: extractPartName(fileName),
    parentId: null,
    transform: createIdentityMatrix(),
    boundingBox,
    geometryId,
    visible: true,
    selected: false,
  };
  
  onProgress?.(100, 'Complete');
  
  return {
    id: assemblyId,
    name: extractPartName(fileName),
    format: 'stl',
    parts: [part],
    geometries: new Map([[geometryId, geometry]]),
    rootPartIds: [partId],
    totalTriangles: result.triangleCount,
    fileSize: buffer.byteLength,
    loadedAt: Date.now(),
    metadata: {
      fileName,
      units: 'mm',
    },
  };
}

/**
 * Check if STL is binary format
 */
function isSTLBinary(buffer: ArrayBuffer): boolean {
  // Binary STL starts with 80-byte header, then 4-byte triangle count
  if (buffer.byteLength < 84) {
    return false;
  }
  
  // Check if first bytes look like ASCII "solid"
  const header = new Uint8Array(buffer, 0, 6);
  const headerStr = String.fromCharCode(...header).toLowerCase();
  
  if (headerStr === 'solid ') {
    // Could be ASCII, but verify by checking file size
    const view = new DataView(buffer);
    const triangleCount = view.getUint32(80, true);
    const expectedBinarySize = 84 + triangleCount * 50;
    
    // If file size matches binary format, it's probably binary
    // even if it starts with "solid"
    if (Math.abs(buffer.byteLength - expectedBinarySize) < 10) {
      return true;
    }
    return false;
  }
  
  return true;
}

/**
 * Parse binary STL
 */
function parseSTLBinary(
  buffer: ArrayBuffer,
  onProgress?: (progress: number, message: string) => void
): STLParseResult {
  const view = new DataView(buffer);
  const triangleCount = view.getUint32(80, true);
  
  const positions = new Float32Array(triangleCount * 9);
  const normals = new Float32Array(triangleCount * 9);
  const indices = new Uint32Array(triangleCount * 3);
  
  let offset = 84;
  const progressInterval = Math.floor(triangleCount / 20);
  
  for (let i = 0; i < triangleCount; i++) {
    // Normal (3 floats)
    const nx = view.getFloat32(offset, true);
    const ny = view.getFloat32(offset + 4, true);
    const nz = view.getFloat32(offset + 8, true);
    offset += 12;
    
    // Vertex 1
    positions[i * 9] = view.getFloat32(offset, true);
    positions[i * 9 + 1] = view.getFloat32(offset + 4, true);
    positions[i * 9 + 2] = view.getFloat32(offset + 8, true);
    offset += 12;
    
    // Vertex 2
    positions[i * 9 + 3] = view.getFloat32(offset, true);
    positions[i * 9 + 4] = view.getFloat32(offset + 4, true);
    positions[i * 9 + 5] = view.getFloat32(offset + 8, true);
    offset += 12;
    
    // Vertex 3
    positions[i * 9 + 6] = view.getFloat32(offset, true);
    positions[i * 9 + 7] = view.getFloat32(offset + 4, true);
    positions[i * 9 + 8] = view.getFloat32(offset + 8, true);
    offset += 12;
    
    // Store normal for all three vertices
    normals[i * 9] = nx;
    normals[i * 9 + 1] = ny;
    normals[i * 9 + 2] = nz;
    normals[i * 9 + 3] = nx;
    normals[i * 9 + 4] = ny;
    normals[i * 9 + 5] = nz;
    normals[i * 9 + 6] = nx;
    normals[i * 9 + 7] = ny;
    normals[i * 9 + 8] = nz;
    
    // Indices
    indices[i * 3] = i * 3;
    indices[i * 3 + 1] = i * 3 + 1;
    indices[i * 3 + 2] = i * 3 + 2;
    
    // Skip attribute byte count
    offset += 2;
    
    // Report progress
    if (progressInterval > 0 && i % progressInterval === 0) {
      const progress = 5 + (i / triangleCount) * 70;
      onProgress?.(progress, `Parsing triangle ${i} of ${triangleCount}...`);
    }
  }
  
  return { positions, normals, indices, triangleCount };
}

/**
 * Parse ASCII STL
 */
function parseSTLAscii(
  buffer: ArrayBuffer,
  onProgress?: (progress: number, message: string) => void
): STLParseResult {
  const text = new TextDecoder().decode(buffer);
  const lines = text.split('\n');
  
  // Pre-count triangles for array allocation
  let triangleCount = 0;
  for (const line of lines) {
    if (line.trim().startsWith('facet normal')) {
      triangleCount++;
    }
  }
  
  const positions = new Float32Array(triangleCount * 9);
  const normals = new Float32Array(triangleCount * 9);
  const indices = new Uint32Array(triangleCount * 3);
  
  let triIndex = 0;
  let vertIndex = 0;
  let currentNormal = [0, 0, 1];
  
  const progressInterval = Math.floor(lines.length / 20);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.startsWith('facet normal')) {
      const parts = line.split(/\s+/);
      currentNormal = [
        parseFloat(parts[2]) || 0,
        parseFloat(parts[3]) || 0,
        parseFloat(parts[4]) || 0,
      ];
    } else if (line.startsWith('vertex')) {
      const parts = line.split(/\s+/);
      positions[vertIndex] = parseFloat(parts[1]) || 0;
      positions[vertIndex + 1] = parseFloat(parts[2]) || 0;
      positions[vertIndex + 2] = parseFloat(parts[3]) || 0;
      
      normals[vertIndex] = currentNormal[0];
      normals[vertIndex + 1] = currentNormal[1];
      normals[vertIndex + 2] = currentNormal[2];
      
      vertIndex += 3;
    } else if (line.startsWith('endfacet')) {
      indices[triIndex * 3] = triIndex * 3;
      indices[triIndex * 3 + 1] = triIndex * 3 + 1;
      indices[triIndex * 3 + 2] = triIndex * 3 + 2;
      triIndex++;
    }
    
    if (progressInterval > 0 && i % progressInterval === 0) {
      const progress = 5 + (i / lines.length) * 70;
      onProgress?.(progress, `Parsing line ${i} of ${lines.length}...`);
    }
  }
  
  return { positions, normals, indices, triangleCount };
}

/**
 * Compute bounding box from positions
 */
function computeBoundingBox(positions: Float32Array): BoundingBox {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  
  for (let i = 0; i < positions.length; i += 3) {
    min[0] = Math.min(min[0], positions[i]);
    min[1] = Math.min(min[1], positions[i + 1]);
    min[2] = Math.min(min[2], positions[i + 2]);
    max[0] = Math.max(max[0], positions[i]);
    max[1] = Math.max(max[1], positions[i + 1]);
    max[2] = Math.max(max[2], positions[i + 2]);
  }
  
  return { min, max };
}

/**
 * Compute bounding sphere from positions and bounding box
 */
function computeBoundingSphere(positions: Float32Array, bbox: BoundingBox): BoundingSphere {
  const center: [number, number, number] = [
    (bbox.min[0] + bbox.max[0]) / 2,
    (bbox.min[1] + bbox.max[1]) / 2,
    (bbox.min[2] + bbox.max[2]) / 2,
  ];
  
  let maxDistSq = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const dx = positions[i] - center[0];
    const dy = positions[i + 1] - center[1];
    const dz = positions[i + 2] - center[2];
    maxDistSq = Math.max(maxDistSq, dx * dx + dy * dy + dz * dz);
  }
  
  return { center, radius: Math.sqrt(maxDistSq) };
}

/**
 * Create identity 4x4 matrix
 */
function createIdentityMatrix(): Float32Array {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

/**
 * Extract part name from file name
 */
function extractPartName(fileName: string): string {
  const lastSlash = Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\'));
  const name = lastSlash >= 0 ? fileName.slice(lastSlash + 1) : fileName;
  const lastDot = name.lastIndexOf('.');
  return lastDot >= 0 ? name.slice(0, lastDot) : name;
}
