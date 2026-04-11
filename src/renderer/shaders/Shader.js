/**
 * Shader - Base class for shader programs
 * 
 * Phase 2: Shader-Driven Baseline Renderer
 * Provides abstraction for vertex and fragment shaders across GPU APIs
 */
export class Shader {
  constructor(vertexSource, fragmentSource, uniforms = {}) {
    this.vertexSource = vertexSource;
    this.fragmentSource = fragmentSource;
    this.uniforms = uniforms;
    
    // Compiled shader objects (API-specific)
    this.compiled = null;
    
    // Uniform locations cache
    this.uniformLocations = new Map();
    
    // Attribute locations cache
    this.attributeLocations = new Map();
  }

  /**
   * Compile shader for the target API
   * @param {string} api - 'webgpu' or 'webgl2'
   * @param {Object} context - GPU context (device for WebGPU, gl for WebGL2)
   */
  compile(api, context) {
    throw new Error('Shader.compile() must be implemented by subclass');
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
   * Dispose of shader resources
   */
  dispose() {
    this.compiled = null;
    this.uniformLocations.clear();
    this.attributeLocations.clear();
  }
}
