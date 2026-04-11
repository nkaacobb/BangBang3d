/**
 * GridOverlay - Blender-like infinite viewport grid
 * 
 * Creates an adaptive, infinite-feeling grid overlay for viewport orientation.
 * Features:
 * - Adaptive grid density based on camera distance
 * - Colored axis lines (red=X, green=Z)
 * - Origin indicator at (0,0,0)
 * - Smooth horizon fade
 * - Works on both CPU and GPU backends
 */

import { Mesh } from '../../core/Mesh.js';
import { Material } from '../../materials/Material.js';
import { PlaneGeometry } from '../../geometry/PlaneGeometry.js';

export class GridOverlayMaterial extends Material {
  constructor(options = {}) {
    super();
    this.type = 'GridOverlayMaterial';
    
    // Grid appearance
    this.gridScale = options.gridScale !== undefined ? options.gridScale : 1.0;
    this.gridOpacity = options.gridOpacity !== undefined ? options.gridOpacity : 0.8;
    this.fadeDistance = options.fadeDistance !== undefined ? options.fadeDistance : 100.0;
    this.horizonColor = options.horizonColor !== undefined ? options.horizonColor : { r: 0.5, g: 0.5, b: 0.5 };
    
    // Axis colors - brighter by default
    this.axisXColor = options.axisXColor !== undefined ? options.axisXColor : { r: 1.0, g: 0.2, b: 0.2 }; // Bright red
    this.axisZColor = options.axisZColor !== undefined ? options.axisZColor : { r: 0.2, g: 1.0, b: 0.2 }; // Bright green
    
    // Grid behavior
    this.adaptive = options.adaptive !== undefined ? options.adaptive : false;
    this.majorLineInterval = options.majorLineInterval !== undefined ? options.majorLineInterval : 10;
    this.gridAlpha = options.gridAlpha !== undefined ? options.gridAlpha : 0.65; // Alpha multiplier for grid lines
    this.gridColor = options.gridColor !== undefined ? options.gridColor : { r: 0.5, g: 0.5, b: 0.5 }; // Grid line color (RGB)
    
    // Rendering
    this.transparent = true;
    this.opacity = 0.99; // Must be < 1.0 to trigger transparent rendering path
    this.depthWrite = false;
    this.side = 'DoubleSide';
  }
}

export class GridOverlay {
  constructor(options = {}) {
    this.options = {
      size: options.size !== undefined ? options.size : 1000, // Large but finite
      gridScale: options.gridScale !== undefined ? options.gridScale : 1.0,
      gridOpacity: options.gridOpacity !== undefined ? options.gridOpacity : 0.8,
      fadeDistance: options.fadeDistance !== undefined ? options.fadeDistance : 100.0,
      adaptive: options.adaptive !== undefined ? options.adaptive : false,
      yPosition: options.yPosition !== undefined ? options.yPosition : 0.0,
      axisXColor: options.axisXColor !== undefined ? options.axisXColor : { r: 1.0, g: 0.2, b: 0.2 },
      axisZColor: options.axisZColor !== undefined ? options.axisZColor : { r: 0.2, g: 1.0, b: 0.2 },
      horizonColor: options.horizonColor !== undefined ? options.horizonColor : { r: 0.5, g: 0.5, b: 0.5 },
      ...options
    };
    
    this.mesh = null;
    this.visible = true;
    this._createMesh();
  }
  
  _createMesh() {
    // Create a large horizontal plane (XZ) at specified Y position
    const geometry = new PlaneGeometry(this.options.size, this.options.size, 1, 1);
    
    // Rotate to be horizontal (XZ plane, facing up)
    // PlaneGeometry is Y-up by default, we need XZ
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      // Swap Y and Z, negate new Z to maintain proper orientation
      positions[i] = x;       // X stays X
      positions[i + 1] = 0;   // Y becomes 0 (ground level)
      positions[i + 2] = -y;  // Z gets old Y (negated)
    }
    geometry.attributes.position.needsUpdate = true;
    
    const material = new GridOverlayMaterial(this.options);
    
    this.mesh = new Mesh(geometry, material);
    this.mesh.position.set(0, this.options.yPosition, 0);
    this.mesh.renderOrder = -1; // Render behind other objects
  }
  
  /**
   * Add grid to scene
   */
  addToScene(scene) {
    if (this.mesh && !scene.children.includes(this.mesh)) {
      scene.add(this.mesh);
    }
  }
  
  /**
   * Remove grid from scene
   */
  removeFromScene(scene) {
    if (this.mesh && scene.children.includes(this.mesh)) {
      scene.remove(this.mesh);
    }
  }
  
  /**
   * Update grid position to follow camera for infinite feel
   */
  updatePosition(camera) {
    if (this.mesh && camera.position) {
      // Keep grid centered on camera X and Z, maintain Y position
      this.mesh.position.x = Math.floor(camera.position.x / 10) * 10;
      this.mesh.position.z = Math.floor(camera.position.z / 10) * 10;
    }
  }
  
  /**
   * Set visibility
   */
  setVisible(visible) {
    this.visible = visible;
    if (this.mesh) {
      this.mesh.visible = visible;
    }
  }
  
  /**
   * Update grid opacity
   */
  setOpacity(opacity) {
    if (this.mesh && this.mesh.material) {
      this.mesh.material.gridOpacity = opacity;
    }
  }
  
  /**
   * Update grid scale
   */
  setScale(scale) {
    if (this.mesh && this.mesh.material) {
      this.mesh.material.gridScale = scale;
    }
  }
  
  /**
   * Update grid alpha boost
   */
  setGridAlpha(alpha) {
    if (this.mesh && this.mesh.material) {
      this.mesh.material.gridAlpha = alpha;
      this.mesh.material.needsUpdate = true;
    }
  }
  
  /**
   * Update grid color
   */
  setGridColor(r, g, b) {
    if (this.mesh && this.mesh.material) {
      this.mesh.material.gridColor = { r, g, b };
      this.mesh.material.needsUpdate = true;
    }
  }
}
