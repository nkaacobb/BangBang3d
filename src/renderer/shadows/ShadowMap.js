/**
 * ShadowMap.js
 * 
 * Shadow map data structure for storing depth textures from light's perspective.
 * Supports directional, spot, and point lights with various resolutions.
 * 
 * Phase 4: Shadow System
 */

import { Matrix4 } from '../math/Matrix4.js';
import { PerspectiveCamera } from '../cameras/PerspectiveCamera.js';
import { OrthographicCamera } from '../cameras/OrthographicCamera.js';

export class ShadowMap {
    constructor(light) {
        this.light = light;
        
        // Shadow map size
        this.mapSize = light.shadow.mapSize || { x: 512, y: 512 };
        
        // Shadow camera (for rendering from light's perspective)
        this.camera = null;
        this._setupCamera();
        
        // Shadow map texture/render target
        this.map = null;
        
        // Shadow matrix (world to shadow space)
        this.matrix = new Matrix4();
        
        // Shadow parameters
        this.bias = light.shadow.bias !== undefined ? light.shadow.bias : 0.0001;
        this.normalBias = light.shadow.normalBias !== undefined ? light.shadow.normalBias : 0.0;
        this.radius = light.shadow.radius !== undefined ? light.shadow.radius : 1.0;
        
        // Needs update flag
        this.needsUpdate = true;
    }
    
    /**
     * Setup shadow camera based on light type
     */
    _setupCamera() {
        const light = this.light;
        
        if (light.type === 'DirectionalLight') {
            // Orthographic camera for directional lights
            const size = 10;
            this.camera = new OrthographicCamera(-size, size, size, -size, 0.1, 100);
            this.camera.position.copy(light.position);
            if (light.target) {
                this.camera.lookAt(light.target.position.x, light.target.position.y, light.target.position.z);
            }
        } else if (light.type === 'SpotLight') {
            // Perspective camera for spot lights
            const fov = (light.angle * 2) * 180 / Math.PI;
            this.camera = new PerspectiveCamera(fov, 1.0, 0.5, light.distance || 100);
            this.camera.position.copy(light.position);
            if (light.target) {
                this.camera.lookAt(light.target.position.x, light.target.position.y, light.target.position.z);
            }
        } else if (light.type === 'PointLight') {
            // For point lights, we need 6 cameras (cubemap) - implementing single face for now
            this.camera = new PerspectiveCamera(90, 1.0, 0.5, light.distance || 100);
            this.camera.position.copy(light.position);
        }
    }
    
    /**
     * Update shadow camera and matrices
     */
    update() {
        if (!this.camera) return;
        
        const light = this.light;
        
        // Update camera position and direction
        this.camera.position.copy(light.position);
        
        if (light.target && (light.type === 'DirectionalLight' || light.type === 'SpotLight')) {
            this.camera.lookAt(light.target.position.x, light.target.position.y, light.target.position.z);
        }
        
        // Update camera matrices
        this.camera.updateMatrixWorld(true);
        this.camera.updateProjectionMatrix();
        
        // Calculate shadow matrix (world to shadow clip space)
        const shadowMatrix = new Matrix4();
        shadowMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
        
        // Bias matrix to convert from [-1, 1] to [0, 1] range
        const biasMatrix = new Matrix4();
        biasMatrix.set(
            0.5, 0.0, 0.0, 0.5,
            0.0, 0.5, 0.0, 0.5,
            0.0, 0.0, 0.5, 0.5,
            0.0, 0.0, 0.0, 1.0
        );
        
        this.matrix.multiplyMatrices(biasMatrix, shadowMatrix);
        
        this.needsUpdate = false;
    }
    
    /**
     * Dispose of shadow resources
     */
    dispose() {
        if (this.map) {
            this.map.dispose();
            this.map = null;
        }
    }
    
    /**
     * Get shadow map resolution
     */
    getSize() {
        return this.mapSize;
    }
    
    /**
     * Set shadow map resolution
     */
    setSize(width, height) {
        this.mapSize.x = width;
        this.mapSize.y = height;
        this.needsUpdate = true;
        
        if (this.map) {
            this.map.resize(width, height);
        }
    }
}
