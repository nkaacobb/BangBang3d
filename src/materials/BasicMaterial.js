import { Material } from './Material.js';
import { Color } from '../math/Color.js';

/**
 * BasicMaterial - Simple unlit material with flat color or vertex colors
 */
export class BasicMaterial extends Material {
  constructor(parameters = {}) {
    super();

    this.type = 'BasicMaterial';
    this.isBasicMaterial = true;

    this.color = new Color(1, 1, 1);
    this.map = null; // Texture (TODO: Milestone D)
    this.vertexColors = false;

    this.setValues(parameters);
  }

  setValues(parameters) {
    if (parameters === undefined) return;

    for (const key in parameters) {
      const newValue = parameters[key];

      if (newValue === undefined) {
        console.warn(`BasicMaterial: '${key}' parameter is undefined.`);
        continue;
      }

      if (key === 'color') {
        if (typeof newValue === 'number') {
          this.color.setHex(newValue);
        } else {
          this.color.copy(newValue);
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
    this.vertexColors = source.vertexColors;

    return this;
  }

  /**
   * Get uniform bundle for shader binding
   * @returns {Object} Uniform values for BasicMaterial
   */
  getUniformBundle() {
    return {
      color: { r: this.color.r, g: this.color.g, b: this.color.b },
      opacity: this.opacity,
      hasTexture: this.map !== null,
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
    return 'BasicMaterial';
  }

  /**
   * Export material to JSON
   */
  toJSON() {
    const json = super.toJSON();
    json.color = this.color.getHex();
    json.vertexColors = this.vertexColors;
    
    // Include texture reference if present
    if (this.map) {
      json.map = this.map.toJSON();
    }
    
    return json;
  }

  /**
   * Create BasicMaterial from JSON
   * @param {Object} json - JSON descriptor
   * @param {Object} textureResolver - Optional texture resolver { resolveTexture(jsonDesc) }
   */
  static fromJSON(json, textureResolver = null) {
    const material = new BasicMaterial();
    
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
    material.vertexColors = json.vertexColors || false;
    
    // Resolve texture if present
    if (json.map && textureResolver) {
      material.map = textureResolver.resolveTexture(json.map);
    }
    
    return material;
  }
}
