/**
 * Color - RGB color representation with common operations
 */
export class Color {
  constructor(r = 1, g = 1, b = 1) {
    this.r = r;
    this.g = g;
    this.b = b;
  }

  set(r, g, b) {
    this.r = r;
    this.g = g;
    this.b = b;
    return this;
  }

  setRGB(r, g, b) {
    return this.set(r, g, b);
  }

  setHex(hex) {
    hex = Math.floor(hex);

    this.r = ((hex >> 16) & 255) / 255;
    this.g = ((hex >> 8) & 255) / 255;
    this.b = (hex & 255) / 255;

    return this;
  }

  getHex() {
    return (Math.floor(this.r * 255) << 16) ^ (Math.floor(this.g * 255) << 8) ^ (Math.floor(this.b * 255) << 0);
  }

  getHexString() {
    const hex = this.getHex();
    return ('000000' + hex.toString(16)).slice(-6);
  }

  copy(color) {
    this.r = color.r;
    this.g = color.g;
    this.b = color.b;
    return this;
  }

  clone() {
    return new Color(this.r, this.g, this.b);
  }

  add(color) {
    this.r += color.r;
    this.g += color.g;
    this.b += color.b;
    return this;
  }

  addColors(color1, color2) {
    this.r = color1.r + color2.r;
    this.g = color1.g + color2.g;
    this.b = color1.b + color2.b;
    return this;
  }

  addScalar(s) {
    this.r += s;
    this.g += s;
    this.b += s;
    return this;
  }

  multiply(color) {
    this.r *= color.r;
    this.g *= color.g;
    this.b *= color.b;
    return this;
  }

  multiplyScalar(s) {
    this.r *= s;
    this.g *= s;
    this.b *= s;
    return this;
  }

  lerp(color, alpha) {
    this.r += (color.r - this.r) * alpha;
    this.g += (color.g - this.g) * alpha;
    this.b += (color.b - this.b) * alpha;
    return this;
  }

  equals(c) {
    return (c.r === this.r) && (c.g === this.g) && (c.b === this.b);
  }

  fromArray(array, offset = 0) {
    this.r = array[offset];
    this.g = array[offset + 1];
    this.b = array[offset + 2];
    return this;
  }

  toArray(array = [], offset = 0) {
    array[offset] = this.r;
    array[offset + 1] = this.g;
    array[offset + 2] = this.b;
    return array;
  }
}
