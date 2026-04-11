/**
 * SSRPass.js — Screen-Space Reflections for BangBang3D (WebGL2)
 *
 * Two full-screen passes:
 *   1. SSR ray-march:  reads G-buffer (depth, normals, material) + scene color
 *      → outputs reflection color + confidence mask
 *   2. Composite:  blends SSR reflections into the scene color, using
 *      PBR Fresnel, roughness fade, and fallback to env map / probe.
 *
 * The G-buffer is produced by a modified forward pass that writes to MRT
 * (see GPUBackend._renderWebGL2SSR).
 *
 * All shaders are GLSL ES 3.00 (WebGL2).
 */

import PostProcessPass from './PostProcessPass.js';

// ─── SSR Configuration Defaults ─────────────────────────────────────────────

export const SSR_DEFAULTS = Object.freeze({
  maxDistance:     20.0,   // ray-march max world-space distance
  thickness:       0.3,   // depth-comparison thickness (world units)
  stepCount:       64,    // linear steps  (more = sharper, slower)
  binarySteps:      5,    // binary refinement after hit
  roughnessFade:    0.4,  // roughness above which SSR fades to zero
  minConfidence:    0.1,  // confidence below which we skip compositing
  jitter:           1.0,  // temporal jitter  (0 = off)
  enabled:          true,
  debugView:       'final', // 'final' | 'ssr-only' | 'ssr-mask' | 'normals' | 'depth'
});


// ─── GLSL: Full-screen vertex (shared by both passes) ──────────────────────

const FULLSCREEN_VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  float x = float((gl_VertexID << 1) & 2);
  float y = float(gl_VertexID & 2);
  gl_Position = vec4(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  vUv = vec2(x, 1.0 - y);
}
`;


// ─── GLSL: SSR ray-march fragment ──────────────────────────────────────────

const SSR_FS = `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;

// G-buffer textures produced by the forward MRT pass
uniform sampler2D uSceneColor;      // TEXTURE0 — final lit color (with tone-map)
uniform sampler2D uDepth;           // TEXTURE1 — depth texture
uniform sampler2D uNormals;         // TEXTURE2 — view-space normals [0,1]-encoded
uniform sampler2D uMaterial;        // TEXTURE3 — R=metallic, G=roughness, B=reflectivity

// Camera matrices
uniform mat4 uProjection;           // camera projection matrix
uniform mat4 uInverseProjection;    // inverse projection

// Tuning
uniform float uMaxDistance;
uniform float uThickness;
uniform int   uStepCount;
uniform int   uBinarySteps;
uniform float uRoughnessFade;
uniform float uJitter;
uniform float uNear;
uniform float uFar;
uniform vec2  uResolution;

// Outputs
layout(location = 0) out vec4 outReflection;  // rgb = reflected color, a = confidence

// ── Helpers ─────────────────────────────────────────────────────────────────

float linearDepth(float d) {
  // Reversed from GL ndc depth [0..1]
  return (2.0 * uNear * uFar) / (uFar + uNear - (d * 2.0 - 1.0) * (uFar - uNear));
}

vec3 viewPosFromDepth(vec2 uv, float depth) {
  vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 view = uInverseProjection * ndc;
  return view.xyz / view.w;
}

vec3 projectToScreen(vec3 viewPos) {
  vec4 clip = uProjection * vec4(viewPos, 1.0);
  clip.xyz /= clip.w;
  return vec3(clip.xy * 0.5 + 0.5, clip.z * 0.5 + 0.5);
}

