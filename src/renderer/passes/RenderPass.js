/**
 * RenderPass.js
 * 
 * Abstract base class for render passes.
 * A render pass represents a single stage in the rendering pipeline.
 * 
 * Phase 3: Render Graph Architecture
 */

export default class RenderPass {
    constructor(name) {
        this.name = name;
        this.enabled = true;
        
        // Input/output resources
        this.inputs = new Map(); // name -> RenderTarget or texture
        this.outputs = new Map(); // name -> RenderTarget
        
        // Dependencies (other passes that must execute before this one)
        this.dependencies = [];
        
        // Cleared resources (for debugging/validation)
        this.clearColor = null; // { r, g, b, a } or null for no clear
        this.clearDepth = null; // number or null for no clear
        
        // Statistics
        this.stats = {
            executionTime: 0,
            drawCalls: 0,
            triangles: 0
        };
    }
    
    /**
     * Set input resource
     */
    setInput(name, resource) {
        this.inputs.set(name, resource);
    }
    
    /**
     * Get input resource
     */
    getInput(name) {
        return this.inputs.get(name);
    }
    
    /**
     * Set output resource
     */
    setOutput(name, resource) {
        this.outputs.set(name, resource);
    }
    
    /**
     * Get output resource
     */
    getOutput(name) {
        return this.outputs.get(name);
    }
    
    /**
     * Add dependency (another pass that must execute first)
     */
    addDependency(pass) {
        if (!this.dependencies.includes(pass)) {
            this.dependencies.push(pass);
        }
    }
    
    /**
     * Setup pass (called once before first execute)
     * Override in subclasses to create GPU resources
     */
    setup(renderer, scene, camera) {
        // Override in subclass
    }
    
    /**
     * Execute the render pass
     * Override in subclasses to implement rendering logic
     */
    execute(renderer, scene, camera, deltaTime) {
        throw new Error('RenderPass.execute() must be implemented in subclass');
    }
    
    /**
     * Resize pass resources
     */
    resize(width, height) {
        // Override in subclass if needed
    }
    
    /**
     * Dispose of pass resources
     */
    dispose() {
        this.inputs.clear();
        this.outputs.clear();
        this.dependencies = [];
    }
    
    /**
     * Reset statistics
     */
    resetStats() {
        this.stats.executionTime = 0;
        this.stats.drawCalls = 0;
        this.stats.triangles = 0;
    }
}
