/**
 * RenderGraph.js
 * 
 * Render graph system for managing render passes and their dependencies.
 * Automatically orders passes based on dependencies and manages resource flow.
 * 
 * Phase 3: Render Graph and Pass System
 */

export default class RenderGraph {
    constructor() {
        this.passes = [];
        this.passMap = new Map(); // name -> pass
        this.executionOrder = []; // Sorted passes ready for execution
        this.needsSort = true;
        
        // Shared render targets
        this.renderTargets = new Map(); // name -> RenderTarget
        
        // Global stats
        this.stats = {
            totalExecutionTime: 0,
            totalDrawCalls: 0,
            totalTriangles: 0,
            passCount: 0
        };
    }
    
    /**
     * Add a render pass to the graph
     */
    addPass(pass) {
        if (this.passMap.has(pass.name)) {
            console.warn(`[RenderGraph] Pass "${pass.name}" already exists, replacing`);
            this.removePass(pass.name);
        }
        
        this.passes.push(pass);
        this.passMap.set(pass.name, pass);
        this.needsSort = true;
        
        return pass;
    }
    
    /**
     * Remove a render pass from the graph
     */
    removePass(name) {
        const pass = this.passMap.get(name);
        if (!pass) return;
        
        const index = this.passes.indexOf(pass);
        if (index !== -1) {
            this.passes.splice(index, 1);
        }
        
        this.passMap.delete(name);
        this.needsSort = true;
        
        pass.dispose();
    }
    
    /**
     * Get a render pass by name
     */
    getPass(name) {
        return this.passMap.get(name);
    }
    
    /**
     * Register a shared render target
     */
    addRenderTarget(name, renderTarget) {
        this.renderTargets.set(name, renderTarget);
        return renderTarget;
    }
    
    /**
     * Get a shared render target
     */
    getRenderTarget(name) {
        return this.renderTargets.get(name);
    }
    
    /**
     * Sort passes based on dependencies (topological sort)
     */
    _sortPasses() {
        if (!this.needsSort) return;
        
        this.executionOrder = [];
        const visited = new Set();
        const visiting = new Set();
        
        const visit = (pass) => {
            if (visited.has(pass)) return;
            
            if (visiting.has(pass)) {
                throw new Error(`[RenderGraph] Circular dependency detected involving pass "${pass.name}"`);
            }
            
            visiting.add(pass);
            
            // Visit dependencies first
            for (const dep of pass.dependencies) {
                visit(dep);
            }
            
            visiting.delete(pass);
            visited.add(pass);
            this.executionOrder.push(pass);
        };
        
        // Visit all passes
        for (const pass of this.passes) {
            if (!visited.has(pass)) {
                visit(pass);
            }
        }
        
        this.needsSort = false;
    }
    
    /**
     * Setup all passes (called once before first execute)
     */
    setup(renderer, scene, camera) {
        this._sortPasses();
        
        for (const pass of this.executionOrder) {
            if (pass.enabled) {
                pass.setup(renderer, scene, camera);
            }
        }
    }
    
    /**
     * Execute the render graph
     */
    execute(renderer, scene, camera, deltaTime) {
        this._sortPasses();
        
        // Reset global stats
        this.stats.totalExecutionTime = 0;
        this.stats.totalDrawCalls = 0;
        this.stats.totalTriangles = 0;
        this.stats.passCount = 0;
        
        // Execute each pass in order
        for (const pass of this.executionOrder) {
            if (!pass.enabled) continue;
            
            const startTime = performance.now();
            pass.resetStats();
            
            pass.execute(renderer, scene, camera, deltaTime);
            
            const endTime = performance.now();
            pass.stats.executionTime = endTime - startTime;
            
            // Accumulate global stats
            this.stats.totalExecutionTime += pass.stats.executionTime;
            this.stats.totalDrawCalls += pass.stats.drawCalls;
            this.stats.totalTriangles += pass.stats.triangles;
            this.stats.passCount++;
        }
    }
    
    /**
     * Resize all render targets and passes
     */
    resize(width, height) {
        // Resize shared render targets
        for (const [name, rt] of this.renderTargets) {
            rt.resize(width, height);
        }
        
        // Notify passes
        for (const pass of this.passes) {
            pass.resize(width, height);
        }
    }
    
    /**
     * Clear all passes
     */
    clear() {
        for (const pass of this.passes) {
            pass.dispose();
        }
        
        this.passes = [];
        this.passMap.clear();
        this.executionOrder = [];
        this.needsSort = true;
    }
    
    /**
     * Dispose of all resources
     */
    dispose() {
        this.clear();
        
        // Dispose render targets
        for (const [name, rt] of this.renderTargets) {
            rt.dispose();
        }
        this.renderTargets.clear();
    }
    
    /**
     * Get execution order (for debugging)
     */
    getExecutionOrder() {
        this._sortPasses();
        return this.executionOrder.map(p => p.name);
    }
    
    /**
     * Print debug info
     */
    printDebugInfo() {
        this._sortPasses();
        
        console.log('[RenderGraph] Debug Info:');
        console.log('  Passes:', this.passes.length);
        console.log('  Execution Order:', this.getExecutionOrder().join(' -> '));
        console.log('  Stats:', this.stats);
        
        for (const pass of this.executionOrder) {
            console.log(`  - ${pass.name}:`);
            console.log(`    Enabled: ${pass.enabled}`);
            console.log(`    Dependencies: ${pass.dependencies.map(p => p.name).join(', ') || 'none'}`);
            console.log(`    Inputs: ${Array.from(pass.inputs.keys()).join(', ') || 'none'}`);
            console.log(`    Outputs: ${Array.from(pass.outputs.keys()).join(', ') || 'none'}`);
            console.log(`    Stats: ${JSON.stringify(pass.stats)}`);
        }
    }
}
