/**
 * Matrix4 - 4x4 matrix for transforms (column-major to match WebGL convention)
 * Elements stored in column-major order for transform compatibility
 */
export class Matrix4 {
  constructor() {
    this.elements = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
  }

  set(n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44) {
    const e = this.elements;

    e[0] = n11; e[4] = n12; e[8] = n13; e[12] = n14;
    e[1] = n21; e[5] = n22; e[9] = n23; e[13] = n24;
    e[2] = n31; e[6] = n32; e[10] = n33; e[14] = n34;
    e[3] = n41; e[7] = n42; e[11] = n43; e[15] = n44;

    return this;
  }

  identity() {
    this.set(
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    );
    return this;
  }

  copy(m) {
    const e = this.elements;
    const me = m.elements;

    for (let i = 0; i < 16; i++) {
      e[i] = me[i];
    }

    return this;
  }

  clone() {
    return new Matrix4().copy(this);
  }

  multiply(m) {
    return this.multiplyMatrices(this, m);
  }

  premultiply(m) {
    return this.multiplyMatrices(m, this);
  }

  multiplyMatrices(a, b) {
    const ae = a.elements;
    const be = b.elements;
    const te = this.elements;

    const a11 = ae[0], a12 = ae[4], a13 = ae[8], a14 = ae[12];
    const a21 = ae[1], a22 = ae[5], a23 = ae[9], a24 = ae[13];
    const a31 = ae[2], a32 = ae[6], a33 = ae[10], a34 = ae[14];
    const a41 = ae[3], a42 = ae[7], a43 = ae[11], a44 = ae[15];

    const b11 = be[0], b12 = be[4], b13 = be[8], b14 = be[12];
    const b21 = be[1], b22 = be[5], b23 = be[9], b24 = be[13];
    const b31 = be[2], b32 = be[6], b33 = be[10], b34 = be[14];
    const b41 = be[3], b42 = be[7], b43 = be[11], b44 = be[15];

    te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
    te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
    te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
    te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;

    te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
    te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
    te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
    te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;

    te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
    te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
    te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
    te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;

    te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
    te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
    te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
    te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;

    return this;
  }

  determinant() {
    const e = this.elements;

    const n11 = e[0], n12 = e[4], n13 = e[8], n14 = e[12];
    const n21 = e[1], n22 = e[5], n23 = e[9], n24 = e[13];
    const n31 = e[2], n32 = e[6], n33 = e[10], n34 = e[14];
    const n41 = e[3], n42 = e[7], n43 = e[11], n44 = e[15];

    return (
      n41 * (+n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34) +
      n42 * (+n11 * n23 * n34 - n11 * n24 * n33 + n14 * n21 * n33 - n13 * n21 * n34 + n13 * n24 * n31 - n14 * n23 * n31) +
      n43 * (+n11 * n24 * n32 - n11 * n22 * n34 - n14 * n21 * n32 + n12 * n21 * n34 + n14 * n22 * n31 - n12 * n24 * n31) +
      n44 * (-n13 * n22 * n31 - n11 * n23 * n32 + n11 * n22 * n33 + n13 * n21 * n32 - n12 * n21 * n33 + n12 * n23 * n31)
    );
  }

  transpose() {
    const e = this.elements;
    let tmp;

    tmp = e[1]; e[1] = e[4]; e[4] = tmp;
    tmp = e[2]; e[2] = e[8]; e[8] = tmp;
    tmp = e[6]; e[6] = e[9]; e[9] = tmp;

    tmp = e[3]; e[3] = e[12]; e[12] = tmp;
    tmp = e[7]; e[7] = e[13]; e[13] = tmp;
    tmp = e[11]; e[11] = e[14]; e[14] = tmp;

    return this;
  }

