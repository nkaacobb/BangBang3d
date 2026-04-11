import { Backend } from './Backend.js';
import { Color } from '../../math/Color.js';
import { Matrix4 } from '../../math/Matrix4.js';
import { GPUResourceManager } from '../resources/GPUResourceManager.js';
import { BasicMaterialShader } from '../shaders/BasicMaterialShader.js';
import { LambertMaterialShader } from '../shaders/LambertMaterialShader.js';
import { PBRMaterialShader } from '../shaders/PBRMaterialShader.js';
import { DebugMaterialShader } from '../shaders/DebugMaterialShader.js';
import { GridOverlayShader } from '../shaders/GridOverlayShader.js';
import { ShadowDepthShader } from '../shaders/ShadowDepthShader.js';
import { PMREMGenerator } from '../ibl/PMREMGenerator.js';
import { CubeTexture } from '../../resources/CubeTexture.js';
import { SSRPass, SSR_DEFAULTS } from '../postprocessing/SSRPass.js';
import { PointCloudShader } from '../shaders/PointCloudShader.js';
import { GaussianSplatShader } from '../shaders/GaussianSplatShader.js';

/**
 * GPUBackend - GPU-accelerated rendering backend
 * 
 * Phase 1: Bootstrap and initialization (COMPLETE)
 * Phase 2: Shader-driven baseline renderer with parity (COMPLETE)
 * Phase 3: Render graph and post-processing (COMPLETE)
 * Phase 4: Lighting, shadows, and PBR (COMPLETE)
 * Phase 5: Compute workloads, animation, instancing (COMPLETE)
 * 
 * Implements WebGPU (primary) and WebGL2 (fallback) rendering.
 */
export class GPUBackend extends Backend {
  constructor(parameters = {}) {
    super(parameters);

    this.backendType = 'gpu';

    // GPU API references
    this.adapter = null;
    this.device = null;
    this.context = null;
    this.format = null;
    this.gpuAPI = null;

    // Phase 2: Resource management
    this.resourceManager = null;
    this.shaders = new Map();
    this.pipelines = new Map();
    
    // Depth texture/buffer
    this.depthTexture = null;

    // Clear color
    this.clearColor = new Color(0, 0, 0);

    // Ready state
    this._ready = false;
    this._initError = null;
    this.lastError = null; // Structured error object for debugging GPU init failures

    // Geometry cache (mesh ID -> GPU buffers)
    this.geometryCache = new Map();
    
    // Phase 1: Shadow map resources (light UUID -> shadow map resources)
    this.shadowMaps = new Map();

    // Phase 5: IBL resources
    this._pmremGenerator = null;
    this._iblEnvMapKey = null;       // Key in resourceManager for prefiltered envmap cubemap
    this._iblBRDFLUTKey = null;      // Key in resourceManager for BRDF LUT 2D texture
    this._iblEnvMapMaxLod = 0;       // Number of mip levels in prefiltered envmap
    this._iblSceneEnvVersion = null; // Track scene.environment identity to detect changes

    // SSR (Screen-Space Reflections)
    this._ssrEnabled = false;
    this._ssrPass = null;
    this._ssrGBuffer = null;       // { fbo, color, depth, normals, material, width, height }
    this._ssrDebug = false;        // console.log diagnostics

    // Point Cloud / Gaussian Splat GPU caches
    this._pointCloudCache = new Map(); // uuid -> { vao, posBuf, colBuf, count }
    this._splatCache = new Map();      // uuid -> { vao, quadBuf, idxBuf, dataTex0..3, sortTex, count }

    // Per-camera PostFX redirect target (set per-frame by render())
    this._postFXRedirectTarget = null;
  }

  /**
   * Initialize GPU backend
   * @param {string} preferredAPI - Force specific API: 'webgpu' or 'webgl2'
   */
  async initialize(preferredAPI = null) {
    console.log('[GPUBackend] Initializing GPU backend...');

    // If WebGPU is explicitly requested, only try WebGPU (no fallback)
    if (preferredAPI === 'webgpu') {
      console.log('[GPUBackend] WebGPU explicitly requested');
      if (await this._initWebGPU()) {
        this.gpuAPI = 'webgpu';
        this.backendType = 'gpu-webgpu';
        this._updateCapabilities();
        
        try {
          this._setupRenderingPipeline();
          this._ready = true;
          console.log('[GPUBackend] Successfully initialized WebGPU backend');
          return true;
        } catch (error) {
          console.error('[GPUBackend] WebGPU rendering pipeline setup failed:', error);
          this._recordError('webgpu_pipeline', 'WebGPU rendering pipeline setup failed', error);
          return false;
        }
      }
      
      this._initError = 'WebGPU initialization failed';
      console.error(`[GPUBackend] Initialization failed: ${this._initError}`);
      return false;
    }

    // If WebGL2 is explicitly requested, skip WebGPU
    if (preferredAPI === 'webgl2') {
      console.log('[GPUBackend] WebGL2 explicitly requested, skipping WebGPU');
      if (await this._initWebGL2()) {
        this.gpuAPI = 'webgl2';
        this.backendType = 'gpu-webgl2';
        this._updateCapabilities();
        
        try {
          this._setupRenderingPipeline();
          this._ready = true;
          console.log('[GPUBackend] Successfully initialized WebGL2 backend');
          console.log('[GPUBackend] Phase 2: Shader-driven rendering enabled');
          return true;
        } catch (error) {
          console.error('[GPUBackend] WebGL2 rendering pipeline setup failed:', error);
          this._recordError('webgl2_pipeline', 'WebGL2 rendering pipeline setup failed', error);
          return false;
        }
      }
      
      this._initError = 'WebGL2 initialization failed';
      console.error(`[GPUBackend] Initialization failed: ${this._initError}`);
      return false;
    }

    // Try WebGPU first
    if (await this._initWebGPU()) {
      this.gpuAPI = 'webgpu';
      this.backendType = 'gpu-webgpu';
      this._updateCapabilities();
      
      try {
        this._setupRenderingPipeline();
        this._ready = true;
        console.log('[GPUBackend] Successfully initialized WebGPU backend');
        console.log('[GPUBackend] Phase 2: Shader-driven rendering enabled');
        return true;
      } catch (error) {
        console.error('[GPUBackend] WebGPU rendering pipeline setup failed:', error);
        this._recordError('webgpu_pipeline', 'WebGPU rendering pipeline setup failed', error);
        // Don't return false - will try WebGL2 fallback below
      }
    }

    console.warn('[GPUBackend] WebGPU not available, trying WebGL2 fallback...');

    // Try WebGL2 fallback
    if (await this._initWebGL2()) {
      this.gpuAPI = 'webgl2';
      this.backendType = 'gpu-webgl2';
      this._updateCapabilities();
      
      try {
        this._setupRenderingPipeline();
        this._ready = true;
        console.log('[GPUBackend] Successfully initialized WebGL2 backend');
        console.log('[GPUBackend] Phase 2: Shader-driven rendering enabled');
        return true;
      } catch (error) {
        console.error('[GPUBackend] WebGL2 rendering pipeline setup failed:', error);
        this._recordError('webgl2_pipeline', 'WebGL2 rendering pipeline setup failed', error);
        return false;
      }
    }

    this._initError = 'Neither WebGPU nor WebGL2 are available';
    console.error(`[GPUBackend] Initialization failed: ${this._initError}`);
    return false;
  }

  /**
   * Initialize WebGPU
   */
  async _initWebGPU() {
    try {
      if (!navigator.gpu) {
        console.log('[GPUBackend] WebGPU not supported by browser');
        return false;
      }

      this.adapter = await navigator.gpu.requestAdapter();
      if (!this.adapter) {
        console.log('[GPUBackend] Failed to get WebGPU adapter');
        return false;
      }

      this.device = await this.adapter.requestDevice();
      if (!this.device) {
        console.log('[GPUBackend] Failed to get WebGPU device');
        return false;
      }

      // Listen for device errors
      this.device.addEventListener('uncapturederror', (event) => {
        console.error('[WebGPU] Uncaptured error:', event.error);
      });

      this.context = this.canvas.getContext('webgpu');
      if (!this.context) {
        console.error('[GPUBackend] Failed to get WebGPU canvas context');
        console.error('[GPUBackend] Canvas may already have a different context type');
        console.error('[GPUBackend] Try refreshing the page or using a fresh canvas');
        return false;
      }

      console.log('[GPUBackend] Successfully obtained WebGPU context');

      // Add error scope and uncaptured error handler for debugging
      this.device.addEventListener('uncapturederror', (event) => {
        console.error('[WebGPU] Uncaptured error:', event.error);
        console.error('[WebGPU] Error type:', event.error.constructor.name);
        console.error('[WebGPU] Error message:', event.error.message);
      });
      console.log('[GPUBackend] Error handlers installed');

      this.format = navigator.gpu.getPreferredCanvasFormat();
      console.log('[GPUBackend] Preferred canvas format:', this.format);

      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: 'opaque'
      });

      this.canvas.width = Math.floor(this.width * this.pixelRatio);
      this.canvas.height = Math.floor(this.height * this.pixelRatio);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      console.log('[GPUBackend] Canvas size set to:', this.canvas.width, 'x', this.canvas.height);

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
      // Check WebGL2 support without tainting canvas
      const testCanvas = document.createElement('canvas');
      const testContext = testCanvas.getContext('webgl2');
      if (!testContext) {
        console.log('[GPUBackend] WebGL2 not supported by browser');
        return false;
      }
      
      this.context = this.canvas.getContext('webgl2', {
        alpha: false,
        depth: true,
        stencil: false,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false
      });

      if (!this.context) {
        console.log('[GPUBackend] WebGL2 context creation failed');
        return false;
      }

      this.canvas.width = Math.floor(this.width * this.pixelRatio);
      this.canvas.height = Math.floor(this.height * this.pixelRatio);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;

      this.context.viewport(0, 0, this.canvas.width, this.canvas.height);

      // Enable depth testing
      this.context.enable(this.context.DEPTH_TEST);
      this.context.depthFunc(this.context.LEQUAL);

      // Enable backface culling
      this.context.enable(this.context.CULL_FACE);
      this.context.cullFace(this.context.BACK);

