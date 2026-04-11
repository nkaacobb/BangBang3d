import { Object3D } from '../../core/Object3D.js';

/**
 * ReflectionProbe — Captures the scene into a cubemap for localized reflections.
 *
 * Place the probe in the scene, then call `probe.update(renderer, scene)` to
 * render 6 cubemap faces from the probe's world position.  The resulting
 * prefiltered cubemap is stored in `probe.envMap` and fed to nearby PBR
 * materials automatically by the renderer (closest-probe wins).
 *
 * ```js
 * const probe = new ReflectionProbe({ resolution: 256, influenceRadius: 20 });
 * probe.position.set(0, 2, 0);
 * scene.add(probe);
 * scene.addReflectionProbe(probe);
 * probe.update(renderer, scene);
 * ```
 *
 * The renderer's per-mesh PBR draw path selects:
 *   material.envMap  →  nearest ReflectionProbe  →  scene.environment
 *
 * Update modes:
 * - `'manual'`   — call `probe.update()` yourself.
 * - `'ondemand'` — call `probe.markDirty()`, engine updates next frame.
 */
export class ReflectionProbe extends Object3D {
  /**
   * @param {Object} [options]
   * @param {number} [options.resolution=256]       Cubemap face resolution (px)
   * @param {number} [options.influenceRadius=10]    World-unit radius
   * @param {string} [options.updateMode='manual']   'manual' | 'ondemand'
   * @param {number} [options.nearPlane=0.1]
   * @param {number} [options.farPlane=1000]
   */
  constructor(options = {}) {
    super();

    this.type = 'ReflectionProbe';
    this.isReflectionProbe = true;

    /** Cubemap face resolution */
    this.resolution = options.resolution || 256;

    /** World-unit influence radius */
    this.influenceRadius = options.influenceRadius || 10;

    /** 'manual' | 'ondemand' */
    this.updateMode = options.updateMode || 'manual';

    /** Capture camera clip planes */
    this.nearPlane = options.nearPlane || 0.1;
    this.farPlane  = options.farPlane  || 1000;

    /**
     * GPU cubemap texture key (set by backend after capture).
     * The renderer uses this key to bind the cubemap during PBR drawing.
     * @type {string|null}
     */
    this.envMapKey = null;

    /**
     * Max mip level of the prefiltered cubemap (set by backend).
     * @type {number}
     */
    this.envMapMaxLod = 0;

    /** Whether the probe needs to re-capture */
    this.needsUpdate = true;

    /** Probes are invisible scene-graph nodes — never rendered as meshes */
    this.visible = false;

    /** @private */
    this._lastCaptureFrame = -1;
  }

  // ─── Influence ───────────────────────────────────────────────

  /**
   * Smooth-falloff influence weight of this probe at `worldPos`.
   * Returns 1 at the probe centre, 0 at (or beyond) `influenceRadius`.
   *
   * @param {{ x:number, y:number, z:number }} worldPos
   * @returns {number} [0, 1]
   */
  getInfluence(worldPos) {
    const p = this.getWorldPosition();
    const dx = worldPos.x - p.x;
    const dy = worldPos.y - p.y;
    const dz = worldPos.z - p.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist >= this.influenceRadius) return 0;
    const t = dist / this.influenceRadius;
    return 1.0 - t * t;           // inverse-quadratic falloff
  }

  /**
   * World-space position extracted from the world matrix.
   * @returns {{ x:number, y:number, z:number }}
   */
  getWorldPosition() {
    this.updateMatrixWorld();
    const e = this.matrixWorld.elements;
    return { x: e[12], y: e[13], z: e[14] };
  }

  // ─── Capture ─────────────────────────────────────────────────

  /**
   * Capture the scene from this probe's position into a cubemap.
   *
   * Delegates to `backend.captureReflectionProbe(probe, scene)` which renders
   * 6 faces, runs PMREM prefiltering, and uploads the result as a GPU cubemap.
   *
   * @param {BangBangRenderer} renderer
   * @param {Scene} scene
   */
  update(renderer, scene) {
    if (!renderer || !scene) {
      console.warn('[ReflectionProbe] update() requires renderer and scene');
      return;
    }

    const backend = renderer.backend;
    if (!backend) {
      console.warn('[ReflectionProbe] No backend available');
      return;
    }

    if (typeof backend.captureReflectionProbe !== 'function') {
      console.warn('[ReflectionProbe] Backend does not implement captureReflectionProbe()');
      return;
    }

    backend.captureReflectionProbe(this, scene);
    this.needsUpdate = false;
    this._lastCaptureFrame = renderer.info ? renderer.info.render.frame : 0;
  }

  /** Mark for re-capture on next frame (for 'ondemand' mode). */
  markDirty() {
    this.needsUpdate = true;
  }

  // ─── Serialisation / Dispose ─────────────────────────────────

  toJSON(meta) {
    const data = super.toJSON(meta);
    data.object.resolution       = this.resolution;
    data.object.influenceRadius  = this.influenceRadius;
    data.object.updateMode       = this.updateMode;
    data.object.nearPlane        = this.nearPlane;
    data.object.farPlane         = this.farPlane;
    return data;
  }

  dispose() {
    // GPU resources are owned by the backend's resourceManager — nothing to
    // free here.  The backend will clean up on `deleteTexture(probe.envMapKey)`.
    this.envMapKey = null;
    this.envMapMaxLod = 0;
  }
}
