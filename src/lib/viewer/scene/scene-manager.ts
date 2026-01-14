/**
 * Scene Manager
 * Core Three.js scene setup with BVH acceleration, LOD, and optimized rendering
 */

import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import type { CADAssembly, CADGeometry, CADPart, ViewerConfig, PartMesh, BVHBufferGeometry } from '../types';
import { CameraController } from './camera-controller';
import { SCENE, MATERIAL, CAMERA } from '../constants';

// Extend Three.js prototypes for BVH
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export interface SceneManagerEvents {
  onPartHover: (partId: string | null) => void;
  onPartSelect: (partId: string, additive: boolean) => void;
  onCameraChange: () => void;
}

export class SceneManager {
  // Core Three.js objects
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private cameraController: CameraController;
  
  // Scene elements
  private assemblyGroup: THREE.Group;
  private gridHelper: THREE.GridHelper | null = null;
  private axesHelper: THREE.AxesHelper | null = null;
  
  // Lighting
  private ambientLight: THREE.AmbientLight;
  private keyLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  
  // Part management
  private partMeshMap = new Map<string, PartMesh>();
  private geometryCache = new Map<string, THREE.BufferGeometry>();
  private materialCache = new Map<string, THREE.MeshStandardMaterial>();
  
  // Interaction
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private hoveredPartId: string | null = null;
  
  // Animation
  private animationFrameId: number | null = null;
  private isRendering = false;
  
  // Config
  private config: ViewerConfig;
  private events: Partial<SceneManagerEvents>;
  
  // Explode animation
  private explodeFactor = 0;
  private targetExplodeFactor = 0;
  
  // Assembly bounds
  private assemblyBounds = new THREE.Box3();
  private assemblyCenter = new THREE.Vector3();
  
