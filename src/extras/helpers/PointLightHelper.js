import { Mesh } from '../../core/Mesh.js';
import { SphereGeometry } from '../../geometry/SphereGeometry.js';
import { BasicMaterial } from '../../materials/BasicMaterial.js';

/**
 * Visual helper for PointLight objects
 * Creates a small sphere at the light's position with the light's color
 */
export class PointLightHelper extends Mesh {
    /**
     * @param {PointLight} light - The point light to visualize
     * @param {number} size - The size of the helper sphere (default: 0.2)
     * @param {Color} color - Optional color override (default: uses light.color)
     */
    constructor(light, size = 0.2, color = null) {
        const geometry = new SphereGeometry(size, 8, 6);
        const material = new BasicMaterial({
            color: color || light.color.clone()
        });
        
        super(geometry, material);
        
        this.light = light;
        this.size = size;
        this.type = 'PointLightHelper';
        
        // Match helper position to light position
        this.position.copy(light.position);
    }
    
    /**
     * Update helper to match light's current state
     */
    update() {
        // Update color if light color changed
        this.material.color.copy(this.light.color);
        
        // Position is automatically updated via scene graph
        // since helper is child of light
    }
    
    /**
     * Dispose of helper resources
     */
    dispose() {
        this.geometry.dispose();
        this.material.dispose();
    }
}
