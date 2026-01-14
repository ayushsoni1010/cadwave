/**
 * Gesture Detector
 * Interprets hand landmarks into meaningful gesture intents
 */

import type { HandLandmark, GestureType, GestureIntent, HandState } from '../types';
import { GESTURE, HAND_LANDMARKS } from '../constants';

interface DetectorState {
  lastGesture: GestureType;
  gestureStartTime: number;
  lastUpdate: number;
  
  // Position tracking
  lastPalmPosition: { x: number; y: number; z: number } | null;
  lastPinchDistance: number;
  lastSpreadDistance: number;
  
  // Smoothed values
  smoothedDeltaX: number;
  smoothedDeltaY: number;
  smoothedDeltaZ: number;
  smoothedScale: number;
}

const initialState: DetectorState = {
  lastGesture: 'none',
  gestureStartTime: 0,
  lastUpdate: 0,
  lastPalmPosition: null,
  lastPinchDistance: 0,
  lastSpreadDistance: 0,
  smoothedDeltaX: 0,
  smoothedDeltaY: 0,
  smoothedDeltaZ: 0,
  smoothedScale: 1,
};

/**
 * Gesture Detector class
 * Processes hand landmarks and outputs gesture intents
 */
export class GestureDetector {
  private state: DetectorState = { ...initialState };
  private smoothingAlpha: number;
  
  constructor(smoothingFactor: number = GESTURE.SMOOTHING_ALPHA) {
    this.smoothingAlpha = smoothingFactor;
  }
  
  /**
   * Process hand state and return gesture intent
   */
  detect(hands: HandState[]): GestureIntent | null {
    const now = Date.now();
    
    // Rate limiting
    if (now - this.state.lastUpdate < GESTURE.UPDATE_INTERVAL_MS) {
      return null;
    }
    this.state.lastUpdate = now;
    
    // No hands detected
    if (hands.length === 0) {
      this.handleNoHands(now);
      return null;
    }
    
    // Get primary hand (prefer right hand, or first available)
    const primaryHand = hands.find(h => h.handedness === 'right') || hands[0];
    
    if (primaryHand.confidence < GESTURE.MIN_CONFIDENCE) {
      return null;
    }
    
    // Analyze hand pose
    const landmarks = primaryHand.landmarks;
    const gesture = this.classifyGesture(landmarks);
    
    if (gesture === 'none') {
      this.handleNoGesture(now);
      return null;
    }
    
    // Calculate deltas
    const intent = this.calculateIntent(gesture, landmarks, now);
    
    return intent;
  }
  
  /**
   * Classify gesture from landmarks
   */
  private classifyGesture(landmarks: HandLandmark[]): GestureType {
    const fingerStates = this.getFingerStates(landmarks);
    const pinchDistance = this.getPinchDistance(landmarks);
    const spreadDistance = this.getSpreadDistance(landmarks);
    
    // Pinch gesture (thumb and index close) -> Zoom
    if (pinchDistance < GESTURE.PINCH_THRESHOLD) {
      return 'zoom';
    }
    
    // Open hand with spread fingers -> Explode
    if (spreadDistance > GESTURE.SPREAD_THRESHOLD && fingerStates.allExtended) {
      return 'explode';
    }
    
    // Fist -> Reset
    if (fingerStates.allCurled) {
      return 'reset';
    }
    
    // Point (index extended, others curled) -> Select
    if (fingerStates.indexExtended && !fingerStates.middleExtended && !fingerStates.ringExtended && !fingerStates.pinkyExtended) {
      return 'select';
    }
    
    // Isolate (thumb + pinky extended, others curled) -> Isolate
    if (fingerStates.thumbExtended && fingerStates.pinkyExtended && !fingerStates.indexExtended && !fingerStates.middleExtended && !fingerStates.ringExtended) {
      return 'isolate';
    }
    
    // Two fingers (index + middle) -> Pan
    if (fingerStates.indexExtended && fingerStates.middleExtended && !fingerStates.ringExtended && !fingerStates.pinkyExtended) {
      return 'pan';
    }
    
    // Open palm (all fingers extended) -> Rotate
    if (fingerStates.allExtended || (fingerStates.indexExtended && fingerStates.middleExtended && fingerStates.ringExtended)) {
      return 'rotate';
    }
    
    return 'none';
  }
  
