/**
 * ComputeShader - Base class for compute shader operations
 * WebGPU compute pipeline for GPU-accelerated computations
 * Used for frustum culling, skinning, particles, and other data-parallel tasks
 */

export class ComputeShader {
    /**
     * @param {string} name - Shader name for debugging
     * @param {string} source - WGSL compute shader source code
     * @param {Object} options - Shader options
     */
    constructor(name, source, options = {}) {
        this.name = name;
        this.source = source;
        this.options = options;
        
        // Workgroup size (default 64)
        this.workgroupSize = options.workgroupSize || [64, 1, 1];
        
        // Compiled pipeline (set by backend)
        this.pipeline = null;
        
        // Bind groups for resources
        this.bindGroups = [];
        
        // Buffer bindings
        this.buffers = new Map();
        
        // Uniform bindings
        this.uniforms = new Map();
        
        // Compiled flag
        this.compiled = false;
    }
    
    /**
     * Set a storage buffer binding
     * @param {number} group - Bind group index
     * @param {number} binding - Binding index
     * @param {GPUBuffer} buffer - GPU buffer
     * @param {string} access - 'read' | 'read_write'
     */
    setStorageBuffer(group, binding, buffer, access = 'read') {
        const key = `${group}_${binding}`;
        this.buffers.set(key, { buffer, access, group, binding });
    }
    
    /**
     * Set a uniform buffer binding
     * @param {number} group - Bind group index
     * @param {number} binding - Binding index
     * @param {GPUBuffer} buffer - GPU buffer
     */
    setUniformBuffer(group, binding, buffer) {
        const key = `${group}_${binding}`;
        this.uniforms.set(key, { buffer, group, binding });
    }
    
    /**
     * Compile the compute shader
     * @param {GPUDevice} device - WebGPU device
     */
    compile(device) {
        if (this.compiled) {
            return;
        }
        
        try {
            // Create shader module
            const shaderModule = device.createShaderModule({
                label: `${this.name}_compute`,
                code: this.source
            });
            
            // Create compute pipeline
            this.pipeline = device.createComputePipeline({
                label: this.name,
                layout: 'auto',
                compute: {
                    module: shaderModule,
                    entryPoint: 'main'
                }
            });
            
            this.compiled = true;
            console.log(`[ComputeShader] Compiled: ${this.name}`);
            
        } catch (error) {
            console.error(`[ComputeShader] Failed to compile ${this.name}:`, error);
            throw error;
        }
    }
    
    /**
     * Execute the compute shader
     * @param {GPUCommandEncoder} encoder - Command encoder
     * @param {number} workgroupsX - Number of workgroups in X dimension
     * @param {number} workgroupsY - Number of workgroups in Y dimension (default 1)
     * @param {number} workgroupsZ - Number of workgroups in Z dimension (default 1)
     */
    dispatch(encoder, workgroupsX, workgroupsY = 1, workgroupsZ = 1) {
        if (!this.compiled || !this.pipeline) {
            console.error(`[ComputeShader] ${this.name} not compiled`);
            return;
        }
        
        const computePass = encoder.beginComputePass({
            label: `${this.name}_pass`
        });
        
        computePass.setPipeline(this.pipeline);
        
        // Set bind groups
        for (let i = 0; i < this.bindGroups.length; i++) {
            if (this.bindGroups[i]) {
                computePass.setBindGroup(i, this.bindGroups[i]);
            }
        }
        
        // Dispatch compute work
        computePass.dispatchWorkgroups(workgroupsX, workgroupsY, workgroupsZ);
        
        computePass.end();
    }
    
    /**
     * Calculate number of workgroups needed for given element count
     * @param {number} elementCount - Number of elements to process
     * @param {number} workgroupSize - Size of each workgroup (default: shader's workgroup size X)
     * @returns {number} Number of workgroups needed
     */
    static calculateWorkgroups(elementCount, workgroupSize = 64) {
        return Math.ceil(elementCount / workgroupSize);
    }
    
    /**
     * Dispose resources
     */
    dispose() {
        this.pipeline = null;
        this.bindGroups = [];
        this.buffers.clear();
        this.uniforms.clear();
        this.compiled = false;
    }
}

/**
 * ComputePass - Encapsulates a compute shader dispatch in the render graph
 */
export class ComputePass {
    /**
     * @param {string} name - Pass name
     * @param {ComputeShader} shader - Compute shader to execute
     */
    constructor(name, shader) {
        this.name = name;
        this.shader = shader;
        this.enabled = true;
        
        // Workgroup counts
        this.workgroupsX = 1;
        this.workgroupsY = 1;
        this.workgroupsZ = 1;
        
        // Dependencies (other passes that must complete first)
        this.dependencies = [];
    }
    
    /**
     * Set workgroup counts
     * @param {number} x - X dimension
     * @param {number} y - Y dimension
     * @param {number} z - Z dimension
     */
    setWorkgroups(x, y = 1, z = 1) {
        this.workgroupsX = x;
        this.workgroupsY = y;
        this.workgroupsZ = z;
    }
    
    /**
     * Execute this compute pass
     * @param {GPUCommandEncoder} encoder - Command encoder
     */
    execute(encoder) {
        if (!this.enabled) {
            return;
        }
        
        this.shader.dispatch(
            encoder,
            this.workgroupsX,
            this.workgroupsY,
            this.workgroupsZ
        );
    }
}
