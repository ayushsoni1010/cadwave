/**
 * Geometry Cache
 * IndexedDB + LRU memory cache for parsed CAD assemblies
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CADAssembly, CADGeometry } from '../types';
import { CACHE } from '../constants';

// ============================================================================
// IndexedDB Schema
// ============================================================================

interface CADCacheSchema extends DBSchema {
  assemblies: {
    key: string;
    value: {
      id: string;
      hash: string;
      assembly: SerializedAssembly;
      timestamp: number;
      size: number;
    };
    indexes: { 'by-timestamp': number };
  };
}

/**
 * Serializable version of CADAssembly (Maps converted to arrays)
 */
interface SerializedAssembly extends Omit<CADAssembly, 'geometries'> {
  geometries: Array<[string, SerializedGeometry]>;
}

/**
 * Serializable version of CADGeometry (typed arrays to regular arrays)
 */
interface SerializedGeometry extends Omit<CADGeometry, 'positions' | 'normals' | 'indices' | 'uvs'> {
  positions: number[];
  normals: number[];
  indices: number[];
  uvs?: number[];
}

// ============================================================================
// LRU Memory Cache
// ============================================================================

class LRUCache<T> {
  private cache = new Map<string, T>();
  private order: string[] = [];
  
  constructor(private maxSize: number) {}
  
  get(key: string): T | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.order = this.order.filter(k => k !== key);
      this.order.push(key);
    }
    return value;
  }
  
  set(key: string, value: T): void {
    if (this.cache.has(key)) {
      this.cache.set(key, value);
      this.order = this.order.filter(k => k !== key);
      this.order.push(key);
      return;
    }
    
    // Evict oldest if at capacity
    while (this.order.length >= this.maxSize) {
      const oldest = this.order.shift();
      if (oldest) {
        this.cache.delete(oldest);
      }
    }
    
    this.cache.set(key, value);
    this.order.push(key);
  }
  
  has(key: string): boolean {
    return this.cache.has(key);
  }
  
  delete(key: string): void {
    this.cache.delete(key);
    this.order = this.order.filter(k => k !== key);
  }
  
  clear(): void {
    this.cache.clear();
    this.order = [];
  }
}

// ============================================================================
// Geometry Cache Class
// ============================================================================

export class GeometryCache {
  private db: IDBPDatabase<CADCacheSchema> | null = null;
  private memoryCache = new LRUCache<CADAssembly>(CACHE.LRU_SIZE);
  private initPromise: Promise<void> | null = null;
  
