/**
 * LambertMaterialShader - Shader for LambertMaterial rendering
 * 
 * Phase 2: Provides vertex and fragment shaders for diffuse lighting
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
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  
  output.position = uniforms.modelViewProjection * vec4<f32>(input.position, 1.0);
  output.worldPosition = (uniforms.model * vec4<f32>(input.position, 1.0)).xyz;
  output.worldNormal = normalize((uniforms.normalMatrix * vec4<f32>(input.normal, 0.0)).xyz);
  output.uv = input.uv;
  
  return output;
}
`;

const WGSL_FRAGMENT = `
struct FragmentInput {
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
}

struct MaterialUniforms {
  color: vec4<f32>,
  opacity: f32,
  ambientIntensity: f32,
  padding: vec2<f32>,
}

struct PointLightData {
  position: vec3<f32>,
  padding1: f32,
  color: vec3<f32>,
  intensity: f32,
  distance: f32,
  decay: f32,
  padding2: vec2<f32>,
}

struct SpotLightData {
  position: vec3<f32>,
  padding1: f32,
  direction: vec3<f32>,
  padding2: f32,
  color: vec3<f32>,
  intensity: f32,
  distance: f32,
  angle: f32,
  penumbra: f32,
  decay: f32,
  padding3: vec2<f32>,
}

struct LightData {
  ambientColor: vec3<f32>,
  ambientIntensity: f32,
  directionalColor: vec3<f32>,
  directionalIntensity: f32,
  directionalDirection: vec3<f32>,
  hemisphereEnabled: f32,
  hemisphereSkyColor: vec3<f32>,
  hemisphereIntensity: f32,
  hemisphereGroundColor: vec3<f32>,
  numPointLights: f32,
  numSpotLights: f32,
  padding: vec2<f32>,
  pointLights: array<PointLightData, 8>,
  spotLights: array<SpotLightData, 4>,
}

@group(0) @binding(1) var<uniform> material: MaterialUniforms;
@group(0) @binding(2) var<uniform> lighting: LightData;
@group(0) @binding(3) var textureSampler: sampler;
@group(0) @binding(4) var textureData: texture_2d<f32>;

fn calculatePointLight(light: PointLightData, worldPos: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
  let lightVec = light.position - worldPos;
  let distance = length(lightVec);
  let lightDir = normalize(lightVec);
  
  // Distance attenuation
  var attenuation = 1.0;
  if (light.distance > 0.0) {
    if (light.decay == 1.0) {
      // Linear decay
      attenuation = max(0.0, 1.0 - distance / light.distance);
    } else {
      // Inverse square decay (physically accurate)
      let att = 1.0 / max(distance * distance, 0.0001);
      let cutoff = 1.0 / max(light.distance * light.distance, 0.0001);
      attenuation = max(0.0, (att - cutoff) / (1.0 - cutoff));
    }
  }
  
  // Diffuse lighting
  let diff = max(dot(normal, lightDir), 0.0);
  
  return light.color * light.intensity * diff * attenuation;
}

fn calculateSpotLight(light: SpotLightData, worldPos: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
  let lightVec = light.position - worldPos;
  let distance = length(lightVec);
  let lightDir = normalize(lightVec);
  
  // Distance attenuation
  var distAttenuation = 1.0;
  if (light.distance > 0.0) {
    if (light.decay == 1.0) {
      distAttenuation = max(0.0, 1.0 - distance / light.distance);
    } else {
      let att = 1.0 / max(distance * distance, 0.0001);
      let cutoff = 1.0 / max(light.distance * light.distance, 0.0001);
      distAttenuation = max(0.0, (att - cutoff) / (1.0 - cutoff));
    }
  }
  
  // Angular attenuation (spotlight cone)
  let spotDir = normalize(light.direction);
  let cosTheta = dot(-lightDir, spotDir);
  let outerCone = cos(light.angle);
  let innerCone = cos(light.angle * (1.0 - light.penumbra));
  
  var angularAttenuation = 0.0;
  if (cosTheta > outerCone) {
    if (cosTheta > innerCone) {
      angularAttenuation = 1.0;
    } else {
      angularAttenuation = (cosTheta - outerCone) / (innerCone - outerCone);
    }
  }
  
  // Diffuse lighting
  let diff = max(dot(normal, lightDir), 0.0);
  
  return light.color * light.intensity * diff * distAttenuation * angularAttenuation;
}

@fragment
fn main(input: FragmentInput) -> @location(0) vec4<f32> {
  var color = material.color;
  
  // Sample texture
  let texColor = textureSample(textureData, textureSampler, input.uv);
  color = color * texColor;
  
  // Calculate lighting
  let normal = normalize(input.worldNormal);
  
  // Ambient
  var finalColor = color.rgb * lighting.ambientColor * lighting.ambientIntensity;
  
  // Hemisphere light
  if (lighting.hemisphereEnabled > 0.5) {
    let t = normal.y * 0.5 + 0.5;
    let hemiColor = mix(lighting.hemisphereGroundColor, lighting.hemisphereSkyColor, t);
    finalColor += color.rgb * hemiColor * lighting.hemisphereIntensity;
  }
  
  // Directional light (diffuse)
  if (lighting.directionalIntensity > 0.0) {
    let lightDir = normalize(-lighting.directionalDirection);
    let diff = max(dot(normal, lightDir), 0.0);
    finalColor += color.rgb * lighting.directionalColor * lighting.directionalIntensity * diff;
  }
  
  // Point lights
  let numPointLights = i32(lighting.numPointLights);
  for (var i = 0; i < numPointLights; i = i + 1) {
    if (i >= 8) { break; }
    finalColor += color.rgb * calculatePointLight(lighting.pointLights[i], input.worldPosition, normal);
  }
  
  // Spot lights
  let numSpotLights = i32(lighting.numSpotLights);
  for (var i = 0; i < numSpotLights; i = i + 1) {
    if (i >= 4) { break; }
    finalColor += color.rgb * calculateSpotLight(lighting.spotLights[i], input.worldPosition, normal);
  }
  
  return vec4<f32>(finalColor, color.a * material.opacity);
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

void main() {
  gl_Position = uModelViewProjection * vec4(aPosition, 1.0);
  vWorldPosition = (uModel * vec4(aPosition, 1.0)).xyz;
  vWorldNormal = normalize((uNormalMatrix * vec4(aNormal, 0.0)).xyz);
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

// Ambient and directional lighting
uniform vec3 uAmbientColor;
uniform float uAmbientIntensity;
uniform vec3 uDirectionalColor;
uniform float uDirectionalIntensity;
uniform vec3 uDirectionalDirection;

// Hemisphere lighting
uniform float uHemisphereEnabled;
uniform vec3 uHemisphereSkyColor;
uniform vec3 uHemisphereGroundColor;
uniform float uHemisphereIntensity;

// Point lights (up to 8)
uniform int uNumPointLights;
uniform vec3 uPointLightPositions[8];
uniform vec3 uPointLightColors[8];
uniform float uPointLightIntensities[8];
uniform float uPointLightDistances[8];
uniform float uPointLightDecays[8];

// Spot lights (up to 4)
uniform int uNumSpotLights;
uniform vec3 uSpotLightPositions[4];
uniform vec3 uSpotLightDirections[4];
uniform vec3 uSpotLightColors[4];
uniform float uSpotLightIntensities[4];
uniform float uSpotLightDistances[4];
uniform float uSpotLightAngles[4];
uniform float uSpotLightPenumbras[4];
uniform float uSpotLightDecays[4];

// Phase 1: Shadow maps (up to 2 shadow-casting lights)
uniform bool uShadowsEnabled;
uniform bool uDirectionalCastsShadow;
uniform bool uSpotLightCastsShadow[4];
uniform sampler2D uDirectionalShadowMap;
uniform sampler2D uSpotLightShadowMaps[4];
uniform mat4 uDirectionalShadowMatrix;
uniform mat4 uSpotLightShadowMatrices[4];
uniform float uDirectionalShadowBias;
uniform float uSpotLightShadowBiases[4];

in vec3 vWorldPosition;
in vec3 vWorldNormal;
in vec2 vUV;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 outNormalSSR;
layout(location = 2) out vec4 outMaterialSSR;

// Phase 1: Hard shadow sampling (single depth comparison)
float sampleDirectionalShadow(vec3 worldPos) {
  if (!uDirectionalCastsShadow || !uShadowsEnabled) {
    return 1.0; // Fully lit
  }

  // Transform world position to shadow map space
  vec4 shadowCoord = uDirectionalShadowMatrix * vec4(worldPos, 1.0);
  
  // Perspective divide (already in NDC for orthographic, but doesn't hurt)
  shadowCoord.xyz /= shadowCoord.w;
  
  // Check if outside shadow map bounds (fully lit)
  if (shadowCoord.x < 0.0 || shadowCoord.x > 1.0 ||
      shadowCoord.y < 0.0 || shadowCoord.y > 1.0 ||
      shadowCoord.z < 0.0 || shadowCoord.z > 1.0) {
    return 1.0;
  }
  
  // Sample shadow map depth
  float shadowDepth = texture(uDirectionalShadowMap, shadowCoord.xy).r;
  
  // Compare with current depth (with bias to reduce shadow acne)
  float currentDepth = shadowCoord.z - uDirectionalShadowBias;
  
  // Hard shadow: 0.0 (in shadow) or 1.0 (lit)
  return currentDepth > shadowDepth ? 0.0 : 1.0;
}

float sampleSpotLightShadow(int index, vec3 worldPos) {
  if (!uSpotLightCastsShadow[index] || !uShadowsEnabled) {
    return 1.0; // Fully lit
  }

  // Transform world position to shadow map space
  vec4 shadowCoord;
  float shadowDepth;
  float shadowBias;
  
  // WebGL2 requires constant indices for sampler arrays
  // Unroll the array access based on index
  if (index == 0) {
    shadowCoord = uSpotLightShadowMatrices[0] * vec4(worldPos, 1.0);
    shadowCoord.xyz /= shadowCoord.w;
    if (shadowCoord.x < 0.0 || shadowCoord.x > 1.0 ||
        shadowCoord.y < 0.0 || shadowCoord.y > 1.0 ||
        shadowCoord.z < 0.0 || shadowCoord.z > 1.0) {
      return 1.0;
    }
    shadowDepth = texture(uSpotLightShadowMaps[0], shadowCoord.xy).r;
    shadowBias = uSpotLightShadowBiases[0];
  } else if (index == 1) {
    shadowCoord = uSpotLightShadowMatrices[1] * vec4(worldPos, 1.0);
    shadowCoord.xyz /= shadowCoord.w;
    if (shadowCoord.x < 0.0 || shadowCoord.x > 1.0 ||
        shadowCoord.y < 0.0 || shadowCoord.y > 1.0 ||
        shadowCoord.z < 0.0 || shadowCoord.z > 1.0) {
      return 1.0;
    }
    shadowDepth = texture(uSpotLightShadowMaps[1], shadowCoord.xy).r;
    shadowBias = uSpotLightShadowBiases[1];
  } else if (index == 2) {
    shadowCoord = uSpotLightShadowMatrices[2] * vec4(worldPos, 1.0);
    shadowCoord.xyz /= shadowCoord.w;
    if (shadowCoord.x < 0.0 || shadowCoord.x > 1.0 ||
        shadowCoord.y < 0.0 || shadowCoord.y > 1.0 ||
        shadowCoord.z < 0.0 || shadowCoord.z > 1.0) {
      return 1.0;
    }
    shadowDepth = texture(uSpotLightShadowMaps[2], shadowCoord.xy).r;
    shadowBias = uSpotLightShadowBiases[2];
  } else { // index == 3
    shadowCoord = uSpotLightShadowMatrices[3] * vec4(worldPos, 1.0);
    shadowCoord.xyz /= shadowCoord.w;
    if (shadowCoord.x < 0.0 || shadowCoord.x > 1.0 ||
        shadowCoord.y < 0.0 || shadowCoord.y > 1.0 ||
        shadowCoord.z < 0.0 || shadowCoord.z > 1.0) {
      return 1.0;
    }
    shadowDepth = texture(uSpotLightShadowMaps[3], shadowCoord.xy).r;
    shadowBias = uSpotLightShadowBiases[3];
  }
  
  // Compare with current depth (with bias)
  float currentDepth = shadowCoord.z - shadowBias;
  
  // Hard shadow: 0.0 (in shadow) or 1.0 (lit)
  return currentDepth > shadowDepth ? 0.0 : 1.0;
}

vec3 calculatePointLight(int index, vec3 worldPos, vec3 normal) {
  vec3 lightVec = uPointLightPositions[index] - worldPos;
  float distance = length(lightVec);
  vec3 lightDir = normalize(lightVec);
  
  // Distance attenuation
  float attenuation = 1.0;
  if (uPointLightDistances[index] > 0.0) {
    if (uPointLightDecays[index] == 1.0) {
      // Linear decay
      attenuation = max(0.0, 1.0 - distance / uPointLightDistances[index]);
    } else {
      // Inverse square decay
      float att = 1.0 / max(distance * distance, 0.0001);
      float cutoff = 1.0 / max(uPointLightDistances[index] * uPointLightDistances[index], 0.0001);
      attenuation = max(0.0, (att - cutoff) / (1.0 - cutoff));
    }
  }
  
  // Diffuse lighting
  float diff = max(dot(normal, lightDir), 0.0);
  
  return uPointLightColors[index] * uPointLightIntensities[index] * diff * attenuation;
}

vec3 calculateSpotLight(int index, vec3 worldPos, vec3 normal) {
  vec3 lightVec = uSpotLightPositions[index] - worldPos;
  float distance = length(lightVec);
  vec3 lightDir = normalize(lightVec);
  
  // Distance attenuation
  float distAttenuation = 1.0;
  if (uSpotLightDistances[index] > 0.0) {
    if (uSpotLightDecays[index] == 1.0) {
      distAttenuation = max(0.0, 1.0 - distance / uSpotLightDistances[index]);
    } else {
      float att = 1.0 / max(distance * distance, 0.0001);
      float cutoff = 1.0 / max(uSpotLightDistances[index] * uSpotLightDistances[index], 0.0001);
      distAttenuation = max(0.0, (att - cutoff) / (1.0 - cutoff));
    }
  }
  
  // Angular attenuation (spotlight cone)
  vec3 spotDir = normalize(uSpotLightDirections[index]);
  float cosTheta = dot(-lightDir, spotDir);
  float outerCone = cos(uSpotLightAngles[index]);
  float innerCone = cos(uSpotLightAngles[index] * (1.0 - uSpotLightPenumbras[index]));
  
  float angularAttenuation = 0.0;
  if (cosTheta > outerCone) {
    if (cosTheta > innerCone) {
      angularAttenuation = 1.0;
    } else {
      angularAttenuation = (cosTheta - outerCone) / (innerCone - outerCone);
    }
  }
  
  // Diffuse lighting
  float diff = max(dot(normal, lightDir), 0.0);
  
  return uSpotLightColors[index] * uSpotLightIntensities[index] * diff * distAttenuation * angularAttenuation;
}

void main() {
  vec4 color = uColor;
  
  // Sample texture
  if (uHasTexture) {
    vec4 texColor = texture(uTexture, vUV);
    color = color * texColor;
  }
  
  // Calculate lighting
  vec3 normal = normalize(vWorldNormal);
  if (uFlatShading) {
    vec3 faceNormal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
    normal = gl_FrontFacing ? faceNormal : -faceNormal;
  }
  
  // Ambient
  vec3 finalColor = color.rgb * uAmbientColor * uAmbientIntensity;
  
  // Hemisphere light
  if (uHemisphereEnabled > 0.5) {
    float t = normal.y * 0.5 + 0.5;
    vec3 hemiColor = mix(uHemisphereGroundColor, uHemisphereSkyColor, t);
    finalColor += color.rgb * hemiColor * uHemisphereIntensity;
  }
  
  // Directional light (diffuse)
  if (uDirectionalIntensity > 0.0) {
    vec3 lightDir = normalize(-uDirectionalDirection);
    float diff = max(dot(normal, lightDir), 0.0);
    // Phase 1: Apply hard shadow
    float shadow = sampleDirectionalShadow(vWorldPosition);
    finalColor += color.rgb * uDirectionalColor * uDirectionalIntensity * diff * shadow;
  }
  
  // Point lights
  for (int i = 0; i < uNumPointLights && i < 8; i++) {
    finalColor += color.rgb * calculatePointLight(i, vWorldPosition, normal);
  }
  
  // Spot lights
  for (int i = 0; i < uNumSpotLights && i < 4; i++) {
    vec3 spotContribution = calculateSpotLight(i, vWorldPosition, normal);
    // Phase 1: Apply hard shadow
    float shadow = sampleSpotLightShadow(i, vWorldPosition);
    finalColor += color.rgb * spotContribution * shadow;
  }
  
  fragColor = vec4(finalColor, color.a * uOpacity);

  // SSR G-buffer: Lambert materials are non-reflective
  outNormalSSR  = vec4(normal * 0.5 + 0.5, 1.0);
  outMaterialSSR = vec4(0.0, 1.0, 0.0, 1.0); // metallic=0, roughness=1, reflectivity=0
}
`;

/**
 * LambertMaterialShader class
 */
