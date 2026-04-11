/**
 * Euler - Euler angles for rotation
 */
export class Euler {
  constructor(x = 0, y = 0, z = 0, order = 'XYZ') {
    this._x = x;
    this._y = y;
    this._z = z;
    this._order = order;
    this._onChange = null;
  }

  get x() { return this._x; }
  set x(value) {
    this._x = value;
    if (this._onChange) this._onChange();
  }

  get y() { return this._y; }
  set y(value) {
    this._y = value;
    if (this._onChange) this._onChange();
  }

  get z() { return this._z; }
  set z(value) {
    this._z = value;
    if (this._onChange) this._onChange();
  }

  get order() { return this._order; }
  set order(value) {
    this._order = value;
    if (this._onChange) this._onChange();
  }

  set(x, y, z, order) {
    this._x = x;
    this._y = y;
    this._z = z;
    this._order = order || this._order;
    if (this._onChange) this._onChange();
    return this;
  }

  copy(euler) {
    this._x = euler.x;
    this._y = euler.y;
    this._z = euler.z;
    this._order = euler.order;
    if (this._onChange) this._onChange();
    return this;
  }

  clone() {
    return new Euler(this._x, this._y, this._z, this._order);
  }

  setFromQuaternion(q, order) {
    const matrix = new Matrix4();
    matrix.makeRotationFromQuaternion(q);
    return this.setFromRotationMatrix(matrix, order);
  }

  setFromRotationMatrix(m, order) {
    const e = m.elements;
    const m11 = e[0], m12 = e[4], m13 = e[8];
    const m21 = e[1], m22 = e[5], m23 = e[9];
    const m31 = e[2], m32 = e[6], m33 = e[10];

    order = order || this._order;

    switch (order) {
      case 'XYZ':
        this._y = Math.asin(Math.max(-1, Math.min(1, m13)));

        if (Math.abs(m13) < 0.9999999) {
          this._x = Math.atan2(-m23, m33);
          this._z = Math.atan2(-m12, m11);
        } else {
          this._x = Math.atan2(m32, m22);
          this._z = 0;
        }

        break;

      case 'YXZ':
        this._x = Math.asin(-Math.max(-1, Math.min(1, m23)));

        if (Math.abs(m23) < 0.9999999) {
          this._y = Math.atan2(m13, m33);
          this._z = Math.atan2(m21, m22);
        } else {
          this._y = Math.atan2(-m31, m11);
          this._z = 0;
        }

        break;

      case 'ZXY':
        this._x = Math.asin(Math.max(-1, Math.min(1, m32)));

        if (Math.abs(m32) < 0.9999999) {
          this._y = Math.atan2(-m31, m33);
          this._z = Math.atan2(-m12, m22);
        } else {
          this._y = 0;
          this._z = Math.atan2(m21, m11);
        }

        break;

      case 'ZYX':
        this._y = Math.asin(-Math.max(-1, Math.min(1, m31)));

        if (Math.abs(m31) < 0.9999999) {
          this._x = Math.atan2(m32, m33);
          this._z = Math.atan2(m21, m11);
        } else {
          this._x = 0;
          this._z = Math.atan2(-m12, m22);
        }

        break;

      case 'YZX':
        this._z = Math.asin(Math.max(-1, Math.min(1, m21)));

        if (Math.abs(m21) < 0.9999999) {
          this._x = Math.atan2(-m23, m22);
          this._y = Math.atan2(-m31, m11);
        } else {
          this._x = 0;
          this._y = Math.atan2(m13, m33);
        }

        break;

      case 'XZY':
        this._z = Math.asin(-Math.max(-1, Math.min(1, m12)));

        if (Math.abs(m12) < 0.9999999) {
          this._x = Math.atan2(m32, m22);
          this._y = Math.atan2(m13, m11);
        } else {
          this._x = Math.atan2(-m23, m33);
          this._y = 0;
        }

        break;

      default:
        console.warn('Euler: unknown order ' + order);
    }

    this._order = order;
    if (this._onChange) this._onChange();

    return this;
  }

  fromArray(array) {
    this._x = array[0];
    this._y = array[1];
    this._z = array[2];
    if (array[3] !== undefined) this._order = array[3];
    if (this._onChange) this._onChange();
    return this;
  }

  toArray(array = [], offset = 0) {
    array[offset] = this._x;
    array[offset + 1] = this._y;
    array[offset + 2] = this._z;
    array[offset + 3] = this._order;
    return array;
  }
}

// Import needed for setFromQuaternion
import { Matrix4 } from './Matrix4.js';
