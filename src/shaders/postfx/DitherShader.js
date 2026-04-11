/**
 * DitherShader.js
 *
 * Retro "classic Mac OS / MacPaint" ordered-dithering shader.
 * Uses Bayer matrices (4×4 and 8×8) to produce a stable, 1-bit
 * black-and-white output from any colour input.
 *
 * Uniforms:
 *   uDitherStrength  – 0..1   mix between original colour and dithered B/W
 *   uThresholdBias   – −0.5..0.5  shifts the black-to-white threshold
 *   uInvert          – 0 or 1  swap black↔white
 *   uMatrixSize      – 4 or 8  Bayer matrix dimension
 *   uViewportOrigin  – vec2    viewport (x,y) in canvas pixels (for stable
 *                               per-camera dithering when using viewports)
 *
 * Phase 3: Post-Processing – Ordered Dithering
 */

/** GLSL 300 es fragment shader */
export const DitherFragmentGLSL = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D inputTexture;
uniform float  uDitherStrength;   // 0..1
uniform float  uThresholdBias;    // -0.5..0.5
uniform float  uInvert;           // 0 or 1
uniform float  uMatrixSize;       // 4 or 8
uniform vec2   uViewportOrigin;   // viewport offset in pixels
uniform vec2   uResolution;       // output resolution in pixels

// ── 4×4 Bayer matrix (normalised to 0-1) ───────────────────────────
float bayer4(int x, int y) {
    // Classic 4×4 Bayer ordered-dither threshold map
    int idx = (x & 3) + ((y & 3) << 2);
    // Lookup table encoded as a sequence of ternary selects (no arrays in ES 3.0 const)
    float v;
    if (idx ==  0) v =  0.0;
    else if (idx ==  1) v =  8.0;
    else if (idx ==  2) v =  2.0;
    else if (idx ==  3) v = 10.0;
    else if (idx ==  4) v = 12.0;
    else if (idx ==  5) v =  4.0;
    else if (idx ==  6) v = 14.0;
    else if (idx ==  7) v =  6.0;
    else if (idx ==  8) v =  3.0;
    else if (idx ==  9) v = 11.0;
    else if (idx == 10) v =  1.0;
    else if (idx == 11) v =  9.0;
    else if (idx == 12) v = 15.0;
    else if (idx == 13) v =  7.0;
    else if (idx == 14) v = 13.0;
    else                v =  5.0;
    return (v + 0.5) / 16.0;
}

// ── 8×8 Bayer matrix (normalised to 0-1) ───────────────────────────
float bayer8(int x, int y) {
    int cx = x & 7;
    int cy = y & 7;
    int idx = cx + cy * 8;
    // Row-major 8×8 Bayer matrix values (0-63)
    float v;
    if      (idx ==  0) v =  0.0; else if (idx ==  1) v = 32.0;
    else if (idx ==  2) v =  8.0; else if (idx ==  3) v = 40.0;
    else if (idx ==  4) v =  2.0; else if (idx ==  5) v = 34.0;
    else if (idx ==  6) v = 10.0; else if (idx ==  7) v = 42.0;
    else if (idx ==  8) v = 48.0; else if (idx ==  9) v = 16.0;
    else if (idx == 10) v = 56.0; else if (idx == 11) v = 24.0;
    else if (idx == 12) v = 50.0; else if (idx == 13) v = 18.0;
    else if (idx == 14) v = 58.0; else if (idx == 15) v = 26.0;
    else if (idx == 16) v = 12.0; else if (idx == 17) v = 44.0;
    else if (idx == 18) v =  4.0; else if (idx == 19) v = 36.0;
    else if (idx == 20) v = 14.0; else if (idx == 21) v = 46.0;
    else if (idx == 22) v =  6.0; else if (idx == 23) v = 38.0;
    else if (idx == 24) v = 60.0; else if (idx == 25) v = 28.0;
    else if (idx == 26) v = 52.0; else if (idx == 27) v = 20.0;
    else if (idx == 28) v = 62.0; else if (idx == 29) v = 30.0;
    else if (idx == 30) v = 54.0; else if (idx == 31) v = 22.0;
    else if (idx == 32) v =  3.0; else if (idx == 33) v = 35.0;
    else if (idx == 34) v = 11.0; else if (idx == 35) v = 43.0;
    else if (idx == 36) v =  1.0; else if (idx == 37) v = 33.0;
    else if (idx == 38) v =  9.0; else if (idx == 39) v = 41.0;
    else if (idx == 40) v = 51.0; else if (idx == 41) v = 19.0;
    else if (idx == 42) v = 59.0; else if (idx == 43) v = 27.0;
    else if (idx == 44) v = 49.0; else if (idx == 45) v = 17.0;
    else if (idx == 46) v = 57.0; else if (idx == 47) v = 25.0;
    else if (idx == 48) v = 15.0; else if (idx == 49) v = 47.0;
    else if (idx == 50) v =  7.0; else if (idx == 51) v = 39.0;
    else if (idx == 52) v = 13.0; else if (idx == 53) v = 45.0;
    else if (idx == 54) v =  5.0; else if (idx == 55) v = 37.0;
    else if (idx == 56) v = 63.0; else if (idx == 57) v = 31.0;
    else if (idx == 58) v = 55.0; else if (idx == 59) v = 23.0;
    else if (idx == 60) v = 61.0; else if (idx == 61) v = 29.0;
    else if (idx == 62) v = 53.0; else                v = 21.0;
    return (v + 0.5) / 64.0;
}

