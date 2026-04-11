/**
 * PBRMaterial.js
 * 
 * Physically-Based Rendering material with metallic/roughness workflow.
 * Supports base color, metallic, roughness, normal, AO, and environment maps.
 * 
 * Phase 4: PBR Material Stack
 */

import { Material } from './Material.js';
import { Color } from '../math/Color.js';

export class PBRMaterial extends Material {
    constructor(parameters = {}) {
        super();
        
        this.type = 'PBRMaterial';
        
        // Base color (albedo)
        this.color = parameters.color !== undefined ? parameters.color : new Color(1, 1, 1);
        
        // Base color texture
        this.map = parameters.map !== undefined ? parameters.map : null;
        
        // Metallic value (0 = dielectric, 1 = metal)
        this.metallic = parameters.metallic !== undefined ? parameters.metallic : 0.0;
        
        // Roughness value (0 = smooth, 1 = rough)
        this.roughness = parameters.roughness !== undefined ? parameters.roughness : 0.5;
        
        // Metallic/roughness texture (metallic in B, roughness in G)
        this.metalnessMap = parameters.metalnessMap !== undefined ? parameters.metalnessMap : null;
        this.roughnessMap = parameters.roughnessMap !== undefined ? parameters.roughnessMap : null;
        
        // Normal map (tangent space)
        this.normalMap = parameters.normalMap !== undefined ? parameters.normalMap : null;
        this.normalScale = parameters.normalScale !== undefined ? parameters.normalScale : 1.0;
        
        // Ambient occlusion map
        this.aoMap = parameters.aoMap !== undefined ? parameters.aoMap : null;
        this.aoMapIntensity = parameters.aoMapIntensity !== undefined ? parameters.aoMapIntensity : 1.0;
        
        // Environment map (for reflections and IBL)
        this.envMap = parameters.envMap !== undefined ? parameters.envMap : null;
        this.envMapIntensity = parameters.envMapIntensity !== undefined ? parameters.envMapIntensity : 1.0;
        
        // Emissive properties
        this.emissive = parameters.emissive !== undefined ? parameters.emissive : new Color(0, 0, 0);
        this.emissiveIntensity = parameters.emissiveIntensity !== undefined ? parameters.emissiveIntensity : 1.0;
        this.emissiveMap = parameters.emissiveMap !== undefined ? parameters.emissiveMap : null;
        
        // Transparency
        this.transparent = parameters.transparent !== undefined ? parameters.transparent : false;
        this.opacity = parameters.opacity !== undefined ? parameters.opacity : 1.0;
        this.flatShading = parameters.flatShading !== undefined ? parameters.flatShading : false;
        
        // Advanced properties
        this.clearcoat = parameters.clearcoat !== undefined ? parameters.clearcoat : 0.0;
        this.clearcoatRoughness = parameters.clearcoatRoughness !== undefined ? parameters.clearcoatRoughness : 0.0;
        
        // Sheen (for cloth-like materials)
        this.sheen = parameters.sheen !== undefined ? parameters.sheen : 0.0;
        this.sheenRoughness = parameters.sheenRoughness !== undefined ? parameters.sheenRoughness : 1.0;
        this.sheenColor = parameters.sheenColor !== undefined ? parameters.sheenColor : new Color(1, 1, 1);
        
        // Defines (for shader variants)
        this.defines = {};
        this._updateDefines();
    }
    
    /**
     * Update shader defines based on material properties
     */
    _updateDefines() {
        this.defines = {};
        
        if (this.map) this.defines.USE_MAP = '';
        if (this.normalMap) this.defines.USE_NORMALMAP = '';
        if (this.aoMap) this.defines.USE_AOMAP = '';
        if (this.metalnessMap) this.defines.USE_METALNESSMAP = '';
        if (this.roughnessMap) this.defines.USE_ROUGHNESSMAP = '';
        if (this.envMap) this.defines.USE_ENVMAP = '';
        if (this.emissiveMap) this.defines.USE_EMISSIVEMAP = '';
        
        this.needsUpdate = true;
    }
    
