/**
 * PathTracerRenderer — WebGPU compute-based progressive path tracer.
 *
 * Orchestrates:
 *   1. Scene export → flat GPU buffers
 *   2. BVH build
 *   3. Compute shader dispatch (path tracing)
 *   4. Accumulation
 *   5. Denoising (optional à-trous)
 *   6. Fullscreen blit to canvas
 *
 * Usage:
 *   const pt = new PathTracerRenderer(device, canvas);
 *   await pt.initialize();
 *   pt.buildScene(scene, camera);
 *   // each frame:
 *   pt.render(camera);
 */
import { BVHBuilder } from './BVHBuilder.js';
import { SceneExport } from './SceneExport.js';

// Inline WGSL sources — loaded via fetch at init time
const SHADER_PATHS = {
  integrator: new URL('./integrator.wgsl', import.meta.url).href,
  denoise: new URL('./denoise.wgsl', import.meta.url).href,
  blit: new URL('./blit.wgsl', import.meta.url).href,
};

/**
 * @typedef {Object} PathTracerOptions
 * @property {number} [samplesPerFrame=1]
 * @property {number} [maxBounces=6]
 * @property {number} [russianRouletteDepth=3]
 * @property {number} [clampLuminance=10]
 * @property {boolean} [enableNEE=true]
 * @property {boolean} [enableMIS=true]
 * @property {boolean} [denoise=true]
 * @property {number} [denoiseStrength=0.5]
 * @property {number} [denoiseIterations=3]
 * @property {number} [envIntensity=1]
 * @property {number} [debugMode=0]        0=beauty, 1=albedo, 2=normals, 3=depth, 4=samples, 5=NaN heatmap
 * @property {number} [resolutionScale=1]  0.25..1
 * @property {boolean} [paused=false]
 * @property {number} [fixedSeed=0]        0=random, >0=deterministic
 */

export class PathTracerRenderer {
  /**
   * @param {GPUDevice} device
   * @param {HTMLCanvasElement} canvas
   */
  constructor(device, canvas) {
    this.device = device;
    this.canvas = canvas;

    /** @type {PathTracerOptions} */
    this.options = {
      samplesPerFrame: 1,
      maxBounces: 6,
      russianRouletteDepth: 3,
      clampLuminance: 10,
      enableNEE: true,
      enableMIS: true,
      denoise: true,
      denoiseStrength: 0.5,
      denoiseIterations: 3,
      envIntensity: 1.0,
      debugMode: 0,
      resolutionScale: 1.0,
      paused: false,
      fixedSeed: 0,
    };

    // State
    this._initialized = false;
    this._sceneBuilt = false;
    this._frameIndex = 0;
    this._sampleCount = 0;
    this._width = 0;
    this._height = 0;
    this._needsReset = true;

    // GPU resources
    this._uniformBuffer = null;
    this._accumBuffer = null;
    this._outputTexture = null;
    this._debugCounterBuffer = null;
    this._computePipeline = null;
    this._denoisePipeline = null;
    this._blitPipeline = null;
    this._bindGroups = [];

    // Scene buffers
    this._triPositionsBuffer = null;
    this._triNormalsBuffer = null;
    this._triMaterialIdsBuffer = null;
    this._bvhNodesBuffer = null;
    this._bvhTriIndicesBuffer = null;
    this._materialsBuffer = null;
    this._emissiveBuffer = null;

    // Scene data
    this._sceneData = null;
    this._bvhData = null;

    // Blit resources
    this._blitBindGroup = null;
    this._blitSampler = null;

    // Denoise resources
    this._denoiseUniformBuffer = null;
    this._denoiseTempTexture = null;
    this._denoiseBindGroups = [];

    // Camera tracking for accumulation reset
    this._lastCameraMatrix = null;

    // Device lost handler
    this._deviceLost = false;
    device.lost.then(info => {
      console.error('[PathTracer] Device lost:', info.message);
      this._deviceLost = true;
    });
  }

