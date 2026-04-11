/**
 * ToneMappingPass.js
 * 
 * Applies tone mapping to convert HDR colors to LDR display range.
 * Supports multiple tone mapping operators: Linear, Reinhard, ACES, Uncharted2.
 * 
 * Phase 3: Post-Processing Effects
 */

import PostProcessPass from './PostProcessPass.js';

export default class ToneMappingPass extends PostProcessPass {
    constructor(operator = 'aces') {
        super('ToneMapping');
        
        this.operator = operator; // 'linear', 'reinhard', 'aces', 'uncharted2'
        this.exposure = 1.0;
        
        this.uniforms = {
            exposure: this.exposure,
            toneMapMode: this._getOperatorIndex(operator)
        };
        
        this._defineShaders();
    }
    
    /**
     * Set tone mapping operator
     */
    setOperator(operator) {
        this.operator = operator;
        this.uniforms.toneMapMode = this._getOperatorIndex(operator);
    }
    
    /**
     * Set exposure value
     */
    setExposure(exposure) {
        this.exposure = exposure;
        this.uniforms.exposure = exposure;
    }
    
    _getOperatorIndex(operator) {
        const operators = { 'linear': 0, 'reinhard': 1, 'aces': 2, 'uncharted2': 3 };
        return operators[operator] || 2;
    }
    
    _defineShaders() {
        // WGSL Fragment Shader
        this.fragmentShaderWGSL = `
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;

struct Uniforms {
    exposure: f32,
    toneMapMode: u32,
    padding: vec2<f32>
};
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

// Linear tone mapping
fn tonemapLinear(color: vec3<f32>) -> vec3<f32> {
    return color;
}

// Reinhard tone mapping
fn tonemapReinhard(color: vec3<f32>) -> vec3<f32> {
    return color / (vec3<f32>(1.0) + color);
}

// ACES Filmic tone mapping
fn tonemapACES(color: vec3<f32>) -> vec3<f32> {
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    return clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

// Uncharted 2 tone mapping
fn tonemapUncharted2(color: vec3<f32>) -> vec3<f32> {
    let A = 0.15;
    let B = 0.50;
    let C = 0.10;
    let D = 0.20;
    let E = 0.02;
    let F = 0.30;
    return ((color * (A * color + C * B) + D * E) / (color * (A * color + B) + D * F)) - E / F;
}

@fragment
fn main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    var color = textureSample(inputTexture, inputSampler, uv).rgb;
    
    // Apply exposure
    color *= uniforms.exposure;
    
    // Apply tone mapping operator
    if (uniforms.toneMapMode == 0u) {
        color = tonemapLinear(color);
    } else if (uniforms.toneMapMode == 1u) {
        color = tonemapReinhard(color);
    } else if (uniforms.toneMapMode == 2u) {
        color = tonemapACES(color);
    } else if (uniforms.toneMapMode == 3u) {
        color = tonemapUncharted2(color);
        let whiteScale = 1.0 / tonemapUncharted2(vec3<f32>(11.2));
        color *= whiteScale;
    }
    
    return vec4<f32>(color, 1.0);
}
`;
        
        // GLSL Fragment Shader
        this.fragmentShaderGLSL = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D inputTexture;
uniform float exposure;
uniform int toneMapMode;

// Linear tone mapping
vec3 tonemapLinear(vec3 color) {
    return color;
}

// Reinhard tone mapping
vec3 tonemapReinhard(vec3 color) {
    return color / (vec3(1.0) + color);
}

// ACES Filmic tone mapping
vec3 tonemapACES(vec3 color) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
}

// Uncharted 2 tone mapping
vec3 tonemapUncharted2(vec3 color) {
    float A = 0.15;
    float B = 0.50;
    float C = 0.10;
    float D = 0.20;
    float E = 0.02;
    float F = 0.30;
    return ((color * (A * color + C * B) + D * E) / (color * (A * color + B) + D * F)) - E / F;
}

void main() {
    vec3 color = texture(inputTexture, vUv).rgb;
    
    // Apply exposure
    color *= exposure;
    
    // Apply tone mapping operator
    if (toneMapMode == 0) {
        color = tonemapLinear(color);
    } else if (toneMapMode == 1) {
        color = tonemapReinhard(color);
    } else if (toneMapMode == 2) {
        color = tonemapACES(color);
    } else if (toneMapMode == 3) {
        color = tonemapUncharted2(color);
        float whiteScale = 1.0 / tonemapUncharted2(vec3(11.2));
        color *= whiteScale;
    }
    
    fragColor = vec4(color, 1.0);
}
`;
        
        this.vertexShaderWGSL = PostProcessPass.getFullscreenQuadVertexWGSL();
        this.vertexShaderGLSL = PostProcessPass.getFullscreenQuadVertexGLSL();
    }
}
