import { Backend } from './Backend.js';
import { FrameBuffer } from '../FrameBuffer.js';
import { DepthBuffer } from '../DepthBuffer.js';
import { Pipeline } from '../Pipeline.js';
import { Color } from '../../math/Color.js';
import { MaterialHelper } from '../../materials/MaterialHelper.js';

/**
 * CPUBackend - Software rasterization backend
 * 
 * Implements the complete CPU-based rendering pipeline.
 * This is the reference implementation and provides deterministic rendering.
 * 
 * Phase 1: Extracted from original BangBangRenderer
 */
export class CPUBackend extends Backend {
  constructor(parameters = {}) {
    super(parameters);

    this.backendType = 'cpu';

    // Get 2D canvas context for presentation
    this.context = this.canvas.getContext('2d');
    if (!this.context) {
      throw new Error('CPUBackend: Failed to get 2D canvas context');
    }

    // Internal rendering resolution
    this._renderWidth = Math.floor(this.width * this.pixelRatio);
    this._renderHeight = Math.floor(this.height * this.pixelRatio);

    // Set canvas size
    this.canvas.width = this._renderWidth;
    this.canvas.height = this._renderHeight;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    // Create CPU rendering buffers
    this.frameBuffer = new FrameBuffer(this._renderWidth, this._renderHeight);
    this.depthBuffer = new DepthBuffer(this._renderWidth, this._renderHeight);

    // Create rendering pipeline
    this.pipeline = new Pipeline(this.frameBuffer, this.depthBuffer);

    // Clear color
    this.clearColor = new Color(0, 0, 0);

    // Update capabilities for CPU backend
    this._updateCapabilities();

    this._ready = true;
  }

  /**
   * Update CPU backend capabilities
   */
  _updateCapabilities() {
    // CPU backend capabilities (Phase 1)
    this.capabilities.hasDepthTexture = true; // CPU has explicit depth buffer
    this.capabilities.hasMSAA = false; // No MSAA in Phase 1
    this.capabilities.maxTextureSize = 4096; // Arbitrary limit for CPU
    this.capabilities.maxColorAttachments = 1;
    this.capabilities.supportsFloatTextures = true; // CPU can handle any format
    this.capabilities.supportsTextures = true; // CPU supports texture mapping
    this.capabilities.supportsLighting = true; // CPU supports lighting calculations

    // Pipeline features (Phase 1 - baseline)
    this.capabilities.supportsShadows = false; // Phase 4
    this.capabilities.supportsPostProcessing = false; // Phase 3
    this.capabilities.supportsDeferredOrGBuffer = false; // Phase 3
    this.capabilities.supportsOIT = false; // Phase 4
    this.capabilities.supportsPBR = false; // Phase 3+

    // Shader and Compute
    this.capabilities.supportsShaders = false; // Phase 2 (CPU "shaders" as JS functions)
    this.capabilities.supportsCompute = false; // Phase 5
    this.capabilities.supportsStorageBuffers = false; // Phase 5

    // Animation and Instancing
    this.capabilities.supportsInstancing = false; // Phase 5
    this.capabilities.supportsSkinningOnGPU = false; // Phase 5 (CPU does it on CPU)
  }

  /**
   * Initialize the backend (synchronous for CPU)
   */
  async initialize() {
    // CPU backend is ready immediately
    return true;
  }

  /**
   * Check if backend is ready
   */
  isReady() {
    return this._ready;
  }

  /**
   * Set the size of the renderer
   */
  setSize(width, height, updateStyle = true) {
    this.width = width;
    this.height = height;

    this._renderWidth = Math.floor(width * this.pixelRatio);
    this._renderHeight = Math.floor(height * this.pixelRatio);

    this.canvas.width = this._renderWidth;
    this.canvas.height = this._renderHeight;

    if (updateStyle) {
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }

    // Resize buffers
    this.frameBuffer.resize(this._renderWidth, this._renderHeight);
    this.depthBuffer.resize(this._renderWidth, this._renderHeight);
  }