    /**
     * Set base color texture
     */
    setMap(texture) {
        this.map = texture;
        this._updateDefines();
    }
    
    /**
     * Set normal map
     */
    setNormalMap(texture, scale = 1.0) {
        this.normalMap = texture;
        this.normalScale = scale;
        this._updateDefines();
    }
    
    /**
     * Set metalness map
     */
    setMetalnessMap(texture) {
        this.metalnessMap = texture;
        this._updateDefines();
    }
    
    /**
     * Set roughness map
     */
    setRoughnessMap(texture) {
        this.roughnessMap = texture;
        this._updateDefines();
    }
    
    /**
     * Set ambient occlusion map
     */
    setAOMap(texture, intensity = 1.0) {
        this.aoMap = texture;
        this.aoMapIntensity = intensity;
        this._updateDefines();
    }
    
    /**
     * Set environment map
     */
    setEnvMap(texture, intensity = 1.0) {
        this.envMap = texture;
        this.envMapIntensity = intensity;
        this._updateDefines();
    }
    
    /**
     * Copy properties from another PBR material
     */
    copy(source) {
        super.copy(source);
        
        this.color.copy(source.color);
        this.map = source.map;
        
        this.metallic = source.metallic;
        this.roughness = source.roughness;
        this.metalnessMap = source.metalnessMap;
        this.roughnessMap = source.roughnessMap;
        
        this.normalMap = source.normalMap;
        this.normalScale = source.normalScale;
        
        this.aoMap = source.aoMap;
        this.aoMapIntensity = source.aoMapIntensity;
        
        this.envMap = source.envMap;
        this.envMapIntensity = source.envMapIntensity;
        
        this.emissive.copy(source.emissive);
        this.emissiveIntensity = source.emissiveIntensity;
        this.emissiveMap = source.emissiveMap;
        
        this.transparent = source.transparent;
        this.opacity = source.opacity;
        
        this.clearcoat = source.clearcoat;
        this.clearcoatRoughness = source.clearcoatRoughness;
        
        this.sheen = source.sheen;
        this.sheenRoughness = source.sheenRoughness;
        this.sheenColor.copy(source.sheenColor);
        
        this._updateDefines();
        
        return this;
    }

  /**
   * Get render state - PBR requires lighting support
   * @param {Object} capabilities - Renderer capabilities object
   * @returns {Material} The material to render with
   */
  getRenderState(capabilities) {
    if (!capabilities.supportsLighting) {
      console.warn('[PBRMaterial] Lighting not supported by backend, PBR will render as unlit');
    }
    return this;
  }

