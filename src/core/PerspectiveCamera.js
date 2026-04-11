import { Camera } from './Camera.js';
import { MathUtils } from '../math/MathUtils.js';

/**
 * PerspectiveCamera - Camera with perspective projection
 */
export class PerspectiveCamera extends Camera {
  constructor(fov = 50, aspect = 1, near = 0.5, far = 2000) {
    super();

    this.type = 'PerspectiveCamera';
    this.isPerspectiveCamera = true;

    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;

    this.updateProjectionMatrix();
  }

  /**
   * Update the projection matrix based on camera parameters
   */
  updateProjectionMatrix(coordinateSystem = 'opengl') {
    const near = this.near;
    let top = near * Math.tan(MathUtils.degToRad(0.5 * this.fov));
    let height = 2 * top;
    let width = this.aspect * height;
    let left = -0.5 * width;

    if (coordinateSystem === 'webgpu') {
      this.projectionMatrix.makePerspectiveWebGPU(left, left + width, top, top - height, near, this.far);
    } else {
      this.projectionMatrix.makePerspective(left, left + width, top, top - height, near, this.far);
    }
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }

  copy(source, recursive) {
    super.copy(source, recursive);

    this.fov = source.fov;
    this.aspect = source.aspect;
    this.near = source.near;
    this.far = source.far;

    return this;
  }

  /**
   * Set focal length from film gauge (mm)
   */
  setFocalLength(focalLength) {
    const vExtentSlope = 0.5 * this.getFilmHeight() / focalLength;
    this.fov = MathUtils.radToDeg(2 * Math.atan(vExtentSlope));
    this.updateProjectionMatrix();
  }

  getFocalLength() {
    const vExtentSlope = Math.tan(MathUtils.degToRad(0.5 * this.fov));
    return 0.5 * this.getFilmHeight() / vExtentSlope;
  }

  getFilmWidth() {
    return this.filmGauge * Math.min(this.aspect, 1);
  }

  getFilmHeight() {
    return this.filmGauge / Math.max(this.aspect, 1);
  }

  toJSON(meta) {
    const data = super.toJSON(meta);

    data.object.fov = this.fov;
    data.object.aspect = this.aspect;
    data.object.near = this.near;
    data.object.far = this.far;

    return data;
  }
}

PerspectiveCamera.prototype.filmGauge = 35; // default film gauge in mm
