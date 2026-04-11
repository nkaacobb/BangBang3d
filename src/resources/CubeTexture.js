import { MathUtils } from '../math/MathUtils.js';

/**
 * CubeTexture - Represents a cubemap texture (6 faces) for environment mapping and IBL.
 * 
 * Supports two input modes:
 * - 6-face cubemap images (px, nx, py, ny, pz, nz)
 * - Equirectangular panorama (converted to cubemap internally)
 * 
 * Phase 5: Reflections Architecture
 */
export class CubeTexture {
  /**
   * @param {Array<HTMLImageElement>} [images] - Array of 6 face images [+X, -X, +Y, -Y, +Z, -Z]
   */
  constructor(images = null) {
    this.uuid = MathUtils.generateUUID();
    this.name = '';
    this.isCubeTexture = true;
    this.isTexture = true;

    /**
     * 6 face images: [+X, -X, +Y, -Y, +Z, -Z]
     * @type {Array<HTMLImageElement|HTMLCanvasElement|null>}
     */
    this.images = images || [null, null, null, null, null, null];

    /** Cubemap resolution (width/height of each face) */
    this.resolution = 0;

    /** Filtering */
    this.minFilter = 'linear';
    this.magFilter = 'linear';

    /** Whether mipmaps should be generated */
    this.generateMipmaps = true;

    /** Number of mip levels (set after GPU upload) */
    this.mipLevels = 1;

    /** Texture format */
    this.format = 'rgba8unorm';

    /** Source type */
    this.sourceType = 'cubemap'; // 'cubemap' | 'equirectangular'

    /** Track update state */
    this.needsUpdate = true;
    this.version = 0;

    /** GPU resource key (set by resource manager) */
    this._gpuKey = null;

    // Auto-detect resolution from first valid image
    if (images && images[0]) {
      this.resolution = images[0].width || images[0].height || 0;
    }
  }

  /**
   * Set all 6 faces from an array of images
   * @param {Array<HTMLImageElement>} images - [+X, -X, +Y, -Y, +Z, -Z]
   */
  setImages(images) {
    if (!Array.isArray(images) || images.length !== 6) {
      throw new Error('CubeTexture.setImages: requires array of 6 images');
    }
    this.images = images;
    this.resolution = images[0].width || images[0].height || 0;
    this.sourceType = 'cubemap';
    this.needsUpdate = true;
    this.version++;
  }

  /**
   * Create cubemap from an equirectangular panorama image.
   * Converts to 6 cubemap faces on the CPU using canvas rendering.
   * @param {HTMLImageElement|HTMLCanvasElement} panorama - Equirectangular panorama
   * @param {number} [faceSize=512] - Resolution of each cubemap face
   */
  setFromEquirectangular(panorama, faceSize = 512) {
    this.sourceType = 'equirectangular';
    this.resolution = faceSize;

    // Draw panorama to a canvas to read pixels
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = panorama.width || panorama.naturalWidth;
    srcCanvas.height = panorama.height || panorama.naturalHeight;
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(panorama, 0, 0);
    const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

    /**
     * Face directions for cubemap sampling:
     * Each face has a forward direction, up direction, and right direction.
     */
    const faces = [
      { // +X (right)
        forward: [1, 0, 0], up: [0, 1, 0], right: [0, 0, -1]
      },
      { // -X (left)
        forward: [-1, 0, 0], up: [0, 1, 0], right: [0, 0, 1]
      },
      { // +Y (top)
        forward: [0, 1, 0], up: [0, 0, -1], right: [1, 0, 0]
      },
      { // -Y (bottom)
        forward: [0, -1, 0], up: [0, 0, 1], right: [1, 0, 0]
      },
      { // +Z (front)
        forward: [0, 0, 1], up: [0, 1, 0], right: [1, 0, 0]
      },
      { // -Z (back)
        forward: [0, 0, -1], up: [0, 1, 0], right: [-1, 0, 0]
      }
    ];

    this.images = faces.map((face) => {
      const faceCanvas = document.createElement('canvas');
      faceCanvas.width = faceSize;
      faceCanvas.height = faceSize;
      const faceCtx = faceCanvas.getContext('2d');
      const faceImageData = faceCtx.createImageData(faceSize, faceSize);
      const facePixels = faceImageData.data;

      for (let y = 0; y < faceSize; y++) {
        for (let x = 0; x < faceSize; x++) {
          // Map pixel to [-1, 1] cube face coordinates
          const u = (2.0 * (x + 0.5) / faceSize) - 1.0;
          const v = 1.0 - (2.0 * (y + 0.5) / faceSize);

          // Calculate 3D direction
          const dir = [
            face.forward[0] + u * face.right[0] + v * face.up[0],
            face.forward[1] + u * face.right[1] + v * face.up[1],
            face.forward[2] + u * face.right[2] + v * face.up[2]
          ];

          // Normalize
          const len = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);
          dir[0] /= len;
          dir[1] /= len;
          dir[2] /= len;

          // Convert to equirectangular UV
          const theta = Math.atan2(dir[2], dir[0]); // [-PI, PI]
          const phi = Math.asin(Math.max(-1, Math.min(1, dir[1]))); // [-PI/2, PI/2]
          const srcU = (theta / (2 * Math.PI)) + 0.5;
          const srcV = 0.5 - (phi / Math.PI);

          // Sample source image (bilinear)
          const srcX = Math.max(0, Math.min(srcCanvas.width - 1, Math.floor(srcU * srcCanvas.width)));
          const srcY = Math.max(0, Math.min(srcCanvas.height - 1, Math.floor(srcV * srcCanvas.height)));
          const srcIdx = (srcY * srcCanvas.width + srcX) * 4;

          const dstIdx = (y * faceSize + x) * 4;
          facePixels[dstIdx + 0] = srcData.data[srcIdx + 0];
          facePixels[dstIdx + 1] = srcData.data[srcIdx + 1];
          facePixels[dstIdx + 2] = srcData.data[srcIdx + 2];
          facePixels[dstIdx + 3] = 255;
        }
      }

      faceCtx.putImageData(faceImageData, 0, 0);
      return faceCanvas;
    });

    this.needsUpdate = true;
    this.version++;
  }

  /**
   * Check if all 6 faces are loaded
   * @returns {boolean}
   */
  isComplete() {
    return this.images.every(img => img !== null);
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.images = [null, null, null, null, null, null];
    this._gpuKey = null;
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    return {
      uuid: this.uuid,
      name: this.name,
      type: 'CubeTexture',
      resolution: this.resolution,
      sourceType: this.sourceType,
      format: this.format
    };
  }
}
