// ═══════════════════════════════════════════════════════════════════════════
// BangBang3D — Progressive Monte Carlo Path Tracer (WebGPU Compute Shader)
// ═══════════════════════════════════════════════════════════════════════════

// ── Bindings ────────────────────────────────────────────────────────────────
// group 0: frame-level uniforms + accumulation textures
// group 1: scene geometry + BVH
// group 2: materials + emissive lights

struct Uniforms {
  width       : u32,
  height      : u32,
  frameIndex  : u32,
  sampleCount : u32,

  // Camera (packed)
  camPos      : vec3f,
  camFov      : f32,
  camRight    : vec3f,
  camAspect   : f32,
  camUp       : vec3f,
  camNear     : f32,
  camForward  : vec3f,
  camFar      : f32,

  // Options
  maxBounces        : u32,
  russianRouletteDepth : u32,
  clampLuminance    : f32,
  enableNEE         : u32,
  enableMIS         : u32,
  envIntensity      : f32,
  debugMode         : u32,
  samplesPerFrame   : u32,

  // Scene info
  triangleCount     : u32,
  materialCount     : u32,
  emissiveCount     : u32,
  bvhNodeCount      : u32,
};

@group(0) @binding(0) var<uniform> u : Uniforms;
@group(0) @binding(1) var<storage, read_write> accumBuffer : array<vec4f>;
@group(0) @binding(2) var outputTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<storage, read_write> debugCounters : array<atomic<u32>>;

// Triangle positions: 3 vertices × 3 floats = 9 floats per triangle
@group(1) @binding(0) var<storage, read> triPositions : array<f32>;
// Triangle normals: same layout
@group(1) @binding(1) var<storage, read> triNormals : array<f32>;
// Material ID per triangle
@group(1) @binding(2) var<storage, read> triMaterialIds : array<u32>;
// BVH flat nodes: 8 floats per node [minX,minY,minZ,leftOrTriStart, maxX,maxY,maxZ,rightOrTriCount]
@group(1) @binding(3) var<storage, read> bvhNodes : array<f32>;
// BVH triangle index mapping
@group(1) @binding(4) var<storage, read> bvhTriIndices : array<u32>;

// Materials: 12 floats per material [baseR,G,B, metallic, roughness, emR,G,B, emIntensity, opacity, ior, flags]
@group(2) @binding(0) var<storage, read> materials : array<f32>;
// Emissive triangles: 4 floats per entry [triIndex, area, cdfValue, pad]
@group(2) @binding(1) var<storage, read> emissiveTris : array<f32>;

// ── Constants ───────────────────────────────────────────────────────────────
const PI : f32 = 3.14159265358979323846;
const INV_PI : f32 = 0.31830988618379067;
const EPSILON : f32 = 1e-6;
const T_MAX : f32 = 1e30;
const BVH_STACK_SIZE : u32 = 64u;
const LEAF_FLAG : u32 = 0x80000000u;

// ── RNG (PCG) ───────────────────────────────────────────────────────────────
var<private> rngState : u32;

