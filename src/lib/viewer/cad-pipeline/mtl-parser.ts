/**
 * MTL Parser
 * Parses Wavefront Material Template Library (.mtl) files
 * Extracts material properties for use with OBJ files
 */

export interface MTLMaterial {
  name: string;
  /** Ambient color [r, g, b] (0-1) */
  ambient?: [number, number, number];
  /** Diffuse color [r, g, b] (0-1) */
  diffuse?: [number, number, number];
  /** Specular color [r, g, b] (0-1) */
  specular?: [number, number, number];
  /** Shininess (0-1000) */
  shininess?: number;
  /** Transparency (0-1, 1 = opaque) */
  transparency?: number;
  /** Illumination model (0-10) */
  illumination?: number;
  /** Ambient texture map */
  mapAmbient?: string;
  /** Diffuse texture map */
  mapDiffuse?: string;
  /** Specular texture map */
  mapSpecular?: string;
  /** Normal/bump map */
  mapNormal?: string;
  /** Alpha/transparency map */
  mapAlpha?: string;
}

export interface MTLFile {
  materials: Map<string, MTLMaterial>;
}

/**
 * Parse MTL file from ArrayBuffer
 */
export function parseMTL(
  buffer: ArrayBuffer,
  basePath?: string
): MTLFile {
  const text = new TextDecoder().decode(buffer);
  const lines = text.split('\n');
  
  const materials = new Map<string, MTLMaterial>();
  let currentMaterial: MTLMaterial | null = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }
    
    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    
    switch (cmd) {
      case 'newmtl':
        // Save previous material
        if (currentMaterial) {
          materials.set(currentMaterial.name, currentMaterial);
        }
        // Start new material
        currentMaterial = {
          name: parts.slice(1).join(' ') || 'default',
        };
        break;
        
      case 'ka': // Ambient color
        if (currentMaterial) {
          currentMaterial.ambient = [
            parseFloat(parts[1]) || 0,
            parseFloat(parts[2]) || 0,
            parseFloat(parts[3]) || 0,
          ];
        }
        break;
        
      case 'kd': // Diffuse color
        if (currentMaterial) {
          currentMaterial.diffuse = [
            parseFloat(parts[1]) || 0.8,
            parseFloat(parts[2]) || 0.8,
            parseFloat(parts[3]) || 0.8,
          ];
        }
        break;
        
      case 'ks': // Specular color
        if (currentMaterial) {
          currentMaterial.specular = [
            parseFloat(parts[1]) || 0,
            parseFloat(parts[2]) || 0,
            parseFloat(parts[3]) || 0,
          ];
        }
        break;
        
      case 'ns': // Shininess
        if (currentMaterial) {
          currentMaterial.shininess = parseFloat(parts[1]) || 0;
        }
        break;
        
      case 'd': // Dissolve (transparency)
      case 'tr': // Transparency (inverted)
        if (currentMaterial) {
          const value = parseFloat(parts[1]) || 1.0;
          // 'tr' is inverted (0 = opaque, 1 = transparent)
          currentMaterial.transparency = cmd === 'tr' ? value : 1.0 - value;
        }
        break;
        
      case 'illum': // Illumination model
        if (currentMaterial) {
          currentMaterial.illumination = parseInt(parts[1]) || 0;
        }
        break;
        
      case 'map_ka': // Ambient texture
        if (currentMaterial) {
          currentMaterial.mapAmbient = resolveTexturePath(parts.slice(1).join(' '), basePath);
        }
        break;
        
      case 'map_kd': // Diffuse texture
        if (currentMaterial) {
          currentMaterial.mapDiffuse = resolveTexturePath(parts.slice(1).join(' '), basePath);
        }
        break;
        
      case 'map_ks': // Specular texture
        if (currentMaterial) {
          currentMaterial.mapSpecular = resolveTexturePath(parts.slice(1).join(' '), basePath);
        }
        break;
        
      case 'map_bump': // Bump map
      case 'bump': // Bump map (alternative)
        if (currentMaterial) {
          currentMaterial.mapNormal = resolveTexturePath(parts.slice(1).join(' '), basePath);
        }
        break;
        
      case 'map_d': // Alpha map
        if (currentMaterial) {
          currentMaterial.mapAlpha = resolveTexturePath(parts.slice(1).join(' '), basePath);
        }
        break;
    }
  }
  
  // Don't forget the last material
  if (currentMaterial) {
    materials.set(currentMaterial.name, currentMaterial);
  }
  
  return { materials };
}

/**
 * Resolve texture path, handling relative paths and base path
 */
function resolveTexturePath(texturePath: string, basePath?: string): string {
  // Remove quotes if present
  texturePath = texturePath.trim().replace(/^["']|["']$/g, '');
  
  // If it's an absolute URL, return as-is
  if (texturePath.startsWith('http://') || texturePath.startsWith('https://')) {
    return texturePath;
  }
  
  // If base path provided, resolve relative to it
  if (basePath) {
    // Remove filename from base path to get directory
    const baseDir = basePath.substring(0, basePath.lastIndexOf('/') + 1);
    return baseDir + texturePath;
  }
  
  return texturePath;
}

/**
 * Convert MTL material to CAD viewer format
 */
export function mtlToCADMaterial(mtl: MTLMaterial): {
  color?: [number, number, number];
  metalness?: number;
  roughness?: number;
} {
  // Use diffuse color if available, otherwise ambient
  const color = mtl.diffuse || mtl.ambient || [0.8, 0.8, 0.8];
  
  // Estimate metalness and roughness from material properties
  // Simple heuristic based on specular and shininess
  const hasSpecular = mtl.specular && (
    mtl.specular[0] > 0 || mtl.specular[1] > 0 || mtl.specular[2] > 0
  );
  const shininess = mtl.shininess || 0;
  
  // Higher shininess and specular = lower roughness
  const roughness = hasSpecular && shininess > 100 
    ? Math.max(0.1, 1.0 - (shininess / 1000)) 
    : 0.7;
  
  // Simple metalness estimation (could be improved)
  const metalness = hasSpecular && shininess > 200 ? 0.3 : 0.1;
  
  return {
    color: color as [number, number, number],
    metalness,
    roughness,
  };
}
