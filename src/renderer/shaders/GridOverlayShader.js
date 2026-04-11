/**
 * GridOverlayShader - Procedural infinite grid with adaptive density
 * 
 * Renders a Blender-like viewport grid with:
 * - Adaptive grid lines based on distance
 * - Colored axis highlights (red X, green Z)
 * - Origin indicator
 * - Distance-based fading
 * - Horizon gradient
 */

import { Shader } from './Shader.js';

/**
 * WGSL Shader Source (WebGPU)
 */
const WGSL_VERTEX = `
struct TransformUniforms {
    mvpMatrix: mat4x4<f32>,
    modelMatrix: mat4x4<f32>
};

struct MaterialUniforms {
    gridScale: f32,
    gridOpacity: f32,
    fadeDistance: f32,
    adaptive: f32,
    axisXColor: vec4<f32>,
    axisZColor: vec4<f32>,
    horizonColor: vec4<f32>,
    majorLineInterval: f32,
    cameraPositionX: f32,
    cameraPositionY: f32,
    cameraPositionZ: f32,
    gridAlpha: f32,
    padding0: f32,
    padding1: f32,
    padding2: f32
};

@group(0) @binding(0) var<uniform> transform: TransformUniforms;
@group(0) @binding(1) var<uniform> material: MaterialUniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) worldPosition: vec3<f32>,
    @location(1) viewDistance: f32
};

@vertex
fn main(
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>
) -> VertexOutput {
    var output: VertexOutput;
    
    let worldPos = transform.modelMatrix * vec4<f32>(position, 1.0);
    output.worldPosition = worldPos.xyz;
    output.position = transform.mvpMatrix * worldPos; // FIXED: Use worldPos for consistent transforms
    
    // FIXED: Distance from camera, not origin
    let cameraPos = vec3<f32>(material.cameraPositionX, material.cameraPositionY, material.cameraPositionZ);
    output.viewDistance = length(worldPos.xyz - cameraPos);
    
    return output;
}
`;

const WGSL_FRAGMENT = `
struct MaterialUniforms {
    gridScale: f32,
    gridOpacity: f32,
    fadeDistance: f32,
    adaptive: f32,
    axisXColor: vec4<f32>,
    axisZColor: vec4<f32>,
    horizonColor: vec4<f32>,
    majorLineInterval: f32,
    cameraPositionX: f32,
    cameraPositionY: f32,
    cameraPositionZ: f32,
    gridAlpha: f32,
    gridColorR: f32,
    gridColorG: f32,
    gridColorB: f32
};

@group(0) @binding(1) var<uniform> material: MaterialUniforms;

// Grid line function - matches CPU implementation
fn gridLine(coord: f32, scale: f32, lineWidth: f32) -> f32 {
    let scaled = coord * scale;
    // Use much smaller derivative for thicker, more visible lines
    let derivative = 0.005; 
    let grid = abs(fract(scaled - 0.5) - 0.5) / derivative;
    let line = 1.0 - min(grid / lineWidth, 1.0);
    return max(line, 0.0);
}

// Adaptive grid scale based on distance
fn getAdaptiveScale(distance: f32) -> f32 {
    let logDist = log2(max(distance * 0.1, 1.0));
    return pow(2.0, floor(logDist));
}

@fragment
fn main(
    @location(0) worldPosition: vec3<f32>,
    @location(1) viewDistance: f32
) -> @location(0) vec4<f32> {
    // Base grid scale
    let scale = material.gridScale;
    
    // Grid lines on X and Z axes - make them VERY visible
    let gridX = gridLine(worldPosition.x, scale, 2.0);
    let gridZ = gridLine(worldPosition.z, scale, 2.0);
    let grid = max(gridX, gridZ);
    
    // Major grid lines (every N units) - thicker
    let majorScale = scale / material.majorLineInterval;
    let majorGridX = gridLine(worldPosition.x, majorScale, 3.0);
    let majorGridZ = gridLine(worldPosition.z, majorScale, 3.0);
    let majorGrid = max(majorGridX, majorGridZ);
    
    // World axes (much thicker, colored) - make them prominent like Blender
    let axisThreshold = 0.08; // Fixed threshold
    let onAxisX = abs(worldPosition.z) < axisThreshold;
    let onAxisZ = abs(worldPosition.x) < axisThreshold;
    
    // Origin point (where axes cross)
    let atOrigin = abs(worldPosition.x) < axisThreshold * 2.0 && abs(worldPosition.z) < axisThreshold * 2.0;
    
    // Distance fade - more gradual
    let fade = 1.0 - smoothstep(material.fadeDistance * 0.3, material.fadeDistance, viewDistance);
    
    // Start with base grid - make base grid lines MUCH more visible
    var color = vec3<f32>(0.5, 0.5, 0.5); // Medium gray
    var alpha = (grid * 0.7 + majorGrid * 0.5) * fade * material.gridOpacity;
    
    // Boost grid visibility
    alpha = alpha * 1.5;
    
    // Make grid lines visible
    if (grid > 0.01 || majorGrid > 0.01) {
        color = vec3<f32>(material.gridColorR, material.gridColorG, material.gridColorB); // Use material's grid color
        alpha = max(alpha, material.gridAlpha); // Use material's alpha value
    }
    
    // Axis lines (much brighter and colored) - these should stand out
    if (onAxisX && !onAxisZ) {
        color = material.axisXColor.rgb;
        alpha = 0.95 * material.gridOpacity; // Nearly opaque
    }
    if (onAxisZ && !onAxisX) {
        color = material.axisZColor.rgb;
        alpha = 0.95 * material.gridOpacity; // Nearly opaque
    }
    
    // Origin emphasis - bright where axes cross
    if (atOrigin) {
        alpha = 1.0 * material.gridOpacity;
        color = mix(material.axisXColor.rgb, material.axisZColor.rgb, 0.5);
    }
    
    // Don't fade horizon too much
    let horizonFade = smoothstep(material.fadeDistance * 0.85, material.fadeDistance, viewDistance);
    color = mix(color, material.horizonColor.rgb, horizonFade * 0.3);
    
    // Clamp alpha
    alpha = clamp(alpha, 0.0, 1.0);
    
    return vec4<f32>(color, alpha);
}
`;

