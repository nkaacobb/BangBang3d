/**
 * ShadowDepthShader - Shader for rendering depth-only for shadow maps
 * 
 * Phase 1: Shadow Maps
 * Minimal shader that only transforms vertices and outputs depth
 * Used for rendering shadow maps from light's perspective
 */
import { Shader } from './Shader.js';

/**
 * WGSL Shader Source (WebGPU)
 */
const WGSL_VERTEX = `
struct Uniforms {
  lightViewProjection: mat4x4<f32>,
  model: mat4x4<f32>,
}

struct VertexInput {
  @location(0) position: vec3<f32>,
}

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  
  // Transform to light space
  let worldPos = uniforms.model * vec4<f32>(input.position, 1.0);
  output.position = uniforms.lightViewProjection * worldPos;
  
  return output;
}
`;

const WGSL_FRAGMENT = `
@fragment
fn main() -> @location(0) vec4<f32> {
  // Depth is written automatically to depth buffer
  // We output a dummy color (won't be used, only depth matters)
  return vec4<f32>(1.0, 1.0, 1.0, 1.0);
}
`;

/**
 * GLSL Shader Source (WebGL2)
 */
const GLSL_VERTEX = `#version 300 es
precision highp float;

uniform mat4 uLightViewProjection;
uniform mat4 uModel;

in vec3 aPosition;

void main() {
  vec4 worldPos = uModel * vec4(aPosition, 1.0);
  gl_Position = uLightViewProjection * worldPos;
}
`;

const GLSL_FRAGMENT = `#version 300 es
precision highp float;

out vec4 fragColor;

void main() {
  // Depth is written automatically to depth buffer
  // Output dummy color (won't be used, only depth matters)
  fragColor = vec4(1.0, 1.0, 1.0, 1.0);
}
`;

/**
 * ShadowDepthShader class
 */
export class ShadowDepthShader extends Shader {
  constructor() {
    super(
      { wgsl: WGSL_VERTEX, glsl: GLSL_VERTEX },
      { wgsl: WGSL_FRAGMENT, glsl: GLSL_FRAGMENT },
      {
        lightViewProjection: null,
        model: null
      }
    );
  }

  /**
   * Compile shader for the target API
   */
  compile(api, context) {
    if (api === 'webgpu') {
      return this._compileWebGPU(context);
    } else if (api === 'webgl2') {
      return this._compileWebGL2(context);
    } else {
      throw new Error(`Unknown API: ${api}`);
    }
  }

  /**
   * Compile for WebGPU
   */
  _compileWebGPU(device) {
    try {
      // Create shader modules
      const vertexModule = device.createShaderModule({
        label: 'ShadowDepth Vertex Shader',
        code: this.vertexSource.wgsl
      });

      const fragmentModule = device.createShaderModule({
        label: 'ShadowDepth Fragment Shader',
        code: this.fragmentSource.wgsl
      });

      this.compiled = {
        api: 'webgpu',
        vertexModule,
        fragmentModule,
        device
      };

      return this.compiled;
    } catch (error) {
      console.error('[ShadowDepthShader] WebGPU compilation error:', error);
      throw error;
    }
  }

  /**
   * Compile for WebGL2
   */
  _compileWebGL2(gl) {
    try {
      // Compile vertex shader
      const vertexShader = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vertexShader, this.vertexSource.glsl);
      gl.compileShader(vertexShader);

      if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(vertexShader);
        throw new Error(`Vertex shader compile error: ${info}`);
      }

      // Compile fragment shader
      const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fragmentShader, this.fragmentSource.glsl);
      gl.compileShader(fragmentShader);

      if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(fragmentShader);
        throw new Error(`Fragment shader compile error: ${info}`);
      }

      // Link program
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program);
        throw new Error(`Shader program link error: ${info}`);
      }

      // Get uniform locations
      const uniformLocations = {
        uLightViewProjection: gl.getUniformLocation(program, 'uLightViewProjection'),
        uModel: gl.getUniformLocation(program, 'uModel')
      };

      // Get attribute locations
      const attributeLocations = {
        aPosition: gl.getAttribLocation(program, 'aPosition')
      };

      this.compiled = {
        api: 'webgl2',
        program,
        vertexShader,
        fragmentShader,
        uniformLocations,
        attributeLocations,
        gl
      };

      return this.compiled;
    } catch (error) {
      console.error('[ShadowDepthShader] WebGL2 compilation error:', error);
      throw error;
    }
  }

  /**
   * Clean up compiled shader resources
   */
  dispose() {
    if (!this.compiled) return;

    if (this.compiled.api === 'webgl2') {
      const { gl, program, vertexShader, fragmentShader } = this.compiled;
      
      if (program) {
        gl.deleteProgram(program);
      }
      if (vertexShader) {
        gl.deleteShader(vertexShader);
      }
      if (fragmentShader) {
        gl.deleteShader(fragmentShader);
      }
    }

    this.compiled = null;
  }
}