  /**
   * Set the pixel ratio
   */
  setPixelRatio(pixelRatio) {
    this.pixelRatio = pixelRatio;
    this.setSize(this.width, this.height, true);
  }

  /**
   * Set clear color
   */
  setClearColor(color, alpha = 1) {
    if (typeof color === 'number') {
      this.clearColor.setHex(color);
    } else {
      this.clearColor.copy(color);
    }
  }

  /**
   * Clear buffers
   */
  clear() {
    this.frameBuffer.clear(
      Math.floor(this.clearColor.r * 255),
      Math.floor(this.clearColor.g * 255),
      Math.floor(this.clearColor.b * 255),
      255
    );
    this.depthBuffer.clear();
  }

  /**
   * Render a scene with a camera
   */
  render(scene, camera) {
    this.info.render.frame++;
    this.info.render.triangles = 0;

    // Store debug info for camera state
    if (camera.isPerspectiveCamera) {
      this.info.camera = {
        near: camera.near,
        far: camera.far,
        fov: camera.fov,
        position: camera.position.clone(),
        distance: camera.position.length()
      };
    }

    // Clear buffers
    if (scene.background) {
      this.setClearColor(scene.background);
    }
    this.clear();

    // Update camera matrices
    camera.updateMatrixWorld(true);

    // Update scene matrices
    scene.updateMatrixWorld(true);

    // Collect lights from scene
    const lights = [];
    scene.traverse((object) => {
      if (object.isLight && object.visible) {
        lights.push(object);
      }
    });

    // Collect meshes and separate into opaque and transparent
    const opaqueMeshes = [];
    const transparentMeshes = [];
    
    scene.traverseVisible((object) => {
      if (object.isMesh && object.visible) {
        if (object.material && object.material.transparent && object.material.opacity < 1.0) {
          // Calculate distance to camera for sorting
          const distance = camera.position.distanceTo(object.position);
          transparentMeshes.push({ mesh: object, distance });
        } else {
          opaqueMeshes.push(object);
        }
      }
    });

    // Render opaque meshes first (order doesn't matter)
    for (const mesh of opaqueMeshes) {
      // Apply material fallback if needed (e.g., PBR -> Lambert on CPU)
      const originalMaterial = mesh.material;
      const effectiveMaterial = MaterialHelper.getFallbackMaterial(mesh.material, this.capabilities);
      
      if (effectiveMaterial !== originalMaterial) {
        mesh.material = effectiveMaterial;
      }
      
      this.pipeline.renderMesh(mesh, camera, lights);
      
      // Restore original material
      if (effectiveMaterial !== originalMaterial) {
        mesh.material = originalMaterial;
      }
    }

    // Sort transparent meshes back-to-front (farthest first)
    transparentMeshes.sort((a, b) => b.distance - a.distance);

    // Render transparent meshes
    for (const { mesh } of transparentMeshes) {
      // Apply material fallback if needed (e.g., PBR -> Lambert on CPU)
      const originalMaterial = mesh.material;
      const effectiveMaterial = MaterialHelper.getFallbackMaterial(mesh.material, this.capabilities);
      
      if (effectiveMaterial !== originalMaterial) {
        mesh.material = effectiveMaterial;
      }
      
      this.pipeline.renderMesh(mesh, camera, lights);
      
      // Restore original material
      if (effectiveMaterial !== originalMaterial) {
        mesh.material = originalMaterial;
      }
    }

    // Present to canvas
    this.present();
  }

  /**
   * Present framebuffer to canvas
   */
  present() {
    const imageData = new ImageData(
      this.frameBuffer.data,
      this.frameBuffer.width,
      this.frameBuffer.height
    );

    this.context.putImageData(imageData, 0, 0);
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.frameBuffer = null;
    this.depthBuffer = null;
    this.pipeline = null;
    this._ready = false;
  }
}
