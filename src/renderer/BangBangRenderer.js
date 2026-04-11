import { CPUBackend } from './backends/CPUBackend.js';
import { GPUBackend } from './backends/GPUBackend.js';
import { PathTracerRenderer } from '../pathtracer/PathTracerRenderer.js';
import PostFXPipeline from './postprocessing/PostFXPipeline.js';
import DitherPass from './postprocessing/DitherPass.js';

/**
 * BangBangRenderer - Main renderer interface
 * Provides the public API for rendering scenes with pluggable backends
 * 
 * Lifecycle:
 * 1. new BangBangRenderer({ canvas, backend, ... }) - synchronous, stores config
 * 2. await renderer.initialize() - async, creates backend, detects capabilities
 * 3. renderer.render(scene, camera) - synchronous, renders frame
 * 4. renderer.dispose() - cleanup resources
 * 
 * Phase 1: GPU Foundation and Backend Architecture
 * - Backend selection: 'cpu' | 'gpu' | 'webgpu' | 'webgl2' | 'auto'
 * - CPU backend: software rasterization (reference, deterministic)
 * - GPU backend: WebGPU (primary) or WebGL2 (fallback)
 * - 'webgpu' backend: Force WebGPU only (no fallback to WebGL2)
 * - 'webgl2' backend: Force WebGL2, skipping WebGPU detection
 */
export class BangBangRenderer {
  constructor(parameters = {}) {
    const {
      canvas = null,
      width = 800,
      height = 600,
      pixelRatio = 1,
      backend = 'cpu' // 'cpu' | 'gpu' | 'webgpu' | 'webgl2' | 'auto'
    } = parameters;

    if (!canvas) {
      throw new Error('BangBangRenderer: canvas parameter is required');
    }

    // Store configuration (constructor must be synchronous and pure)
    this.canvas = canvas;
    this._parameters = { canvas, width, height, pixelRatio };
    this._requestedBackend = backend;
    this._backend = null;
    this._initialized = false;
    
    // Shadow system configuration (Phase 1: Shadow Maps)
    this.shadows = {
      enabled: false,              // Global shadow enable/disable
      type: 'hard',                // 'hard' | 'pcf' (PCF in Phase 2)
      maxShadowLights: 2           // Maximum number of shadow-casting lights
    };

    console.log(`[BangBangRenderer] Created renderer (backend: ${backend})`);
    console.log(`[BangBangRenderer] Call await renderer.initialize() to complete setup`);
  }

  /**
   * Initialize the renderer (must be called before rendering)
   * This performs all async operations: backend creation, GPU context setup, capability detection
   */
  async initialize() {
    if (this._initialized) {
      console.warn('[BangBangRenderer] Already initialized, skipping');
      return;
    }

    console.log(`[BangBangRenderer] Initializing ${this._requestedBackend} backend...`);

    if (this._requestedBackend === 'cpu') {
      await this._initCPUBackend(this._parameters);
    } else if (this._requestedBackend === 'gpu') {
      await this._initGPUBackend(this._parameters);
    } else if (this._requestedBackend === 'webgpu') {
      await this._initGPUBackend(this._parameters, 'webgpu');
    } else if (this._requestedBackend === 'webgl2') {
      await this._initGPUBackend(this._parameters, 'webgl2');
    } else if (this._requestedBackend === 'auto') {
      await this._initAutoBackend(this._parameters);
    } else {
      console.error(`[BangBangRenderer] Unknown backend type: ${this._requestedBackend}, falling back to CPU`);
      await this._initCPUBackend(this._parameters);
    }

    this._initialized = true;
  }

