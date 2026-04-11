/**
 * FrameBuffer - RGBA color buffer using Uint8ClampedArray
 */
export class FrameBuffer {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  /**
   * Clear the framebuffer to a specific color
   */
  clear(r = 0, g = 0, b = 0, a = 255) {
    const len = this.data.length;
    for (let i = 0; i < len; i += 4) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = a;
    }
  }

  /**
   * Set pixel color at (x, y) with optional alpha blending
   */
  setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return;
    }

    const index = (y * this.width + x) * 4;
    
    // If fully opaque, just overwrite
    if (a >= 255) {
      this.data[index] = r;
      this.data[index + 1] = g;
      this.data[index + 2] = b;
      this.data[index + 3] = a;
    } else {
      // Alpha blending: finalColor = srcColor * srcAlpha + dstColor * (1 - srcAlpha)
      const srcAlpha = a / 255;
      const dstAlpha = 1 - srcAlpha;
      
      const dstR = this.data[index];
      const dstG = this.data[index + 1];
      const dstB = this.data[index + 2];
      
      this.data[index] = Math.floor(r * srcAlpha + dstR * dstAlpha);
      this.data[index + 1] = Math.floor(g * srcAlpha + dstG * dstAlpha);
      this.data[index + 2] = Math.floor(b * srcAlpha + dstB * dstAlpha);
      // Keep destination alpha (or could blend alphas too)
      this.data[index + 3] = 255;
    }
  }

  /**
   * Get pixel color at (x, y)
   */
  getPixel(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }

    const index = (y * this.width + x) * 4;
    return {
      r: this.data[index],
      g: this.data[index + 1],
      b: this.data[index + 2],
      a: this.data[index + 3]
    };
  }

  /**
   * Resize the framebuffer
   */
  resize(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}