/**
 * GLSL Shader Source (WebGL2)
 */
const GLSL_VERTEX = `#version 300 es
precision highp float;

uniform mat4 mvpMatrix;
uniform mat4 modelMatrix;
uniform vec3 cameraPosition;

in vec3 position;
in vec3 normal;
in vec2 uv;

out vec3 vWorldPosition;
out float vViewDistance;

void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    // FIXED: Use worldPos for consistent transforms
    gl_Position = mvpMatrix * worldPos;
    // FIXED: Distance from camera, not origin
    vViewDistance = length(worldPos.xyz - cameraPosition);
}
`;

const GLSL_FRAGMENT = `#version 300 es
precision highp float;

uniform float gridScale;
uniform float gridOpacity;
uniform float fadeDistance;
uniform float adaptive;
uniform vec3 axisXColor;
uniform vec3 axisZColor;
uniform vec3 horizonColor;
uniform float majorLineInterval;
uniform vec3 cameraPosition;
uniform float gridAlpha;
uniform vec3 gridColor;

in vec3 vWorldPosition;
in float vViewDistance;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 outNormalSSR;
layout(location = 2) out vec4 outMaterialSSR;

// Grid line function - matches CPU implementation
float gridLine(float coord, float scale, float lineWidth) {
    float scaled = coord * scale;
    // Use much smaller derivative for thicker, more visible lines
    float derivative = 0.005;
    float grid = abs(fract(scaled - 0.5) - 0.5) / derivative;
    float line = 1.0 - min(grid / lineWidth, 1.0);
    return max(line, 0.0);
}

// Adaptive grid scale based on distance
float getAdaptiveScale(float distance) {
    float logDist = log2(max(distance * 0.1, 1.0));
    return pow(2.0, floor(logDist));
}

void main() {
    // Base grid scale
    float scale = gridScale;
    
    // Grid lines on X and Z axes - make them VERY visible
    float gridX = gridLine(vWorldPosition.x, scale, 2.0);
    float gridZ = gridLine(vWorldPosition.z, scale, 2.0);
    float grid = max(gridX, gridZ);
    
    // Major grid lines - thicker
    float majorScale = scale / majorLineInterval;
    float majorGridX = gridLine(vWorldPosition.x, majorScale, 3.0);
    float majorGridZ = gridLine(vWorldPosition.z, majorScale, 3.0);
    float majorGrid = max(majorGridX, majorGridZ);
    
    // World axes (much thicker, colored)
    float axisThreshold = 0.08;
    bool onAxisX = abs(vWorldPosition.z) < axisThreshold;
    bool onAxisZ = abs(vWorldPosition.x) < axisThreshold;
    
    // Origin point
    bool atOrigin = abs(vWorldPosition.x) < axisThreshold * 2.0 && abs(vWorldPosition.z) < axisThreshold * 2.0;
    
    // Distance fade
    float fade = 1.0 - smoothstep(fadeDistance * 0.3, fadeDistance, vViewDistance);
    
    // Start with base grid - make MUCH more visible
    vec3 color = vec3(0.5); // Medium gray
    float alpha = (grid * 0.7 + majorGrid * 0.5) * fade * gridOpacity;
    
    // Boost grid visibility
    alpha = alpha * 1.5;
    
    // Make grid lines visible
    if (grid > 0.01 || majorGrid > 0.01) {
        color = gridColor; // Use gridColor uniform
        alpha = max(alpha, gridAlpha); // Use gridAlpha uniform
    }
    
    // Axis lines
    if (onAxisX && !onAxisZ) {
        color = axisXColor;
        alpha = 0.95 * gridOpacity;
    }
    if (onAxisZ && !onAxisX) {
        color = axisZColor;
        alpha = 0.95 * gridOpacity;
    }
    
    // Origin emphasis
    if (atOrigin) {
        alpha = 1.0 * gridOpacity;
        color = mix(axisXColor, axisZColor, 0.5);
    }
    
    // Horizon fade
    float horizonFade = smoothstep(fadeDistance * 0.85, fadeDistance, vViewDistance);
    color = mix(color, horizonColor, horizonFade * 0.3);
    
    // Clamp alpha
    alpha = clamp(alpha, 0.0, 1.0);
    
    fragColor = vec4(color, alpha);

    // SSR: grid is non-reflective
    outNormalSSR  = vec4(0.5, 1.0, 0.5, 1.0); // up normal
    outMaterialSSR = vec4(0.0, 1.0, 0.0, 1.0);
}
`;

