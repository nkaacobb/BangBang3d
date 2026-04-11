import { BasicMaterial } from '../materials/BasicMaterial.js';
import { LambertMaterial } from '../materials/LambertMaterial.js';
import { DebugMaterial } from '../materials/DebugMaterial.js';
import { PBRMaterial } from '../materials/PBRMaterial.js';
import { TextureResolver } from './TextureResolver.js';

/**
 * MaterialSerializer - Helper for serializing and deserializing materials
 * Provides material library export/import functionality
 */
export class MaterialSerializer {
  constructor() {
    this.textureResolver = new TextureResolver();
  }

  /**
   * Serialize a single material to JSON
   * @param {Material} material
   * @returns {Object}
   */
  serializeMaterial(material) {
    if (!material || !material.toJSON) {
      console.warn('MaterialSerializer: Invalid material');
      return null;
    }
    return material.toJSON();
  }

  /**
   * Deserialize a single material from JSON
   * @param {Object} json
   * @returns {Material|null}
   */
  deserializeMaterial(json) {
    if (!json || !json.type) {
      console.warn('MaterialSerializer: Invalid material JSON');
      return null;
    }

    // Dispatch to appropriate material class
    switch (json.type) {
      case 'BasicMaterial':
        return BasicMaterial.fromJSON(json, this.textureResolver);
      case 'LambertMaterial':
        return LambertMaterial.fromJSON(json, this.textureResolver);
      case 'DebugMaterial':
        return DebugMaterial.fromJSON(json);
      case 'PBRMaterial':
        return PBRMaterial.fromJSON(json, this.textureResolver);
      default:
        console.warn(`MaterialSerializer: Unknown material type: ${json.type}`);
        return null;
    }
  }

  /**
   * Export a material library (array of materials) to JSON string
   * @param {Array<Material>} materials
   * @returns {string}
   */
  exportLibrary(materials) {
    const library = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      materials: materials.map(m => this.serializeMaterial(m)).filter(m => m !== null)
    };
    return JSON.stringify(library, null, 2);
  }

  /**
   * Import a material library from JSON string
   * @param {string} jsonString
   * @returns {Array<Material>}
   */
  importLibrary(jsonString) {
    try {
      const library = JSON.parse(jsonString);
      
      if (!library.materials || !Array.isArray(library.materials)) {
        console.warn('MaterialSerializer: Invalid library format');
        return [];
      }

      return library.materials
        .map(json => this.deserializeMaterial(json))
        .filter(m => m !== null);
    } catch (error) {
      console.error('MaterialSerializer: Failed to parse JSON', error);
      return [];
    }
  }

  /**
   * Get texture resolver instance
   * @returns {TextureResolver}
   */
  getTextureResolver() {
    return this.textureResolver;
  }

  /**
   * Clear texture cache
   */
  clearCache() {
    this.textureResolver.clear();
  }
}