  /**
   * Initialize CPU backend
   * @private
   */
  async _initCPUBackend(parameters) {
    try {
      // Pass renderer reference so backend can access shadow config
      this._backend = new CPUBackend({ ...parameters, renderer: this });
      await this._backend.initialize();
      console.log('[BangBangRenderer] CPU backend initialized successfully');
    } catch (error) {
      console.error('[BangBangRenderer] CPU backend initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize GPU backend
   * @private
   * @param {Object} parameters - Backend parameters
   * @param {string} preferredAPI - Preferred GPU API ('webgpu' or 'webgl2')
   */
  async _initGPUBackend(parameters, preferredAPI = null) {
    try {
      // Pass renderer reference so backend can access shadow config
      this._backend = new GPUBackend({ ...parameters, renderer: this });
      const success = await this._backend.initialize(preferredAPI);
      
      if (success) {
        console.log(`[BangBangRenderer] GPU backend initialized successfully (${this._backend.gpuAPI})`);
      } else {
        console.error('[BangBangRenderer] GPU backend initialization failed, falling back to CPU');
        await this._initCPUBackend(parameters);
      }
    } catch (error) {
      console.error('[BangBangRenderer] GPU backend initialization error:', error);
      console.log('[BangBangRenderer] Falling back to CPU backend');
      await this._initCPUBackend(parameters);
    }
  }

  /**
   * Initialize backend automatically (GPU with CPU fallback)
   * @private
   */
  async _initAutoBackend(parameters) {
    console.log('[BangBangRenderer] Auto backend selection: trying GPU first...');
    
    try {
      this._backend = new GPUBackend(parameters);
      const success = await this._backend.initialize();
      
      if (success) {
        console.log(`[BangBangRenderer] Auto selected GPU backend (${this._backend.gpuAPI})`);
      } else {
        console.log('[BangBangRenderer] GPU not available, falling back to CPU');
        
        // Always create a fresh canvas for CPU fallback to avoid canvas tainting issues
        // (GPU initialization may have called getContext('webgpu') or getContext('webgl2'))
        const canvas = parameters.canvas;
        const newCanvas = document.createElement('canvas');
        newCanvas.width = canvas.width || 512;
        newCanvas.height = canvas.height || 512;
        newCanvas.style.width = canvas.style.width || '512px';
        newCanvas.style.height = canvas.style.height || '512px';
        newCanvas.id = canvas.id; // Copy ID so getElementById still works
        
        console.log('[BangBangRenderer] Created fresh canvas for CPU fallback');
        
        // Replace old canvas in DOM if it has a parent
        if (canvas.parentNode) {
          canvas.parentNode.replaceChild(newCanvas, canvas);
          console.log('[BangBangRenderer] Replaced canvas in DOM');
        }
        
        // Update parameters with new canvas and renderer reference
        parameters = { ...parameters, canvas: newCanvas };
        this.canvas = newCanvas;
        
        await this._initCPUBackend(parameters);
      }
    } catch (error) {
      console.log('[BangBangRenderer] GPU initialization failed, falling back to CPU');
      console.log('[BangBangRenderer] Error was:', error.message);
      
      // Always create a fresh canvas for CPU fallback to avoid canvas tainting issues
      const canvas = parameters.canvas;
      const newCanvas = document.createElement('canvas');
      newCanvas.width = canvas.width || 512;
      newCanvas.height = canvas.height || 512;
      newCanvas.style.width = canvas.style.width || '512px';
      newCanvas.style.height = canvas.style.height || '512px';
      newCanvas.id = canvas.id; // Copy ID so getElementById still works
      
      console.log('[BangBangRenderer] Created fresh canvas for CPU fallback after error');
      
      if (canvas.parentNode) {
        canvas.parentNode.replaceChild(newCanvas, canvas);
        console.log('[BangBangRenderer] Replaced canvas in DOM');
      }
      
      // Update parameters with new canvas and renderer reference  
      parameters = { ...parameters, canvas: newCanvas };
      this.canvas = newCanvas;
      
      await this._initCPUBackend(parameters);
    }
  }

  /**
   * Check if renderer is ready to render
   */
  isReady() {
    return this._initialized && this._backend && this._backend.isReady();
  }

  /**
   * Get the backend type being used
   */
  get backendType() {
    return this._backend ? this._backend.backendType : 'unknown';
  }

  /**
   * Get the backend instance (for advanced usage)
   */
  get backend() {
    return this._backend;
  }

  /**
   * Get backend capabilities
   */
  get capabilities() {
    return this._backend ? this._backend.capabilities : {};
  }

  /**
   * Set the size of the renderer
   */
  setSize(width, height, updateStyle = true) {
    if (!this._initialized) {
      console.warn('[BangBangRenderer] setSize called before initialization. Call await renderer.initialize() first.');
      return;
    }
    if (this._backend) {
      this._backend.setSize(width, height, updateStyle);
    }
  }

  /**
   * Set the pixel ratio
   */
  setPixelRatio(pixelRatio) {
    if (!this._initialized) {
      console.warn('[BangBangRenderer] setPixelRatio called before initialization. Call await renderer.initialize() first.');
      return;
    }
    if (this._backend) {
      this._backend.setPixelRatio(pixelRatio);
    }
  }

  /**
   * Set clear color
   */
  setClearColor(color, alpha = 1) {
    if (!this._initialized) {
      console.warn('[BangBangRenderer] setClearColor called before initialization. Call await renderer.initialize() first.');
      return;
    }
    if (this._backend) {
      this._backend.setClearColor(color, alpha);
    }
  }

  // ─── Screen-Space Reflections ──────────────────────────────────────────

  /**
   * Enable or disable Screen-Space Reflections.
   * Requires WebGL2 backend.
   *
   * @param {boolean} on
   * @param {Object}  [options]  SSR tuning overrides (maxDistance, stepCount, etc.)
   */
  enableSSR(on = true, options = {}) {
    if (!this._initialized || !this._backend) {
      console.warn('[BangBangRenderer] enableSSR called before initialization');
      return;
    }
    if (typeof this._backend.enableSSR === 'function') {
      this._backend.enableSSR(on, options);
    } else {
      console.warn('[BangBangRenderer] Current backend does not support SSR');
    }
  }

  /** Direct access to SSR pass options (for runtime slider changes). */
  get ssrPass() {
    return this._backend ? this._backend.ssrPass : null;
  }

  // ─── Per-Camera Post-Processing ────────────────────────────────────

  /**
   * Enable ordered dithering on a camera.
   * Convenience wrapper that creates a PostFXPipeline + DitherPass.
   *
   * @param {Camera} camera
   * @param {Object} [options]  DitherPass options (strength, bias, invert, matrixSize)
   */
  enableDither(camera, options = {}) {
    if (!camera || !camera.isCamera) {
      console.warn('[BangBangRenderer] enableDither requires a Camera');
      return;
    }
    camera.setPostFXProfileSync(PostFXPipeline, 'mac_dither', options);
  }

  /**
   * Disable dithering on a camera.
   */
  disableDither(camera) {
    if (camera && camera.postFXPipeline) {
      const pass = camera.postFXPipeline.getPass('DitherPass');
      if (pass) pass.enabled = false;
      camera.postFXEnabled = false;
    }
  }

  /**
   * Get the DitherPass instance for a camera (if any).
   * @returns {DitherPass|null}
   */
  getDitherPass(camera) {
    if (camera && camera.postFXPipeline) {
      return camera.postFXPipeline.getPass('DitherPass');
    }
    return null;
  }

  /**
   * Expose PostFXPipeline constructor for external use.
   */
  static get PostFXPipeline() { return PostFXPipeline; }
  static get DitherPass() { return DitherPass; }

  // ─── Path Tracing ───────────────────────────────────────────────────────

  /**
   * Enable or disable path tracing mode.
   * Requires WebGPU backend with compute shader support.
   *
   * @param {boolean} on
   * @param {object}  [options]  PathTracer options
   */
  async enablePathTracing(on = true, options = {}) {
    if (!this._initialized || !this._backend) {
      console.warn('[BangBangRenderer] enablePathTracing called before initialization');
      return;
    }

    if (on) {
      if (!this._backend.device) {
        console.warn('[BangBangRenderer] Path tracing requires WebGPU backend');
        return;
      }
      if (!this._pathTracer) {
        this._pathTracer = new PathTracerRenderer(this._backend.device, this.canvas);
        await this._pathTracer.initialize();
      }
      if (Object.keys(options).length > 0) {
        this._pathTracer.setOptions(options);
      }
      this._pathTracingEnabled = true;
      console.log('[BangBangRenderer] Path tracing enabled');
    } else {
      this._pathTracingEnabled = false;
      console.log('[BangBangRenderer] Path tracing disabled (raster mode)');
    }
  }

  /** Direct access to path tracer instance. */
  get pathTracer() {
    return this._pathTracer || null;
  }

  /** Whether path tracing is currently active. */
  get isPathTracing() {
    return !!this._pathTracingEnabled;
  }

  /**
   * Clear buffers
   */
  clear() {
    if (!this._initialized) {
      console.warn('[BangBangRenderer] clear called before initialization. Call await renderer.initialize() first.');
      return;
    }
    if (this._backend) {
      this._backend.clear();
    }
  }

  /**
   * Render a scene with a camera
   */
  async render(scene, camera) {
    if (!this._initialized) {
      throw new Error('BangBangRenderer: Must call await renderer.initialize() before rendering');
    }

    if (!this._backend || !this._backend.isReady()) {
      console.error('[BangBangRenderer] Backend not ready for rendering');
      return;
    }

    // Path tracing mode
    if (this._pathTracingEnabled && this._pathTracer) {
      this._pathTracer.render(camera);
      return;
    }

    this._backend.render(scene, camera);
  }

  /**
   * Get stats/info about rendering
   */
  get info() {
    return this._backend ? this._backend.info : { render: { frame: 0, triangles: 0 } };
  }

  /**
   * Get the rendering context (for backward compatibility)
   * Returns 2D context for CPU backend, WebGPU/WebGL2 context for GPU backend
   */
  getContext() {
    return this._backend ? this._backend.context : null;
  }

  /**
   * Get debug info about camera and rendering state
   */
  getDebugInfo() {
    if (this._backend) {
      return this._backend.getDebugInfo();
    }
    return {
      backend: 'unknown',
      frame: 0,
      triangles: 0
    };
  }

  /**
   * Dispose of resources
   */
  dispose() {
    if (this._pathTracer) {
      this._pathTracer.dispose();
      this._pathTracer = null;
    }
    if (this._backend) {
      this._backend.dispose();
      this._backend = null;
    }
  }
}
