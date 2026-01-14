/**
 * Frame Monitor
 * Tracks frame timing and performance metrics
 * No allocations in hot path
 */

import type { FrameMetrics, QualityPreset } from '../types';
import { FRAME_BUDGET, QUALITY_THRESHOLDS } from '../constants';

interface FrameMonitorConfig {
  /** Number of frames to average */
  sampleSize: number;
  /** Enable auto-quality adjustment */
  autoQuality: boolean;
  /** Callback when quality should change */
  onQualityChange?: (quality: QualityPreset, reason: string) => void;
}

const DEFAULT_CONFIG: FrameMonitorConfig = {
  sampleSize: 60,
  autoQuality: true,
};

/**
 * Ring buffer for frame times (no allocations during recording)
 */
class FrameTimeBuffer {
  private buffer: Float64Array;
  private index = 0;
  private count = 0;
  
  constructor(size: number) {
    this.buffer = new Float64Array(size);
  }
  
  push(value: number): void {
    this.buffer[this.index] = value;
    this.index = (this.index + 1) % this.buffer.length;
    if (this.count < this.buffer.length) {
      this.count++;
    }
  }
  
  getAverage(): number {
    if (this.count === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.count; i++) {
      sum += this.buffer[i];
    }
    return sum / this.count;
  }
  
  getMin(): number {
    if (this.count === 0) return 0;
    let min = Infinity;
    for (let i = 0; i < this.count; i++) {
      if (this.buffer[i] < min) {
        min = this.buffer[i];
      }
    }
    return min;
  }
  
  getMax(): number {
    if (this.count === 0) return 0;
    let max = -Infinity;
    for (let i = 0; i < this.count; i++) {
      if (this.buffer[i] > max) {
        max = this.buffer[i];
      }
    }
    return max;
  }
  
  getCount(): number {
    return this.count;
  }
  
  reset(): void {
    this.index = 0;
    this.count = 0;
  }
}

export class FrameMonitor {
  private config: FrameMonitorConfig;
  
  // Timing
  private lastFrameTime = 0;
  private frameStartTime = 0;
  private jsStartTime = 0;
  private jsEndTime = 0;
  
  // Buffers (pre-allocated)
  private frameTimes: FrameTimeBuffer;
  private jsTimes: FrameTimeBuffer;
  
  // Quality state
  private currentQuality: QualityPreset = 'high';
  private badFrameCount = 0;
  private goodFrameCount = 0;
  private qualityReductions = 0;
  
  // Current metrics (reused object)
  private metrics: FrameMetrics = {
    fps: 60,
    frameTime: 16.67,
    jsTime: 0,
    renderTime: 0,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
  };
  
  constructor(config: Partial<FrameMonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.frameTimes = new FrameTimeBuffer(this.config.sampleSize);
    this.jsTimes = new FrameTimeBuffer(this.config.sampleSize);
    this.lastFrameTime = performance.now();
  }
  
  /**
   * Call at the start of each frame
   */
  frameStart(): void {
    this.frameStartTime = performance.now();
    this.jsStartTime = this.frameStartTime;
  }
  
  /**
   * Call when JS work is done, before GPU render
   */
  jsEnd(): void {
    this.jsEndTime = performance.now();
  }
  
  /**
   * Call at the end of each frame
   */
  frameEnd(rendererInfo?: { render: { calls: number; triangles: number }; memory: { geometries: number; textures: number } }): void {
    const now = performance.now();
    const frameTime = now - this.lastFrameTime;
    const jsTime = this.jsEndTime - this.jsStartTime;
    const renderTime = now - this.jsEndTime;
    
    this.lastFrameTime = now;
    
    // Record times
    this.frameTimes.push(frameTime);
    this.jsTimes.push(jsTime);
    
    // Update metrics
    const avgFrameTime = this.frameTimes.getAverage();
    this.metrics.fps = avgFrameTime > 0 ? 1000 / avgFrameTime : 0;
    this.metrics.frameTime = avgFrameTime;
    this.metrics.jsTime = this.jsTimes.getAverage();
    this.metrics.renderTime = avgFrameTime - this.metrics.jsTime;
    
    if (rendererInfo) {
      this.metrics.drawCalls = rendererInfo.render.calls;
      this.metrics.triangles = rendererInfo.render.triangles;
      this.metrics.geometries = rendererInfo.memory.geometries;
      this.metrics.textures = rendererInfo.memory.textures;
    }
    
    // Auto quality adjustment
    if (this.config.autoQuality) {
      this.adjustQuality();
    }
  }
  
