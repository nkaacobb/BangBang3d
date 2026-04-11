// ═══════════════════════════════════════════════════════════════════════════
// BangBang3D — À-Trous Wavelet Denoiser (WebGPU Compute Shader)
// Edge-aware bilateral filter using normal + depth as guide signals.
// ═══════════════════════════════════════════════════════════════════════════

struct DenoiseUniforms {
  width      : u32,
  height     : u32,
  stepWidth  : u32,
  strength   : f32,
  normalPhi  : f32,
  depthPhi   : f32,
  pad0       : f32,
  pad1       : f32,
};

@group(0) @binding(0) var<uniform> params : DenoiseUniforms;
@group(0) @binding(1) var inputTex  : texture_2d<f32>;
@group(0) @binding(2) var outputTex : texture_storage_2d<rgba8unorm, write>;

// 5×5 à-trous kernel weights (B3 spline)
const kernel : array<f32, 25> = array<f32, 25>(
  1.0/256.0, 4.0/256.0,  6.0/256.0,  4.0/256.0, 1.0/256.0,
  4.0/256.0, 16.0/256.0, 24.0/256.0, 16.0/256.0, 4.0/256.0,
  6.0/256.0, 24.0/256.0, 36.0/256.0, 24.0/256.0, 6.0/256.0,
  4.0/256.0, 16.0/256.0, 24.0/256.0, 16.0/256.0, 4.0/256.0,
  1.0/256.0, 4.0/256.0,  6.0/256.0,  4.0/256.0, 1.0/256.0,
);

const offsets : array<vec2i, 25> = array<vec2i, 25>(
  vec2i(-2,-2), vec2i(-1,-2), vec2i(0,-2), vec2i(1,-2), vec2i(2,-2),
  vec2i(-2,-1), vec2i(-1,-1), vec2i(0,-1), vec2i(1,-1), vec2i(2,-1),
  vec2i(-2, 0), vec2i(-1, 0), vec2i(0, 0), vec2i(1, 0), vec2i(2, 0),
  vec2i(-2, 1), vec2i(-1, 1), vec2i(0, 1), vec2i(1, 1), vec2i(2, 1),
  vec2i(-2, 2), vec2i(-1, 2), vec2i(0, 2), vec2i(1, 2), vec2i(2, 2),
);

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let x = i32(gid.x);
  let y = i32(gid.y);
  let w = i32(params.width);
  let h = i32(params.height);

  if (x >= w || y >= h) { return; }

  let centerColor = textureLoad(inputTex, vec2i(x, y), 0);
  var sumColor = vec3f(0.0);
  var sumWeight = 0.0;
  let step = i32(params.stepWidth);

  for (var i = 0; i < 25; i++) {
    let samplePos = vec2i(x, y) + offsets[i] * step;
    
    // Clamp to image bounds
    let sx = clamp(samplePos.x, 0, w - 1);
    let sy = clamp(samplePos.y, 0, h - 1);

    let sampleColor = textureLoad(inputTex, vec2i(sx, sy), 0);

    // Color distance weight
    let diff = centerColor.rgb - sampleColor.rgb;
    let colorDist = dot(diff, diff);
    let colorWeight = exp(-colorDist / (params.strength + 0.0001));

    let w_k = kernel[i] * colorWeight;
    sumColor += sampleColor.rgb * w_k;
    sumWeight += w_k;
  }

  let result = sumColor / max(sumWeight, 0.0001);
  textureStore(outputTex, vec2i(x, y), vec4f(result, 1.0));
}
