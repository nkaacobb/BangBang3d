import { Material } from './Material.js';
import { Color } from '../math/Color.js';

/**
 * DebugMaterial - Visualization material for debugging
 * Supports multiple modes: normals, depth, UVs
 */
export class DebugMaterial extends Material {
  constructor(parameters = {}) {
    super();
    
    this.type = 'DebugMaterial';
    
    // Debug visualization mode
    this.mode = 'normals'; // 'normals', 'depth', 'uvs', 'worldPosition', 'wireframe'
    
    // Depth visualization range
    this.depthNear = 1.0;
    this.depthFar = 100.0;
    
    // UV visualization options
    this.uvScale = 1.0;
    
    // Temporary color for calculations
    this._tempColor = new Color();
    
    this.setValues(parameters);
  }
  
  /**
   * Set material parameters
   */
  setValues(parameters) {
    if (!parameters) return;
    
    for (const key in parameters) {
      const newValue = parameters[key];
      
      if (key === 'mode') {
        this.mode = newValue;
      } else if (key === 'depthNear') {
        this.depthNear = newValue;
      } else if (key === 'depthFar') {
        this.depthFar = newValue;
      } else if (key === 'uvScale') {
        this.uvScale = newValue;
      } else {
        // Let parent handle common properties
        if (key in this) {
          this[key] = newValue;
        }
      }
    }
  }
  
  /**
   * Visualize normals as RGB colors
   * Normal components [-1, 1] mapped to [0, 1]
   */
  visualizeNormal(normal, outColor) {
    outColor.r = (normal.x * 0.5 + 0.5);
    outColor.g = (normal.y * 0.5 + 0.5);
    outColor.b = (normal.z * 0.5 + 0.5);
    return outColor;
  }
  
  /**
   * Visualize depth as grayscale
   * Maps depth range [near, far] to [white, black]
   */
  visualizeDepth(depth, outColor) {
    const normalizedDepth = (depth - this.depthNear) / (this.depthFar - this.depthNear);
    const clamped = Math.max(0, Math.min(1, 1.0 - normalizedDepth)); // closer = brighter
    
    outColor.r = clamped;
    outColor.g = clamped;
    outColor.b = clamped;
    return outColor;
  }
  
  /**
   * Visualize UV coordinates
   * U -> Red, V -> Green
   */
  visualizeUV(uv, outColor) {
    const u = (uv.x * this.uvScale) % 1.0;
    const v = (uv.y * this.uvScale) % 1.0;
    
    outColor.r = Math.abs(u);
    outColor.g = Math.abs(v);
    outColor.b = 0.0;
    return outColor;
  }
  
  /**
   * Visualize world position
   * Maps world coordinates to colors for spatial debugging
   */
  visualizeWorldPosition(position, outColor) {
    // Normalize world position to 0-1 range with arbitrary scale
    const scale = 0.1; // Adjust based on scene scale
    
    outColor.r = (Math.sin(position.x * scale) * 0.5 + 0.5);
    outColor.g = (Math.sin(position.y * scale) * 0.5 + 0.5);
    outColor.b = (Math.sin(position.z * scale) * 0.5 + 0.5);
    return outColor;
  }
  
  /**
   * Get color for debug visualization
   * Called by the renderer pipeline
   */
  getDebugColor(mode, data, outColor) {
    switch (mode) {
      case 'normals':
        return this.visualizeNormal(data.normal, outColor);
      case 'depth':
        return this.visualizeDepth(data.depth, outColor);
      case 'uvs':
        return this.visualizeUV(data.uv, outColor);
      case 'worldPosition':
        return this.visualizeWorldPosition(data.worldPosition, outColor);
      default:
        // Fallback: magenta for unknown mode
        outColor.r = 1.0;
        outColor.g = 0.0;
        outColor.b = 1.0;
        return outColor;
    }
  }
  
  clone() {
    return new DebugMaterial({
      mode: this.mode,
      depthNear: this.depthNear,
      depthFar: this.depthFar,
      uvScale: this.uvScale
    });
  }

  /**
   * Get uniform bundle for shader binding
   * @returns {Object} Uniform values for DebugMaterial
   */
  getUniformBundle() {
    return {
      mode: this.mode,
      depthNear: this.depthNear,
      depthFar: this.depthFar,
      uvScale: this.uvScale,
      opacity: this.opacity,
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
    return 'DebugMaterial';
  }

  /**
   * Export material to JSON
   */
  toJSON() {
    const json = super.toJSON();
    json.mode = this.mode;
    json.depthNear = this.depthNear;
    json.depthFar = this.depthFar;
    json.uvScale = this.uvScale;
    return json;
  }

  /**
   * Create DebugMaterial from JSON
   * @param {Object} json - JSON descriptor
   */
  static fromJSON(json) {
    const material = new DebugMaterial();
    
    // Base properties
    material.name = json.name || '';
    material.visible = json.visible !== undefined ? json.visible : true;
    material.side = json.side || 'FrontSide';
    material.transparent = json.transparent || false;
    material.opacity = json.opacity !== undefined ? json.opacity : 1.0;
    material.depthTest = json.depthTest !== undefined ? json.depthTest : true;
    material.depthWrite = json.depthWrite !== undefined ? json.depthWrite : true;
    
    // Material-specific properties
    material.mode = json.mode || 'normals';
    material.depthNear = json.depthNear !== undefined ? json.depthNear : 1.0;
    material.depthFar = json.depthFar !== undefined ? json.depthFar : 100.0;
    material.uvScale = json.uvScale !== undefined ? json.uvScale : 1.0;
    
    return material;
  }
}