  /**
   * Adjust quality based on frame times
   */
  private adjustQuality(): void {
    const fps = this.metrics.fps;
    
    if (fps < QUALITY_THRESHOLDS.REDUCE_FPS) {
      this.badFrameCount++;
      this.goodFrameCount = 0;
      
      if (this.badFrameCount >= QUALITY_THRESHOLDS.BAD_FRAME_COUNT) {
        this.reduceQuality();
        this.badFrameCount = 0;
      }
    } else if (fps > QUALITY_THRESHOLDS.INCREASE_FPS) {
      this.goodFrameCount++;
      this.badFrameCount = 0;
      
      if (this.goodFrameCount >= QUALITY_THRESHOLDS.GOOD_FRAME_COUNT) {
        this.increaseQuality();
        this.goodFrameCount = 0;
      }
    } else {
      // Reset counters in neutral zone
      this.badFrameCount = Math.max(0, this.badFrameCount - 1);
      this.goodFrameCount = Math.max(0, this.goodFrameCount - 1);
    }
  }
  
  /**
   * Reduce quality level
   */
  private reduceQuality(): void {
    const qualityOrder: QualityPreset[] = ['ultra', 'high', 'medium', 'low'];
    const currentIndex = qualityOrder.indexOf(this.currentQuality);
    
    if (currentIndex < qualityOrder.length - 1) {
      const newQuality = qualityOrder[currentIndex + 1];
      this.currentQuality = newQuality;
      this.qualityReductions++;
      this.config.onQualityChange?.(newQuality, `FPS dropped below ${QUALITY_THRESHOLDS.REDUCE_FPS}`);
    }
  }
  
  /**
   * Increase quality level
   */
  private increaseQuality(): void {
    const qualityOrder: QualityPreset[] = ['ultra', 'high', 'medium', 'low'];
    const currentIndex = qualityOrder.indexOf(this.currentQuality);
    
    if (currentIndex > 0) {
      const newQuality = qualityOrder[currentIndex - 1];
      this.currentQuality = newQuality;
      this.config.onQualityChange?.(newQuality, 'Performance recovered');
    }
  }
  
  /**
   * Get current metrics (returns same object, no allocation)
   */
  getMetrics(): FrameMetrics {
    return this.metrics;
  }
  
  /**
   * Get current quality level
   */
  getQuality(): QualityPreset {
    return this.currentQuality;
  }
  
  /**
   * Set quality level manually
   */
  setQuality(quality: QualityPreset): void {
    this.currentQuality = quality;
    this.badFrameCount = 0;
    this.goodFrameCount = 0;
  }
  
  /**
   * Get number of quality reductions
   */
  getQualityReductions(): number {
    return this.qualityReductions;
  }
  
  /**
   * Enable/disable auto quality
   */
  setAutoQuality(enabled: boolean): void {
    this.config.autoQuality = enabled;
  }
  
  /**
   * Check if within frame budget
   */
  isWithinBudget(): boolean {
    return this.metrics.frameTime <= FRAME_BUDGET.TOTAL;
  }
  
  /**
   * Get frame budget remaining (ms)
   */
  getBudgetRemaining(): number {
    return Math.max(0, FRAME_BUDGET.TOTAL - this.metrics.frameTime);
  }
  
  /**
   * Reset all statistics
   */
  reset(): void {
    this.frameTimes.reset();
    this.jsTimes.reset();
    this.badFrameCount = 0;
    this.goodFrameCount = 0;
    this.qualityReductions = 0;
    this.lastFrameTime = performance.now();
  }
}

/**
 * Quality settings for each preset
 */
export const QUALITY_SETTINGS: Record<QualityPreset, {
  shadowsEnabled: boolean;
  antialiasEnabled: boolean;
  lodBias: number;
  maxTriangles: number;
  pixelRatio: number;
}> = {
  low: {
    shadowsEnabled: false,
    antialiasEnabled: false,
    lodBias: 2,
    maxTriangles: 100000,
    pixelRatio: 1,
  },
  medium: {
    shadowsEnabled: false,
    antialiasEnabled: true,
    lodBias: 1,
    maxTriangles: 500000,
    pixelRatio: 1,
  },
  high: {
    shadowsEnabled: false,
    antialiasEnabled: true,
    lodBias: 0,
    maxTriangles: 2000000,
    pixelRatio: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1,
  },
  ultra: {
    shadowsEnabled: true,
    antialiasEnabled: true,
    lodBias: 0,
    maxTriangles: 10000000,
    pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
  },
};
