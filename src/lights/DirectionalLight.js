import { Light } from './Light.js';
import { Vector3 } from '../math/Vector3.js';
import { OrthographicCamera } from '../core/OrthographicCamera.js';

/**
 * DirectionalLight - Light with parallel rays (like sunlight)
 */
export class DirectionalLight extends Light {
  constructor(color = 0xffffff, intensity = 1) {
    super(color, intensity);

    this.type = 'DirectionalLight';
    this.isDirectionalLight = true;

    // Target position (light points from position to target)
    this.target = new Vector3(0, 0, 0);
    
    // Shadow properties
    this.castShadow = false;
    this.shadow = {
      mapSize: { width: 1024, height: 1024 },
      bias: 0.0005,
      normalBias: 0.0,
      radius: 1.0,
      camera: null,  // Will be initialized when shadows are enabled
      map: null,     // GPU texture resource
      matrix: null,  // Shadow projection matrix
      frustumSize: 10  // Orthographic frustum size
    };
  }

  /**
   * Get the light direction (normalized)
   */
  getDirection(out = new Vector3()) {
    this.updateMatrixWorld(true);
    
    const position = new Vector3();
    position.setFromMatrixPosition(this.matrixWorld);
    
    out.copy(this.target).sub(position).normalize();
    
    return out;
  }

  /**
   * Initialize shadow camera for this directional light
   */
  initShadowCamera() {
    if (!this.shadow.camera) {
      const size = this.shadow.frustumSize;
      this.shadow.camera = new OrthographicCamera(
        -size, size,  // left, right
        size, -size,  // top, bottom
        0.5, 50       // near, far
      );
    }
    return this.shadow.camera;
  }
  
  /**
   * Update shadow camera to match light direction
   */
  updateShadowCamera() {
    if (!this.shadow.camera) return;
    
    const camera = this.shadow.camera;
    const direction = this.getDirection();
    
    // Position camera at light position
    this.updateMatrixWorld(true);
    const lightPos = new Vector3();
    lightPos.setFromMatrixPosition(this.matrixWorld);
    
    camera.position.copy(lightPos);
    camera.lookAt(this.target);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
  }

  copy(source) {
    super.copy(source);

    this.target.copy(source.target);
    this.castShadow = source.castShadow;
    if (source.shadow) {
      this.shadow.mapSize.width = source.shadow.mapSize.width;
      this.shadow.mapSize.height = source.shadow.mapSize.height;
      this.shadow.bias = source.shadow.bias;
      this.shadow.normalBias = source.shadow.normalBias;
      this.shadow.frustumSize = source.shadow.frustumSize;
    }

    return this;
  }
}