  /**
   * Get uniform bundle for shader binding
   * @returns {Object} Uniform values for PBRMaterial
   */
  getUniformBundle() {
    return {
      color: { r: this.color.r, g: this.color.g, b: this.color.b },
      metallic: this.metallic,
      roughness: this.roughness,
      opacity: this.opacity,
      hasTexture: this.map !== null,
      emissive: { r: this.emissive.r, g: this.emissive.g, b: this.emissive.b },
      emissiveIntensity: this.emissiveIntensity,
      normalScale: this.normalScale,
      aoMapIntensity: this.aoMapIntensity,
      envMapIntensity: this.envMapIntensity,
      clearcoat: this.clearcoat,
      clearcoatRoughness: this.clearcoatRoughness,
      sheen: this.sheen,
      sheenRoughness: this.sheenRoughness,
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
    return 'PBRMaterial';
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    const data = super.toJSON();
    
    data.color = this.color.getHex();
    data.metallic = this.metallic;
    data.roughness = this.roughness;
    data.normalScale = this.normalScale;
    data.aoMapIntensity = this.aoMapIntensity;
    data.envMapIntensity = this.envMapIntensity;
    data.emissive = this.emissive.getHex();
    data.emissiveIntensity = this.emissiveIntensity;
    data.opacity = this.opacity;
    data.clearcoat = this.clearcoat;
    data.clearcoatRoughness = this.clearcoatRoughness;
    data.sheen = this.sheen;
    data.sheenRoughness = this.sheenRoughness;
    data.sheenColor = this.sheenColor.getHex();
    
    // Serialize texture maps
    if (this.map) data.map = this.map.toJSON();
    if (this.normalMap) data.normalMap = this.normalMap.toJSON();
    if (this.metalnessMap) data.metalnessMap = this.metalnessMap.toJSON();
    if (this.roughnessMap) data.roughnessMap = this.roughnessMap.toJSON();
    if (this.aoMap) data.aoMap = this.aoMap.toJSON();
    if (this.emissiveMap) data.emissiveMap = this.emissiveMap.toJSON();
    if (this.envMap) data.envMap = this.envMap.toJSON();
    
    return data;
  }

  /**
   * Create PBRMaterial from JSON
   * @param {Object} json - JSON descriptor
   * @param {Object} textureResolver - Optional texture resolver { resolveTexture(jsonDesc) }
   */
    static fromJSON(json, textureResolver = null) {
        const material = new PBRMaterial();
        
        // Base properties
        material.name = json.name || '';
        material.visible = json.visible !== undefined ? json.visible : true;
        material.side = json.side || 'FrontSide';
        material.transparent = json.transparent || false;
        material.opacity = json.opacity !== undefined ? json.opacity : 1.0;
        material.depthTest = json.depthTest !== undefined ? json.depthTest : true;
        material.depthWrite = json.depthWrite !== undefined ? json.depthWrite : true;
        
        // PBR properties
        if (json.color !== undefined) {
            material.color.setHex(json.color);
        }
        material.metallic = json.metallic !== undefined ? json.metallic : 0.0;
        material.roughness = json.roughness !== undefined ? json.roughness : 0.5;
        material.normalScale = json.normalScale !== undefined ? json.normalScale : 1.0;
        material.aoMapIntensity = json.aoMapIntensity !== undefined ? json.aoMapIntensity : 1.0;
        material.envMapIntensity = json.envMapIntensity !== undefined ? json.envMapIntensity : 1.0;
        
        if (json.emissive !== undefined) {
            material.emissive.setHex(json.emissive);
        }
        material.emissiveIntensity = json.emissiveIntensity !== undefined ? json.emissiveIntensity : 1.0;
        
        material.clearcoat = json.clearcoat !== undefined ? json.clearcoat : 0.0;
        material.clearcoatRoughness = json.clearcoatRoughness !== undefined ? json.clearcoatRoughness : 0.0;
        material.sheen = json.sheen !== undefined ? json.sheen : 0.0;
        material.sheenRoughness = json.sheenRoughness !== undefined ? json.sheenRoughness : 1.0;
        
        if (json.sheenColor !== undefined) {
            material.sheenColor.setHex(json.sheenColor);
        }
        
        // Resolve texture maps if present
        if (json.map && textureResolver) {
            material.map = textureResolver.resolveTexture(json.map);
        }
        if (json.normalMap && textureResolver) {
            material.normalMap = textureResolver.resolveTexture(json.normalMap);
        }
        if (json.metalnessMap && textureResolver) {
            material.metalnessMap = textureResolver.resolveTexture(json.metalnessMap);
        }
        if (json.roughnessMap && textureResolver) {
            material.roughnessMap = textureResolver.resolveTexture(json.roughnessMap);
        }
        if (json.aoMap && textureResolver) {
            material.aoMap = textureResolver.resolveTexture(json.aoMap);
        }
        if (json.emissiveMap && textureResolver) {
            material.emissiveMap = textureResolver.resolveTexture(json.emissiveMap);
        }
        if (json.envMap && textureResolver) {
            material.envMap = textureResolver.resolveTexture(json.envMap);
        }
        
        material._updateDefines();
        
        return material;
    }
}