  /**
   * Initialize the cache
   */
  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = this.doInit();
    return this.initPromise;
  }
  
  private async doInit(): Promise<void> {
    try {
      this.db = await openDB<CADCacheSchema>(CACHE.DB_NAME, 1, {
        upgrade(db) {
          const store = db.createObjectStore('assemblies', { keyPath: 'id' });
          store.createIndex('by-timestamp', 'timestamp');
        },
      });
      
      // Clean up old entries
      await this.cleanupExpired();
    } catch (error) {
      console.warn('Failed to initialize IndexedDB cache:', error);
      // Continue without persistent cache
    }
  }
  
  /**
   * Generate hash for file content
   */
  async hashFile(buffer: ArrayBuffer): Promise<string> {
    // Use SubtleCrypto if available, fall back to simple hash
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      try {
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch {
        // Fall through to simple hash
      }
    }
    
    // Simple FNV-1a hash for fallback
    let hash = 2166136261;
    const view = new Uint8Array(buffer);
    for (let i = 0; i < view.length; i++) {
      hash ^= view[i];
      hash = (hash * 16777619) >>> 0;
    }
    return hash.toString(16);
  }
  
  /**
   * Get cached assembly by file hash
   */
  async get(hash: string): Promise<CADAssembly | null> {
    // Check memory cache first
    if (this.memoryCache.has(hash)) {
      return this.memoryCache.get(hash) ?? null;
    }
    
    // Check IndexedDB
    await this.init();
    if (!this.db) return null;
    
    try {
      const entries = await this.db.getAll('assemblies');
      const entry = entries.find(e => e.hash === hash);
      
      if (entry) {
        const assembly = deserializeAssembly(entry.assembly);
        this.memoryCache.set(hash, assembly);
        return assembly;
      }
    } catch (error) {
      console.warn('Failed to read from cache:', error);
    }
    
    return null;
  }
  
  /**
   * Store assembly in cache
   */
  async set(hash: string, assembly: CADAssembly): Promise<void> {
    // Store in memory cache
    this.memoryCache.set(hash, assembly);
    
    // Store in IndexedDB
    await this.init();
    if (!this.db) return;
    
    try {
      const serialized = serializeAssembly(assembly);
      const size = estimateSize(serialized);
      
      // Check if we need to make room
      await this.ensureSpace(size);
      
      await this.db.put('assemblies', {
        id: assembly.id,
        hash,
        assembly: serialized,
        timestamp: Date.now(),
        size,
      });
    } catch (error) {
      console.warn('Failed to write to cache:', error);
    }
  }
  
  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    
    await this.init();
    if (!this.db) return;
    
    try {
      await this.db.clear('assemblies');
    } catch (error) {
      console.warn('Failed to clear cache:', error);
    }
  }
  
  /**
   * Clean up expired entries
   */
  private async cleanupExpired(): Promise<void> {
    if (!this.db) return;
    
    const expiry = Date.now() - CACHE.TTL_MS;
    
    try {
      const tx = this.db.transaction('assemblies', 'readwrite');
      const index = tx.store.index('by-timestamp');
      let cursor = await index.openCursor();
      
      while (cursor) {
        if (cursor.value.timestamp < expiry) {
          await cursor.delete();
        }
        cursor = await cursor.continue();
      }
      
      await tx.done;
    } catch (error) {
      console.warn('Failed to cleanup cache:', error);
    }
  }
  
  /**
   * Ensure enough space for new entry
   */
  private async ensureSpace(requiredSize: number): Promise<void> {
    if (!this.db) return;
    
    try {
      const entries = await this.db.getAll('assemblies');
      let totalSize = entries.reduce((sum, e) => sum + e.size, 0);
      
      // Sort by timestamp (oldest first)
      entries.sort((a, b) => a.timestamp - b.timestamp);
      
      // Remove oldest entries until we have space
      while (totalSize + requiredSize > CACHE.MAX_SIZE_BYTES && entries.length > 0) {
        const oldest = entries.shift()!;
        await this.db.delete('assemblies', oldest.id);
        totalSize -= oldest.size;
      }
    } catch (error) {
      console.warn('Failed to ensure cache space:', error);
    }
  }
  
  /**
   * Dispose cache resources
   */
  dispose(): void {
    this.memoryCache.clear();
    this.db?.close();
    this.db = null;
    this.initPromise = null;
  }
}

// ============================================================================
// Serialization Helpers
// ============================================================================

function serializeAssembly(assembly: CADAssembly): SerializedAssembly {
  return {
    ...assembly,
    geometries: Array.from(assembly.geometries.entries()).map(
      ([id, geom]) => [id, serializeGeometry(geom)]
    ),
  };
}

function serializeGeometry(geometry: CADGeometry): SerializedGeometry {
  return {
    ...geometry,
    positions: Array.from(geometry.positions),
    normals: Array.from(geometry.normals),
    indices: Array.from(geometry.indices),
    uvs: geometry.uvs ? Array.from(geometry.uvs) : undefined,
  };
}

function deserializeAssembly(data: SerializedAssembly): CADAssembly {
  return {
    ...data,
    geometries: new Map(
      data.geometries.map(([id, geom]) => [id, deserializeGeometry(geom)])
    ),
  };
}

function deserializeGeometry(data: SerializedGeometry): CADGeometry {
  return {
    ...data,
    positions: new Float32Array(data.positions),
    normals: new Float32Array(data.normals),
    indices: new Uint32Array(data.indices),
    uvs: data.uvs ? new Float32Array(data.uvs) : undefined,
  };
}

function estimateSize(assembly: SerializedAssembly): number {
  let size = JSON.stringify(assembly.parts).length * 2;
  size += JSON.stringify(assembly.metadata || {}).length * 2;
  
  for (const [, geom] of assembly.geometries) {
    size += geom.positions.length * 4; // Float32
    size += geom.normals.length * 4;
    size += geom.indices.length * 4; // Uint32
    if (geom.uvs) size += geom.uvs.length * 4;
  }
  
  return size;
}

// ============================================================================
// Singleton Instance
// ============================================================================

let cacheInstance: GeometryCache | null = null;

export function getGeometryCache(): GeometryCache {
  if (!cacheInstance) {
    cacheInstance = new GeometryCache();
  }
  return cacheInstance;
}
