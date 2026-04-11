/**
 * RenderTarget.js
 * 
 * Represents a render target (framebuffer) with color and depth attachments.
 * Supports both WebGPU and WebGL2 backends for render-to-texture operations.
 * 
 * Phase 3: Render Target Management
 */

export default class RenderTarget {
    constructor(width, height, options = {}) {
        this.width = width;
        this.height = height;
        
        // Options
        this.format = options.format || 'rgba8unorm'; // WebGPU format
        this.hasDepth = options.depth !== false; // Default to true
        this.samples = options.samples || 1; // MSAA samples
        this.minFilter = options.minFilter || 'linear';
        this.magFilter = options.magFilter || 'linear';
        this.wrapS = options.wrapS || 'clamp-to-edge';
        this.wrapT = options.wrapT || 'clamp-to-edge';
        
        // GPU resources (created by backend)
        this.gpuTexture = null; // WebGPU: GPUTexture
        this.gpuDepthTexture = null; // WebGPU: GPUTexture (depth)
        this.gpuTextureView = null; // WebGPU: GPUTextureView
        this.gpuDepthTextureView = null; // WebGPU: GPUTextureView (depth)
        
        this.glFramebuffer = null; // WebGL2: WebGLFramebuffer
        this.glTexture = null; // WebGL2: WebGLTexture (color)
        this.glDepthBuffer = null; // WebGL2: WebGLRenderbuffer or WebGLTexture
        
        // Metadata
        this.isRenderTarget = true;
        this.needsUpdate = true;
    }
    
    /**
     * Resize the render target
     */
    resize(width, height) {
        if (this.width === width && this.height === height) {
            return;
        }
        
        this.width = width;
        this.height = height;
        this.needsUpdate = true;
        
        // Dispose existing resources (backend will recreate)
        this.dispose();
    }
    
    /**
     * Get the color texture (for sampling in shaders)
     */
    getColorTexture() {
        return this.gpuTexture || this.glTexture;
    }
    
    /**
     * Get the depth texture (if available for sampling)
     */
    getDepthTexture() {
        return this.gpuDepthTexture || this.glDepthBuffer;
    }
    
    /**
     * Dispose of GPU resources
     */
    dispose() {
        // WebGPU cleanup
        if (this.gpuTexture) {
            this.gpuTexture.destroy();
            this.gpuTexture = null;
        }
        if (this.gpuDepthTexture) {
            this.gpuDepthTexture.destroy();
            this.gpuDepthTexture = null;
        }
        this.gpuTextureView = null;
        this.gpuDepthTextureView = null;
        
        // WebGL2 cleanup (context-dependent, backend handles it)
        this.glFramebuffer = null;
        this.glTexture = null;
        this.glDepthBuffer = null;
        
        this.needsUpdate = true;
    }
    
    /**
     * Get WebGPU format string based on format name
     */
    static getWebGPUFormat(format) {
        const formatMap = {
            'rgba8unorm': 'rgba8unorm',
            'rgba16float': 'rgba16float',
            'rgba32float': 'rgba32float',
            'bgra8unorm': 'bgra8unorm',
            'depth24plus': 'depth24plus',
            'depth32float': 'depth32float'
        };
        return formatMap[format] || 'rgba8unorm';
    }
    
    /**
     * Get WebGL format constants
     */
    static getWebGLFormat(gl, format) {
        const formatMap = {
            'rgba8unorm': { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE },
            'rgba16float': { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT },
            'rgba32float': { internalFormat: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT }
        };
        return formatMap[format] || formatMap['rgba8unorm'];
    }
    
    /**
     * Get WebGL filter constant
     */
    static getWebGLFilter(gl, filter) {
        return filter === 'linear' ? gl.LINEAR : gl.NEAREST;
    }
    
    /**
     * Get WebGL wrap constant
     */
    static getWebGLWrap(gl, wrap) {
        const wrapMap = {
            'repeat': gl.REPEAT,
            'clamp-to-edge': gl.CLAMP_TO_EDGE,
            'mirrored-repeat': gl.MIRRORED_REPEAT
        };
        return wrapMap[wrap] || gl.CLAMP_TO_EDGE;
    }
}
