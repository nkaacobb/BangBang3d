/**
 * RenderTargetPool.js
 *
 * Manages a pool of RenderTarget objects keyed by (width, height, format).
 * Avoids creating and destroying framebuffers every frame when multiple
 * cameras each need their own off-screen render target.
 *
 * Usage:
 *   const pool = new RenderTargetPool();
 *   const rt = pool.acquire(1920, 1080, { depth: true });
 *   // ... render into rt ...
 *   pool.release(rt);
 *
 * Phase 3: Post-Processing – Render Target Pooling
 */

import RenderTarget from '../resources/RenderTarget.js';

export default class RenderTargetPool {
    constructor() {
        /** @type {Map<string, RenderTarget[]>} */
        this._available = new Map();
        /** @type {Set<RenderTarget>} */
        this._inUse = new Set();
    }

    /**
     * Get a render target from the pool (or create a new one).
     * @param {number} width
     * @param {number} height
     * @param {Object} [options]  RenderTarget constructor options
     * @returns {RenderTarget}
     */
    acquire(width, height, options = {}) {
        const key = this._key(width, height, options);
        const bucket = this._available.get(key);
        let rt;
        if (bucket && bucket.length > 0) {
            rt = bucket.pop();
            // Ensure correct size (may have been released from a different-size cycle)
            if (rt.width !== width || rt.height !== height) {
                rt.resize(width, height);
            }
        } else {
            rt = new RenderTarget(width, height, {
                depth: options.depth !== false,
                format: options.format || 'rgba8unorm',
                minFilter: options.minFilter || 'linear',
                magFilter: options.magFilter || 'linear'
            });
        }
        this._inUse.add(rt);
        return rt;
    }

    /**
     * Return a render target to the pool for later reuse.
     */
    release(rt) {
        if (!this._inUse.has(rt)) return;
        this._inUse.delete(rt);
        const key = this._key(rt.width, rt.height, rt);
        let bucket = this._available.get(key);
        if (!bucket) {
            bucket = [];
            this._available.set(key, bucket);
        }
        bucket.push(rt);
    }

    /**
     * Dispose of ALL targets in the pool (and those currently in-use).
     */
    dispose() {
        for (const [, bucket] of this._available) {
            for (const rt of bucket) rt.dispose();
        }
        for (const rt of this._inUse) rt.dispose();
        this._available.clear();
        this._inUse.clear();
    }

    /** @private */
    _key(w, h, opts) {
        const depth = (opts && opts.depth === false) ? 0 : 1;
        const fmt = (opts && opts.format) || 'rgba8unorm';
        return `${w}x${h}_${fmt}_d${depth}`;
    }
}
