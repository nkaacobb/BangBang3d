## BangBang3d — A Complete Software 3D Engine Stack (CPU-First, No GPU APIs)

**Historical Note (February 2026):** This document describes the original BangBang3d CPU-only specification (Milestones A-E). BangBang3d has since been upgraded to a dual-backend architecture supporting both CPU and GPU rendering. For the historical GPU upgrade specification, see [archive/docs/BangBang3D-upgrade-requirements.md](archive/docs/BangBang3D-upgrade-requirements.md). For current architecture, see [PROJECT-COMPLETION.md](PROJECT-COMPLETION.md) and [DEVELOPER-REFERENCE.md](DEVELOPER-REFERENCE.md).

**CPU Backend:** The CPU backend described in this specification remains fully functional and serves as a reference implementation, educational tool, and deterministic fallback. All features described here continue to work in the current dual-backend architecture.

---

## 1. Purpose

**BangBang3d** is a complete, vertically integrated 3D engine implemented entirely in JavaScript.

It replaces:

- **Three.js** (scene abstraction, materials, geometry, cameras)
    
- **WebGL** (rasterization, depth testing, shading, framebuffer control)
    

BangBang3d is **not** a wrapper, binding, or frontend to any GPU API.  
It is a **pure software engine** that owns the full rendering pipeline from math to pixels.

This engine exists so that someone can say:

> “I want to build a 3D simulator using BangBang3d.”

…and mean _everything_.

---

## 2. Foundational Philosophy

1. **Nothing is magic**
    
2. **Every pixel is earned**
    
3. **The pipeline is explicit**
    
4. **Correctness before throughput**
    
5. **Performance through understanding, not delegation**
    

BangBang3d values:

- Determinism
    
- Inspectability
    
- Hackability
    
- Educational clarity
    
- Novel rendering approaches
    

Over:

- Raw polygon counts
    
- Driver-dependent behavior
    
- Hidden state machines
    

---

## 3. What BangBang3d Replaces

|Layer|Typical Stack|BangBang3d|
|---|---|---|
|Scene graph|Three.js|✔|
|Math library|Three.js / gl-matrix|✔|
|Geometry system|Three.js|✔|
|Material system|Three.js + GLSL|✔|
|Lighting|GPU shaders|✔ (CPU)|
|Rasterization|WebGL / GPU|✔ (CPU)|
|Depth testing|GPU|✔|
|Framebuffer|GPU|✔|
|Presentation|Canvas/WebGL|✔ (Canvas ImageData only)|

BangBang3d **does not depend on**:

- WebGL
    
- WebGPU
    
- GLSL
    
- Browser GPU drivers
    
- Native extensions
    

---

## 4. Engine Architecture (Full Stack)

### 4.1 Pipeline Ownership

BangBang3d explicitly implements:

1. Scene traversal
    
2. World transform propagation
    
3. Camera view/projection
    
4. Vertex transformation
    
5. Clipping (near plane minimum)
    
6. Perspective divide
    
7. Viewport transform
    
8. Backface culling
    
9. Triangle rasterization
    
10. Attribute interpolation
    
11. Depth testing (Z-buffer)
    
12. Lighting & shading
    
13. Texture sampling
    
14. Framebuffer writes
    
15. Final presentation to canvas
    

No step is delegated.

---

## 5. Repository Structure

``` markdown

BangBang3d/
  package.json
  README.md
  specification.md

  src/
    index.js                # public API

    core/
      Object3D.js
      Scene.js
      Mesh.js
      Camera.js
      PerspectiveCamera.js
      OrthographicCamera.js
      Clock.js
      EventDispatcher.js

    math/
      Vector2.js
      Vector3.js
      Vector4.js
      Matrix4.js
      Quaternion.js
      Euler.js
      Color.js
      Ray.js
      Box3.js
      Sphere.js
      MathUtils.js

    geometry/
      BufferGeometry.js
      BufferAttribute.js
      BoxGeometry.js
      SphereGeometry.js
      PlaneGeometry.js

    materials/
      Material.js
      BasicMaterial.js        # unlit
      LambertMaterial.js     # diffuse
      PhongMaterial.js       # optional later
      DebugMaterial.js       # normals, depth, UVs

    lights/
      Light.js
      AmbientLight.js
      DirectionalLight.js
      PointLight.js

    renderer/
      BangBangRenderer.js       # main engine interface
      Pipeline.js            # orchestration
      ClipSpace.js
      Rasterizer.js
      FrameBuffer.js
      DepthBuffer.js
      TextureSampler.js
      Shading.js
      constants.js

    resources/
      Texture.js
      TextureLoader.js
      ImageLoader.js

    extras/
      controls/
        OrbitControls.js     # CPU-side camera controls
      utils/
        Stats.js

  examples/
    basic-cube/
    lights/
    textured/
    debug-views/

```

---

## 6. Public API (Engine-Level)

### Renderer

``` js

const renderer = new BangBangRenderer({
  canvas,
  width,
  height,
  pixelRatio
});
renderer.render(scene, camera);
```

### Scene Graph

- `Object3D`
    
- `Scene`
    
- `Mesh`
    
- Hierarchical transforms
    
- Deterministic update order
    

### Geometry

- `BufferGeometry`
    
- `BufferAttribute`
    
- Indexed & non-indexed geometry
    

### Materials

- `BasicMaterial` (flat / vertex / texture)
    
- `LambertMaterial` (CPU lighting)
    
- Debug materials (depth, normals, UVs)
    

### Lighting

- Ambient
    
- Directional
    
- Point (V1.1+)
    

---

## 7. Rasterization Details

### Triangle Processing

- Screen-space bounding box
    
- Barycentric coordinates
    
- Perspective-correct interpolation (depth, UVs)
    
- Backface culling
    
- Near-plane clipping (mandatory)
    

### Framebuffer

- RGBA: `Uint8ClampedArray`
    
- Depth: `Float32Array`
    
- Cleared every frame (or regionally later)
    

### Shading

- CPU lighting functions
    
- No shader language
    
- Shading is **JavaScript code**
    

---

## 8. Performance Strategy

- TypedArrays everywhere
    
- Zero allocations in inner loops
    
- Scratch vectors reused
    
- Optional OffscreenCanvas worker backend
    
- Optional WASM/SIMD backend later
    

---

## 9. Milestones

### Milestone A — Core Reality

- Math
    
- Scene graph
    
- Camera projection
    
- Deterministic transforms
    

### Milestone B — Pixels Exist

- Framebuffer + depth buffer
    
- Triangle rasterization
    
- Flat shaded cube
    

### Milestone C — Light Touches Matter

- Normals
    
- Diffuse lighting
    
- Ambient + directional light
    

### Milestone D — Skin

- Textures
    
- UV interpolation
    
- Sampling
    

### Milestone E — Power

- Debug views
    
- Worker backend
    
- Acceleration structures
    
- WASM path
    

---

## 10. What This Engine Is For

- Simulators
    
- Research
    
- Education
    
- Deterministic rendering
    
- Experimental spaces
    
- People who want to _own_ the pipeline
