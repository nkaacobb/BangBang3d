/**
 * PostFXPipeline.js
 *
 * Per-camera post-processing pipeline.
 * Each Camera can own a PostFXPipeline with its own ordered list of
 * PostProcessPass instances and a dedicated render target for input.
 *
 * The GPUBackend calls:
 *   1. pipeline.ensureTargets(backend, w, h)  – lazy-create / resize
 *   2. Bind pipeline.inputTarget as the scene FBO
 *   3. Render scene into it
 *   4. pipeline.execute(backend)  – run all passes, last writes to screen
 *
 * Phase 3: Per-Camera Post-Processing
 */

import RenderTarget from '../resources/RenderTarget.js';
import DitherPass from './DitherPass.js';

/** Known pass type constructors, keyed by profile name */
const PASS_REGISTRY = {
    'mac_dither': (opts) => new DitherPass(opts)
};

export default class PostFXPipeline {
    constructor() {
        /** @type {import('./PostProcessPass.js').default[]} */
        this.passes = [];

        /**
         * Off-screen render target that the scene draws INTO.
         * Created lazily by ensureTargets().
         * @type {RenderTarget|null}
         */
        this.inputTarget = null;

        /**
         * Intermediate ping-pong target for multi-pass chains.
         * @type {RenderTarget|null}
         */
        this._pingTarget = null;

        this._width = 0;
        this._height = 0;

        /** Whether the pipeline has at least one enabled pass */
        this.enabled = true;
    }

    // ─── Pass Management ────────────────────────────────────────────────

    /**
     * Add a pass by instance.
     */
    addPass(pass) {
        this.passes.push(pass);
        return pass;
    }

    /**
     * Remove a pass by instance or name.
     */
    removePass(passOrName) {
        const idx = typeof passOrName === 'string'
            ? this.passes.findIndex(p => p.name === passOrName)
            : this.passes.indexOf(passOrName);
        if (idx !== -1) {
            const [removed] = this.passes.splice(idx, 1);
            removed.dispose();
        }
    }

    /**
     * Find a pass by name.
     */
    getPass(name) {
        return this.passes.find(p => p.name === name) || null;
    }

    /**
     * Create a pass from a registered profile name.
     * @param {string} profile  e.g. 'mac_dither'
     * @param {Object} [options]
     */
    addPassFromProfile(profile, options = {}) {
        const factory = PASS_REGISTRY[profile];
        if (!factory) {
            console.warn(`[PostFXPipeline] Unknown profile "${profile}"`);
            return null;
        }
        const pass = factory(options);
        return this.addPass(pass);
    }

    // ─── Targets ────────────────────────────────────────────────────────

    /**
     * Ensure internal render targets exist and match the given size.
     * Also compiles any uncompiled passes.
     */
    ensureTargets(backend, width, height) {
        if (this._width === width && this._height === height && this.inputTarget) {
            return;
        }

        this._width = width;
        this._height = height;

        // Input target (scene draws here)
        if (!this.inputTarget) {
            this.inputTarget = new RenderTarget(width, height, { depth: true });
        } else {
            this.inputTarget.resize(width, height);
        }
        backend.setupRenderTarget(this.inputTarget);

        // Ping-pong target for multi-pass
        if (this.passes.length > 1) {
            if (!this._pingTarget) {
                this._pingTarget = new RenderTarget(width, height, { depth: false });
            } else {
                this._pingTarget.resize(width, height);
            }
            backend.setupRenderTarget(this._pingTarget);
        }

        // Compile passes that haven't been compiled yet
        for (const pass of this.passes) {
            if (!pass.pipeline) {
                pass.setup(backend);
            }
            if (pass.resize) {
                pass.resize(width, height);
            }
        }
    }

    // ─── Execution ──────────────────────────────────────────────────────

    /**
     * Does this pipeline have any enabled passes?
     */
    hasActivePasses() {
        if (!this.enabled) return false;
        return this.passes.some(p => p.enabled);
    }

    /**
     * Execute all enabled passes in order.
     * Reads from this.inputTarget, writes the last pass output to
     * the given outputTarget (null → canvas).
     *
     * @param {Object} backend    GPUBackend instance
     * @param {RenderTarget|null} outputTarget  null = back buffer
     */
    execute(backend, outputTarget = null) {
        const activePasses = this.passes.filter(p => p.enabled);
        if (activePasses.length === 0) return;
        if (!this.inputTarget) return;

        let inputTex = this.inputTarget.getColorTexture();
        let currentPingTarget = this._pingTarget;

        for (let i = 0; i < activePasses.length; i++) {
            const pass = activePasses[i];
            const isLast = i === activePasses.length - 1;

            const target = isLast ? outputTarget : currentPingTarget;

            pass.render(backend, inputTex, target);

            if (!isLast) {
                // Read from the ping target for the next pass
                inputTex = currentPingTarget.getColorTexture();
                // Swap ping for the next intermediate pass
                currentPingTarget = (currentPingTarget === this._pingTarget)
                    ? this.inputTarget   // reuse input target as second ping
                    : this._pingTarget;
            }
        }
    }

    // ─── Lifecycle ──────────────────────────────────────────────────────

    dispose() {
        for (const pass of this.passes) pass.dispose();
        this.passes = [];
        if (this.inputTarget) { this.inputTarget.dispose(); this.inputTarget = null; }
        if (this._pingTarget) { this._pingTarget.dispose(); this._pingTarget = null; }
    }
}
