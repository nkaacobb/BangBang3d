/**
 * BasicMaterialShader - Shader for BasicMaterial rendering
 * 
 * Phase 2: Provides vertex and fragment shaders for unlit, flat-color rendering
 * Supports both WebGPU (WGSL) and WebGL2 (GLSL)
 */
import { Shader } from './Shader.js';

/**
 * WGSL Shader Source (WebGPU)
 */
const WGSL_VERTEX = `
struct Uniforms {
  modelViewProjection: mat4x4<f32>,
  model: mat4x4<f32>,
}

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
}

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  
  // Transform vertex position
  let worldPos = uniforms.model * vec4<f32>(input.position, 1.0);
  output.position = uniforms.modelViewProjection * vec4<f32>(input.position, 1.0);
  output.worldPosition = worldPos.xyz;
  
  // Transform normal
  let worldNormal = (uniforms.model * vec4<f32>(input.normal, 0.0)).xyz;
  output.normal = normalize(worldNormal);
  
  output.uv = input.uv;
  
  return output;
}
`;

const WGSL_FRAGMENT = `
struct FragmentInput {
  @location(0) worldPosition: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
}

struct MaterialUniforms {
  color: vec4<f32>,
  opacity: f32,
}

@group(0) @binding(1) var<uniform> material: MaterialUniforms;
@group(0) @binding(2) var textureSampler: sampler;
@group(0) @binding(3) var textureData: texture_2d<f32>;

@fragment
fn main(input: FragmentInput) -> @location(0) vec4<f32> {
  // Sample texture
  let texColor = textureSample(textureData, textureSampler, input.uv);
  
  // Combine with material color
  let finalColor = material.color * texColor;
  
  return vec4<f32>(finalColor.rgb, finalColor.a * material.opacity);
}
`;

/**
 * GLSL Shader Source (WebGL2)
 */
const GLSL_VERTEX = `#version 300 es
precision highp float;

uniform mat4 uModelViewProjection;
uniform mat4 uModel;

in vec3 aPosition;
in vec3 aNormal;
in vec2 aUV;

out vec3 vWorldPosition;
out vec3 vNormal;
out vec2 vUV;

void main() {
  gl_Position = uModelViewProjection * vec4(aPosition, 1.0);
  vWorldPosition = (uModel * vec4(aPosition, 1.0)).xyz;
  vNormal = aNormal;
  vUV = aUV;
}
`;

const GLSL_FRAGMENT = `#version 300 es
precision highp float;

uniform vec4 uColor;
uniform float uOpacity;
uniform sampler2D uTexture;
uniform bool uHasTexture;
uniform bool uFlatShading;

in vec3 vWorldPosition;
in vec3 vNormal;
in vec2 vUV;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 outNormalSSR;
layout(location = 2) out vec4 outMaterialSSR;

void main() {
  vec4 color = uColor;
  
  // Sample texture if available
  if (uHasTexture) {
    vec4 texColor = texture(uTexture, vUV);
    color = color * texColor;
  }
  
  // Apply opacity
  color.a = color.a * uOpacity;

  vec3 shadingNormal = normalize(vNormal);
  if (uFlatShading) {
    vec3 faceNormal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
    shadingNormal = gl_FrontFacing ? faceNormal : -faceNormal;
  }
  
  fragColor = color;

  // SSR G-buffer: Basic materials are non-reflective
  outNormalSSR  = vec4(shadingNormal * 0.5 + 0.5, 1.0);
  outMaterialSSR = vec4(0.0, 1.0, 0.0, 1.0); // metallic=0, roughness=1, reflectivity=0
}
`;

/**
 * BasicMaterialShader class
 */
