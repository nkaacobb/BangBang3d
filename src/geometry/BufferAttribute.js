/**
 * BufferAttribute - Typed array attribute for geometry data
 */
export class BufferAttribute {
  constructor(array, itemSize, normalized = false) {
    this.array = array;
    this.itemSize = itemSize;
    this.count = array.length / itemSize;
    this.normalized = normalized;

    this.usage = 'StaticDrawUsage';
    this.updateRange = { offset: 0, count: -1 };

    this.version = 0;
  }

  get needsUpdate() {
    return true;
  }

  set needsUpdate(value) {
    if (value === true) this.version++;
  }

  setUsage(usage) {
    this.usage = usage;
    return this;
  }

  copy(source) {
    this.array = new source.array.constructor(source.array);
    this.itemSize = source.itemSize;
    this.count = source.count;
    this.normalized = source.normalized;

    this.usage = source.usage;

    return this;
  }

  copyAt(index1, attribute, index2) {
    index1 *= this.itemSize;
    index2 *= attribute.itemSize;

    for (let i = 0, l = this.itemSize; i < l; i++) {
      this.array[index1 + i] = attribute.array[index2 + i];
    }

    return this;
  }

  set(value, offset = 0) {
    this.array.set(value, offset);
    return this;
  }

  getX(index) {
    return this.array[index * this.itemSize];
  }

  setX(index, x) {
    this.array[index * this.itemSize] = x;
    return this;
  }

  getY(index) {
    return this.array[index * this.itemSize + 1];
  }

  setY(index, y) {
    this.array[index * this.itemSize + 1] = y;
    return this;
  }

  getZ(index) {
    return this.array[index * this.itemSize + 2];
  }

  setZ(index, z) {
    this.array[index * this.itemSize + 2] = z;
    return this;
  }

  getW(index) {
    return this.array[index * this.itemSize + 3];
  }

  setW(index, w) {
    this.array[index * this.itemSize + 3] = w;
    return this;
  }

  setXY(index, x, y) {
    index *= this.itemSize;
    this.array[index + 0] = x;
    this.array[index + 1] = y;
    return this;
  }

  setXYZ(index, x, y, z) {
    index *= this.itemSize;
    this.array[index + 0] = x;
    this.array[index + 1] = y;
    this.array[index + 2] = z;
    return this;
  }

  setXYZW(index, x, y, z, w) {
    index *= this.itemSize;
    this.array[index + 0] = x;
    this.array[index + 1] = y;
    this.array[index + 2] = z;
    this.array[index + 3] = w;
    return this;
  }

  clone() {
    return new this.constructor(this.array, this.itemSize).copy(this);
  }

  toJSON() {
    return {
      itemSize: this.itemSize,
      type: this.array.constructor.name,
      array: Array.from(this.array),
      normalized: this.normalized
    };
  }
}
