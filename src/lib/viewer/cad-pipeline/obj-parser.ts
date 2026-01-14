/**
 * OBJ Parser
 * High-performance Wavefront OBJ file parser with multi-part support and MTL material support
 */

import type { CADAssembly, CADPart, CADGeometry, BoundingBox, BoundingSphere } from '../types';
import { parseMTL, mtlToCADMaterial, type MTLFile } from './mtl-parser';

interface OBJGroup {
  name: string;
  vertexIndices: number[];
  normalIndices: number[];
  uvIndices: number[];
  materialName?: string;
}

/**
 * Parse OBJ file
 * @param buffer - OBJ file content
 * @param fileName - Name of the OBJ file
 * @param onProgress - Progress callback
 * @param mtlFile - Optional pre-loaded MTL file
 */
export function parseOBJ(
  buffer: ArrayBuffer,
  fileName: string,
  onProgress?: (progress: number, message: string) => void,
  mtlFile?: MTLFile | null
): CADAssembly {
  onProgress?.(0, 'Decoding OBJ file...');
  
  const text = new TextDecoder().decode(buffer);
  const lines = text.split('\n');
  
  // Global arrays
  const vertices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const groups: OBJGroup[] = [];
  
  // MTL materials (use provided or keep null)
  const materials = mtlFile?.materials || null;
  const mtlLibPaths: string[] = [];
  
  let currentGroup: OBJGroup = {
    name: 'default',
    vertexIndices: [],
    normalIndices: [],
    uvIndices: [],
  };
  
  let currentMaterialName: string | undefined;
  
  onProgress?.(5, 'Parsing vertices and faces...');
  const progressInterval = Math.floor(lines.length / 20);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    
    const parts = line.split(/\s+/);
    const cmd = parts[0];
    
    switch (cmd) {
      case 'v': // Vertex position
        vertices.push(
          parseFloat(parts[1]) || 0,
          parseFloat(parts[2]) || 0,
          parseFloat(parts[3]) || 0
        );
        break;
        
      case 'vn': // Vertex normal
        normals.push(
          parseFloat(parts[1]) || 0,
          parseFloat(parts[2]) || 0,
          parseFloat(parts[3]) || 0
        );
        break;
        
      case 'vt': // Texture coordinate
        uvs.push(
          parseFloat(parts[1]) || 0,
          parseFloat(parts[2]) || 0
        );
        break;
        
      case 'f': // Face
        parseFace(parts.slice(1), currentGroup);
        break;
        
      case 'g': // Group
      case 'o': // Object
        if (currentGroup.vertexIndices.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = {
          name: parts.slice(1).join(' ') || `group_${groups.length}`,
          vertexIndices: [],
          normalIndices: [],
          uvIndices: [],
          materialName: currentMaterialName,
        };
        break;
        
      case 'mtllib': // Material library
        // Store MTL file path for later loading
        const mtlPath = parts.slice(1).join(' ');
        if (mtlPath) {
          mtlLibPaths.push(mtlPath);
        }
        break;
        
      case 'usemtl': // Use material
        // Change material for subsequent faces
        currentMaterialName = parts.slice(1).join(' ') || undefined;
        // If current group has faces, start a new group with new material
        if (currentGroup.vertexIndices.length > 0 && currentGroup.materialName !== currentMaterialName) {
          groups.push(currentGroup);
          currentGroup = {
            name: currentGroup.name,
            vertexIndices: [],
            normalIndices: [],
            uvIndices: [],
            materialName: currentMaterialName,
          };
        } else {
          currentGroup.materialName = currentMaterialName;
        }
        break;
    }
    
    if (progressInterval > 0 && i % progressInterval === 0) {
      const progress = 5 + (i / lines.length) * 50;
      onProgress?.(progress, `Processing line ${i} of ${lines.length}...`);
    }
  }
  
  // Don't forget the last group
  if (currentGroup.vertexIndices.length > 0) {
    groups.push(currentGroup);
  }
  
  // If no groups were defined, create one with all faces
  if (groups.length === 0) {
    groups.push(currentGroup);
  }
  
  // Try to load MTL file if referenced
  if (mtlLibPaths.length > 0) {
    onProgress?.(55, 'Loading material file...');
    try {
      // Note: In a real implementation, we'd need to fetch the MTL file
      // For now, we'll handle this in the loader which has access to the file system
      // The MTL loading will be handled by the loader before calling parseOBJ
    } catch (error) {
      console.warn('[OBJ Parser] Failed to load MTL file:', error);
    }
  }
  
  onProgress?.(60, 'Building geometries...');
  
  // Convert groups to parts and geometries
  const assemblyId = crypto.randomUUID();
  const parts: CADPart[] = [];
  const geometries = new Map<string, CADGeometry>();
  let totalTriangles = 0;
  
  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    if (group.vertexIndices.length === 0) continue;
    
    const result = buildGeometry(group, vertices, normals, uvs);
    const geometryId = crypto.randomUUID();
    const partId = crypto.randomUUID();
    
    const bbox = computeBoundingBox(result.positions);
    const bsphere = computeBoundingSphere(result.positions, bbox);
    
    const geometry: CADGeometry = {
      id: geometryId,
      positions: result.positions,
      normals: result.normals,
      indices: result.indices,
      uvs: result.uvs.length > 0 ? result.uvs : undefined,
      triangleCount: result.triangleCount,
      boundingSphere: bsphere,
      hasBVH: false,
    };
    
    geometries.set(geometryId, geometry);
    totalTriangles += result.triangleCount;
    
    // Get material if group has one
    let partMetadata;
    if (group.materialName && materials?.has(group.materialName)) {
      const mtlMaterial = materials.get(group.materialName)!;
      const cadMaterial = mtlToCADMaterial(mtlMaterial);
      partMetadata = {
        color: cadMaterial.color,
      };
    }
    
    parts.push({
      id: partId,
      name: group.name,
      parentId: null,
      transform: createIdentityMatrix(),
      boundingBox: bbox,
      geometryId,
      visible: true,
      selected: false,
      metadata: partMetadata,
    });
    
    const progress = 60 + (gi / groups.length) * 35;
    onProgress?.(progress, `Building part ${gi + 1} of ${groups.length}...`);
  }
  
  onProgress?.(100, 'Complete');
  
  return {
    id: assemblyId,
    name: extractPartName(fileName),
    format: 'obj',
    parts,
    geometries,
    rootPartIds: parts.map(p => p.id),
    totalTriangles,
    fileSize: buffer.byteLength,
    loadedAt: Date.now(),
    metadata: {
      fileName,
    },
  };
}

