/**
 * HemisphereLight.js
 * 
 * Hemisphere light that illuminates the scene from above and below.
 * Often used for outdoor ambient lighting (sky + ground).
 * 
 * Phase 4: Advanced Lighting
 */

import { Light } from './Light.js';
import { Color } from '../math/Color.js';

export class HemisphereLight extends Light {
    constructor(skyColor = new Color(1, 1, 1), groundColor = new Color(0, 0, 0), intensity = 1.0) {
        super(skyColor, intensity);
        
        this.type = 'HemisphereLight';
        this.isHemisphereLight = true;
        
        // Ground color (lower hemisphere) - ensure it's a Color object
        this.groundColor = new Color();
        if (typeof groundColor === 'number') {
            this.groundColor.setHex(groundColor);
        } else {
            this.groundColor.copy(groundColor);
        }
        
        // Sky color is already set by parent constructor in this.color
        // Position represents "up" direction
        this.position.set(0, 1, 0);
    }
    
    /**
     * Get interpolated color based on normal direction
     * @param {Vector3} normal - Surface normal
     * @returns {Color} Interpolated color between sky and ground
     */
    getColorForNormal(normal) {
        // Map normal.y from [-1, 1] to [0, 1]
        const t = normal.y * 0.5 + 0.5;
        
        const result = new Color();
        result.lerpColors(this.groundColor, this.color, t);
        result.multiplyScalar(this.intensity);
        
        return result;
    }
    
    /**
     * Copy properties from another hemisphere light
     */
    copy(source) {
        super.copy(source);
        
        this.groundColor.copy(source.groundColor);
        
        return this;
    }
    
    /**
     * Convert to JSON
     */
    toJSON() {
        const data = super.toJSON();
        data.groundColor = this.groundColor.getHex();
        return data;
    }
}
