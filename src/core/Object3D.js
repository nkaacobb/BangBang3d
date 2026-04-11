import { Matrix4 } from '../math/Matrix4.js';
import { Quaternion } from '../math/Quaternion.js';
import { Vector3 } from '../math/Vector3.js';
import { Euler } from '../math/Euler.js';
import { MathUtils } from '../math/MathUtils.js';

/**
 * Object3D - Base class for all 3D objects in the scene graph
 * Handles hierarchical transforms and matrix propagation
 */
export class Object3D {
  constructor() {
    this.uuid = MathUtils.generateUUID();
    this.name = '';
    this.type = 'Object3D';

    this.parent = null;
    this.children = [];

    // Local transform
    this.position = new Vector3();
    this.rotation = new Euler();
    this.quaternion = new Quaternion();
    this.scale = new Vector3(1, 1, 1);

    // Matrices
    this.matrix = new Matrix4();
    this.matrixWorld = new Matrix4();

    this.matrixAutoUpdate = true;
    this.matrixWorldNeedsUpdate = false;

    // Visibility and layer control
    this.visible = true;
    this.frustumCulled = true;

    // User data - arbitrary storage for application-specific data
    this.userData = {};

    // Link rotation and quaternion
    this._onRotationChange = () => {
      this.quaternion.setFromEuler(this.rotation);
    };

    this._onQuaternionChange = () => {
      this.rotation.setFromQuaternion(this.quaternion);
    };

    this.rotation._onChange = this._onRotationChange;
    this.quaternion._onChange = this._onQuaternionChange;
  }

  /**
   * Update local matrix from position, rotation, scale
   */
  updateMatrix() {
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.matrixWorldNeedsUpdate = true;
  }

  /**
   * Update world matrix - propagates transforms down the hierarchy
   */
  updateMatrixWorld(force = false) {
    if (this.matrixAutoUpdate) this.updateMatrix();

    if (this.matrixWorldNeedsUpdate || force) {
      if (this.parent === null) {
        this.matrixWorld.copy(this.matrix);
      } else {
        this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
      }

      this.matrixWorldNeedsUpdate = false;
      force = true;
    }

    // Update children
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) {
      children[i].updateMatrixWorld(force);
    }
  }

  /**
   * Add a child object
   */
  add(object) {
    if (arguments.length > 1) {
      for (let i = 0; i < arguments.length; i++) {
        this.add(arguments[i]);
      }
      return this;
    }

    if (object === this) {
      console.error('Object3D.add: object can\'t be added as a child of itself.', object);
      return this;
    }

    if (object.parent !== null) {
      object.parent.remove(object);
    }

    object.parent = this;
    this.children.push(object);

    return this;
  }

  /**
   * Remove a child object
   */
  remove(object) {
    if (arguments.length > 1) {
      for (let i = 0; i < arguments.length; i++) {
        this.remove(arguments[i]);
      }
      return this;
    }

    const index = this.children.indexOf(object);

    if (index !== -1) {
      object.parent = null;
      this.children.splice(index, 1);
    }

    return this;
  }

  /**
   * Get world position
   */
  getWorldPosition(target = new Vector3()) {
    this.updateMatrixWorld(true);

    return target.setFromMatrixPosition(this.matrixWorld);
  }

  /**
   * Get world direction (forward vector)
   */
  getWorldDirection(target = new Vector3()) {
    this.updateMatrixWorld(true);

    const e = this.matrixWorld.elements;

    return target.set(e[8], e[9], e[10]).normalize();
  }

  /**
   * Traverse the scene graph
   */
  traverse(callback) {
    callback(this);

    const children = this.children;

    for (let i = 0, l = children.length; i < l; i++) {
      children[i].traverse(callback);
    }
  }

  /**
   * Traverse visible objects only
   */
  traverseVisible(callback) {
    if (this.visible === false) return;

    callback(this);

    const children = this.children;

    for (let i = 0, l = children.length; i < l; i++) {
      children[i].traverseVisible(callback);
    }
  }

  /**
   * Look at a target position
   */
  lookAt(x, y, z) {
    const target = new Vector3();

    if (x.isVector3) {
      target.copy(x);
    } else {
      target.set(x, y, z);
    }

    const parent = this.parent;

    this.updateMatrixWorld(true);

    const position = new Vector3();
    position.setFromMatrixPosition(this.matrixWorld);

    const m1 = new Matrix4();

    if (this.isCamera || this.isLight) {
      m1.lookAt(position, target, this.up);
    } else {
      m1.lookAt(target, position, this.up);
    }

    this.quaternion.setFromRotationMatrix(m1);

    if (parent) {
      m1.extractRotation(parent.matrixWorld);
      const q1 = new Quaternion();
      q1.setFromRotationMatrix(m1);
      this.quaternion.premultiply(q1.invert());
    }
  }

  /**
   * Clone this object
   */
  clone(recursive = true) {
    return new this.constructor().copy(this, recursive);
  }

  /**
   * Copy properties from another object
   */
  copy(source, recursive = true) {
    this.name = source.name;

    this.position.copy(source.position);
    this.rotation.copy(source.rotation);
    this.quaternion.copy(source.quaternion);
    this.scale.copy(source.scale);

    this.matrix.copy(source.matrix);
    this.matrixWorld.copy(source.matrixWorld);

    this.matrixAutoUpdate = source.matrixAutoUpdate;
    this.matrixWorldNeedsUpdate = source.matrixWorldNeedsUpdate;

    this.visible = source.visible;
    this.frustumCulled = source.frustumCulled;

    // Deep copy userData
    this.userData = JSON.parse(JSON.stringify(source.userData));

    if (recursive === true) {
      for (let i = 0; i < source.children.length; i++) {
        const child = source.children[i];
        this.add(child.clone());
      }
    }

    return this;
  }
}

// Helper methods for Vector3
Vector3.prototype.setFromMatrixPosition = function(m) {
  const e = m.elements;
  this.x = e[12];
  this.y = e[13];
  this.z = e[14];
  return this;
};

// Helper methods for Quaternion
Quaternion.prototype.invert = function() {
  return this.conjugate();
};

Quaternion.prototype.conjugate = function() {
  this.x *= -1;
  this.y *= -1;
  this.z *= -1;
  return this;
};

Quaternion.prototype.premultiply = function(q) {
  return this.multiplyQuaternions(q, this);
};

// Helper for Matrix4
Matrix4.prototype.makeRotationFromQuaternion = function(q) {
  return this.compose(new Vector3(), q, new Vector3(1, 1, 1));
};
