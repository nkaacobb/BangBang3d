/**
 * GPUResourceManager - Manages GPU resources (buffers, textures)
 * 
 * Phase 2: Unified resource management for WebGPU and WebGL2
 * Handles buffer uploads, texture uploads, and resource lifecycle
 */
export class GPUResourceManager {
  constructor(api, context) {
    this.api = api; // 'webgpu' or 'webgl2'
    this.context = context; // device for WebGPU, gl for WebGL2
    
    // Resource caches
    this.buffers = new Map(); // key -> buffer object
    this.textures = new Map(); // key -> texture object
    this.samplers = new Map(); // key -> sampler object
    
    // Default resources
    this.defaultTexture = null;
    this.defaultSampler = null;
    
    this._createDefaultResources();
  }

  /**
   * Create default resources (white 1x1 texture, etc.)
   */
  _createDefaultResources() {
    // Create default white texture
    const whitePixel = new Uint8Array([255, 255, 255, 255]);
    this.defaultTexture = this.createTexture('__default_white', whitePixel, 1, 1);
    
    // Create default sampler
    this.defaultSampler = this.createSampler('__default_sampler', {
      minFilter: 'linear',
      magFilter: 'linear',
      wrapS: 'repeat',
      wrapT: 'repeat'
    });
  }

  /**
   * Create a GPU buffer
   * @param {string} key - Unique identifier
   * @param {ArrayBuffer|TypedArray} data - Buffer data
   * @param {string} usage - 'vertex', 'index', 'uniform'
   * @returns {Object} Buffer object (API-specific)
   */
  createBuffer(key, data, usage) {
    if (this.buffers.has(key)) {
      return this.buffers.get(key);
    }

    let buffer;
    if (this.api === 'webgpu') {
      buffer = this._createBufferWebGPU(data, usage);
    } else if (this.api === 'webgl2') {
      buffer = this._createBufferWebGL2(data, usage);
    }

    this.buffers.set(key, buffer);
    return buffer;
  }

  /**
   * Create WebGPU buffer
   */
  _createBufferWebGPU(data, usage) {
    const device = this.context;
    
    // Determine usage flags
    let usageFlags = GPUBufferUsage.COPY_DST;
    if (usage === 'vertex') {
      usageFlags |= GPUBufferUsage.VERTEX;
    } else if (usage === 'index') {
      usageFlags |= GPUBufferUsage.INDEX;
    } else if (usage === 'uniform') {
      usageFlags |= GPUBufferUsage.UNIFORM;
    }

    // Ensure data is a typed array
    const typedData = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

    // WebGPU requires buffer sizes to be aligned to 4 bytes when mappedAtCreation is true
    // Round up to nearest multiple of 4
    const alignedSize = Math.ceil(typedData.byteLength / 4) * 4;

    // Create buffer
    const buffer = device.createBuffer({
      size: alignedSize,
      usage: usageFlags,
      mappedAtCreation: true
    });

    // Write data - preserve the typed array type for correct copying
    const mappedRange = buffer.getMappedRange();
    if (typedData instanceof Float32Array) {
      new Float32Array(mappedRange).set(typedData);
    } else if (typedData instanceof Uint16Array) {
      new Uint16Array(mappedRange).set(typedData);
    } else if (typedData instanceof Uint32Array) {
      new Uint32Array(mappedRange).set(typedData);
    } else {
      new Uint8Array(mappedRange).set(typedData);
    }
    buffer.unmap();

    return {
      api: 'webgpu',
      buffer,
      size: typedData.byteLength,
      usage
    };
  }

  /**
   * Create WebGL2 buffer
   */
  _createBufferWebGL2(data, usage) {
    const gl = this.context;
    
    // Determine target
    let target;
    if (usage === 'vertex') {
      target = gl.ARRAY_BUFFER;
    } else if (usage === 'index') {
      target = gl.ELEMENT_ARRAY_BUFFER;
    } else if (usage === 'uniform') {
      target = gl.UNIFORM_BUFFER;
    }

    // Ensure data is a typed array
    const typedData = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

    // Create and populate buffer
    const buffer = gl.createBuffer();
    gl.bindBuffer(target, buffer);
    gl.bufferData(target, typedData, gl.STATIC_DRAW);
    gl.bindBuffer(target, null);

    return {
      api: 'webgl2',
      buffer,
      target,
      size: typedData.byteLength,
      usage
    };
  }

