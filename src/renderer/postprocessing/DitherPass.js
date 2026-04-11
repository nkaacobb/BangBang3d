/**
 * DitherPass.js
 *
 * "Classic Mac OS / MacPaint" ordered-dithering post-processing pass.
 * Extends PostProcessPass; compiles the Bayer-matrix shader and exposes
 * runtime-tunable parameters.
 *
 * Usage:
 *   const dither = new DitherPass();
 *   backend.compilePostProcessPass(dither);
 *   backend.renderPostProcessPass(dither, inputTex, outputRT);
 *
 * Phase 3: Post-Processing – Ordered Dithering
 */

import PostProcessPass from './PostProcessPass.js';
import { DitherFragmentGLSL, DitherFragmentWGSL, DitherDefaults } from '../../shaders/postfx/DitherShader.js';

export default class DitherPass extends PostProcessPass {
    /**
     * @param {Object} [options]
     * @param {number} [options.strength=1]     0–1 mix between original and dithered
     * @param {number} [options.bias=0]         −0.5–0.5 threshold shift
     * @param {boolean}[options.invert=false]   swap black↔white
     * @param {number} [options.matrixSize=8]   4 or 8
     */
    constructor(options = {}) {
        super('DitherPass');

        // GLSL shaders
        this.vertexShaderGLSL = PostProcessPass.getFullscreenQuadVertexGLSL();
        this.fragmentShaderGLSL = DitherFragmentGLSL;

        // WGSL shaders
        this.vertexShaderWGSL = PostProcessPass.getFullscreenQuadVertexWGSL();
        this.fragmentShaderWGSL = DitherFragmentWGSL;

        // Uniforms – keys MUST match the uniform names in the GLSL shader
        this.uniforms = {
            uDitherStrength: options.strength !== undefined ? options.strength : DitherDefaults.uDitherStrength,
            uThresholdBias:  options.bias     !== undefined ? options.bias     : DitherDefaults.uThresholdBias,
            uInvert:         options.invert   ? 1.0 : 0.0,
            uMatrixSize:     options.matrixSize || DitherDefaults.uMatrixSize,
            uViewportOrigin: { x: 0, y: 0 },
            uResolution:     { x: 800, y: 600 }
        };

        this.isDitherPass = true;
    }

    // ─── Public parameter accessors ─────────────────────────────────────

    get strength()  { return this.uniforms.uDitherStrength; }
    set strength(v) { this.uniforms.uDitherStrength = Math.max(0, Math.min(1, v)); }

    get bias()      { return this.uniforms.uThresholdBias; }
    set bias(v)     { this.uniforms.uThresholdBias = Math.max(-0.5, Math.min(0.5, v)); }

    get invert()    { return this.uniforms.uInvert > 0.5; }
    set invert(v)   { this.uniforms.uInvert = v ? 1.0 : 0.0; }

    get matrixSize()  { return this.uniforms.uMatrixSize; }
    set matrixSize(v) { this.uniforms.uMatrixSize = (v <= 4) ? 4.0 : 8.0; }

    // ─── Lifecycle ──────────────────────────────────────────────────────

    /**
     * Compile shaders via the backend.
     */
    setup(backend) {
        if (backend && typeof backend.compilePostProcessPass === 'function') {
            backend.compilePostProcessPass(this);
        }
    }

    /**
     * Render the pass.
     * Called by PostFXPipeline / PostProcessComposer.
     */
    render(backend, inputTexture, outputTarget) {
        if (!this.pipeline) return;
        backend.renderPostProcessPass(this, inputTexture, outputTarget);
    }

    /**
     * Update resolution uniform (call on resize).
     */
    resize(width, height) {
        this.uniforms.uResolution = { x: width, y: height };
    }

    /**
     * Set viewport origin for stable dithering in multi-camera setups.
     */
    setViewportOrigin(x, y) {
        this.uniforms.uViewportOrigin = { x, y };
    }

    /**
     * Convenience: apply a "MacPaint" preset.
     * Full-strength 8×8 Bayer, no bias, no invert.
     */
    macPaintPreset() {
        this.strength = 1.0;
        this.bias = 0.0;
        this.invert = false;
        this.matrixSize = 8;
    }

    dispose() {
        // Program cleanup is handled by the backend
        this.pipeline = null;
        this._uniformLocations = null;
    }
}
