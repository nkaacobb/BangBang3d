/**
 * SpotLight.js
 * 
 * Spot light that emits light in a cone from a point.
 * Supports distance-based attenuation and angular falloff.
 * 
 * Phase 4: Advanced Lighting
 */

import { Light } from './Light.js';
import { Color } from '../math/Color.js';
import { Vector3 } from '../math/Vector3.js';
import { Object3D } from '../core/Object3D.js';
import { PerspectiveCamera } from '../core/PerspectiveCamera.js';

export class SpotLight extends Light {
    constructor(color = new Color(1, 1, 1), intensity = 1.0, distance = 0, angle = Math.PI / 3, penumbra = 0, decay = 2) {
        super(color, intensity);
        
        this.type = 'SpotLight';
        this.isSpotLight = true;
        
        // Distance at which light intensity becomes zero (0 = infinite range)
        this.distance = distance;
        
        // Maximum angle of light cone (in radians)
        this.angle = angle;
        
        // Penumbra (soft edge) as percentage of spotlight cone (0-1)
        this.penumbra = penumbra;
        
        // Decay rate (1 = linear, 2 = physically accurate inverse square)
        this.decay = decay;
        
        // Target for light direction (optional helper)
        this.target = new Object3D();
        this.target.position.set(0, 0, -1);
        
        // Shadow properties
        this.castShadow = false;
        this.shadow = {
            mapSize: { width: 1024, height: 1024 },
            camera: null,
            bias: 0.0005,
            normalBias: 0.0,
            radius: 1.0,
            map: null,     // GPU texture resource
            matrix: null   // Shadow projection matrix
        };
    }
    
    /**
     * Get the direction vector of the spotlight
     */
    getDirection(target = new Vector3()) {
        const position = new Vector3();
        const targetPos = new Vector3();
        
        this.getWorldPosition(position);
        this.target.getWorldPosition(targetPos);
        
        return target.subVectors(targetPos, position).normalize();
    }
    
    /**
     * Get light attenuation at a given distance
     */
    getDistanceAttenuation(distance) {
        if (this.distance === 0) {
            return 1.0; // No attenuation
        }
        
        distance = Math.max(distance, 0.0001);
        
        if (this.decay === 1) {
            // Linear decay
            return Math.max(0, 1.0 - distance / this.distance);
        } else {
            // Inverse square decay
            const attenuation = 1.0 / (distance * distance);
            const cutoff = 1.0 / (this.distance * this.distance);
            return Math.max(0, (attenuation - cutoff) / (1.0 - cutoff));
        }
    }
    
    /**
     * Get angular attenuation based on cone angle
     * @param {number} cosTheta - Cosine of angle between light direction and light-to-point direction
     */
    getAngularAttenuation(cosTheta) {
        const outerCone = Math.cos(this.angle);
        const innerCone = Math.cos(this.angle * (1.0 - this.penumbra));
        
        if (cosTheta < outerCone) {
            return 0.0; // Outside cone
        }
        
        if (cosTheta > innerCone) {
            return 1.0; // Inside inner cone
        }
        
        // Smooth transition in penumbra
        return (cosTheta - outerCone) / (innerCone - outerCone);
    }
    
    /**
     * Initialize shadow camera for this spotlight
     */
    initShadowCamera() {
        if (!this.shadow.camera) {
            // Use perspective camera matching spotlight cone
            const fov = this.angle * 2 * (180 / Math.PI); // Convert to degrees
            const aspect = 1.0; // Square shadow map
            const near = 0.5;
            const far = this.distance > 0 ? this.distance : 50;
            
            this.shadow.camera = new PerspectiveCamera(fov, aspect, near, far);
        }
        return this.shadow.camera;
    }
    
    /**
     * Update shadow camera to match spotlight properties
     */
    updateShadowCamera() {
        if (!this.shadow.camera) return;
        
        const camera = this.shadow.camera;
        
        // Update FOV to match spotlight angle
        camera.fov = this.angle * 2 * (180 / Math.PI);
        
        // Update far plane to match distance
        if (this.distance > 0) {
            camera.far = this.distance;
        }
        
        // Position and orient camera to match spotlight
        this.updateMatrixWorld(true);
        const lightPos = new Vector3();
        lightPos.setFromMatrixPosition(this.matrixWorld);
        
        this.target.updateMatrixWorld(true);
        const targetPos = new Vector3();
        targetPos.setFromMatrixPosition(this.target.matrixWorld);
        
        camera.position.copy(lightPos);
        camera.lookAt(targetPos);
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();
    }
    
    /**
     * Copy properties from another spot light
     */
    copy(source) {
        super.copy(source);
        
        this.distance = source.distance;
        this.angle = source.angle;
        this.penumbra = source.penumbra;
        this.decay = source.decay;
        this.castShadow = source.castShadow;
        
        if (source.shadow) {
            this.shadow.mapSize.width = source.shadow.mapSize.width;
            this.shadow.mapSize.height = source.shadow.mapSize.height;
            this.shadow.bias = source.shadow.bias;
            this.shadow.normalBias = source.shadow.normalBias;
        }
        
        this.target = source.target.clone();
        
        return this;
    }
    
    /**
     * Convert to JSON
     */
    toJSON() {
        const data = super.toJSON();
        data.distance = this.distance;
        data.angle = this.angle;
        data.penumbra = this.penumbra;
        data.decay = this.decay;
        return data;
    }
}
