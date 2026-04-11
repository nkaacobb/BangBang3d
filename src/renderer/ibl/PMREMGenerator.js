import { CubeTexture } from '../../resources/CubeTexture.js';

/**
 * PMREMGenerator - Pre-filtered Mipmap Radiance Environment Map Generator.
 * 
 * Generates a prefiltered environment cubemap where each mip level corresponds
 * to a different roughness level, enabling roughness-based reflections in PBR.
 * 
 * Also generates a 2D BRDF integration LUT (split-sum approximation) needed
 * for correct specular IBL.
 * 
 * Current Implementation (Phase 5 approximation):
 * - CPU-based Gaussian-blur mip chain for roughness LOD.
 * - Analytical BRDF LUT via Schlick + Smith GGX approximation.
 * - Architecture designed so GPU-based importance-sampled PMREM can replace
 *   the CPU path later without changing the public API.
 * 
 * Usage:
 *   const pmrem = new PMREMGenerator();
 *   const prefiltered = pmrem.fromCubeTexture(envMap, { mipLevels: 6 });
 *   const brdfLUT = pmrem.generateBRDFLUT(256);
 * 
 * Phase 5: Reflections Architecture
 */
export class PMREMGenerator {
  constructor() {
    /** Cached BRDF LUT (shared across calls) */
    this._brdfLUT = null;
  }

  /**
   * Generate a prefiltered environment cubemap from a source CubeTexture.
   * Each mip level is progressively blurred to approximate increasing roughness.
   * 
   * @param {CubeTexture} cubeTexture - Source environment cubemap
   * @param {Object} [options]
   * @param {number} [options.mipLevels=6] - Number of roughness mip levels
   * @returns {CubeTexture} A new CubeTexture with mip data stored on it
   */
  fromCubeTexture(cubeTexture, options = {}) {
    const mipLevels = options.mipLevels || 6;
    const resolution = cubeTexture.resolution || 256;

    if (!cubeTexture.isComplete()) {
      console.warn('[PMREMGenerator] CubeTexture is not complete (missing faces)');
      return cubeTexture;
    }

    // Create output cubemap
    const output = new CubeTexture();
    output.name = (cubeTexture.name || 'env') + '_prefiltered';
    output.resolution = resolution;
    output.mipLevels = mipLevels;
    output.generateMipmaps = false; // We generate them ourselves

    // Store mip chain: output._mips[level] = [6 canvases]
    output._mips = [];

    for (let level = 0; level < mipLevels; level++) {
      const mipSize = Math.max(1, Math.floor(resolution / Math.pow(2, level)));
      const roughness = level / (mipLevels - 1);
      const blurRadius = Math.max(0, Math.floor(roughness * roughness * mipSize * 0.5));

      const mipFaces = [];
      for (let face = 0; face < 6; face++) {
        const sourceCanvas = cubeTexture.images[face];
        const blurred = this._blurFace(sourceCanvas, mipSize, blurRadius);
        mipFaces.push(blurred);
      }
      output._mips.push(mipFaces);
    }

    // Level 0 is the sharp environment
    output.images = output._mips[0];
    output.needsUpdate = true;
    output.version++;

    return output;
  }