export class LambertMaterialShader extends Shader {
  constructor() {
    super(
      { wgsl: WGSL_VERTEX, glsl: GLSL_VERTEX },
      { wgsl: WGSL_FRAGMENT, glsl: GLSL_FRAGMENT },
      {
        modelViewProjection: null,
        model: null,
        normalMatrix: null,
        color: [1, 1, 1, 1],
        opacity: 1.0,
        hasTexture: false,
        ambientColor: [1, 1, 1],
        ambientIntensity: 0.3,
        directionalColor: [1, 1, 1],
        directionalIntensity: 0.8,
        directionalDirection: [0, -1, 0]
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
      const vertexModule = device.createShaderModule({
        label: 'LambertMaterial Vertex Shader',
        code: this.vertexSource.wgsl
      });

      const fragmentModule = device.createShaderModule({
        label: 'LambertMaterial Fragment Shader',
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
      console.error('[LambertMaterialShader] WebGPU compilation error:', error);
      throw error;
    }
  }

  /**
   * Compile for WebGL2
   */
  _compileWebGL2(gl) {
    try {
      const vertexShader = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vertexShader, this.vertexSource.glsl);
      gl.compileShader(vertexShader);

      if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(vertexShader);
        throw new Error(`Vertex shader compilation failed: ${error}`);
      }

      const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fragmentShader, this.fragmentSource.glsl);
      gl.compileShader(fragmentShader);

      if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(fragmentShader);
        throw new Error(`Fragment shader compilation failed: ${error}`);
      }

      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const error = gl.getProgramInfoLog(program);
        throw new Error(`Shader program linking failed: ${error}`);
      }

