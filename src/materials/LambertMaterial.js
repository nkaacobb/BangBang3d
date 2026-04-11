import { Material } from './Material.js';
import { Color } from '../math/Color.js';

/**
 * LambertMaterial - Diffuse (Lambertian) shaded material
 * Reacts to lighting in the scene
 */
export class LambertMaterial extends Material {
  constructor(parameters = {}) {
    super();

    this.type = 'LambertMaterial';
    this.isLambertMaterial = true;

    this.color = new Color(1, 1, 1);
    this.map = null; // Texture (TODO: Milestone D)
    this.emissive = new Color(0, 0, 0);
    this.emissiveIntensity = 1.0;

    this.setValues(parameters);
  }

  setValues(parameters) {
    if (parameters === undefined) return;

    for (const key in parameters) {
      const newValue = parameters[key];

      if (newValue === undefined) {
        console.warn(`LambertMaterial: '${key}' parameter is undefined.`);
        continue;
      }

      if (key === 'color') {
        if (typeof newValue === 'number') {
          this.color.setHex(newValue);
        } else {
          this.color.copy(newValue);
        }
      } else if (key === 'emissive') {
        if (typeof newValue === 'number') {
          this.emissive.setHex(newValue);
        } else {
          this.emissive.copy(newValue);
        }
      } else if (key === 'map') {
        this.map = newValue;
      } else if (key in this) {
        this[key] = newValue;
      }
    }
  }

  copy(source) {
    super.copy(source);

    this.color.copy(source.color);
    this.map = source.map;
    this.emissive.copy(source.emissive);
    this.emissiveIntensity = source.emissiveIntensity;

    return this;
  }

  /**
   * Get render state - returns fallback material if backend doesn't support lighting
   * @param {Object} capabilities - Renderer capabilities object
   * @returns {Material} The material to render with (self if lighting supported, otherwise self with warning)
   */
  getRenderState(capabilities) {
    if (!capabilities.supportsLighting) {
      console.warn('[LambertMaterial] Lighting not supported by backend, material will render as unlit');
    }
    return this;
  }

  /**
   * Get uniform bundle for shader binding
   * @returns {Object} Uniform values for LambertMaterial
   */
  getUniformBundle() {
    return {
      color: { r: this.color.r, g: this.color.g, b: this.color.b },
      opacity: this.opacity,
      hasTexture: this.map !== null,
      emissive: { r: this.emissive.r, g: this.emissive.g, b: this.emissive.b },
      emissiveIntensity: this.emissiveIntensity,
      wireframe: this.wireframe
    };
  }

  /**
   * Get shader variant for this material
   * @param {string} rendererBackend - 'webgpu', 'webgl2', or 'cpu'
   * @param {boolean} lightingEnabled - Whether lighting is active
   * @returns {string} Shader variant identifier
   */
  getShaderVariant(rendererBackend, lightingEnabled) {
    return lightingEnabled ? 'LambertMaterial' : 'BasicMaterial';
  }

  /**
   * Export material to JSON
   */
  toJSON() {
    const json = super.toJSON();
    json.color = this.color.getHex();
    json.emissive = this.emissive.getHex();
    json.emissiveIntensity = this.emissiveIntensity;
    
    // Include texture reference if present
    if (this.map) {
      json.map = this.map.toJSON();
    }
    
    return json;
  }

  /**
   * Create LambertMaterial from JSON
   * @param {Object} json - JSON descriptor
   * @param {Object} textureResolver - Optional texture resolver { resolveTexture(jsonDesc) }
   */
  static fromJSON(json, textureResolver = null) {
    const material = new LambertMaterial();
    
    // Base properties
    material.name = json.name || '';
    material.visible = json.visible !== undefined ? json.visible : true;
    material.side = json.side || 'FrontSide';
    material.transparent = json.transparent || false;
    material.opacity = json.opacity !== undefined ? json.opacity : 1.0;
    material.depthTest = json.depthTest !== undefined ? json.depthTest : true;
    material.depthWrite = json.depthWrite !== undefined ? json.depthWrite : true;
    
    // Material-specific properties
    if (json.color !== undefined) {
      material.color.setHex(json.color);
    }
    if (json.emissive !== undefined) {
      material.emissive.setHex(json.emissive);
    }
    material.emissiveIntensity = json.emissiveIntensity !== undefined ? json.emissiveIntensity : 1.0;
    
    // Resolve texture if present
    if (json.map && textureResolver) {
      material.map = textureResolver.resolveTexture(json.map);
    }
    
    return material;
  }
}
