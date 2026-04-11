/**
 * GaussianSplatShader — renders GaussianSplatCloud as screen-space oriented
 * ellipses via instanced camera-facing quads.
 *
 * Strategy:
 *  - Each splat is an "instance".  The base geometry is a unit quad
 *    (two triangles, 4 vertices, 6 indices).
 *  - The vertex shader:
 *      1. Reads per-instance data from textures (position, scale, rotation,
 *         colour+opacity) — we pack data into RGBA32F data textures.
 *      2. Transforms the splat centre to view space.
 *      3. Computes the 3×3 covariance matrix from scale + rotation.
 *      4. Projects the 3D covariance to 2D screen-space covariance.
 *      5. Decomposes the 2D covariance into two principal axes (eigenvalues)
 *         and expands the quad corners along those axes.
 *  - The fragment shader evaluates exp(-0.5 * d²) where d is the distance
 *    in the Gaussian ellipse's local frame, producing the smooth falloff.
 *
 * Instanced data delivery:
 *  We use data textures rather than per-vertex attributes because WebGL2
 *  has limited attribute count.  Four RGBA32F textures:
 *    tex0 (posScale) : [x,  y,  z,  sx]   per texel row
 *    tex1 (scaleRot) : [sy, sz, qw, qx]
 *    tex2 (rotColor) : [qy, qz, r,  g ]   (r,g are 0-1 floats)
 *    tex3 (colorOpa) : [b,  a,  0,  0 ]
 *  Each splat occupies one texel at coords derived from instance ID.
 */
import { Shader } from './Shader.js';

// ─── GLSL: vertex ──────────────────────────────────────────────────────────

const GLSL_VERTEX = `#version 300 es
precision highp float;
precision highp sampler2D;

// Camera
uniform mat4 uView;
uniform mat4 uProjection;
uniform vec2 uViewport;    // (width, height)
uniform float uCutoff;     // gaussian radius in sigma (~3.0)

// Data textures (one texel per splat)
uniform sampler2D uDataTex0; // x, y, z, sx
uniform sampler2D uDataTex1; // sy, sz, qw, qx
uniform sampler2D uDataTex2; // qy, qz, r, g
uniform sampler2D uDataTex3; // b, a, pad, pad
uniform int uDataWidth;      // texture width (splats laid out in rows)

// Index buffer (sorted order)
uniform sampler2D uSortedIndices; // R32UI or R32F — we store float-encoded index
uniform int uIndexWidth;

// Per-vertex quad corners [-1..1]
in vec2 aQuadPos;  // (-1,-1), (1,-1), (1,1), (-1,1)

// Outputs to fragment shader
out vec4 vColor;   // rgba
out vec2 vOffset;  // position in ellipse local frame (units of sigma)

// ─── helpers ───────────────────────────────────────────────────────────────

ivec2 idToUV(int id, int w) {
  return ivec2(id % w, id / w);
}

// Build rotation matrix from quaternion (w,x,y,z)
mat3 quatToMat3(float w, float x, float y, float z) {
  float xx = x*x, yy = y*y, zz = z*z;
  float xy = x*y, xz = x*z, yz = y*z;
  float wx = w*x, wy = w*y, wz = w*z;
  return mat3(
    1.0 - 2.0*(yy+zz),  2.0*(xy+wz),       2.0*(xz-wy),
    2.0*(xy-wz),         1.0 - 2.0*(xx+zz), 2.0*(yz+wx),
    2.0*(xz+wy),         2.0*(yz-wx),        1.0 - 2.0*(xx+yy)
  );
}

void main() {
  // Resolve sorted index for this instance
  int instanceID = gl_InstanceID;
  ivec2 idxUV = idToUV(instanceID, uIndexWidth);
  float rawIdx = texelFetch(uSortedIndices, idxUV, 0).r;
  int splatID = int(rawIdx);

  // Fetch per-splat data
  ivec2 uv = idToUV(splatID, uDataWidth);
  vec4 d0 = texelFetch(uDataTex0, uv, 0); // x, y, z, sx
  vec4 d1 = texelFetch(uDataTex1, uv, 0); // sy, sz, qw, qx
  vec4 d2 = texelFetch(uDataTex2, uv, 0); // qy, qz, r, g
  vec4 d3 = texelFetch(uDataTex3, uv, 0); // b, a, pad, pad

  vec3 splatPos = d0.xyz;
  vec3 splatScale = vec3(d0.w, d1.x, d1.y);
  vec4 splatQuat = vec4(d1.z, d1.w, d2.x, d2.y); // w,x,y,z
  vec4 splatColor = vec4(d2.z, d2.w, d3.x, d3.y);

  // ── 1. Transform centre to view space ──
  vec4 viewCenter = uView * vec4(splatPos, 1.0);

  // Crude near-plane cull
  if (viewCenter.z > -0.1) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0); // behind far plane
    vColor = vec4(0.0);
    vOffset = vec2(0.0);
    return;
  }

  // ── 2. Covariance in world space:  R · S² · Rᵀ  ──
  mat3 R = quatToMat3(splatQuat.x, splatQuat.y, splatQuat.z, splatQuat.w);
  mat3 S = mat3(
    splatScale.x*splatScale.x, 0.0, 0.0,
    0.0, splatScale.y*splatScale.y, 0.0,
    0.0, 0.0, splatScale.z*splatScale.z
  );
  mat3 Sigma3D = R * S * transpose(R);

  // ── 3. Project 3D covariance to 2D screen covariance ──
  // Jacobian of the perspective projection at the splat centre
  float fx = uProjection[0][0]; // 2n/(r-l) ≈ focal_x / (w/2)
  float fy = uProjection[1][1]; // 2n/(t-b)
  float iz = -1.0 / viewCenter.z;
  // The upper-left 3×3 of the view matrix (rotation only)
  mat3 V3 = mat3(uView);
  mat3 cov3View = V3 * Sigma3D * transpose(V3);

  // Jacobian of projection (see "3D Gaussian Splatting" appendix)
  mat2 J = mat2(
    fx * iz, 0.0,
    0.0,     fy * iz
  );

  // 2D covariance in NDC → pixel
  mat2 cov2D = J * mat2(cov3View[0].xy, cov3View[1].xy) * transpose(J);

  // Add low-pass filter (prevent aliasing from sub-pixel splats)
  cov2D[0][0] += 0.3;
  cov2D[1][1] += 0.3;

  // ── 4. Eigendecomposition of symmetric 2×2 for ellipse axes ──
  float a = cov2D[0][0];
  float b = cov2D[0][1];
  float d = cov2D[1][1];
  float det = a * d - b * b;
  if (det <= 0.0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    vColor = vec4(0.0);
    vOffset = vec2(0.0);
    return;
  }
  float trace = a + d;
  float disc = sqrt(max(trace * trace * 0.25 - det, 0.0));
  float lambda1 = trace * 0.5 + disc;
  float lambda2 = trace * 0.5 - disc;

  if (lambda2 <= 0.0) lambda2 = 0.0001;

  float r1 = sqrt(lambda1) * uCutoff;
  float r2 = sqrt(lambda2) * uCutoff;

  // Screen-space size cull
  float maxR = max(r1, r2) * uViewport.x * 0.5;
  if (maxR < 0.5) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    vColor = vec4(0.0);
    vOffset = vec2(0.0);
    return;
  }

  // Eigenvectors
  vec2 v1;
  if (abs(b) > 0.000001) {
    v1 = normalize(vec2(lambda1 - d, b));
  } else {
    v1 = vec2(1.0, 0.0);
  }
  vec2 v2 = vec2(-v1.y, v1.x);

  // ── 5. Expand quad ──
  vec2 offset = aQuadPos.x * v1 * r1 + aQuadPos.y * v2 * r2;

  // Project centre to clip space
  vec4 clipCenter = uProjection * viewCenter;
  vec2 ndcCenter = clipCenter.xy / clipCenter.w;

  // Offset in NDC
  vec2 ndcOffset = offset; // cov2D is already in NDC
  vec2 finalNDC = ndcCenter + ndcOffset;

  gl_Position = vec4(finalNDC * clipCenter.w, clipCenter.z, clipCenter.w);

  // Pass through
  vColor = splatColor;
  vOffset = aQuadPos * uCutoff;
}
`;

