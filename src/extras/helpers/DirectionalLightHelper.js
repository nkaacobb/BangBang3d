import { Object3D } from '../../core/Object3D.js';
import { Mesh } from '../../core/Mesh.js';
import { PlaneGeometry } from '../../geometry/PlaneGeometry.js';
import { BoxGeometry } from '../../geometry/BoxGeometry.js';
import { BasicMaterial } from '../../materials/BasicMaterial.js';
import { Vector3 } from '../../math/Vector3.js';

/**
 * Visual helper for DirectionalLight objects
 * Creates a plane with arrows showing the parallel light rays
 */
export class DirectionalLightHelper extends Object3D {
    /**
     * @param {DirectionalLight} light - The directional light to visualize
     * @param {number} size - The size of the helper plane (default: 1)
     * @param {Color} color - Optional color override (default: uses light.color)
     */
    constructor(light, size = 1, color = null) {
        super();
        
        this.light = light;
        this.size = size;
        this.type = 'DirectionalLightHelper';
        
        // Create a plane to represent the light source area
        const planeGeometry = new PlaneGeometry(size, size);
        const planeMaterial = new BasicMaterial({
            color: color || light.color.clone(),
            opacity: 0.5,
            transparent: true,
            side: 'double'
        });
        this.plane = new Mesh(planeGeometry, planeMaterial);
        this.add(this.plane);
        
        // Create arrow lines to show direction
        // Using thin boxes as line segments
        const arrowMaterial = new BasicMaterial({
            color: color || light.color.clone()
        });
        
        // Center arrow
        const centerArrow = new Mesh(
            new BoxGeometry(0.05, 0.05, size),
            arrowMaterial
        );
        centerArrow.position.z = -size / 2;
        this.add(centerArrow);
        
        // Corner arrows
        const offsets = [
            [-size * 0.3, -size * 0.3],
            [size * 0.3, -size * 0.3],
            [-size * 0.3, size * 0.3],
            [size * 0.3, size * 0.3]
        ];
        
        this.arrows = [centerArrow];
        offsets.forEach(([x, y]) => {
            const arrow = new Mesh(
                new BoxGeometry(0.03, 0.03, size * 0.7),
                arrowMaterial
            );
            arrow.position.set(x, y, -size * 0.35);
            this.add(arrow);
            this.arrows.push(arrow);
        });
        
        // Match helper position to light position
        this.position.copy(light.position);
        
        this.update();
    }
    
    /**
     * Update helper to match light's current state
     */
    update() {
        // Update colors
        this.plane.material.color.copy(this.light.color);
        this.arrows.forEach(arrow => {
            arrow.material.color.copy(this.light.color);
        });
        
        // Update orientation to point at target
        const direction = this.light.getDirection();
        
        // Calculate rotation to align Z-axis with direction
        const up = new Vector3(0, 1, 0);
        if (Math.abs(direction.y) > 0.99) {
            up.set(1, 0, 0);
        }
        
        // Simple look-at rotation approximation
        const angle = Math.acos(direction.y);
        const axis = new Vector3(-direction.z, 0, direction.x).normalize();
        
        if (axis.length() > 0.001) {
            this.rotation.set(
                -angle * axis.x, 
                0,
                angle * axis.z
            );
        }
    }
    
    /**
     * Dispose of helper resources
     */
    dispose() {
        this.plane.geometry.dispose();
        this.plane.material.dispose();
        this.arrows.forEach(arrow => {
            arrow.geometry.dispose();
            arrow.material.dispose();
        });
    }
}
