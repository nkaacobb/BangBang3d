import { Texture } from './Texture.js';

/**
 * TextureLoader - Loads images and creates textures
 */
export class TextureLoader {
  constructor() {
    this.crossOrigin = 'anonymous';
  }

  /**
   * Load texture from URL
   * @param {string} url - Image URL
   * @param {Function} onLoad - Success callback
   * @param {Function} onProgress - Progress callback
   * @param {Function} onError - Error callback
   * @returns {Texture}
   */
  load(url, onLoad, onProgress, onError) {
    const texture = new Texture();

    const image = new Image();
    
    image.crossOrigin = this.crossOrigin;

    image.onload = () => {
      texture.image = image;
      texture.updateFromImage();
      
      if (onLoad) {
        onLoad(texture);
      }
    };

    image.onerror = (error) => {
      console.error('TextureLoader: Error loading image', url, error);
      if (onError) {
        onError(error);
      }
    };

    if (onProgress) {
      image.onprogress = onProgress;
    }

    image.src = url;

    return texture;
  }

  /**
   * Load texture from data URL
   */
  loadDataURL(dataURL, onLoad, onError) {
    return this.load(dataURL, onLoad, null, onError);
  }

  /**
   * Create texture from canvas
   */
  fromCanvas(canvas) {
    const texture = new Texture(canvas);
    
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    texture.setFromImageData(imageData);
    
    return texture;
  }

  /**
   * Create procedural texture from generator function
   * @param {number} width - Texture width
   * @param {number} height - Texture height
   * @param {Function} generator - Function(x, y, width, height) => { r, g, b, a }
   */
  createProcedural(width, height, generator) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    // Generate pixels
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const color = generator(x, y, width, height);
        const index = (y * width + x) * 4;

