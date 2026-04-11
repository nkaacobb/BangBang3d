/**
 * DebugMaterialShader - Shader for DebugMaterial rendering
 * 
 * Supports multiple debug visualization modes:
 * - normals: RGB = XYZ normal components
 * - depth: Grayscale depth visualization
 * - uvs: UV coordinates as RG
 * - worldPosition: World space position visualization
 */
import { Shader } from './Shader.js';

/**
 * WGSL Shader Source (WebGPU)
 */
const WGSL_VERTEX = `
struct Uniforms {
  modelViewProjection: mat4x4<f32>,
  model: mat4x4<f32>,
  normalMatrix: mat4x4<f32>,
}

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
}

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) depth: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  
  // Transform vertex position
  let worldPos = uniforms.model * vec4<f32>(input.position, 1.0);
  output.worldPosition = worldPos.xyz;
  output.position = uniforms.modelViewProjection * vec4<f32>(input.position, 1.0);
  
  // Transform normal (use normal matrix for non-uniform scaling)
  output.worldNormal = normalize((uniforms.normalMatrix * vec4<f32>(input.normal, 0.0)).xyz);
  
  output.uv = input.uv;
  output.depth = output.position.z;
  
  return output;
}
`;

const WGSL_FRAGMENT = `
struct FragmentInput {
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) depth: f32,
}

struct MaterialUniforms {
  mode: u32,          // 0=normals, 1=depth, 2=uvs, 3=worldPosition
  depthNear: f32,
  depthFar: f32,
  uvScale: f32,
}

@group(0) @binding(1) var<uniform> material: MaterialUniforms;

@fragment
fn main(input: FragmentInput) -> @location(0) vec4<f32> {
  var color = vec3<f32>(1.0, 0.0, 1.0); // Magenta fallback
  
  // Mode 0: Normals
  if (material.mode == 0u) {
    let normal = normalize(input.worldNormal);
    color = normal * 0.5 + 0.5; // Map [-1,1] to [0,1]
  }
  // Mode 1: Depth
  else if (material.mode == 1u) {
    let normalizedDepth = (input.depth - material.depthNear) / (material.depthFar - material.depthNear);
    let clamped = clamp(1.0 - normalizedDepth, 0.0, 1.0); // closer = brighter
    color = vec3<f32>(clamped);
  }
  // Mode 2: UVs
  else if (material.mode == 2u) {
    let u = fract(input.uv.x * material.uvScale);
    let v = fract(input.uv.y * material.uvScale);
    color = vec3<f32>(u, v, 0.0);
  }
  // Mode 3: World Position
  else if (material.mode == 3u) {
    let scale = 0.1;
    color = vec3<f32>(
      sin(input.worldPosition.x * scale) * 0.5 + 0.5,
      sin(input.worldPosition.y * scale) * 0.5 + 0.5,
      sin(input.worldPosition.z * scale) * 0.5 + 0.5
    );
  }
  
  return vec4<f32>(color, 1.0);
}
`;

/**
 * GLSL Shader Source (WebGL2)
 */
const GLSL_VERTEX = `#version 300 es
precision highp float;

uniform mat4 uModelViewProjection;
uniform mat4 uModel;
uniform mat4 uNormalMatrix;

in vec3 aPosition;
in vec3 aNormal;
in vec2 aUV;

out vec3 vWorldPosition;
out vec3 vWorldNormal;
out vec2 vUV;
out float vDepth;

void main() {
  vec4 worldPos = uModel * vec4(aPosition, 1.0);
  vWorldPosition = worldPos.xyz;
  gl_Position = uModelViewProjection * vec4(aPosition, 1.0);
  vWorldNormal = normalize((uNormalMatrix * vec4(aNormal, 0.0)).xyz);
  vUV = aUV;
  vDepth = gl_Position.z;
}
`;

const GLSL_FRAGMENT = `#version 300 es
precision highp float;

uniform uint uMode;        // 0=normals, 1=depth, 2=uvs, 3=worldPosition
uniform float uDepthNear;
uniform float uDepthFar;
uniform float uUVScale;

in vec3 vWorldPosition;
in vec3 vWorldNormal;
in vec2 vUV;
in float vDepth;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 outNormalSSR;
layout(location = 2) out vec4 outMaterialSSR;

void main() {
  vec3 color = vec3(1.0, 0.0, 1.0); // Magenta fallback
  
  // Mode 0: Normals
  if (uMode == 0u) {
    vec3 normal = normalize(vWorldNormal);
    color = normal * 0.5 + 0.5; // Map [-1,1] to [0,1]
  }
  // Mode 1: Depth
  else if (uMode == 1u) {
    float normalizedDepth = (vDepth - uDepthNear) / (uDepthFar - uDepthNear);
    float clamped = clamp(1.0 - normalizedDepth, 0.0, 1.0); // closer = brighter
    color = vec3(clamped);
  }
  // Mode 2: UVs
  else if (uMode == 2u) {
    float u = fract(vUV.x * uUVScale);
    float v = fract(vUV.y * uUVScale);
    color = vec3(u, v, 0.0);
  }
  // Mode 3: World Position
  else if (uMode == 3u) {
    float scale = 0.1;
    color = vec3(
      sin(vWorldPosition.x * scale) * 0.5 + 0.5,
      sin(vWorldPosition.y * scale) * 0.5 + 0.5,
      sin(vWorldPosition.z * scale) * 0.5 + 0.5
    );
  }
  
  fragColor = vec4(color, 1.0);

  // SSR: debug material is non-reflective
  outNormalSSR  = vec4(normalize(vWorldNormal) * 0.5 + 0.5, 1.0);
  outMaterialSSR = vec4(0.0, 1.0, 0.0, 1.0);
}
`;

/**
 * DebugMaterialShader class
 */
export class DebugMaterialShader extends Shader {
  constructor() {
    super(
      { wgsl: WGSL_VERTEX, glsl: GLSL_VERTEX },
      { wgsl: WGSL_FRAGMENT, glsl: GLSL_FRAGMENT },
      {
        modelViewProjection: null,
        model: null,
        normalMatrix: null,
        mode: 0, // 0=normals, 1=depth, 2=uvs, 3=worldPosition
        depthNear: 1.0,
        depthFar: 100.0,
        uvScale: 1.0
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
        label: 'DebugMaterial Vertex Shader',
        code: this.vertexSource.wgsl
      });

      const fragmentModule = device.createShaderModule({
        label: 'DebugMaterial Fragment Shader',
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
      console.error('[DebugMaterialShader] WebGPU compilation error:', error);
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
        throw new Error('Vertex shader compilation failed: ' + gl.getShaderInfoLog(vertexShader));
      }

      // Compile fragment shader
      const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fragmentShader, this.fragmentSource.glsl);
      gl.compileShader(fragmentShader);

      if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
        throw new Error('Fragment shader compilation failed: ' + gl.getShaderInfoLog(fragmentShader));
      }

      // Link program
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error('Shader program linking failed: ' + gl.getProgramInfoLog(program));
      }

      this.compiled = {
        api: 'webgl2',
        program,
        vertexShader,
        fragmentShader,
        gl
      };

      return this.compiled;
    } catch (error) {
      console.error('[DebugMaterialShader] WebGL2 compilation error:', error);
      throw error;
    }
  }
}