  constructor(
    container: HTMLElement,
    config: ViewerConfig,
    events: Partial<SceneManagerEvents> = {}
  ) {
    this.config = config;
    this.events = events;
    
    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(config.backgroundColor);
    
    // Create camera
    this.camera = new THREE.PerspectiveCamera(
      CAMERA.DEFAULT_FOV,
      container.clientWidth / container.clientHeight,
      CAMERA.NEAR,
      CAMERA.FAR
    );
    this.camera.position.set(5, 5, 5);
    
    // Create renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: config.enableAA,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = config.enableShadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    
    // Create camera controller
    this.cameraController = new CameraController(
      this.camera,
      this.renderer.domElement,
      { damping: config.cameraDamping }
    );
    
    // Create assembly group
    this.assemblyGroup = new THREE.Group();
    this.scene.add(this.assemblyGroup);
    
    // Setup lighting
    this.ambientLight = new THREE.AmbientLight(0xffffff, SCENE.AMBIENT_INTENSITY);
    this.scene.add(this.ambientLight);
    
    this.keyLight = new THREE.DirectionalLight(0xffffff, SCENE.KEY_LIGHT_INTENSITY);
    this.keyLight.position.set(...SCENE.KEY_LIGHT_POS);
    this.keyLight.castShadow = config.enableShadows;
    this.scene.add(this.keyLight);
    
    this.fillLight = new THREE.DirectionalLight(0xffffff, SCENE.FILL_LIGHT_INTENSITY);
    this.fillLight.position.set(...SCENE.FILL_LIGHT_POS);
    this.scene.add(this.fillLight);
    
    // Setup grid and axes
    if (config.showGrid) {
      this.gridHelper = new THREE.GridHelper(
        SCENE.GRID_SIZE,
        SCENE.GRID_DIVISIONS,
        SCENE.GRID_COLOR_1,
        SCENE.GRID_COLOR_2
      );
      this.scene.add(this.gridHelper);
    }
    
    if (config.showAxes) {
      this.axesHelper = new THREE.AxesHelper(5);
      this.scene.add(this.axesHelper);
    }
    
    // Setup raycaster for BVH
    if (config.enableBVH) {
      this.raycaster.firstHitOnly = true;
    }
    
    // Bind event handlers
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove.bind(this));
    this.renderer.domElement.addEventListener('click', this.onClick.bind(this));
    window.addEventListener('resize', this.onResize.bind(this));
  }
  
  /**
   * Load and display a CAD assembly
   */
  loadAssembly(assembly: CADAssembly): void {
    // Clear existing
    this.clearAssembly();
    
    // Build geometries and meshes
    for (const part of assembly.parts) {
      const geometry = this.getOrCreateGeometry(assembly, part.geometryId);
      const mesh = this.createPartMesh(part, geometry);
      this.assemblyGroup.add(mesh);
      this.partMeshMap.set(part.id, mesh);
    }
    
    // Compute assembly bounds
    this.computeAssemblyBounds();
    
    // Fit camera to assembly
    this.cameraController.fitToBounds(this.assemblyBounds);
    
    // Start rendering
    this.startRendering();
  }
  
  /**
   * Create or retrieve cached geometry
   */
  private getOrCreateGeometry(assembly: CADAssembly, geometryId: string): THREE.BufferGeometry {
    if (this.geometryCache.has(geometryId)) {
      return this.geometryCache.get(geometryId)!;
    }
    
    const cadGeometry = assembly.geometries.get(geometryId);
    if (!cadGeometry) {
      throw new Error(`Geometry not found: ${geometryId}`);
    }
    
    const geometry = this.buildThreeGeometry(cadGeometry);
    this.geometryCache.set(geometryId, geometry);
    
    return geometry;
  }
  
  /**
   * Build Three.js geometry from CAD geometry data
   */
  private buildThreeGeometry(cadGeometry: CADGeometry): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry() as BVHBufferGeometry;
    
    geometry.setAttribute('position', new THREE.BufferAttribute(cadGeometry.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(cadGeometry.normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(cadGeometry.indices, 1));
    
    if (cadGeometry.uvs) {
      geometry.setAttribute('uv', new THREE.BufferAttribute(cadGeometry.uvs, 2));
    }
    
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    
    // Build BVH for fast raycasting
    if (this.config.enableBVH) {
      const bvh = new MeshBVH(geometry);
      geometry.boundsTree = bvh;
    }
    
    return geometry;
  }
  
  /**
   * Create a mesh for a part
   */
  private createPartMesh(part: CADPart, geometry: THREE.BufferGeometry): PartMesh {
    const material = this.getOrCreateMaterial(part);
    const mesh = new THREE.Mesh(geometry, material) as PartMesh;
    
    // Apply transform
    const matrix = new THREE.Matrix4().fromArray(part.transform);
    mesh.applyMatrix4(matrix);
    
    // Store metadata
    mesh.userData = {
      partId: part.id,
      partName: part.name,
      originalPosition: mesh.position.clone(),
      explodeDirection: new THREE.Vector3(),
    };
    
    mesh.visible = part.visible;
    
    return mesh;
  }
  
  /**
   * Get or create material for part
   */
  private getOrCreateMaterial(part: CADPart): THREE.MeshStandardMaterial {
    const colorKey = part.metadata?.color?.join(',') || 'default';
    
    if (this.materialCache.has(colorKey)) {
      return this.materialCache.get(colorKey)!;
    }
    
    const color = part.metadata?.color
      ? new THREE.Color(part.metadata.color[0], part.metadata.color[1], part.metadata.color[2])
      : new THREE.Color(MATERIAL.DEFAULT_COLOR);
    
    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: MATERIAL.METALNESS,
      roughness: MATERIAL.ROUGHNESS,
      flatShading: false,
    });
    
    this.materialCache.set(colorKey, material);
    return material;
  }
  
  /**
   * Compute bounding box of entire assembly
   */
  private computeAssemblyBounds(): void {
    this.assemblyBounds.makeEmpty();
    
    this.assemblyGroup.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const box = new THREE.Box3().setFromObject(object);
        this.assemblyBounds.union(box);
      }
    });
    
    this.assemblyBounds.getCenter(this.assemblyCenter);
    
    // Compute explode directions for all parts
    this.partMeshMap.forEach((mesh) => {
      const direction = mesh.position.clone().sub(this.assemblyCenter);
      if (direction.lengthSq() < 0.001) {
        // Random direction if at center
        direction.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      }
      direction.normalize();
      mesh.userData.explodeDirection = direction;
    });
  }
  
  /**
   * Clear current assembly
   */
  clearAssembly(): void {
    // Dispose geometries
    this.geometryCache.forEach((geometry) => {
      if ((geometry as BVHBufferGeometry).boundsTree) {
        (geometry as BVHBufferGeometry).boundsTree = undefined;
      }
      geometry.dispose();
    });
    this.geometryCache.clear();
    
    // Dispose materials
    this.materialCache.forEach((material) => material.dispose());
    this.materialCache.clear();
    
    // Remove meshes
    while (this.assemblyGroup.children.length > 0) {
      this.assemblyGroup.remove(this.assemblyGroup.children[0]);
    }
    this.partMeshMap.clear();
    
    this.assemblyBounds.makeEmpty();
    this.assemblyCenter.set(0, 0, 0);
  }
  
  /**
   * Handle pointer move for hover detection
   */
  private onPointerMove(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(this.assemblyGroup.children, false);
    
    const newHoveredId = intersects.length > 0 
      ? (intersects[0].object as PartMesh).userData?.partId 
      : null;
    
    if (newHoveredId !== this.hoveredPartId) {
      // Clear previous hover
      if (this.hoveredPartId) {
        const prevMesh = this.partMeshMap.get(this.hoveredPartId);
        if (prevMesh) {
          this.setPartHovered(prevMesh, false);
        }
      }
      
      // Set new hover
      if (newHoveredId) {
        const mesh = this.partMeshMap.get(newHoveredId);
        if (mesh) {
          this.setPartHovered(mesh, true);
        }
      }
      
      this.hoveredPartId = newHoveredId;
      this.events.onPartHover?.(newHoveredId);
    }
  }
  
  /**
   * Handle click for selection
   */
  private onClick(event: MouseEvent): void {
    if (this.hoveredPartId) {
      this.events.onPartSelect?.(this.hoveredPartId, event.ctrlKey || event.metaKey);
    }
  }
  
  /**
   * Handle resize
   */
  private onResize(): void {
    const container = this.renderer.domElement.parentElement;
    if (!container) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
  
  /**
   * Set part hover visual state
   */
  private setPartHovered(mesh: PartMesh, hovered: boolean): void {
    const material = mesh.material as THREE.MeshStandardMaterial;
    if (hovered) {
      material.emissive.setHex(0x222222);
    } else {
      material.emissive.setHex(0x000000);
    }
  }
  
  /**
   * Set part selection state
   */
  setPartSelected(partId: string, selected: boolean): void {
    const mesh = this.partMeshMap.get(partId);
    if (!mesh) return;
    
    const material = mesh.material as THREE.MeshStandardMaterial;
    if (selected) {
      material.color.setHex(MATERIAL.SELECTED_COLOR);
    } else {
      // Restore original color
      const colorKey = 'default'; // TODO: restore proper color
      const origMaterial = this.materialCache.get(colorKey);
      if (origMaterial) {
        material.color.copy(origMaterial.color);
      } else {
        material.color.setHex(MATERIAL.DEFAULT_COLOR);
      }
    }
  }
  
  /**
   * Set part visibility
   */
  setPartVisible(partId: string, visible: boolean): void {
    const mesh = this.partMeshMap.get(partId);
    if (mesh) {
      mesh.visible = visible;
    }
  }
  
  /**
   * Set explode factor (0 = assembled, 1 = fully exploded)
   */
  setExplodeFactor(factor: number): void {
    this.targetExplodeFactor = Math.max(0, Math.min(1, factor));
  }
  
  /**
   * Update explode animation
   */
  private updateExplode(): void {
    // Smooth transition to target
    const diff = this.targetExplodeFactor - this.explodeFactor;
    if (Math.abs(diff) < 0.001) {
      this.explodeFactor = this.targetExplodeFactor;
    } else {
      this.explodeFactor += diff * 0.1;
    }
    
    // Apply explode positions
    const maxDistance = this.assemblyBounds.getSize(new THREE.Vector3()).length() * 0.5;
    
    this.partMeshMap.forEach((mesh) => {
      const offset = mesh.userData.explodeDirection.clone().multiplyScalar(
        this.explodeFactor * maxDistance
      );
      mesh.position.copy(mesh.userData.originalPosition).add(offset);
    });
  }
  
  /**
   * Start render loop
   */
  startRendering(): void {
    if (this.isRendering) return;
    this.isRendering = true;
    this.render();
  }
  
  /**
   * Stop render loop
   */
  stopRendering(): void {
    this.isRendering = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
  
  /**
   * Render loop
   */
  private render(): void {
    if (!this.isRendering) return;
    
    this.animationFrameId = requestAnimationFrame(() => this.render());
    
    // Update camera
    const cameraChanged = this.cameraController.update();
    if (cameraChanged) {
      this.events.onCameraChange?.();
    }
    
    // Update explode
    if (Math.abs(this.targetExplodeFactor - this.explodeFactor) > 0.001) {
      this.updateExplode();
    }
    
    // Update light positions to follow camera
    this.keyLight.position.copy(this.camera.position);
    this.keyLight.position.add(new THREE.Vector3(5, 5, 0));
    
    // Render
    this.renderer.render(this.scene, this.camera);
  }
  
  /**
   * Fit camera to assembly
   */
  fitToAssembly(): void {
    if (!this.assemblyBounds.isEmpty()) {
      this.cameraController.fitToBounds(this.assemblyBounds);
    }
  }
  
  /**
   * Reset camera to default view
   */
  resetCamera(): void {
    this.cameraController.reset(this.assemblyBounds.isEmpty() ? undefined : this.assemblyBounds);
  }
  
  /**
   * Toggle grid visibility
   */
  setGridVisible(visible: boolean): void {
    if (this.gridHelper) {
      this.gridHelper.visible = visible;
    }
  }
  
  /**
   * Toggle axes visibility
   */
  setAxesVisible(visible: boolean): void {
    if (this.axesHelper) {
      this.axesHelper.visible = visible;
    }
  }
  
  /**
   * Get current camera controller
   */
  getCameraController(): CameraController {
    return this.cameraController;
  }
  
  /**
   * Get renderer info for performance monitoring
   */
  getRendererInfo(): THREE.WebGLInfo {
    return this.renderer.info;
  }
  
  /**
   * Get camera
   */
  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }
  
  /**
   * Get renderer
   */
  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }
  
  /**
   * Resize to container
   */
  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
  
  /**
   * Dispose all resources
   */
  dispose(): void {
    this.stopRendering();
    this.clearAssembly();
    
    // Dispose scene objects
    if (this.gridHelper) {
      this.gridHelper.geometry.dispose();
      (this.gridHelper.material as THREE.Material).dispose();
    }
    if (this.axesHelper) {
      this.axesHelper.dispose();
    }
    
    // Dispose lights
    this.ambientLight.dispose();
    this.keyLight.dispose();
    this.fillLight.dispose();
    
    // Dispose camera controller
    this.cameraController.dispose();
    
    // Dispose renderer
    this.renderer.dispose();
    this.renderer.domElement.remove();
    
    // Clear scene
    this.scene.clear();
  }
}
