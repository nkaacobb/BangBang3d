import { Mesh } from '../../core/Mesh.js';
import { ConeGeometry } from '../../geometry/ConeGeometry.js';
import { SphereGeometry } from '../../geometry/SphereGeometry.js';
import { BasicMaterial } from '../../materials/BasicMaterial.js';
import { Object3D } from '../../core/Object3D.js';
import { Vector3 } from '../../math/Vector3.js';

/**
 * Visual helper for SpotLight objects
 * Creates a grabbable sphere marker at the light position
 * plus a semi-transparent cone showing the spotlight's cone of influence
 */
export class SpotLightHelper extends Object3D {
    /**
     * @param {SpotLight} light - The spotlight to visualize
     * @param {Color} color - Optional color override (default: uses light.color)
     */
    constructor(light, color = null) {
        super();
        
        this.light = light;
        this.type = 'SpotLightHelper';
        
        const helperColor = color || light.color.clone();
        
        // Grabbable sphere marker at the light position (same as PointLightHelper)
        const sphereGeometry = new SphereGeometry(0.3, 8, 8);
        const sphereMaterial = new BasicMaterial({
            color: helperColor
        });
        this.marker = new Mesh(sphereGeometry, sphereMaterial);
        this.add(this.marker);
        
        // Semi-transparent cone showing the spotlight beam direction
        const distance = light.distance > 0 ? light.distance : 5;
        const radius = Math.tan(light.angle) * distance;
        const coneGeometry = new ConeGeometry(radius, distance, 8, 1, true);
        const coneMaterial = new BasicMaterial({
            color: helperColor,
            opacity: 0.15,
            transparent: true,
            side: 'DoubleSide',
            depthWrite: false
        });
        this.cone = new Mesh(coneGeometry, coneMaterial);
        // Rotate cone to point down (cones are created pointing up by default)
        this.cone.rotation.x = Math.PI;
        // Offset the cone so its tip is at the sphere (light position)
        this.cone.position.y = -distance / 2;
        this.add(this.cone);
        
        // Match helper position to light position
        this.position.copy(light.position);
        
        this.update();
    }
    
    /**
     * Update helper to match light's current state
     */
    update() {
        // Update colors
        this.marker.material.color.copy(this.light.color);
        this.cone.material.color.copy(this.light.color);
        
        // Update cone geometry if light properties changed
        const distance = this.light.distance > 0 ? this.light.distance : 5;
        const radius = Math.tan(this.light.angle) * distance;
        
        // Update direction to point at target
        if (this.light.target) {
            const direction = new Vector3()
                .copy(this.light.target.position)
                .sub(this.light.position);
            const angle = Math.acos(direction.y / (direction.length() || 1));
            
            if (direction.length() > 0.001) {
                this.rotation.set(0, 0, 0);
                // Aim the whole helper group toward the target
                const len = direction.length();
                if (len > 0.001) {
                    const yAngle = Math.acos(direction.y / len);
                    const xzAngle = Math.atan2(direction.x, direction.z);
                    this.rotation.set(yAngle, xzAngle, 0, 'YXZ');
                }
            }
        }
    }
    
    /**
     * Dispose of helper resources
     */
    dispose() {
        this.marker.geometry.dispose();
        this.marker.material.dispose();
        this.cone.geometry.dispose();
        this.cone.material.dispose();
    }
}