      // Cache attribute locations
      this.attributeLocations.set('aPosition', gl.getAttribLocation(program, 'aPosition'));
      this.attributeLocations.set('aNormal', gl.getAttribLocation(program, 'aNormal'));
      this.attributeLocations.set('aUV', gl.getAttribLocation(program, 'aUV'));

      // Cache uniform locations
      this.uniformLocations.set('uModelViewProjection', gl.getUniformLocation(program, 'uModelViewProjection'));
      this.uniformLocations.set('uModel', gl.getUniformLocation(program, 'uModel'));
      this.uniformLocations.set('uNormalMatrix', gl.getUniformLocation(program, 'uNormalMatrix'));
      this.uniformLocations.set('uColor', gl.getUniformLocation(program, 'uColor'));
      this.uniformLocations.set('uOpacity', gl.getUniformLocation(program, 'uOpacity'));
      this.uniformLocations.set('uTexture', gl.getUniformLocation(program, 'uTexture'));
      this.uniformLocations.set('uHasTexture', gl.getUniformLocation(program, 'uHasTexture'));
      this.uniformLocations.set('uFlatShading', gl.getUniformLocation(program, 'uFlatShading'));
      
      this.uniformLocations.set('uAmbientColor', gl.getUniformLocation(program, 'uAmbientColor'));
      this.uniformLocations.set('uAmbientIntensity', gl.getUniformLocation(program, 'uAmbientIntensity'));
      this.uniformLocations.set('uDirectionalColor', gl.getUniformLocation(program, 'uDirectionalColor'));
      this.uniformLocations.set('uDirectionalIntensity', gl.getUniformLocation(program, 'uDirectionalIntensity'));
      this.uniformLocations.set('uDirectionalDirection', gl.getUniformLocation(program, 'uDirectionalDirection'));