  /**
   * Generate a BRDF integration LUT (2D texture).
   * X-axis: NdotV (0..1), Y-axis: roughness (0..1).
   * Output: RG channels = (scale, bias) for split-sum approximation.
   * 
   * Uses the analytical approximation from Karis (2013) — fast and GPU-friendly.
   * Can be replaced with importance-sampled integration later.
   * 
   * @param {number} [size=256] - LUT resolution
   * @returns {HTMLCanvasElement} Canvas containing the BRDF LUT
   */
  generateBRDFLUT(size = 256) {
    if (this._brdfLUT && this._brdfLUT.width === size) {
      return this._brdfLUT;
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    for (let y = 0; y < size; y++) {
      const roughness = Math.max((y + 0.5) / size, 0.04);

      for (let x = 0; x < size; x++) {
        const NdotV = Math.max((x + 0.5) / size, 0.001);

        // Analytical approximation (Karis 2013 / Lazarov 2013)
        const { scale, bias } = this._integrateBRDF(NdotV, roughness);

        const idx = (y * size + x) * 4;
        data[idx + 0] = Math.min(255, Math.max(0, Math.round(scale * 255)));
        data[idx + 1] = Math.min(255, Math.max(0, Math.round(bias * 255)));
        data[idx + 2] = 0;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    this._brdfLUT = canvas;
    return canvas;
  }

  /**
   * Analytical BRDF integration approximation.
   * Based on Karis 2013 / Lazarov 2013 fitting.
   * @private
   */
  _integrateBRDF(NdotV, roughness) {
    // Analytical approximation from "Real Shading in Unreal Engine 4"
    // and "Getting More Physical in Call of Duty: Black Ops II"
    const a = roughness;
    const a2 = a * a;

    // Schlick-GGX visibility approximation
    const k = a2 / 2.0;
    const vis = NdotV / (NdotV * (1.0 - k) + k);

    // Split sum approximation
    // Scale factor
    const scale = vis * (1.0 - Math.pow(1.0 - NdotV, 5.0));
    // Bias factor  
    const bias = vis * Math.pow(1.0 - NdotV, 5.0);

    // Clamp to valid range
    return {
      scale: Math.max(0, Math.min(1, scale)),
      bias: Math.max(0, Math.min(1, bias))
    };
  }

  /**
   * Box-blur a cubemap face to a target size.
   * @private
   * @param {HTMLCanvasElement|HTMLImageElement} source - Source face
   * @param {number} targetSize - Output resolution
   * @param {number} radius - Blur radius in pixels
   * @returns {HTMLCanvasElement}
   */
  _blurFace(source, targetSize, radius) {
    // First resize to target size
    const resized = document.createElement('canvas');
    resized.width = targetSize;
    resized.height = targetSize;
    const resizedCtx = resized.getContext('2d');
    resizedCtx.drawImage(source, 0, 0, targetSize, targetSize);

    if (radius <= 0) {
      return resized;
    }

    // Apply box blur
    const srcData = resizedCtx.getImageData(0, 0, targetSize, targetSize);
    const dstData = resizedCtx.createImageData(targetSize, targetSize);

    // Horizontal pass
    this._boxBlurH(srcData.data, dstData.data, targetSize, targetSize, radius);
    // Vertical pass  
    this._boxBlurV(dstData.data, srcData.data, targetSize, targetSize, radius);

    resizedCtx.putImageData(srcData, 0, 0);
    return resized;
  }

  /** @private */
  _boxBlurH(src, dst, w, h, r) {
    const iarr = 1.0 / (2 * r + 1);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let ix = -r; ix <= r; ix++) {
          const sx = Math.max(0, Math.min(w - 1, x + ix));
          const idx = (y * w + sx) * 4;
          rSum += src[idx]; gSum += src[idx + 1]; bSum += src[idx + 2];
          count++;
        }
        const dIdx = (y * w + x) * 4;
        dst[dIdx] = rSum / count;
        dst[dIdx + 1] = gSum / count;
        dst[dIdx + 2] = bSum / count;
        dst[dIdx + 3] = 255;
      }
    }
  }

  /** @private */
  _boxBlurV(src, dst, w, h, r) {
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let iy = -r; iy <= r; iy++) {
          const sy = Math.max(0, Math.min(h - 1, y + iy));
          const idx = (sy * w + x) * 4;
          rSum += src[idx]; gSum += src[idx + 1]; bSum += src[idx + 2];
          count++;
        }
        const dIdx = (y * w + x) * 4;
        dst[dIdx] = rSum / count;
        dst[dIdx + 1] = gSum / count;
        dst[dIdx + 2] = bSum / count;
        dst[dIdx + 3] = 255;
      }
    }
  }

  /**
   * Dispose of cached resources
   */
  dispose() {
    this._brdfLUT = null;
  }
}