  /**
   * Get finger extension states
   */
  private getFingerStates(landmarks: HandLandmark[]): {
    thumbExtended: boolean;
    indexExtended: boolean;
    middleExtended: boolean;
    ringExtended: boolean;
    pinkyExtended: boolean;
    allExtended: boolean;
    allCurled: boolean;
  } {
    const wrist = landmarks[HAND_LANDMARKS.WRIST];
    const palmBase = landmarks[HAND_LANDMARKS.MIDDLE_MCP];
    
    // Check each finger by comparing tip position to base
    const thumbExtended = this.isFingerExtended(
      landmarks[HAND_LANDMARKS.THUMB_TIP],
      landmarks[HAND_LANDMARKS.THUMB_MCP],
      landmarks[HAND_LANDMARKS.THUMB_CMC]
    );
    
    const indexExtended = this.isFingerExtended(
      landmarks[HAND_LANDMARKS.INDEX_TIP],
      landmarks[HAND_LANDMARKS.INDEX_PIP],
      landmarks[HAND_LANDMARKS.INDEX_MCP]
    );
    
    const middleExtended = this.isFingerExtended(
      landmarks[HAND_LANDMARKS.MIDDLE_TIP],
      landmarks[HAND_LANDMARKS.MIDDLE_PIP],
      landmarks[HAND_LANDMARKS.MIDDLE_MCP]
    );
    
    const ringExtended = this.isFingerExtended(
      landmarks[HAND_LANDMARKS.RING_TIP],
      landmarks[HAND_LANDMARKS.RING_PIP],
      landmarks[HAND_LANDMARKS.RING_MCP]
    );
    
    const pinkyExtended = this.isFingerExtended(
      landmarks[HAND_LANDMARKS.PINKY_TIP],
      landmarks[HAND_LANDMARKS.PINKY_PIP],
      landmarks[HAND_LANDMARKS.PINKY_MCP]
    );
    
    return {
      thumbExtended,
      indexExtended,
      middleExtended,
      ringExtended,
      pinkyExtended,
      allExtended: indexExtended && middleExtended && ringExtended && pinkyExtended,
      allCurled: !indexExtended && !middleExtended && !ringExtended && !pinkyExtended,
    };
  }
  
  /**
   * Check if finger is extended
   */
  private isFingerExtended(
    tip: HandLandmark,
    pip: HandLandmark,
    mcp: HandLandmark
  ): boolean {
    // Finger is extended if tip is further from MCP than PIP
    const tipToMcp = this.distance3D(tip, mcp);
    const pipToMcp = this.distance3D(pip, mcp);
    return tipToMcp > pipToMcp * 1.1; // Small threshold
  }
  
  /**
   * Get distance between thumb and index tips (pinch)
   */
  private getPinchDistance(landmarks: HandLandmark[]): number {
    const thumb = landmarks[HAND_LANDMARKS.THUMB_TIP];
    const index = landmarks[HAND_LANDMARKS.INDEX_TIP];
    return this.distance3D(thumb, index);
  }
  
  /**
   * Get spread distance (distance between index and pinky tips)
   */
  private getSpreadDistance(landmarks: HandLandmark[]): number {
    const index = landmarks[HAND_LANDMARKS.INDEX_TIP];
    const pinky = landmarks[HAND_LANDMARKS.PINKY_TIP];
    return this.distance3D(index, pinky);
  }
  
