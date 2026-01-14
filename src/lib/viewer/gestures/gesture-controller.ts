/**
 * Gesture Controller
 * Manages MediaPipe hand tracking and gesture detection
 * Runs processing in a way that doesn't block the main thread
 */

import type { HandState, GestureIntent, GestureControllerState, CameraInput } from '../types';
import { GestureDetector } from './gesture-detector';
import { GESTURE } from '../constants';

// MediaPipe types (minimal interface)
interface MediaPipeHands {
  setOptions(options: Record<string, unknown>): void;
  onResults(callback: (results: MediaPipeResults) => void): void;
  send(input: { image: HTMLVideoElement }): Promise<void>;
  close(): void;
}

interface MediaPipeResults {
  multiHandLandmarks?: Array<Array<{ x: number; y: number; z: number }>>;
  multiHandedness?: Array<{ label: string; score: number }>;
}

interface GestureControllerEvents {
  onGestureStart: (gesture: string) => void;
  onGestureEnd: () => void;
  onCameraInput: (input: CameraInput) => void;
  onSelectGesture: () => void;
  onIsolateGesture: () => void;
  onError: (error: string) => void;
  onStateChange: (state: GestureControllerState) => void;
}

export class GestureController {
  private video: HTMLVideoElement | null = null;
  private hands: MediaPipeHands | null = null;
  private detector: GestureDetector;
  private events: Partial<GestureControllerEvents>;
  
  private state: GestureControllerState = {
    enabled: false,
    active: false,
    currentGesture: 'none',
    lastIntent: null,
    fps: 0,
    cameraAvailable: false,
    error: null,
  };
  
  private frameCount = 0;
  private lastFpsUpdate = 0;
  private processingFrame = false;
  private animationFrameId: number | null = null;
  
  constructor(events: Partial<GestureControllerEvents> = {}) {
    this.events = events;
    this.detector = new GestureDetector(GESTURE.SMOOTHING_ALPHA);
  }
  
