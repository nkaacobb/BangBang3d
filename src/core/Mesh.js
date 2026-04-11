import { Object3D } from './Object3D.js';

/**
 * Mesh - Represents a 3D object with geometry and material
 */
export class Mesh extends Object3D {
  constructor(geometry = null, material = null) {
    super();

    this.type = 'Mesh';
    this.isMesh = true;

    this.geometry = geometry;
    this.material = material;
    
    // Shadow properties
    this.castShadow = false;    // This mesh casts shadows
    this.receiveShadow = false; // This mesh receives shadows
  }

  copy(source) {
    super.copy(source);

    if (source.geometry !== null) this.geometry = source.geometry;
    if (source.material !== null) this.material = source.material;
    
    this.castShadow = source.castShadow;
    this.receiveShadow = source.receiveShadow;

    return this;
  }
}