// ─── GLSL: fragment ────────────────────────────────────────────────────────

const GLSL_FRAGMENT = `#version 300 es
precision highp float;

in vec4 vColor;
in vec2 vOffset;
uniform float uCutoff;

layout(location = 0) out vec4 fragColor;

void main() {
  // Gaussian weight: exp(-0.5 * d²) where d is distance in sigma units
  float d2 = dot(vOffset, vOffset) / (uCutoff * uCutoff);
  float gauss = exp(-0.5 * d2 * (uCutoff * uCutoff));

  // Threshold
  if (gauss < 0.004) discard;

  float alpha = vColor.a * gauss;
  // Premultiplied alpha output
  fragColor = vec4(vColor.rgb * alpha, alpha);
}
`;


export class GaussianSplatShader extends Shader {
  constructor() {
    super(
      { glsl: GLSL_VERTEX },
      { glsl: GLSL_FRAGMENT },
      {}
    );
  }

  compile(api, context) {
    if (api !== 'webgl2') throw new Error('GaussianSplatShader only supports WebGL2');
    return this._compileWebGL2(context);
  }

  _compileWebGL2(gl) {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, this.vertexSource.glsl);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      throw new Error('GaussianSplatShader vertex compile:\n' + gl.getShaderInfoLog(vs));
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, this.fragmentSource.glsl);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      throw new Error('GaussianSplatShader fragment compile:\n' + gl.getShaderInfoLog(fs));
    }

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('GaussianSplatShader link:\n' + gl.getProgramInfoLog(program));
    }

    // Attributes
    this.attributeLocations.set('aQuadPos', gl.getAttribLocation(program, 'aQuadPos'));

    // Uniforms
    for (const name of [
      'uView', 'uProjection', 'uViewport', 'uCutoff',
      'uDataTex0', 'uDataTex1', 'uDataTex2', 'uDataTex3',
      'uDataWidth',
      'uSortedIndices', 'uIndexWidth'
    ]) {
      this.uniformLocations.set(name, gl.getUniformLocation(program, name));
    }

    this.compiled = { api: 'webgl2', program, vertexShader: vs, fragmentShader: fs, gl };
    return this.compiled;
  }

  dispose() {
    if (this.compiled && this.compiled.api === 'webgl2') {
      const gl = this.compiled.gl;
      gl.deleteProgram(this.compiled.program);
      gl.deleteShader(this.compiled.vertexShader);
      gl.deleteShader(this.compiled.fragmentShader);
    }
    super.dispose();
  }
}
