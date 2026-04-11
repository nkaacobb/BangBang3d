/**
 * ShadowMapPass.js
 * 
 * Render pass that generates shadow maps from light's perspective.
 * Renders scene depth into shadow map textures.
 * 
 * Phase 4: Shadow System
 */

import RenderPass from '../passes/RenderPass.js';
import RenderTarget from '../resources/RenderTarget.js';

export default class ShadowMapPass extends RenderPass {
    constructor(light) {
        super(`ShadowMap_${light.uuid || light.id || 'unknown'}`);
        
        this.light = light;
        this.shadowMap = null;
        this.renderTarget = null;
        
        // Clear depth to 1.0 (far plane)
        this.clearDepth = 1.0;
    }
    
    /**
     * Setup shadow map resources
     */
    setup(renderer, scene, camera) {
        if (!this.light.castShadow) {
            this.enabled = false;
            return;
        }
        
        // Create shadow map if needed
        if (!this.shadowMap) {
            const ShadowMap = require('../shadows/ShadowMap.js').ShadowMap;
            this.shadowMap = new ShadowMap(this.light);
        }
        
        // Create render target for shadow map
        const size = this.shadowMap.getSize();
        this.renderTarget = new RenderTarget(size.x, size.y, {
            format: 'depth24plus', // Depth-only format
            depth: true,
            minFilter: 'linear',
            magFilter: 'linear',
            wrapS: 'clamp-to-edge',
            wrapT: 'clamp-to-edge'
        });
        
        // Setup render target on GPU
        renderer.backend.setupRenderTarget(this.renderTarget);
        
        // Store render target in shadow map
        this.shadowMap.map = this.renderTarget;
        
        this.enabled = true;
    }
    
    /**
     * Execute shadow map rendering
     */
    execute(renderer, scene, camera, deltaTime) {
        if (!this.enabled || !this.light.castShadow) return;
        
        const startTime = performance.now();
        
        // Update shadow camera and matrices
        this.shadowMap.update();
        
        // TODO: Render scene from shadow camera perspective
        // This requires depth-only rendering pass implementation
        // For now, we set up the infrastructure
        
        // Collect shadow-casting objects
        const shadowCasters = [];
        scene.traverse((object) => {
            if (object.isMesh && object.castShadow) {
                shadowCasters.push(object);
            }
        });
        
        this.stats.drawCalls = shadowCasters.length;
        this.stats.triangles = shadowCasters.reduce((sum, obj) => {
            return sum + (obj.geometry?.attributes?.position?.count || 0) / 3;
        }, 0);
        
        this.stats.executionTime = performance.now() - startTime;
    }
    
    /**
     * Resize shadow map
     */
    resize(width, height) {
        // Shadow maps typically have fixed resolution
        // But we support dynamic resizing if needed
        if (this.renderTarget) {
            this.renderTarget.resize(width, height);
        }
    }
    
    /**
     * Dispose of shadow map resources
     */
    dispose() {
        super.dispose();
        
        if (this.renderTarget) {
            this.renderTarget.dispose();
            this.renderTarget = null;
        }
        
        if (this.shadowMap) {
            this.shadowMap.dispose();
            this.shadowMap = null;
        }
    }
    
    /**
     * Get shadow map texture
     */
    getShadowMap() {
        return this.renderTarget?.getDepthTexture();
    }
    
    /**
     * Get shadow matrix
     */
    getShadowMatrix() {
        return this.shadowMap?.matrix;
    }
}