      // Hemisphere light uniforms
      this.uniformLocations.set('uHemisphereEnabled', gl.getUniformLocation(program, 'uHemisphereEnabled'));
      this.uniformLocations.set('uHemisphereSkyColor', gl.getUniformLocation(program, 'uHemisphereSkyColor'));
      this.uniformLocations.set('uHemisphereGroundColor', gl.getUniformLocation(program, 'uHemisphereGroundColor'));
      this.uniformLocations.set('uHemisphereIntensity', gl.getUniformLocation(program, 'uHemisphereIntensity'));

      // Point light uniforms (up to 8)
      this.uniformLocations.set('uNumPointLights', gl.getUniformLocation(program, 'uNumPointLights'));
      for (let i = 0; i < 8; i++) {
        this.uniformLocations.set(`uPointLightPositions[${i}]`, gl.getUniformLocation(program, `uPointLightPositions[${i}]`));
        this.uniformLocations.set(`uPointLightColors[${i}]`, gl.getUniformLocation(program, `uPointLightColors[${i}]`));
        this.uniformLocations.set(`uPointLightIntensities[${i}]`, gl.getUniformLocation(program, `uPointLightIntensities[${i}]`));
        this.uniformLocations.set(`uPointLightDistances[${i}]`, gl.getUniformLocation(program, `uPointLightDistances[${i}]`));
        this.uniformLocations.set(`uPointLightDecays[${i}]`, gl.getUniformLocation(program, `uPointLightDecays[${i}]`));
      }

