import { Object3D } from '../core/Object3D.js';
import { Color } from '../math/Color.js';

/**
 * Light - Base class for all lights
 */
export class Light extends Object3D {
  constructor(color = 0xffffff, intensity = 1) {
    super();

    this.type = 'Light';
    this.isLight = true;

    this.color = new Color();
    if (typeof color === 'number') {
      this.color.setHex(color);
    } else {
      this.color.copy(color);
    }

    this.intensity = intensity;
  }

  copy(source) {
    super.copy(source);

    this.color.copy(source.color);
    this.intensity = source.intensity;

    return this;
  }

  toJSON(meta) {
    const data = super.toJSON(meta);

    data.object.color = this.color.getHex();
    data.object.intensity = this.intensity;

    return data;
  }
}
