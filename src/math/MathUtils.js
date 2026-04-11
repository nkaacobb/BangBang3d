/**
 * MathUtils - Common mathematical utilities
 */
export const MathUtils = {
  DEG2RAD: Math.PI / 180,
  RAD2DEG: 180 / Math.PI,

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },

  lerp(a, b, t) {
    return a + (b - a) * t;
  },

  degToRad(degrees) {
    return degrees * MathUtils.DEG2RAD;
  },

  radToDeg(radians) {
    return radians * MathUtils.RAD2DEG;
  },

  isPowerOfTwo(value) {
    return (value & (value - 1)) === 0 && value !== 0;
  },

  smoothstep(x, min, max) {
    if (x <= min) return 0;
    if (x >= max) return 1;
    x = (x - min) / (max - min);
    return x * x * (3 - 2 * x);
  },

  randFloat(low, high) {
    return low + Math.random() * (high - low);
  },

  randInt(low, high) {
    return Math.floor(low + Math.random() * (high - low + 1));
  },

  generateUUID() {
    // Simple UUID for object tracking
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
};
