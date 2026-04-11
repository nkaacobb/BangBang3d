import { Texture } from './Texture.js';
import { TextureLoader } from './TextureLoader.js';

/**
 * TextureResolver - Manages texture caching and resolution from JSON descriptors
 * Prevents duplicate texture creation and provides consistent texture references
 */
export class TextureResolver {
  constructor() {
    this.loader = new TextureLoader();
    this.cache = new Map(); // uuid -> Texture
  }

  /**
   * Resolve a texture from a JSON descriptor
   * Returns cached texture if UUID matches, otherwise creates new texture
   * @param {Object} jsonDesc - Texture JSON descriptor
   * @returns {Texture|null}
   */
  resolveTexture(jsonDesc) {
    if (!jsonDesc) return null;

    // Check cache by UUID
    if (jsonDesc.uuid && this.cache.has(jsonDesc.uuid)) {
      return this.cache.get(jsonDesc.uuid);
    }

    // Create texture from JSON
    const texture = Texture.fromJSON(jsonDesc, this.loader);

    // Cache it
    if (texture && texture.uuid) {
      this.cache.set(texture.uuid, texture);
    }

    return texture;
  }

  /**
   * Add a texture to the cache
   * @param {Texture} texture
   */
  addTexture(texture) {
    if (texture && texture.uuid) {
      this.cache.set(texture.uuid, texture);
    }
  }

  /**
   * Get a texture from cache by UUID
   * @param {string} uuid
   * @returns {Texture|null}
   */
  getTexture(uuid) {
    return this.cache.get(uuid) || null;
  }

  /**
   * Check if a texture exists in cache
   * @param {string} uuid
   * @returns {boolean}
   */
  hasTexture(uuid) {
    return this.cache.has(uuid);
  }

  /**
   * Remove a texture from cache
   * @param {string} uuid
   */
  removeTexture(uuid) {
    const texture = this.cache.get(uuid);
    if (texture) {
      texture.dispose();
      this.cache.delete(uuid);
    }
  }

  /**
   * Clear all cached textures
   */
  clear() {
    this.cache.forEach(texture => texture.dispose());
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getStats() {
    return {
      textureCount: this.cache.size,
      textures: Array.from(this.cache.values()).map(t => ({
        uuid: t.uuid,
        name: t.name,
        width: t.width,
        height: t.height,
        procedural: t.procedural ? t.procedural.generator : null
      }))
    };
  }
}
