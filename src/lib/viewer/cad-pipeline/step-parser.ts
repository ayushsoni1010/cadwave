/**
 * STEP Parser
 * Parses STEP (ISO 10303-21) files using occt-import-js
 * Converts STEP geometry to triangle meshes for rendering
 */

import type { CADAssembly, CADPart, CADGeometry, BoundingBox, BoundingSphere } from '../types';

// Dynamic import to avoid loading occt-import-js in the main bundle
let occtModule: any = null;
let occtPromise: Promise<any> | null = null;

/**
 * Initialize occt-import-js (lazy loading)
 */
async function initOCCT(): Promise<any> {
  if (occtModule) {
    return occtModule;
  }
  
  if (occtPromise) {
    return occtPromise;
  }
  
  occtPromise = import('occt-import-js').then(async (module) => {
    const occtImport = module.default;
    
    // Initialize occt-import-js with locateFile to find WASM in public directory
    // In Next.js, WASM files should be in the public directory
    const occt = await occtImport({
      locateFile: (filename: string) => {
        // WASM file is in the public directory
        if (filename.endsWith('.wasm')) {
          return `/occt-import-js.wasm`;
        }
        return filename;
      },
    });
    
    occtModule = occt;
    return occt;
  });
  
  return occtPromise;
}

/**
 * Parse STEP file
 */