fn pcgHash(input: u32) -> u32 {
  var state = input * 747796405u + 2891336453u;
  var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn initRNG(pixelId: u32, frame: u32) {
  rngState = pcgHash(pixelId ^ (frame * 1099087573u));
}

fn rand() -> f32 {
  rngState = rngState * 747796405u + 2891336453u;
  var word = ((rngState >> ((rngState >> 28u) + 4u)) ^ rngState) * 277803737u;
  word = (word >> 22u) ^ word;
  return f32(word) / 4294967295.0;
}

fn rand2() -> vec2f {
  return vec2f(rand(), rand());
}

// ── Ray & Hit ───────────────────────────────────────────────────────────────
struct Ray {
  origin : vec3f,
  dir    : vec3f,
}

struct HitInfo {
  t      : f32,
  triIdx : u32,
  u      : f32,
  v      : f32,
  hit    : bool,
}

// ── Triangle intersection (Möller–Trumbore) ─────────────────────────────────
fn intersectTriangle(ray: Ray, triIdx: u32) -> HitInfo {
  let base = triIdx * 9u;
  let v0 = vec3f(triPositions[base], triPositions[base+1u], triPositions[base+2u]);
  let v1 = vec3f(triPositions[base+3u], triPositions[base+4u], triPositions[base+5u]);
  let v2 = vec3f(triPositions[base+6u], triPositions[base+7u], triPositions[base+8u]);

  let e1 = v1 - v0;
  let e2 = v2 - v0;
  let h = cross(ray.dir, e2);
  let a = dot(e1, h);

  var result : HitInfo;
  result.hit = false;
  result.t = T_MAX;

  if (abs(a) < EPSILON) { return result; }

  let f = 1.0 / a;
  let s = ray.origin - v0;
  let uu = f * dot(s, h);
  if (uu < 0.0 || uu > 1.0) { return result; }

  let q = cross(s, e1);
  let vv = f * dot(ray.dir, q);
  if (vv < 0.0 || uu + vv > 1.0) { return result; }

  let tt = f * dot(e2, q);
  if (tt > EPSILON) {
    result.hit = true;
    result.t = tt;
    result.triIdx = triIdx;
    result.u = uu;
    result.v = vv;
  }
  return result;
}

// ── BVH traversal (iterative, stack-based) ──────────────────────────────────
fn intersectBVH(ray: Ray) -> HitInfo {
  var closest : HitInfo;
  closest.hit = false;
  closest.t = T_MAX;

  // Check empty scene
  if (u.bvhNodeCount == 0u) { return closest; }

  var stack : array<u32, 64>;
  var stackPtr : i32 = 0;
  stack[0] = 0u;
  stackPtr = 1;

  let invDir = 1.0 / ray.dir;

  while (stackPtr > 0) {
    stackPtr -= 1;
    let nodeIdx = stack[stackPtr];
    let nodeBase = nodeIdx * 8u;

    let bmin = vec3f(bvhNodes[nodeBase], bvhNodes[nodeBase+1u], bvhNodes[nodeBase+2u]);
    let bmax = vec3f(bvhNodes[nodeBase+4u], bvhNodes[nodeBase+5u], bvhNodes[nodeBase+6u]);

    // AABB intersection
    let t1 = (bmin - ray.origin) * invDir;
    let t2 = (bmax - ray.origin) * invDir;
    let tmin_v = min(t1, t2);
    let tmax_v = max(t1, t2);
    let tNear = max(max(tmin_v.x, tmin_v.y), tmin_v.z);
    let tFar = min(min(tmax_v.x, tmax_v.y), tmax_v.z);

    if (tNear > tFar || tFar < 0.0 || tNear > closest.t) {
      continue;
    }

    // Check if leaf
    let field3 = bitcast<u32>(bvhNodes[nodeBase + 3u]);
    let field7 = bitcast<u32>(bvhNodes[nodeBase + 7u]);

    let isLeaf = (field7 & LEAF_FLAG) != 0u;

    if (isLeaf) {
      let triStart = field3;
      let triCount = field7 & 0x7FFFFFFFu;
      for (var i = 0u; i < triCount; i++) {
        let realTriIdx = bvhTriIndices[triStart + i];
        let hit = intersectTriangle(ray, realTriIdx);
        if (hit.hit && hit.t < closest.t) {
          closest = hit;
        }
      }
    } else {
      let leftChild = field3;
      let rightChild = field7;
      if (stackPtr < 62) {
        stack[stackPtr] = leftChild;
        stackPtr += 1;
        stack[stackPtr] = rightChild;
        stackPtr += 1;
      }
    }
  }

  return closest;
}

// ── Shadow ray (any-hit) ────────────────────────────────────────────────────
fn traceShadow(ray: Ray, maxDist: f32) -> bool {
  if (u.bvhNodeCount == 0u) { return false; }

  var stack : array<u32, 64>;
  var stackPtr : i32 = 0;
  stack[0] = 0u;
  stackPtr = 1;
  let invDir = 1.0 / ray.dir;

  while (stackPtr > 0) {
    stackPtr -= 1;
    let nodeIdx = stack[stackPtr];
    let nodeBase = nodeIdx * 8u;

    let bmin = vec3f(bvhNodes[nodeBase], bvhNodes[nodeBase+1u], bvhNodes[nodeBase+2u]);
    let bmax = vec3f(bvhNodes[nodeBase+4u], bvhNodes[nodeBase+5u], bvhNodes[nodeBase+6u]);

    let t1 = (bmin - ray.origin) * invDir;
    let t2 = (bmax - ray.origin) * invDir;
    let tmin_v = min(t1, t2);
    let tmax_v = max(t1, t2);
    let tNear = max(max(tmin_v.x, tmin_v.y), tmin_v.z);
    let tFar = min(min(tmax_v.x, tmax_v.y), tmax_v.z);

    if (tNear > tFar || tFar < 0.0 || tNear > maxDist) { continue; }

    let field3 = bitcast<u32>(bvhNodes[nodeBase + 3u]);
    let field7 = bitcast<u32>(bvhNodes[nodeBase + 7u]);
    let isLeaf = (field7 & LEAF_FLAG) != 0u;

    if (isLeaf) {
      let triStart = field3;
      let triCount = field7 & 0x7FFFFFFFu;
      for (var i = 0u; i < triCount; i++) {
        let realTriIdx = bvhTriIndices[triStart + i];
        let hit = intersectTriangle(Ray(ray.origin, ray.dir), realTriIdx);
        if (hit.hit && hit.t > EPSILON && hit.t < maxDist - EPSILON) {
          return true; // occluded
        }
      }
    } else {
      if (stackPtr < 62) {
        stack[stackPtr] = field3; stackPtr += 1;
        stack[stackPtr] = field7; stackPtr += 1;
      }
    }
  }
  return false;
}

// ── Material helpers ────────────────────────────────────────────────────────
struct MaterialInfo {
  baseColor  : vec3f,
  metallic   : f32,
  roughness  : f32,
  emissive   : vec3f,
  emIntensity: f32,
  opacity    : f32,
}

fn getMaterial(matId: u32) -> MaterialInfo {
  let b = matId * 12u;
  var m : MaterialInfo;
  m.baseColor = vec3f(materials[b], materials[b+1u], materials[b+2u]);
  m.metallic = materials[b+3u];
  m.roughness = max(materials[b+4u], 0.04); // clamp roughness to avoid singularities
  m.emissive = vec3f(materials[b+5u], materials[b+6u], materials[b+7u]);
  m.emIntensity = materials[b+8u];
  m.opacity = materials[b+9u];
  return m;
}

// ── BSDF: Disney/metallic-roughness PBR ─────────────────────────────────────

fn fresnelSchlick(cosTheta: f32, f0: vec3f) -> vec3f {
  let t = clamp(1.0 - cosTheta, 0.0, 1.0);
  let t2 = t * t;
  return f0 + (vec3f(1.0) - f0) * (t2 * t2 * t);
}

fn ggxD(NdotH: f32, alpha: f32) -> f32 {
  let a2 = alpha * alpha;
  let denom = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / (PI * denom * denom + EPSILON);
}

fn smithG1(NdotV: f32, alpha: f32) -> f32 {
  let a2 = alpha * alpha;
  return 2.0 * NdotV / (NdotV + sqrt(a2 + (1.0 - a2) * NdotV * NdotV) + EPSILON);
}

fn smithG(NdotL: f32, NdotV: f32, alpha: f32) -> f32 {
  return smithG1(NdotL, alpha) * smithG1(NdotV, alpha);
}

// Evaluate Cook-Torrance BRDF
fn evalBSDF(wo: vec3f, wi: vec3f, N: vec3f, mat: MaterialInfo) -> vec3f {
  let NdotL = max(dot(N, wi), 0.0);
  let NdotV = max(dot(N, wo), 0.0);
  if (NdotL <= 0.0 || NdotV <= 0.0) { return vec3f(0.0); }

  let H = normalize(wo + wi);
  let NdotH = max(dot(N, H), 0.0);
  let VdotH = max(dot(wo, H), 0.0);

  let alpha = mat.roughness * mat.roughness;

  // F0 for dielectric is 0.04, for metal it's baseColor
  let f0 = mix(vec3f(0.04), mat.baseColor, mat.metallic);
  let F = fresnelSchlick(VdotH, f0);
  let D = ggxD(NdotH, alpha);
  let G = smithG(NdotL, NdotV, alpha);

  // Specular
  let specular = (D * G * F) / (4.0 * NdotL * NdotV + EPSILON);

  // Diffuse (energy-conserving Lambertian)
  let kD = (vec3f(1.0) - F) * (1.0 - mat.metallic);
  let diffuse = kD * mat.baseColor * INV_PI;

  return diffuse + specular;
}

// ── BSDF Sampling ───────────────────────────────────────────────────────────

// Sample GGX VNDF (visible normal distribution)
fn sampleGGXVNDF(Ve: vec3f, alpha: f32, r: vec2f) -> vec3f {
  // Stretch view
  let V = normalize(vec3f(alpha * Ve.x, alpha * Ve.y, Ve.z));
  // Build basis
  let lensq = V.x * V.x + V.y * V.y;
  let T1 = select(vec3f(0.0, 1.0, 0.0), vec3f(-V.y, V.x, 0.0) / sqrt(lensq), lensq > 0.0);
  let T2 = cross(V, T1);
  // Sample disk
  let a = 1.0 / (1.0 + V.z);
  let rr = sqrt(r.x);
  let phi = select(PI * (1.0 + r.y), PI * r.y, r.y < a);
  let p1 = rr * cos(phi);
  let p2 = rr * sin(phi) * select(1.0 - (1.0 - a) * r.y, 1.0, r.y < a);
  // this simplification avoids issues with the disk→hemisphere step
  let NNorm = p1 * T1 + p2 * T2 + sqrt(max(0.0, 1.0 - p1*p1 - p2*p2)) * V;
  // Unstretch
  return normalize(vec3f(alpha * NNorm.x, alpha * NNorm.y, max(NNorm.z, 0.0)));
}

// Build local frame from normal
fn buildONB(N: vec3f) -> mat3x3f {
  let up = select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(N.y) < 0.999);
  let T = normalize(cross(up, N));
  let B = cross(N, T);
  return mat3x3f(T, B, N);
}