// Simple hash for jitter
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  float rawDepth = texture(uDepth, vUv).r;

  // Sky — no reflection source
  if (rawDepth >= 1.0) {
    outReflection = vec4(0.0);
    return;
  }

  // Decode view-space normal
  vec3 normal = texture(uNormals, vUv).rgb * 2.0 - 1.0;
  normal = normalize(normal);

  // Material
  vec4 matSample = texture(uMaterial, vUv);
  float metallic  = matSample.r;
  float roughness = matSample.g;

  // Skip non-reflective surfaces early
  float reflectivity = matSample.b;
  if (reflectivity < 0.01 || roughness > uRoughnessFade) {
    outReflection = vec4(0.0);
    return;
  }

  // Reconstruct view-space position
  vec3 viewPos = viewPosFromDepth(vUv, rawDepth);

  // Reflect view direction
  vec3 viewDir = normalize(viewPos);
  vec3 reflectDir = reflect(viewDir, normal);

  // Starting point
  vec3 startPos = viewPos;
  vec3 endPos   = viewPos + reflectDir * uMaxDistance;

  // Project start and end to screen
  vec3 startScreen = projectToScreen(startPos);
  vec3 endScreen   = projectToScreen(endPos);

  // If the reflection goes behind the camera, clip
  if (endPos.z > -uNear) {
    // Find intersection with near plane
    float t = (-uNear - startPos.z) / (endPos.z - startPos.z);
    endPos = startPos + (endPos - startPos) * max(t - 0.01, 0.0);
    endScreen = projectToScreen(endPos);
  }

  vec3 rayDir = endScreen - startScreen;
  float rayLen = length(rayDir.xy);
  
  if (rayLen < 0.0001) {
    outReflection = vec4(0.0);
    return;
  }

  // Jitter the starting position
  float jitterOffset = hash(vUv * uResolution + float(uStepCount)) * uJitter;

  // Step through screen space
  int stepCount = uStepCount;
  vec3 stepVec = rayDir / float(stepCount);

  vec3 hitPos = vec3(0.0);
  bool hasHit = false;
  float hitConfidence = 0.0;

  vec3 currentPos = startScreen + stepVec * jitterOffset;
  
  for (int i = 0; i < 128; i++) {
    if (i >= stepCount) break;
    
    currentPos += stepVec;

    // Out of screen bounds?
    if (currentPos.x < 0.0 || currentPos.x > 1.0 ||
        currentPos.y < 0.0 || currentPos.y > 1.0 ||
        currentPos.z < 0.0 || currentPos.z > 1.0) {
      break;
    }

    float sampledDepth = texture(uDepth, currentPos.xy).r;
    
    // Reconstruct view-Z at sampled point
    vec3 sampledViewPos = viewPosFromDepth(currentPos.xy, sampledDepth);
    vec3 rayViewPos     = viewPosFromDepth(currentPos.xy, currentPos.z);

    float depthDiff = rayViewPos.z - sampledViewPos.z;

    // Hit: ray is behind the surface but within thickness
    if (depthDiff > 0.0 && depthDiff < uThickness) {
      hitPos = currentPos;
      hasHit = true;
      
      // Binary refinement
      vec3 lo = currentPos - stepVec;
      vec3 hi = currentPos;
      for (int j = 0; j < 8; j++) {
        if (j >= uBinarySteps) break;
        vec3 mid = (lo + hi) * 0.5;
        float midDepth = texture(uDepth, mid.xy).r;
        vec3 midSampled = viewPosFromDepth(mid.xy, midDepth);
        vec3 midRay     = viewPosFromDepth(mid.xy, mid.z);
        float midDiff = midRay.z - midSampled.z;
        if (midDiff > 0.0 && midDiff < uThickness) {
          hi = mid;
          hitPos = mid;
        } else {
          lo = mid;
        }
      }
      break;
    }
  }

  if (!hasHit) {
    outReflection = vec4(0.0);
    return;
  }

  // Confidence factors
  // 1. Screen-edge fade
  vec2 edgeDist = abs(hitPos.xy - 0.5) * 2.0;  // [0..1] from center
  float edgeFade = 1.0 - pow(max(edgeDist.x, edgeDist.y), 4.0);
  edgeFade = clamp(edgeFade, 0.0, 1.0);

  // 2. Roughness fade
  float roughFade = 1.0 - smoothstep(0.0, uRoughnessFade, roughness);

  // 3. Facing fade — reflections nearly parallel to view have lower quality
  float facingFade = 1.0 - pow(abs(dot(viewDir, reflectDir)), 2.0);
  facingFade = clamp(facingFade, 0.0, 1.0);

  // 4. Distance fade
  float marchDist = length(hitPos.xy - startScreen.xy) / max(rayLen, 0.001);
  float distFade = 1.0 - smoothstep(0.8, 1.0, marchDist);

  float confidence = edgeFade * roughFade * facingFade * distFade;
  confidence *= reflectivity;

  // Sample reflected color with roughness-based blur approximation.
  // We generate mipmaps on the scene color texture so higher roughness
  // samples blurrier mip levels.
  float mipBias = roughness * 4.0;
  vec3 reflColor = textureLod(uSceneColor, hitPos.xy, mipBias).rgb;

  outReflection = vec4(reflColor, confidence);
}
`;


// ─── GLSL: SSR Composite fragment ──────────────────────────────────────────

const COMPOSITE_FS = `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;