        data[index] = Math.floor(color.r * 255);
        data[index + 1] = Math.floor(color.g * 255);
        data[index + 2] = Math.floor(color.b * 255);
        data[index + 3] = Math.floor((color.a !== undefined ? color.a : 1) * 255);
      }
    }

    ctx.putImageData(imageData, 0, 0);

    const texture = new Texture(canvas);
    texture.setFromImageData(imageData);
    
    return texture;
  }

  /**
   * Create a UV test texture (checker pattern with UV gradient)
   */
  createUVTestTexture(size = 512) {
    const texture = this.createProcedural(size, size, (x, y, width, height) => {
      const u = x / width;
      const v = y / height;

      // Checker pattern (8x8)
      const checkerSize = size / 8;
      const cx = Math.floor(x / checkerSize);
      const cy = Math.floor(y / checkerSize);
      const checker = (cx + cy) % 2;

      if (checker === 0) {
        // UV gradient
        return { r: u, g: v, b: 0, a: 1 };
      } else {
        // White
        return { r: 1, g: 1, b: 1, a: 1 };
      }
    });
    
    // Store procedural metadata
    texture.procedural = {
      generator: 'uvtest',
      options: { size }
    };
    
    return texture;
  }

  /**
   * Create a simple checker texture
   */
  createCheckerTexture(size = 256, checkerCount = 8) {
    const texture = this.createProcedural(size, size, (x, y, width, height) => {
      const checkerSize = size / checkerCount;
      const cx = Math.floor(x / checkerSize);
      const cy = Math.floor(y / checkerSize);
      const checker = (cx + cy) % 2;

      if (checker === 0) {
        return { r: 0.9, g: 0.9, b: 0.9, a: 1 };
      } else {
        return { r: 0.2, g: 0.2, b: 0.2, a: 1 };
      }
    });
    
    // Store procedural metadata
    texture.procedural = {
      generator: 'checker',
      options: { size, checkerCount }
    };
    
    return texture;
  }

  /**
   * Create a grid texture
   */
  createGridTexture(size = 256, gridSize = 32, lineWidth = 2) {
    const texture = this.createProcedural(size, size, (x, y, width, height) => {
      const onLineX = (x % gridSize) < lineWidth;
      const onLineY = (y % gridSize) < lineWidth;

      if (onLineX || onLineY) {
        return { r: 0.3, g: 0.3, b: 0.3, a: 1 };
      } else {
        return { r: 0.95, g: 0.95, b: 0.95, a: 1 };
      }
    });
    
    // Store procedural metadata
    texture.procedural = {
      generator: 'grid',
      options: { size, gridSize, lineWidth }
    };
    
    return texture;
  }

  /**
   * Create a wood grain texture
   */
  createWoodTexture(size = 512) {
    const texture = this.createProcedural(size, size, (x, y, width, height) => {
      const u = x / width;
      const v = y / height;

      // Simple wood grain using sine waves
      const grain = Math.sin(u * Math.PI * 20 + Math.sin(v * Math.PI * 3) * 2) * 0.5 + 0.5;
      const color = 0.4 + grain * 0.3;

      return { r: color * 0.6, g: color * 0.4, b: color * 0.2, a: 1 };
    });
    
    // Store procedural metadata
    texture.procedural = {
      generator: 'wood',
      options: { size }
    };
    
    return texture;
  }

  /**
   * Create a brick texture
   */
  createBrickTexture(size = 512) {
    const texture = this.createProcedural(size, size, (x, y, width, height) => {
      const brickWidth = size / 4;
      const brickHeight = size / 8;
      const mortarSize = 4;

      const row = Math.floor(y / brickHeight);
      const col = Math.floor((x + (row % 2) * brickWidth / 2) / brickWidth);

      const brickX = (x + (row % 2) * brickWidth / 2) % brickWidth;
      const brickY = y % brickHeight;

      const onMortar = brickX < mortarSize || brickY < mortarSize;

      if (onMortar) {
        // Mortar (light gray)
        return { r: 0.7, g: 0.7, b: 0.7, a: 1 };
      } else {
        // Brick (reddish brown with variation)
        const variation = (Math.sin(col * 12.34) * 0.5 + 0.5) * 0.2;
        return { r: 0.6 + variation, g: 0.3 + variation * 0.5, b: 0.2, a: 1 };
      }
    });
    
    // Store procedural metadata
    texture.procedural = {
      generator: 'brick',
      options: { size }
    };
    
    return texture;
  }

  /**
   * Create a noise texture using simple pseudo-random noise
   * @param {number} size - Texture size
   * @param {number} scale - Noise scale (higher = more detail)
   * @param {number} seed - Random seed for deterministic output
   */
  createNoiseTexture(size = 512, scale = 10, seed = 12345) {
    // Simple seeded random function
    const seededRandom = (x, y, s) => {
      const n = Math.sin(x * 12.9898 + y * 78.233 + s * 43758.5453) * 43758.5453;
      return n - Math.floor(n);
    };
    
    const texture = this.createProcedural(size, size, (x, y, width, height) => {
      const nx = x / width * scale;
      const ny = y / height * scale;
      
      // Simple value noise
      const x0 = Math.floor(nx);
      const y0 = Math.floor(ny);
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      
      const fx = nx - x0;
      const fy = ny - y0;
      
      // Smooth interpolation
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      
      // Sample corners
      const v00 = seededRandom(x0, y0, seed);
      const v10 = seededRandom(x1, y0, seed);
      const v01 = seededRandom(x0, y1, seed);
      const v11 = seededRandom(x1, y1, seed);
      
      // Bilinear interpolation
      const v0 = v00 * (1 - sx) + v10 * sx;
      const v1 = v01 * (1 - sx) + v11 * sx;
      const value = v0 * (1 - sy) + v1 * sy;
      
      return { r: value, g: value, b: value, a: 1 };
    });
    
    // Store procedural metadata
    texture.procedural = {
      generator: 'noise',
      options: { size, scale, seed }
    };
    
    return texture;
  }

  /**
   * Create a gradient texture
   * @param {number} size - Texture size
   * @param {string} type - Gradient type ('linear', 'radial')
   * @param {Object} colorStart - Start color {r, g, b} in [0,1]
   * @param {Object} colorEnd - End color {r, g, b} in [0,1]
   */
  createGradientTexture(size = 512, type = 'linear', colorStart = {r: 0, g: 0, b: 0}, colorEnd = {r: 1, g: 1, b: 1}) {
    const texture = this.createProcedural(size, size, (x, y, width, height) => {
      const u = x / width;
      const v = y / height;
      
      let t;
      if (type === 'radial') {
        // Radial gradient from center
        const dx = u - 0.5;
        const dy = v - 0.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        t = Math.min(1, dist * 2); // Normalize to [0, 1]
      } else {
        // Linear gradient (left to right)
        t = u;
      }
      
      // Interpolate colors
      const r = colorStart.r * (1 - t) + colorEnd.r * t;
      const g = colorStart.g * (1 - t) + colorEnd.g * t;
      const b = colorStart.b * (1 - t) + colorEnd.b * t;
      
      return { r, g, b, a: 1 };
    });
    
    // Store procedural metadata
    texture.procedural = {
      generator: 'gradient',
      options: { size, type, colorStart, colorEnd }
    };
    
    return texture;
  }
}
