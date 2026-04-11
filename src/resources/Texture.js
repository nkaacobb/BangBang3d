import { MathUtils } from '../math/MathUtils.js';

/**
 * Texture - Represents a texture/image for mapping onto geometry
 */
export class Texture {
  constructor(image = null) {
    this.uuid = MathUtils.generateUUID();
    this.name = '';
    this.isTexture = true;

    // Source image or canvas
    this.image = image;

    // Texture data extracted from image (RGBA)
    this.data = null;
    this.width = 0;
    this.height = 0;

    // Wrapping modes
    this.wrapS = 'repeat'; // repeat, clampToEdge, mirroredRepeat
    this.wrapT = 'repeat';

    // Transform properties
    this.repeat = { x: 1, y: 1 };
    this.offset = { x: 0, y: 0 };
    this.rotation = 0; // radians

    // Filtering (for now, just nearest neighbor)
    this.magFilter = 'nearest'; // nearest, linear
    this.minFilter = 'nearest';

    // Flip Y (match WebGL convention)
    this.flipY = true;

    // Needs update flag
    this.needsUpdate = true;
    this.version = 0;
    
    // Metadata for procedural textures (used in serialization)
    this.procedural = null; // { generator: 'checker', options: {...}, seed: N }
  }

  /**
   * Extract pixel data from image
   */
  updateFromImage() {
    if (!this.image) {
      console.warn('Texture: No image to update from');
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = this.image.width;
    canvas.height = this.image.height;

    // Draw image to canvas
    ctx.drawImage(this.image, 0, 0);

    // Extract pixel data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    this.data = imageData.data; // Uint8ClampedArray
    this.width = canvas.width;
    this.height = canvas.height;

    this.needsUpdate = false;
    this.version++;
  }

  /**
   * Create texture from canvas ImageData
   */
  setFromImageData(imageData) {
    this.data = imageData.data;
    this.width = imageData.width;
    this.height = imageData.height;
    this.needsUpdate = false;
    this.version++;
  }

  /**
   * Sample texture at UV coordinates (u, v in [0, 1])
   * Returns { r, g, b, a } in [0, 1] range
   */
  sample(u, v) {
    if (!this.data) {
      return { r: 1, g: 0, b: 1, a: 1 }; // Magenta for missing texture
    }

    // Apply UV transforms (repeat, offset, rotation)
    u = u * this.repeat.x + this.offset.x;
    v = v * this.repeat.y + this.offset.y;
    
    // Apply rotation if needed
    if (this.rotation !== 0) {
      const centerU = 0.5;
      const centerV = 0.5;
      const cosR = Math.cos(this.rotation);
      const sinR = Math.sin(this.rotation);
      const du = u - centerU;
      const dv = v - centerV;
      u = du * cosR - dv * sinR + centerU;
      v = du * sinR + dv * cosR + centerV;
    }

    // Apply wrapping
    u = this.applyWrapping(u, this.wrapS);
    v = this.applyWrapping(v, this.wrapT);

    // Flip V if needed (match WebGL convention where 0 is bottom)
    if (this.flipY) {
      v = 1.0 - v;
    }

    // Convert to pixel coordinates
    let x = u * this.width;
    let y = v * this.height;

    // Apply filtering
    if (this.magFilter === 'nearest') {
      return this.sampleNearest(x, y);
    } else {
      return this.sampleLinear(x, y);
    }
  }

  /**
   * Nearest neighbor sampling
   */
  sampleNearest(x, y) {
    const px = Math.floor(x) % this.width;
    const py = Math.floor(y) % this.height;

    // Handle negative modulo
    const fx = px < 0 ? px + this.width : px;
    const fy = py < 0 ? py + this.height : py;

    const index = (fy * this.width + fx) * 4;

    return {
      r: this.data[index] / 255,
      g: this.data[index + 1] / 255,
      b: this.data[index + 2] / 255,
      a: this.data[index + 3] / 255
    };
  }

  /**
   * Bilinear sampling
   */
  sampleLinear(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1;
    const y1 = y0 + 1;

    const fx = x - x0;
    const fy = y - y0;

    // Sample 4 neighbors
    const c00 = this.sampleNearest(x0, y0);
    const c10 = this.sampleNearest(x1, y0);
    const c01 = this.sampleNearest(x0, y1);
    const c11 = this.sampleNearest(x1, y1);

    // Bilinear interpolation
    const r = (1 - fx) * (1 - fy) * c00.r + fx * (1 - fy) * c10.r + (1 - fx) * fy * c01.r + fx * fy * c11.r;
    const g = (1 - fx) * (1 - fy) * c00.g + fx * (1 - fy) * c10.g + (1 - fx) * fy * c01.g + fx * fy * c11.g;
    const b = (1 - fx) * (1 - fy) * c00.b + fx * (1 - fy) * c10.b + (1 - fx) * fy * c01.b + fx * fy * c11.b;
    const a = (1 - fx) * (1 - fy) * c00.a + fx * (1 - fy) * c10.a + (1 - fx) * fy * c01.a + fx * fy * c11.a;

    return { r, g, b, a };
  }

  /**
   * Apply texture wrapping mode
   */
  applyWrapping(coord, mode) {
    switch (mode) {
      case 'repeat':
        return coord - Math.floor(coord);
      
      case 'clampToEdge':
        return Math.max(0, Math.min(1, coord));
      
      case 'mirroredRepeat':
        const mirrored = coord - Math.floor(coord);
        const flip = Math.floor(coord) % 2;
        return flip === 0 ? mirrored : 1 - mirrored;
      
      default:
        return coord - Math.floor(coord);
    }
  }

  /**
   * Clone texture
   */
  clone() {
    const texture = new Texture(this.image);
    texture.name = this.name;
    texture.data = this.data;
    texture.width = this.width;
    texture.height = this.height;
    texture.wrapS = this.wrapS;
    texture.wrapT = this.wrapT;
    texture.repeat = { ...this.repeat };
    texture.offset = { ...this.offset };
    texture.rotation = this.rotation;
    texture.magFilter = this.magFilter;
    texture.minFilter = this.minFilter;
    texture.flipY = this.flipY;
    texture.procedural = this.procedural ? { ...this.procedural } : null;
    return texture;
  }

  /**
   * Export texture to JSON
   */
  toJSON() {
    const json = {
      uuid: this.uuid,
      name: this.name,
      wrapS: this.wrapS,
      wrapT: this.wrapT,
      repeat: this.repeat,
      offset: this.offset,
      rotation: this.rotation,
      magFilter: this.magFilter,
      minFilter: this.minFilter,
      flipY: this.flipY
    };
    
    // Include procedural descriptor if this is a procedural texture
    if (this.procedural) {
      json.procedural = this.procedural;
    }
    
    // Note: We don't serialize image data by default (too large)
    // For image textures, store a reference path instead
    // This will be handled by the material serialization system
    
    return json;
  }

  /**
   * Create texture from JSON descriptor
   * @param {Object} json - JSON descriptor
   * @param {TextureLoader} loader - Optional texture loader for recreating procedural textures
   */
  static fromJSON(json, loader = null) {
    const texture = new Texture();
    
    texture.uuid = json.uuid || texture.uuid;
    texture.name = json.name || '';
    texture.wrapS = json.wrapS || 'repeat';
    texture.wrapT = json.wrapT || 'repeat';
    texture.repeat = json.repeat || { x: 1, y: 1 };
    texture.offset = json.offset || { x: 0, y: 0 };
    texture.rotation = json.rotation || 0;
    texture.magFilter = json.magFilter || 'nearest';
    texture.minFilter = json.minFilter || 'nearest';
    texture.flipY = json.flipY !== undefined ? json.flipY : true;
    
    // Recreate procedural texture if descriptor exists
    if (json.procedural && loader) {
      texture.procedural = json.procedural;
      const proc = json.procedural;
      
      // Recreate based on generator type
      switch(proc.generator) {
        case 'checker':
          return loader.createCheckerTexture(proc.options.size, proc.options.checkerCount);
        case 'uvtest':
          return loader.createUVTestTexture(proc.options.size);
        case 'grid':
          return loader.createGridTexture(proc.options.size, proc.options.gridSize, proc.options.lineWidth);
        case 'wood':
          return loader.createWoodTexture(proc.options.size);
        case 'brick':
          return loader.createBrickTexture(proc.options.size);
        case 'noise':
          return loader.createNoiseTexture(proc.options.size, proc.options.scale, proc.options.seed);
        case 'gradient':
          return loader.createGradientTexture(proc.options.size, proc.options.type, proc.options.colorStart, proc.options.colorEnd);
        default:
          console.warn(`Unknown procedural generator: ${proc.generator}`);
      }
    }
    
    return texture;
  }

  /**
   * Dispose of texture resources
   */
  dispose() {
    this.data = null;
    this.image = null;
  }
}
