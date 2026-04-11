import { Object3D } from './Object3D.js';
import { Vector3 } from '../math/Vector3.js';

/**
 * PointCloud - Renders an array of coloured points.
 *
 * Each point has a position (xyz), an RGB colour, and an optional per-point
 * size.  The GPU backend draws them with gl.POINTS using a dedicated shader
 * that supports fixed-size or distance-attenuated point sprites.
 *
 * Usage:
 *   const pc = new PointCloud();
 *   pc.setData(positions, colors);          // Float32Arrays
 *   scene.add(pc);
 */
export class PointCloud extends Object3D {
  constructor(options = {}) {
    super();

    this.type = 'PointCloud';
    this.isPointCloud = true;

    /** @type {Float32Array|null} xyz interleaved (length = count * 3) */
    this.positions = null;
    /** @type {Uint8Array|null} rgb interleaved 0-255 (length = count * 3) */
    this.colors = null;
    /** @type {Float32Array|null} optional per-point size (length = count) */
    this.sizes = null;
    /** Number of points */
    this.count = 0;

    // Rendering options
    /** Base point size in pixels (before attenuation) */
    this.pointSize = options.pointSize ?? 3.0;
    /** 'fixed' | 'attenuated' */
    this.sizeMode = options.sizeMode ?? 'attenuated';
    /** 'none' | 'alpha' | 'additive' */
    this.blendMode = options.blendMode ?? 'none';
    /** Enable gamma correction in shader */
    this.gammaCorrect = options.gammaCorrect ?? true;

    // Bounding box
    this.boundingBox = { min: new Vector3(), max: new Vector3() };

    // GPU resource id (set by the backend)
    this._gpuBuffersId = null;
  }

  /**
   * Populate the point cloud with data.
   * @param {Float32Array} positions  Flat xyz array (length = N*3)
   * @param {Uint8Array}   colors     Flat rgb array 0-255 (length = N*3)
   * @param {Float32Array} [sizes]    Optional per-point size (length = N)
   */
  setData(positions, colors, sizes = null) {
    if (!(positions instanceof Float32Array)) {
      throw new Error('PointCloud.setData: positions must be Float32Array');
    }
    if (!(colors instanceof Uint8Array) && !(colors instanceof Float32Array)) {
      throw new Error('PointCloud.setData: colors must be Uint8Array or Float32Array');
    }
    this.count = (positions.length / 3) | 0;
    this.positions = positions;
    // Normalize Float32Array colours to Uint8Array
    if (colors instanceof Float32Array) {
      const u8 = new Uint8Array(colors.length);
      for (let i = 0; i < colors.length; i++) u8[i] = Math.max(0, Math.min(255, (colors[i] * 255 + 0.5) | 0));
      this.colors = u8;
    } else {
      this.colors = colors;
    }
    this.sizes = sizes;
    this._gpuBuffersId = null; // force re-upload
    this.computeBounds();
    console.log(`[PointCloud] setData: ${this.count} points, bounds`, this.boundingBox);
  }

  /** Compute AABB from positions */
  computeBounds() {
    const p = this.positions;
    if (!p || p.length === 0) return;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    this.boundingBox.min.set(minX, minY, minZ);
    this.boundingBox.max.set(maxX, maxY, maxZ);
  }

  dispose() {
    this.positions = null;
    this.colors = null;
    this.sizes = null;
    this.count = 0;
    this._gpuBuffersId = null;
  }
}
