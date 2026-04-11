import { Backend } from './Backend.js';
import { Color } from '../../math/Color.js';

/**
 * GPUBackend - GPU-accelerated rendering backend
 * 
 * Implements WebGPU (primary) and WebGL2 (fallback) rendering.
 * 
 * Phase 1: Bootstrap and initialization skeleton
 * Phase 2: Shader-driven baseline renderer with parity
 * Phase 3+: Advanced features (shadows, PBR, compute, etc.)
 */
export class GPUBackend extends Backend {
  constructor(parameters = {}) {
    super(parameters);

    this.backendType = 'gpu'; // Will be updated to 'gpu-webgpu' or 'gpu-webgl2'

    // GPU API references
    this.adapter = null;
    this.device = null;
    this.context = null;
    this.format = null;

    // GPU API type
    this.gpuAPI = null; // 'webgpu' or 'webgl2'

    // Clear color
    this.clearColor = new Color(0, 0, 0);

    // Ready state
    this._ready = false;
    this._initError = null;

    // Command encoding (Phase 1: skeleton)
    this._commandQueue = [];
  }

  /**
   * Initialize GPU backend
   * Tries WebGPU first, falls back to WebGL2
   */
  async initialize() {
    console.log('[GPUBackend] Initializing GPU backend...');

    // Try WebGPU first
    if (await this._initWebGPU()) {
      this.gpuAPI = 'webgpu';
      this.backendType = 'gpu-webgpu';
      this._updateCapabilities();
      this._ready = true;
      console.log('[GPUBackend] Successfully initialized WebGPU backend');
      console.warn('[GPUBackend] Phase 1: GPU rendering not yet implemented. Shader pipeline coming in Phase 2.');
      return true;
    }

    console.warn('[GPUBackend] WebGPU not available, trying WebGL2 fallback...');

    // Try WebGL2 fallback
    if (await this._initWebGL2()) {
      this.gpuAPI = 'webgl2';
      this.backendType = 'gpu-webgl2';
      this._updateCapabilities();
      this._ready = true;
      console.log('[GPUBackend] Successfully initialized WebGL2 backend');
      console.warn('[GPUBackend] Phase 1: GPU rendering not yet implemented. Shader pipeline coming in Phase 2.');
      return true;
    }

    // Both failed
    this._initError = 'Neither WebGPU nor WebGL2 are available';
    console.error(`[GPUBackend] Initialization failed: ${this._initError}`);
    return false;
  }

  /**
   * Initialize WebGPU
   */
  async _initWebGPU() {
    try {
      // Check for WebGPU support
      if (!navigator.gpu) {
        console.log('[GPUBackend] WebGPU not supported by browser');
        return false;
      }

      // Request adapter
      this.adapter = await navigator.gpu.requestAdapter();
      if (!this.adapter) {
        console.log('[GPUBackend] Failed to get WebGPU adapter');
        return false;
      }

      // Request device
      this.device = await this.adapter.requestDevice();
      if (!this.device) {
        console.log('[GPUBackend] Failed to get WebGPU device');
        return false;
      }

      // Configure canvas context
      this.context = this.canvas.getContext('webgpu');
      if (!this.context) {
        console.log('[GPUBackend] Failed to get WebGPU canvas context');
        return false;
      }

      // Get preferred format
      this.format = navigator.gpu.getPreferredCanvasFormat();

      // Configure context
      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: 'opaque'
      });

      // Set canvas size
      this.canvas.width = Math.floor(this.width * this.pixelRatio);
      this.canvas.height = Math.floor(this.height * this.pixelRatio);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;