fn sampleBSDF(wo: vec3f, N: vec3f, mat: MaterialInfo) -> vec3f {
  // Choose diffuse vs specular based on fresnel weight approximation
  let f0 = mix(vec3f(0.04), mat.baseColor, mat.metallic);
  let NdotV = max(dot(N, wo), 0.001);
  let F = fresnelSchlick(NdotV, f0);
  let specWeight = (F.x + F.y + F.z) / 3.0;
  let diffWeight = (1.0 - specWeight) * (1.0 - mat.metallic);
  let pSpec = specWeight / (specWeight + diffWeight + EPSILON);

  let onb = buildONB(N);
  let woLocal = transpose(onb) * wo;

  if (rand() < pSpec) {
    // Sample specular (GGX)
    let alpha = mat.roughness * mat.roughness;
    let H_local = sampleGGXVNDF(woLocal, alpha, rand2());
    let H = onb * H_local;
    let wi = reflect(-wo, H);
    return wi;
  } else {
    // Sample diffuse (cosine-weighted hemisphere)
    let r = rand2();
    let sinTheta = sqrt(1.0 - r.x);
    let cosTheta = sqrt(r.x);
    let phi = 2.0 * PI * r.y;
    let localDir = vec3f(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta);
    return onb * localDir;
  }
}

