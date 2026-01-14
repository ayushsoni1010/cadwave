/**
 * CAD Format Detection
 * Automatically detects file format from content and extension
 */

import type { CADFormat } from '../types';
import { FILE_SIGNATURES } from '../constants';

/**
 * Detect CAD format from file name and content
 */
export function detectFormat(fileName: string, buffer: ArrayBuffer): CADFormat {
  const extension = getExtension(fileName);
  
  // Try extension first
  const formatFromExt = formatFromExtension(extension);
  if (formatFromExt !== 'unknown') {
    return formatFromExt;
  }
  
  // Fall back to content inspection
  return formatFromContent(buffer);
}

/**
 * Get file extension (lowercase, without dot)
 */
function getExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) return '';
  return fileName.slice(lastDot + 1).toLowerCase();
}

/**
 * Map extension to format
 */
function formatFromExtension(ext: string): CADFormat {
  switch (ext) {
    case 'step':
    case 'stp':
    case 'p21':
      return 'step';
    case 'iges':
    case 'igs':
      return 'iges';
    case 'stl':
      return 'stl';
    case 'obj':
      return 'obj';
    case 'gltf':
    case 'glb':
      return 'gltf';
    default:
      return 'unknown';
  }
}

/**
 * Detect format from file content
 */
function formatFromContent(buffer: ArrayBuffer): CADFormat {
  const bytes = new Uint8Array(buffer, 0, Math.min(1024, buffer.byteLength));
  const header = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const headerLower = header.toLowerCase();
  
  // Check for STL ASCII
  if (headerLower.startsWith(FILE_SIGNATURES.STL_ASCII)) {
    return 'stl';
  }
  
  // Check for STL Binary (80 byte header + 4 byte triangle count)
  if (buffer.byteLength >= 84) {
    const view = new DataView(buffer);
    const triangleCount = view.getUint32(80, true);
    const expectedSize = 84 + triangleCount * 50;
    // Allow some tolerance for file size
    if (Math.abs(buffer.byteLength - expectedSize) < 100) {
      return 'stl';
    }
  }
  
  // Check for OBJ
  const lines = header.split('\n').slice(0, 10);
  const objPrefixes = FILE_SIGNATURES.OBJ_PREFIX;
  let objMatches = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const firstWord = trimmed.split(/\s+/)[0];
    if (objPrefixes.includes(firstWord as typeof objPrefixes[number])) {
      objMatches++;
    }
  }
  if (objMatches >= 2) {
    return 'obj';
  }
  
  // Check for GLTF JSON
  if (header.trimStart().startsWith(FILE_SIGNATURES.GLTF_JSON)) {
    return 'gltf';
  }
  
  // Check for GLB binary
  if (buffer.byteLength >= 4) {
    const view = new DataView(buffer);
    const magic = view.getUint32(0, true);
    if (magic === FILE_SIGNATURES.GLB_MAGIC) {
      return 'gltf';
    }
  }
  
  // Check for STEP
  if (headerLower.includes('iso-10303-21') || headerLower.includes('header;')) {
    return 'step';
  }
  
  // Check for IGES
  if (header.length >= 80) {
    // IGES files have specific column-based format
    const firstLine = header.substring(0, 80);
    if (firstLine.length === 80 || firstLine.includes('S      1')) {
      // Check for IGES section markers in column 73
      const lines80 = header.match(/.{1,80}/g) || [];
      let igesMarkers = 0;
      for (const line of lines80.slice(0, 5)) {
        if (line.length >= 73) {
          const marker = line[72];
          if (['S', 'G', 'D', 'P', 'T'].includes(marker)) {
            igesMarkers++;
          }
        }
      }
      if (igesMarkers >= 2) {
        return 'iges';
      }
    }
  }
  
  return 'unknown';
}

/**
 * Get human-readable format name
 */
export function getFormatName(format: CADFormat): string {
  switch (format) {
    case 'step':
      return 'STEP (ISO 10303)';
    case 'iges':
      return 'IGES';
    case 'stl':
      return 'STL (Stereolithography)';
    case 'obj':
      return 'Wavefront OBJ';
    case 'gltf':
      return 'glTF';
    default:
      return 'Unknown';
  }
}

/**
 * Check if format is supported for full parsing
 */
export function isFormatSupported(format: CADFormat): boolean {
  // Currently we support STL, OBJ, and GLTF
  // STEP and IGES require specialized parsers (opencascade.js)
  return ['stl', 'obj', 'gltf'].includes(format);
}

/**
 * Get parser recommendation for unsupported formats
 */
export function getParserRecommendation(format: CADFormat): string | null {
  switch (format) {
    case 'step':
    case 'iges':
      return 'For STEP/IGES support, convert to STL or GLTF using FreeCAD, OpenSCAD, or similar tools.';
    case 'unknown':
      return 'File format not recognized. Please use STL, OBJ, or GLTF files.';
    default:
      return null;
  }
}
