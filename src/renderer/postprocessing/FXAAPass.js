/**
 * FXAAPass.js
 * 
 * Fast Approximate Anti-Aliasing (FXAA) post-processing pass.
 * Reduces edge aliasing artifacts in a single pass.
 * 
 * Phase 3: Post-Processing Effects
 */

import PostProcessPass from './PostProcessPass.js';

export default class FXAAPass extends PostProcessPass {
    constructor() {
        super('FXAA');
        
        this.resolution = { x: 1.0, y: 1.0 };
        this.uniforms = {
            resolution: this.resolution
        };
        
        this._defineShaders();
    }
    
    /**
     * Update resolution (called on resize)
     */
    resize(width, height) {
        this.resolution.x = 1.0 / width;
        this.resolution.y = 1.0 / height;
        this.uniforms.resolution = this.resolution;
    }
    
    _defineShaders() {
        // WGSL Fragment Shader
        this.fragmentShaderWGSL = `
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;

struct Uniforms {
    resolution: vec2<f32>,
    padding: vec2<f32>
};
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const FXAA_SPAN_MAX = 8.0;
const FXAA_REDUCE_MUL = 1.0 / 8.0;
const FXAA_REDUCE_MIN = 1.0 / 128.0;

@fragment
fn main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let inverseVP = uniforms.resolution;
    
    // Sample neighbors
    let rgbNW = textureSample(inputTexture, inputSampler, uv + vec2<f32>(-1.0, -1.0) * inverseVP).rgb;
    let rgbNE = textureSample(inputTexture, inputSampler, uv + vec2<f32>(1.0, -1.0) * inverseVP).rgb;
    let rgbSW = textureSample(inputTexture, inputSampler, uv + vec2<f32>(-1.0, 1.0) * inverseVP).rgb;
    let rgbSE = textureSample(inputTexture, inputSampler, uv + vec2<f32>(1.0, 1.0) * inverseVP).rgb;
    let rgbM = textureSample(inputTexture, inputSampler, uv).rgb;
    
    // Luma calculation
    let luma = vec3<f32>(0.299, 0.587, 0.114);
    let lumaNW = dot(rgbNW, luma);
    let lumaNE = dot(rgbNE, luma);
    let lumaSW = dot(rgbSW, luma);
    let lumaSE = dot(rgbSE, luma);
    let lumaM = dot(rgbM, luma);
    
    let lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
    let lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
    
    var dir: vec2<f32>;
    dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
    dir.y = ((lumaNW + lumaSW) - (lumaNE + lumaSE));
    
    let dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);
    let rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
    
    dir = min(vec2<f32>(FXAA_SPAN_MAX), max(vec2<f32>(-FXAA_SPAN_MAX), dir * rcpDirMin)) * inverseVP;
    
    let rgbA = 0.5 * (
        textureSample(inputTexture, inputSampler, uv + dir * (1.0 / 3.0 - 0.5)).rgb +
        textureSample(inputTexture, inputSampler, uv + dir * (2.0 / 3.0 - 0.5)).rgb
    );
    
    let rgbB = rgbA * 0.5 + 0.25 * (
        textureSample(inputTexture, inputSampler, uv + dir * -0.5).rgb +
        textureSample(inputTexture, inputSampler, uv + dir * 0.5).rgb
    );
    
    let lumaB = dot(rgbB, luma);
    
    var finalColor: vec3<f32>;
    if (lumaB < lumaMin || lumaB > lumaMax) {
        finalColor = rgbA;
    } else {
        finalColor = rgbB;
    }
    
    return vec4<f32>(finalColor, 1.0);
}
`;
        
        // GLSL Fragment Shader
        this.fragmentShaderGLSL = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D inputTexture;
uniform vec2 resolution;

const float FXAA_SPAN_MAX = 8.0;
const float FXAA_REDUCE_MUL = 1.0 / 8.0;
const float FXAA_REDUCE_MIN = 1.0 / 128.0;

void main() {
    vec2 inverseVP = resolution;
    
    // Sample neighbors
    vec3 rgbNW = texture(inputTexture, vUv + vec2(-1.0, -1.0) * inverseVP).rgb;
    vec3 rgbNE = texture(inputTexture, vUv + vec2(1.0, -1.0) * inverseVP).rgb;
    vec3 rgbSW = texture(inputTexture, vUv + vec2(-1.0, 1.0) * inverseVP).rgb;
    vec3 rgbSE = texture(inputTexture, vUv + vec2(1.0, 1.0) * inverseVP).rgb;
    vec3 rgbM = texture(inputTexture, vUv).rgb;
    
    // Luma calculation
    vec3 luma = vec3(0.299, 0.587, 0.114);
    float lumaNW = dot(rgbNW, luma);
    float lumaNE = dot(rgbNE, luma);
    float lumaSW = dot(rgbSW, luma);
    float lumaSE = dot(rgbSE, luma);
    float lumaM = dot(rgbM, luma);
    
    float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
    float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
    
    vec2 dir;
    dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
    dir.y = ((lumaNW + lumaSW) - (lumaNE + lumaSE));
    
    float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);
    float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
    
    dir = min(vec2(FXAA_SPAN_MAX), max(vec2(-FXAA_SPAN_MAX), dir * rcpDirMin)) * inverseVP;
    
    vec3 rgbA = 0.5 * (
        texture(inputTexture, vUv + dir * (1.0 / 3.0 - 0.5)).rgb +
        texture(inputTexture, vUv + dir * (2.0 / 3.0 - 0.5)).rgb
    );
    
    vec3 rgbB = rgbA * 0.5 + 0.25 * (
        texture(inputTexture, vUv + dir * -0.5).rgb +
        texture(inputTexture, vUv + dir * 0.5).rgb
    );
    
    float lumaB = dot(rgbB, luma);
    
    vec3 finalColor;
    if (lumaB < lumaMin || lumaB > lumaMax) {
        finalColor = rgbA;
    } else {
        finalColor = rgbB;
    }
    
    fragColor = vec4(finalColor, 1.0);
}
`;
        
        this.vertexShaderWGSL = PostProcessPass.getFullscreenQuadVertexWGSL();
        this.vertexShaderGLSL = PostProcessPass.getFullscreenQuadVertexGLSL();
    }
}
