import { Object3D } from '../../core/Object3D.js';
import { Matrix4 } from '../../math/Matrix4.js';
import { Vector3 } from '../../math/Vector3.js';

/**
 * PlanarReflection - Renders a mirror-like reflection of the scene on a plane.
 * 
 * Works by rendering the scene from a camera reflected across the given plane,
 * then sampling that texture in the material. Integrates with the render loop
 * without breaking shadows or lighting.
 * 
 * Usage:
 * ```js
 *   const mirror = new PlanarReflection({
 *     plane: { normal: new Vector3(0, 1, 0), constant: 0 },
 *     resolution: 512
 *   });
 *   scene.add(mirror);
 *   // Assign mirror.texture to reflective ground material
 * ```
 * 
 * Phase 5: Reflections Architecture
 */
export class PlanarReflection extends Object3D {
  /**
   * @param {Object} [options]
   * @param {Object} [options.plane] - { normal: Vector3, constant: number }
   * @param {number} [options.resolution=512] - Render texture resolution
   * @param {number} [options.clipBias=0.003] - Near-plane clipping bias
   * @param {boolean} [options.enabled=true] - Whether reflection is active
   */
  constructor(options = {}) {
    super();

    this.type = 'PlanarReflection';
    this.isPlanarReflection = true;

    /** Reflection plane definition */
    this.plane = {
      normal: (options.plane && options.plane.normal) 
        ? options.plane.normal.clone ? options.plane.normal.clone() : new Vector3(options.plane.normal.x, options.plane.normal.y, options.plane.normal.z)
        : new Vector3(0, 1, 0),
      constant: (options.plane && options.plane.constant !== undefined) ? options.plane.constant : 0
    };

    /** Render texture resolution */
    this.resolution = options.resolution || 512;

    /** Near-plane clipping bias to reduce artifacts */
    this.clipBias = options.clipBias !== undefined ? options.clipBias : 0.003;

    /** Enable/disable this planar reflection */
    this.enabled = options.enabled !== undefined ? options.enabled : true;

    /** 
     * The rendered reflection texture.
     * Set by the backend after rendering.
     * @type {WebGLTexture|GPUTexture|HTMLCanvasElement|null}
     */
    this.texture = null;

    /** 
     * The reflection camera's view-projection matrix.
     * Used by materials to compute reflection UVs.
     * @type {Matrix4}
     */
    this.textureMatrix = new Matrix4();

    /** Internal: render target (managed by backend) */
    this._renderTarget = null;

    /** Internal: needs update */
    this.needsUpdate = true;
  }

  /**
   * Compute the reflection matrix for a given camera.
   * The reflection matrix mirrors the view across the reflection plane.
   * 
   * @param {Camera} camera - The main camera
   * @returns {{ viewMatrix: Matrix4, projectionMatrix: Matrix4, textureMatrix: Matrix4 }}
   */
  computeReflectionMatrices(camera) {
    const n = this.plane.normal;
    const d = this.plane.constant;

    // Reflection matrix: reflects a point across the plane n·x + d = 0
    // R = I - 2*n*nᵀ - 2*d*n (as a 4x4 matrix)
    const reflectMatrix = new Matrix4();
    reflectMatrix.set(
      1 - 2 * n.x * n.x,  -2 * n.x * n.y,      -2 * n.x * n.z,      -2 * n.x * d,
      -2 * n.y * n.x,      1 - 2 * n.y * n.y,   -2 * n.y * n.z,      -2 * n.y * d,
      -2 * n.z * n.x,      -2 * n.z * n.y,       1 - 2 * n.z * n.z,   -2 * n.z * d,
      0,                    0,                     0,                    1
    );

    // Reflected view matrix = camera.matrixWorldInverse * reflectMatrix
    const reflectedView = new Matrix4();
    reflectedView.multiplyMatrices(camera.matrixWorldInverse, reflectMatrix);

    // Texture matrix: maps clip space [-1,1] to texture space [0,1]
    const textureMatrix = new Matrix4();
    textureMatrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0
    );
    textureMatrix.multiply(camera.projectionMatrix);
    textureMatrix.multiply(reflectedView);

    this.textureMatrix.copy(textureMatrix);

    return {
      viewMatrix: reflectedView,
      projectionMatrix: camera.projectionMatrix,
      textureMatrix
    };
  }

  /**
   * Update the planar reflection render.
   * 
   * @param {BangBangRenderer} renderer
   * @param {Scene} scene
   * @param {Camera} camera
   */
  update(renderer, scene, camera) {
    if (!this.enabled || !renderer || !scene || !camera) return;

    const backend = renderer.backend;
    if (!backend) return;

    if (backend.renderPlanarReflection) {
      this.texture = backend.renderPlanarReflection(this, scene, camera);
    } else {
      // Backend doesn't support planar reflection rendering yet
      if (!this._warnedOnce) {
        console.warn('[PlanarReflection] Backend does not support planar reflection rendering');
        this._warnedOnce = true;
      }
    }

    this.needsUpdate = false;
  }

  /**
   * Serialize to JSON
   */
  toJSON(meta) {
    const data = super.toJSON(meta);
    data.object.plane = {
      normal: { x: this.plane.normal.x, y: this.plane.normal.y, z: this.plane.normal.z },
      constant: this.plane.constant
    };
    data.object.resolution = this.resolution;
    data.object.clipBias = this.clipBias;
    data.object.enabled = this.enabled;
    return data;
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.texture = null;
    if (this._renderTarget) {
      this._renderTarget = null;
    }
  }
}
