import { LambertMaterial } from './LambertMaterial.js';

/**
 * MaterialHelper - Utility functions for material handling and conversion
 * Provides fallback logic for unsupported material types
 */
export class MaterialHelper {
  /**
   * Get an appropriate fallback material when backend doesn't support the material type
   * @param {Material} material - Original material
   * @param {Object} capabilities - Backend capabilities { supportsPBR, supportsLighting, supportsTextures }
   * @returns {Material} - Original material or fallback
   */
  static getFallbackMaterial(material, capabilities) {
    if (!material || !material.type) {
      return material;
    }

    // PBRMaterial requires supportsPBR capability
    if (material.type === 'PBRMaterial' && !capabilities.supportsPBR) {
      return MaterialHelper._pbrToLambert(material);
    }

    // If material needs lighting but backend doesn't support it, could add fallback here
    // For now, just return original
    return material;
  }

  /**
   * Convert PBRMaterial to LambertMaterial for CPU backend fallback
   * @param {PBRMaterial} pbrMaterial
   * @returns {LambertMaterial}
   * @private
   */
  static _pbrToLambert(pbrMaterial) {
    const lambert = new LambertMaterial();
    
    // Copy base properties
    lambert.name = pbrMaterial.name;
    lambert.visible = pbrMaterial.visible;
    lambert.side = pbrMaterial.side;
    lambert.transparent = pbrMaterial.transparent;
    lambert.opacity = pbrMaterial.opacity;
    lambert.depthTest = pbrMaterial.depthTest;
    lambert.depthWrite = pbrMaterial.depthWrite;
    
    // Map PBR properties to Lambert
    lambert.color.copy(pbrMaterial.color);
    
    // Use albedo map as diffuse map if available
    if (pbrMaterial.map) {
      lambert.map = pbrMaterial.map;
    }
    
    // Add emissive contribution to diffuse color (approximation)
    if (pbrMaterial.emissiveIntensity > 0) {
      const emissive = pbrMaterial.emissive.clone().multiplyScalar(pbrMaterial.emissiveIntensity);
      lambert.color.add(emissive);
      // Clamp to valid range
      lambert.color.r = Math.min(1.0, lambert.color.r);
      lambert.color.g = Math.min(1.0, lambert.color.g);
      lambert.color.b = Math.min(1.0, lambert.color.b);
    }
    
    return lambert;
  }

  /**
   * Check if material type is supported by backend
   * @param {Material} material
   * @param {Object} capabilities - Backend capabilities
   * @returns {boolean}
   */
  static isMaterialSupported(material, capabilities) {
    if (!material || !material.type) {
      return true;
    }

    switch (material.type) {
      case 'PBRMaterial':
        return capabilities.supportsPBR === true;
      case 'LambertMaterial':
        return capabilities.supportsLighting === true;
      case 'BasicMaterial':
      case 'DebugMaterial':
        return true;
      default:
        return false;
    }
  }
}