      return true;
    } catch (error) {
      console.error('[GPUBackend] WebGL2 initialization error:', error);
      return false;
    }
  }

  /**
   * Setup rendering pipeline (Phase 2+)
   */
  _setupRenderingPipeline() {
    try {
      // Initialize resource manager
      const context = this.gpuAPI === 'webgpu' ? this.device : this.context;
      this.resourceManager = new GPUResourceManager(this.gpuAPI, context);

      // Create and compile basic material shader
      const basicShader = new BasicMaterialShader();
      try {
        basicShader.compile(this.gpuAPI, context);
        this.shaders.set('BasicMaterial', basicShader);
      } catch (shaderError) {
        this._recordError('shader_compilation', 'BasicMaterialShader compilation failed', shaderError);
        throw shaderError;
      }

      // Create and compile Lambert material shader (Phase 3: Lighting)
      const lambertShader = new LambertMaterialShader();
      try {
        lambertShader.compile(this.gpuAPI, context);
        this.shaders.set('LambertMaterial', lambertShader);
      } catch (shaderError) {
        this._recordError('shader_compilation', 'LambertMaterialShader compilation failed', shaderError);
        throw shaderError;
      }

      // Create and compile PBR material shader (Phase 4)
      const pbrShader = new PBRMaterialShader();
      try {
        pbrShader.compile(this.gpuAPI, context);
        this.shaders.set('PBRMaterial', pbrShader);
      } catch (shaderError) {
        this._recordError('shader_compilation', 'PBRMaterialShader compilation failed', shaderError);
        throw shaderError;
      }

      // Create and compile Debug material shader
      const debugShader = new DebugMaterialShader();
      try {
        debugShader.compile(this.gpuAPI, context);
        this.shaders.set('DebugMaterial', debugShader);
      } catch (shaderError) {
        this._recordError('shader_compilation', 'DebugMaterialShader compilation failed', shaderError);
        throw shaderError;
      }

      // Create and compile GridOverlay material shader
      const gridOverlayShader = new GridOverlayShader();
      try {
        gridOverlayShader.compile(this.gpuAPI, context);
        this.shaders.set('GridOverlayMaterial', gridOverlayShader);
      } catch (shaderError) {
        this._recordError('shader_compilation', 'GridOverlayShader compilation failed', shaderError);
        throw shaderError;
      }
      
      // Phase 1: Create and compile Shadow Depth shader
      const shadowDepthShader = new ShadowDepthShader();
      try {
        shadowDepthShader.compile(this.gpuAPI, context);
        this.shaders.set('ShadowDepth', shadowDepthShader);
      } catch (shaderError) {
        this._recordError('shader_compilation', 'ShadowDepthShader compilation failed', shaderError);
        throw shaderError;
      }

      // PointCloud shader (WebGL2 only — silently skip on WebGPU)
      if (this.gpuAPI === 'webgl2') {
        try {
          const pcShader = new PointCloudShader();
          pcShader.compile('webgl2', context);
          this.shaders.set('PointCloud', pcShader);
        } catch (e) {
          console.warn('[GPUBackend] PointCloudShader compilation failed:', e);
        }

        // GaussianSplat shader
        try {
          const gsShader = new GaussianSplatShader();
          gsShader.compile('webgl2', context);
          this.shaders.set('GaussianSplat', gsShader);
        } catch (e) {
          console.warn('[GPUBackend] GaussianSplatShader compilation failed:', e);
        }
      }

      // Create depth texture
      try {
        this._createDepthTexture();
      } catch (depthError) {
        this._recordError('depth_texture', 'Depth texture creation failed', depthError);
        throw depthError;
      }

      // Create render pipeline for WebGPU
      if (this.gpuAPI === 'webgpu') {
        try {
          this._createWebGPURenderPipeline();
        } catch (pipelineError) {
          this._recordError('pipeline_creation', 'WebGPU render pipeline creation failed', pipelineError);
          throw pipelineError;
        }
      }

      console.log('[GPUBackend] Rendering pipeline setup complete');
      console.log('[GPUBackend] Phase 4: PBR material support enabled');
    } catch (error) {
      console.error('[GPUBackend] Rendering pipeline setup failed:', error);
      throw error;
    }
  }

  /**
   * Create depth texture
   */
  _createDepthTexture() {
    if (this.gpuAPI === 'webgpu') {
      this.depthTexture = this.device.createTexture({
        size: {
          width: this.canvas.width,
          height: this.canvas.height,
          depthOrArrayLayers: 1
        },
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT
      });
    }
    // WebGL2 handles depth buffer automatically
  }

  /**
   * Create WebGPU render pipelines for all material types
   */
  _createWebGPURenderPipeline() {
    // Create pipelines for each material type
    this._createPipelineForMaterial('BasicMaterial');
    this._createPipelineForMaterial('LambertMaterial');
    this._createPipelineForMaterial('PBRMaterial');
    this._createPipelineForMaterial('DebugMaterial');
    this._createPipelineForMaterial('GridOverlayMaterial');
  }

  /**
   * Create WebGPU render pipeline for a specific material type
   */
  _createPipelineForMaterial(materialType) {
    const shader = this.shaders.get(materialType);
    if (!shader || !shader.compiled) {
      console.warn(`[GPUBackend] Shader not compiled for ${materialType}, skipping pipeline creation`);
      return;
    }
    
    // Create bind group layout - different for each material type
    const bindGroupEntries = [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' }
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' }
      }
    ];

    // LambertMaterial and PBRMaterial need lighting uniform
    // DebugMaterial and GridOverlayMaterial don't need lighting
    const needsExtraUniforms = (materialType === 'LambertMaterial' || materialType === 'PBRMaterial');
    if (needsExtraUniforms) {
      bindGroupEntries.push({
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' }
      });
    }

    // All materials need sampler and texture (except DebugMaterial and GridOverlayMaterial)
    if (materialType !== 'DebugMaterial' && materialType !== 'GridOverlayMaterial') {
      const samplerBinding = needsExtraUniforms ? 3 : 2;
      const textureBinding = needsExtraUniforms ? 4 : 3;
      
      bindGroupEntries.push(
        {
          binding: samplerBinding,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: {}
        },
        {
          binding: textureBinding,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {}
        }
      );
    }

    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: bindGroupEntries
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout]
    });

    // Opaque pipeline
    const opaquePipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shader.compiled.vertexModule,
        entryPoint: 'main',
        buffers: [
          {
            arrayStride: 32, // 3 pos + 3 normal + 2 uv = 8 floats = 32 bytes
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' }, // position
              { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal
              { shaderLocation: 2, offset: 24, format: 'float32x2' } // uv
            ]
          }
        ]
      },
      fragment: {
        module: shader.compiled.fragmentModule,
        entryPoint: 'main',
        targets: [{
          format: this.format,
          blend: undefined // Opaque - no blending
        }]
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: (materialType === 'GridOverlayMaterial' || materialType === 'DebugMaterial') ? 'none' : 'back',
        frontFace: 'ccw'
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less'
      }
    });

    // Transparent pipeline
    const transparentPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shader.compiled.vertexModule,
        entryPoint: 'main',
        buffers: [
          {
            arrayStride: 32,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
              { shaderLocation: 2, offset: 24, format: 'float32x2' }
            ]
          }
        ]
      },
      fragment: {
        module: shader.compiled.fragmentModule,
        entryPoint: 'main',
        targets: [{
          format: this.format,
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add'
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add'
            }
          }
        }]
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: (materialType === 'GridOverlayMaterial' || materialType === 'DebugMaterial') ? 'none' : 'back',
        frontFace: 'ccw'
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: false,
        depthCompare: 'less'
      }
    });

    this.pipelines.set(`${materialType}_opaque`, { pipeline: opaquePipeline, bindGroupLayout });
    this.pipelines.set(`${materialType}_transparent`, { pipeline: transparentPipeline, bindGroupLayout });
  }

  /**
   * Update capabilities based on API
   */
  _updateCapabilities() {
    if (this.gpuAPI === 'webgpu') {
      this.capabilities.hasDepthTexture = true;
      this.capabilities.hasMSAA = true;
      this.capabilities.maxTextureSize = this.device?.limits?.maxTextureDimension2D || 8192;
      this.capabilities.maxColorAttachments = this.device?.limits?.maxColorAttachments || 8;
      this.capabilities.supportsFloatTextures = true;
      this.capabilities.supportsTextures = true; // GPU supports texture mapping
      this.capabilities.supportsLighting = true; // GPU supports lighting
      this.capabilities.supportsShaders = true; // Phase 2
      this.capabilities.supportsCompute = true;
      this.capabilities.supportsStorageBuffers = true;
      this.capabilities.supportsRenderTargets = true; // Phase 3
      this.capabilities.supportsPostProcessing = true; // Phase 3
      this.capabilities.supportsPBR = true; // Phase 4
      this.capabilities.supportsShadows = true; // Phase 4
      this.capabilities.supportsPointLights = true; // Phase 4
      this.capabilities.supportsSpotLights = true; // Phase 4
      this.capabilities.supportsInstancing = true; // Phase 5
      this.capabilities.supportsComputeShaders = true; // Phase 5
      this.capabilities.supportsFrustumCulling = true; // Phase 5
      this.capabilities.supportsSkeletalAnimation = true; // Phase 5
      this.capabilities.supportsGPUSkinning = true; // Phase 5
      this.capabilities.supportsParticles = true; // Phase 5
      this.capabilities.supportsBatching = true; // Phase 5
      this.capabilities.supportsReflections = true; // Phase 5
      this.capabilities.supportsIBL = true; // Phase 5
      this.capabilities.supportsCubemaps = true; // Phase 5
    } else if (this.gpuAPI === 'webgl2') {
      const gl = this.context;
      this.capabilities.hasDepthTexture = true;
      this.capabilities.hasMSAA = true;
      this.capabilities.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      this.capabilities.maxColorAttachments = gl.getParameter(gl.MAX_DRAW_BUFFERS);
      this.capabilities.supportsFloatTextures = gl.getExtension('EXT_color_buffer_float') !== null;
      this.capabilities.supportsTextures = true; // WebGL2 supports texture mapping
      this.capabilities.supportsLighting = true; // WebGL2 supports lighting
      this.capabilities.supportsShaders = true; // Phase 2
      this.capabilities.supportsCompute = false;
      this.capabilities.supportsStorageBuffers = false;
      this.capabilities.supportsRenderTargets = true; // Phase 3
      this.capabilities.supportsPostProcessing = true; // Phase 3
      this.capabilities.supportsPBR = true; // Phase 4
      this.capabilities.supportsShadows = true; // Phase 4
      this.capabilities.supportsPointLights = true; // Phase 4
      this.capabilities.supportsSpotLights = true; // Phase 4
      this.capabilities.supportsInstancing = true; // Phase 5
      this.capabilities.supportsComputeShaders = false; // Phase 5 (WebGL2 limitation)
      this.capabilities.supportsFrustumCulling = false; // Phase 5 (needs compute)
      this.capabilities.supportsSkeletalAnimation = true; // Phase 5
      this.capabilities.supportsGPUSkinning = false; // Phase 5 (needs compute)
      this.capabilities.supportsParticles = false; // Phase 5 (needs compute)
      this.capabilities.supportsBatching = true; // Phase 5
      this.capabilities.supportsReflections = true; // Phase 5
      this.capabilities.supportsIBL = true; // Phase 5
      this.capabilities.supportsCubemaps = true; // Phase 5
    }
  }

  /**
   * Record structured error information for debugging GPU init failures
   * @private
   */
  _recordError(stage, message, error) {
    this.lastError = {
      stage,
      message,
      error: error.message || String(error),
      stack: error.stack,
      api: this.gpuAPI || 'unknown',
      timestamp: Date.now()
    };

    // For shader compilation errors, try to extract detailed info
    if (stage === 'shader_compilation' && error.message) {
      // Extract shader info log if present
      const infoLogMatch = error.message.match(/compilation failed: (.+)/i);
      if (infoLogMatch) {
        this.lastError.shaderInfoLog = infoLogMatch[1];
      }

      // For WebGL2, the compile method already includes getShaderInfoLog in the error message
      // For WebGPU, validation errors are in the error message
      this.lastError.compilerLog = error.message;
    }

    console.error(`[GPUBackend] Error recorded at stage "${stage}":`, this.lastError);
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

    // Reconfigure WebGPU context when canvas size changes
    if (this._ready && this.gpuAPI === 'webgpu' && this.context) {
      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: 'opaque'
      });
    }

    // Recreate depth texture
    if (this._ready && this.depthTexture) {
      if (this.gpuAPI === 'webgpu') {
        this.depthTexture.destroy();
        this._createDepthTexture();
      }
    }

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
   * Clear buffers
   */
  clear() {
    if (this.gpuAPI === 'webgl2') {
      const gl = this.context;
      gl.clearColor(this.clearColor.r, this.clearColor.g, this.clearColor.b, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
    // WebGPU clear happens in render pass
  }

  /**
   * Phase 1: Render shadow maps for shadow-casting lights
   * @param {Scene} scene - The scene to render shadows for
   */
  _renderShadowMaps(scene) {
    // Collect shadow-casting lights (capped by maxShadowLights)
    const shadowLights = [];
    let pointLightsWithShadows = 0;
    
    scene.traverse((object) => {
      if (object.isLight && object.castShadow) {
        // Only support DirectionalLight and SpotLight in Phase 1
        if (object.isDirectionalLight || object.isSpotLight) {
          shadowLights.push(object);
        } else if (object.isPointLight) {
          pointLightsWithShadows++;
        }
      }
    });

    // Warn about PointLight shadows (Phase 2 feature) - only warn once
    if (pointLightsWithShadows > 0 && !this._warnedPointLightShadows) {
      this._warnedPointLightShadows = true;
      console.warn(`[GPUBackend] ${pointLightsWithShadows} PointLight(s) with castShadow=true found. PointLight shadows require cubemaps (Phase 2). Use DirectionalLight or SpotLight for Phase 1 shadows.`);
    }

    // Cap at maxShadowLights
    const maxLights = this._renderer.shadows.maxShadowLights;
    if (shadowLights.length > maxLights) {
      console.warn(`[GPUBackend] ${shadowLights.length} shadow lights found, capping at ${maxLights}`);
      shadowLights.splice(maxLights);
    }

    if (shadowLights.length === 0) {
      return; // No shadow-casting lights
    }

    // Collect shadow casters (meshes with castShadow = true)
    const shadowCasters = [];
    scene.traverse((object) => {
      if (object.isMesh && object.castShadow && object.visible) {
        shadowCasters.push(object);
      }
    });

    if (shadowCasters.length === 0) {
      return; // No shadow casters
    }

    // Render shadow map for each light
    for (const light of shadowLights) {
      this._renderShadowMapForLight(light, shadowCasters);
    }
  }

  /**
   * Phase 1: Render shadow map for a single light
   * @param {Light} light - Shadow-casting light
   * @param {Array} casters - Meshes that cast shadows
   */
  _renderShadowMapForLight(light, casters) {
    // Initialize or get shadow camera
    if (!light.shadow.camera) {
      if (light.initShadowCamera) {
        light.initShadowCamera();
      } else {
        console.error('[GPUBackend] Light does not have initShadowCamera method');
        return;
      }
    }

    // Update shadow camera to match light position/direction
    if (light.updateShadowCamera) {
      light.updateShadowCamera();
    }

    const shadowCamera = light.shadow.camera;

    // Create or get shadow map resources
    let shadowMapData = this.shadowMaps.get(light.uuid);
    if (!shadowMapData || 
        shadowMapData.width !== light.shadow.mapSize.width ||
        shadowMapData.height !== light.shadow.mapSize.height) {
      // Create new shadow map resources
      shadowMapData = this._createShadowMapResources(light);
      this.shadowMaps.set(light.uuid, shadowMapData);
    }

    // Render shadow map (WebGL2 implementation)
    if (this.gpuAPI === 'webgl2') {
      this._renderShadowMapWebGL2(light, shadowCamera, casters, shadowMapData);
    } else {
      // WebGPU implementation (future)
      console.warn('[GPUBackend] WebGPU shadow maps not yet implemented');
    }

    // Store shadow matrix for use in main pass
    const shadowMatrix = new Matrix4();
    const biasMatrix = new Matrix4();
    biasMatrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0
    );

    shadowMatrix.multiplyMatrices(biasMatrix, shadowCamera.projectionMatrix);
    shadowMatrix.multiply(shadowCamera.matrixWorldInverse);
    light.shadow.matrix = shadowMatrix;
  }

  /**
   * Phase 1: Create shadow map resources for a light (WebGL2)
   */
  _createShadowMapResources(light) {
    const width = light.shadow.mapSize.width;
    const height = light.shadow.mapSize.height;

    if (this.gpuAPI === 'webgl2') {
      const gl = this.context;

      // Create framebuffer
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

      // Create depth texture
      const depthTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, depthTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.DEPTH_COMPONENT24,
        width,
        height,
        0,
        gl.DEPTH_COMPONENT,
        gl.UNSIGNED_INT,
        null
      );

      // Set texture parameters
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      // Attach depth texture to framebuffer
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.DEPTH_ATTACHMENT,
        gl.TEXTURE_2D,
        depthTexture,
        0
      );

      // Check framebuffer status
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) {
        console.error('[GPUBackend] Shadow map framebuffer incomplete:', status);
      }

      // Unbind
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);

      return {
        framebuffer,
        depthTexture,
        width,
        height
      };
    }

    return null;
  }

  /**
   * Phase 1: Render shadow map using WebGL2
   */
  _renderShadowMapWebGL2(light, shadowCamera, casters, shadowMapData) {
    const gl = this.context;
    const shader = this.shaders.get('ShadowDepth');
    if (!shader || !shader.compiled) {
      console.error('[GPUBackend] ShadowDepth shader not compiled');
      return;
    }

    const program = shader.compiled.program;
    const uniformLocs = shader.compiled.uniformLocations;
    const attrLocs = shader.compiled.attributeLocations;

    // Bind shadow map framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowMapData.framebuffer);
    gl.viewport(0, 0, shadowMapData.width, shadowMapData.height);

    // Clear depth buffer
    gl.clear(gl.DEPTH_BUFFER_BIT);

    // Use shadow depth shader
    gl.useProgram(program);

    // Enable depth test
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    // Disable color writes (depth only)
    gl.colorMask(false, false, false, false);

    // Compute light view-projection matrix
    shadowCamera.updateMatrixWorld(true);
    const viewMatrix = shadowCamera.matrixWorldInverse;
    const projectionMatrix = shadowCamera.projectionMatrix;
    const lightViewProjection = new Matrix4();
    lightViewProjection.multiplyMatrices(projectionMatrix, viewMatrix);

    // Render each shadow caster
    for (const mesh of casters) {
      if (!mesh.geometry) continue;

      // Update mesh matrices
      mesh.updateMatrixWorld(true);
      const modelMatrix = mesh.matrixWorld;

      // Set uniforms
      gl.uniformMatrix4fv(uniformLocs.uLightViewProjection, false, lightViewProjection.elements);
      gl.uniformMatrix4fv(uniformLocs.uModel, false, modelMatrix.elements);

      // Get or create GPU buffers using the existing geometry cache (interleaved format)
      const geometryId = mesh.geometry.uuid || `geom_shadow_${Math.random()}`;
      let geometryBuffers = this.geometryCache.get(geometryId);
      if (!geometryBuffers) {
        geometryBuffers = this._createGeometryBuffersWebGL2(gl, mesh.geometry);
        this.geometryCache.set(geometryId, geometryBuffers);
      }
      if (!geometryBuffers) continue;

      // Bind position attribute from interleaved buffer (stride=32, offset=0)
      gl.bindBuffer(gl.ARRAY_BUFFER, geometryBuffers.vertexBuffer.buffer);
      gl.enableVertexAttribArray(attrLocs.aPosition);
      gl.vertexAttribPointer(attrLocs.aPosition, 3, gl.FLOAT, false, 32, 0);

      // Bind index buffer and draw
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geometryBuffers.indexBuffer.buffer);
      gl.drawElements(gl.TRIANGLES, geometryBuffers.indexCount, geometryBuffers.indexType, 0);
    }

    // Re-enable color writes
    gl.colorMask(true, true, true, true);

    // Restore depth function to default
    gl.depthFunc(gl.LESS);

    // Unbind framebuffer (restore main framebuffer)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Render a scene with a camera (Phase 2)
   */
  render(scene, camera) {
    this.info.render.frame++;
    this.info.render.triangles = 0;

    if (!this._ready) {
      console.error('[GPUBackend] Backend not ready for rendering');
      return;
    }

    // Set clear color from scene
    if (scene.background) {
      this.setClearColor(scene.background);
    }

    // Update camera matrices
    camera.updateMatrixWorld(true);

    // Update camera projection for WebGPU coordinate system if needed
    if (this.gpuAPI === 'webgpu') {
      if (camera.isPerspectiveCamera || camera.isOrthographicCamera) {
        camera.updateProjectionMatrix('webgpu');
      }
    }

    // Update scene matrices
    scene.updateMatrixWorld(true);

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

    // Phase 1: Shadow Maps - Render shadow maps if shadows enabled (WebGL2 only)
    if (this._renderer && this._renderer.shadows && this._renderer.shadows.enabled && this.gpuAPI === 'webgl2') {
      this._renderShadowMaps(scene);
    }

    // Collect meshes and separate into opaque and transparent
    const opaqueMeshes = [];
    const transparentMeshes = [];
    const pointClouds = [];
    const splatClouds = [];
    
    scene.traverseVisible((object) => {
      if (object.isMesh && object.visible) {
        if (object.material && object.material.transparent && object.material.opacity < 1.0) {
          const distance = camera.position.distanceTo(object.position);
          transparentMeshes.push({ mesh: object, distance });
        } else {
          opaqueMeshes.push(object);
        }
      } else if (object.isPointCloud && object.visible && object.count > 0) {
        pointClouds.push(object);
      } else if (object.isGaussianSplatCloud && object.visible && object.count > 0) {
        splatClouds.push(object);
      }
    });

    // Sort transparent meshes back-to-front
    transparentMeshes.sort((a, b) => b.distance - a.distance);

    // ── Per-camera PostFX: detect active pipeline ─────────────────────
    const postFXPipeline = camera.postFXPipeline;
    const postFXActive = camera.postFXEnabled && postFXPipeline && postFXPipeline.hasActivePasses();

    // Render based on API
    if (this.gpuAPI === 'webgpu') {
      this._renderWebGPU(scene, camera, opaqueMeshes, transparentMeshes);
    } else if (this.gpuAPI === 'webgl2') {
      // If PostFX is active, redirect the scene draw into an off-screen FBO
      if (postFXActive) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        postFXPipeline.ensureTargets(this, w, h);
        this._postFXRedirectTarget = postFXPipeline.inputTarget;
      } else {
        this._postFXRedirectTarget = null;
      }

      this._renderWebGL2(scene, camera, opaqueMeshes, transparentMeshes, pointClouds, splatClouds);

      // Execute post-processing chain
      if (postFXActive) {
        const gl = this.context;
        // Make sure we're unbound from any scene FBO
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        // Update dither viewport origin for per-camera stability
        for (const pass of postFXPipeline.passes) {
          if (pass.isDitherPass && pass.setViewportOrigin) {
            const vp = camera.viewport;
            pass.setViewportOrigin(vp ? vp.x : 0, vp ? vp.y : 0);
          }
        }
        postFXPipeline.execute(this, null);
        this._postFXRedirectTarget = null;
      }
    }

    this.present();
  }

  /**
   * Render with WebGPU (Phase 2)
   */
  _renderWebGPU(scene, camera, opaqueMeshes, transparentMeshes) {
    const commandEncoder = this.device.createCommandEncoder();
    const textureView = this.context.getCurrentTexture().createView();

    const renderPassDescriptor = {
      colorAttachments: [{
        view: textureView,
        clearValue: {
          r: this.clearColor.r,
          g: this.clearColor.g,
          b: this.clearColor.b,
          a: 1.0
        },
        loadOp: 'clear',
        storeOp: 'store'
      }],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store'
      }
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

    // Set viewport and scissor rect (required for WebGPU)
    passEncoder.setViewport(0, 0, this.canvas.width, this.canvas.height, 0, 1);
    passEncoder.setScissorRect(0, 0, this.canvas.width, this.canvas.height);

    // Render opaque meshes grouped by material type
    if (opaqueMeshes.length > 0) {
      const meshesByMaterial = this._groupMeshesByMaterialType(opaqueMeshes);
      
      for (const [materialType, meshes] of Object.entries(meshesByMaterial)) {
        let pipelineData = this.pipelines.get(`${materialType}_opaque`);
        if (!pipelineData) {
          console.warn(`[GPUBackend] No pipeline for ${materialType}_opaque, using BasicMaterial_opaque`);
          pipelineData = this.pipelines.get('BasicMaterial_opaque');
        }
        passEncoder.setPipeline(pipelineData.pipeline);

        for (const mesh of meshes) {
          this._drawMeshWebGPU(passEncoder, mesh, camera, scene, pipelineData.bindGroupLayout, materialType);
        }
      }
    }

    // Render transparent meshes grouped by material type
    if (transparentMeshes.length > 0) {
      const meshesByMaterial = this._groupMeshesByMaterialType(transparentMeshes.map(t => t.mesh));
      
      for (const [materialType, meshes] of Object.entries(meshesByMaterial)) {
        let pipelineData = this.pipelines.get(`${materialType}_transparent`);
        if (!pipelineData) {
          console.warn(`[GPUBackend] No pipeline for ${materialType}_transparent, using BasicMaterial_transparent`);
          pipelineData = this.pipelines.get('BasicMaterial_transparent');
        }
        passEncoder.setPipeline(pipelineData.pipeline);

        for (const mesh of meshes) {
          this._drawMeshWebGPU(passEncoder, mesh, camera, scene, pipelineData.bindGroupLayout, materialType);
        }
      }
    }

    passEncoder.end();
    
    const commandBuffer = commandEncoder.finish();
    this.device.queue.submit([commandBuffer]);
  }

  /**
   * Group meshes by material type for efficient pipeline switching
   */
  _groupMeshesByMaterialType(meshes) {
    const grouped = {};
    for (const mesh of meshes) {
      const materialType = mesh.material?.type || 'BasicMaterial';
      if (!grouped[materialType]) {
        grouped[materialType] = [];
      }
      grouped[materialType].push(mesh);
    }
    return grouped;
  }

  /**
   * Get material type string from material instance
   */
  _getMaterialType(material) {
    return material?.type || 'BasicMaterial';
  }

  /**
   * Draw a mesh with WebGPU
   */
  _drawMeshWebGPU(passEncoder, mesh, camera, scene, bindGroupLayout, materialType) {
    const geometry = mesh.geometry;
    const material = mesh.material;

    if (!geometry || !geometry.attributes.position) {
      return;
    }

    // Get or create geometry buffers
    const geometryId = geometry.uuid || `geom_${Math.random()}`;
    let geometryBuffers = this.geometryCache.get(geometryId);

    if (!geometryBuffers) {
      geometryBuffers = this._createGeometryBuffersWebGPU(geometry);
      this.geometryCache.set(geometryId, geometryBuffers);
    }

    // Calculate matrices
    mesh.updateMatrixWorld();
    const mvp = new Matrix4();
    mvp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    mvp.multiply(mesh.matrixWorld);

    // Create transform uniform buffer - size depends on material type
    let transformUniformData;
    
    if (materialType === 'LambertMaterial' || materialType === 'PBRMaterial' || materialType === 'DebugMaterial') {
      // LambertMaterial, PBRMaterial, and DebugMaterial need normal matrix (3 matrices = 192 bytes)
      const normalMatrix = new Matrix4();
      normalMatrix.copy(mesh.matrixWorld);
      normalMatrix.invert();
      normalMatrix.transpose();
      
      transformUniformData = new Float32Array([
        ...mvp.elements,
        ...mesh.matrixWorld.elements,
        ...normalMatrix.elements
      ]);
    } else {
      // BasicMaterial only needs MVP and model (2 matrices = 128 bytes)
      transformUniformData = new Float32Array([
        ...mvp.elements,
        ...mesh.matrixWorld.elements
      ]);
    }
    
    const transformUniformBuffer = this.device.createBuffer({
      size: transformUniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Float32Array(transformUniformBuffer.getMappedRange()).set(transformUniformData);
    transformUniformBuffer.unmap();

    // Create material uniform buffer - different per material type
    let materialUniformData;
    let materialUniformBuffer;
    
    if (materialType === 'DebugMaterial') {
      // DebugMaterial: mode (u32), depthNear (f32), depthFar (f32), uvScale (f32)
      // Map debug mode string to integer
      const modeMap = { 'normals': 0, 'depth': 1, 'uvs': 2, 'worldPosition': 3 };
      const mode = modeMap[material.mode] !== undefined ? modeMap[material.mode] : 0;
      
      materialUniformData = new Float32Array([
        mode, // Will be interpreted as u32 in shader
        material.depthNear || 1.0,
        material.depthFar || 100.0,
        material.uvScale || 1.0
      ]);
      materialUniformBuffer = this.device.createBuffer({
        size: 16, // 4 floats = 16 bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true
      });
    } else if (materialType === 'GridOverlayMaterial') {
      // GridOverlayMaterial: Complete struct (96 bytes with padding)
      // gridScale, gridOpacity, fadeDistance, adaptive (as f32),
      // axisXColor (vec4), axisZColor (vec4), horizonColor (vec4), majorLineInterval,
      // cameraPositionX, cameraPositionY, cameraPositionZ, gridAlpha, padding (3 floats)
      const axisX = material.axisXColor || { r: 0.8, g: 0.1, b: 0.1 };
      const axisZ = material.axisZColor || { r: 0.1, g: 0.8, b: 0.1 };
      const horizon = material.horizonColor || { r: 0.5, g: 0.5, b: 0.5 };
      
      materialUniformData = new Float32Array([
        material.gridScale !== undefined ? material.gridScale : 1.0,
        material.gridOpacity !== undefined ? material.gridOpacity : 0.5,
        material.fadeDistance !== undefined ? material.fadeDistance : 50.0,
        material.adaptive ? 1.0 : 0.0,
        axisX.r, axisX.g, axisX.b, 1.0,      // axisXColor vec4
        axisZ.r, axisZ.g, axisZ.b, 1.0,      // axisZColor vec4
        horizon.r, horizon.g, horizon.b, 1.0, // horizonColor vec4
        material.majorLineInterval !== undefined ? material.majorLineInterval : 10.0,
        camera.position.x, camera.position.y, camera.position.z,  // cameraPosition
        material.gridAlpha !== undefined ? material.gridAlpha : 0.65,  // gridAlpha
        material.gridColor ? material.gridColor.r : 0.5,  // gridColor.r
        material.gridColor ? material.gridColor.g : 0.5,  // gridColor.g
        material.gridColor ? material.gridColor.b : 0.5   // gridColor.b
      ]);
      materialUniformBuffer = this.device.createBuffer({
        size: 96, // 24 floats = 96 bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true
      });
    } else if (materialType === 'PBRMaterial') {
      // PBRMaterial: Complete MaterialUniforms struct (48 bytes)
      // baseColor (vec4), metallic, roughness, normalScale, aoIntensity,
      // envMapIntensity, emissiveIntensity, opacity, padding
      const color = material.color || { r: 1, g: 1, b: 1 };
      materialUniformData = new Float32Array([
        color.r, color.g, color.b, 1.0,           // baseColor vec4
        material.metallic !== undefined ? material.metallic : 0.0,        // metallic f32
        material.roughness !== undefined ? material.roughness : 0.5,      // roughness f32
        material.normalScale !== undefined ? material.normalScale : 1.0,  // normalScale f32
        material.aoIntensity !== undefined ? material.aoIntensity : 1.0,  // aoIntensity f32
        material.envMapIntensity !== undefined ? material.envMapIntensity : 1.0,  // envMapIntensity f32
        material.emissiveIntensity !== undefined ? material.emissiveIntensity : 1.0, // emissiveIntensity f32
        material.opacity !== undefined ? material.opacity : 1.0,          // opacity f32
        0.0                                        // padding f32
      ]);
      materialUniformBuffer = this.device.createBuffer({
        size: 48, // 12 floats = 48 bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true
      });
    } else {
      // BasicMaterial, LambertMaterial: color + opacity
      const materialColor = material.color || { r: 1, g: 1, b: 1 };
      materialUniformData = new Float32Array([
        materialColor.r, materialColor.g, materialColor.b, 1.0,
        material.opacity !== undefined ? material.opacity : 1.0,
        0, 0, 0 // padding
      ]);
      materialUniformBuffer = this.device.createBuffer({
        size: 32, // Align to 16 bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true
      });
    }
    
    new Float32Array(materialUniformBuffer.getMappedRange()).set(materialUniformData);
    materialUniformBuffer.unmap();

    // Create lighting uniform for Lambert and PBR materials
    let lightingUniformBuffer = null;
    if (materialType === 'LambertMaterial' || materialType === 'PBRMaterial') {
      // Collect lights from scene
      let lightDirection = { x: 0, y: -1, z: 0 };
      let lightColor = { r: 1, g: 1, b: 1 };
      let lightIntensity = 0.0; // Default to 0 if no directional light
      let ambientColor = { r: 0.2, g: 0.2, b: 0.2 };
      let ambientIntensity = 0.0; // Default to 0 if no ambient light
      
      // Hemisphere light
      let hemisphereEnabled = 0.0;
      let hemisphereSkyColor = { r: 1, g: 1, b: 1 };
      let hemisphereGroundColor = { r: 0, g: 0, b: 0 };
      let hemisphereIntensity = 0.0;
      
      // Point lights (max 8)
      const pointLights = [];
      const maxPointLights = 8;
      
      // Spot lights (max 4)
      const spotLights = [];
      const maxSpotLights = 4;

      if (scene && scene.children) {
        for (const child of scene.children) {
          // Directional light
          if (child.isDirectionalLight && child.enabled !== false) {
            // Get direction from position to target
            if (child.getDirection) {
              const dir = child.getDirection();
              lightDirection = { x: dir.x, y: dir.y, z: dir.z };
            } else if (child.target) {
              // Fallback: calculate direction manually
              lightDirection.x = child.target.x - child.position.x;
              lightDirection.y = child.target.y - child.position.y;
              lightDirection.z = child.target.z - child.position.z;
              const len = Math.sqrt(lightDirection.x * lightDirection.x + 
                                   lightDirection.y * lightDirection.y + 
                                   lightDirection.z * lightDirection.z);
              if (len > 0) {
                lightDirection.x /= len;
                lightDirection.y /= len;
                lightDirection.z /= len;
              }
            }
            lightColor = child.color || lightColor;
            lightIntensity = child.intensity !== undefined ? child.intensity : 1.0;
          }
          
          // Ambient light
          if (child.isAmbientLight && child.enabled !== false) {
            ambientColor = child.color || ambientColor;
            ambientIntensity = child.intensity !== undefined ? child.intensity : 1.0;
          }
          
          // Hemisphere light
          if (child.isHemisphereLight && child.enabled !== false) {
            hemisphereEnabled = 1.0;
            hemisphereSkyColor = child.color || hemisphereSkyColor;
            hemisphereGroundColor = child.groundColor || hemisphereGroundColor;
            hemisphereIntensity = child.intensity !== undefined ? child.intensity : 1.0;
          }
          
          // Point lights
          if (child.isPointLight && child.enabled !== false && pointLights.length < maxPointLights) {
            pointLights.push({
              position: child.position || { x: 0, y: 0, z: 0 },
              color: child.color || { r: 1, g: 1, b: 1 },
              intensity: child.intensity !== undefined ? child.intensity : 1.0,
              distance: child.distance !== undefined ? child.distance : 0.0,
              decay: child.decay !== undefined ? child.decay : 2.0
            });
          }
          
          // Spot lights
          if (child.isSpotLight && child.enabled !== false && spotLights.length < maxSpotLights) {
            // Get spotlight direction
            let direction = { x: 0, y: -1, z: 0 };
            if (child.target) {
              if (child.target.position) {
                // Target is Object3D
                direction.x = child.target.position.x - child.position.x;
                direction.y = child.target.position.y - child.position.y;
                direction.z = child.target.position.z - child.position.z;
              } else if (child.target.x !== undefined) {
                // Target is Vector3
                direction.x = child.target.x - child.position.x;
                direction.y = child.target.y - child.position.y;
                direction.z = child.target.z - child.position.z;
              }
              // Normalize
              const len = Math.sqrt(direction.x * direction.x + 
                                   direction.y * direction.y + 
                                   direction.z * direction.z);
              if (len > 0) {
                direction.x /= len;
                direction.y /= len;
                direction.z /= len;
              }
            }
            
            spotLights.push({
              position: child.position || { x: 0, y: 0, z: 0 },
              direction: direction,
              color: child.color || { r: 1, g: 1, b: 1 },
              intensity: child.intensity !== undefined ? child.intensity : 1.0,
              distance: child.distance !== undefined ? child.distance : 0.0,
              angle: child.angle !== undefined ? child.angle : Math.PI / 6,
              penumbra: child.penumbra !== undefined ? child.penumbra : 0.0,
              decay: child.decay !== undefined ? child.decay : 2.0
            });
          }
        }
      }

      if (materialType === 'PBRMaterial') {
        // PBR uses different LightUniforms struct with cameraPosition
        // Keep existing PBR logic
        const lightingUniformData = new Float32Array([
          lightColor.r, lightColor.g, lightColor.b, 0.0,               // directionalColor (vec3 + padding)
          lightIntensity, 0.0, 0.0, 0.0,                                // directionalIntensity + padding
          lightDirection.x, lightDirection.y, lightDirection.z, 0.0,   // directionalDirection (vec3 + padding)
          ambientColor.r, ambientColor.g, ambientColor.b, 0.0,         // ambientColor (vec3 + padding)
          camera.position.x, camera.position.y, camera.position.z, 0.0 // cameraPosition (vec3 + padding)
        ]);
        
        lightingUniformBuffer = this.device.createBuffer({
          size: 80, // 5 vec4s = 80 bytes
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          mappedAtCreation: true
        });
        new Float32Array(lightingUniformBuffer.getMappedRange()).set(lightingUniformData);
        lightingUniformBuffer.unmap();
      } else {
        // LambertMaterial uses expanded LightData struct with point/spot/hemisphere lights
        // Calculate buffer size:
        // Base: 24 floats (96 bytes) for ambient, directional, hemisphere, counts (6 vec4s)
        // Point lights: 8 lights * 12 floats each = 96 floats (384 bytes)
        // Spot lights: 4 lights * 20 floats each = 80 floats (320 bytes)
        // Total: 24 + 96 + 80 = 200 floats = 800 bytes
        
        const lightingData = new Float32Array(200);
        let offset = 0;
        
        // Base lighting (16 floats = 4 vec4s)
        lightingData[offset++] = ambientColor.r;
        lightingData[offset++] = ambientColor.g;
        lightingData[offset++] = ambientColor.b;
        lightingData[offset++] = ambientIntensity;
        
        lightingData[offset++] = lightColor.r;
        lightingData[offset++] = lightColor.g;
        lightingData[offset++] = lightColor.b;
        lightingData[offset++] = lightIntensity;
        
        lightingData[offset++] = lightDirection.x;
        lightingData[offset++] = lightDirection.y;
        lightingData[offset++] = lightDirection.z;
        lightingData[offset++] = hemisphereEnabled;
        
        lightingData[offset++] = hemisphereSkyColor.r;
        lightingData[offset++] = hemisphereSkyColor.g;
        lightingData[offset++] = hemisphereSkyColor.b;
        lightingData[offset++] = hemisphereIntensity;
        
        lightingData[offset++] = hemisphereGroundColor.r;
        lightingData[offset++] = hemisphereGroundColor.g;
        lightingData[offset++] = hemisphereGroundColor.b;
        lightingData[offset++] = pointLights.length;
        
        lightingData[offset++] = spotLights.length;
        lightingData[offset++] = 0.0; // padding
        lightingData[offset++] = 0.0; // padding
        lightingData[offset++] = 0.0; // padding
        
        // Point lights (8 * 12 floats = 96 floats)
        for (let i = 0; i < maxPointLights; i++) {
          if (i < pointLights.length) {
            const light = pointLights[i];
            lightingData[offset++] = light.position.x;
            lightingData[offset++] = light.position.y;
            lightingData[offset++] = light.position.z;
            lightingData[offset++] = 0.0; // padding
            lightingData[offset++] = light.color.r;
            lightingData[offset++] = light.color.g;
            lightingData[offset++] = light.color.b;
            lightingData[offset++] = light.intensity;
            lightingData[offset++] = light.distance;
            lightingData[offset++] = light.decay;
            lightingData[offset++] = 0.0; // padding
            lightingData[offset++] = 0.0; // padding
          } else {
            // Fill with zeros
            for (let j = 0; j < 12; j++) {
              lightingData[offset++] = 0.0;
            }
          }
        }
        
        // Spot lights (4 * 20 floats = 80 floats)
        for (let i = 0; i < maxSpotLights; i++) {
          if (i < spotLights.length) {
            const light = spotLights[i];
            lightingData[offset++] = light.position.x;
            lightingData[offset++] = light.position.y;
            lightingData[offset++] = light.position.z;
            lightingData[offset++] = 0.0; // padding
            lightingData[offset++] = light.direction.x;
            lightingData[offset++] = light.direction.y;
            lightingData[offset++] = light.direction.z;
            lightingData[offset++] = 0.0; // padding
            lightingData[offset++] = light.color.r;
            lightingData[offset++] = light.color.g;
            lightingData[offset++] = light.color.b;
            lightingData[offset++] = light.intensity;
            lightingData[offset++] = light.distance;
            lightingData[offset++] = light.angle;
            lightingData[offset++] = light.penumbra;
            lightingData[offset++] = light.decay;
            lightingData[offset++] = 0.0; // padding
            lightingData[offset++] = 0.0; // padding
            lightingData[offset++] = 0.0; // padding
            lightingData[offset++] = 0.0; // padding
          } else {
            // Fill with zeros
            for (let j = 0; j < 20; j++) {
              lightingData[offset++] = 0.0;
            }
          }
        }
        
        lightingUniformBuffer = this.device.createBuffer({
          size: 800, // 200 floats = 800 bytes
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          mappedAtCreation: true
        });
        new Float32Array(lightingUniformBuffer.getMappedRange()).set(lightingData);
        lightingUniformBuffer.unmap();
      }
    }

    // Get texture and sampler (not needed for DebugMaterial or GridOverlayMaterial)
    let texture = null;
    let sampler = null;
    
    if (materialType !== 'DebugMaterial' && materialType !== 'GridOverlayMaterial') {
      // Upload texture if needed
      texture = this.resourceManager.defaultTexture;
      if (material.map && material.map.image) {
        if (!this.resourceManager.textures.has(material.map.uuid)) {
          this.resourceManager.createTexture(
            material.map.uuid,
            material.map.image,
            material.map.image.width,
            material.map.image.height
          );
        }
        texture = this.resourceManager.getTexture(material.map.uuid);
      }
      sampler = this.resourceManager.defaultSampler;
    }

    // Create bind group with material-specific bindings
    const bindGroupEntries = [
      { binding: 0, resource: { buffer: transformUniformBuffer } },
      { binding: 1, resource: { buffer: materialUniformBuffer } }
    ];

    // Add lighting uniform for Lambert and PBR materials
    if (lightingUniformBuffer) {
      bindGroupEntries.push({ binding: 2, resource: { buffer: lightingUniformBuffer } });
    }

    // Add sampler and texture at appropriate bindings (except for DebugMaterial and GridOverlayMaterial)
    if (materialType !== 'DebugMaterial' && materialType !== 'GridOverlayMaterial') {
      const samplerBinding = materialType === 'BasicMaterial' ? 2 : 3;
      const textureBinding = materialType === 'BasicMaterial' ? 3 : 4;
      
      bindGroupEntries.push(
        { binding: samplerBinding, resource: sampler.sampler },
        { binding: textureBinding, resource: texture.texture.createView() }
      );
    }

    const bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: bindGroupEntries
    });

    // Draw
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.setVertexBuffer(0, geometryBuffers.vertexBuffer.buffer);
    passEncoder.setIndexBuffer(geometryBuffers.indexBuffer.buffer, geometryBuffers.indexFormat);
    passEncoder.drawIndexed(geometryBuffers.indexCount);

    this.info.render.triangles += geometryBuffers.indexCount / 3;
  }

  /**
   * Create geometry buffers for WebGPU
   */
  _createGeometryBuffersWebGPU(geometry) {
    const positions = geometry.attributes.position.array;
    const normals = geometry.attributes.normal ? geometry.attributes.normal.array : new Float32Array(positions.length);
    const uvs = geometry.attributes.uv ? geometry.attributes.uv.array : new Float32Array((positions.length / 3) * 2);
    
    // Ensure normals and UVs exist
    if (!geometry.attributes.normal) {
      for (let i = 0; i < normals.length; i += 3) {
        normals[i] = 0;
        normals[i + 1] = 1;
        normals[i + 2] = 0;
      }
    }
    if (!geometry.attributes.uv) {
      for (let i = 0; i < uvs.length; i += 2) {
        uvs[i] = 0;
        uvs[i + 1] = 0;
      }
    }

    // Interleave vertex data (position + normal + uv)
    const vertexCount = positions.length / 3;
    const vertexData = new Float32Array(vertexCount * 8); // 3 + 3 + 2 = 8 floats per vertex

    for (let i = 0; i < vertexCount; i++) {
      const offset = i * 8;
      vertexData[offset + 0] = positions[i * 3 + 0];
      vertexData[offset + 1] = positions[i * 3 + 1];
      vertexData[offset + 2] = positions[i * 3 + 2];
      vertexData[offset + 3] = normals[i * 3 + 0];
      vertexData[offset + 4] = normals[i * 3 + 1];
      vertexData[offset + 5] = normals[i * 3 + 2];
      vertexData[offset + 6] = uvs[i * 2 + 0];
      vertexData[offset + 7] = uvs[i * 2 + 1];
    }

    const vertexBuffer = this.resourceManager.createBuffer(
      `vertex_${geometry.uuid}`,
      vertexData,
      'vertex'
    );

    // Get index data
    const indices = geometry.index ? geometry.index.array : null;
    const indexData = indices || this._generateIndices(vertexCount);
    
    // Determine index format for WebGPU
    const indexFormat = indexData instanceof Uint32Array ? 'uint32' : 'uint16';

    const indexBuffer = this.resourceManager.createBuffer(
      `index_${geometry.uuid}`,
      indexData,
      'index'
    );

    return {
      vertexBuffer,
      indexBuffer,
      indexCount: indexData.length,
      indexFormat
    };
  }

  /**
   * Render with WebGL2 (Phase 2)
   */
  _renderWebGL2(scene, camera, opaqueMeshes, transparentMeshes, pointClouds = [], splatClouds = []) {
    const gl = this.context;
    const ssrActive = this._ssrEnabled && this._ssrPass && this._ssrPass.enabled;
    const postFXRedirect = this._postFXRedirectTarget;
    
    // ── PostFX: redirect draw to off-screen FBO if postFX is active ─────
    // PostFX target takes priority for binding; SSR MRT will override later
    if (postFXRedirect && !ssrActive) {
      // Ensure the FBO is set up in GL
      if (postFXRedirect.needsUpdate) {
        this.setupRenderTarget(postFXRedirect);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, postFXRedirect.glFramebuffer);
      gl.viewport(0, 0, postFXRedirect.width, postFXRedirect.height);
    }

    // ── SSR: redirect draw to G-buffer MRT FBO ──────────────────────────
    if (ssrActive) {
      const w = this.canvas.width;
      const h = this.canvas.height;
      const gb = this._ensureSSRGBuffer(gl, w, h);
      if (gb) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, gb.fbo);
        gl.viewport(0, 0, w, h);
      }
    }

    // Clear
    this.clear();

    // When bound to MRT FBO, also clear the extra attachments
    if (ssrActive && this._ssrGBuffer) {
      // Clear normals to (0.5, 0.5, 1.0, 1.0) = +Z normal facing camera
      gl.clearBufferfv(gl.COLOR, 1, new Float32Array([0.5, 0.5, 1.0, 1.0]));
      // Clear material to (0, 1, 0, 1) = non-reflective
      gl.clearBufferfv(gl.COLOR, 2, new Float32Array([0.0, 1.0, 0.0, 1.0]));
    }

    // Render opaque meshes
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    for (const mesh of opaqueMeshes) {
      const materialType = this._getMaterialType(mesh.material);
      const shader = this.shaders.get(materialType);
      
      if (!shader || !shader.compiled) {
        console.warn(`[GPUBackend] Shader not found or not compiled for ${materialType}, skipping mesh`);
        continue;
      }
      
      const program = shader.compiled.program;
      gl.useProgram(program);
      
      this._drawMeshWebGL2(gl, program, shader, mesh, camera, scene, materialType);
    }

    // Render transparent meshes
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const { mesh } of transparentMeshes) {
      const materialType = this._getMaterialType(mesh.material);
      const shader = this.shaders.get(materialType);
      
      if (!shader || !shader.compiled) {
        console.warn(`[GPUBackend] Shader not found or not compiled for ${materialType}, skipping mesh`);
        continue;
      }
      
      const program = shader.compiled.program;
      gl.useProgram(program);
      
      this._drawMeshWebGL2(gl, program, shader, mesh, camera, scene, materialType);
    }

    // ── Render point clouds ─────────────────────────────────────────────
    if (pointClouds.length > 0) {
      this._renderPointCloudsWebGL2(gl, camera, pointClouds);
    }

    // Reset state
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // ── Render Gaussian splat clouds (after opaques, translucent pass) ──
    if (splatClouds.length > 0) {
      this._renderSplatCloudsWebGL2(gl, camera, splatClouds);
    }

    // ── SSR: unbind MRT, run SSR passes, composite to screen ────────────
    if (ssrActive && this._ssrGBuffer) {
      // When PostFX is active, SSR composites into the PostFX input target
      // instead of directly to the canvas
      if (postFXRedirect) {
        if (postFXRedirect.needsUpdate) {
          this.setupRenderTarget(postFXRedirect);
        }
      }
      this._runSSRPasses(gl, camera, this.canvas.width, this.canvas.height, postFXRedirect || null);
    }

    // ── PostFX: when no SSR, the scene was drawn into the postFX target.
    //    Unbind FBO now so the pipeline.execute() can read the texture. ──
    if (postFXRedirect && !ssrActive) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /**
   * Draw a mesh with WebGL2
   */
  _drawMeshWebGL2(gl, program, shader, mesh, camera, scene, materialType) {
    const geometry = mesh.geometry;
    const material = mesh.material;

    if (!geometry || !geometry.attributes.position) {
      return;
    }

    // Get or create geometry buffers
    const geometryId = geometry.uuid || `geom_${Math.random()}`;
    let geometryBuffers = this.geometryCache.get(geometryId);

    if (!geometryBuffers) {
      geometryBuffers = this._createGeometryBuffersWebGL2(gl, geometry);
      this.geometryCache.set(geometryId, geometryBuffers);
    }

    // Calculate matrices
    mesh.updateMatrixWorld();
    const mvp = new Matrix4();
    mvp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    mvp.multiply(mesh.matrixWorld);

    // Set transform uniforms
    gl.uniformMatrix4fv(shader.uniformLocations.get('uModelViewProjection'), false, mvp.elements);
    gl.uniformMatrix4fv(shader.uniformLocations.get('uModel'), false, mesh.matrixWorld.elements);
    
    // GridOverlayMaterial has its own uniform/attribute layout
    if (materialType === 'GridOverlayMaterial') {
      this._drawGridOverlayWebGL2(gl, shader, mesh, camera, mvp, geometryBuffers);
      return;
    }
    
    // PBRMaterial has its own uniform/attribute layout
    if (materialType === 'PBRMaterial') {
      this._drawPBRMeshWebGL2(gl, shader, mesh, camera, scene, mvp, geometryBuffers);
      return;
    }
    
    // Set normal matrix for LambertMaterial
    if (materialType === 'LambertMaterial') {
      const normalMatrix = new Matrix4();
      normalMatrix.copy(mesh.matrixWorld).invert().transpose();
      gl.uniformMatrix4fv(shader.uniformLocations.get('uNormalMatrix'), false, normalMatrix.elements);
    }
    
    // Set material uniforms
    const materialColor = material.color || { r: 1, g: 1, b: 1 };
    gl.uniform4f(shader.uniformLocations.get('uColor'), materialColor.r, materialColor.g, materialColor.b, 1.0);
    gl.uniform1f(shader.uniformLocations.get('uOpacity'), material.opacity !== undefined ? material.opacity : 1.0);
    if (shader.uniformLocations.get('uFlatShading')) {
      gl.uniform1i(shader.uniformLocations.get('uFlatShading'), material.flatShading ? 1 : 0);
    }
    
    // Set lighting uniforms for LambertMaterial
    if (materialType === 'LambertMaterial') {
      this._setLightingUniformsWebGL2(gl, shader, scene);
      
      // Phase 1: Set shadow uniforms if shadows enabled and mesh receives shadows
      if (this._renderer && this._renderer.shadows && this._renderer.shadows.enabled && mesh.receiveShadow) {
        this._setShadowUniformsWebGL2(gl, shader, scene);
      } else {
        // Disable shadows
        gl.uniform1i(shader.uniformLocations.get('uShadowsEnabled'), 0);
      }
    }
    
    // Handle texture
    const hasTexture = material.map && material.map.image;
    gl.uniform1i(shader.uniformLocations.get('uHasTexture'), hasTexture ? 1 : 0);
    
    if (hasTexture) {
      // Upload texture if needed
      if (!this.resourceManager.textures.has(material.map.uuid)) {
        this.resourceManager.createTexture(
          material.map.uuid,
          material.map.image,
          material.map.image.width,
          material.map.image.height
        );
      }
      const texture = this.resourceManager.getTexture(material.map.uuid);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture.texture);
      gl.uniform1i(shader.uniformLocations.get('uTexture'), 0);
    }

    // Bind vertex attributes
    const aPosition = shader.attributeLocations.get('aPosition');
    const aNormal = shader.attributeLocations.get('aNormal');
    const aUV = shader.attributeLocations.get('aUV');

    gl.bindBuffer(gl.ARRAY_BUFFER, geometryBuffers.vertexBuffer.buffer);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(aNormal);
    gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 32, 24);

    // Draw
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geometryBuffers.indexBuffer.buffer);
    gl.drawElements(gl.TRIANGLES, geometryBuffers.indexCount, geometryBuffers.indexType, 0);

    this.info.render.triangles += geometryBuffers.indexCount / 3;
  }

  /**
   * Draw GridOverlayMaterial mesh with WebGL2 (specialized path)
   */
  _drawGridOverlayWebGL2(gl, shader, mesh, camera, mvp, geometryBuffers) {
    const material = mesh.material;

    // Grid overlay uses its own uniform names
    gl.uniformMatrix4fv(shader.uniformLocations.get('mvpMatrix'), false, mvp.elements);
    gl.uniformMatrix4fv(shader.uniformLocations.get('modelMatrix'), false, mesh.matrixWorld.elements);

    // Set grid-specific uniforms
    gl.uniform1f(shader.uniformLocations.get('gridScale'), material.gridScale !== undefined ? material.gridScale : 1.0);
    gl.uniform1f(shader.uniformLocations.get('gridOpacity'), material.gridOpacity !== undefined ? material.gridOpacity : 0.8);
    gl.uniform1f(shader.uniformLocations.get('fadeDistance'), material.fadeDistance !== undefined ? material.fadeDistance : 100.0);
    gl.uniform1f(shader.uniformLocations.get('adaptive'), material.adaptive ? 1.0 : 0.0);
    gl.uniform1f(shader.uniformLocations.get('majorLineInterval'), material.majorLineInterval !== undefined ? material.majorLineInterval : 10.0);

    // Axis and horizon colors
    const axisXColor = material.axisXColor || { r: 1.0, g: 0.2, b: 0.2 };
    const axisZColor = material.axisZColor || { r: 0.2, g: 1.0, b: 0.2 };
    const horizonColor = material.horizonColor || { r: 0.5, g: 0.5, b: 0.5 };

    gl.uniform3f(shader.uniformLocations.get('axisXColor'), axisXColor.r, axisXColor.g, axisXColor.b);
    gl.uniform3f(shader.uniformLocations.get('axisZColor'), axisZColor.r, axisZColor.g, axisZColor.b);
    gl.uniform3f(shader.uniformLocations.get('horizonColor'), horizonColor.r, horizonColor.g, horizonColor.b);

    // Camera position for distance-based fading
    gl.uniform3f(shader.uniformLocations.get('cameraPosition'), camera.position.x, camera.position.y, camera.position.z);

    // Bind vertex attributes using grid shader attribute names
    const posLoc = shader.attributeLocations.get('position');
    const normLoc = shader.attributeLocations.get('normal');
    const uvLoc = shader.attributeLocations.get('uv');

    gl.bindBuffer(gl.ARRAY_BUFFER, geometryBuffers.vertexBuffer.buffer);
    if (posLoc >= 0) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 32, 0);
    }
    if (normLoc >= 0) {
      gl.enableVertexAttribArray(normLoc);
      gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, 32, 12);
    }
    if (uvLoc >= 0) {
      gl.enableVertexAttribArray(uvLoc);
      gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 32, 24);
    }

    // Grid-specific uniforms: gridAlpha and gridColor
    gl.uniform1f(shader.uniformLocations.get('gridAlpha'), material.gridAlpha !== undefined ? material.gridAlpha : 0.65);
    const gridColor = material.gridColor || { r: 0.5, g: 0.5, b: 0.5 };
    gl.uniform3f(shader.uniformLocations.get('gridColor'), gridColor.r, gridColor.g, gridColor.b);

    // Blending and depth are already set by the transparent pass in _renderWebGL2().
    // Do NOT restore state here — the caller manages blend/depthMask.

    // Draw
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geometryBuffers.indexBuffer.buffer);
    gl.drawElements(gl.TRIANGLES, geometryBuffers.indexCount, geometryBuffers.indexType, 0);

    this.info.render.triangles += geometryBuffers.indexCount / 3;
  }

  /**
   * Draw PBRMaterial mesh with WebGL2 (specialized path)
   * PBR shader uses different naming conventions from Lambert/Basic:
   *   Attributes: position, normal, uv (not aPosition, aNormal, aUV)
   *   Uniforms: mvpMatrix, modelMatrix, normalMatrix, baseColor, metallic, roughness, etc.
   */
  _drawPBRMeshWebGL2(gl, shader, mesh, camera, scene, mvp, geometryBuffers) {
    const material = mesh.material;

    // --- Transform uniforms ---
    gl.uniformMatrix4fv(shader.uniformLocations.get('mvpMatrix'), false, mvp.elements);
    gl.uniformMatrix4fv(shader.uniformLocations.get('modelMatrix'), false, mesh.matrixWorld.elements);

    const normalMatrix = new Matrix4();
    normalMatrix.copy(mesh.matrixWorld).invert().transpose();
    gl.uniformMatrix4fv(shader.uniformLocations.get('normalMatrix'), false, normalMatrix.elements);

    // --- Material uniforms ---
    const materialColor = material.color || { r: 1, g: 1, b: 1 };
    gl.uniform4f(shader.uniformLocations.get('baseColor'), materialColor.r, materialColor.g, materialColor.b, 1.0);
    gl.uniform1f(shader.uniformLocations.get('metallic'), material.metallic !== undefined ? material.metallic : 0.0);
    gl.uniform1f(shader.uniformLocations.get('roughness'), material.roughness !== undefined ? material.roughness : 0.5);
    gl.uniform1f(shader.uniformLocations.get('opacity'), material.opacity !== undefined ? material.opacity : 1.0);
    if (shader.uniformLocations.get('flatShading')) {
      gl.uniform1i(shader.uniformLocations.get('flatShading'), material.flatShading ? 1 : 0);
    }

    // Camera position for specular calculation
    gl.uniform3f(shader.uniformLocations.get('cameraPosition'), camera.position.x, camera.position.y, camera.position.z);

    // View matrix for SSR view-space normal encoding
    gl.uniformMatrix4fv(shader.uniformLocations.get('uViewMatrix'), false, camera.matrixWorldInverse.elements);

    // Emissive
    const emissive = material.emissive || { r: 0, g: 0, b: 0 };
    gl.uniform3f(shader.uniformLocations.get('emissiveColor'), emissive.r, emissive.g, emissive.b);
    gl.uniform1f(shader.uniformLocations.get('emissiveIntensity'), material.emissiveIntensity !== undefined ? material.emissiveIntensity : 0.0);

    // --- Texture ---
    const hasTexture = material.map && material.map.image;
    gl.uniform1i(shader.uniformLocations.get('uHasBaseColorTexture'), hasTexture ? 1 : 0);

    if (hasTexture) {
      if (!this.resourceManager.textures.has(material.map.uuid)) {
        this.resourceManager.createTexture(
          material.map.uuid,
          material.map.image,
          material.map.image.width,
          material.map.image.height
        );
      }
      const texture = this.resourceManager.getTexture(material.map.uuid);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture.texture);
      gl.uniform1i(shader.uniformLocations.get('baseColorTexture'), 0);
    } else {
      // Bind a 1x1 white texture so the sampler doesn't read garbage
      if (!this._pbrDefaultTexture) {
        this._pbrDefaultTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this._pbrDefaultTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this._pbrDefaultTexture);
      gl.uniform1i(shader.uniformLocations.get('baseColorTexture'), 0);
    }

    // --- Lighting ---
    this._setPBRLightingUniformsWebGL2(gl, shader, scene);

    // --- IBL (Image-Based Lighting) ---
    this._ensureIBLResources(scene);
    this._setPBRIBLUniformsWebGL2(gl, shader, scene, material, mesh);

    // --- Bind vertex attributes using PBR shader attribute names ---
    const posLoc = shader.attributeLocations.get('position');
    const normLoc = shader.attributeLocations.get('normal');
    const uvLoc = shader.attributeLocations.get('uv');

    gl.bindBuffer(gl.ARRAY_BUFFER, geometryBuffers.vertexBuffer.buffer);
    if (posLoc >= 0) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 32, 0);
    }
    if (normLoc >= 0) {
      gl.enableVertexAttribArray(normLoc);
      gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, 32, 12);
    }
    if (uvLoc >= 0) {
      gl.enableVertexAttribArray(uvLoc);
      gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 32, 24);
    }

    // --- Draw ---
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geometryBuffers.indexBuffer.buffer);
    gl.drawElements(gl.TRIANGLES, geometryBuffers.indexCount, geometryBuffers.indexType, 0);

    this.info.render.triangles += geometryBuffers.indexCount / 3;
  }

  /**
   * Set lighting uniforms for WebGL2 PBRMaterial
   * Collects lights from the scene and sends them to the PBR shader using PBR's uniform names
   */
  _setPBRLightingUniformsWebGL2(gl, shader, sceneRoot) {
    let ambientColor = { r: 0.2, g: 0.2, b: 0.2 };
    let ambientIntensity = 1.0;
    let directionalColor = { r: 1, g: 1, b: 1 };
    let directionalIntensity = 0.0;
    let directionalDirection = { x: 0, y: -1, z: 0 };
    let hemisphereEnabled = 0;
    let hemisphereSkyColor = { r: 1, g: 1, b: 1 };
    let hemisphereGroundColor = { r: 0, g: 0, b: 0 };
    let hemisphereIntensity = 0.0;
    const pointLights = [];
    const spotLights = [];

    if (sceneRoot) {
      sceneRoot.traverse((child) => {
        if (child.isAmbientLight && child.enabled !== false) {
          ambientColor = child.color || ambientColor;
          ambientIntensity = child.intensity !== undefined ? child.intensity : 1.0;
        } else if (child.isDirectionalLight && child.enabled !== false) {
          directionalColor = child.color || directionalColor;
          directionalIntensity = child.intensity !== undefined ? child.intensity : 1.0;
          if (child.getDirection) {
            const dir = child.getDirection();
            directionalDirection = { x: dir.x, y: dir.y, z: dir.z };
          } else if (child.target) {
            // target may be a Vector3 or an Object3D with .position
            const tp = child.target.position || child.target;
            const dx = tp.x - child.position.x;
            const dy = tp.y - child.position.y;
            const dz = tp.z - child.position.z;
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
            directionalDirection = { x: dx / len, y: dy / len, z: dz / len };
          }
        } else if (child.isHemisphereLight && child.enabled !== false) {
          hemisphereEnabled = 1;
          hemisphereSkyColor = child.color || hemisphereSkyColor;
          hemisphereGroundColor = child.groundColor || hemisphereGroundColor;
          hemisphereIntensity = child.intensity !== undefined ? child.intensity : 1.0;
        } else if (child.isPointLight && child.enabled !== false && pointLights.length < 4) {
          pointLights.push(child);
        } else if (child.isSpotLight && child.enabled !== false && spotLights.length < 2) {
          spotLights.push(child);
        }
      });
    }

    // Directional light
    gl.uniform3f(shader.uniformLocations.get('directionalColor'), directionalColor.r, directionalColor.g, directionalColor.b);
    gl.uniform1f(shader.uniformLocations.get('directionalIntensity'), directionalIntensity);
    gl.uniform3f(shader.uniformLocations.get('directionalDirection'), directionalDirection.x, directionalDirection.y, directionalDirection.z);

    // Ambient
    gl.uniform3f(shader.uniformLocations.get('ambientColor'), ambientColor.r, ambientColor.g, ambientColor.b);
    gl.uniform1f(shader.uniformLocations.get('ambientIntensity'), ambientIntensity);

    // Point lights
    gl.uniform1i(shader.uniformLocations.get('uNumPointLights'), pointLights.length);
    for (let i = 0; i < pointLights.length; i++) {
      const light = pointLights[i];
      gl.uniform3f(shader.uniformLocations.get(`uPBRPointLightPositions[${i}]`), light.position.x, light.position.y, light.position.z);
      gl.uniform3f(shader.uniformLocations.get(`uPBRPointLightColors[${i}]`), light.color.r, light.color.g, light.color.b);
      gl.uniform1f(shader.uniformLocations.get(`uPBRPointLightIntensities[${i}]`), light.intensity);
      gl.uniform1f(shader.uniformLocations.get(`uPBRPointLightDistances[${i}]`), light.distance || 0);
      gl.uniform1f(shader.uniformLocations.get(`uPBRPointLightDecays[${i}]`), light.decay !== undefined ? light.decay : 2.0);
    }

    // Spot lights
    gl.uniform1i(shader.uniformLocations.get('uNumSpotLights'), spotLights.length);
    for (let i = 0; i < spotLights.length; i++) {
      const light = spotLights[i];
      const direction = light.target ? light.target.position.clone().sub(light.position).normalize() : { x: 0, y: -1, z: 0 };
      gl.uniform3f(shader.uniformLocations.get(`uPBRSpotLightPositions[${i}]`), light.position.x, light.position.y, light.position.z);
      gl.uniform3f(shader.uniformLocations.get(`uPBRSpotLightDirections[${i}]`), direction.x, direction.y, direction.z);
      gl.uniform3f(shader.uniformLocations.get(`uPBRSpotLightColors[${i}]`), light.color.r, light.color.g, light.color.b);
      gl.uniform1f(shader.uniformLocations.get(`uPBRSpotLightIntensities[${i}]`), light.intensity);
      gl.uniform1f(shader.uniformLocations.get(`uPBRSpotLightDistances[${i}]`), light.distance || 0);
      gl.uniform1f(shader.uniformLocations.get(`uPBRSpotLightAngles[${i}]`), light.angle || Math.PI / 6);
      gl.uniform1f(shader.uniformLocations.get(`uPBRSpotLightPenumbras[${i}]`), light.penumbra || 0);
      gl.uniform1f(shader.uniformLocations.get(`uPBRSpotLightDecays[${i}]`), light.decay !== undefined ? light.decay : 2.0);
    }

    // Hemisphere light
    gl.uniform1i(shader.uniformLocations.get('uPBRHemisphereEnabled'), hemisphereEnabled);
    gl.uniform3f(shader.uniformLocations.get('uPBRHemisphereSkyColor'), hemisphereSkyColor.r, hemisphereSkyColor.g, hemisphereSkyColor.b);
    gl.uniform3f(shader.uniformLocations.get('uPBRHemisphereGroundColor'), hemisphereGroundColor.r, hemisphereGroundColor.g, hemisphereGroundColor.b);
    gl.uniform1f(shader.uniformLocations.get('uPBRHemisphereIntensity'), hemisphereIntensity);
  }

  /**
   * Set IBL (Image-Based Lighting) uniforms for WebGL2 PBRMaterial.
   * Binds prefiltered environment cubemap, BRDF LUT, and planar reflection texture.
   * 
   * Texture unit allocation:
   *   TEXTURE6 = prefiltered env cubemap
   *   TEXTURE7 = BRDF LUT (2D)
   *   TEXTURE8 = planar reflection (2D)
   * 
   * @private
   */
  _setPBRIBLUniformsWebGL2(gl, shader, scene, material, mesh) {
    // --- Probe / Environment cubemap selection ---
    // Priority: 1) nearest ReflectionProbe  2) scene.environment  3) none
    let envTexKey = null;
    let envMaxLod = 0;
    let envIntensityMul = 1.0;

    // Skip probe lookup during probe capture to avoid recursion
    if (!this._capturingProbe && scene.reflectionProbes && scene.reflectionProbes.length > 0 && mesh) {
      const meshPos = {
        x: mesh.matrixWorld.elements[12],
        y: mesh.matrixWorld.elements[13],
        z: mesh.matrixWorld.elements[14]
      };
      let bestWeight = 0;
      let bestProbe  = null;
      for (const probe of scene.reflectionProbes) {
        if (!probe.envMapKey || !this.resourceManager.hasTexture(probe.envMapKey)) continue;
        const w = probe.getInfluence(meshPos);
        if (w > bestWeight) { bestWeight = w; bestProbe = probe; }
      }
      if (bestProbe) {
        envTexKey = bestProbe.envMapKey;
        envMaxLod = bestProbe.envMapMaxLod;
        if (!this._probeLogThrottle || Date.now() - this._probeLogThrottle > 2000) {
          console.log(`[GPUBackend] PBR mesh bound to ReflectionProbe (key=${bestProbe.envMapKey}, lod=${envMaxLod}, weight=${bestWeight.toFixed(3)})`);
          this._probeLogThrottle = Date.now();
        }
      }
    }

    // Fallback to scene-wide environment
    if (!envTexKey && this._iblEnvMapKey && this.resourceManager.hasTexture(this._iblEnvMapKey)) {
      envTexKey = this._iblEnvMapKey;
      envMaxLod = this._iblEnvMapMaxLod;
    }

    const hasEnvMap = !!envTexKey;
    gl.uniform1i(shader.uniformLocations.get('uHasEnvMap'), hasEnvMap ? 1 : 0);

    // Set per-material envMapIntensity uniform (the combined intensity is
    // already baked into uSceneEnvIntensity, so this must be 1.0 to avoid
    // double-multiplying).  Default to 1.0 so IBL is never zeroed out.
    gl.uniform1f(shader.uniformLocations.get('envMapIntensity'), 1.0);

    // IMPORTANT: Always assign uEnvMap (samplerCube) to unit 6 to prevent
    // GL_INVALID_OPERATION when it defaults to unit 0 and conflicts with
    // baseColorTexture (sampler2D) which is also at unit 0.
    gl.uniform1i(shader.uniformLocations.get('uEnvMap'), 6);

    if (hasEnvMap) {
      const envTex = this.resourceManager.getTexture(envTexKey);
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, envTex.texture);
      gl.uniform1f(shader.uniformLocations.get('uEnvMapMaxLod'), envMaxLod);

      // Combine scene and material intensity
      const matEnvIntensity = material.envMapIntensity !== undefined ? material.envMapIntensity : 1.0;
      const sceneEnvIntensity = scene.environmentIntensity !== undefined ? scene.environmentIntensity : 1.0;
      gl.uniform1f(shader.uniformLocations.get('uSceneEnvIntensity'), sceneEnvIntensity * matEnvIntensity);
    } else {
      // Bind a dummy 1x1 cubemap so the samplerCube at unit 6 has a
      // texture-complete cube target, avoiding incomplete-texture warnings.
      if (!this._dummyCubeMap) {
        this._dummyCubeMap = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, this._dummyCubeMap);
        const pixel = new Uint8Array([0, 0, 0, 255]);
        for (let face = 0; face < 6; face++) {
          gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, 0, gl.RGBA,
                        1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        }
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      }
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, this._dummyCubeMap);
    }

    // --- BRDF LUT ---
    const hasBRDF = !!(this._iblBRDFLUTKey && this.resourceManager.hasTexture(this._iblBRDFLUTKey));
    gl.uniform1i(shader.uniformLocations.get('uHasBRDFLUT'), hasBRDF ? 1 : 0);

    // Always assign BRDF LUT sampler to unit 7 to avoid defaulting to unit 0
    gl.uniform1i(shader.uniformLocations.get('uBRDFLUT'), 7);

    if (hasBRDF) {
      const brdfTex = this.resourceManager.getTexture(this._iblBRDFLUTKey);
      gl.activeTexture(gl.TEXTURE7);
      gl.bindTexture(gl.TEXTURE_2D, brdfTex.texture);
    }

    // --- Planar reflection ---
    // Always assign planar reflection sampler to unit 8 to avoid defaulting to unit 0
    gl.uniform1i(shader.uniformLocations.get('uPlanarReflectionMap'), 8);

    // Check if any PlanarReflection object in the scene has an active texture
    let hasPlanar = false;
    if (scene) {
      scene.traverse((child) => {
        if (hasPlanar) return; // Already found one
        if (child.isPlanarReflection && child.texture) {
          hasPlanar = true;
          // Bind planar reflection texture
          const planarKey = '__planar_reflection_' + child.uuid;
          if (!this.resourceManager.hasTexture(planarKey) && child.texture instanceof HTMLCanvasElement) {
            this.resourceManager.createTexture(planarKey, child.texture, child.resolution, child.resolution);
          }
          if (this.resourceManager.hasTexture(planarKey)) {
            const planarTex = this.resourceManager.getTexture(planarKey);
            gl.activeTexture(gl.TEXTURE8);
            gl.bindTexture(gl.TEXTURE_2D, planarTex.texture);
            // Set texture matrix
            if (child.textureMatrix) {
              gl.uniformMatrix4fv(shader.uniformLocations.get('uPlanarReflectionMatrix'), false, child.textureMatrix.elements);
            }
          }
        }
      });
    }
    gl.uniform1i(shader.uniformLocations.get('uHasPlanarReflection'), hasPlanar ? 1 : 0);
  }

  /**
   * Phase 1: Set lighting uniforms for WebGL2 LambertMaterial
   */
  _setLightingUniformsWebGL2(gl, shader, sceneRoot) {
    // Collect lighting data from scene
    let ambientColor = { r: 0.2, g: 0.2, b: 0.2 };
    let ambientIntensity = 1.0;
    let directionalColor = { r: 1, g: 1, b: 1 };
    let directionalIntensity = 0.0;
    let directionalDirection = { x: 0, y: -1, z: 0 };
    let hemisphereEnabled = 0.0;
    let hemisphereSkyColor = { r: 1, g: 1, b: 1 };
    let hemisphereGroundColor = { r: 0, g: 0, b: 0 };
    let hemisphereIntensity = 0.0;
    const pointLights = [];
    const spotLights = [];

    // Traverse scene to collect lights
    if (sceneRoot) {
      sceneRoot.traverse((child) => {
        if (child.isAmbientLight && child.enabled !== false) {
          ambientColor = child.color || ambientColor;
          ambientIntensity = child.intensity !== undefined ? child.intensity : 1.0;
        } else if (child.isDirectionalLight && child.enabled !== false) {
          directionalColor = child.color || directionalColor;
          directionalIntensity = child.intensity !== undefined ? child.intensity : 1.0;
          if (child.getDirection) {
            const dir = child.getDirection();
            directionalDirection = { x: dir.x, y: dir.y, z: dir.z };
          } else if (child.target) {
            const tp = child.target.position || child.target;
            const dx = tp.x - child.position.x;
            const dy = tp.y - child.position.y;
            const dz = tp.z - child.position.z;
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
            directionalDirection = { x: dx / len, y: dy / len, z: dz / len };
          }
        } else if (child.isHemisphereLight && child.enabled !== false) {
          hemisphereEnabled = 1.0;
          hemisphereSkyColor = child.color || hemisphereSkyColor;
          hemisphereGroundColor = child.groundColor || hemisphereGroundColor;
          hemisphereIntensity = child.intensity !== undefined ? child.intensity : 1.0;
        } else if (child.isPointLight && child.enabled !== false && pointLights.length < 8) {
          pointLights.push(child);
        } else if (child.isSpotLight && child.enabled !== false && spotLights.length < 4) {
          spotLights.push(child);
        }
      });
    }

    // Set ambient uniforms
    gl.uniform3f(shader.uniformLocations.get('uAmbientColor'), ambientColor.r, ambientColor.g, ambientColor.b);
    gl.uniform1f(shader.uniformLocations.get('uAmbientIntensity'), ambientIntensity);

    // Set directional light uniforms
    gl.uniform3f(shader.uniformLocations.get('uDirectionalColor'), directionalColor.r, directionalColor.g, directionalColor.b);
    gl.uniform1f(shader.uniformLocations.get('uDirectionalIntensity'), directionalIntensity);

    gl.uniform3f(shader.uniformLocations.get('uDirectionalDirection'), 
      directionalDirection.x, directionalDirection.y, directionalDirection.z);

    // Set hemisphere uniforms
    gl.uniform1f(shader.uniformLocations.get('uHemisphereEnabled'), hemisphereEnabled);
    gl.uniform3f(shader.uniformLocations.get('uHemisphereSkyColor'), hemisphereSkyColor.r, hemisphereSkyColor.g, hemisphereSkyColor.b);
    gl.uniform3f(shader.uniformLocations.get('uHemisphereGroundColor'), hemisphereGroundColor.r, hemisphereGroundColor.g, hemisphereGroundColor.b);
    gl.uniform1f(shader.uniformLocations.get('uHemisphereIntensity'), hemisphereIntensity);

    // Set point light uniforms
    gl.uniform1i(shader.uniformLocations.get('uNumPointLights'), pointLights.length);
    for (let i = 0; i < pointLights.length; i++) {
      const light = pointLights[i];
      gl.uniform3f(shader.uniformLocations.get(`uPointLightPositions[${i}]`), light.position.x, light.position.y, light.position.z);
      gl.uniform3f(shader.uniformLocations.get(`uPointLightColors[${i}]`), light.color.r, light.color.g, light.color.b);
      gl.uniform1f(shader.uniformLocations.get(`uPointLightIntensities[${i}]`), light.intensity);
      gl.uniform1f(shader.uniformLocations.get(`uPointLightDistances[${i}]`), light.distance);
      gl.uniform1f(shader.uniformLocations.get(`uPointLightDecays[${i}]`), light.decay);
    }

    // Set spot light uniforms
    gl.uniform1i(shader.uniformLocations.get('uNumSpotLights'), spotLights.length);
    for (let i = 0; i < spotLights.length; i++) {
      const light = spotLights[i];
      const direction = light.target ? light.target.position.clone().sub(light.position).normalize() : { x: 0, y: -1, z: 0 };
      
      gl.uniform3f(shader.uniformLocations.get(`uSpotLightPositions[${i}]`), light.position.x, light.position.y, light.position.z);
      gl.uniform3f(shader.uniformLocations.get(`uSpotLightDirections[${i}]`), direction.x, direction.y, direction.z);
      gl.uniform3f(shader.uniformLocations.get(`uSpotLightColors[${i}]`), light.color.r, light.color.g, light.color.b);
      gl.uniform1f(shader.uniformLocations.get(`uSpotLightIntensities[${i}]`), light.intensity);
      gl.uniform1f(shader.uniformLocations.get(`uSpotLightDistances[${i}]`), light.distance);
      gl.uniform1f(shader.uniformLocations.get(`uSpotLightAngles[${i}]`), light.angle);
      gl.uniform1f(shader.uniformLocations.get(`uSpotLightPenumbras[${i}]`), light.penumbra);
      gl.uniform1f(shader.uniformLocations.get(`uSpotLightDecays[${i}]`), light.decay);
    }
  }

  /**
   * Phase 1: Set shadow uniforms for WebGL2 LambertMaterial
   */
  _setShadowUniformsWebGL2(gl, shader, sceneRoot) {
    // Enable shadows
    gl.uniform1i(shader.uniformLocations.get('uShadowsEnabled'), 1);

    // Collect shadow-casting lights
    let directionalLight = null;
    const spotLights = [];

    if (sceneRoot) {
      sceneRoot.traverse((child) => {
        if (child.isDirectionalLight && child.enabled !== false && child.castShadow && !directionalLight) {
          directionalLight = child;
        } else if (child.isSpotLight && child.enabled !== false && child.castShadow && spotLights.length < 4) {
          spotLights.push(child);
        }
      });
    }

    // Set directional light shadow uniforms
    if (directionalLight && directionalLight.shadow.matrix) {
      const shadowMapData = this.shadowMaps.get(directionalLight.uuid);
      if (shadowMapData) {
        gl.uniform1i(shader.uniformLocations.get('uDirectionalCastsShadow'), 1);
        
        // Bind shadow map texture (use texture unit 1, reserve unit 0 for material texture)
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, shadowMapData.depthTexture);
        gl.uniform1i(shader.uniformLocations.get('uDirectionalShadowMap'), 1);
        
        // Set shadow matrix
        gl.uniformMatrix4fv(shader.uniformLocations.get('uDirectionalShadowMatrix'), false, directionalLight.shadow.matrix.elements);
        
        // Set shadow bias
        gl.uniform1f(shader.uniformLocations.get('uDirectionalShadowBias'), directionalLight.shadow.bias);
      } else {
        gl.uniform1i(shader.uniformLocations.get('uDirectionalCastsShadow'), 0);
      }
    } else {
      gl.uniform1i(shader.uniformLocations.get('uDirectionalCastsShadow'), 0);
    }

    // Set spot light shadow uniforms
    for (let i = 0; i < 4; i++) {
      if (i < spotLights.length) {
        const light = spotLights[i];
        const shadowMapData = this.shadowMaps.get(light.uuid);
        
        if (shadowMapData && light.shadow.matrix) {
          gl.uniform1i(shader.uniformLocations.get(`uSpotLightCastsShadow[${i}]`), 1);
          
          // Bind shadow map texture (use texture units 2-5 for spot light shadows)
          gl.activeTexture(gl.TEXTURE2 + i);
          gl.bindTexture(gl.TEXTURE_2D, shadowMapData.depthTexture);
          gl.uniform1i(shader.uniformLocations.get(`uSpotLightShadowMaps[${i}]`), 2 + i);
          
          // Set shadow matrix
          gl.uniformMatrix4fv(shader.uniformLocations.get(`uSpotLightShadowMatrices[${i}]`), false, light.shadow.matrix.elements);
          
          // Set shadow bias
          gl.uniform1f(shader.uniformLocations.get(`uSpotLightShadowBiases[${i}]`), light.shadow.bias);
        } else {
          gl.uniform1i(shader.uniformLocations.get(`uSpotLightCastsShadow[${i}]`), 0);
        }
      } else {
        gl.uniform1i(shader.uniformLocations.get(`uSpotLightCastsShadow[${i}]`), 0);
      }
    }
  }

  // ─── Reflection Probe Cubemap Capture ──────────────────────────

  /**
   * Render the scene from the probe's position into a 6-face cubemap,
   * run PMREM prefiltering, and upload the result to the GPU.
   *
   * The captured cubemap is stored via ResourceManager; `probe.envMapKey`
   * and `probe.envMapMaxLod` are set so the PBR draw path can bind it.
   *
   * @param {ReflectionProbe} probe
   * @param {Scene} scene
   */
  captureReflectionProbe(probe, scene) {
    if (this.gpuAPI !== 'webgl2') {
      console.warn('[GPUBackend] captureReflectionProbe() currently only supports WebGL2');
      return;
    }

    const gl = this.context;
    const res = probe.resolution;

    // ── 1. Create (or reuse) a cubemap framebuffer ──────────────
    if (!this._probeCaptureFBO) {
      this._probeCaptureFBO = gl.createFramebuffer();
      this._probeCaptureDepthRB = gl.createRenderbuffer();
    }

    // Resize depth renderbuffer if resolution changed
    if (this._probeCaptureRes !== res) {
      gl.bindRenderbuffer(gl.RENDERBUFFER, this._probeCaptureDepthRB);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, res, res);
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
      this._probeCaptureRes = res;
    }

    // Colour target: one GL cubemap texture, we render each face in turn
    const captureTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, captureTex);
    for (let face = 0; face < 6; face++) {
      gl.texImage2D(
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, 0, gl.RGBA,
        res, res, 0, gl.RGBA, gl.UNSIGNED_BYTE, null
      );
    }
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);

    // ── 2. Build 6-face view + projection matrices ──────────────
    const probePos = probe.getWorldPosition();
    const near = probe.nearPlane;
    const far  = probe.farPlane;

    // 90° symmetric perspective: left=-near, right=+near, etc.
    const projMatrix = new Matrix4();
    projMatrix.makePerspective(-near, near, near, -near, near, far);

    // Standard cubemap face look-at directions and up vectors
    // OpenGL face order: +X, -X, +Y, -Y, +Z, -Z
    const faceDirs = [
      { target: { x: 1, y: 0, z: 0 }, up: { x: 0, y: -1, z: 0 } },  // +X
      { target: { x:-1, y: 0, z: 0 }, up: { x: 0, y: -1, z: 0 } },  // -X
      { target: { x: 0, y: 1, z: 0 }, up: { x: 0, y:  0, z: 1 } },  // +Y
      { target: { x: 0, y:-1, z: 0 }, up: { x: 0, y:  0, z:-1 } },  // -Y
      { target: { x: 0, y: 0, z: 1 }, up: { x: 0, y: -1, z: 0 } },  // +Z
      { target: { x: 0, y: 0, z:-1 }, up: { x: 0, y: -1, z: 0 } },  // -Z
    ];

    // ── 3. Collect renderable meshes (skip the probe itself) ────
    const meshes = [];
    scene.traverseVisible((obj) => {
      if (obj.isMesh && obj.visible && obj !== probe) {
        obj.updateMatrixWorld();
        meshes.push(obj);
      }
    });

    // ── 4. Render each face ─────────────────────────────────────
    // Save current viewport
    const savedViewport = gl.getParameter(gl.VIEWPORT);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._probeCaptureFBO);
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,
      gl.RENDERBUFFER, this._probeCaptureDepthRB
    );

    // Flag: prevent recursion (don't sample env cubemap while capturing)
    this._capturingProbe = true;

    for (let face = 0; face < 6; face++) {
      // Attach face as colour target
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, captureTex, 0
      );

      gl.viewport(0, 0, res, res);
      gl.clearColor(
        scene.background ? scene.background.r : 0,
        scene.background ? scene.background.g : 0,
        scene.background ? scene.background.b : 0,
        1.0
      );
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // Build view matrix for this face
      const dir = faceDirs[face];
      const viewMatrix = this._buildCubeFaceViewMatrix(probePos, dir.target, dir.up);
      const viewProjMatrix = new Matrix4();
      viewProjMatrix.multiplyMatrices(projMatrix, viewMatrix);

      // Render every mesh with this face's VP matrix
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.depthMask(true);
      gl.disable(gl.BLEND);

      for (const mesh of meshes) {
        this._renderMeshForProbeCapture(gl, mesh, viewMatrix, viewProjMatrix, projMatrix, scene, probePos);
      }
    }

    this._capturingProbe = false;

    // ── 5. Restore state ────────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(savedViewport[0], savedViewport[1], savedViewport[2], savedViewport[3]);

    // ── 6. Read back pixels and run PMREM prefiltering ──────────
    // We read the 6 faces back to canvases for the CPU-based PMREM generator.
    const faceCanvases = [];
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._probeCaptureFBO);
    for (let face = 0; face < 6; face++) {
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, captureTex, 0
      );
      const pixels = new Uint8Array(res * res * 4);
      gl.readPixels(0, 0, res, res, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      const canvas = document.createElement('canvas');
      canvas.width = res;
      canvas.height = res;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(res, res);

      // Flip Y (GL reads bottom-up)
      for (let row = 0; row < res; row++) {
        const srcOffset = (res - 1 - row) * res * 4;
        const dstOffset = row * res * 4;
        imageData.data.set(pixels.subarray(srcOffset, srcOffset + res * 4), dstOffset);
      }
      ctx.putImageData(imageData, 0, 0);
      faceCanvases.push(canvas);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Delete the raw capture texture — we'll upload the PMREM version
    gl.deleteTexture(captureTex);

    // PMREM prefilter
    if (!this._pmremGenerator) {
      this._pmremGenerator = new PMREMGenerator();
    }

    // Build a CubeTexture from the captured canvases
    const capturedCube = new CubeTexture(faceCanvases);
    capturedCube.resolution = res;

    const prefiltered = this._pmremGenerator.fromCubeTexture(capturedCube, { mipLevels: 6 });
    if (!prefiltered || !prefiltered._mips || prefiltered._mips.length === 0) {
      console.warn('[GPUBackend] PMREM prefiltering failed for ReflectionProbe');
      return;
    }

    const mips = prefiltered._mips;
    const mipLevels = mips.length;

    // ── 7. Upload to GPU via ResourceManager ────────────────────
    const probeKey = '__reflection_probe_' + probe.uuid;
    if (this.resourceManager.hasTexture(probeKey)) {
      this.resourceManager.deleteTexture(probeKey);
    }
    this.resourceManager.createCubeTexture(probeKey, mips[0], res, { mips });

    probe.envMapKey    = probeKey;
    probe.envMapMaxLod = mipLevels - 1;

    console.log(`[GPUBackend] ReflectionProbe captured (${res}px, ${mipLevels} mips)`);
  }

  /**
   * Build a view matrix for one cubemap face.
   * @private
   * @returns {Matrix4}  World → Camera (view) matrix
   */
  _buildCubeFaceViewMatrix(eye, dir, up) {
    // target = eye + dir (we already have dir as a unit vector)
    const target = { x: eye.x + dir.x, y: eye.y + dir.y, z: eye.z + dir.z };

    // z = normalise(eye - target)  == normalise(-dir) for unit dir
    const zx = -dir.x, zy = -dir.y, zz = -dir.z;

    // x = normalise(up × z)
    let xx = up.y * zz - up.z * zy;
    let xy = up.z * zx - up.x * zz;
    let xz = up.x * zy - up.y * zx;
    const xLen = Math.sqrt(xx * xx + xy * xy + xz * xz) || 1;
    xx /= xLen; xy /= xLen; xz /= xLen;

    // y = z × x
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    // Translation: -dot(axis, eye)
    const tx = -(xx * eye.x + xy * eye.y + xz * eye.z);
    const ty = -(yx * eye.x + yy * eye.y + yz * eye.z);
    const tz = -(zx * eye.x + zy * eye.y + zz * eye.z);

    const m = new Matrix4();
    m.set(
      xx, xy, xz, tx,
      yx, yy, yz, ty,
      zx, zy, zz, tz,
       0,  0,  0,  1
    );
    return m;
  }

  /**
   * Render a single mesh into the probe capture FBO.
   * Uses the same shader paths as the main renderer but with the probe's
   * view/projection matrices and with IBL sampling disabled to avoid recursion.
   * @private
   */
  _renderMeshForProbeCapture(gl, mesh, viewMatrix, viewProjMatrix, projMatrix, scene, probePos) {
    const materialType = this._getMaterialType(mesh.material);
    const shader = this.shaders.get(materialType);
    if (!shader || !shader.compiled) return;

    const geometry = mesh.geometry;
    if (!geometry || !geometry.attributes || !geometry.attributes.position) return;

    const program = shader.compiled.program;
    gl.useProgram(program);

    // Get / create geometry buffers
    const geometryId = geometry.uuid || `geom_${Math.random()}`;
    let geometryBuffers = this.geometryCache.get(geometryId);
    if (!geometryBuffers) {
      geometryBuffers = this._createGeometryBuffersWebGL2(gl, geometry);
      this.geometryCache.set(geometryId, geometryBuffers);
    }
    if (!geometryBuffers) return;

    // MVP matrix
    const mvp = new Matrix4();
    mvp.multiplyMatrices(viewProjMatrix, mesh.matrixWorld);

    // Branch by material type — mirrors the main draw path
    if (materialType === 'PBRMaterial') {
      this._renderPBRMeshForProbe(gl, shader, mesh, mvp, viewMatrix, scene, probePos, geometryBuffers);
    } else if (materialType === 'GridOverlayMaterial') {
      // Skip grid during probe capture
      return;
    } else {
      // BasicMaterial / LambertMaterial — use the standard uniform layout
      this._renderLambertMeshForProbe(gl, shader, mesh, mvp, scene, materialType, geometryBuffers);
    }
  }

  /** @private Draw a PBR mesh into the probe capture FBO */
  _renderPBRMeshForProbe(gl, shader, mesh, mvp, viewMatrix, scene, probePos, geometryBuffers) {
    const material = mesh.material;

    // Transforms
    gl.uniformMatrix4fv(shader.uniformLocations.get('mvpMatrix'), false, mvp.elements);
    gl.uniformMatrix4fv(shader.uniformLocations.get('modelMatrix'), false, mesh.matrixWorld.elements);
    const normalMatrix = new Matrix4();
    normalMatrix.copy(mesh.matrixWorld).invert().transpose();
    gl.uniformMatrix4fv(shader.uniformLocations.get('normalMatrix'), false, normalMatrix.elements);

    // Material
    const c = material.color || { r: 1, g: 1, b: 1 };
    gl.uniform4f(shader.uniformLocations.get('baseColor'), c.r, c.g, c.b, 1.0);
    gl.uniform1f(shader.uniformLocations.get('metallic'), material.metallic !== undefined ? material.metallic : 0.0);
    gl.uniform1f(shader.uniformLocations.get('roughness'), material.roughness !== undefined ? material.roughness : 0.5);
    gl.uniform1f(shader.uniformLocations.get('opacity'), material.opacity !== undefined ? material.opacity : 1.0);
    gl.uniform3f(shader.uniformLocations.get('cameraPosition'), probePos.x, probePos.y, probePos.z);

    // Emissive
    const em = material.emissive || { r: 0, g: 0, b: 0 };
    gl.uniform3f(shader.uniformLocations.get('emissiveColor'), em.r, em.g, em.b);
    gl.uniform1f(shader.uniformLocations.get('emissiveIntensity'), material.emissiveIntensity || 0);

    // Texture
    const hasTexture = material.map && material.map.image;
    gl.uniform1i(shader.uniformLocations.get('uHasBaseColorTexture'), hasTexture ? 1 : 0);
    if (hasTexture) {
      if (!this.resourceManager.textures.has(material.map.uuid)) {
        this.resourceManager.createTexture(material.map.uuid, material.map.image, material.map.image.width, material.map.image.height);
      }
      const tex = this.resourceManager.getTexture(material.map.uuid);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex.texture);
      gl.uniform1i(shader.uniformLocations.get('baseColorTexture'), 0);
    } else {
      if (!this._pbrDefaultTexture) {
        this._pbrDefaultTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this._pbrDefaultTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this._pbrDefaultTexture);
      gl.uniform1i(shader.uniformLocations.get('baseColorTexture'), 0);
    }

    // Lighting (same as main path)
    this._setPBRLightingUniformsWebGL2(gl, shader, scene);

    // IBL: DISABLED during capture to avoid recursion.
    // Bind dummy cubemap to unit 6 and mark as no-env.
    gl.uniform1i(shader.uniformLocations.get('uHasEnvMap'), 0);
    gl.uniform1i(shader.uniformLocations.get('uEnvMap'), 6);
    if (!this._dummyCubeMap) {
      this._dummyCubeMap = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, this._dummyCubeMap);
      const pixel = new Uint8Array([0, 0, 0, 255]);
      for (let f = 0; f < 6; f++) {
        gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      }
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this._dummyCubeMap);

    gl.uniform1i(shader.uniformLocations.get('uHasBRDFLUT'), 0);
    gl.uniform1i(shader.uniformLocations.get('uBRDFLUT'), 7);
    gl.uniform1i(shader.uniformLocations.get('uHasPlanarReflection'), 0);
    gl.uniform1i(shader.uniformLocations.get('uPlanarReflectionMap'), 8);
    gl.uniform1f(shader.uniformLocations.get('uSceneEnvIntensity'), 0);

    // Bind vertex attributes
    const posLoc  = shader.attributeLocations.get('position');
    const normLoc = shader.attributeLocations.get('normal');
    const uvLoc   = shader.attributeLocations.get('uv');

    gl.bindBuffer(gl.ARRAY_BUFFER, geometryBuffers.vertexBuffer.buffer);
    if (posLoc >= 0)  { gl.enableVertexAttribArray(posLoc);  gl.vertexAttribPointer(posLoc,  3, gl.FLOAT, false, 32, 0);  }
    if (normLoc >= 0) { gl.enableVertexAttribArray(normLoc); gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, 32, 12); }
    if (uvLoc >= 0)   { gl.enableVertexAttribArray(uvLoc);   gl.vertexAttribPointer(uvLoc,   2, gl.FLOAT, false, 32, 24); }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geometryBuffers.indexBuffer.buffer);
    gl.drawElements(gl.TRIANGLES, geometryBuffers.indexCount, geometryBuffers.indexType, 0);
  }

  /** @private Draw a Lambert/Basic mesh into the probe capture FBO */
  _renderLambertMeshForProbe(gl, shader, mesh, mvp, scene, materialType, geometryBuffers) {
    const material = mesh.material;

    gl.uniformMatrix4fv(shader.uniformLocations.get('uModelViewProjection'), false, mvp.elements);
    gl.uniformMatrix4fv(shader.uniformLocations.get('uModel'), false, mesh.matrixWorld.elements);

    if (materialType === 'LambertMaterial') {
      const normalMatrix = new Matrix4();
      normalMatrix.copy(mesh.matrixWorld).invert().transpose();
      gl.uniformMatrix4fv(shader.uniformLocations.get('uNormalMatrix'), false, normalMatrix.elements);
    }

    const c = material.color || { r: 1, g: 1, b: 1 };
    gl.uniform4f(shader.uniformLocations.get('uColor'), c.r, c.g, c.b, 1.0);
    gl.uniform1f(shader.uniformLocations.get('uOpacity'), material.opacity !== undefined ? material.opacity : 1.0);

    if (materialType === 'LambertMaterial') {
      this._setLightingUniformsWebGL2(gl, shader, scene);
      gl.uniform1i(shader.uniformLocations.get('uShadowsEnabled'), 0);
    }

    const hasTexture = material.map && material.map.image;
    gl.uniform1i(shader.uniformLocations.get('uHasTexture'), hasTexture ? 1 : 0);
    if (hasTexture) {
      if (!this.resourceManager.textures.has(material.map.uuid)) {
        this.resourceManager.createTexture(material.map.uuid, material.map.image, material.map.image.width, material.map.image.height);
      }
      const tex = this.resourceManager.getTexture(material.map.uuid);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex.texture);
      gl.uniform1i(shader.uniformLocations.get('uTexture'), 0);
    }

    const aPosition = shader.attributeLocations.get('aPosition');
    const aNormal   = shader.attributeLocations.get('aNormal');
    const aUV       = shader.attributeLocations.get('aUV');

    gl.bindBuffer(gl.ARRAY_BUFFER, geometryBuffers.vertexBuffer.buffer);
    if (aPosition >= 0) { gl.enableVertexAttribArray(aPosition); gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 32, 0);  }
    if (aNormal >= 0)   { gl.enableVertexAttribArray(aNormal);   gl.vertexAttribPointer(aNormal,   3, gl.FLOAT, false, 32, 12); }
    if (aUV >= 0)       { gl.enableVertexAttribArray(aUV);       gl.vertexAttribPointer(aUV,       2, gl.FLOAT, false, 32, 24); }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geometryBuffers.indexBuffer.buffer);
    gl.drawElements(gl.TRIANGLES, geometryBuffers.indexCount, geometryBuffers.indexType, 0);
  }

  /**
   * Ensure IBL resources (prefiltered env cubemap + BRDF LUT) are uploaded to the GPU.
   * Called lazily before PBR rendering when scene.environment is set.
   * 
   * Texture unit allocation for PBR:
   *   TEXTURE0  = base color texture
   *   TEXTURE1  = directional shadow map
   *   TEXTURE2-5 = spot shadow maps
   *   TEXTURE6  = env cubemap (prefiltered)
   *   TEXTURE7  = BRDF LUT
   *   TEXTURE8  = planar reflection map
   * 
   * @param {Scene} scene
   * @private
   */
  _ensureIBLResources(scene) {
    // Always generate BRDF LUT — needed for reflection probes even without scene.environment
    if (!this._iblBRDFLUTKey) {
      if (!this._pmremGenerator) {
        this._pmremGenerator = new PMREMGenerator();
      }
      const brdfCanvas = this._pmremGenerator.generateBRDFLUT(256);
      const brdfKey = '__ibl_brdf_lut';
      this.resourceManager.createTexture(brdfKey, brdfCanvas, 256, 256);
      this._iblBRDFLUTKey = brdfKey;
    }

    const env = scene.environment;
    if (!env) return;

    // Re-generate if environment changed
    const envId = env.uuid || env;
    if (this._iblSceneEnvVersion === envId && this._iblEnvMapKey) return;

    if (!this._pmremGenerator) {
      this._pmremGenerator = new PMREMGenerator();
    }

    // Generate prefiltered cubemap (CPU-based)
    const prefiltered = this._pmremGenerator.fromCubeTexture(env, { mipLevels: 6 });
    if (!prefiltered || !prefiltered._mips || prefiltered._mips.length === 0) {
      console.warn('[GPUBackend] PMREM generation failed — IBL disabled');
      return;
    }

    // Build face arrays for upload: faces[mipLevel] = [6 face canvases/images]
    const mips = prefiltered._mips; // mips[level] = [6 canvases]
    const mipLevels = mips.length;
    const baseSize = prefiltered.resolution || 256;

    // Upload prefiltered cubemap
    const envKey = '__ibl_envmap_' + envId;
    if (this.resourceManager.hasTexture(envKey)) {
      this.resourceManager.deleteTexture(envKey);
    }
    this.resourceManager.createCubeTexture(envKey, mips[0], baseSize, { mips });
    this._iblEnvMapKey = envKey;
    this._iblEnvMapMaxLod = mipLevels - 1;

    this._iblSceneEnvVersion = envId;
    console.log(`[GPUBackend] IBL resources uploaded (${mipLevels} mip levels, base ${baseSize}px)`);
  }

  /**
   * Create geometry buffers for WebGL2
   */
  _createGeometryBuffersWebGL2(gl, geometry) {
    const positions = geometry.attributes.position.array;
    const normals = geometry.attributes.normal ? geometry.attributes.normal.array : new Float32Array(positions.length);
    const uvs = geometry.attributes.uv ? geometry.attributes.uv.array : new Float32Array((positions.length / 3) * 2);
    
    // Ensure defaults
    if (!geometry.attributes.normal) {
      for (let i = 0; i < normals.length; i += 3) {
        normals[i] = 0;
        normals[i + 1] = 1;
        normals[i + 2] = 0;
      }
    }
    if (!geometry.attributes.uv) {
      for (let i = 0; i < uvs.length; i += 2) {
        uvs[i] = 0;
        uvs[i + 1] = 0;
      }
    }

    // Interleave
    const vertexCount = positions.length / 3;
    const vertexData = new Float32Array(vertexCount * 8);

    for (let i = 0; i < vertexCount; i++) {
      const offset = i * 8;
      vertexData[offset + 0] = positions[i * 3 + 0];
      vertexData[offset + 1] = positions[i * 3 + 1];
      vertexData[offset + 2] = positions[i * 3 + 2];
      vertexData[offset + 3] = normals[i * 3 + 0];
      vertexData[offset + 4] = normals[i * 3 + 1];
      vertexData[offset + 5] = normals[i * 3 + 2];
      vertexData[offset + 6] = uvs[i * 2 + 0];
      vertexData[offset + 7] = uvs[i * 2 + 1];
    }

    const vertexBuffer = this.resourceManager.createBuffer(
      `vertex_${geometry.uuid}`,
      vertexData,
      'vertex'
    );

    const indices = geometry.index ? geometry.index.array : null;
    const indexData = indices || this._generateIndices(vertexCount);
    
    // Determine index type for WebGL2
    const indexType = indexData instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;

    const indexBuffer = this.resourceManager.createBuffer(
      `index_${geometry.uuid}`,
      indexData,
      'index'
    );

    return {
      vertexBuffer,
      indexBuffer,
      indexCount: indexData.length,
      indexType
    };
  }

  /**
   * Generate indices for non-indexed geometry
   */
  _generateIndices(vertexCount) {
    const indices = new Uint32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      indices[i] = i;
    }
    return indices;
  }

  /**
   * Setup render target resources (Phase 3)
   */
  setupRenderTarget(renderTarget) {
    if (!this._ready || !renderTarget || !renderTarget.needsUpdate) return;
    
    if (this.gpuAPI === 'webgpu') {
      this._setupRenderTargetWebGPU(renderTarget);
    } else if (this.gpuAPI === 'webgl2') {
      this._setupRenderTargetWebGL2(renderTarget);
    }
    
    renderTarget.needsUpdate = false;
  }
  
  /**
   * Setup render target for WebGPU (Phase 3)
   */
  _setupRenderTargetWebGPU(rt) {
    // Dispose existing resources
    if (rt.gpuTexture) {
      rt.gpuTexture.destroy();
    }
    if (rt.gpuDepthTexture) {
      rt.gpuDepthTexture.destroy();
    }
    
    // Create color texture
    rt.gpuTexture = this.device.createTexture({
      size: { width: rt.width, height: rt.height, depthOrArrayLayers: 1 },
      format: rt.format || 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    
    rt.gpuTextureView = rt.gpuTexture.createView();
    
    // Create depth texture if needed
    if (rt.hasDepth) {
      rt.gpuDepthTexture = this.device.createTexture({
        size: { width: rt.width, height: rt.height, depthOrArrayLayers: 1 },
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT
      });
      
      rt.gpuDepthTextureView = rt.gpuDepthTexture.createView();
    }
  }
  
  /**
   * Setup render target for WebGL2 (Phase 3)
   */
  _setupRenderTargetWebGL2(rt) {
    const gl = this.context;
    
    // Dispose existing resources
    if (rt.glFramebuffer) {
      gl.deleteFramebuffer(rt.glFramebuffer);
    }
    if (rt.glTexture) {
      gl.deleteTexture(rt.glTexture);
    }
    if (rt.glDepthBuffer) {
      gl.deleteRenderbuffer(rt.glDepthBuffer);
    }
    
    // Create framebuffer
    rt.glFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.glFramebuffer);
    
    // Create color texture
    rt.glTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, rt.glTexture);
    
    const formatInfo = rt.constructor.getWebGLFormat(gl, rt.format);
    gl.texImage2D(gl.TEXTURE_2D, 0, formatInfo.internalFormat, rt.width, rt.height, 0, formatInfo.format, formatInfo.type, null);
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, rt.constructor.getWebGLFilter(gl, rt.minFilter));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, rt.constructor.getWebGLFilter(gl, rt.magFilter));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, rt.constructor.getWebGLWrap(gl, rt.wrapS));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, rt.constructor.getWebGLWrap(gl, rt.wrapT));
    
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rt.glTexture, 0);
    
    // Create depth buffer if needed
    if (rt.hasDepth) {
      rt.glDepthBuffer = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, rt.glDepthBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, rt.width, rt.height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rt.glDepthBuffer);
    }
    
    // Check framebuffer status
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.error('[GPUBackend] Framebuffer incomplete:', status);
    }
    
    // Unbind
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  
  /**
   * Compile post-processing pass (Phase 3)
   */
  compilePostProcessPass(pass) {
    if (!this._ready) return;
    
    if (this.gpuAPI === 'webgpu') {
      this._compilePostProcessPassWebGPU(pass);
    } else if (this.gpuAPI === 'webgl2') {
      this._compilePostProcessPassWebGL2(pass);
    }
  }
  
  /**
   * Compile post-process pass for WebGPU (Phase 3)
   */
  _compilePostProcessPassWebGPU(pass) {
    // Create vertex shader module
    const vertexModule = this.device.createShaderModule({
      code: pass.vertexShaderWGSL
    });
    
    // Create fragment shader module
    const fragmentModule = this.device.createShaderModule({
      code: pass.fragmentShaderWGSL
    });
    
    // Create bind group layout
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }
      ]
    });
    
    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout]
    });
    
    // Create render pipeline
    pass.pipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: vertexModule,
        entryPoint: 'main'
      },
      fragment: {
        module: fragmentModule,
        entryPoint: 'main',
        targets: [{ format: this.format }]
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'none'
      }
    });
    
    // Create sampler
    pass.sampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear'
    });
    
    pass._bindGroupLayout = bindGroupLayout;
  }
  
  /**
   * Compile post-process pass for WebGL2 (Phase 3)
   */
  _compilePostProcessPassWebGL2(pass) {
    const gl = this.context;
    
    // Create vertex shader
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, pass.vertexShaderGLSL);
    gl.compileShader(vertexShader);
    
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      console.error('[GPUBackend] Vertex shader compilation failed:', gl.getShaderInfoLog(vertexShader));
      return;
    }
    
    // Create fragment shader
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, pass.fragmentShaderGLSL);
    gl.compileShader(fragmentShader);
    
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.error('[GPUBackend] Fragment shader compilation failed:', gl.getShaderInfoLog(fragmentShader));
      return;
    }
    
    // Create program
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[GPUBackend] Program linking failed:', gl.getProgramInfoLog(program));
      return;
    }
    
    // Store program and uniform locations
    pass.pipeline = program;
    pass._uniformLocations = {};
    
    // Get uniform locations
    gl.useProgram(program);
    pass._uniformLocations.inputTexture = gl.getUniformLocation(program, 'inputTexture');
    
    for (const name in pass.uniforms) {
      pass._uniformLocations[name] = gl.getUniformLocation(program, name);
    }
    
    gl.useProgram(null);
  }
  
  /**
   * Render post-processing pass (Phase 3)
   */
  renderPostProcessPass(pass, inputTexture, outputTarget = null) {
    if (!this._ready || !pass.pipeline) return;
    
    if (this.gpuAPI === 'webgpu') {
      this._renderPostProcessPassWebGPU(pass, inputTexture, outputTarget);
    } else if (this.gpuAPI === 'webgl2') {
      this._renderPostProcessPassWebGL2(pass, inputTexture, outputTarget);
    }
  }
  
  /**
   * Render post-process pass (WebGPU) (Phase 3)
   */
  _renderPostProcessPassWebGPU(pass, inputTexture, outputTarget) {
    // Create uniform buffer for pass uniforms
    const uniformData = new Float32Array(16); // Max 64 bytes
    let offset = 0;
    
    for (const name in pass.uniforms) {
      const value = pass.uniforms[name];
      if (typeof value === 'number') {
        uniformData[offset++] = value;
      } else if (value.x !== undefined) {
        uniformData[offset++] = value.x;
        uniformData[offset++] = value.y || 0;
      }
    }
    
    const uniformBuffer = this.device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(uniformBuffer, 0, uniformData);
    
    // Create bind group
    const bindGroup = this.device.createBindGroup({
      layout: pass._bindGroupLayout,
      entries: [
        { binding: 0, resource: inputTexture.createView ? inputTexture.createView() : inputTexture },
        { binding: 1, resource: pass.sampler },
        { binding: 2, resource: { buffer: uniformBuffer } }
      ]
    });
    
    // Create command encoder
    const commandEncoder = this.device.createCommandEncoder();
    
    // Get output attachment
    const colorAttachment = outputTarget ? outputTarget.gpuTextureView : this.context.getCurrentTexture().createView();
    
    // Create render pass
    const renderPassDescriptor = {
      colorAttachments: [{
        view: colorAttachment,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 }
      }]
    };
    
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(pass.pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(3, 1, 0, 0); // Full-screen triangle
    passEncoder.end();
    
    // Submit
    this.device.queue.submit([commandEncoder.finish()]);
  }
  
  /**
   * Render post-process pass (WebGL2) (Phase 3)
   */
  _renderPostProcessPassWebGL2(pass, inputTexture, outputTarget) {
    const gl = this.context;
    
    // Bind output framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, outputTarget ? outputTarget.glFramebuffer : null);
    
    // Set viewport
    if (outputTarget) {
      gl.viewport(0, 0, outputTarget.width, outputTarget.height);
    } else {
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
    
    // Use program
    gl.useProgram(pass.pipeline);
    
    // Bind input texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTexture);
    gl.uniform1i(pass._uniformLocations.inputTexture, 0);
    
    // Set uniforms
    for (const name in pass.uniforms) {
      const location = pass._uniformLocations[name];
      if (!location) continue;
      
      const value = pass.uniforms[name];
      if (typeof value === 'number') {
        gl.uniform1f(location, value);
      } else if (value.x !== undefined && value.y !== undefined) {
        gl.uniform2f(location, value.x, value.y);
      }
    }
    
    // Draw full-screen triangle
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    
    // Cleanup
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.useProgram(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Present rendered image
   */
  present() {
    // WebGL2: automatically presents
    // WebGPU: submit happens in render
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SSR — Screen-Space Reflections (WebGL2 only)
  // ═══════════════════════════════════════════════════════════════════════════

  // ═════════════════════════════════════════════════════════════════════════
  // Point Cloud rendering (WebGL2)
  // ═════════════════════════════════════════════════════════════════════════

  _getPointCloudBuffers(gl, pc) {
    const id = pc.uuid;
    let cached = this._pointCloudCache.get(id);
    if (cached && cached.gpuId === pc._gpuBuffersId) return cached;

    // (Re)create
    if (cached) {
      gl.deleteBuffer(cached.posBuf);
      gl.deleteBuffer(cached.colBuf);
      if (cached.vao) gl.deleteVertexArray(cached.vao);
    }

    const shader = this.shaders.get('PointCloud');
    if (!shader || !shader.compiled) return null;

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // Positions
    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, pc.positions, gl.STATIC_DRAW);
    const posLoc = shader.attributeLocations.get('aPosition');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

    // Colours (Uint8 → normalised)
    const colBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, pc.colors, gl.STATIC_DRAW);
    const colLoc = shader.attributeLocations.get('aColor');
    gl.enableVertexAttribArray(colLoc);
    gl.vertexAttribPointer(colLoc, 3, gl.UNSIGNED_BYTE, true, 0, 0);

    gl.bindVertexArray(null);

    const gpuId = `pc_${Date.now()}_${Math.random()}`;
    pc._gpuBuffersId = gpuId;
    cached = { vao, posBuf, colBuf, count: pc.count, gpuId };
    this._pointCloudCache.set(id, cached);
    return cached;
  }

  _renderPointCloudsWebGL2(gl, camera, pointClouds) {
    const shader = this.shaders.get('PointCloud');
    if (!shader || !shader.compiled) return;

    gl.useProgram(shader.compiled.program);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);

    const modelView = new Matrix4();
    const mvp = new Matrix4();

    for (const pc of pointClouds) {
      const bufs = this._getPointCloudBuffers(gl, pc);
      if (!bufs) continue;

      pc.updateMatrixWorld();
      modelView.multiplyMatrices(camera.matrixWorldInverse, pc.matrixWorld);
      mvp.multiplyMatrices(camera.projectionMatrix, modelView);

      gl.uniformMatrix4fv(shader.uniformLocations.get('uModelViewProjection'), false, mvp.elements);
      gl.uniformMatrix4fv(shader.uniformLocations.get('uModelView'), false, modelView.elements);
      gl.uniform1f(shader.uniformLocations.get('uPointSize'), pc.pointSize);
      gl.uniform1i(shader.uniformLocations.get('uSizeMode'), pc.sizeMode === 'attenuated' ? 1 : 0);
      gl.uniform1f(shader.uniformLocations.get('uCanvasHeight'), this.canvas.height);
      gl.uniform1f(shader.uniformLocations.get('uOpacity'), 1.0);
      gl.uniform1i(shader.uniformLocations.get('uGamma'), pc.gammaCorrect ? 1 : 0);

      // Blending
      if (pc.blendMode === 'alpha') {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      } else if (pc.blendMode === 'additive') {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      } else {
        gl.disable(gl.BLEND);
      }

      gl.bindVertexArray(bufs.vao);
      gl.drawArrays(gl.POINTS, 0, bufs.count);
      gl.bindVertexArray(null);
    }

    gl.disable(gl.BLEND);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Gaussian Splat rendering (WebGL2)
  // ═════════════════════════════════════════════════════════════════════════

  _getSplatBuffers(gl, cloud) {
    const id = cloud.uuid;
    let cached = this._splatCache.get(id);
    if (cached && cached.gpuId === cloud._gpuBuffersId) return cached;

    // Clean up previous
    if (cached) {
      if (cached.vao) gl.deleteVertexArray(cached.vao);
      if (cached.quadBuf) gl.deleteBuffer(cached.quadBuf);
      if (cached.idxBuf) gl.deleteBuffer(cached.idxBuf);
      for (const t of [cached.dataTex0, cached.dataTex1, cached.dataTex2, cached.dataTex3, cached.sortTex]) {
        if (t) gl.deleteTexture(t);
      }
    }

    const shader = this.shaders.get('GaussianSplat');
    if (!shader || !shader.compiled) return null;

    const n = cloud.count;
    // Texture width: ceil(sqrt(n)) so everything fits
    const dataW = Math.ceil(Math.sqrt(n));
    const texels = dataW * Math.ceil(n / dataW);  // total texels in rectangular texture
    const dataH = Math.ceil(n / dataW);

    // Build RGBA32F data: 4 textures
    const t0 = new Float32Array(dataW * dataH * 4);
    const t1 = new Float32Array(dataW * dataH * 4);
    const t2 = new Float32Array(dataW * dataH * 4);
    const t3 = new Float32Array(dataW * dataH * 4);

    const pos = cloud.positions, sc = cloud.scales, rot = cloud.rotations, col = cloud.colors;
    for (let i = 0; i < n; i++) {
      const i4 = i * 4;
      // tex0: x, y, z, sx
      t0[i4]     = pos[i * 3];
      t0[i4 + 1] = pos[i * 3 + 1];
      t0[i4 + 2] = pos[i * 3 + 2];
      t0[i4 + 3] = sc[i * 3];
      // tex1: sy, sz, qw, qx
      t1[i4]     = sc[i * 3 + 1];
      t1[i4 + 1] = sc[i * 3 + 2];
      t1[i4 + 2] = rot[i * 4];
      t1[i4 + 3] = rot[i * 4 + 1];
      // tex2: qy, qz, r, g  (colour 0-1)
      t2[i4]     = rot[i * 4 + 2];
      t2[i4 + 1] = rot[i * 4 + 3];
      t2[i4 + 2] = col[i * 4] / 255;
      t2[i4 + 3] = col[i * 4 + 1] / 255;
      // tex3: b, a, pad, pad
      t3[i4]     = col[i * 4 + 2] / 255;
      t3[i4 + 1] = col[i * 4 + 3] / 255;
      t3[i4 + 2] = 0;
      t3[i4 + 3] = 0;
    }

    const makeRGBA32F = (data) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, dataW, dataH, 0, gl.RGBA, gl.FLOAT, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    };

    const dataTex0 = makeRGBA32F(t0);
    const dataTex1 = makeRGBA32F(t1);
    const dataTex2 = makeRGBA32F(t2);
    const dataTex3 = makeRGBA32F(t3);

    // Sort index texture (R32F, updated each frame)
    const idxW = dataW;
    const idxH = dataH;
    const sortTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, sortTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, idxW, idxH, 0, gl.RED, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Quad VAO
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const quadVerts = new Float32Array([
      -1, -1,  1, -1,  1, 1,  -1, 1
    ]);
    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
    const qLoc = shader.attributeLocations.get('aQuadPos');
    gl.enableVertexAttribArray(qLoc);
    gl.vertexAttribPointer(qLoc, 2, gl.FLOAT, false, 0, 0);

    const quadIdx = new Uint16Array([0, 1, 2,  0, 2, 3]);
    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, quadIdx, gl.STATIC_DRAW);

    gl.bindVertexArray(null);

    const gpuId = `splat_${Date.now()}_${Math.random()}`;
    cloud._gpuBuffersId = gpuId;

    cached = { vao, quadBuf, idxBuf, dataTex0, dataTex1, dataTex2, dataTex3, sortTex, dataW, dataH, idxW, idxH, count: n, gpuId };
    this._splatCache.set(id, cached);
    return cached;
  }

  _renderSplatCloudsWebGL2(gl, camera, splatClouds) {
    const shader = this.shaders.get('GaussianSplat');
    if (!shader || !shader.compiled) return;

    gl.useProgram(shader.compiled.program);

    for (const cloud of splatClouds) {
      const bufs = this._getSplatBuffers(gl, cloud);
      if (!bufs) continue;

      const n = Math.min(cloud.count, cloud.maxSplats > 0 ? cloud.maxSplats : cloud.count);

      // Sort (CPU) — only when camera moved
      const camPos = camera.position;
      const dx = camPos.x - cloud._lastSortCamPos.x;
      const dy = camPos.y - cloud._lastSortCamPos.y;
      const dz = camPos.z - cloud._lastSortCamPos.z;
      if (dx * dx + dy * dy + dz * dz > cloud._sortThreshold * cloud._sortThreshold) {
        cloud.sortByDepth(camera.matrixWorldInverse);
        cloud._lastSortCamPos.set(camPos.x, camPos.y, camPos.z);
      }

      // Upload sorted indices as R32F texture
      const sortData = new Float32Array(bufs.idxW * bufs.idxH);
      for (let i = 0; i < n; i++) sortData[i] = cloud._sortedIndices[i];
      gl.bindTexture(gl.TEXTURE_2D, bufs.sortTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, bufs.idxW, bufs.idxH, gl.RED, gl.FLOAT, sortData);

      // Uniforms
      const u = shader.uniformLocations;
      gl.uniformMatrix4fv(u.get('uView'), false, camera.matrixWorldInverse.elements);
      gl.uniformMatrix4fv(u.get('uProjection'), false, camera.projectionMatrix.elements);
      gl.uniform2f(u.get('uViewport'), this.canvas.width, this.canvas.height);
      gl.uniform1f(u.get('uCutoff'), cloud.cutoff);
      gl.uniform1i(u.get('uDataWidth'), bufs.dataW);
      gl.uniform1i(u.get('uIndexWidth'), bufs.idxW);

      // Bind data textures
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bufs.dataTex0); gl.uniform1i(u.get('uDataTex0'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bufs.dataTex1); gl.uniform1i(u.get('uDataTex1'), 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, bufs.dataTex2); gl.uniform1i(u.get('uDataTex2'), 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, bufs.dataTex3); gl.uniform1i(u.get('uDataTex3'), 3);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, bufs.sortTex);  gl.uniform1i(u.get('uSortedIndices'), 4);

      // State: translucent, no depth write, premultiplied alpha
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(cloud.depthWrite);
      gl.enable(gl.BLEND);
      if (cloud.blendMode === 'additive') {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      } else {
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied
      }

      gl.bindVertexArray(bufs.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, n);
      gl.bindVertexArray(null);
    }

    // Restore
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  /**
   * Enable or disable SSR.  When enabled the WebGL2 render path switches to
   * rendering through an MRT G-buffer, then runs SSR ray-march + composite.
   *
   * @param {boolean} on
   * @param {Object}  [options]  Override any SSR_DEFAULTS key
   */
  enableSSR(on = true, options = {}) {
    if (this.gpuAPI !== 'webgl2') {
      console.warn('[GPUBackend] SSR is only supported on the WebGL2 backend');
      return;
    }
    this._ssrEnabled = on;
    if (on) {
      if (!this._ssrPass) {
        this._ssrPass = new SSRPass(options);
      } else {
        Object.assign(this._ssrPass.ssrOptions, options);
      }
      console.log('[GPUBackend] SSR enabled', this._ssrPass.ssrOptions);
    } else {
      console.log('[GPUBackend] SSR disabled');
    }
  }

  /** @returns {SSRPass|null} */
  get ssrPass() { return this._ssrPass; }

  /**
   * (Re)create the SSR G-buffer FBO with MRT:
   *   COLOR_ATTACHMENT0 = scene color (RGBA8)
   *   COLOR_ATTACHMENT1 = view-space normals (RGBA8)
   *   COLOR_ATTACHMENT2 = material props (RGBA8, R=metallic G=roughness B=reflectivity)
   *   DEPTH_ATTACHMENT  = depth texture (DEPTH_COMPONENT24)
   * @private
   */
  _ensureSSRGBuffer(gl, width, height) {
    if (this._ssrGBuffer && this._ssrGBuffer.width === width && this._ssrGBuffer.height === height) {
      return this._ssrGBuffer;
    }

    // Destroy old
    if (this._ssrGBuffer) {
      gl.deleteFramebuffer(this._ssrGBuffer.fbo);
      gl.deleteTexture(this._ssrGBuffer.color);
      gl.deleteTexture(this._ssrGBuffer.depth);
      gl.deleteTexture(this._ssrGBuffer.normals);
      gl.deleteTexture(this._ssrGBuffer.material);
    }

    const makeTexRGBA = (useMipmaps = false) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, useMipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    };

    const color    = makeTexRGBA(true);   // mipmaps generated in _runSSRPasses for roughness blur
    const normals  = makeTexRGBA(false);  // no mipmaps needed
    const material = makeTexRGBA(false);  // no mipmaps needed

    // Depth texture (sampleable)
    const depth = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depth);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, width, height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // FBO
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color,    0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, normals,  0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, material, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,  gl.TEXTURE_2D, depth,    0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.error('[GPUBackend] SSR G-buffer FBO incomplete:', status);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return null;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    this._ssrGBuffer = { fbo, color, depth, normals, material, width, height };
    if (this._ssrDebug) {
      console.log(`[GPUBackend] SSR G-buffer allocated (${width}×${height})`);
    }
    return this._ssrGBuffer;
  }

  /**
   * Run the two-pass SSR pipeline after the scene has been rendered to the MRT FBO.
   * Pass 1: SSR ray-march  →  intermediate FBO (reflection + confidence)
   * Pass 2: Composite      →  default framebuffer (screen)
   * @private
   */
  _runSSRPasses(gl, camera, width, height, outputTarget = null) {
    const pass = this._ssrPass;
    const gb   = this._ssrGBuffer;
    if (!pass || !gb) return;

    // Compile on first use
    if (!pass._compiled) {
      pass.compile(gl);
    }

    // Generate mipmaps for scene color (roughness-based blur)
    gl.bindTexture(gl.TEXTURE_2D, gb.color);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Pass 1 — SSR ray march
    pass.renderSSR(gl, gb, camera, width, height);

    // Pass 2 — Composite (outputTarget = null → canvas, or PostFX FBO)
    const compositeFBO = outputTarget ? outputTarget.glFramebuffer : null;
    pass.renderComposite(gl, gb, compositeFBO, width, height);

    if (this._ssrDebug) {
      console.log('[GPUBackend] SSR passes executed');
    }
  }


  /**
   * Dispose of resources
   */
  dispose() {
    if (this.resourceManager) {
      this.resourceManager.dispose();
    }

    for (const shader of this.shaders.values()) {
      shader.dispose();
    }
    this.shaders.clear();

    this.pipelines.clear();
    this.geometryCache.clear();

    // Clean up IBL resources
    this._pmremGenerator = null;
    this._iblEnvMapKey = null;
    this._iblBRDFLUTKey = null;
    this._iblSceneEnvVersion = null;

    // Clean up SSR resources
    if (this._ssrPass && this.context) {
      this._ssrPass.dispose(this.context);
      this._ssrPass = null;
    }
    if (this._ssrGBuffer && this.context) {
      const gl = this.context;
      gl.deleteFramebuffer(this._ssrGBuffer.fbo);
      gl.deleteTexture(this._ssrGBuffer.color);
      gl.deleteTexture(this._ssrGBuffer.depth);
      gl.deleteTexture(this._ssrGBuffer.normals);
      gl.deleteTexture(this._ssrGBuffer.material);
      this._ssrGBuffer = null;
    }

    // Clean up dummy textures
    if (this._dummyCubeMap && this.context) {
      this.context.deleteTexture(this._dummyCubeMap);
      this._dummyCubeMap = null;
    }
    if (this._pbrDefaultTexture && this.context) {
      this.context.deleteTexture(this._pbrDefaultTexture);
      this._pbrDefaultTexture = null;
    }

    // Clean up point cloud GPU buffers
    if (this._pointCloudCache && this.context) {
      const gl = this.context;
      for (const entry of this._pointCloudCache.values()) {
        if (entry.vao) gl.deleteVertexArray(entry.vao);
        if (entry.posBuf) gl.deleteBuffer(entry.posBuf);
        if (entry.colBuf) gl.deleteBuffer(entry.colBuf);
      }
      this._pointCloudCache.clear();
    }

    // Clean up Gaussian splat GPU buffers
    if (this._splatCache && this.context) {
      const gl = this.context;
      for (const entry of this._splatCache.values()) {
        if (entry.vao) gl.deleteVertexArray(entry.vao);
        if (entry.quadBuf) gl.deleteBuffer(entry.quadBuf);
        if (entry.idxBuf) gl.deleteBuffer(entry.idxBuf);
        if (entry.dataTex0) gl.deleteTexture(entry.dataTex0);
        if (entry.dataTex1) gl.deleteTexture(entry.dataTex1);
        if (entry.dataTex2) gl.deleteTexture(entry.dataTex2);
        if (entry.dataTex3) gl.deleteTexture(entry.dataTex3);
        if (entry.sortTex) gl.deleteTexture(entry.sortTex);
      }
      this._splatCache.clear();
    }

    if (this.device) {
      this.device.destroy();
      this.device = null;
    }

    this.adapter = null;
    this.context = null;
    this._ready = false;
  }

  /**
   * Get initialization error
   */
  getInitError() {
    return this._initError;
  }
}