export async function parseSTEP(
  buffer: ArrayBuffer,
  fileName: string,
  onProgress?: (progress: number, message: string) => void
): Promise<CADAssembly> {
  onProgress?.(0, 'Initializing STEP parser...');
  
  // Initialize occt-import-js
  const occt = await initOCCT();
  
  onProgress?.(10, 'Reading STEP file...');
  
  // Convert ArrayBuffer to Uint8Array
  const uint8Array = new Uint8Array(buffer);
  
  // Read STEP file using occt-import-js
  console.log('[STEP Parser] Reading STEP file, size:', buffer.byteLength, 'bytes');
  const result = occt.ReadStepFile(uint8Array, null);
  
  console.log('[STEP Parser] ReadStepFile result:', {
    success: result?.success,
    hasMeshes: !!result?.meshes,
    meshCount: result?.meshes?.length || 0,
    hasRoot: !!result?.root,
    resultKeys: result ? Object.keys(result) : [],
  });
  
  if (!result || !result.success) {
    console.error('[STEP Parser] Failed to read STEP file:', result);
    throw new Error('Failed to read STEP file or file contains no geometry');
  }
  
  onProgress?.(30, 'Processing geometry...');
  
  // Extract meshes from result
  const meshes = result.meshes || [];
  console.log('[STEP Parser] Found', meshes.length, 'mesh(es)');
  
  if (meshes.length === 0) {
    console.error('[STEP Parser] No meshes found in result:', result);
    throw new Error('No geometry found in STEP file');
  }
  
  // Log first mesh structure for debugging
  if (meshes.length > 0) {
    console.log('[STEP Parser] First mesh structure:', {
      name: meshes[0].name,
      hasAttributes: !!meshes[0].attributes,
      hasPosition: !!meshes[0].attributes?.position,
      hasNormal: !!meshes[0].attributes?.normal,
      hasIndex: !!meshes[0].index,
      positionArrayLength: meshes[0].attributes?.position?.array?.length || 0,
      normalArrayLength: meshes[0].attributes?.normal?.array?.length || 0,
      indexArrayLength: meshes[0].index?.array?.length || 0,
      positionArraySample: meshes[0].attributes?.position?.array?.slice(0, 3),
      indexArraySample: meshes[0].index?.array?.slice(0, 3),
      meshKeys: Object.keys(meshes[0]),
    });
  }
  
  onProgress?.(40, `Extracting ${meshes.length} mesh(es)...`);
  
  // Convert meshes to our format
  const geometries: CADGeometry[] = [];
  const parts: CADPart[] = [];
  const rootPartIds: string[] = [];
  
  let totalTriangles = 0;
  const progressPerMesh = 50 / meshes.length;
  
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    
    onProgress?.(40 + i * progressPerMesh, `Processing mesh ${i + 1} of ${meshes.length}...`);
    
    // Convert mesh to our format
    console.log(`[STEP Parser] Converting mesh ${i + 1}/${meshes.length}:`, mesh.name || `Mesh_${i + 1}`);
    const meshResult = convertOCCTMeshToGeometry(mesh);
    
    console.log(`[STEP Parser] Mesh ${i + 1} conversion result:`, {
      positionsLength: meshResult.positions.length,
      normalsLength: meshResult.normals.length,
      indicesLength: meshResult.indices.length,
      triangleCount: meshResult.triangleCount,
      firstPosition: meshResult.positions.slice(0, 3),
      firstNormal: meshResult.normals.slice(0, 3),
      firstIndices: meshResult.indices.slice(0, 3),
    });
    
    if (meshResult.triangleCount > 0) {
      const geometryId = crypto.randomUUID();
      const partId = crypto.randomUUID();
      
      const boundingBox = computeBoundingBox(meshResult.positions);
      const boundingSphere = computeBoundingSphere(meshResult.positions, boundingBox);
      
      const geometry: CADGeometry = {
        id: geometryId,
        positions: meshResult.positions,
        normals: meshResult.normals,
        indices: meshResult.indices,
        triangleCount: meshResult.triangleCount,
        boundingSphere,
        hasBVH: false,
      };
      
      const part: CADPart = {
        id: partId,
        name: mesh.name || `Part_${i + 1}`,
        parentId: null,
        transform: createIdentityMatrix(),
        boundingBox,
        geometryId,
        visible: true,
        selected: false,
        metadata: mesh.color ? {
          color: [mesh.color[0] / 255, mesh.color[1] / 255, mesh.color[2] / 255] as [number, number, number],
        } : undefined,
      };
      
      geometries.push(geometry);
      parts.push(part);
      rootPartIds.push(partId);
      totalTriangles += meshResult.triangleCount;
    }
  }
  
  onProgress?.(90, 'Building assembly...');
  
  const assemblyId = crypto.randomUUID();
  const geometriesMap = new Map(geometries.map(g => [g.id, g]));
  
  console.log('[STEP Parser] Assembly summary:', {
    partCount: parts.length,
    geometryCount: geometries.length,
    totalTriangles,
    rootPartIds: rootPartIds.length,
  });
  
  onProgress?.(100, 'Complete');
  
  const assembly = {
    id: assemblyId,
    name: extractPartName(fileName),
    format: 'step' as const,
    parts,
    geometries: geometriesMap,
    rootPartIds,
    totalTriangles,
    fileSize: buffer.byteLength,
    loadedAt: Date.now(),
    metadata: {
      fileName,
      units: 'mm' as const,
    },
  };
  
  console.log('[STEP Parser] Final assembly:', {
    id: assembly.id,
    name: assembly.name,
    format: assembly.format,
    partCount: assembly.parts.length,
    geometryCount: assembly.geometries.size,
    totalTriangles: assembly.totalTriangles,
  });
  
  return assembly;
}

/**
 * Convert occt-import-js mesh to our geometry format
 * occt-import-js returns meshes in a structure compatible with three.js
 */