      // Spot light uniforms (up to 4)
      this.uniformLocations.set('uNumSpotLights', gl.getUniformLocation(program, 'uNumSpotLights'));
      for (let i = 0; i < 4; i++) {
        this.uniformLocations.set(`uSpotLightPositions[${i}]`, gl.getUniformLocation(program, `uSpotLightPositions[${i}]`));
        this.uniformLocations.set(`uSpotLightDirections[${i}]`, gl.getUniformLocation(program, `uSpotLightDirections[${i}]`));
        this.uniformLocations.set(`uSpotLightColors[${i}]`, gl.getUniformLocation(program, `uSpotLightColors[${i}]`));
        this.uniformLocations.set(`uSpotLightIntensities[${i}]`, gl.getUniformLocation(program, `uSpotLightIntensities[${i}]`));
        this.uniformLocations.set(`uSpotLightDistances[${i}]`, gl.getUniformLocation(program, `uSpotLightDistances[${i}]`));
        this.uniformLocations.set(`uSpotLightAngles[${i}]`, gl.getUniformLocation(program, `uSpotLightAngles[${i}]`));
        this.uniformLocations.set(`uSpotLightPenumbras[${i}]`, gl.getUniformLocation(program, `uSpotLightPenumbras[${i}]`));
        this.uniformLocations.set(`uSpotLightDecays[${i}]`, gl.getUniformLocation(program, `uSpotLightDecays[${i}]`));
      }

