import { CubeTexture } from './CubeTexture.js';

/**
 * CubeTextureLoader - Loads cubemap textures from 6 face images or equirectangular panoramas.
 * 
 * Usage (6 faces):
 *   const loader = new CubeTextureLoader();
 *   const cubeTexture = await loader.load([
 *     'px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg'
 *   ]);
 * 
 * Usage (equirectangular):
 *   const cubeTexture = await loader.loadEquirectangular('panorama.jpg', 512);
 * 
 * Phase 5: Reflections Architecture
 */
export class CubeTextureLoader {
  /**
   * @param {string} [basePath=''] - Base path prepended to all URLs
   */
  constructor(basePath = '') {
    this.basePath = basePath;
  }

  /**
   * Load a cubemap from 6 face image URLs.
   * @param {Array<string>} urls - [+X, -X, +Y, -Y, +Z, -Z] image URLs
   * @returns {Promise<CubeTexture>}
   */
  async load(urls) {
    if (!Array.isArray(urls) || urls.length !== 6) {
      throw new Error('CubeTextureLoader.load: requires array of 6 URLs');
    }

    const images = await Promise.all(
      urls.map(url => this._loadImage(this.basePath + url))
    );

    const cubeTexture = new CubeTexture(images);
    cubeTexture.name = 'CubeTexture';
    return cubeTexture;
  }

  /**
   * Load an equirectangular panorama and convert to cubemap.
   * @param {string} url - Panorama image URL
   * @param {number} [faceSize=512] - Resolution of each cubemap face
   * @returns {Promise<CubeTexture>}
   */
  async loadEquirectangular(url, faceSize = 512) {
    const image = await this._loadImage(this.basePath + url);
    const cubeTexture = new CubeTexture();
    cubeTexture.name = 'EquirectCubeTexture';
    cubeTexture.setFromEquirectangular(image, faceSize);
    return cubeTexture;
  }

  /**
   * Load a single image.
   * @param {string} url
   * @returns {Promise<HTMLImageElement>}
   * @private
   */
  _loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  }
}
