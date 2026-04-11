/**
 * PostProcessComposer.js
 * 
 * Manages a chain of post-processing passes.
 * Handles ping-pong rendering between render targets.
 * 
 * Phase 3: Post-Processing Backbone
 */

import RenderTarget from '../resources/RenderTarget.js';

export default class PostProcessComposer {
    constructor(renderer, width, height) {
        this.renderer = renderer;
        this.width = width;
        this.height = height;
        
        // Post-processing passes
        this.passes = [];
        
        // Ping-pong render targets for multi-pass effects
        this.readTarget = new RenderTarget(width, height, { depth: false });
        this.writeTarget = new RenderTarget(width, height, { depth: false });
        
        // Input texture (from main scene render)
        this.inputTexture = null;
        
        // Stats
        this.stats = {
            passCount: 0,
            totalTime: 0
        };
    }
    
    /**
     * Add a post-processing pass
     */
    addPass(pass) {
        this.passes.push(pass);
        pass.setup(this.renderer);
    }
    
    /**
     * Remove a post-processing pass
     */
    removePass(pass) {
        const index = this.passes.indexOf(pass);
        if (index !== -1) {
            this.passes.splice(index, 1);
            pass.dispose();
        }
    }
    
    /**
     * Clear all passes
     */
    clearPasses() {
        for (const pass of this.passes) {
            pass.dispose();
        }
        this.passes = [];
    }
    
    /**
     * Set input texture (result of main scene render)
     */
    setInputTexture(texture) {
        this.inputTexture = texture;
    }
    
    /**
     * Render all post-processing passes
     * @param {RenderTarget} outputTarget - Final output target (null for screen)
     */
    render(outputTarget = null) {
        if (this.passes.length === 0) {
            // No post-processing, just copy input to output if needed
            return this.inputTexture;
        }
        
        const startTime = performance.now();
        this.stats.passCount = 0;
        
        let inputTex = this.inputTexture;
        let currentTarget = this.writeTarget;
        
        // Execute each pass
        for (let i = 0; i < this.passes.length; i++) {
            const pass = this.passes[i];
            if (!pass.enabled) continue;
            
            const isLastPass = i === this.passes.length - 1;
            const renderToScreen = isLastPass && !outputTarget;
            
            // Determine output target
            let targetToUse = null;
            if (renderToScreen) {
                // Last pass renders to screen
                targetToUse = null;
            } else if (isLastPass && outputTarget) {
                // Last pass renders to specified output
                targetToUse = outputTarget;
            } else {
                // Intermediate pass renders to ping-pong target
                targetToUse = currentTarget;
            }
            
            // Execute pass
            pass.render(this.renderer, inputTex, targetToUse);
            
            this.stats.passCount++;
            
            // Swap targets for next pass
            if (!isLastPass) {
                inputTex = currentTarget.getColorTexture();
                currentTarget = (currentTarget === this.writeTarget) ? this.readTarget : this.writeTarget;
            }
        }
        
        this.stats.totalTime = performance.now() - startTime;
        
        // Return final output texture
        return outputTarget ? outputTarget.getColorTexture() : null;
    }
    
    /**
     * Resize render targets
     */
    resize(width, height) {
        if (this.width === width && this.height === height) {
            return;
        }
        
        this.width = width;
        this.height = height;
        
        this.readTarget.resize(width, height);
        this.writeTarget.resize(width, height);
        
        // Notify passes
        for (const pass of this.passes) {
            if (pass.resize) {
                pass.resize(width, height);
            }
        }
    }
    
    /**
     * Dispose of resources
     */
    dispose() {
        this.clearPasses();
        this.readTarget.dispose();
        this.writeTarget.dispose();
    }
}
