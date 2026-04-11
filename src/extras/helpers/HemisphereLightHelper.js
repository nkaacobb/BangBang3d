import { Mesh } from '../../core/Mesh.js';
import { SphereGeometry } from '../../geometry/SphereGeometry.js';
import { BasicMaterial } from '../../materials/BasicMaterial.js';
import { Object3D } from '../../core/Object3D.js';

/**
 * Visual helper for HemisphereLight objects
 * Creates a hemisphere showing sky and ground colors
 */
export class HemisphereLightHelper extends Object3D {
    /**
     * @param {HemisphereLight} light - The hemisphere light to visualize
     * @param {number} size - The size of the helper sphere (default: 1)
     */
    constructor(light, size = 1) {
        super();
        
        this.light = light;
        this.size = size;
        this.type = 'HemisphereLightHelper';
        
        // Create sky hemisphere (top)
        const skyGeometry = new SphereGeometry(size, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
        const skyMaterial = new BasicMaterial({
            color: light.color.clone(),
            opacity: 0.5,
            transparent: true,
            side: 'double'
        });
        this.skyMesh = new Mesh(skyGeometry, skyMaterial);
        this.add(this.skyMesh);
        
        // Create ground hemisphere (bottom)
        const groundGeometry = new SphereGeometry(size, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
        const groundMaterial = new BasicMaterial({
            color: light.groundColor.clone(),
            opacity: 0.5,
            transparent: true,
            side: 'double'
        });
        this.groundMesh = new Mesh(groundGeometry, groundMaterial);
        this.add(this.groundMesh);
        
        // Center line to show division
        // Using a flat disc would be ideal but we'll use the sphere equator
        
        // Match helper position to light position
        this.position.copy(light.position);
    }
    
    /**
     * Update helper to match light's current state
     */
    update() {
        // Update sky color
        this.skyMesh.material.color.copy(this.light.color);
        
        // Update ground color
        this.groundMesh.material.color.copy(this.light.groundColor);
        
        // Hemisphere lights use position as "up" direction
        // So we might need to rotate based on light's orientation
        // For now, keep it simple and aligned with world Y-axis
    }
    
    /**
     * Dispose of helper resources
     */
    dispose() {
        this.skyMesh.geometry.dispose();
        this.skyMesh.material.dispose();
        this.groundMesh.geometry.dispose();
        this.groundMesh.material.dispose();
    }
}