  /**
   * Update buffer data
   */
  updateBuffer(key, data, offset = 0) {
    const bufferObj = this.buffers.get(key);
    if (!bufferObj) {
      console.error(`[GPUResourceManager] Buffer not found: ${key}`);
      return;
    }

    const typedData = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

    if (bufferObj.api === 'webgpu') {
      this.context.queue.writeBuffer(bufferObj.buffer, offset, typedData);
    } else if (bufferObj.api === 'webgl2') {
      const gl = this.context;
      gl.bindBuffer(bufferObj.target, bufferObj.buffer);
      gl.bufferSubData(bufferObj.target, offset, typedData);
      gl.bindBuffer(bufferObj.target, null);
    }
  }

  /**
   * Create a GPU texture
   * @param {string} key - Unique identifier
   * @param {Uint8Array|ImageData|HTMLImageElement} data - Texture data
   * @param {number} width - Texture width
   * @param {number} height - Texture height
   * @returns {Object} Texture object (API-specific)
   */
  createTexture(key, data, width, height) {
    if (this.textures.has(key)) {
      return this.textures.get(key);
    }

    let texture;
    if (this.api === 'webgpu') {
      texture = this._createTextureWebGPU(data, width, height);
    } else if (this.api === 'webgl2') {
      texture = this._createTextureWebGL2(data, width, height);
    }

    this.textures.set(key, texture);
    return texture;
  }

  /**
   * Create WebGPU texture
   */
  _createTextureWebGPU(data, width, height) {
    const device = this.context;

    // Create texture
    const texture = device.createTexture({
      size: { width, height, depthOrArrayLayers: 1 },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });

    // Upload data if provided
    if (data) {
      let imageData;
      if (data instanceof Uint8Array) {
        imageData = data;
      } else if (data instanceof ImageData) {
        imageData = data.data;
      } else if (data instanceof HTMLImageElement || data instanceof HTMLCanvasElement) {
        // For images, we'll need to use copyExternalImageToTexture
        device.queue.copyExternalImageToTexture(
          { source: data },
          { texture },
          { width, height }
        );
        return {
          api: 'webgpu',
          texture,
          width,
          height
        };
      }

      // Write buffer data
      device.queue.writeTexture(
        { texture },
        imageData,
        { bytesPerRow: width * 4 },
        { width, height }
      );
    }

    return {
      api: 'webgpu',
      texture,
      width,
      height
    };
  }