  async initialize() {
    if (this._initialized) return;

    console.log('[PathTracer] Initializing...');

    // Load shader sources
    const [integratorSrc, denoiseSrc, blitSrc] = await Promise.all([
      fetch(SHADER_PATHS.integrator).then(r => r.text()),
      fetch(SHADER_PATHS.denoise).then(r => r.text()),
      fetch(SHADER_PATHS.blit).then(r => r.text()),
    ]);

    // Create compute pipeline for path tracing
    const integratorModule = this.device.createShaderModule({
      label: 'PathTracer Integrator',
      code: integratorSrc
    });

    this._computePipeline = this.device.createComputePipeline({
      label: 'PathTracer Compute',
      layout: 'auto',
      compute: {
        module: integratorModule,
        entryPoint: 'main',
      }
    });

    // Create denoise compute pipeline
    const denoiseModule = this.device.createShaderModule({
      label: 'PathTracer Denoiser',
      code: denoiseSrc
    });

    this._denoisePipeline = this.device.createComputePipeline({
      label: 'PathTracer Denoise',
      layout: 'auto',
      compute: {
        module: denoiseModule,
        entryPoint: 'main',
      }
    });

    // Create blit render pipeline
    const blitModule = this.device.createShaderModule({
      label: 'PathTracer Blit',
      code: blitSrc
    });

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    this._blitPipeline = this.device.createRenderPipeline({
      label: 'PathTracer Blit',
      layout: 'auto',
      vertex: {
        module: blitModule,
        entryPoint: 'vs'
      },
      fragment: {
        module: blitModule,
        entryPoint: 'fs',
        targets: [{ format: canvasFormat }]
      },
      primitive: { topology: 'triangle-list' }
    });

    this._blitSampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear'
    });

    // Configure canvas context for WebGPU output
    const canvasCtx = this.canvas.getContext('webgpu');
    canvasCtx.configure({
      device: this.device,
      format: canvasFormat,
      alphaMode: 'premultiplied',
    });
    this._canvasFormat = canvasFormat;

    this._initialized = true;
    console.log('[PathTracer] Initialized successfully');
  }

  /**
   * Build/rebuild scene data for path tracing.
   * Call when scene meshes/materials change.
   * @param {import('../core/Scene.js').Scene} scene
   * @param {import('../core/Camera.js').Camera} camera
   */
  buildScene(scene, camera) {
    if (this._deviceLost) {
      console.warn('[PathTracer] Cannot build scene — device lost');
      return;
    }

    console.log('[PathTracer] Building scene...');
    const t0 = performance.now();

    // Export scene to flat arrays
    this._sceneData = SceneExport.export(scene, camera);
    const sd = this._sceneData;

    if (sd.triangleCount === 0) {
      console.warn('[PathTracer] Scene has no triangles');
      this._sceneBuilt = false;
      return;
    }

    // Build BVH
    const t1 = performance.now();
    this._bvhData = BVHBuilder.build(sd.positions, sd.triangleCount);
    const t2 = performance.now();

    console.log(`[PathTracer] Scene export: ${(t1 - t0).toFixed(1)}ms, BVH build: ${(t2 - t1).toFixed(1)}ms`);
    console.log(`[PathTracer] ${sd.triangleCount} triangles, ${this._bvhData.nodeCount} BVH nodes, ${sd.materialCount} materials, ${sd.emissiveCount} emissive tris`);

    // Upload to GPU
    this._uploadSceneBuffers();
    this._sceneBuilt = true;
    this.resetAccumulation();
  }

  /**
   * Set options. Resets accumulation if rendering-affecting options change.
   * @param {Partial<PathTracerOptions>} opts
   */
  setOptions(opts) {
    let needsReset = false;
    for (const key of ['maxBounces', 'russianRouletteDepth', 'clampLuminance', 'enableNEE', 'enableMIS', 'envIntensity', 'debugMode', 'samplesPerFrame', 'resolutionScale']) {
      if (key in opts && opts[key] !== this.options[key]) {
        needsReset = true;
        break;
      }
    }
    Object.assign(this.options, opts);
    if (needsReset) this.resetAccumulation();
  }

  /**
   * Reset progressive accumulation.
   */
  resetAccumulation() {
    this._frameIndex = 0;
    this._sampleCount = 0;
    this._needsReset = true;
  }

  /**
   * Get current sample count.
   */
  get sampleCount() {
    return this._sampleCount;
  }

  /**
   * Render one frame of path tracing.
   * @param {import('../core/Camera.js').Camera} camera
   */
  render(camera) {
    if (this._deviceLost || !this._initialized || !this._sceneBuilt) return;
    if (this.options.paused && !this._needsReset) return;

    // Check if canvas size changed
    const w = Math.max(1, Math.floor(this.canvas.width * this.options.resolutionScale));
    const h = Math.max(1, Math.floor(this.canvas.height * this.options.resolutionScale));
    if (w !== this._width || h !== this._height) {
      this._resizeBuffers(w, h);
      this.resetAccumulation();
    }

    // Check camera change
    if (this._hasCameraChanged(camera)) {
      this.resetAccumulation();
    }

    // Clear accumulation buffer on reset
    if (this._needsReset) {
      this._clearAccumBuffer();
      this._needsReset = false;
    }

    // Update uniforms
    this._updateUniforms(camera);
    this._frameIndex++;
    this._sampleCount += this.options.samplesPerFrame;

    const encoder = this.device.createCommandEncoder({ label: 'PathTracer Frame' });

    // === Path trace compute pass ===
    {
      const pass = encoder.beginComputePass({ label: 'PathTrace' });
      pass.setPipeline(this._computePipeline);
      for (let i = 0; i < this._bindGroups.length; i++) {
        pass.setBindGroup(i, this._bindGroups[i]);
      }
      const wgX = Math.ceil(this._width / 8);
      const wgY = Math.ceil(this._height / 8);
      pass.dispatchWorkgroups(wgX, wgY, 1);
      pass.end();
    }

    // === Denoise pass (optional) ===
    let blitSource = this._outputTexture;

    if (this.options.denoise && this._denoisePipeline && this._sampleCount >= 4) {
      blitSource = this._runDenoisePass(encoder);
    }

    // === Blit to canvas ===
    {
      const canvasTexture = this.canvas.getContext('webgpu').getCurrentTexture();
      const blitBindGroup = this.device.createBindGroup({
        layout: this._blitPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this._blitSampler },
          { binding: 1, resource: blitSource.createView() }
        ]
      });

      const pass = encoder.beginRenderPass({
        label: 'PathTracer Blit',
        colorAttachments: [{
          view: canvasTexture.createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        }]
      });
      pass.setPipeline(this._blitPipeline);
      pass.setBindGroup(0, blitBindGroup);
      pass.draw(3);
      pass.end();
    }

    this.device.queue.submit([encoder.finish()]);
  }

  /**
   * Get debug info.
   */
  getDebugInfo() {
    return {
      samples: this._sampleCount,
      frames: this._frameIndex,
      triangles: this._sceneData?.triangleCount || 0,
      bvhNodes: this._bvhData?.nodeCount || 0,
      materials: this._sceneData?.materialCount || 0,
      emissiveTris: this._sceneData?.emissiveCount || 0,
      resolution: `${this._width}×${this._height}`,
      deviceLost: this._deviceLost,
    };
  }

  /**
   * Dispose all GPU resources.
   */
  dispose() {
    const buffers = [
      this._uniformBuffer, this._accumBuffer, this._debugCounterBuffer,
      this._triPositionsBuffer, this._triNormalsBuffer, this._triMaterialIdsBuffer,
      this._bvhNodesBuffer, this._bvhTriIndicesBuffer,
      this._materialsBuffer, this._emissiveBuffer,
      this._denoiseUniformBuffer
    ];
    for (const buf of buffers) {
      if (buf) buf.destroy();
    }
    const textures = [this._outputTexture, this._denoiseTempTexture];
    for (const tex of textures) {
      if (tex) tex.destroy();
    }
    this._initialized = false;
    this._sceneBuilt = false;
    console.log('[PathTracer] Disposed');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Internal methods
  // ══════════════════════════════════════════════════════════════════════════

  _uploadSceneBuffers() {
    const sd = this._sceneData;
    const bvh = this._bvhData;

    // Destroy old buffers
    for (const buf of [this._triPositionsBuffer, this._triNormalsBuffer, this._triMaterialIdsBuffer,
                       this._bvhNodesBuffer, this._bvhTriIndicesBuffer,
                       this._materialsBuffer, this._emissiveBuffer]) {
      if (buf) buf.destroy();
    }

    const createBuf = (label, data, usage = GPUBufferUsage.STORAGE) => {
      const minSize = Math.max(data.byteLength, 16); // WebGPU requires min 16 bytes for storage
      const buf = this.device.createBuffer({
        label,
        size: minSize,
        usage: usage | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true
      });
      if (data instanceof Float32Array) {
        new Float32Array(buf.getMappedRange(0, minSize)).set(data);
      } else {
        new Uint32Array(buf.getMappedRange(0, minSize)).set(data);
      }
      buf.unmap();
      return buf;
    };

    this._triPositionsBuffer = createBuf('TriPositions', sd.positions);
    this._triNormalsBuffer = createBuf('TriNormals', sd.normals);
    this._triMaterialIdsBuffer = createBuf('TriMaterialIds', sd.materialIds);
    this._bvhNodesBuffer = createBuf('BVHNodes', bvh.nodes);
    this._bvhTriIndicesBuffer = createBuf('BVHTriIndices', bvh.triIndices);
    this._materialsBuffer = createBuf('Materials', sd.materialData);
    this._emissiveBuffer = createBuf('Emissives', sd.emissiveData);

    console.log(`[PathTracer] GPU buffers uploaded — ` +
      `positions: ${(sd.positions.byteLength / 1024).toFixed(0)}KB, ` +
      `BVH: ${(bvh.nodes.byteLength / 1024).toFixed(0)}KB`);

    // Rebuild bind groups to reference the new buffers
    if (this._outputTexture && this._uniformBuffer) {
      this._rebuildBindGroups();
    }
  }

  _resizeBuffers(w, h) {
    this._width = w;
    this._height = h;

    // Destroy old textures/buffers
    if (this._outputTexture) this._outputTexture.destroy();
    if (this._accumBuffer) this._accumBuffer.destroy();
    if (this._debugCounterBuffer) this._debugCounterBuffer.destroy();
    if (this._denoiseTempTexture) this._denoiseTempTexture.destroy();

    // Accumulation buffer (vec4 per pixel, xyz=color, w=count)
    const pixelCount = w * h;
    this._accumBuffer = this.device.createBuffer({
      label: 'AccumBuffer',
      size: pixelCount * 16,  // 4 floats × 4 bytes
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    // Output texture (written by compute, read by blit)
    this._outputTexture = this.device.createTexture({
      label: 'PathTracer Output',
      size: [w, h],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
    });

    // Debug counter buffer
    this._debugCounterBuffer = this.device.createBuffer({
      label: 'DebugCounters',
      size: 16, // 4 u32 counters
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    // Denoise temp texture
    this._denoiseTempTexture = this.device.createTexture({
      label: 'Denoise Temp',
      size: [w, h],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
    });

    // Denoise uniform buffer
    if (!this._denoiseUniformBuffer) {
      this._denoiseUniformBuffer = this.device.createBuffer({
        label: 'Denoise Uniforms',
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
    }

    // Uniform buffer
    if (!this._uniformBuffer) {
      this._uniformBuffer = this.device.createBuffer({
        label: 'PathTracer Uniforms',
        size: 256, // plenty for the struct
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
    }

    // Rebuild bind groups
    this._rebuildBindGroups();

    console.log(`[PathTracer] Resized to ${w}×${h}`);
  }

  _rebuildBindGroups() {
    if (!this._triPositionsBuffer) return;

    const pipelineLayout = this._computePipeline;

    // Group 0: uniforms + accumulation
    const bg0 = this.device.createBindGroup({
      label: 'PT Group 0',
      layout: pipelineLayout.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this._uniformBuffer } },
        { binding: 1, resource: { buffer: this._accumBuffer } },
        { binding: 2, resource: this._outputTexture.createView() },
        { binding: 3, resource: { buffer: this._debugCounterBuffer } },
      ]
    });

    // Group 1: geometry + BVH
    const bg1 = this.device.createBindGroup({
      label: 'PT Group 1',
      layout: pipelineLayout.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: this._triPositionsBuffer } },
        { binding: 1, resource: { buffer: this._triNormalsBuffer } },
        { binding: 2, resource: { buffer: this._triMaterialIdsBuffer } },
        { binding: 3, resource: { buffer: this._bvhNodesBuffer } },
        { binding: 4, resource: { buffer: this._bvhTriIndicesBuffer } },
      ]
    });

    // Group 2: materials + emissives
    const bg2 = this.device.createBindGroup({
      label: 'PT Group 2',
      layout: pipelineLayout.getBindGroupLayout(2),
      entries: [
        { binding: 0, resource: { buffer: this._materialsBuffer } },
        { binding: 1, resource: { buffer: this._emissiveBuffer } },
      ]
    });

    this._bindGroups = [bg0, bg1, bg2];

    // Denoise bind groups (ping-pong)
    this._denoiseBindGroups = [
      // Pass 1: outputTexture → denoiseTempTexture
      this.device.createBindGroup({
        label: 'Denoise Pass A',
        layout: this._denoisePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this._denoiseUniformBuffer } },
          { binding: 1, resource: this._outputTexture.createView() },
          { binding: 2, resource: this._denoiseTempTexture.createView() },
        ]
      }),
      // Pass 2: denoiseTempTexture → outputTexture
      this.device.createBindGroup({
        label: 'Denoise Pass B',
        layout: this._denoisePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this._denoiseUniformBuffer } },
          { binding: 1, resource: this._denoiseTempTexture.createView() },
          { binding: 2, resource: this._outputTexture.createView() },
        ]
      }),
    ];
  }

  _updateUniforms(camera) {
    const camData = SceneExport._packCamera(camera);
    const sd = this._sceneData;
    const opts = this.options;

    // Uniform struct layout (must match WGSL):
    // See integrator.wgsl Uniforms struct
    const data = new ArrayBuffer(256);
    const u32 = new Uint32Array(data);
    const f32 = new Float32Array(data);

    let o = 0;
    u32[o++] = this._width;
    u32[o++] = this._height;
    u32[o++] = opts.fixedSeed > 0 ? opts.fixedSeed : this._frameIndex;
    u32[o++] = this._sampleCount;

    // Camera (aligned to vec4 boundaries in WGSL struct)
    // camPos (vec3f) + camFov (f32)
    f32[o++] = camData[0]; f32[o++] = camData[1]; f32[o++] = camData[2]; f32[o++] = camData[3];
    // camRight (vec3f) + camAspect (f32)
    f32[o++] = camData[4]; f32[o++] = camData[5]; f32[o++] = camData[6]; f32[o++] = camData[7];
    // camUp (vec3f) + camNear (f32)
    f32[o++] = camData[8]; f32[o++] = camData[9]; f32[o++] = camData[10]; f32[o++] = camData[11];
    // camForward (vec3f) + camFar (f32)
    f32[o++] = camData[12]; f32[o++] = camData[13]; f32[o++] = camData[14]; f32[o++] = camData[15];

    // Options
    u32[o++] = opts.maxBounces;
    u32[o++] = opts.russianRouletteDepth;
    f32[o++] = opts.clampLuminance;
    u32[o++] = opts.enableNEE ? 1 : 0;
    u32[o++] = opts.enableMIS ? 1 : 0;
    f32[o++] = opts.envIntensity;
    u32[o++] = opts.debugMode;
    u32[o++] = opts.samplesPerFrame;

    // Scene info
    u32[o++] = sd.triangleCount;
    u32[o++] = sd.materialCount;
    u32[o++] = sd.emissiveCount;
    u32[o++] = this._bvhData?.nodeCount || 0;

    this.device.queue.writeBuffer(this._uniformBuffer, 0, data, 0, o * 4);
  }

  _clearAccumBuffer() {
    if (!this._accumBuffer) return;
    const zeros = new Float32Array(this._width * this._height * 4);
    this.device.queue.writeBuffer(this._accumBuffer, 0, zeros);

    // Clear debug counters
    if (this._debugCounterBuffer) {
      this.device.queue.writeBuffer(this._debugCounterBuffer, 0, new Uint32Array(4));
    }
  }

  _hasCameraChanged(camera) {
    const e = camera.matrixWorld.elements;
    const fov = camera.fov ?? 0;
    const aspect = camera.aspect ?? 0;
    const key = `${e[12].toFixed(4)},${e[13].toFixed(4)},${e[14].toFixed(4)},` +
                `${e[0].toFixed(4)},${e[5].toFixed(4)},${e[10].toFixed(4)},` +
                `${fov.toFixed(2)},${aspect.toFixed(4)}`;
    if (key !== this._lastCameraMatrix) {
      this._lastCameraMatrix = key;
      return true;
    }
    return false;
  }

  _runDenoisePass(encoder) {
    const iterations = this.options.denoiseIterations;
    const wgX = Math.ceil(this._width / 8);
    const wgY = Math.ceil(this._height / 8);

    // à-trous iterations with increasing step width
    for (let i = 0; i < iterations; i++) {
      const stepWidth = 1 << i; // 1, 2, 4, ...

      // Update denoise uniforms
      const buf = new ArrayBuffer(32);
      const u32 = new Uint32Array(buf);
      const f32 = new Float32Array(buf);
      u32[0] = this._width;
      u32[1] = this._height;
      u32[2] = stepWidth;
      f32[3] = this.options.denoiseStrength;
      f32[4] = 0.1; // normalPhi
      f32[5] = 0.1; // depthPhi
      this.device.queue.writeBuffer(this._denoiseUniformBuffer, 0, buf);

      const bindGroupIdx = i % 2;
      const pass = encoder.beginComputePass({ label: `Denoise ${i}` });
      pass.setPipeline(this._denoisePipeline);
      pass.setBindGroup(0, this._denoiseBindGroups[bindGroupIdx]);
      pass.dispatchWorkgroups(wgX, wgY, 1);
      pass.end();
    }

    // Return whichever texture has the final result
    return (iterations % 2 === 0) ? this._outputTexture : this._denoiseTempTexture;
  }
}