function convertOCCTMeshToGeometry(mesh: any): {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
} {
  console.log('[STEP Parser] convertOCCTMeshToGeometry - mesh structure:', {
    hasAttributes: !!mesh.attributes,
    attributesKeys: mesh.attributes ? Object.keys(mesh.attributes) : [],
    hasIndex: !!mesh.index,
    indexKeys: mesh.index ? Object.keys(mesh.index) : [],
    meshKeys: Object.keys(mesh),
  });
  
  // occt-import-js returns meshes with attributes.position.array, attributes.normal.array, and index.array
  const positionArray = mesh.attributes?.position?.array || [];
  const normalArray = mesh.attributes?.normal?.array || [];
  const indexArray = mesh.index?.array || [];
  
  console.log('[STEP Parser] Raw arrays:', {
    positionArrayType: Array.isArray(positionArray) ? 'array' : typeof positionArray,
    positionArrayLength: positionArray.length,
    normalArrayLength: normalArray.length,
    indexArrayLength: indexArray.length,
    positionArraySample: positionArray.slice(0, 2),
    indexArraySample: indexArray.slice(0, 2),
  });
  
  // Check if positionArray elements are arrays or numbers
  const isNestedArray = positionArray.length > 0 && Array.isArray(positionArray[0]);
  
  // Flatten position array (it's an array of [x, y, z] triplets)
  const positions = new Float32Array(isNestedArray ? positionArray.length * 3 : positionArray.length);
  let posIdx = 0;
  
  if (isNestedArray) {
    // Array of [x, y, z] triplets
    for (let i = 0; i < positionArray.length; i++) {
      const pos = positionArray[i];
      positions[posIdx++] = pos[0] || 0;
      positions[posIdx++] = pos[1] || 0;
      positions[posIdx++] = pos[2] || 0;
    }
  } else {
    // Already flat array
    for (let i = 0; i < positionArray.length; i++) {
      positions[posIdx++] = positionArray[i] || 0;
    }
  }
  
  // Flatten normal array if present
  let normals: Float32Array;
  if (normalArray.length > 0) {
    const isNestedNormalArray = Array.isArray(normalArray[0]);
    normals = new Float32Array(isNestedNormalArray ? normalArray.length * 3 : normalArray.length);
    let normIdx = 0;
    
    if (isNestedNormalArray) {
      for (let i = 0; i < normalArray.length; i++) {
        const norm = normalArray[i];
        normals[normIdx++] = norm[0] || 0;
        normals[normIdx++] = norm[1] || 0;
        normals[normIdx++] = norm[2] || 0;
      }
    } else {
      for (let i = 0; i < normalArray.length; i++) {
        normals[normIdx++] = normalArray[i] || 0;
      }
    }
  } else {
    normals = new Float32Array(0);
  }
  
  // Flatten index array
  const isNestedIndexArray = indexArray.length > 0 && Array.isArray(indexArray[0]);
  const indices = new Uint32Array(isNestedIndexArray ? indexArray.length * 3 : indexArray.length);
  let idxIdx = 0;
  
  if (isNestedIndexArray) {
    // Array of [i1, i2, i3] triplets
    for (let i = 0; i < indexArray.length; i++) {
      const idx = indexArray[i];
      indices[idxIdx++] = idx[0] || 0;
      indices[idxIdx++] = idx[1] || 0;
      indices[idxIdx++] = idx[2] || 0;
    }
  } else {
    // Already flat array
    for (let i = 0; i < indexArray.length; i++) {
      indices[idxIdx++] = indexArray[i] || 0;
    }
  }
  
  console.log('[STEP Parser] After flattening:', {
    positionsLength: positions.length,
    normalsLength: normals.length,
    indicesLength: indices.length,
    expectedPositionsForIndices: (indices.length / 3) * 3 * 3,
  });
  
  // Calculate triangle count
  const triangleCount = indices.length / 3;
  
  // If normals are missing, compute them from positions
  if (normals.length === 0 && positions.length > 0) {
    const computedNormals = computeNormals(positions, indices);
    return {
      positions,
      normals: computedNormals,
      indices,
      triangleCount,
    };
  }
  
  return {
    positions,
    normals,
    indices,
    triangleCount,
  };
}

/**
 * Compute normals from positions and indices
 */
function computeNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  
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
      // Default normal if degenerate
      normals[i] = 0;
      normals[i + 1] = 0;
      normals[i + 2] = 1;
    }
  }
  
  return normals;
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
