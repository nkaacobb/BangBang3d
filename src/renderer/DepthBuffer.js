/**
 * DepthBuffer - Z-buffer for depth testing using Float32Array
 */
export class DepthBuffer {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Float32Array(width * height);
  }

  /**
   * Clear the depth buffer to maximum depth
   */
  clear() {
    this.data.fill(Infinity);
  }

  /**
   * Test and update depth at (x, y)
   * Returns true if depth test passes
   */
  test(x, y, depth) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return false;
    }

    const index = y * this.width + x;
    
    if (depth < this.data[index]) {
      this.data[index] = depth;
      return true;
    }
    
    return false;
  }

  /**
   * Test depth at (x, y) without writing
   * Returns true if depth test would pass
   */
  testOnly(x, y, depth) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return false;
    }

    const index = y * this.width + x;
    return depth < this.data[index];
  }

  /**
   * Get depth value at (x, y)
   */
  get(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return Infinity;
    }

    return this.data[y * this.width + x];
  }

  /**
   * Set depth value at (x, y)
   */
  set(x, y, depth) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return;
    }

    this.data[y * this.width + x] = depth;
  }

  /**
   * Resize the depth buffer
   */
  resize(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Float32Array(width * height);
  }
}