void main() {
    // Sample input colour
    vec3 col = texture(inputTexture, vUv).rgb;

    // Rec. 709 luminance (sRGB-relative)
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));

    // Screen-space pixel coordinate relative to viewport origin
    // (stable across camera viewports – no shimmer on camera move)
    vec2 fragCoord = gl_FragCoord.xy - uViewportOrigin;
    int px = int(fragCoord.x);
    int py = int(fragCoord.y);

    // Bayer threshold
    float threshold;
    if (uMatrixSize < 5.0) {
        threshold = bayer4(px, py);
    } else {
        threshold = bayer8(px, py);
    }

    // Apply threshold bias
    threshold += uThresholdBias;

    // 1-bit quantisation
    float bw = step(threshold, luma);

    // Invert
    bw = mix(bw, 1.0 - bw, uInvert);

    // Blend with original colour at dither strength
    vec3 result = mix(col, vec3(bw), uDitherStrength);

    fragColor = vec4(result, 1.0);
}
`;

/** WGSL fragment shader (for WebGPU) */
export const DitherFragmentWGSL = `
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;
@group(0) @binding(2) var<uniform> params: DitherParams;

struct DitherParams {
    ditherStrength: f32,
    thresholdBias: f32,
    invert: f32,
    matrixSize: f32,
    viewportOrigin: vec2<f32>,
    resolution: vec2<f32>,
};

fn bayer4(x: i32, y: i32) -> f32 {
    let cx = x & 3;
    let cy = y & 3;
    let idx = cx + cy * 4;
    var values = array<f32, 16>(
        0.0, 8.0, 2.0, 10.0,
        12.0, 4.0, 14.0, 6.0,
        3.0, 11.0, 1.0, 9.0,
        15.0, 7.0, 13.0, 5.0
    );
    return (values[idx] + 0.5) / 16.0;
}

fn bayer8(x: i32, y: i32) -> f32 {
    let cx = x & 7;
    let cy = y & 7;
    let idx = cx + cy * 8;
    var values = array<f32, 64>(
         0.0, 32.0,  8.0, 40.0,  2.0, 34.0, 10.0, 42.0,
        48.0, 16.0, 56.0, 24.0, 50.0, 18.0, 58.0, 26.0,
        12.0, 44.0,  4.0, 36.0, 14.0, 46.0,  6.0, 38.0,
        60.0, 28.0, 52.0, 20.0, 62.0, 30.0, 54.0, 22.0,
         3.0, 35.0, 11.0, 43.0,  1.0, 33.0,  9.0, 41.0,
        51.0, 19.0, 59.0, 27.0, 49.0, 17.0, 57.0, 25.0,
        15.0, 47.0,  7.0, 39.0, 13.0, 45.0,  5.0, 37.0,
        63.0, 31.0, 55.0, 23.0, 61.0, 29.0, 53.0, 21.0
    );
    return (values[idx] + 0.5) / 64.0;
}

@fragment
fn main(@location(0) uv: vec2<f32>, @builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let col = textureSample(inputTexture, inputSampler, uv).rgb;
    let luma = dot(col, vec3<f32>(0.2126, 0.7152, 0.0722));

    let fc = fragCoord.xy - params.viewportOrigin;
    let px = i32(fc.x);
    let py = i32(fc.y);

    var threshold: f32;
    if (params.matrixSize < 5.0) {
        threshold = bayer4(px, py);
    } else {
        threshold = bayer8(px, py);
    }
    threshold += params.thresholdBias;
    var bw = select(0.0, 1.0, luma >= threshold);
    bw = mix(bw, 1.0 - bw, params.invert);
    let result = mix(col, vec3<f32>(bw), params.ditherStrength);
    return vec4<f32>(result, 1.0);
}
`;

/** Default uniform values */
export const DitherDefaults = {
    uDitherStrength: 1.0,
    uThresholdBias: 0.0,
    uInvert: 0.0,
    uMatrixSize: 8.0,
    uViewportOrigin: { x: 0, y: 0 },
    uResolution: { x: 800, y: 600 }
};