fn pdfBSDF(wo: vec3f, wi: vec3f, N: vec3f, mat: MaterialInfo) -> f32 {
  let NdotL = dot(N, wi);
  if (NdotL <= 0.0) { return 0.0; }

  let f0 = mix(vec3f(0.04), mat.baseColor, mat.metallic);
  let NdotV = max(dot(N, wo), 0.001);
  let F = fresnelSchlick(NdotV, f0);
  let specWeight = (F.x + F.y + F.z) / 3.0;
  let diffWeight = (1.0 - specWeight) * (1.0 - mat.metallic);
  let pSpec = specWeight / (specWeight + diffWeight + EPSILON);

  // Diffuse pdf
  let pdfDiff = NdotL * INV_PI;

  // Specular pdf (GGX)
  let H = normalize(wo + wi);
  let NdotH = max(dot(N, H), 0.0);
  let VdotH = max(dot(wo, H), 0.0);
  let alpha = mat.roughness * mat.roughness;
  let D = ggxD(NdotH, alpha);
  let pdfSpec = D * NdotH / (4.0 * VdotH + EPSILON);

  return mix(pdfDiff, pdfSpec, pSpec);
}

// ── Light Sampling (NEE) ────────────────────────────────────────────────────

// NEE result: x,y,z = light irradiance (emission * geometry / pdf), w = 0 if invalid
// neeLightDir is stored in a module-level var
var<private> neeLightDir : vec3f;

