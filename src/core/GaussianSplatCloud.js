import { Object3D } from './Object3D.js';
import { Vector3 } from '../math/Vector3.js';

/**
 * GaussianSplatCloud - 3D Gaussian Splatting renderer.
 *
 * Stores per-splat: position, colour+opacity, scale, rotation (quaternion).
 * The GPU backend renders each splat as an instanced camera-facing quad whose
 * vertices are expanded in screen space according to the projected 3D
 * covariance, and the fragment shader evaluates a 2D Gaussian kernel.
 *
 * Data layout (tightly packed typed arrays):
 *   positions : Float32Array  — xyz per splat  (count*3)
 *   colors    : Uint8Array    — rgba per splat  (count*4)
 *   scales    : Float32Array  — sx, sy, sz      (count*3)
 *   rotations : Float32Array  — qw, qx, qy, qz (count*4)
 *
 * Usage:
 *   const splats = new GaussianSplatCloud();
 *   splats.setData(positions, colors, scales, rotations);
 *   scene.add(splats);
 */
export class GaussianSplatCloud extends Object3D {
  constructor(options = {}) {
    super();

    this.type = 'GaussianSplatCloud';
    this.isGaussianSplatCloud = true;

    /** @type {Float32Array|null} */
    this.positions = null;
    /** @type {Uint8Array|null} RGBA 0-255 */
    this.colors = null;
    /** @type {Float32Array|null} per-splat scale xyz */
    this.scales = null;
    /** @type {Float32Array|null} quaternion wxyz */
    this.rotations = null;
    /** Number of splats */
    this.count = 0;

    // Rendering options
    /** Max splats rendered per frame (0 = unlimited) */
    this.maxSplats = options.maxSplats ?? 0;
    /** Gaussian cutoff in standard deviations (larger = smoother, slower) */
    this.cutoff = options.cutoff ?? 3.0;
    /** 'premultiplied' | 'additive' */
    this.blendMode = options.blendMode ?? 'premultiplied';
    /** Test against depth buffer */
    this.depthTest = options.depthTest ?? true;
    /** Write depth (usually false for translucent splats) */
    this.depthWrite = options.depthWrite ?? false;
    /** Resolution scale for off-screen rendering (1.0 = full, 0.5 = half) */
    this.resolutionScale = options.resolutionScale ?? 1.0;
    /** LOD screen-size threshold in pixels — skip splats smaller than this */
    this.lodThreshold = options.lodThreshold ?? 0.5;

    // Bounding box
    this.boundingBox = { min: new Vector3(), max: new Vector3() };

    // Sorting
    /** @type {Uint32Array|null} index order after depth sort */
    this._sortedIndices = null;
    /** Camera position used for the last sort — skip re-sort if unchanged */
    this._lastSortCamPos = new Vector3();
    this._sortThreshold = 0.1; // re-sort when cam moves more than this

    // GPU resource id (set by the backend)
    this._gpuBuffersId = null;
  }

  /**
   * Populate with splat data.
   * @param {Float32Array} positions  xyz (count*3)
   * @param {Uint8Array}   colors     rgba 0-255 (count*4)
   * @param {Float32Array} scales     sx sy sz (count*3)
   * @param {Float32Array} rotations  qw qx qy qz (count*4)
   */
  setData(positions, colors, scales, rotations) {
    this.count = (positions.length / 3) | 0;
    this.positions = positions;
    this.colors = colors;
    this.scales = scales;
    this.rotations = rotations;
    this._sortedIndices = new Uint32Array(this.count);
    for (let i = 0; i < this.count; i++) this._sortedIndices[i] = i;
    this._gpuBuffersId = null;
    this.computeBounds();
    console.log(`[GaussianSplatCloud] setData: ${this.count} splats, bounds`, this.boundingBox);
  }

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

  /**
   * Sort splats back-to-front for alpha blending.
   * Uses a single-pass radix-style bucket sort on quantised view-space depth
   * for large counts, falling back to Array.sort for small counts.
   * @param {import('../math/Matrix4.js').Matrix4} viewMatrix  camera worldInverse
   */
  sortByDepth(viewMatrix) {
    const n = this.count;
    if (n === 0) return;

    const e = viewMatrix.elements;
    const pos = this.positions;

    // Compute view-space Z for each splat
    const depths = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      // row 2 of viewMatrix dot position + translation
      depths[i] = e[2] * pos[i3] + e[6] * pos[i3 + 1] + e[10] * pos[i3 + 2] + e[14];
    }

    const indices = this._sortedIndices;

    if (n <= 65536) {
      // Simple Array.sort for moderate counts
      const arr = Array.from(indices);
      arr.sort((a, b) => depths[a] - depths[b]); // ascending Z: most negative (furthest) first = back-to-front
      for (let i = 0; i < n; i++) indices[i] = arr[i];
    } else {
      // Counting / bucket sort for large counts
      const BUCKETS = 65536;
      let minD = Infinity, maxD = -Infinity;
      for (let i = 0; i < n; i++) {
        if (depths[i] < minD) minD = depths[i];
        if (depths[i] > maxD) maxD = depths[i];
      }
      const range = maxD - minD || 1;
      const scale = (BUCKETS - 1) / range;
      const counts = new Uint32Array(BUCKETS);
      const bucketIdx = new Uint16Array(n);
      for (let i = 0; i < n; i++) {
        const b = ((depths[i] - minD) * scale) | 0;
        bucketIdx[i] = b;
        counts[b]++;
      }
      // prefix sum
      const offsets = new Uint32Array(BUCKETS);
      for (let i = 1; i < BUCKETS; i++) offsets[i] = offsets[i - 1] + counts[i - 1];
      // scatter (back-to-front: iterate buckets high-to-low already done by reversing output)
      const out = new Uint32Array(n);
      for (let i = 0; i < n; i++) {
        out[offsets[bucketIdx[i]]++] = i;
      }
      // Bucket sort naturally fills low-to-high Z = back-to-front
      for (let i = 0; i < n; i++) indices[i] = out[i];
    }
  }

  dispose() {
    this.positions = null;
    this.colors = null;
    this.scales = null;
    this.rotations = null;
    this._sortedIndices = null;
    this.count = 0;
    this._gpuBuffersId = null;
  }
}
