/**
 * PostProcessPass.js
 * 
 * Base class for post-processing passes.
 * Post-process passes operate on screen-space textures using full-screen quads.
 * 
 * Phase 3: Post-Processing System
 */

export default class PostProcessPass {
    constructor(name) {
        this.name = name;
        this.enabled = true;
        
        // Shader sources (should be defined in subclasses)
        this.vertexShaderWGSL = null;
        this.fragmentShaderWGSL = null;
        this.vertexShaderGLSL = null;
        this.fragmentShaderGLSL = null;
        
        // GPU resources
        this.pipeline = null; // WebGPU pipeline or WebGL2 program
        this.bindGroup = null; // WebGPU bind group
        this.sampler = null;
        
        // Uniforms (override in subclass)
        this.uniforms = {};
    }
    
    /**
     * Setup the pass (compile shaders, create resources)
     */
    setup(renderer) {
        // Override in subclass to compile shaders and create resources
    }
    
    /**
     * Render the pass
     * @param {Renderer} renderer
     * @param {Texture} inputTexture - Input texture to process
     * @param {RenderTarget} outputTarget - Output target (null for screen)
     */
    render(renderer, inputTexture, outputTarget) {
        throw new Error('PostProcessPass.render() must be implemented in subclass');
    }
    
    /**
     * Resize pass resources
     */
    resize(width, height) {
        // Override if needed
    }
    
    /**
     * Set uniform value
     */
    setUniform(name, value) {
        this.uniforms[name] = value;
    }
    
    /**
     * Get uniform value
     */
    getUniform(name) {
        return this.uniforms[name];
    }
    
    /**
     * Dispose of pass resources
     */
    dispose() {
        // Override in subclass to clean up GPU resources
    }
    
    /**
     * Get full-screen quad vertex shader (WGSL)
     */
    static getFullscreenQuadVertexWGSL() {
        return `
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>
};

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    
    // Full-screen triangle
    let x = f32((vertexIndex << 1u) & 2u);
    let y = f32(vertexIndex & 2u);
    
    output.position = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
    output.uv = vec2<f32>(x, 1.0 - y);
    
    return output;
}
`;
    }
    
    /**
     * Get full-screen quad vertex shader (GLSL)
     */
    static getFullscreenQuadVertexGLSL() {
        return `#version 300 es
precision highp float;

out vec2 vUv;

void main() {
    // Full-screen triangle
    float x = float((gl_VertexID << 1) & 2);
    float y = float(gl_VertexID & 2);
    
    gl_Position = vec4(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
    vUv = vec2(x, 1.0 - y);
}
`;
    }
}
