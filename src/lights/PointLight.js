/**
 * PointLight.js
 * 
 * Point light that emits light in all directions from a single point.
 * Supports distance-based attenuation.
 * 
 * Phase 4: Advanced Lighting
 */

import { Light } from './Light.js';
import { Color } from '../math/Color.js';

export class PointLight extends Light {
    constructor(color = new Color(1, 1, 1), intensity = 1.0, distance = 0, decay = 2) {
        super(color, intensity);
        
        this.type = 'PointLight';
        this.isPointLight = true;
        
        // Distance at which light intensity becomes zero (0 = infinite range)
        this.distance = distance;
        
        // Decay rate (1 = linear, 2 = physically accurate inverse square)
        this.decay = decay;
        
        // Shadow properties
        this.castShadow = false;
        this.shadow = {
            mapSize: { x: 512, y: 512 },
            camera: null,
            bias: 0.0001,
            normalBias: 0.0,
            radius: 1.0
        };
    }
    
    /**
     * Get light attenuation at a given distance
     */
    getAttenuation(distance) {
        if (this.distance === 0) {
            return 1.0; // No attenuation
        }
        
        // Prevent division by zero
        distance = Math.max(distance, 0.0001);
        
        if (this.decay === 1) {
            // Linear decay
            return Math.max(0, 1.0 - distance / this.distance);
        } else {
            // Inverse square decay (physically accurate)
            const attenuation = 1.0 / (distance * distance);
            const cutoff = 1.0 / (this.distance * this.distance);
            return Math.max(0, (attenuation - cutoff) / (1.0 - cutoff));
        }
    }
    
    /**
     * Copy properties from another point light
     */
    copy(source) {
        super.copy(source);
        
        this.distance = source.distance;
        this.decay = source.decay;
        this.castShadow = source.castShadow;
        
        return this;
    }
    
    /**
     * Convert to JSON
     */
    toJSON() {
        const data = super.toJSON();
        data.distance = this.distance;
        data.decay = this.decay;
        return data;
    }
}