      // Shadow uniforms
      this.uniformLocations.set('uShadowsEnabled', gl.getUniformLocation(program, 'uShadowsEnabled'));
      this.uniformLocations.set('uDirectionalCastsShadow', gl.getUniformLocation(program, 'uDirectionalCastsShadow'));
      this.uniformLocations.set('uDirectionalShadowMap', gl.getUniformLocation(program, 'uDirectionalShadowMap'));
      this.uniformLocations.set('uDirectionalShadowMatrix', gl.getUniformLocation(program, 'uDirectionalShadowMatrix'));
      this.uniformLocations.set('uDirectionalShadowBias', gl.getUniformLocation(program, 'uDirectionalShadowBias'));
      for (let i = 0; i < 4; i++) {
        this.uniformLocations.set(`uSpotLightCastsShadow[${i}]`, gl.getUniformLocation(program, `uSpotLightCastsShadow[${i}]`));
        this.uniformLocations.set(`uSpotLightShadowMaps[${i}]`, gl.getUniformLocation(program, `uSpotLightShadowMaps[${i}]`));
        this.uniformLocations.set(`uSpotLightShadowMatrices[${i}]`, gl.getUniformLocation(program, `uSpotLightShadowMatrices[${i}]`));
        this.uniformLocations.set(`uSpotLightShadowBiases[${i}]`, gl.getUniformLocation(program, `uSpotLightShadowBiases[${i}]`));
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
      console.error('[LambertMaterialShader] WebGL2 compilation error:', error);
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
    }
    
    super.dispose();
  }
}
