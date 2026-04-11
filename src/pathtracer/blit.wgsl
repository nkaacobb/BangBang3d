// ═══════════════════════════════════════════════════════════════════════════
// BangBang3D — Fullscreen blit (vertex + fragment) for path tracer output
// ═══════════════════════════════════════════════════════════════════════════

struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(0)       uv       : vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
  // Fullscreen triangle (3 vertices cover the screen)
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0)
  );
  var uvs = array<vec2f, 3>(
    vec2f(0.0, 1.0),
    vec2f(2.0, 1.0),
    vec2f(0.0, -1.0)
  );

  var output : VertexOutput;
  output.position = vec4f(positions[vertexIndex], 0.0, 1.0);
  output.uv = uvs[vertexIndex];
  return output;
}

@group(0) @binding(0) var blitSampler : sampler;
@group(0) @binding(1) var blitTexture : texture_2d<f32>;

@fragment
fn fs(input : VertexOutput) -> @location(0) vec4f {
  return textureSample(blitTexture, blitSampler, input.uv);
}
