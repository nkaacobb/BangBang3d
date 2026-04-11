/**
 * PBRMaterialShader.js
 * 
 * Physically-Based Rendering shader with Cook-Torrance BRDF.
 * Supports metallic/roughness workflow, multiple light types, shadows, and IBL.
 * 
 * Phase 4: PBR Shading
 */

import { Shader } from './Shader.js';

export class PBRMaterialShader extends Shader {
    constructor() {
        // Store shaders temporarily
        const vertexWGSL = `
struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) worldPosition: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>
};

struct Uniforms {
    mvpMatrix: mat4x4<f32>,
    modelMatrix: mat4x4<f32>,
    normalMatrix: mat4x4<f32>
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    
    output.position = uniforms.mvpMatrix * vec4<f32>(input.position, 1.0);
    output.worldPosition = (uniforms.modelMatrix * vec4<f32>(input.position, 1.0)).xyz;
    output.normal = normalize((uniforms.normalMatrix * vec4<f32>(input.normal, 0.0)).xyz);
    output.uv = input.uv;
    
    return output;
}
`;

        // WGSL Fragment Shader with PBR lighting
        const fragmentWGSL = `
struct MaterialUniforms {
    baseColor: vec4<f32>,
    metallic: f32,
    roughness: f32,
    normalScale: f32,
    aoIntensity: f32,
    envMapIntensity: f32,
    emissiveIntensity: f32,
    opacity: f32,
    padding: f32
};

struct LightUniforms {
    directionalColor: vec3<f32>,
    directionalIntensity: f32,
    directionalDirection: vec3<f32>,
    ambientColor: vec3<f32>,
    cameraPosition: vec3<f32>
};

@group(0) @binding(1) var<uniform> material: MaterialUniforms;
@group(0) @binding(2) var<uniform> lights: LightUniforms;
@group(0) @binding(3) var textureSampler: sampler;
@group(0) @binding(4) var baseColorTexture: texture_2d<f32>;

const PI = 3.14159265359;

// Fresnel-Schlick approximation
fn fresnelSchlick(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
    return F0 + (vec3<f32>(1.0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// GGX Normal Distribution Function
fn distributionGGX(N: vec3<f32>, H: vec3<f32>, roughness: f32) -> f32 {
    let a = roughness * roughness;
    let a2 = a * a;
    let NdotH = max(dot(N, H), 0.0);
    let NdotH2 = NdotH * NdotH;
    
    let nom = a2;
    var denom = (NdotH2 * (a2 - 1.0) + 1.0);
    denom = PI * denom * denom;
    
    return nom / denom;
}

// Smith's method with Schlick-GGX
fn geometrySchlickGGX(NdotV: f32, roughness: f32) -> f32 {
    let r = roughness + 1.0;
    let k = (r * r) / 8.0;
    
    let nom = NdotV;
    let denom = NdotV * (1.0 - k) + k;
    
    return nom / denom;
}

fn geometrySmith(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, roughness: f32) -> f32 {
    let NdotV = max(dot(N, V), 0.0);
    let NdotL = max(dot(N, L), 0.0);
    let ggx2 = geometrySchlickGGX(NdotV, roughness);
    let ggx1 = geometrySchlickGGX(NdotL, roughness);
    
    return ggx1 * ggx2;
}

@fragment
fn main(
    @location(0) worldPosition: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>
) -> @location(0) vec4<f32> {
    // Sample base color
    var albedo = material.baseColor.rgb;
    let texColor = textureSample(baseColorTexture, textureSampler, uv);
    albedo *= texColor.rgb;
    
    // Material properties
    let metallic = material.metallic;
    let roughness = max(material.roughness, 0.04); // Minimum roughness to avoid artifacts
    
    // Calculate view direction
    let N = normalize(normal);
    let V = normalize(lights.cameraPosition - worldPosition);
    
    // Calculate reflectance at normal incidence
    // For dielectrics F0 = 0.04, for metals F0 = albedo
    var F0 = vec3<f32>(0.04);
    F0 = mix(F0, albedo, metallic);
    
    // Reflectance equation
    var Lo = vec3<f32>(0.0);
    
    // Directional light
    let L = normalize(-lights.directionalDirection);
    let H = normalize(V + L);
    let radiance = lights.directionalColor * lights.directionalIntensity;
    
    // Cook-Torrance BRDF
    let NDF = distributionGGX(N, H, roughness);
    let G = geometrySmith(N, V, L, roughness);
    let F = fresnelSchlick(max(dot(H, V), 0.0), F0);
    
    let numerator = NDF * G * F;
    let denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
    let specular = numerator / denominator;
    
    // Energy conservation
    let kS = F;
    var kD = vec3<f32>(1.0) - kS;
    kD *= 1.0 - metallic; // Metals have no diffuse component
    
    let NdotL = max(dot(N, L), 0.0);
    Lo += (kD * albedo / PI + specular) * radiance * NdotL;
    
    // Ambient lighting
    let ambient = lights.ambientColor * albedo * 0.03;
    var color = ambient + Lo;
    
    // HDR tonemapping (simple Reinhard)
    // color = color / (color + vec3<f32>(1.0));
    
    // Gamma correction (done in post-processing for Phase 3+)
    // color = pow(color, vec3<f32>(1.0 / 2.2));
    
    return vec4<f32>(color, material.opacity);
}
`;

        // GLSL Vertex Shader
        const vertexGLSL = `#version 300 es
precision highp float;

layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec2 uv;

out vec3 vWorldPosition;
out vec3 vNormal;
out vec2 vUv;

uniform mat4 mvpMatrix;
uniform mat4 modelMatrix;
uniform mat4 normalMatrix;

void main() {
    gl_Position = mvpMatrix * vec4(position, 1.0);
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vNormal = normalize((normalMatrix * vec4(normal, 0.0)).xyz);
    vUv = uv;
}
`;

        // GLSL Fragment Shader with PBR lighting + IBL reflections
        const fragmentGLSL = `#version 300 es
precision highp float;

in vec3 vWorldPosition;
in vec3 vNormal;
in vec2 vUv;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 outNormalSSR;   // view-space normal [0,1]-encoded
layout(location = 2) out vec4 outMaterialSSR;  // R=metallic, G=roughness, B=reflectivity

// SSR support
uniform mat4 uViewMatrix;   // world-to-view (for SSR normal encoding)

// Material uniforms
uniform vec4 baseColor;
uniform float metallic;
uniform float roughness;
uniform float normalScale;
uniform float aoIntensity;
uniform float envMapIntensity;
uniform float emissiveIntensity;
uniform float opacity;
uniform int uHasBaseColorTexture;
uniform int flatShading;

// Directional light uniforms
uniform vec3 directionalColor;
uniform float directionalIntensity;
uniform vec3 directionalDirection;
uniform vec3 ambientColor;
uniform float ambientIntensity;
uniform vec3 cameraPosition;

// Point lights (max 4)
uniform int uNumPointLights;
uniform vec3 uPBRPointLightPositions[4];
uniform vec3 uPBRPointLightColors[4];
uniform float uPBRPointLightIntensities[4];
uniform float uPBRPointLightDistances[4];
uniform float uPBRPointLightDecays[4];

// Spot lights (max 2)
uniform int uNumSpotLights;
uniform vec3 uPBRSpotLightPositions[2];
uniform vec3 uPBRSpotLightDirections[2];
uniform vec3 uPBRSpotLightColors[2];
uniform float uPBRSpotLightIntensities[2];
uniform float uPBRSpotLightDistances[2];
uniform float uPBRSpotLightAngles[2];
uniform float uPBRSpotLightPenumbras[2];
uniform float uPBRSpotLightDecays[2];

// Hemisphere light
uniform int uPBRHemisphereEnabled;
uniform vec3 uPBRHemisphereSkyColor;
uniform vec3 uPBRHemisphereGroundColor;
uniform float uPBRHemisphereIntensity;

// Emissive
uniform vec3 emissiveColor;

// Textures
uniform sampler2D baseColorTexture;

// IBL / Environment reflections
uniform int uHasEnvMap;
uniform samplerCube uEnvMap;
uniform float uEnvMapMaxLod;
uniform int uHasBRDFLUT;
uniform sampler2D uBRDFLUT;
uniform float uSceneEnvIntensity;

// Planar reflection
uniform int uHasPlanarReflection;
uniform sampler2D uPlanarReflectionMap;
uniform mat4 uPlanarReflectionMatrix;

const float PI = 3.14159265359;

// Fresnel-Schlick approximation
vec3 fresnelSchlick(float cosTheta, vec3 F0) {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// Fresnel-Schlick with roughness (for IBL)
vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
    return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// GGX Normal Distribution Function
float distributionGGX(vec3 N, vec3 H, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float NdotH = max(dot(N, H), 0.0);
    float NdotH2 = NdotH * NdotH;
    
    float nom = a2;
    float denom = (NdotH2 * (a2 - 1.0) + 1.0);
    denom = PI * denom * denom;
    
    return nom / denom;
}

// Smith's method with Schlick-GGX
float geometrySchlickGGX(float NdotV, float roughness) {
    float r = roughness + 1.0;
    float k = (r * r) / 8.0;
    
    float nom = NdotV;
    float denom = NdotV * (1.0 - k) + k;
    
    return nom / denom;
}

float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
    float NdotV = max(dot(N, V), 0.0);
    float NdotL = max(dot(N, L), 0.0);
    float ggx2 = geometrySchlickGGX(NdotV, roughness);
    float ggx1 = geometrySchlickGGX(NdotL, roughness);
    
    return ggx1 * ggx2;
}

// Compute Cook-Torrance BRDF contribution for a single light
vec3 computePBRLight(vec3 N, vec3 V, vec3 L, vec3 radiance, vec3 albedo, float metallicValue, float roughnessValue, vec3 F0) {
    vec3 H = normalize(V + L);
    
    float NDF = distributionGGX(N, H, roughnessValue);
    float G = geometrySmith(N, V, L, roughnessValue);
    vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);
    
    vec3 numerator = NDF * G * F;
    float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
    vec3 specular = numerator / denominator;
    
    vec3 kS = F;
    vec3 kD = vec3(1.0) - kS;
    kD *= 1.0 - metallicValue;
    
    float NdotL = max(dot(N, L), 0.0);
    return (kD * albedo / PI + specular) * radiance * NdotL;
}

void main() {
    // Sample base color
    vec3 albedo = baseColor.rgb;
    if (uHasBaseColorTexture == 1) {
        vec4 texColor = texture(baseColorTexture, vUv);
        albedo *= texColor.rgb;
    }
    
    // Material properties
    float metallicValue = metallic;
    float roughnessValue = max(roughness, 0.04); // Minimum roughness
    
    // Calculate view direction
    vec3 N = normalize(vNormal);
    if (flatShading == 1) {
        vec3 faceNormal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
        N = gl_FrontFacing ? faceNormal : -faceNormal;
    }
    vec3 V = normalize(cameraPosition - vWorldPosition);
    float NdotV = max(dot(N, V), 0.0);
    
    // Calculate reflectance at normal incidence
    vec3 F0 = vec3(0.04);
    F0 = mix(F0, albedo, metallicValue);
    
    // Reflectance equation — direct lighting
    vec3 Lo = vec3(0.0);
    
    // --- Directional light ---
    if (directionalIntensity > 0.0) {
        vec3 L = normalize(-directionalDirection);
        vec3 radiance = directionalColor * directionalIntensity;
        Lo += computePBRLight(N, V, L, radiance, albedo, metallicValue, roughnessValue, F0);
    }
    
    // --- Point lights ---
    for (int i = 0; i < 4; i++) {
        if (i >= uNumPointLights) break;
        
        vec3 lightVec = uPBRPointLightPositions[i] - vWorldPosition;
        float dist = length(lightVec);
        vec3 L = normalize(lightVec);
        
        float attenuation = 1.0;
        float lightDist = uPBRPointLightDistances[i];
        float decay = uPBRPointLightDecays[i];
        if (lightDist > 0.0) {
            attenuation = pow(max(1.0 - dist / lightDist, 0.0), decay);
        } else {
            attenuation = 1.0 / (dist * dist + 0.01);
        }
        
        vec3 radiance = uPBRPointLightColors[i] * uPBRPointLightIntensities[i] * attenuation;
        Lo += computePBRLight(N, V, L, radiance, albedo, metallicValue, roughnessValue, F0);
    }
    
    // --- Spot lights ---
    for (int i = 0; i < 2; i++) {
        if (i >= uNumSpotLights) break;
        
        vec3 lightVec = uPBRSpotLightPositions[i] - vWorldPosition;
        float dist = length(lightVec);
        vec3 L = normalize(lightVec);
        
        float theta = dot(L, normalize(-uPBRSpotLightDirections[i]));
        float cutoff = cos(uPBRSpotLightAngles[i]);
        float outerCutoff = cos(uPBRSpotLightAngles[i] * (1.0 + uPBRSpotLightPenumbras[i]));
        float epsilon = cutoff - outerCutoff;
        float spotEffect = clamp((theta - outerCutoff) / (epsilon + 0.0001), 0.0, 1.0);
        
        float attenuation = 1.0;
        float lightDist = uPBRSpotLightDistances[i];
        float decay = uPBRSpotLightDecays[i];
        if (lightDist > 0.0) {
            attenuation = pow(max(1.0 - dist / lightDist, 0.0), decay);
        } else {
            attenuation = 1.0 / (dist * dist + 0.01);
        }
        
        vec3 radiance = uPBRSpotLightColors[i] * uPBRSpotLightIntensities[i] * attenuation * spotEffect;
        Lo += computePBRLight(N, V, L, radiance, albedo, metallicValue, roughnessValue, F0);
    }
    
    // --- IBL (Image-Based Lighting) ---
    vec3 iblDiffuse = vec3(0.0);
    vec3 iblSpecular = vec3(0.0);
    
    if (uHasEnvMap == 1) {
        // Fresnel with roughness for IBL
        vec3 F = fresnelSchlickRoughness(NdotV, F0, roughnessValue);
        vec3 kS = F;
        vec3 kD = (1.0 - kS) * (1.0 - metallicValue);
        
        // Diffuse IBL: sample environment at normal direction (lowest mip = most blurred)
        vec3 irradiance = textureLod(uEnvMap, N, uEnvMapMaxLod - 1.0).rgb;
        iblDiffuse = kD * irradiance * albedo;
        
        // Specular IBL: sample environment at reflection direction with roughness-based LOD
        vec3 R = reflect(-V, N);
        float lod = roughnessValue * (uEnvMapMaxLod - 1.0);
        vec3 prefilteredColor = textureLod(uEnvMap, R, lod).rgb;
        
        // BRDF LUT lookup for split-sum approximation
        vec2 brdf = vec2(1.0, 0.0); // fallback
        if (uHasBRDFLUT == 1) {
            brdf = texture(uBRDFLUT, vec2(NdotV, roughnessValue)).rg;
        }
        iblSpecular = prefilteredColor * (F * brdf.x + brdf.y);
        
        // Apply environment intensity
        float envIntensity = envMapIntensity * uSceneEnvIntensity;
        iblDiffuse *= envIntensity;
        iblSpecular *= envIntensity;
    }
    
    // --- Planar Reflection ---
    vec3 planarRefl = vec3(0.0);
    if (uHasPlanarReflection == 1) {
        vec4 reflCoord = uPlanarReflectionMatrix * vec4(vWorldPosition, 1.0);
        vec2 reflUV = reflCoord.xy / reflCoord.w;
        if (reflUV.x >= 0.0 && reflUV.x <= 1.0 && reflUV.y >= 0.0 && reflUV.y <= 1.0) {
            vec3 reflColor = texture(uPlanarReflectionMap, reflUV).rgb;
            vec3 F = fresnelSchlickRoughness(NdotV, F0, roughnessValue);
            planarRefl = reflColor * F * envMapIntensity;
        }
    }
    
    // --- Ambient lighting ---
    vec3 ambient = vec3(0.0);
    
    if (uHasEnvMap == 1) {
        // With IBL, minimal ambient to avoid double-counting
        ambient = ambientColor * ambientIntensity * albedo * 0.05;
    } else {
        // Without IBL, use energy-conserving ambient with specular component
        // This ensures metallic surfaces still reflect ambient light via Fresnel
        vec3 F_ambient = fresnelSchlickRoughness(NdotV, F0, roughnessValue);
        vec3 kD_ambient = (1.0 - F_ambient) * (1.0 - metallicValue);
        
        // Diffuse ambient (for non-metals, proportional to albedo)
        vec3 diffuseAmbient = kD_ambient * albedo;
        
        // Specular ambient (reflects ambient light via Fresnel)
        // Provides rim reflections for metals even with dark base colors
        vec3 specularAmbient = F_ambient * (1.0 - roughnessValue * 0.5);
        
        ambient = ambientColor * ambientIntensity * (diffuseAmbient + specularAmbient) * 0.3;
    }
    
    // --- Hemisphere light (directional ambient) ---
    if (uPBRHemisphereEnabled == 1) {
        float hemiMix = dot(N, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5;
        vec3 hemiColor = mix(uPBRHemisphereGroundColor, uPBRHemisphereSkyColor, hemiMix) * uPBRHemisphereIntensity;
        
        // PBR energy-conserving hemisphere contribution
        vec3 F_hemi = fresnelSchlickRoughness(NdotV, F0, roughnessValue);
        vec3 kD_hemi = (1.0 - F_hemi) * (1.0 - metallicValue);
        
        // Diffuse hemisphere (non-metals)
        ambient += kD_hemi * albedo * hemiColor;
        // Specular hemisphere (metals reflect hemisphere color via Fresnel)
        ambient += F_hemi * hemiColor * (1.0 - roughnessValue * 0.5);
    }
    
    // Emissive
    vec3 emissive = emissiveColor * emissiveIntensity;
    
    vec3 color = ambient + Lo + iblDiffuse + iblSpecular + planarRefl + emissive;
    
    // Basic tone mapping (Reinhard) to prevent blown-out highlights
    color = color / (color + vec3(1.0));
    
    // Gamma correction (linear -> sRGB)
    color = pow(color, vec3(1.0 / 2.2));
    
    fragColor = vec4(color, opacity);

    // SSR G-buffer outputs (MRT location 1 & 2)
    // When no MRT FBO is bound these writes are harmlessly discarded.
    vec3 viewNormal = normalize(mat3(uViewMatrix) * N);
    outNormalSSR  = vec4(viewNormal * 0.5 + 0.5, 1.0);
    // Reflectivity: metals reflect strongly; dielectrics via Fresnel at grazing
    float refl = mix(0.04, 1.0, metallicValue) * (1.0 - roughnessValue);
    outMaterialSSR = vec4(metallicValue, roughnessValue, refl, 1.0);
}
`;

        // Call parent constructor with shader sources and default uniforms
        super(
            { wgsl: vertexWGSL, glsl: vertexGLSL },
            { wgsl: fragmentWGSL, glsl: fragmentGLSL },
            {
                // Transform matrices
                mvpMatrix: null,
                modelMatrix: null,
                normalMatrix: null,
                // Material properties
                baseColor: [1.0, 1.0, 1.0, 1.0],
                metallic: 0.0,
                roughness: 0.5,
                normalScale: 1.0,
                aoIntensity: 1.0,
                envMapIntensity: 1.0,
                emissiveIntensity: 0.0,
                opacity: 1.0,
                // Light properties
                directionalColor: [1.0, 1.0, 1.0],
                directionalIntensity: 1.0,
                directionalDirection: [0.0, -1.0, 0.0],
                ambientColor: [0.1, 0.1, 0.1],
                cameraPosition: [0.0, 0.0, 0.0]
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
                label: 'PBRMaterial Vertex Shader',
                code: this.vertexSource.wgsl
            });

            const fragmentModule = device.createShaderModule({
                label: 'PBRMaterial Fragment Shader',
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
            console.error('[PBRMaterialShader] WebGPU compilation error:', error);
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
                const error = new Error(`PBR vertex shader compilation failed:\n${infoLog}`);
                error.shaderType = 'vertex';
                error.infoLog = infoLog;
                throw error;
            }

            // Create and compile fragment shader
            const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
            gl.shaderSource(fragmentShader, this.fragmentSource.glsl);
            gl.compileShader(fragmentShader);

            if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
                const infoLog = gl.getShaderInfoLog(fragmentShader);
                const error = new Error(`PBR fragment shader compilation failed:\n${infoLog}`);
                error.shaderType = 'fragment';
                error.infoLog = infoLog;
                throw error;
            }

            // Create and link program
            const program = gl.createProgram();
            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);
            gl.linkProgram(program);

            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                const infoLog = gl.getProgramInfoLog(program);
                const error = new Error(`PBR shader program linking failed:\n${infoLog}`);
                error.programInfoLog = infoLog;
                throw error;
            }

            // Cache attribute locations
            this.attributeLocations.set('position', gl.getAttribLocation(program, 'position'));
            this.attributeLocations.set('normal', gl.getAttribLocation(program, 'normal'));
            this.attributeLocations.set('uv', gl.getAttribLocation(program, 'uv'));

            // Cache uniform locations
            this.uniformLocations.set('mvpMatrix', gl.getUniformLocation(program, 'mvpMatrix'));
            this.uniformLocations.set('modelMatrix', gl.getUniformLocation(program, 'modelMatrix'));
            this.uniformLocations.set('normalMatrix', gl.getUniformLocation(program, 'normalMatrix'));
            this.uniformLocations.set('baseColor', gl.getUniformLocation(program, 'baseColor'));
            this.uniformLocations.set('metallic', gl.getUniformLocation(program, 'metallic'));
            this.uniformLocations.set('roughness', gl.getUniformLocation(program, 'roughness'));
            this.uniformLocations.set('opacity', gl.getUniformLocation(program, 'opacity'));
            this.uniformLocations.set('flatShading', gl.getUniformLocation(program, 'flatShading'));
            this.uniformLocations.set('uHasBaseColorTexture', gl.getUniformLocation(program, 'uHasBaseColorTexture'));
            this.uniformLocations.set('directionalColor', gl.getUniformLocation(program, 'directionalColor'));
            this.uniformLocations.set('directionalIntensity', gl.getUniformLocation(program, 'directionalIntensity'));
            this.uniformLocations.set('directionalDirection', gl.getUniformLocation(program, 'directionalDirection'));
            this.uniformLocations.set('ambientColor', gl.getUniformLocation(program, 'ambientColor'));
            this.uniformLocations.set('ambientIntensity', gl.getUniformLocation(program, 'ambientIntensity'));
            this.uniformLocations.set('cameraPosition', gl.getUniformLocation(program, 'cameraPosition'));
            this.uniformLocations.set('baseColorTexture', gl.getUniformLocation(program, 'baseColorTexture'));
            
            // Emissive
            this.uniformLocations.set('emissiveColor', gl.getUniformLocation(program, 'emissiveColor'));
            this.uniformLocations.set('emissiveIntensity', gl.getUniformLocation(program, 'emissiveIntensity'));

            // Point light uniforms (4 lights)
            this.uniformLocations.set('uNumPointLights', gl.getUniformLocation(program, 'uNumPointLights'));
            for (let i = 0; i < 4; i++) {
              this.uniformLocations.set(`uPBRPointLightPositions[${i}]`, gl.getUniformLocation(program, `uPBRPointLightPositions[${i}]`));
              this.uniformLocations.set(`uPBRPointLightColors[${i}]`, gl.getUniformLocation(program, `uPBRPointLightColors[${i}]`));
              this.uniformLocations.set(`uPBRPointLightIntensities[${i}]`, gl.getUniformLocation(program, `uPBRPointLightIntensities[${i}]`));
              this.uniformLocations.set(`uPBRPointLightDistances[${i}]`, gl.getUniformLocation(program, `uPBRPointLightDistances[${i}]`));
              this.uniformLocations.set(`uPBRPointLightDecays[${i}]`, gl.getUniformLocation(program, `uPBRPointLightDecays[${i}]`));
            }

            // Spot light uniforms (2 lights)
            this.uniformLocations.set('uNumSpotLights', gl.getUniformLocation(program, 'uNumSpotLights'));
            for (let i = 0; i < 2; i++) {
              this.uniformLocations.set(`uPBRSpotLightPositions[${i}]`, gl.getUniformLocation(program, `uPBRSpotLightPositions[${i}]`));
              this.uniformLocations.set(`uPBRSpotLightDirections[${i}]`, gl.getUniformLocation(program, `uPBRSpotLightDirections[${i}]`));
              this.uniformLocations.set(`uPBRSpotLightColors[${i}]`, gl.getUniformLocation(program, `uPBRSpotLightColors[${i}]`));
              this.uniformLocations.set(`uPBRSpotLightIntensities[${i}]`, gl.getUniformLocation(program, `uPBRSpotLightIntensities[${i}]`));
              this.uniformLocations.set(`uPBRSpotLightDistances[${i}]`, gl.getUniformLocation(program, `uPBRSpotLightDistances[${i}]`));
              this.uniformLocations.set(`uPBRSpotLightAngles[${i}]`, gl.getUniformLocation(program, `uPBRSpotLightAngles[${i}]`));
              this.uniformLocations.set(`uPBRSpotLightPenumbras[${i}]`, gl.getUniformLocation(program, `uPBRSpotLightPenumbras[${i}]`));
              this.uniformLocations.set(`uPBRSpotLightDecays[${i}]`, gl.getUniformLocation(program, `uPBRSpotLightDecays[${i}]`));
            }

            // Hemisphere light uniforms
            this.uniformLocations.set('uPBRHemisphereEnabled', gl.getUniformLocation(program, 'uPBRHemisphereEnabled'));
            this.uniformLocations.set('uPBRHemisphereSkyColor', gl.getUniformLocation(program, 'uPBRHemisphereSkyColor'));
            this.uniformLocations.set('uPBRHemisphereGroundColor', gl.getUniformLocation(program, 'uPBRHemisphereGroundColor'));
            this.uniformLocations.set('uPBRHemisphereIntensity', gl.getUniformLocation(program, 'uPBRHemisphereIntensity'));

            // IBL / Environment reflection uniforms
            this.uniformLocations.set('uHasEnvMap', gl.getUniformLocation(program, 'uHasEnvMap'));
            this.uniformLocations.set('uEnvMap', gl.getUniformLocation(program, 'uEnvMap'));
            this.uniformLocations.set('uEnvMapMaxLod', gl.getUniformLocation(program, 'uEnvMapMaxLod'));
            this.uniformLocations.set('uHasBRDFLUT', gl.getUniformLocation(program, 'uHasBRDFLUT'));
            this.uniformLocations.set('uBRDFLUT', gl.getUniformLocation(program, 'uBRDFLUT'));
            this.uniformLocations.set('uSceneEnvIntensity', gl.getUniformLocation(program, 'uSceneEnvIntensity'));
            this.uniformLocations.set('envMapIntensity', gl.getUniformLocation(program, 'envMapIntensity'));

            // Planar reflection uniforms
            // SSR view matrix
            this.uniformLocations.set('uViewMatrix', gl.getUniformLocation(program, 'uViewMatrix'));

            this.uniformLocations.set('uHasPlanarReflection', gl.getUniformLocation(program, 'uHasPlanarReflection'));
            this.uniformLocations.set('uPlanarReflectionMap', gl.getUniformLocation(program, 'uPlanarReflectionMap'));
            this.uniformLocations.set('uPlanarReflectionMatrix', gl.getUniformLocation(program, 'uPlanarReflectionMatrix'));

            this.compiled = {
                api: 'webgl2',
                program,
                vertexShader,
                fragmentShader,
                gl
            };

            return this.compiled;
        } catch (error) {
            console.error('[PBRMaterialShader] WebGL2 compilation error:', error);
            throw error;
        }
    }
}