export class BasicMaterialShader extends Shader {
  constructor() {
    super(
      { wgsl: WGSL_VERTEX, glsl: GLSL_VERTEX },
      { wgsl: WGSL_FRAGMENT, glsl: GLSL_FRAGMENT },
      {
        modelViewProjection: null,
        model: null,
        color: [1, 1, 1, 1],
        opacity: 1.0,
        hasTexture: false
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
        label: 'BasicMaterial Vertex Shader',
        code: this.vertexSource.wgsl
      });

      const fragmentModule = device.createShaderModule({
        label: 'BasicMaterial Fragment Shader',
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
      console.error('[BasicMaterialShader] WebGPU compilation error:', error);
      throw error;
    }
  }

  /**
   * Compile for WebGL2
   */
  _compileWebGL2(gl) {
    try {
      // Create and compile vertex shader
      const vertexShader = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vertexShader, this.vertexSource.glsl);
      gl.compileShader(vertexShader);

      if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
        const infoLog = gl.getShaderInfoLog(vertexShader);
        const sourceLines = this.vertexSource.glsl.split('\n');
        const sourcePreview = sourceLines.slice(0, 30).join('\n') + 
          (sourceLines.length > 30 ? '\n... (' + (sourceLines.length - 30) + ' more lines)' : '');
        const error = new Error(`Vertex shader compilation failed:\n${infoLog}\n\nShader source (first 30 lines):\n${sourcePreview}`);
        error.shaderType = 'vertex';
        error.infoLog = infoLog;
        error.shaderSource = this.vertexSource.glsl;
        throw error;
      }

      // Create and compile fragment shader
      const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fragmentShader, this.fragmentSource.glsl);
      gl.compileShader(fragmentShader);

      if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
        const infoLog = gl.getShaderInfoLog(fragmentShader);
        const sourceLines = this.fragmentSource.glsl.split('\n');
        const sourcePreview = sourceLines.slice(0, 30).join('\n') + 
          (sourceLines.length > 30 ? '\n... (' + (sourceLines.length - 30) + ' more lines)' : '');
        const error = new Error(`Fragment shader compilation failed:\n${infoLog}\n\nShader source (first 30 lines):\n${sourcePreview}`);
        error.shaderType = 'fragment';
        error.infoLog = infoLog;
        error.shaderSource = this.fragmentSource.glsl;
        throw error;
      }

      // Create and link program
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const infoLog = gl.getProgramInfoLog(program);
        const error = new Error(`Shader program linking failed:\n${infoLog}`);
        error.programInfoLog = infoLog;
        throw error;
      }

      // Cache attribute locations
      this.attributeLocations.set('aPosition', gl.getAttribLocation(program, 'aPosition'));
      this.attributeLocations.set('aNormal', gl.getAttribLocation(program, 'aNormal'));
      this.attributeLocations.set('aUV', gl.getAttribLocation(program, 'aUV'));

      // Cache uniform locations
      this.uniformLocations.set('uModelViewProjection', gl.getUniformLocation(program, 'uModelViewProjection'));
      this.uniformLocations.set('uModel', gl.getUniformLocation(program, 'uModel'));
      this.uniformLocations.set('uColor', gl.getUniformLocation(program, 'uColor'));
      this.uniformLocations.set('uOpacity', gl.getUniformLocation(program, 'uOpacity'));
      this.uniformLocations.set('uTexture', gl.getUniformLocation(program, 'uTexture'));
      this.uniformLocations.set('uHasTexture', gl.getUniformLocation(program, 'uHasTexture'));
      this.uniformLocations.set('uFlatShading', gl.getUniformLocation(program, 'uFlatShading'));

      this.compiled = {
        api: 'webgl2',
        program,
        vertexShader,
        fragmentShader,
        gl
      };

      return this.compiled;
    } catch (error) {
      console.error('[BasicMaterialShader] WebGL2 compilation error:', error);
      throw error;
    }
  }

  /**
   * Dispose of shader resources
   */
  dispose() {
    if (this.compiled) {
      if (this.compiled.api === 'webgl2') {
        const gl = this.compiled.gl;
        gl.deleteProgram(this.compiled.program);
        gl.deleteShader(this.compiled.vertexShader);
        gl.deleteShader(this.compiled.fragmentShader);
      }
      // WebGPU resources are garbage collected
    }
    
    super.dispose();
  }
}
