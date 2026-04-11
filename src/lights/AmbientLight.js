import { Light } from './Light.js';

/**
 * AmbientLight - Uniform ambient lighting
 */
export class AmbientLight extends Light {
  constructor(color = 0xffffff, intensity = 1) {
    super(color, intensity);

    this.type = 'AmbientLight';
    this.isAmbientLight = true;
  }
}
