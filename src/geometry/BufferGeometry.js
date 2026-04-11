import { MathUtils } from '../math/MathUtils.js';

/**
 * BufferGeometry - Geometry defined by buffer attributes
 * Core geometry class for the engine
 */
export class BufferGeometry {
  constructor() {
    this.uuid = MathUtils.generateUUID();
    this.name = '';
    this.type = 'BufferGeometry';

    this.index = null;
    this.attributes = {};

    // Bounding volumes (computed lazily)
    this.boundingBox = null;
    this.boundingSphere = null;

    // Draw range
    this.drawRange = { start: 0, count: Infinity };

    // Groups for multi-material
    this.groups = [];
  }

  setIndex(index) {
    if (Array.isArray(index)) {
      this.index = new BufferAttribute(new Uint16Array(index), 1);
    } else {
      this.index = index;
    }
    return this;
  }

  setAttribute(name, attribute) {
    this.attributes[name] = attribute;
    return this;
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  deleteAttribute(name) {
    delete this.attributes[name];
    return this;
  }

  hasAttribute(name) {
    return this.attributes[name] !== undefined;
  }

  addGroup(start, count, materialIndex = 0) {
    this.groups.push({
      start: start,
      count: count,
      materialIndex: materialIndex
    });
  }

  clearGroups() {
    this.groups = [];
  }

  setDrawRange(start, count) {
    this.drawRange.start = start;
    this.drawRange.count = count;
  }

  computeBoundingBox() {
    // TODO: Implement bounding box computation
    // For now, leave as null
  }

  computeBoundingSphere() {
    // TODO: Implement bounding sphere computation
    // For now, leave as null
  }

  /**
   * Compute vertex normals from positions
   */
  computeVertexNormals() {
    const index = this.index;
    const positionAttribute = this.getAttribute('position');

    if (positionAttribute === undefined) {
      console.error('BufferGeometry.computeVertexNormals(): Geometry must have position attribute');
      return;
    }

    let normalAttribute = this.getAttribute('normal');

    if (normalAttribute === undefined) {
      normalAttribute = new BufferAttribute(new Float32Array(positionAttribute.count * 3), 3);
      this.setAttribute('normal', normalAttribute);
    } else {
      // Reset existing normals to zero
      for (let i = 0, il = normalAttribute.count; i < il; i++) {
        normalAttribute.setXYZ(i, 0, 0, 0);
      }
    }

    const pA = new Vector3(), pB = new Vector3(), pC = new Vector3();
    const nA = new Vector3(), nB = new Vector3(), nC = new Vector3();
    const cb = new Vector3(), ab = new Vector3();

    // indexed geometry
    if (index) {
      for (let i = 0, il = index.count; i < il; i += 3) {
        const vA = index.getX(i + 0);
        const vB = index.getX(i + 1);
        const vC = index.getX(i + 2);

        pA.fromArray(positionAttribute.array, vA * 3);
        pB.fromArray(positionAttribute.array, vB * 3);
        pC.fromArray(positionAttribute.array, vC * 3);

        cb.subVectors(pC, pB);
        ab.subVectors(pA, pB);
        cb.cross(ab);

        nA.fromArray(normalAttribute.array, vA * 3);
        nB.fromArray(normalAttribute.array, vB * 3);
        nC.fromArray(normalAttribute.array, vC * 3);

        nA.add(cb);
        nB.add(cb);
        nC.add(cb);

        normalAttribute.setXYZ(vA, nA.x, nA.y, nA.z);
        normalAttribute.setXYZ(vB, nB.x, nB.y, nB.z);
        normalAttribute.setXYZ(vC, nC.x, nC.y, nC.z);
      }
    } else {
      // non-indexed geometry
      for (let i = 0, il = positionAttribute.count; i < il; i += 3) {
        pA.fromArray(positionAttribute.array, (i + 0) * 3);
        pB.fromArray(positionAttribute.array, (i + 1) * 3);
        pC.fromArray(positionAttribute.array, (i + 2) * 3);

        cb.subVectors(pC, pB);
        ab.subVectors(pA, pB);
        cb.cross(ab);

        normalAttribute.setXYZ(i + 0, cb.x, cb.y, cb.z);
        normalAttribute.setXYZ(i + 1, cb.x, cb.y, cb.z);
        normalAttribute.setXYZ(i + 2, cb.x, cb.y, cb.z);
      }
    }

    this.normalizeNormals();

    normalAttribute.needsUpdate = true;
  }

  normalizeNormals() {
    const normals = this.attributes.normal;

    for (let i = 0, il = normals.count; i < il; i++) {
      const x = normals.getX(i);
      const y = normals.getY(i);
      const z = normals.getZ(i);

      const len = Math.sqrt(x * x + y * y + z * z);

      if (len > 0) {
        normals.setXYZ(i, x / len, y / len, z / len);
      }
    }
  }

  copy(source) {
    this.name = source.name;

    // Copy index
    if (source.index !== null) {
      this.index = source.index.clone();
    }

    // Copy attributes
    const attributes = source.attributes;

    for (const name in attributes) {
      const attribute = attributes[name];
      this.setAttribute(name, attribute.clone());
    }

    // Copy groups
    const groups = source.groups;

    for (let i = 0, l = groups.length; i < l; i++) {
      const group = groups[i];
      this.addGroup(group.start, group.count, group.materialIndex);
    }

    // Copy draw range
    this.drawRange.start = source.drawRange.start;
    this.drawRange.count = source.drawRange.count;

    return this;
  }

  clone() {
    return new this.constructor().copy(this);
  }

  dispose() {
    // Notify renderer that this geometry should be cleaned up
    if (this.dispatchEvent) {
      this.dispatchEvent({ type: 'dispose' });
    }
  }
}

// Import for computeVertexNormals
import { Vector3 } from '../math/Vector3.js';
import { BufferAttribute } from './BufferAttribute.js';
