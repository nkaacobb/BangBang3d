import { Color } from '../math/Color.js';

/**
 * Material - Base class for all materials
 */
export class Material {
  constructor() {
    this.type = 'Material';
    this.isMaterial = true;

    this.name = '';
    this.visible = true;
    this.side = 'FrontSide'; // FrontSide, BackSide, DoubleSide
    
    this.transparent = false;
    this.opacity = 1.0;

    this.depthTest = true;
    this.depthWrite = true;
    this.wireframe = false;
    this.flatShading = false;

    this.needsUpdate = false;
  }

  copy(source) {
    this.name = source.name;
    this.visible = source.visible;
    this.side = source.side;
    this.transparent = source.transparent;
    this.opacity = source.opacity;
    this.depthTest = source.depthTest;
    this.depthWrite = source.depthWrite;
    this.wireframe = source.wireframe;
    this.flatShading = source.flatShading;

    return this;
  }

  clone() {
    return new this.constructor().copy(this);
  }

  /**
   * Get render state for this material based on renderer capabilities.
   * Returns a material (possibly a fallback) suitable for the current backend.
   * @param {Object} capabilities - Renderer capabilities object
   * @returns {Material} The material to use for rendering (may be a fallback)
   */
  getRenderState(capabilities) {
    // Base implementation returns self - derived classes may return fallback materials
    return this;
  }

  /**
   * Get the shader variant key for this material given the backend and lighting state.
   * @param {string} rendererBackend - 'webgpu', 'webgl2', or 'cpu'
   * @param {boolean} lightingEnabled - Whether lighting is active in the scene
   * @returns {string} Shader variant identifier (e.g., 'BasicMaterial', 'LambertMaterial')
   */
  getShaderVariant(rendererBackend, lightingEnabled) {
    return this.type;
  }

  /**
   * Get a bundle of uniform values for this material, suitable for passing to shaders.
   * @returns {Object} Key-value pairs of uniform names and values
   */
  getUniformBundle() {
    return {
      color: this.color ? { r: this.color.r, g: this.color.g, b: this.color.b } : { r: 1, g: 1, b: 1 },
      opacity: this.opacity,
      hasTexture: false,
      wireframe: this.wireframe
    };
  }

  /**
   * Export material to JSON
   */
  toJSON() {
    return {
      type: this.type,
      name: this.name,
      visible: this.visible,
      side: this.side,
      transparent: this.transparent,
      opacity: this.opacity,
      depthTest: this.depthTest,
      depthWrite: this.depthWrite,
      wireframe: this.wireframe,
      flatShading: this.flatShading
    };
  }

  /**
   * Create material from JSON
   * @param {Object} json - JSON descriptor
   * @param {Object} textureResolver - Optional texture resolver { resolveTexture(jsonDesc) }
   */
  static fromJSON(json, textureResolver = null) {
    // This will be overridden by derived classes
    const material = new Material();
    material.name = json.name || '';
    material.visible = json.visible !== undefined ? json.visible : true;
    material.side = json.side || 'FrontSide';
    material.transparent = json.transparent || false;
    material.opacity = json.opacity !== undefined ? json.opacity : 1.0;
    material.depthTest = json.depthTest !== undefined ? json.depthTest : true;
    material.depthWrite = json.depthWrite !== undefined ? json.depthWrite : true;
    material.wireframe = json.wireframe || false;
    material.flatShading = json.flatShading === true;
    return material;
  }

  dispose() {
    this.dispatchEvent({ type: 'dispose' });
  }
}
