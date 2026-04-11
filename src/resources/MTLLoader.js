import { Color } from '../math/Color.js';
import { TextureLoader } from './TextureLoader.js';

/**
 * MTLLoader - Loads Wavefront .mtl material files
 * 
 * Supports:
 * - newmtl (material name)
 * - Ka (ambient color)
 * - Kd (diffuse color)
 * - Ks (specular color)
 * - Ns (specular exponent)
 * - d/Tr (transparency)
 * - map_Kd (diffuse texture)
 * - map_Ka (ambient texture)
 */
export class MTLLoader {
  constructor() {
    this.textureLoader = new TextureLoader();
    this.basePath = '';
  }

  /**
   * Set base path for resolving texture paths
   */
  setPath(path) {
    this.basePath = path;
    return this;
  }

  /**
   * Load MTL file from URL
   * @param {string} url - MTL file URL
   * @param {Function} onLoad - Callback(materials) on success
   * @param {Function} onError - Callback(error) on failure
   */
  load(url, onLoad, onError) {
    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`MTLLoader: HTTP ${response.status} - ${url}`);
        }
        return response.text();
      })
      .then(text => {
        const materials = this.parse(text);
        if (onLoad) {
          onLoad(materials);
        }
      })
      .catch(error => {
        console.error('MTLLoader: Error loading MTL file', url, error);
        if (onError) {
          onError(error);
        }
      });
  }

  /**
   * Parse MTL file content
   * @param {string} text - MTL file content
   * @returns {Object} Map of material name to material properties
   */
  parse(text) {
    const materials = {};
    let currentMaterial = null;

    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

      // Skip empty lines and comments
      if (line === '' || line.startsWith('#')) {
        continue;
      }

      // Split line into tokens
      const tokens = line.split(/\s+/);
      const keyword = tokens[0].toLowerCase();

      switch (keyword) {
        case 'newmtl':
          // Start new material
          const materialName = tokens[1];
          currentMaterial = {
            name: materialName,
            ambient: new Color(0.2, 0.2, 0.2),
            diffuse: new Color(0.8, 0.8, 0.8),
            specular: new Color(0, 0, 0),
            shininess: 0,
            opacity: 1.0,
            textures: {}
          };
          materials[materialName] = currentMaterial;
          break;

        case 'ka':
          // Ambient color
          if (currentMaterial) {
            currentMaterial.ambient.set(
              parseFloat(tokens[1]),
              parseFloat(tokens[2]),
              parseFloat(tokens[3])
            );
          }
          break;

        case 'kd':
          // Diffuse color
          if (currentMaterial) {
            currentMaterial.diffuse.set(
              parseFloat(tokens[1]),
              parseFloat(tokens[2]),
              parseFloat(tokens[3])
            );
          }
          break;

        case 'ks':
          // Specular color
          if (currentMaterial) {
            currentMaterial.specular.set(
              parseFloat(tokens[1]),
              parseFloat(tokens[2]),
              parseFloat(tokens[3])
            );
          }
          break;

        case 'ns':
          // Specular exponent (shininess)
          if (currentMaterial) {
            currentMaterial.shininess = parseFloat(tokens[1]);
          }
          break;

        case 'd':
          // Dissolve (opacity) - d = 1.0 is fully opaque
          if (currentMaterial) {
            currentMaterial.opacity = parseFloat(tokens[1]);
          }
          break;

        case 'tr':
          // Transparency - Tr = 0.0 is fully opaque (opposite of d)
          if (currentMaterial) {
            currentMaterial.opacity = 1.0 - parseFloat(tokens[1]);
          }
          break;

        case 'map_kd':
          // Diffuse texture map
          if (currentMaterial) {
            const texturePath = this.resolveTexturePath(tokens.slice(1).join(' '));
            currentMaterial.textures.diffuse = texturePath;
          }
          break;

        case 'map_ka':
          // Ambient texture map
          if (currentMaterial) {
            const texturePath = this.resolveTexturePath(tokens.slice(1).join(' '));
            currentMaterial.textures.ambient = texturePath;
          }
          break;

        case 'map_ks':
          // Specular texture map
          if (currentMaterial) {
            const texturePath = this.resolveTexturePath(tokens.slice(1).join(' '));
            currentMaterial.textures.specular = texturePath;
          }
          break;
      }
    }

    return materials;
  }

  /**
   * Resolve texture path relative to base path
   */
  resolveTexturePath(texturePath) {
    // Remove quotes if present
    texturePath = texturePath.replace(/["']/g, '');
    
    // If texture path is absolute or starts with protocol, use as-is
    if (texturePath.startsWith('http') || texturePath.startsWith('/')) {
      return texturePath;
    }

    // Otherwise, resolve relative to base path
    return this.basePath + texturePath;
  }

  /**
   * Load textures referenced by materials
   * @param {Object} materials - Materials object from parse()
   * @param {Function} onAllLoaded - Called when all textures are loaded
   */
  loadTextures(materials, onAllLoaded) {
    const textureLoadPromises = [];

    for (const materialName in materials) {
      const material = materials[materialName];

      // Load diffuse texture if present
      if (material.textures.diffuse) {
        const promise = new Promise((resolve, reject) => {
          this.textureLoader.load(
            material.textures.diffuse,
            (texture) => {
              material.textureObjects = material.textureObjects || {};
              material.textureObjects.diffuse = texture;
              console.log(`MTLLoader: Loaded diffuse texture for ${materialName}:`, material.textures.diffuse);
              resolve();
            },
            null,
            (error) => {
              console.warn(`MTLLoader: Failed to load diffuse texture for ${materialName}:`, material.textures.diffuse);
              resolve(); // Resolve anyway to not block other textures
            }
          );
        });
        textureLoadPromises.push(promise);
      }
    }

    // Wait for all textures to load
    if (textureLoadPromises.length > 0) {
      Promise.all(textureLoadPromises).then(() => {
        if (onAllLoaded) {
          onAllLoaded(materials);
        }
      });
    } else {
      if (onAllLoaded) {
        onAllLoaded(materials);
      }
    }
  }
}