  /**
   * Initialize gesture tracking
   */
  async initialize(): Promise<void> {
    if (this.hands) return;
    
    try {
      // Check for camera availability
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasCamera = devices.some(d => d.kind === 'videoinput');
      
      if (!hasCamera) {
        throw new Error('No camera available');
      }
      
      // Create video element
      this.video = document.createElement('video');
      this.video.playsInline = true;
      this.video.muted = true;
      
      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
          facingMode: 'user',
        },
      });
      
      this.video.srcObject = stream;
      await this.video.play();
      
      // Load MediaPipe Hands
      const { Hands } = await this.loadMediaPipe();
      
      this.hands = new Hands({
        locateFile: (file: string) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        },
      });
      
      this.hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: GESTURE.MIN_CONFIDENCE,
        minTrackingConfidence: GESTURE.MIN_CONFIDENCE,
      });
      
      this.hands.onResults(this.onResults.bind(this));
      
      this.updateState({
        cameraAvailable: true,
        error: null,
      });
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initialize gesture tracking';
      this.updateState({
        cameraAvailable: false,
        error: message,
      });
      this.events.onError?.(message);
      throw error;
    }
  }
  
  /**
   * Load MediaPipe dynamically
   */
  private async loadMediaPipe(): Promise<{ Hands: new (options: { locateFile: (file: string) => string }) => MediaPipeHands }> {
    // @ts-expect-error - Dynamic import of MediaPipe
    const module = await import('@mediapipe/hands');
    return module;
  }
  
  /**
   * Start gesture tracking
   */
  start(): void {
    if (!this.hands || !this.video) {
      console.warn('Gesture controller not initialized');
      return;
    }
    
    this.updateState({ enabled: true, active: true });
    this.processFrame();
  }
  
  /**
   * Stop gesture tracking
   */
  stop(): void {
    this.updateState({ enabled: false, active: false });
    
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
  
  /**
   * Process a video frame
   */
  private async processFrame(): Promise<void> {
    if (!this.state.enabled || !this.hands || !this.video) {
      return;
    }
    
    // Prevent overlapping processing
    if (this.processingFrame) {
      this.animationFrameId = requestAnimationFrame(() => this.processFrame());
      return;
    }
    
    this.processingFrame = true;
    
    try {
      await this.hands.send({ image: this.video });
    } catch (error) {
      console.warn('Frame processing error:', error);
    }
    
    this.processingFrame = false;
    
    // Update FPS
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsUpdate > 1000) {
      this.updateState({ fps: Math.round(this.frameCount * 1000 / (now - this.lastFpsUpdate)) });
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }
    
    // Schedule next frame
    if (this.state.enabled) {
      this.animationFrameId = requestAnimationFrame(() => this.processFrame());
    }
  }
  
  /**
   * Handle MediaPipe results
   */
  private onResults(results: MediaPipeResults): void {
    const hands: HandState[] = [];
    
    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];
        const handedness = results.multiHandedness[i];
        
        hands.push({
          landmarks: landmarks.map(l => ({ x: l.x, y: l.y, z: l.z })),
          handedness: handedness.label.toLowerCase() as 'left' | 'right',
          confidence: handedness.score,
        });
      }
    }
    
    // Detect gesture
    const intent = this.detector.detect(hands);
    
    if (intent) {
      this.handleGestureIntent(intent);
    } else if (this.state.currentGesture !== 'none') {
      this.updateState({ currentGesture: 'none', lastIntent: null });
      this.events.onGestureEnd?.();
    }
  }
  
  /**
   * Handle detected gesture intent
   */
  private handleGestureIntent(intent: GestureIntent): void {
    // Check if gesture changed
    if (intent.type !== this.state.currentGesture) {
      if (this.state.currentGesture !== 'none') {
        this.events.onGestureEnd?.();
      }
      this.events.onGestureStart?.(intent.type);
    }
    
    this.updateState({
      currentGesture: intent.type,
      lastIntent: intent,
    });
    
    // Handle discrete gestures
    if (intent.type === 'select') {
      this.events.onSelectGesture?.();
      return;
    }
    
    if (intent.type === 'isolate') {
      this.events.onIsolateGesture?.();
      return;
    }
    
    // Convert to camera input for continuous gestures
    const cameraInput = this.intentToCameraInput(intent);
    if (cameraInput) {
      this.events.onCameraInput?.(cameraInput);
    }
  }
  
  /**
   * Convert gesture intent to camera input
   */
  private intentToCameraInput(intent: GestureIntent): CameraInput | null {
    // Scale factors to convert normalized gesture deltas to meaningful camera movements
    const rotateScale = 500;
    const panScale = 300;
    const zoomScale = 5;
    
    switch (intent.type) {
      case 'rotate':
        return {
          mode: 'orbit',
          deltaX: intent.deltaX * rotateScale,
          deltaY: intent.deltaY * rotateScale,
          deltaZoom: 0,
          source: 'gesture',
        };
        
      case 'pan':
        return {
          mode: 'pan',
          deltaX: intent.deltaX * panScale,
          deltaY: intent.deltaY * panScale,
          deltaZoom: 0,
          source: 'gesture',
        };
        
      case 'zoom':
        // Scale is ratio around 1.0
        const zoomDelta = (intent.scale - 1) * zoomScale;
        return {
          mode: 'zoom',
          deltaX: 0,
          deltaY: 0,
          deltaZoom: zoomDelta,
          source: 'gesture',
        };
        
      case 'reset':
        // Reset is a discrete action, not continuous
        // The viewer should handle this specially
        return null;
        
      case 'explode':
        // Explode uses scale but isn't camera control
        // Return null and let the viewer handle via state
        return null;
        
      default:
        return null;
    }
  }
  
  /**
   * Get explode factor from gesture
   */
  getExplodeFactor(): number | null {
    if (this.state.currentGesture === 'explode' && this.state.lastIntent) {
      // Map scale to 0-1 range
      // Scale < 1 = closing hand = decrease explode
      // Scale > 1 = spreading fingers = increase explode
      return Math.max(0, Math.min(1, (this.state.lastIntent.scale - 0.5) * 2));
    }
    return null;
  }
  
  /**
   * Check if reset gesture detected
   */
  isResetGesture(): boolean {
    return this.state.currentGesture === 'reset';
  }
  
  /**
   * Update state and notify
   */
  private updateState(partial: Partial<GestureControllerState>): void {
    this.state = { ...this.state, ...partial };
    this.events.onStateChange?.(this.state);
  }
  
  /**
   * Get current state
   */
  getState(): GestureControllerState {
    return { ...this.state };
  }
  
  /**
   * Set smoothing factor
   */
  setSmoothingFactor(factor: number): void {
    this.detector.setSmoothingFactor(factor);
  }
  
  /**
   * Get video element (for display)
   */
  getVideoElement(): HTMLVideoElement | null {
    return this.video;
  }
  
  /**
   * Dispose resources
   */
  dispose(): void {
    this.stop();
    
    if (this.video?.srcObject) {
      const stream = this.video.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    
    this.hands?.close();
    this.hands = null;
    this.video = null;
    this.detector.reset();
  }
}
