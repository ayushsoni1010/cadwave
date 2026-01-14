/**
 * 3DS Parser
 * Parses 3D Studio (.3ds) files using Three.js TDSLoader
 * Supports .3ds format (can be exported from 3ds Max)
 */

import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import type { CADAssembly, CADPart, CADGeometry, BoundingBox, BoundingSphere } from '../types';
import * as THREE from 'three';

/**
 * Parse 3DS file
 */
export async function parse3DS(
  buffer: ArrayBuffer,
  fileName: string,
  onProgress?: (progress: number, message: string) => void
): Promise<CADAssembly> {
  onProgress?.(0, 'Initializing 3DS parser...');
  
  // Create TDSLoader
  const loader = new TDSLoader();
  
  onProgress?.(10, 'Loading 3DS file...');
  
  // Load 3DS file using Three.js loader
  // TDSLoader expects a blob or URL, so we'll create a blob from ArrayBuffer
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  
  try {
    const object = await new Promise<THREE.Group>((resolve, reject) => {
      loader.load(
        url,
        (object) => resolve(object),
        (progress) => {
          if (progress.lengthComputable) {
            const percent = (progress.loaded / progress.total) * 80 + 10;
            onProgress?.(percent, `Loading 3DS: ${Math.round(percent)}%`);
          }
        },
        (error) => reject(error)
      );
    });
    
    // Clean up blob URL
    URL.revokeObjectURL(url);
    
    onProgress?.(90, 'Converting to CAD format...');
    
    // Convert Three.js object to CADAssembly
    return convertThreeObjectToAssembly(object, fileName, onProgress);
  } catch (error) {
    URL.revokeObjectURL(url);
    throw new Error(`Failed to parse 3DS file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Convert Three.js Group/Object3D to CADAssembly
 */
function convertThreeObjectToAssembly(
  object: THREE.Group | THREE.Object3D,
  fileName: string,
  onProgress?: (progress: number, message: string) => void
): CADAssembly {
  const assemblyId = crypto.randomUUID();
  const parts: CADPart[] = [];
  const geometries = new Map<string, CADGeometry>();
  let totalTriangles = 0;
  
  // Traverse all meshes in the object
  const meshes: THREE.Mesh[] = [];
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshes.push(child);
    }
  });
  
  onProgress?.(92, `Processing ${meshes.length} mesh(es)...`);
  
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    const geometry = mesh.geometry;
    
    if (!(geometry instanceof THREE.BufferGeometry)) {
      continue;
    }
    
    // Extract geometry data
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const uvs = geometry.attributes.uv;
    const index = geometry.index;
    
    if (!positions) {
      continue;
    }
    
    // Convert to our format
    const positionsArray = positions.array as Float32Array;
    const normalsArray = normals 
      ? (normals.array as Float32Array)
      : new Float32Array(positionsArray.length);
    const uvsArray = uvs 
      ? (uvs.array as Float32Array)
      : undefined;
    
    // Handle indices
    let indicesArray: Uint32Array;
    let triangleCount: number;
    
    if (index) {
      indicesArray = new Uint32Array(index.array);
      triangleCount = indicesArray.length / 3;
    } else {
      // No indices, create them
      const vertexCount = positionsArray.length / 3;
      indicesArray = new Uint32Array(vertexCount);
      for (let j = 0; j < vertexCount; j++) {
        indicesArray[j] = j;
      }
      triangleCount = vertexCount / 3;
    }
    
    // Compute normals if missing
    if (!normals) {
      computeNormals(positionsArray, indicesArray, normalsArray);
    }
    
    // Compute bounding box
    const boundingBox = computeBoundingBox(positionsArray);
    const boundingSphere = computeBoundingSphere(positionsArray, boundingBox);
    
    // Create geometry
    const geometryId = crypto.randomUUID();
    const cadGeometry: CADGeometry = {
      id: geometryId,
      positions: positionsArray,
      normals: normalsArray,
      indices: indicesArray,
      uvs: uvsArray,
      triangleCount,
      boundingSphere,
      hasBVH: false,
    };
    
    geometries.set(geometryId, cadGeometry);
    
    // Extract material color if available
    let partMetadata;
    if (mesh.material) {
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhongMaterial) {
        if (material.color) {
          partMetadata = {
            color: [material.color.r, material.color.g, material.color.b] as [number, number, number],
          };
        }
      }
    }
    
    // Get transform from mesh
    const matrix = new Float32Array(16);
    mesh.matrixWorld.toArray(matrix);
    
    // Create part
    const partId = crypto.randomUUID();
    const part: CADPart = {
      id: partId,
      name: mesh.name || `Part_${i + 1}`,
      parentId: null,
      transform: matrix,
      boundingBox,
      geometryId,
      visible: mesh.visible,
      selected: false,
      metadata: partMetadata,
    };
    
    parts.push(part);
    totalTriangles += triangleCount;
    
    const progress = 92 + (i / meshes.length) * 6;
    onProgress?.(progress, `Processed mesh ${i + 1} of ${meshes.length}...`);
  }
  
  onProgress?.(100, 'Complete');
  
  return {
    id: assemblyId,
    name: extractPartName(fileName),
    format: '3ds',
    parts,
    geometries,
    rootPartIds: parts.map(p => p.id),
    totalTriangles,
    fileSize: 0, // Will be set by caller
    loadedAt: Date.now(),
    metadata: {
      fileName,
      units: 'mm',
    },
  };
}

/**
 * Compute normals from positions and indices
 */
function computeNormals(
  positions: Float32Array,
  indices: Uint32Array,
  normals: Float32Array
): void {
  // Initialize normals to zero
  for (let i = 0; i < normals.length; i++) {
    normals[i] = 0;
  }
  
  // Compute face normals and accumulate
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;
    
    const v1 = [
      positions[i1] - positions[i0],
      positions[i1 + 1] - positions[i0 + 1],
      positions[i1 + 2] - positions[i0 + 2],
    ];
    const v2 = [
      positions[i2] - positions[i0],
      positions[i2 + 1] - positions[i0 + 1],
      positions[i2 + 2] - positions[i0 + 2],
    ];
    
    const normal = crossProduct(v1, v2);
    normalize(normal);
    
    // Add to all three vertices
    normals[i0] += normal[0];
    normals[i0 + 1] += normal[1];
    normals[i0 + 2] += normal[2];
    
    normals[i1] += normal[0];
    normals[i1 + 1] += normal[1];
    normals[i1 + 2] += normal[2];
    
    normals[i2] += normal[0];
    normals[i2 + 1] += normal[1];
    normals[i2 + 2] += normal[2];
  }
  
  // Normalize all normals
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.sqrt(
      normals[i] * normals[i] +
      normals[i + 1] * normals[i + 1] +
      normals[i + 2] * normals[i + 2]
    );
    if (len > 0.0001) {
      normals[i] /= len;
      normals[i + 1] /= len;
      normals[i + 2] /= len;
    } else {
      normals[i] = 0;
      normals[i + 1] = 0;
      normals[i + 2] = 1;
    }
  }
}

/**
 * Cross product of two 3D vectors
 */
function crossProduct(a: number[], b: number[]): number[] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Normalize a 3D vector
 */
function normalize(v: number[]): void {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len > 0.0001) {
    v[0] /= len;
    v[1] /= len;
    v[2] /= len;
  }
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
 * Extract part name from file name
 */
function extractPartName(fileName: string): string {
  const lastSlash = Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\'));
  const name = lastSlash >= 0 ? fileName.slice(lastSlash + 1) : fileName;
  const lastDot = name.lastIndexOf('.');
  return lastDot >= 0 ? name.slice(0, lastDot) : name;
}