  invert() {
    const e = this.elements;

    const n11 = e[0], n21 = e[1], n31 = e[2], n41 = e[3];
    const n12 = e[4], n22 = e[5], n32 = e[6], n42 = e[7];
    const n13 = e[8], n23 = e[9], n33 = e[10], n43 = e[11];
    const n14 = e[12], n24 = e[13], n34 = e[14], n44 = e[15];

    const t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44;
    const t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44;
    const t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44;
    const t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;

    const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;

    if (det === 0) {
      console.warn('Matrix4: Cannot invert matrix, determinant is 0');
      return this.identity();
    }

    const detInv = 1 / det;

    e[0] = t11 * detInv;
    e[1] = (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * detInv;
    e[2] = (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * detInv;
    e[3] = (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * detInv;

    e[4] = t12 * detInv;
    e[5] = (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * detInv;
    e[6] = (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * detInv;
    e[7] = (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * detInv;

    e[8] = t13 * detInv;
    e[9] = (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * detInv;
    e[10] = (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * detInv;
    e[11] = (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * detInv;

    e[12] = t14 * detInv;
    e[13] = (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * detInv;
    e[14] = (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * detInv;
    e[15] = (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * detInv;

    return this;
  }

  compose(position, quaternion, scale) {
    const e = this.elements;

    const x = quaternion.x, y = quaternion.y, z = quaternion.z, w = quaternion.w;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    const sx = scale.x, sy = scale.y, sz = scale.z;

    e[0] = (1 - (yy + zz)) * sx;
    e[1] = (xy + wz) * sx;
    e[2] = (xz - wy) * sx;
    e[3] = 0;

    e[4] = (xy - wz) * sy;
    e[5] = (1 - (xx + zz)) * sy;
    e[6] = (yz + wx) * sy;
    e[7] = 0;

    e[8] = (xz + wy) * sz;
    e[9] = (yz - wx) * sz;
    e[10] = (1 - (xx + yy)) * sz;
    e[11] = 0;

    e[12] = position.x;
    e[13] = position.y;
    e[14] = position.z;
    e[15] = 1;

    return this;
  }

  decompose(position, quaternion, scale) {
    const e = this.elements;

    let sx = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
    const sy = Math.sqrt(e[4] * e[4] + e[5] * e[5] + e[6] * e[6]);
    const sz = Math.sqrt(e[8] * e[8] + e[9] * e[9] + e[10] * e[10]);

    // if determinant is negative, we need to invert one scale
    const det = this.determinant();
    if (det < 0) sx = -sx;

    position.x = e[12];
    position.y = e[13];
    position.z = e[14];

    // scale the rotation part
    const matrix = new Matrix4().copy(this);

    const invSX = 1 / sx;
    const invSY = 1 / sy;
    const invSZ = 1 / sz;

    matrix.elements[0] *= invSX;
    matrix.elements[1] *= invSX;
    matrix.elements[2] *= invSX;

    matrix.elements[4] *= invSY;
    matrix.elements[5] *= invSY;
    matrix.elements[6] *= invSY;

    matrix.elements[8] *= invSZ;
    matrix.elements[9] *= invSZ;
    matrix.elements[10] *= invSZ;

    quaternion.setFromRotationMatrix(matrix);

    scale.x = sx;
    scale.y = sy;
    scale.z = sz;

    return this;
  }

  makeTranslation(x, y, z) {
    this.set(
      1, 0, 0, x,
      0, 1, 0, y,
      0, 0, 1, z,
      0, 0, 0, 1
    );
    return this;
  }

  makeRotationX(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);

    this.set(
      1, 0, 0, 0,
      0, c, -s, 0,
      0, s, c, 0,
      0, 0, 0, 1
    );

    return this;
  }

  makeRotationY(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);

    this.set(
      c, 0, s, 0,
      0, 1, 0, 0,
      -s, 0, c, 0,
      0, 0, 0, 1
    );

    return this;
  }

  makeRotationZ(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);

    this.set(
      c, -s, 0, 0,
      s, c, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    );

    return this;
  }

  makeScale(x, y, z) {
    this.set(
      x, 0, 0, 0,
      0, y, 0, 0,
      0, 0, z, 0,
      0, 0, 0, 1
    );
    return this;
  }

  makePerspective(left, right, top, bottom, near, far) {
    const e = this.elements;
    const x = 2 * near / (right - left);
    const y = 2 * near / (top - bottom);

    const a = (right + left) / (right - left);
    const b = (top + bottom) / (top - bottom);
    const c = -(far + near) / (far - near);
    const d = -2 * far * near / (far - near);

    e[0] = x; e[4] = 0; e[8] = a; e[12] = 0;
    e[1] = 0; e[5] = y; e[9] = b; e[13] = 0;
    e[2] = 0; e[6] = 0; e[10] = c; e[14] = d;
    e[3] = 0; e[7] = 0; e[11] = -1; e[15] = 0;

    return this;
  }

  makePerspectiveWebGPU(left, right, top, bottom, near, far) {
    // WebGPU uses 0 to 1 clip space for Z (unlike OpenGL's -1 to 1)
    const e = this.elements;
    const x = 2 * near / (right - left);
    const y = 2 * near / (top - bottom);

    const a = (right + left) / (right - left);
    const b = (top + bottom) / (top - bottom);
    const c = -far / (far - near);  // WebGPU: 0 to 1 Z range
    const d = -far * near / (far - near);  // WebGPU: 0 to 1 Z range

    e[0] = x; e[4] = 0; e[8] = a; e[12] = 0;
    e[1] = 0; e[5] = y; e[9] = b; e[13] = 0;
    e[2] = 0; e[6] = 0; e[10] = c; e[14] = d;
    e[3] = 0; e[7] = 0; e[11] = -1; e[15] = 0;

    return this;
  }

  makeOrthographic(left, right, top, bottom, near, far) {
    const e = this.elements;
    const w = 1.0 / (right - left);
    const h = 1.0 / (top - bottom);
    const p = 1.0 / (far - near);

    const x = (right + left) * w;
    const y = (top + bottom) * h;
    const z = (far + near) * p;

    e[0] = 2 * w; e[4] = 0; e[8] = 0; e[12] = -x;
    e[1] = 0; e[5] = 2 * h; e[9] = 0; e[13] = -y;
    e[2] = 0; e[6] = 0; e[10] = -2 * p; e[14] = -z;
    e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;

    return this;
  }

  makeOrthographicWebGPU(left, right, top, bottom, near, far) {
    // WebGPU uses 0 to 1 clip space for Z (unlike OpenGL's -1 to 1)
    const e = this.elements;
    const w = 1.0 / (right - left);
    const h = 1.0 / (top - bottom);
    const p = 1.0 / (far - near);

    const x = (right + left) * w;
    const y = (top + bottom) * h;
    const z = near * p;  // WebGPU: 0 to 1 Z range

    e[0] = 2 * w; e[4] = 0; e[8] = 0; e[12] = -x;
    e[1] = 0; e[5] = 2 * h; e[9] = 0; e[13] = -y;
    e[2] = 0; e[6] = 0; e[10] = -p; e[14] = -z;  // WebGPU: 0 to 1 Z range
    e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;

    return this;
  }

  lookAt(eye, target, up) {
    const e = this.elements;

    const z = new (Vector3)(eye.x - target.x, eye.y - target.y, eye.z - target.z);
    
    if (z.lengthSq() === 0) {
      z.z = 1;
    }

    z.normalize();
    const x = new (Vector3)().crossVectors(up, z);

    if (x.lengthSq() === 0) {
      if (Math.abs(up.z) === 1) {
        z.x += 0.0001;
      } else {
        z.z += 0.0001;
      }
      z.normalize();
      x.crossVectors(up, z);
    }

    x.normalize();
    const y = new (Vector3)().crossVectors(z, x);

    e[0] = x.x; e[4] = y.x; e[8] = z.x;
    e[1] = x.y; e[5] = y.y; e[9] = z.y;
    e[2] = x.z; e[6] = y.z; e[10] = z.z;

    return this;
  }

  extractPosition(m) {
    const e = this.elements;
    const me = m.elements;

    e[12] = me[12];
    e[13] = me[13];
    e[14] = me[14];

    return this;
  }

  extractRotation(m) {
    const e = this.elements;
    const me = m.elements;

    const scaleX = 1 / Math.sqrt(me[0] * me[0] + me[1] * me[1] + me[2] * me[2]);
    const scaleY = 1 / Math.sqrt(me[4] * me[4] + me[5] * me[5] + me[6] * me[6]);
    const scaleZ = 1 / Math.sqrt(me[8] * me[8] + me[9] * me[9] + me[10] * me[10]);

    e[0] = me[0] * scaleX;
    e[1] = me[1] * scaleX;
    e[2] = me[2] * scaleX;

    e[4] = me[4] * scaleY;
    e[5] = me[5] * scaleY;
    e[6] = me[6] * scaleY;

    e[8] = me[8] * scaleZ;
    e[9] = me[9] * scaleZ;
    e[10] = me[10] * scaleZ;

    return this;
  }

  fromArray(array, offset = 0) {
    for (let i = 0; i < 16; i++) {
      this.elements[i] = array[i + offset];
    }
    return this;
  }

  toArray(array = [], offset = 0) {
    const e = this.elements;

    for (let i = 0; i < 16; i++) {
      array[offset + i] = e[i];
    }

    return array;
  }
}

// Need to import Vector3 for lookAt
import { Vector3 } from './Vector3.js';