  /**
   * Calculate 3D distance between landmarks
   */
  private distance3D(a: HandLandmark, b: HandLandmark): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  
  /**
   * Calculate gesture intent with deltas
   */
  private calculateIntent(
    gesture: GestureType,
    landmarks: HandLandmark[],
    timestamp: number
  ): GestureIntent {
    // Get palm position (average of MCP joints)
    const palm = this.getPalmPosition(landmarks);
    
    // Calculate deltas from last position
    let deltaX = 0;
    let deltaY = 0;
    let deltaZ = 0;
    let scale = 1;
    
    if (this.state.lastPalmPosition) {
      const rawDeltaX = palm.x - this.state.lastPalmPosition.x;
      const rawDeltaY = palm.y - this.state.lastPalmPosition.y;
      const rawDeltaZ = palm.z - this.state.lastPalmPosition.z;
      
      // Apply deadzone
      deltaX = Math.abs(rawDeltaX) > GESTURE.DEADZONE ? rawDeltaX : 0;
      deltaY = Math.abs(rawDeltaY) > GESTURE.DEADZONE ? rawDeltaY : 0;
      deltaZ = Math.abs(rawDeltaZ) > GESTURE.DEADZONE ? rawDeltaZ : 0;
      
      // Apply EMA smoothing
      this.state.smoothedDeltaX = this.ema(this.state.smoothedDeltaX, deltaX);
      this.state.smoothedDeltaY = this.ema(this.state.smoothedDeltaY, deltaY);
      this.state.smoothedDeltaZ = this.ema(this.state.smoothedDeltaZ, deltaZ);
    }
    
    // Calculate scale for zoom/explode
    if (gesture === 'zoom') {
      const pinchDistance = this.getPinchDistance(landmarks);
      if (this.state.lastPinchDistance > 0) {
        const rawScale = pinchDistance / this.state.lastPinchDistance;
        this.state.smoothedScale = this.ema(this.state.smoothedScale, rawScale);
        scale = this.state.smoothedScale;
      }
      this.state.lastPinchDistance = pinchDistance;
    } else if (gesture === 'explode') {
      const spreadDistance = this.getSpreadDistance(landmarks);
      if (this.state.lastSpreadDistance > 0) {
        const rawScale = spreadDistance / this.state.lastSpreadDistance;
        this.state.smoothedScale = this.ema(this.state.smoothedScale, rawScale);
        scale = this.state.smoothedScale;
      }
      this.state.lastSpreadDistance = spreadDistance;
    }
    
    // Update state
    this.state.lastPalmPosition = palm;
    this.state.lastGesture = gesture;
    this.state.gestureStartTime = this.state.gestureStartTime || timestamp;
    
    return {
      type: gesture,
      deltaX: this.state.smoothedDeltaX,
      deltaY: this.state.smoothedDeltaY,
      deltaZ: this.state.smoothedDeltaZ,
      scale,
      confidence: 1, // Could be refined
      timestamp,
    };
  }
  
  /**
   * Get palm center position
   */
  private getPalmPosition(landmarks: HandLandmark[]): { x: number; y: number; z: number } {
    const indices = [
      HAND_LANDMARKS.WRIST,
      HAND_LANDMARKS.INDEX_MCP,
      HAND_LANDMARKS.MIDDLE_MCP,
      HAND_LANDMARKS.RING_MCP,
      HAND_LANDMARKS.PINKY_MCP,
    ];
    
    let x = 0, y = 0, z = 0;
    for (const i of indices) {
      x += landmarks[i].x;
      y += landmarks[i].y;
      z += landmarks[i].z;
    }
    
    const count = indices.length;
    return { x: x / count, y: y / count, z: z / count };
  }
  
  /**
   * Exponential moving average
   */
  private ema(prev: number, current: number): number {
    return this.smoothingAlpha * current + (1 - this.smoothingAlpha) * prev;
  }
  
  /**
   * Handle no hands detected
   */
  private handleNoHands(now: number): void {
    // Reset state after timeout
    if (now - this.state.lastUpdate > GESTURE.INACTIVE_TIMEOUT_MS) {
      this.reset();
    }
  }
  
  /**
   * Handle no gesture detected
   */
  private handleNoGesture(now: number): void {
    this.state.lastGesture = 'none';
    this.state.gestureStartTime = 0;
  }
  
  /**
   * Reset detector state
   */
  reset(): void {
    this.state = { ...initialState };
  }
  
  /**
   * Set smoothing factor
   */
  setSmoothingFactor(factor: number): void {
    this.smoothingAlpha = Math.max(0, Math.min(1, factor));
  }
  
  /**
   * Get current gesture
   */
  getCurrentGesture(): GestureType {
    return this.state.lastGesture;
  }
}