/**
 * GridOverlayShader class
 */
export class GridOverlayShader extends Shader {
  constructor() {
    super(
      { wgsl: WGSL_VERTEX, glsl: GLSL_VERTEX },
      { wgsl: WGSL_FRAGMENT, glsl: GLSL_FRAGMENT },
      {
        gridScale: 1.0,
        gridOpacity: 0.5,
        fadeDistance: 50.0,
        adaptive: 1.0,
        axisXColor: [0.8, 0.1, 0.1],
        axisZColor: [0.1, 0.8, 0.1],
        horizonColor: [0.5, 0.5, 0.5],
        majorLineInterval: 10.0
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
        label: 'GridOverlay Vertex Shader',
        code: this.vertexSource.wgsl
      });

      const fragmentModule = device.createShaderModule({
        label: 'GridOverlay Fragment Shader',
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
      console.error('[GridOverlayShader] WebGPU compilation error:', error);
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
        throw new Error(`GridOverlay vertex shader compilation failed:\n${infoLog}`);
      }

      // Create and compile fragment shader
      const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fragmentShader, this.fragmentSource.glsl);
      gl.compileShader(fragmentShader);

      if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
        const infoLog = gl.getShaderInfoLog(fragmentShader);
        throw new Error(`GridOverlay fragment shader compilation failed:\n${infoLog}`);
      }

      // Create and link program
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const infoLog = gl.getProgramInfoLog(program);
        throw new Error(`GridOverlay shader program linking failed:\n${infoLog}`);
      }

      // Cache attribute locations
      this.attributeLocations.set('position', gl.getAttribLocation(program, 'position'));
      this.attributeLocations.set('normal', gl.getAttribLocation(program, 'normal'));
      this.attributeLocations.set('uv', gl.getAttribLocation(program, 'uv'));

      // Cache uniform locations
      this.uniformLocations.set('mvpMatrix', gl.getUniformLocation(program, 'mvpMatrix'));
      this.uniformLocations.set('modelMatrix', gl.getUniformLocation(program, 'modelMatrix'));
      this.uniformLocations.set('gridScale', gl.getUniformLocation(program, 'gridScale'));
      this.uniformLocations.set('gridOpacity', gl.getUniformLocation(program, 'gridOpacity'));
      this.uniformLocations.set('fadeDistance', gl.getUniformLocation(program, 'fadeDistance'));
      this.uniformLocations.set('adaptive', gl.getUniformLocation(program, 'adaptive'));
      this.uniformLocations.set('axisXColor', gl.getUniformLocation(program, 'axisXColor'));
      this.uniformLocations.set('axisZColor', gl.getUniformLocation(program, 'axisZColor'));
      this.uniformLocations.set('horizonColor', gl.getUniformLocation(program, 'horizonColor'));
      this.uniformLocations.set('majorLineInterval', gl.getUniformLocation(program, 'majorLineInterval'));
      this.uniformLocations.set('cameraPosition', gl.getUniformLocation(program, 'cameraPosition'));
      this.uniformLocations.set('gridAlpha', gl.getUniformLocation(program, 'gridAlpha'));
      this.uniformLocations.set('gridColor', gl.getUniformLocation(program, 'gridColor'));

      this.compiled = {
        api: 'webgl2',
        program,
        vertexShader,
        fragmentShader,
        gl
      };

      return this.compiled;
    } catch (error) {
      console.error('[GridOverlayShader] WebGL2 compilation error:', error);
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