      return true;
    } catch (error) {
      console.error('[GPUBackend] WebGPU initialization error:', error);
      return false;
    }
  }

  /**
   * Initialize WebGL2
   */
  async _initWebGL2() {
    try {
      // Get WebGL2 context
      this.context = this.canvas.getContext('webgl2', {
        alpha: false,
        depth: true,
        stencil: false,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false
      });

      if (!this.context) {
        console.log('[GPUBackend] WebGL2 not supported by browser');
        return false;
      }

      // Set canvas size
      this.canvas.width = Math.floor(this.width * this.pixelRatio);
      this.canvas.height = Math.floor(this.height * this.pixelRatio);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;

      // Set viewport
      this.context.viewport(0, 0, this.canvas.width, this.canvas.height);

      return true;
    } catch (error) {
      console.error('[GPUBackend] WebGL2 initialization error:', error);
      return false;
    }
  }

  /**
   * Update GPU backend capabilities based on API
   */
  _updateCapabilities() {
    if (this.gpuAPI === 'webgpu') {
      this._updateWebGPUCapabilities();
    } else if (this.gpuAPI === 'webgl2') {
      this._updateWebGL2Capabilities();
    }
  }

  /**
   * Update capabilities for WebGPU
   */
  _updateWebGPUCapabilities() {
    // Core Rendering
    this.capabilities.hasDepthTexture = true;
    this.capabilities.hasMSAA = true;
    this.capabilities.maxTextureSize = this.device?.limits?.maxTextureDimension2D || 8192;
    this.capabilities.maxColorAttachments = this.device?.limits?.maxColorAttachments || 8;
    this.capabilities.supportsFloatTextures = true;

    // Pipeline Features (Phase 1: None yet, Phase 2+)
    this.capabilities.supportsShadows = false; // Phase 4
    this.capabilities.supportsPostProcessing = false; // Phase 3
    this.capabilities.supportsDeferredOrGBuffer = false; // Phase 3
    this.capabilities.supportsOIT = false; // Phase 4

    // Shader and Compute
    this.capabilities.supportsShaders = false; // Phase 2 (will be true)
    this.capabilities.supportsCompute = true; // WebGPU native
    this.capabilities.supportsStorageBuffers = true; // WebGPU native

    // Animation and Instancing
    this.capabilities.supportsInstancing = false; // Phase 5
    this.capabilities.supportsSkinningOnGPU = false; // Phase 5
  }

  /**
   * Update capabilities for WebGL2
   */
  _updateWebGL2Capabilities() {
    const gl = this.context;

    // Core Rendering
    this.capabilities.hasDepthTexture = true;
    this.capabilities.hasMSAA = true;
    this.capabilities.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.capabilities.maxColorAttachments = gl.getParameter(gl.MAX_DRAW_BUFFERS);
    this.capabilities.supportsFloatTextures = gl.getExtension('EXT_color_buffer_float') !== null;

    // Pipeline Features (Phase 1: None yet, Phase 2+)
    this.capabilities.supportsShadows = false; // Phase 4
    this.capabilities.supportsPostProcessing = false; // Phase 3
    this.capabilities.supportsDeferredOrGBuffer = false; // Phase 3
    this.capabilities.supportsOIT = false; // Phase 4

    // Shader and Compute
    this.capabilities.supportsShaders = false; // Phase 2 (will be true)
    this.capabilities.supportsCompute = false; // WebGL2 doesn't have compute
    this.capabilities.supportsStorageBuffers = false; // WebGL2 doesn't have storage buffers

    // Animation and Instancing
    this.capabilities.supportsInstancing = false; // Phase 5
    this.capabilities.supportsSkinningOnGPU = false; // Phase 5
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

    this.canvas.width = Math.floor(width * this.pixelRatio);
    this.canvas.height = Math.floor(height * this.pixelRatio);

    if (updateStyle) {
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }

    // Update viewport for WebGL2
    if (this.gpuAPI === 'webgl2') {
      this.context.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
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
   * Clear buffers (Phase 1: minimal implementation)
   */
  clear() {
    if (this.gpuAPI === 'webgl2') {
      const gl = this.context;
      gl.clearColor(this.clearColor.r, this.clearColor.g, this.clearColor.b, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    } else if (this.gpuAPI === 'webgpu') {
      // WebGPU clear happens in render pass (Phase 2)
      // For now, just store the color
    }
  }

  /**
   * Render a scene with a camera
   * Phase 1: Stub with clear warning
   * Phase 2: Full implementation with shaders
   */
  render(scene, camera) {
    this.info.render.frame++;

    if (!this._ready) {
      console.error('[GPUBackend] Cannot render: backend not initialized');
      return;
    }

    // Phase 1: Clear screen with background color
    if (scene.background) {
      this.setClearColor(scene.background);
    }
    this.clear();

    // Phase 1: GPU rendering pipeline not yet implemented
    // Phase 2 will implement full shader-driven rendering
    
    // Store camera debug info
    if (camera.isPerspectiveCamera) {
      this.info.camera = {
        near: camera.near,
        far: camera.far,
        fov: camera.fov,
        position: camera.position.clone(),
        distance: camera.position.length()
      };
    }

    // Present (for WebGL2, swap is automatic; for WebGPU, present is in phase 2)
    this.present();
  }

  /**
   * Present rendered image (Phase 1: minimal)
   */
  present() {
    // WebGL2: automatically presents on context swap
    // WebGPU: Phase 2 will implement proper command submission
  }

  /**
   * Dispose of resources
   */
  dispose() {
    if (this.device) {
      // WebGPU cleanup
      this.device.destroy();
      this.device = null;
    }

    this.adapter = null;
    this.context = null;
    this._ready = false;
  }

  /**
   * Get initialization error (if any)
   */
  getInitError() {
    return this._initError;
  }
}
