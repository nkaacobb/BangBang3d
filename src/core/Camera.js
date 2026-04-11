import { Object3D } from './Object3D.js';
import { Matrix4 } from '../math/Matrix4.js';
import { Vector3 } from '../math/Vector3.js';

/**
 * Camera - Base class for all cameras
 *
 * Phase 3: Per-Camera Post-Processing
 * Each camera can own a PostFXPipeline with its own ordered list of
 * post-processing passes (e.g. ordered dithering, tone mapping).
 */
export class Camera extends Object3D {
  constructor() {
    super();

    this.type = 'Camera';
    this.isCamera = true;

    this.matrixWorldInverse = new Matrix4();
    this.projectionMatrix = new Matrix4();
    this.projectionMatrixInverse = new Matrix4();

    // Camera up vector
    this.up = new Vector3(0, 1, 0);

    // ── Per-camera Post-Processing ──────────────────────────────────────

    /**
     * Whether postFX is enabled for this camera.
     * @type {boolean}
     */
    this.postFXEnabled = false;

    /**
     * The PostFXPipeline instance driving this camera's effect stack.
     * Created lazily by enablePostFX() or setPostFXProfile().
     * @type {import('../renderer/postprocessing/PostFXPipeline.js').default|null}
     */
    this.postFXPipeline = null;

    /**
     * The active profile name (e.g. 'mac_dither').
     * Stored for serialisation / UI display.
     * @type {string|null}
     */
    this.postFXProfile = null;

    /**
     * Profile-specific parameter overrides keyed by profile name.
     * Example: { mac_dither: { strength: 1, matrixSize: 8 } }
     * @type {Object}
     */
    this.postFXParams = {};

    // ── Viewport ────────────────────────────────────────────────────────

    /**
     * Optional viewport rectangle for multi-camera rendering.
     * Values are in PIXELS of the canvas.  If null the full canvas is used.
     * @type {{ x: number, y: number, width: number, height: number }|null}
     */
    this.viewport = null;
  }

  // ─── PostFX helpers ─────────────────────────────────────────────────

  /**
   * Enable per-camera post-processing.
   * Creates a PostFXPipeline if one does not exist.
   */
  enablePostFX(on = true) {
    this.postFXEnabled = on;
    if (on && !this.postFXPipeline) {
      // Lazy import to avoid circular dependency
      import('../renderer/postprocessing/PostFXPipeline.js').then(mod => {
        if (!this.postFXPipeline) {
          this.postFXPipeline = new mod.default();
        }
      });
    }
  }

  /**
   * Apply a named postFX profile to this camera.
   * Creates and configures the pipeline + pass.
   * @param {string} profile  e.g. 'mac_dither'
   * @param {Object} [options] pass-specific options
   */
  async setPostFXProfile(profile, options = {}) {
    const { default: PostFXPipeline } = await import('../renderer/postprocessing/PostFXPipeline.js');
    if (!this.postFXPipeline) {
      this.postFXPipeline = new PostFXPipeline();
    }
    // Remove existing passes with the same profile name
    const existing = this.postFXPipeline.getPass(profile);
    if (existing) this.postFXPipeline.removePass(existing);

    this.postFXPipeline.addPassFromProfile(profile, options);
    this.postFXProfile = profile;
    this.postFXParams[profile] = options;
    this.postFXEnabled = true;
  }

  /**
   * Synchronous variant — caller must import PostFXPipeline themselves.
   * Used by GPUBackend and examples that bundle everything up front.
   * @param {Function} PostFXPipelineCtor
   * @param {string} profile
   * @param {Object} [options]
   */
  setPostFXProfileSync(PostFXPipelineCtor, profile, options = {}) {
    if (!this.postFXPipeline) {
      this.postFXPipeline = new PostFXPipelineCtor();
    }
    const existing = this.postFXPipeline.getPass(profile);
    if (existing) this.postFXPipeline.removePass(existing);

    this.postFXPipeline.addPassFromProfile(profile, options);
    this.postFXProfile = profile;
    this.postFXParams[profile] = options;
    this.postFXEnabled = true;
  }

  // ─── Overrides ──────────────────────────────────────────────────────

  copy(source, recursive) {
    super.copy(source, recursive);

    this.matrixWorldInverse.copy(source.matrixWorldInverse);
    this.projectionMatrix.copy(source.projectionMatrix);
    this.projectionMatrixInverse.copy(source.projectionMatrixInverse);

    // PostFX state is NOT deep-copied (pipelines hold GPU resources)
    this.postFXEnabled = source.postFXEnabled;
    this.postFXProfile = source.postFXProfile;
    this.postFXParams = { ...source.postFXParams };
    if (source.viewport) {
      this.viewport = { ...source.viewport };
    }

    return this;
  }

  getWorldDirection(target = new Vector3()) {
    this.updateMatrixWorld(true);

    const e = this.matrixWorld.elements;

    return target.set(-e[8], -e[9], -e[10]).normalize();
  }

  updateMatrixWorld(force) {
    super.updateMatrixWorld(force);

    this.matrixWorldInverse.copy(this.matrixWorld).invert();
  }

  clone() {
    return new this.constructor().copy(this);
  }
}