  /**
   * Create WebGL2 texture
   */
  _createTextureWebGL2(data, width, height) {
    const gl = this.context;

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Upload data
    if (data instanceof Uint8Array) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    } else if (data instanceof ImageData) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data.data);
    } else if (data instanceof HTMLImageElement || data instanceof HTMLCanvasElement) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }

    // Set default parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    gl.bindTexture(gl.TEXTURE_2D, null);

    return {
      api: 'webgl2',
      texture,
      width,
      height
    };
  }

  /**
   * Create a sampler
   */
  createSampler(key, params = {}) {
    if (this.samplers.has(key)) {
      return this.samplers.get(key);
    }

    let sampler;
    if (this.api === 'webgpu') {
      sampler = this._createSamplerWebGPU(params);
    } else if (this.api === 'webgl2') {
      sampler = this._createSamplerWebGL2(params);
    }

    this.samplers.set(key, sampler);
    return sampler;
  }

  /**
   * Create WebGPU sampler
   */
  _createSamplerWebGPU(params) {
    const device = this.context;

    const descriptor = {
      magFilter: params.magFilter === 'nearest' ? 'nearest' : 'linear',
      minFilter: params.minFilter === 'nearest' ? 'nearest' : 'linear',
      addressModeU: params.wrapS === 'clamp' ? 'clamp-to-edge' : 'repeat',
      addressModeV: params.wrapT === 'clamp' ? 'clamp-to-edge' : 'repeat'
    };

    const sampler = device.createSampler(descriptor);

    return {
      api: 'webgpu',
      sampler
    };
  }

  /**
   * Create WebGL2 sampler
   */
  _createSamplerWebGL2(params) {
    // WebGL2 samplers are configured per-texture
    // Return params object that will be applied when binding texture
    return {
      api: 'webgl2',
      params
    };
  }

  /**
   * Get buffer by key
   */
  getBuffer(key) {
    return this.buffers.get(key);
  }

  /**
   * Get texture by key
   */
  getTexture(key) {
    return this.textures.get(key) || this.defaultTexture;
  }

  /**
   * Check if a texture exists by key
   */
  hasTexture(key) {
    return this.textures.has(key);
  }

  /**
   * Delete a texture by key, releasing GPU resources.
   * @param {string} key
   */
  deleteTexture(key) {
    const entry = this.textures.get(key);
    if (!entry) return;

    if (this.api === 'webgpu') {
      if (entry.texture && entry.texture.destroy) {
        entry.texture.destroy();
      }
    } else if (this.api === 'webgl2') {
      if (entry.texture) {
        this.context.deleteTexture(entry.texture);
      }
    }

    this.textures.delete(key);
  }

  /**
   * Create a cubemap texture (6 faces).
   * @param {string} key - Unique identifier
   * @param {Array<HTMLCanvasElement|HTMLImageElement>} faces - [+X, -X, +Y, -Y, +Z, -Z]
   * @param {number} size - Face resolution (width=height)
   * @param {Object} [options]
   * @param {boolean} [options.generateMipmaps=false]
   * @param {Array<Array<HTMLCanvasElement>>} [options.mips] - Precomputed mip levels, each an array of 6 face canvases
   * @returns {Object} Cubemap texture object
   */
  createCubeTexture(key, faces, size, options = {}) {
    if (this.textures.has(key)) {
      return this.textures.get(key);
    }

    let texture;
    if (this.api === 'webgpu') {
      texture = this._createCubeTextureWebGPU(faces, size, options);
    } else if (this.api === 'webgl2') {
      texture = this._createCubeTextureWebGL2(faces, size, options);
    }

    this.textures.set(key, texture);
    return texture;
  }

  /**
   * Create WebGPU cubemap texture
   * @private
   */
  _createCubeTextureWebGPU(faces, size, options) {
    const device = this.context;
    const mips = options.mips;
    const mipLevelCount = mips ? mips.length : 1;

    const texture = device.createTexture({
      size: { width: size, height: size, depthOrArrayLayers: 6 },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      mipLevelCount: mipLevelCount,
      dimension: '2d'
    });

    // Upload each face (and mip level)
    for (let level = 0; level < mipLevelCount; level++) {
      const levelFaces = mips ? mips[level] : faces;
      const mipSize = Math.max(1, Math.floor(size / Math.pow(2, level)));

      for (let face = 0; face < 6; face++) {
        const source = levelFaces[face];
        if (!source) continue;

        device.queue.copyExternalImageToTexture(
          { source },
          { texture, origin: { x: 0, y: 0, z: face }, mipLevel: level },
          { width: mipSize, height: mipSize }
        );
      }
    }

    return {
      api: 'webgpu',
      texture,
      isCubemap: true,
      width: size,
      height: size,
      mipLevels: mipLevelCount
    };
  }

  /**
   * Create WebGL2 cubemap texture
   * @private
   */
  _createCubeTextureWebGL2(faces, size, options) {
    const gl = this.context;
    const mips = options.mips;

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);

    const faceTargets = [
      gl.TEXTURE_CUBE_MAP_POSITIVE_X,
      gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
      gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
      gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
      gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
      gl.TEXTURE_CUBE_MAP_NEGATIVE_Z
    ];

    if (mips) {
      for (let level = 0; level < mips.length; level++) {
        const levelFaces = mips[level];
        const mipSize = Math.max(1, Math.floor(size / Math.pow(2, level)));

        for (let face = 0; face < 6; face++) {
          const source = levelFaces[face];
          if (source) {
            gl.texImage2D(faceTargets[face], level, gl.RGBA, mipSize, mipSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texImage2D(faceTargets[face], level, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
          }
        }
      }
    } else {
      for (let face = 0; face < 6; face++) {
        const source = faces[face];
        if (source) {
          gl.texImage2D(faceTargets[face], 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        } else {
          gl.texImage2D(faceTargets[face], 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        }
      }
    }

    // Filtering
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Set max mip level if mips were provided
    if (mips && mips.length > 1) {
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAX_LEVEL, mips.length - 1);
    }

    gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);

    return {
      api: 'webgl2',
      texture,
      isCubemap: true,
      width: size,
      height: size,
      mipLevels: mips ? mips.length : 1
    };
  }

  /**
   * Get sampler by key
   */
  getSampler(key) {
    return this.samplers.get(key) || this.defaultSampler;
  }

  /**
   * Dispose of all resources
   */
  dispose() {
    // Dispose buffers
    for (const [key, bufferObj] of this.buffers) {
      if (bufferObj.api === 'webgpu') {
        bufferObj.buffer.destroy();
      } else if (bufferObj.api === 'webgl2') {
        this.context.deleteBuffer(bufferObj.buffer);
      }
    }
    this.buffers.clear();

    // Dispose textures
    for (const [key, textureObj] of this.textures) {
      if (textureObj.api === 'webgpu') {
        textureObj.texture.destroy();
      } else if (textureObj.api === 'webgl2') {
        this.context.deleteTexture(textureObj.texture);
      }
    }
    this.textures.clear();

    // Samplers are garbage collected
    this.samplers.clear();
  }
}