/**
 * Parse a face definition and add indices to group
 */
function parseFace(vertexDefs: string[], group: OBJGroup): void {
  // OBJ faces can be polygons, we need to triangulate
  const faceVertexIndices: number[] = [];
  const faceNormalIndices: number[] = [];
  const faceUVIndices: number[] = [];
  
  for (const def of vertexDefs) {
    const parts = def.split('/');
    // OBJ indices are 1-based
    const vi = parseInt(parts[0]) - 1;
    faceVertexIndices.push(vi);
    
    if (parts[1] && parts[1].length > 0) {
      faceUVIndices.push(parseInt(parts[1]) - 1);
    }
    
    if (parts[2] && parts[2].length > 0) {
      faceNormalIndices.push(parseInt(parts[2]) - 1);
    }
  }
  
  // Triangulate polygon (fan triangulation)
  for (let i = 1; i < faceVertexIndices.length - 1; i++) {
    group.vertexIndices.push(
      faceVertexIndices[0],
      faceVertexIndices[i],
      faceVertexIndices[i + 1]
    );
    
    if (faceNormalIndices.length > 0) {
      group.normalIndices.push(
        faceNormalIndices[0],
        faceNormalIndices[i],
        faceNormalIndices[i + 1]
      );
    }
    
    if (faceUVIndices.length > 0) {
      group.uvIndices.push(
        faceUVIndices[0],
        faceUVIndices[i],
        faceUVIndices[i + 1]
      );
    }
  }
}

/**
 * Build geometry from group indices
 */
function buildGeometry(
  group: OBJGroup,
  vertices: number[],
  normals: number[],
  uvs: number[]
): {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
} {
  const vertexCount = group.vertexIndices.length;
  const positions = new Float32Array(vertexCount * 3);
  const outNormals = new Float32Array(vertexCount * 3);
  const outUVs = group.uvIndices.length > 0 ? new Float32Array(vertexCount * 2) : new Float32Array(0);
  const indices = new Uint32Array(vertexCount);
  
  for (let i = 0; i < vertexCount; i++) {
    const vi = group.vertexIndices[i];
    positions[i * 3] = vertices[vi * 3] ?? 0;
    positions[i * 3 + 1] = vertices[vi * 3 + 1] ?? 0;
    positions[i * 3 + 2] = vertices[vi * 3 + 2] ?? 0;
    
    if (group.normalIndices.length > 0) {
      const ni = group.normalIndices[i];
      outNormals[i * 3] = normals[ni * 3] ?? 0;
      outNormals[i * 3 + 1] = normals[ni * 3 + 1] ?? 0;
      outNormals[i * 3 + 2] = normals[ni * 3 + 2] ?? 1;
    }
    
    if (group.uvIndices.length > 0 && outUVs.length > 0) {
      const ti = group.uvIndices[i];
      outUVs[i * 2] = uvs[ti * 2] ?? 0;
      outUVs[i * 2 + 1] = uvs[ti * 2 + 1] ?? 0;
    }
    
    indices[i] = i;
  }
  
  // If no normals provided, compute them
  if (group.normalIndices.length === 0) {
    computeFaceNormals(positions, outNormals);
  }
  
  return {
    positions,
    normals: outNormals,
    uvs: outUVs,
    indices,
    triangleCount: vertexCount / 3,
  };
}

/**
 * Compute flat face normals
 */
function computeFaceNormals(positions: Float32Array, normals: Float32Array): void {
  for (let i = 0; i < positions.length; i += 9) {
    // Get triangle vertices
    const ax = positions[i], ay = positions[i + 1], az = positions[i + 2];
    const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5];
    const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8];
    
    // Compute edges
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    
    // Cross product
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    
    // Normalize
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    } else {
      nz = 1;
    }
    
    // Apply to all three vertices
    for (let j = 0; j < 3; j++) {
      normals[i + j * 3] = nx;
      normals[i + j * 3 + 1] = ny;
      normals[i + j * 3 + 2] = nz;
    }
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