uniform sampler2D uSceneColor;     // TEXTURE0 — original scene
uniform sampler2D uSSRBuffer;      // TEXTURE1 — SSR reflection (rgb + confidence alpha)
uniform sampler2D uMaterial;       // TEXTURE2 — R=metallic, G=roughness, B=reflectivity
uniform sampler2D uDepth;          // TEXTURE3 — depth
uniform sampler2D uNormals;        // TEXTURE4 — normals (for debug views)

uniform int uDebugView;            // 0=final, 1=ssr-only, 2=ssr-mask, 3=normals, 4=depth
uniform float uMinConfidence;

layout(location = 0) out vec4 outColor;

// Schlick Fresnel
vec3 fresnelSchlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(1.0 - clamp(cosTheta, 0.0, 1.0), 5.0);
}

void main() {
  vec4 sceneColor = texture(uSceneColor, vUv);
  
  // Debug views
  if (uDebugView == 3) {
    // Normals
    vec3 n = texture(uNormals, vUv).rgb;
    outColor = vec4(n, 1.0);
    return;
  }
  if (uDebugView == 4) {
    // Depth
    float d = texture(uDepth, vUv).r;
    d = pow(d, 32.0);  // Enhance contrast for visualization
    outColor = vec4(vec3(d), 1.0);
    return;
  }
  
  vec4 ssrData = texture(uSSRBuffer, vUv);
  vec3 reflColor = ssrData.rgb;
  float confidence = ssrData.a;

  if (uDebugView == 1) {
    // SSR-only
    outColor = vec4(reflColor * confidence, 1.0);
    return;
  }
  if (uDebugView == 2) {
    // SSR mask
    outColor = vec4(vec3(confidence), 1.0);
    return;
  }

  // Final composite
  float rawDepth = texture(uDepth, vUv).r;
  if (rawDepth >= 1.0) {
    outColor = sceneColor;
    return;
  }

  vec4 matSample = texture(uMaterial, vUv);
  float metallic  = matSample.r;
  float roughness = matSample.g;

  // F0 for metals uses the base color (approximated), for dielectrics ~0.04
  vec3 baseColor = sceneColor.rgb;
  vec3 F0 = mix(vec3(0.04), baseColor, metallic);

  // View-space normal and approximate NdotV
  vec3 normal = texture(uNormals, vUv).rgb * 2.0 - 1.0;
  // Since we don't have the view dir readily, approximate with the Z axis
  // (looking down -Z in view space)
  float NdotV = max(abs(normal.z), 0.001);

  vec3 F = fresnelSchlick(NdotV, F0);

  // Modulate by roughness: high roughness→less SSR
  float roughFactor = 1.0 - roughness * roughness;

  // Final reflection weight
  float weight = confidence * roughFactor;

  // Threshold
  if (weight < uMinConfidence) {
    outColor = sceneColor;
    return;
  }

  vec3 finalColor = mix(sceneColor.rgb, reflColor, F * weight);
  outColor = vec4(finalColor, sceneColor.a);
}
`;


// ─── SSRPass class ─────────────────────────────────────────────────────────

export class SSRPass extends PostProcessPass {
  constructor(options = {}) {
    super('SSRPass');

    // Settings (mutable at runtime) — must come right after super()
    // because the base class sets this.enabled which triggers our setter
    this.ssrOptions = { ...SSR_DEFAULTS, ...options };

    // GLSL sources
    this.vertexShaderGLSL = FULLSCREEN_VS;
    this.fragmentShaderGLSL = SSR_FS;

    // Composite pass sources
    this._compositeVS = FULLSCREEN_VS;
    this._compositeFS = COMPOSITE_FS;

    // GPU resources (created by GPUBackend.setupSSR)
    this._ssrProgram = null;
    this._ssrUniforms = {};
    this._compositeProgram = null;
    this._compositeUniforms = {};

    /** FBO holding SSR ray-march output (reflection rgb + confidence a) */
    this._ssrFBO = null;
    this._ssrTexture = null;

    this._compiled = false;
  }

  get enabled() { return this.ssrOptions ? this.ssrOptions.enabled : true; }
  set enabled(v) { if (this.ssrOptions) this.ssrOptions.enabled = v; }

  // Compile both programs on the given GL context
  compile(gl) {
    if (this._compiled) return true;

    this._ssrProgram = this._buildProgram(gl, this.vertexShaderGLSL, this.fragmentShaderGLSL, 'SSR');
    if (!this._ssrProgram) return false;
    this._cacheUniforms(gl, this._ssrProgram, this._ssrUniforms, [
      'uSceneColor', 'uDepth', 'uNormals', 'uMaterial',
      'uProjection', 'uInverseProjection',
      'uMaxDistance', 'uThickness', 'uStepCount', 'uBinarySteps',
      'uRoughnessFade', 'uJitter', 'uNear', 'uFar', 'uResolution'
    ]);

    this._compositeProgram = this._buildProgram(gl, this._compositeVS, this._compositeFS, 'SSRComposite');
    if (!this._compositeProgram) return false;
    this._cacheUniforms(gl, this._compositeProgram, this._compositeUniforms, [
      'uSceneColor', 'uSSRBuffer', 'uMaterial', 'uDepth', 'uNormals',
      'uDebugView', 'uMinConfidence'
    ]);

    this._compiled = true;
    console.log('[SSRPass] Shaders compiled successfully');
    return true;
  }

  // Ensure the SSR FBO matches the given resolution
  ensureFBO(gl, width, height) {
    if (this._ssrFBO && this._ssrWidth === width && this._ssrHeight === height) return;

    // Clean up old
    if (this._ssrFBO) { gl.deleteFramebuffer(this._ssrFBO); this._ssrFBO = null; }
    if (this._ssrTexture) { gl.deleteTexture(this._ssrTexture); this._ssrTexture = null; }

    this._ssrTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._ssrTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this._ssrFBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._ssrFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._ssrTexture, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.error('[SSRPass] SSR FBO incomplete:', status);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    this._ssrWidth = width;
    this._ssrHeight = height;
  }

  // Execute the SSR ray-march pass
  renderSSR(gl, gBuffer, camera, width, height) {
    if (!this._ssrProgram) return;

    this.ensureFBO(gl, width, height);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._ssrFBO);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this._ssrProgram);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);

    const u = this._ssrUniforms;
    const opts = this.ssrOptions;

    // Bind G-buffer textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gBuffer.color);
    gl.uniform1i(u.uSceneColor, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, gBuffer.depth);
    gl.uniform1i(u.uDepth, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, gBuffer.normals);
    gl.uniform1i(u.uNormals, 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, gBuffer.material);
    gl.uniform1i(u.uMaterial, 3);

    // Camera
    gl.uniformMatrix4fv(u.uProjection, false, camera.projectionMatrix.elements);
    
    // Compute inverse projection
    const invProj = new Float32Array(16);
    invertMatrix4(camera.projectionMatrix.elements, invProj);
    gl.uniformMatrix4fv(u.uInverseProjection, false, invProj);

    // Tuning uniforms
    gl.uniform1f(u.uMaxDistance, opts.maxDistance);
    gl.uniform1f(u.uThickness, opts.thickness);
    gl.uniform1i(u.uStepCount, opts.stepCount);
    gl.uniform1i(u.uBinarySteps, opts.binarySteps);
    gl.uniform1f(u.uRoughnessFade, opts.roughnessFade);
    gl.uniform1f(u.uJitter, opts.jitter);
    gl.uniform1f(u.uNear, camera.near);
    gl.uniform1f(u.uFar, camera.far);
    gl.uniform2f(u.uResolution, width, height);

    // Draw fullscreen triangle
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Unbind textures to prevent feedback loops on next frame
    for (let i = 3; i >= 0; i--) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Execute the composite pass — blends SSR into the final image
  renderComposite(gl, gBuffer, outputFBO, width, height) {
    if (!this._compositeProgram) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, outputFBO);
    gl.viewport(0, 0, width, height);

    gl.useProgram(this._compositeProgram);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);

    const u = this._compositeUniforms;

    // Bind textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gBuffer.color);
    gl.uniform1i(u.uSceneColor, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._ssrTexture);
    gl.uniform1i(u.uSSRBuffer, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, gBuffer.material);
    gl.uniform1i(u.uMaterial, 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, gBuffer.depth);
    gl.uniform1i(u.uDepth, 3);

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, gBuffer.normals);
    gl.uniform1i(u.uNormals, 4);

    // Debug view
    const debugMap = { 'final': 0, 'ssr-only': 1, 'ssr-mask': 2, 'normals': 3, 'depth': 4 };
    gl.uniform1i(u.uDebugView, debugMap[this.ssrOptions.debugView] || 0);
    gl.uniform1f(u.uMinConfidence, this.ssrOptions.minConfidence);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Unbind textures to prevent feedback loops on next frame
    for (let i = 4; i >= 0; i--) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  dispose(gl) {
    if (this._ssrProgram) { gl.deleteProgram(this._ssrProgram); this._ssrProgram = null; }
    if (this._compositeProgram) { gl.deleteProgram(this._compositeProgram); this._compositeProgram = null; }
    if (this._ssrFBO) { gl.deleteFramebuffer(this._ssrFBO); this._ssrFBO = null; }
    if (this._ssrTexture) { gl.deleteTexture(this._ssrTexture); this._ssrTexture = null; }
    this._compiled = false;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  _buildProgram(gl, vsSrc, fsSrc, label) {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vsSrc);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error(`[SSRPass] ${label} vertex shader error:`, gl.getShaderInfoLog(vs));
      gl.deleteShader(vs);
      return null;
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsSrc);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error(`[SSRPass] ${label} fragment shader error:`, gl.getShaderInfoLog(fs));
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return null;
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(`[SSRPass] ${label} link error:`, gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      return null;
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
  }

  _cacheUniforms(gl, program, cache, names) {
    gl.useProgram(program);
    for (const n of names) {
      cache[n] = gl.getUniformLocation(program, n);
    }
    gl.useProgram(null);
  }
}


// ── Utility: invert a 4×4 matrix stored as Float32Array(16) ────────────────

function invertMatrix4(m, out) {
  const a00 = m[0],  a01 = m[1],  a02 = m[2],  a03 = m[3];
  const a10 = m[4],  a11 = m[5],  a12 = m[6],  a13 = m[7];
  const a20 = m[8],  a21 = m[9],  a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) { out.set(m); return; }
  det = 1.0 / det;

  out[0]  = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1]  = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2]  = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3]  = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4]  = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5]  = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6]  = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7]  = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8]  = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9]  = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
}
