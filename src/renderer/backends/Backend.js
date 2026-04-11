/**
 * Backend - Abstract base class for rendering backends
 * 
 * Defines the interface that all rendering backends must implement.
 * This abstraction allows BangBang3D to support multiple execution paths
 * (CPU software rasterization, WebGPU, WebGL2) behind a unified API.
 * 
 * Phase 1: GPU Foundation and Backend Architecture
 */
export class Backend {
  constructor(parameters = {}) {
    if (this.constructor === Backend) {
      throw new Error('Backend is an abstract class and cannot be instantiated directly');
    }

    this.canvas = parameters.canvas;
    this.width = parameters.width || 800;
    this.height = parameters.height || 600;
    this.pixelRatio = parameters.pixelRatio || 1;
    this._renderer = parameters.renderer || null; // Reference to parent renderer for accessing shadows config

    // Backend type identifier
    this.backendType = 'unknown'; // Overridden by subclasses

    // Capability detection (populated by subclasses)
    this.capabilities = this._createDefaultCapabilities();

    // Stats
    this.info = {
      render: {
        frame: 0,
        triangles: 0
      }
    };
  }

  /**
   * Create default capability structure
   * Subclasses override specific capabilities
   */
  _createDefaultCapabilities() {
    return {
      // Core Rendering
      hasDepthTexture: false,
      hasMSAA: false,
      maxTextureSize: 2048,
      maxColorAttachments: 1,
      supportsFloatTextures: false,
      supportsTextures: false,
      supportsLighting: false,

      // Pipeline Features
      supportsShadows: false,
      supportsPostProcessing: false,
      supportsDeferredOrGBuffer: false,
      supportsOIT: false,
      supportsPBR: false,

      // Shader and Compute
      supportsShaders: false,
      supportsCompute: false,
      supportsStorageBuffers: false,

      // Animation and Instancing
      supportsInstancing: false,
      supportsSkinningOnGPU: false
    };
  }

  /**
   * Initialize the backend
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    throw new Error('Backend.initialize() must be implemented by subclass');
  }

  /**
   * Check if backend is ready to render
   * @returns {boolean}
   */
  isReady() {
    throw new Error('Backend.isReady() must be implemented by subclass');
  }

  /**
   * Set the size of the rendering surface
   * @param {number} width 
   * @param {number} height 
   * @param {boolean} updateStyle 
   */
  setSize(width, height, updateStyle = true) {
    throw new Error('Backend.setSize() must be implemented by subclass');
  }

  /**
   * Set the pixel ratio
   * @param {number} pixelRatio 
   */
  setPixelRatio(pixelRatio) {
    throw new Error('Backend.setPixelRatio() must be implemented by subclass');
  }

  /**
   * Set clear color
   * @param {Color} color 
   * @param {number} alpha 
   */
  setClearColor(color, alpha = 1) {
    throw new Error('Backend.setClearColor() must be implemented by subclass');
  }

  /**
   * Clear rendering buffers
   */
  clear() {
    throw new Error('Backend.clear() must be implemented by subclass');
  }

  /**
   * Render a scene with a camera
   * @param {Scene} scene 
   * @param {Camera} camera 
   */
  render(scene, camera) {
    throw new Error('Backend.render() must be implemented by subclass');
  }

  /**
   * Present rendered image to display
   */
  present() {
    throw new Error('Backend.present() must be implemented by subclass');
  }

  /**
   * Get debug info about rendering state
   * @returns {Object}
   */
  getDebugInfo() {
    const info = {
      backend: this.backendType,
      frame: this.info.render.frame,
      triangles: this.info.render.triangles
    };
    
    if (this.info.camera) {
      info.camera = {
        near: this.info.camera.near.toFixed(3),
        far: this.info.camera.far.toFixed(1),
        fov: this.info.camera.fov.toFixed(1),
        distance: this.info.camera.distance.toFixed(2),
        position: `(${this.info.camera.position.x.toFixed(2)}, ${this.info.camera.position.y.toFixed(2)}, ${this.info.camera.position.z.toFixed(2)})`
      };
    }
    
    return info;
  }

  /**
   * Dispose of resources
   */
  dispose() {
    throw new Error('Backend.dispose() must be implemented by subclass');
  }
}
