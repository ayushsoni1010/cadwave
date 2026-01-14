/**
 * Camera Controller
 * Heavy, physical camera controls with damping and smooth transitions
 * Supports mouse, touch, keyboard, and gesture input
 */

import * as THREE from 'three';
import type { CameraState, CameraInput, CameraMode } from '../types';
import { CAMERA } from '../constants';

interface CameraControllerConfig {
  /** Rotation speed in radians per pixel */
  rotateSpeed: number;
  /** Pan speed in world units per pixel */
  panSpeed: number;
  /** Zoom speed multiplier */
  zoomSpeed: number;
  /** Damping factor (0-1, higher = more damping) */
  damping: number;
  /** Minimum zoom distance */
  minDistance: number;
  /** Maximum zoom distance */
  maxDistance: number;
  /** Enable damping/inertia */
  enableDamping: boolean;
}

const DEFAULT_CONFIG: CameraControllerConfig = {
  rotateSpeed: CAMERA.ROTATE_SPEED,
  panSpeed: CAMERA.PAN_SPEED,
  zoomSpeed: CAMERA.ZOOM_SPEED,
  damping: CAMERA.DAMPING,
  minDistance: CAMERA.MIN_DISTANCE,
  maxDistance: CAMERA.MAX_DISTANCE,
  enableDamping: true,
};

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private config: CameraControllerConfig;
  
  // Spherical coordinates for orbit
  private spherical = new THREE.Spherical();
  private sphericalDelta = new THREE.Spherical();
  
  // Target point (orbit center)
  private target = new THREE.Vector3();
  private targetOffset = new THREE.Vector3();
  
  // Pan offset
  private panOffset = new THREE.Vector3();
  
  // Zoom
  private zoomScale = 1;
  
  // Velocity for damping
  private velocity = {
    spherical: new THREE.Spherical(),
    pan: new THREE.Vector3(),
    zoom: 0,
  };
  
  // Temporary vectors (reused to avoid allocations)
  private readonly tempVec = new THREE.Vector3();
  private readonly tempQuat = new THREE.Quaternion();
  
  // Input state
  private currentMode: CameraMode = 'none';
  private pointerStart = { x: 0, y: 0 };
  private pointerCurrent = { x: 0, y: 0 };
  
  // Bound event handlers
  private boundOnPointerDown: (e: PointerEvent) => void;
  private boundOnPointerMove: (e: PointerEvent) => void;
  private boundOnPointerUp: (e: PointerEvent) => void;
  private boundOnWheel: (e: WheelEvent) => void;
  private boundOnKeyDown: (e: KeyboardEvent) => void;
  
  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    config: Partial<CameraControllerConfig> = {}
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Initialize from camera position
    this.updateSphericalFromCamera();
    
    // Bind event handlers
    this.boundOnPointerDown = this.onPointerDown.bind(this);
    this.boundOnPointerMove = this.onPointerMove.bind(this);
    this.boundOnPointerUp = this.onPointerUp.bind(this);
    this.boundOnWheel = this.onWheel.bind(this);
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    
    this.attachEventListeners();
  }
  
  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    this.domElement.addEventListener('pointerdown', this.boundOnPointerDown);
    this.domElement.addEventListener('pointermove', this.boundOnPointerMove);
    this.domElement.addEventListener('pointerup', this.boundOnPointerUp);
    this.domElement.addEventListener('pointercancel', this.boundOnPointerUp);
    this.domElement.addEventListener('wheel', this.boundOnWheel, { passive: false });
    window.addEventListener('keydown', this.boundOnKeyDown);
  }
  
  /**
   * Detach event listeners
   */
  private detachEventListeners(): void {
    this.domElement.removeEventListener('pointerdown', this.boundOnPointerDown);
    this.domElement.removeEventListener('pointermove', this.boundOnPointerMove);
    this.domElement.removeEventListener('pointerup', this.boundOnPointerUp);
    this.domElement.removeEventListener('pointercancel', this.boundOnPointerUp);
    this.domElement.removeEventListener('wheel', this.boundOnWheel);
    window.removeEventListener('keydown', this.boundOnKeyDown);
  }
  
  /**
   * Handle pointer down
   */
  private onPointerDown(event: PointerEvent): void {
    event.preventDefault();
    this.domElement.setPointerCapture(event.pointerId);
    
    this.pointerStart.x = event.clientX;
    this.pointerStart.y = event.clientY;
    this.pointerCurrent.x = event.clientX;
    this.pointerCurrent.y = event.clientY;
    
    // Determine mode based on button/modifiers
    if (event.button === 0) {
      if (event.shiftKey) {
        this.currentMode = 'pan';
      } else {
        this.currentMode = 'orbit';
      }
    } else if (event.button === 1 || event.button === 2) {
      this.currentMode = 'pan';
    }
  }
  
  /**
   * Handle pointer move
   */
  private onPointerMove(event: PointerEvent): void {
    if (this.currentMode === 'none') return;
    
    const deltaX = event.clientX - this.pointerCurrent.x;
    const deltaY = event.clientY - this.pointerCurrent.y;
    
    this.pointerCurrent.x = event.clientX;
    this.pointerCurrent.y = event.clientY;
    
    this.applyInput({
      mode: this.currentMode,
      deltaX,
      deltaY,
      deltaZoom: 0,
      source: 'mouse',
    });
  }
  
  /**
   * Handle pointer up
   */
  private onPointerUp(event: PointerEvent): void {
    this.domElement.releasePointerCapture(event.pointerId);
    this.currentMode = 'none';
  }
  
  /**
   * Handle wheel
   */
  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    
    const delta = -Math.sign(event.deltaY);
    
    this.applyInput({
      mode: 'zoom',
      deltaX: 0,
      deltaY: 0,
      deltaZoom: delta,
      source: 'mouse',
    });
  }
  
  /**
   * Handle keyboard
   */
  private onKeyDown(event: KeyboardEvent): void {
    // Only handle if not typing in an input
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    
    const step = 10;
    
    switch (event.key) {
      case 'ArrowLeft':
        this.applyInput({ mode: 'orbit', deltaX: -step, deltaY: 0, deltaZoom: 0, source: 'keyboard' });
        break;
      case 'ArrowRight':
        this.applyInput({ mode: 'orbit', deltaX: step, deltaY: 0, deltaZoom: 0, source: 'keyboard' });
        break;
      case 'ArrowUp':
        if (event.shiftKey) {
          this.applyInput({ mode: 'pan', deltaX: 0, deltaY: -step, deltaZoom: 0, source: 'keyboard' });
        } else {
          this.applyInput({ mode: 'orbit', deltaX: 0, deltaY: -step, deltaZoom: 0, source: 'keyboard' });
        }
        break;
      case 'ArrowDown':
        if (event.shiftKey) {
          this.applyInput({ mode: 'pan', deltaX: 0, deltaY: step, deltaZoom: 0, source: 'keyboard' });
        } else {
          this.applyInput({ mode: 'orbit', deltaX: 0, deltaY: step, deltaZoom: 0, source: 'keyboard' });
        }
        break;
      case '+':
      case '=':
        this.applyInput({ mode: 'zoom', deltaX: 0, deltaY: 0, deltaZoom: 1, source: 'keyboard' });
        break;
      case '-':
      case '_':
        this.applyInput({ mode: 'zoom', deltaX: 0, deltaY: 0, deltaZoom: -1, source: 'keyboard' });
        break;
    }
  }
  
  /**
   * Apply camera input (from mouse, touch, gesture, or programmatic)
   */
  applyInput(input: CameraInput): void {
    switch (input.mode) {
      case 'orbit':
        this.rotateLeft(input.deltaX * this.config.rotateSpeed);
        this.rotateUp(input.deltaY * this.config.rotateSpeed);
        break;
        
      case 'pan':
        this.pan(input.deltaX, input.deltaY);
        break;
        
      case 'zoom':
        if (input.deltaZoom > 0) {
          this.zoomIn(Math.pow(0.95, input.deltaZoom));
        } else if (input.deltaZoom < 0) {
          this.zoomOut(Math.pow(0.95, -input.deltaZoom));
        }
        break;
    }
  }
  
  /**
   * Rotate left (horizontal)
   */
  private rotateLeft(angle: number): void {
    this.sphericalDelta.theta -= angle;
    if (this.config.enableDamping) {
      this.velocity.spherical.theta = -angle;
    }
  }
  
  /**
   * Rotate up (vertical)
   */
  private rotateUp(angle: number): void {
    this.sphericalDelta.phi -= angle;
    if (this.config.enableDamping) {
      this.velocity.spherical.phi = -angle;
    }
  }
  
  /**
   * Pan the camera
   */
  private pan(deltaX: number, deltaY: number): void {
    const offset = this.tempVec;
    
    // Get camera right and up vectors
    offset.setFromMatrixColumn(this.camera.matrix, 0); // right
    offset.multiplyScalar(-deltaX * this.config.panSpeed * this.spherical.radius * 0.01);
    this.panOffset.add(offset);
    
    offset.setFromMatrixColumn(this.camera.matrix, 1); // up
    offset.multiplyScalar(deltaY * this.config.panSpeed * this.spherical.radius * 0.01);
    this.panOffset.add(offset);
    
    if (this.config.enableDamping) {
      this.velocity.pan.copy(offset);
    }
  }
  
  /**
   * Zoom in
   */
  private zoomIn(scale: number): void {
    this.zoomScale *= scale;
    if (this.config.enableDamping) {
      this.velocity.zoom = scale - 1;
    }
  }
  
  /**
   * Zoom out
   */
  private zoomOut(scale: number): void {
    this.zoomScale /= scale;
    if (this.config.enableDamping) {
      this.velocity.zoom = 1 - scale;
    }
  }
  
  /**
   * Update camera position (call in animation loop)
   */
  update(): boolean {
    const offset = this.tempVec;
    
    // Calculate current offset from target
    offset.copy(this.camera.position).sub(this.target);
    
    // Convert to spherical
    this.spherical.setFromVector3(offset);
    
    // Apply deltas
    this.spherical.theta += this.sphericalDelta.theta;
    this.spherical.phi += this.sphericalDelta.phi;
    
    // Clamp phi to prevent flipping
    this.spherical.phi = Math.max(0.001, Math.min(Math.PI - 0.001, this.spherical.phi));
    
    // Apply zoom
    this.spherical.radius *= this.zoomScale;
    this.spherical.radius = Math.max(
      this.config.minDistance,
      Math.min(this.config.maxDistance, this.spherical.radius)
    );
    
    // Apply pan
    this.target.add(this.panOffset);
    
    // Convert back to cartesian
    offset.setFromSpherical(this.spherical);
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
    
    // Apply damping
    if (this.config.enableDamping) {
      this.sphericalDelta.theta *= this.config.damping;
      this.sphericalDelta.phi *= this.config.damping;
      this.panOffset.multiplyScalar(this.config.damping);
      this.zoomScale = 1 + (this.zoomScale - 1) * this.config.damping;
    } else {
      this.sphericalDelta.set(0, 0, 0);
      this.panOffset.set(0, 0, 0);
      this.zoomScale = 1;
    }
    
    // Check if we should keep updating
    const isDamping = 
      Math.abs(this.sphericalDelta.theta) > 0.0001 ||
      Math.abs(this.sphericalDelta.phi) > 0.0001 ||
      this.panOffset.lengthSq() > 0.000001 ||
      Math.abs(this.zoomScale - 1) > 0.0001;
    
    return isDamping || this.currentMode !== 'none';
  }
  
  /**
   * Initialize spherical coordinates from current camera position
   */
  private updateSphericalFromCamera(): void {
    const offset = this.tempVec.copy(this.camera.position).sub(this.target);
    this.spherical.setFromVector3(offset);
  }
  
  /**
   * Fit camera to bounding box
   */
  fitToBounds(bounds: THREE.Box3, padding = 1.5): void {
    const center = bounds.getCenter(this.tempVec);
    const size = bounds.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    const fov = this.camera.fov * (Math.PI / 180);
    const distance = (maxDim / 2) / Math.tan(fov / 2) * padding;
    
    this.target.copy(center);
    this.spherical.radius = distance;
    
    // Reset deltas
    this.sphericalDelta.set(0, 0, 0);
    this.panOffset.set(0, 0, 0);
    this.zoomScale = 1;
    
    this.update();
  }
  
  /**
   * Reset to default view
   */
  reset(bounds?: THREE.Box3): void {
    this.spherical.theta = Math.PI / 4;
    this.spherical.phi = Math.PI / 3;
    
    if (bounds) {
      this.fitToBounds(bounds);
    } else {
      this.spherical.radius = 10;
      this.target.set(0, 0, 0);
    }
    
    this.sphericalDelta.set(0, 0, 0);
    this.panOffset.set(0, 0, 0);
    this.zoomScale = 1;
    
    this.update();
  }
  
  /**
   * Get current camera state for serialization
   */
  getState(): CameraState {
    return {
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      target: [this.target.x, this.target.y, this.target.z],
      up: [this.camera.up.x, this.camera.up.y, this.camera.up.z],
      fov: this.camera.fov,
      near: this.camera.near,
      far: this.camera.far,
      zoom: this.camera.zoom,
    };
  }
  
  /**
   * Restore camera from state
   */
  setState(state: CameraState): void {
    this.camera.position.set(...state.position);
    this.target.set(...state.target);
    this.camera.up.set(...state.up);
    this.camera.fov = state.fov;
    this.camera.near = state.near;
    this.camera.far = state.far;
    this.camera.zoom = state.zoom;
    this.camera.updateProjectionMatrix();
    
    this.updateSphericalFromCamera();
  }
  
  /**
   * Get target point
   */
  getTarget(): THREE.Vector3 {
    return this.target.clone();
  }
  
  /**
   * Set target point
   */
  setTarget(target: THREE.Vector3): void {
    this.target.copy(target);
    this.updateSphericalFromCamera();
  }
  
  /**
   * Update damping factor
   */
  setDamping(damping: number): void {
    this.config.damping = Math.max(0, Math.min(1, damping));
  }
  
  /**
   * Dispose
   */
  dispose(): void {
    this.detachEventListeners();
  }
}
