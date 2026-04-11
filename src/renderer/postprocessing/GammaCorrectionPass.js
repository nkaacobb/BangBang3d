/**
 * GammaCorrectionPass.js
 * 
 * Applies gamma correction to convert from linear color space to sRGB.
 * Essential for proper color reproduction on displays.
 * 
 * Phase 3: Post-Processing Effects
 */

import PostProcessPass from './PostProcessPass.js';

export default class GammaCorrectionPass extends PostProcessPass {
    constructor(gamma = 2.2) {
        super('GammaCorrection');
        
        this.gamma = gamma;
        this.uniforms = {
            gamma: gamma,
            invGamma: 1.0 / gamma
        };
        
        this._defineShaders();
    }
    
    /**
     * Set gamma value
     */
    setGamma(gamma) {
        this.gamma = gamma;
        this.uniforms.gamma = gamma;
        this.uniforms.invGamma = 1.0 / gamma;
    }
    
    _defineShaders() {
        // WGSL Fragment Shader
        this.fragmentShaderWGSL = `
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;

struct Uniforms {
    gamma: f32,
    invGamma: f32,
    padding: vec2<f32>
};
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@fragment
fn main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let color = textureSample(inputTexture, inputSampler, uv).rgb;
    
    // Apply gamma correction (linear to sRGB)
    let corrected = pow(color, vec3<f32>(uniforms.invGamma));
    
    return vec4<f32>(corrected, 1.0);
}
`;
        
        // GLSL Fragment Shader
        this.fragmentShaderGLSL = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D inputTexture;
uniform float invGamma;

void main() {
    vec3 color = texture(inputTexture, vUv).rgb;
    
    // Apply gamma correction (linear to sRGB)
    vec3 corrected = pow(color, vec3(invGamma));
    
    fragColor = vec4(corrected, 1.0);
}
`;
        
        this.vertexShaderWGSL = PostProcessPass.getFullscreenQuadVertexWGSL();
        this.vertexShaderGLSL = PostProcessPass.getFullscreenQuadVertexGLSL();
    }
}