fn sampleEmissiveTriangle(hitPos: vec3f, hitNormal: vec3f) -> vec4f {
  if (u.emissiveCount == 0u) { return vec4f(0.0, 0.0, 0.0, 0.0); }

  // Pick emissive triangle via CDF
  let xi = rand();
  var selectedIdx : u32 = 0u;
  for (var i = 0u; i < u.emissiveCount; i++) {
    let cdf = emissiveTris[i * 4u + 2u];
    if (xi <= cdf) { selectedIdx = i; break; }
    selectedIdx = i;
  }

  let triIdxF = emissiveTris[selectedIdx * 4u];
  let triArea = emissiveTris[selectedIdx * 4u + 1u];
  let triIdx = u32(triIdxF);

  // Sample point on triangle (uniform)
  var r1 = rand();
  var r2 = rand();
  if (r1 + r2 > 1.0) {
    r1 = 1.0 - r1;
    r2 = 1.0 - r2;
  }

  let base = triIdx * 9u;
  let v0 = vec3f(triPositions[base], triPositions[base+1u], triPositions[base+2u]);
  let v1 = vec3f(triPositions[base+3u], triPositions[base+4u], triPositions[base+5u]);
  let v2 = vec3f(triPositions[base+6u], triPositions[base+7u], triPositions[base+8u]);

  let lightPos = v0 + r1 * (v1 - v0) + r2 * (v2 - v0);
  let lightDir = lightPos - hitPos;
  let lightDist = length(lightDir);
  let wi = lightDir / lightDist;

  // Light normal
  let e1 = v1 - v0;
  let e2 = v2 - v0;
  let lightNormal = normalize(cross(e1, e2));

  let NdotL = dot(hitNormal, wi);
  let LNdotL = -dot(lightNormal, wi);

  if (NdotL <= 0.0 || LNdotL <= 0.0) { return vec4f(0.0, 0.0, 0.0, 0.0); }

  // Shadow test — hitPos is already offset by the caller
  let shadowRay = Ray(hitPos, wi);
  if (traceShadow(shadowRay, lightDist - EPSILON * 20.0)) {
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }

  // Emissive contribution
  let matId = triMaterialIds[triIdx];
  let mat = getMaterial(matId);
  let emission = mat.emissive * mat.emIntensity;

  // PDF of choosing this triangle:  pdfTriSelect / area
  let pdfTriSelect = select(
    emissiveTris[selectedIdx * 4u + 2u] - emissiveTris[(selectedIdx - 1u) * 4u + 2u],
    emissiveTris[0u * 4u + 2u],
    selectedIdx == 0u
  );
  let pdfLight = pdfTriSelect / (triArea + EPSILON);

  // Geometry factor: convert area pdf to solid angle
  let geometryFactor = LNdotL / (lightDist * lightDist + EPSILON);

  // Return irradiance without BSDF (caller applies BSDF)
  // Contribution = emission * geometryFactor / pdfLight
  let irradiance = emission * geometryFactor / (pdfLight + EPSILON);
  neeLightDir = wi;
  return vec4f(irradiance, 1.0);
}

// ── Environment sampling (simple uniform sphere for now) ────────────────────
fn sampleEnvironment(dir: vec3f) -> vec3f {
  // Simple gradient sky: white-blue
  let t = 0.5 * (dir.y + 1.0);
  return mix(vec3f(1.0, 1.0, 1.0), vec3f(0.5, 0.7, 1.0), t) * u.envIntensity;
}

// ── Tone mapping (ACES filmic) ──────────────────────────────────────────────
fn acesFilmic(x: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

fn linearToSRGB(c: vec3f) -> vec3f {
  return pow(clamp(c, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2));
}

// ── Get shading normal at hit point ─────────────────────────────────────────
fn getHitNormal(hit: HitInfo) -> vec3f {
  let base = hit.triIdx * 9u;
  let n0 = vec3f(triNormals[base], triNormals[base+1u], triNormals[base+2u]);
  let n1 = vec3f(triNormals[base+3u], triNormals[base+4u], triNormals[base+5u]);
  let n2 = vec3f(triNormals[base+6u], triNormals[base+7u], triNormals[base+8u]);
  // Barycentric interpolation
  let w = 1.0 - hit.u - hit.v;
  return normalize(w * n0 + hit.u * n1 + hit.v * n2);
}

fn getHitPosition(ray: Ray, hit: HitInfo) -> vec3f {
  return ray.origin + ray.dir * hit.t;
}

// ── NaN/Inf guard ───────────────────────────────────────────────────────────
fn isValid(v: vec3f) -> bool {
  return !(any(v != v) || any(abs(v) > vec3f(1e30)));
}

fn safeColor(v: vec3f) -> vec3f {
  if (!isValid(v)) { return vec3f(0.0); }
  return v;
}

// ── Luminance ───────────────────────────────────────────────────────────────
fn luminance(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}

// ── Path tracing integrator ─────────────────────────────────────────────────
fn tracePath(primaryRay: Ray) -> vec3f {
  var ray = primaryRay;
  var throughput = vec3f(1.0);
  var radiance = vec3f(0.0);

  for (var bounce = 0u; bounce < u.maxBounces; bounce++) {
    let hit = intersectBVH(ray);

    if (!hit.hit) {
      // Environment
      radiance += throughput * sampleEnvironment(ray.dir);
      break;
    }

    let hitPos = getHitPosition(ray, hit);
    var N = getHitNormal(hit);
    let wo = -ray.dir;

    // Flip normal to face the ray
    if (dot(N, wo) < 0.0) { N = -N; }

    let matId = triMaterialIds[hit.triIdx];
    let mat = getMaterial(matId);

    // Emissive contribution
    let emission = mat.emissive * mat.emIntensity;
    if (luminance(emission) > 0.001) {
      if (bounce == 0u || u.enableMIS == 0u) {
        // Direct hit on light — add emission for primary rays or when MIS is off
        radiance += throughput * emission;
      }
      // When MIS is on and bounce > 0, light contribution is handled by NEE
      // Unless we want to do MIS weight here. For simplicity, add with weight for now.
      if (bounce > 0u && u.enableMIS != 0u) {
        // MIS: BSDF sampling hit a light. Weight vs. light sampling pdf.
        // Approximate: use 0.5 weight (simplified MIS)
        radiance += throughput * emission * 0.5;
      }
      break; // Lights don't reflect
    }

    // Next Event Estimation (direct lighting)
    if (u.enableNEE != 0u && u.emissiveCount > 0u) {
      let neeResult = sampleEmissiveTriangle(hitPos + N * EPSILON * 10.0, N);
      if (neeResult.w > 0.0) {
        // neeResult.xyz = emission * geometryFactor / pdfLight (irradiance without BSDF)
        // neeLightDir = sampled light direction (wi)
        let bsdfVal = evalBSDF(wo, neeLightDir, N, mat);
        let NdotL_nee = dot(N, neeLightDir);
        var neeContrib = bsdfVal * neeResult.xyz * NdotL_nee;
        if (u.enableMIS != 0u) {
          neeContrib *= 0.5; // Power heuristic approximation (MIS weight)
        }
        radiance += throughput * safeColor(neeContrib);
      }
    }

    // Sample BSDF for indirect bounce
    let wi = sampleBSDF(wo, N, mat);
    let NdotL = dot(N, wi);
    if (NdotL <= 0.0) { break; }

    let bsdf = evalBSDF(wo, wi, N, mat);
    let pdf = pdfBSDF(wo, wi, N, mat);
    if (pdf < EPSILON) { break; }

    throughput *= bsdf * NdotL / pdf;

    // Luminance clamp (firefly control)
    if (u.clampLuminance > 0.0) {
      let lum = luminance(throughput);
      if (lum > u.clampLuminance) {
        throughput *= u.clampLuminance / lum;
      }
    }

    // NaN guard
    if (!isValid(throughput)) {
      atomicAdd(&debugCounters[0], 1u);
      break;
    }

    // Russian roulette
    if (bounce >= u.russianRouletteDepth) {
      let q = max(max(throughput.x, throughput.y), throughput.z);
      let survivalProb = min(q, 0.95);
      if (rand() > survivalProb) { break; }
      throughput /= survivalProb;
    }

    ray = Ray(hitPos + N * EPSILON * 10.0, wi);
  }

  return safeColor(radiance);
}

// ── Main compute kernel ─────────────────────────────────────────────────────
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let x = gid.x;
  let y = gid.y;

  if (x >= u.width || y >= u.height) { return; }

  let pixelIdx = y * u.width + x;
  initRNG(pixelIdx, u.frameIndex);

  var sampleColor = vec3f(0.0);

  for (var s = 0u; s < u.samplesPerFrame; s++) {
    // Jittered pixel coordinate
    let jitter = rand2();
    let px = (f32(x) + jitter.x) / f32(u.width);
    let py = (f32(y) + jitter.y) / f32(u.height);

    // Camera ray
    let halfH = tan(u.camFov * 0.5);
    let halfW = halfH * u.camAspect;

    let screenX = (2.0 * px - 1.0) * halfW;
    let screenY = (1.0 - 2.0 * py) * halfH;

    let rayDir = normalize(u.camForward + screenX * u.camRight + screenY * u.camUp);
    let ray = Ray(u.camPos, rayDir);

    // Debug modes
    if (u.debugMode == 1u) {
      // Albedo
      let hit = intersectBVH(ray);
      if (hit.hit) {
        let matId = triMaterialIds[hit.triIdx];
        let mat = getMaterial(matId);
        sampleColor += mat.baseColor;
      }
      continue;
    }
    if (u.debugMode == 2u) {
      // Normals
      let hit = intersectBVH(ray);
      if (hit.hit) {
        let N = getHitNormal(hit);
        sampleColor += N * 0.5 + 0.5;
      }
      continue;
    }
    if (u.debugMode == 3u) {
      // Depth
      let hit = intersectBVH(ray);
      if (hit.hit) {
        let d = clamp(hit.t / u.camFar, 0.0, 1.0);
        sampleColor += vec3f(1.0 - d);
      }
      continue;
    }

    sampleColor += tracePath(ray);
  }

  sampleColor /= f32(u.samplesPerFrame);
  sampleColor = safeColor(sampleColor);

  // Progressive accumulation
  let prevAccum = accumBuffer[pixelIdx];
  let prevCount = prevAccum.w;
  let newCount = prevCount + 1.0;
  let newAccum = vec4f(
    prevAccum.xyz + sampleColor,
    newCount
  );
  accumBuffer[pixelIdx] = newAccum;

  // Compute averaged color
  var finalColor = newAccum.xyz / newCount;

  // NaN heatmap debug
  if (u.debugMode == 5u) {
    let nanCount = f32(atomicLoad(&debugCounters[0]));
    let heat = clamp(nanCount / 1000.0, 0.0, 1.0);
    finalColor = vec3f(heat, 0.0, 1.0 - heat);
  } else if (u.debugMode == 4u) {
    // Sample count visualization
    let sc = clamp(newCount / 1000.0, 0.0, 1.0);
    finalColor = vec3f(sc, sc * 0.5, 0.0);
  } else {
    // Tone mapping + gamma
    finalColor = acesFilmic(finalColor);
    finalColor = linearToSRGB(finalColor);
  }

  textureStore(outputTex, vec2i(i32(x), i32(y)), vec4f(finalColor, 1.0));
}
