# BangBang3D Upgrade Requirements

## Purpose

This document defines the **upgrade requirements** necessary for BangBang3D to become a **full-spectrum replacement** for WebGL- and Three.js–based rendering pipelines.

BangBang3D already establishes a clean separation of concerns:

- **BangBang3D Core** replaces **Three.js scene abstraction** (scene graph, transforms, cameras, geometry/material objects).
- **BangBang3D Backend** replaces **WebGL rendering API** (how pixels are produced and presented).
- **BangBang3D Pipeline** still exists, but its execution depends on the selected backend:
  - CPU backend: software rasterization pipeline
  - GPU backend: shader-driven GPU pipeline

The intent is **not** to throw away what exists. The intent is to **extend** it so that:

- **CPU-only mode remains first-class** (reference, deterministic, educational, portable)
- **GPU capabilities become equally first-class** (modern real-time performance, massive parallelism, advanced features)
- The public API stays stable while the backend and pipeline evolve

The guiding principle:

> Anything they can do, we can do — and eventually do better.

---

## Core Architectural Expansion

## Architectural Invariants (Do Not Break)

These invariants protect what BangBang3D already is while enabling expansion.

1. **Core is stable:** The existing Core APIs (Scene/Object3D/Mesh/Geometry/Material/Camera) remain the primary authoring model.
2. **Backend is pluggable:** Rendering is executed by a backend, not hardcoded into the Core.
3. **Pipeline is backend-defined:** The rendering pipeline (stages, passes, ordering) is expressed in a backend-agnostic way and compiled/executed by the selected backend.
4. **CPU remains reference:** The CPU pipeline remains a correct reference implementation and a deterministic mode.
5. **GPU is peer, not add-on:** GPU is not a “fast path.” It is a full backend with feature parity targets.
6. **No rewrite:** Upgrades must be incremental. Existing examples and content must keep working.

### Incremental Upgrade Rules

- Every new feature must declare:
  - Core changes (if any)
  - Backend requirements (CPU path, GPU path)
  - Pipeline/passes affected
  - Compatibility/fallback behavior
- The engine must never silently drop features when switching backends.
- If a feature cannot be supported equally, it must:
  - degrade gracefully with explicit warnings, or
  - be gated behind capability checks.

---

## Core vs Backend vs Pipeline (Conceptual Model)

The engine is organized around three distinct but cooperating layers.

```
┌──────────────────────────────────────────────────────────────┐
│                        BangBang3D Core                       │
│                                                              │
│  Scene Graph · Object3D · Mesh · Geometry · Material · Camera │
│  Transforms · Hierarchy · Asset References                   │
│                                                              │
│  (Authoring & intent — backend-agnostic)                     │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    Pipeline Description                      │
│                                                              │
│  Render Passes · Ordering · Dependencies · Resources          │
│  Opaque / Transparent / Shadow / Post / UI                   │
│                                                              │
│  (What needs to happen, not how)                             │
└──────────────────────────────────────────────────────────────┘
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
┌───────────────────────────┐   ┌───────────────────────────┐
│     CPU Backend            │   │        GPU Backend         │
│                           │   │                           │
│ Software Rasterization     │   │ WebGPU / WebGL2            │
│ Deterministic Reference    │   │ Shader-driven Pipeline     │
│ Single-thread / Workers    │   │ Massively Parallel         │
│ Debug & Education          │   │ Real-time Performance      │
└───────────────────────────┘   └───────────────────────────┘
```

Key properties:
- Core code never depends on GPU APIs directly
- Pipeline descriptions are backend-agnostic
- Backends compile pipeline descriptions into executable work
- CPU backend acts as a correctness oracle
- GPU backend acts as the performance engine

---

## Capability Matrix (Required for All New Features)

Every new feature **must** be documented using the following matrix. This prevents silent regressions and enforces parity planning.

### Feature Capability Template

| Aspect | CPU Backend | GPU Backend | Notes |
|------|-------------|-------------|-------|
| Supported | Yes / No / Partial | Yes / No / Partial | Overall availability |
| Execution Model | Single-thread / Workers | Vertex / Fragment / Compute | How it runs |
| Pipeline Passes | e.g. Opaque, Shadow | e.g. GBuffer, Post | Affected passes |
| Performance Characteristics | Expected cost | Expected cost | Relative scaling |
| Determinism | Deterministic / Bounded | Deterministic-ish / N/A | Guarantees |
| Debug Support | Full / Partial | Full / Partial | Tooling coverage |
| Fallback Behavior | N/A / Degraded | CPU fallback / Disabled | What happens if unsupported |

### Capability Rules

- A feature is not considered "done" unless **both backends** are addressed.
- Partial support must be explicitly documented.
- GPU-only features must declare CPU fallback behavior.
- CPU-only features must justify why GPU implementation is unnecessary or deferred.

---

## Example Capability Matrix (Concrete Reference)

This example shows how we expect a real feature to be documented. This is also the “minimum bar” for upgrade work.

### Example Feature: Textured Opaque Mesh Rendering

| Aspect | CPU Backend | GPU Backend | Notes |
|------|-------------|-------------|-------|
| Supported | Yes | Yes | Must be baseline parity |
| Execution Model | Software raster + z-buffer | Vertex+Fragment pipeline | GPU uses shader-driven path |
| Pipeline Passes | Opaque | Opaque | Transparent is separate feature |
| Performance Characteristics | Scales poorly with triangles/resolution | Scales with GPU throughput | CPU is reference, GPU is production |
| Determinism | Deterministic | Deterministic-ish | CPU is oracle; GPU validated within tolerance |
| Debug Support | Full (step-through JS) | Full (shader debug outputs + overlays) | Debug views must match conceptually |
| Fallback Behavior | N/A | If GPU unavailable → CPU (auto backend) | Never silently render garbage |

### Example Feature: Transparency (Back-to-Front Sorting)

| Aspect | CPU Backend | GPU Backend | Notes |
|------|-------------|-------------|-------|
| Supported | Yes | Yes | Baseline alpha blending parity |
| Execution Model | Sort meshes; alpha blend per pixel | Sort draw calls; alpha blend in fragment | Optional OIT later |
| Pipeline Passes | Transparent | Transparent | Requires correct depthWrite handling |
| Performance Characteristics | Sorting + blending overhead | Overdraw-sensitive | OIT provides alternate tradeoffs |
| Determinism | Deterministic (stable sort) | Deterministic-ish (stable sort keys) | Sorting rules must be documented |
| Debug Support | Full | Full | Overdraw visualization recommended |
| Fallback Behavior | N/A | If OIT unsupported → baseline sorting | OIT is an enhancement, not a dependency |

---

## Backend Capability Detection

Backends must declare capabilities explicitly so Core and examples can make safe decisions without guessing.

### Required Capability Surface

- `renderer.backendType`: `'cpu' | 'gpu-webgpu' | 'gpu-webgl2'`
- `renderer.capabilities`: stable object describing supported features

### Capability Categories

1. **Core Rendering**
   - `hasDepthTexture`
   - `hasMSAA`
   - `maxTextureSize`
   - `maxColorAttachments`
   - `supportsFloatTextures`

2. **Pipeline Features**
   - `supportsShadows`
   - `supportsPostProcessing`
   - `supportsDeferredOrGBuffer`
   - `supportsOIT`

3. **Shader and Compute**
   - `supportsShaders`
   - `supportsCompute`
   - `supportsStorageBuffers`

4. **Animation and Instancing**
   - `supportsInstancing`
   - `supportsSkinningOnGPU`

### Capability Rules

- Capability checks must be used to gate optional features.
- If a feature is requested but unsupported:
  - log a clear warning
  - select the defined fallback behavior
- Capabilities must be stable across frames.

---

## Validation Harness and Cross-Backend Consistency

To avoid “two engines drifting apart,” BangBang3D must include a validation harness that continuously checks CPU vs GPU outputs.

### Requirements

- **Golden Scene Suite**: a folder of deterministic scenes covering features (lighting, textures, transparency, animation, shadows, post fx)
- **Reference Mode**: CPU backend produces the reference output and statistics
- **GPU Compare Mode**: GPU backend renders the same scenes
- **Diff Metrics**:
  - pixel diff heatmap
  - per-frame numeric diff score
  - tolerance thresholds (configurable)
- **Pass/Fail Reporting**: clear console output and optional UI overlay
- **Capture Artifacts** (dev builds):
  - CPU image
  - GPU image
  - diff image
  - JSON metadata (backend type, capabilities, timings)

### Determinism Guidance

- CPU mode must remain deterministic.
- GPU mode must aim for repeatability:
  - stable sort keys
  - consistent precision rules where feasible
  - bounded tolerance comparisons

---

## Development Phases (Upgrade Plan)

The upgrade must be delivered in staged phases to prevent rewrites and to ensure each layer becomes a stable foundation for the next.

This document defines **5 phases**. Each phase builds on the previous one and should be implemented without requiring structural reversals later.

### Phase 1 — GPU Foundation and Backend Architecture

Goal: introduce GPU as a first-class backend without changing the Core authoring model.

Deliverables:
- Backend selection (`cpu | gpu | auto`) and reporting
- GPU backend bootstrap (WebGPU primary, WebGL2 fallback)
- Unified resource abstraction (buffers/textures/render targets)
- Command encoding/submission skeleton
- Capability detection surface (`renderer.capabilities`)
- Keep all existing CPU examples working unchanged

Out of scope:
- PBR, shadows, post-processing

---

### Phase 2 — Shader-Driven Baseline Renderer (Parity Core)

Goal: achieve baseline parity for the most fundamental rendering features.

Deliverables:
- Shader system (vertex + fragment) with hot reload (dev)
- Pipeline state model (raster/depth/blend/vertex layout)
- Opaque pass parity:
  - basic transforms
  - z-buffer / depth testing
  - textured materials
  - backface culling
- Transparent pass parity:
  - alpha blending
  - depthWrite rules
  - stable sorting rules
- Basic debug views parity (normal/uv/depth/wireframe equivalents)

Out of scope:
- Shadows, PBR, post-processing, compute

---

### Phase 3 — Render Graph and Post-Processing Backbone

Goal: make the pipeline truly multi-pass and extensible.

Deliverables:
- Render graph / pass system implemented for both backends
- Render-to-texture / render target management
- Post-processing chain/composer
- First post effects (minimal set):
  - tone mapping
  - gamma/color correction
  - FXAA (or equivalent)
- Debug instrumentation:
  - pass timing
  - draw counts
  - overdraw visualization

Out of scope:
- Full PBR, full shadows (can begin prototyping here if desired)

---

### Phase 4 — Lighting Expansion, Shadows, and PBR

Goal: reach modern visual fidelity.

Deliverables:
- Additional light types (point/spot/area/hemi) with falloff
- Shadow system:
  - directional shadow maps
  - spot shadows
  - point shadows (if feasible)
  - PCF (or similar filtering)
- PBR material stack:
  - metallic/roughness
  - normal maps
  - AO maps
  - environment maps (IBL)
- Transparency enhancements (optional):
  - weighted blended OIT

Notes:
- CPU backend may implement simplified versions where required, but must document parity and fallback rules in the capability matrix.

---

### Phase 5 — Compute Workloads, Animation, Instancing, and Validation Hardening

Goal: scale up to complex scenes and enforce long-term correctness.

Deliverables:
- Compute stage support (WebGPU) and compute-based optimizations:
  - GPU frustum/cluster culling
  - GPU skinning
  - particles
- Instancing & batching systems
- Skeletal animation system + mixer (CPU path + GPU acceleration where available)
- Asset pipeline expansion (glTF/GLB, compression as available)
- Validation harness fully integrated:
  - golden scenes
  - diff outputs
  - pass/fail gates for CI/dev workflows

---

### Phase Rules (Non-Negotiable)

- Each phase must leave the codebase in a stable, shippable state.
- Each phase must avoid architectural decisions that force rewrites later.
- Each deliverable must be documented with the capability matrix.

---

## GPU Strategy and Architecture

BangBang3D will become a **dual-backend engine**:

- **CPU Backend (First-Class):** reference implementation, deterministic mode, education/debugging, portability.
- **GPU Backend (First-Class):** modern real-time performance, massively parallel pipeline, advanced features.

The engine must treat CPU and GPU as **peer render backends** behind a stable API — not “CPU with a bolt-on GPU mode.”

---

## GPU Backend Requirements (Deep Dive)

### A. Backend Selection

Requirements:
- A single public renderer API supports multiple backends: `renderer = new BangBangRenderer({ backend: 'cpu' | 'gpu' | 'auto' })`
- `auto` selects the best available backend at runtime with explicit reporting
- Backends are hot-swappable in development builds (optional, but extremely useful)

Non-goals:
- No duplicate scene APIs per backend

---

### B. Target GPU APIs

Requirements:
- **Primary:** WebGPU (modern, explicit, compute-friendly)
- **Fallback:** WebGL2 (compatibility) if WebGPU unavailable
- Both backends must share the same higher-level render graph and resource model

---

### C. Render Graph and Render Pass System

Requirements:
- Introduce an explicit **render graph** that describes passes, dependencies, and resources:
  - Opaque pass
  - Transparent pass
  - Shadow passes
  - GBuffer passes (for deferred/clustered variants)
  - Post-processing passes
  - UI/overlay pass
- Passes are backend-agnostic descriptions compiled into CPU loops or GPU command buffers

---

### D. Shader System (Programmable Pipeline)

Requirements:
- First-class shader support with:
  - Vertex stage
  - Fragment stage
  - Compute stage (for culling, skinning, particles, post fx, etc.)
- **WebGPU:** WGSL as the native language
- **Engine Shader DSL (Optional but ideal):** author once → compile to:
  - WGSL (WebGPU)
  - GLSL (WebGL2)
  - CPU reference shader (JS) for deterministic/debug mode

Shader requirements:
- Hot reload in dev
- Introspection (list uniforms, textures, bindings)
- Validation and meaningful errors
- Debug toggles (override outputs, visualize intermediates)

---

### E. Pipeline State Model

Requirements:
- Explicit pipeline state objects:
  - Raster state (cull mode, front face)
  - Depth/stencil state
  - Blend state (including separate alpha)
  - Primitive topology
  - Vertex layout descriptors
- Material compilation produces stable pipeline state + binding layout

---

### F. GPU Resource Model

Requirements:
- Unified resource abstraction for:
  - Buffers (vertex, index, uniform, storage)
  - Textures (2D, cube, array) + samplers
  - Render targets (color, depth)
  - Mipmaps and texture views

Resource requirements:
- Lifetime management (create/dispose)
- Lazy upload and dirty tracking
- Streaming updates (dynamic vertex buffers)
- Explicit staging for large uploads
- Memory budget and diagnostics

---

### G. Command Encoding and Submission

Requirements:
- GPU backend must build explicit command lists:
  - Begin pass
  - Bind pipeline
  - Bind resources
  - Draw/dispatch
  - End pass
- Batched submission per frame with minimal state churn
- Stable frame pacing (avoid GPU/CPU sync stalls)

---

### H. Parallel Workloads (Compute)

Requirements:
- Compute capability used intentionally for:
  - Frustum culling / cluster culling
  - Skinning
  - Particle simulation
  - Tile/cluster light lists
  - Post-processing kernels
  - Optional software features accelerated on GPU

---

### I. Transparency and OIT Options

Requirements:
- Maintain the existing transparent ordering behavior as a baseline
- Add GPU-friendly approaches:
  - Weighted blended OIT (fast, good-looking)
  - Depth peeling (accurate, expensive)
- Choose technique per material or per render pipeline preset

---

### J. Determinism and CPU Reference Parity

Requirements:
- CPU backend remains the reference pipeline
- GPU backend must provide:
  - “Deterministic-ish” mode where feasible (fixed precision rules, stable sort keys)
  - A validation mode that compares GPU outputs to CPU reference within tolerances

Important:
- Perfect bitwise determinism across GPUs is not required, but **repeatability and debuggability** are.

---

### K. Debugging and Instrumentation

Requirements:
- GPU debug overlays:
  - Pass timing
  - Draw counts
  - Triangle counts
  - Overdraw visualization
  - Depth visualization
  - Normal/UV visualization
- Per-pass capture hooks
- Shader debug modes (output intermediate values)
- Optional frame capture export (images + metadata)

---

### L. Compatibility and Fallback Behavior

Requirements:
- If GPU initialization fails:
  - engine falls back to CPU backend automatically (when backend = auto)
  - error is reported clearly in console and debug overlay
- If a feature is unsupported on a backend:
  - provide a defined fallback behavior (reduced quality or alternate pass)
  - never silently render garbage

---

### M. Performance Targets (Guiding, Not Absolute)

GPU backend targets:
- Thousands to millions of triangles feasible depending on device
- Stable 60fps at typical desktop resolutions for moderate scenes
- Clean scaling with instancing and culling enabled

CPU backend targets:
- Remains excellent for:
  - education
  - debugging
  - deterministic tests
  - small/medium scenes

---

### N. “First-Class GPU” Definition

The GPU backend is considered first-class only if it includes:
- Shader-driven pipeline
- Proper buffer/texture management
- Render pass/graph architecture
- Post-processing pipeline support
- Debug tooling comparable to serious engines
- Feature parity path for:
  - shadows
  - PBR
  - instancing
  - skeletal animation

---

### 1. GPU Acceleration

BangBang3D must support optional GPU execution paths while preserving a CPU fallback mode.

Requirements:
- GPU-backed rasterization pipeline
- Retain CPU-only software rasterizer as a reference and debug mode
- Unified scene graph and API regardless of execution backend
- Deterministic mode available even when GPU is enabled

---

### 2. Massively Parallel Execution Model

Support parallel execution comparable to GPU pipelines.

Requirements:
- Parallel vertex processing
- Parallel fragment/pixel processing
- Support for compute-style workloads
- Clear abstraction between scheduling and execution

---

## Programmable Rendering Pipeline

### 3. Programmable Shader System

Introduce a programmable rendering pipeline equivalent to shader-based systems.

Requirements:
- Custom vertex shaders
- Custom fragment shaders
- Optional geometry/tessellation stages (future)
- Explicit control over:
  - Vertex transformation
  - Lighting calculations
  - Color composition
  - Depth handling

Shaders must be:
- Inspectable
- Debuggable
- Hot-reloadable

---

### 4. Material & Shader Abstraction

Materials become structured shader configurations.

Requirements:
- Material = shader + parameters
- Support for:
  - Unlit materials
  - Diffuse (Lambert)
  - Specular (Phong / Blinn)
  - Physically Based Rendering (PBR)
- Parameter binding system (uniforms)

---

## Physically Based Rendering (PBR)

### 5. PBR Feature Set

BangBang3D must implement a modern physically based lighting model.

Requirements:
- Metallic–roughness workflow
- Energy-conserving BRDFs
- Fresnel effects
- Clearcoat, sheen, transmission
- Normal mapping
- Ambient occlusion maps

---

### 6. Image-Based Lighting (IBL)

Requirements:
- Environment maps (HDR)
- Prefiltered radiance maps
- Diffuse irradiance maps
- Reflection probes

---

## Lighting System Expansion

### 7. Full Light Type Support

Requirements:
- Point lights with attenuation
- Spot lights with cone angles
- Rectangular area lights
- Hemisphere lights
- Configurable falloff models

---

### 8. Shadow System

Implement real-time shadow rendering.

Requirements:
- Shadow maps
- Directional light shadows
- Point light shadows
- Spot light shadows
- Filtering techniques (PCF, variance)
- Cascaded shadow maps (directional)

---

## Visual Quality Enhancements

### 9. Anti-Aliasing

Requirements:
- MSAA
- FXAA / SMAA / TAA
- Configurable quality levels

---

### 10. Post-Processing Pipeline

Introduce a multi-pass post-processing system.

Requirements:
- Render-to-texture support
- Post-process chain/composer
- Effects including:
  - Bloom
  - Depth of field
  - Motion blur
  - Color grading
  - Tone mapping
  - Screen-space ambient occlusion
  - Screen-space reflections

---

## Geometry & Scene Optimization

### 11. Advanced Geometry Generation

Requirements:
- Extrusion geometry
- Lathe geometry
- Shape-based geometry
- Text geometry
- Curve-based geometry

---

### 12. Instancing & Batching

Requirements:
- Hardware instancing support
- Efficient draw-call batching
- Per-instance transforms and parameters

---

### 13. Level of Detail (LOD)

Requirements:
- Distance-based LOD switching
- Automatic and manual LOD definitions

---

### 14. Advanced Culling

Requirements:
- View frustum culling
- Occlusion culling
- Hierarchical depth testing

---

## Animation System

### 15. Skeletal Animation

Requirements:
- Bone hierarchy system
- Skinned meshes
- GPU and CPU skinning paths
- Multiple animation blending

---

### 16. Keyframe & Timeline Animation

Requirements:
- Keyframe tracks
- Animation mixer
- Crossfading and blending
- Procedural animation hooks

---

## Asset Pipeline

### 17. Modern Asset Format Support

Requirements:
- glTF / GLB
- Compressed geometry (e.g., Draco)
- Compressed textures
- HDR textures

---

### 18. Texture System Expansion

Requirements:
- Mipmapping
- Anisotropic filtering
- Advanced wrapping modes
- GPU texture compression

---

## Performance & Parallelism

### 19. Multithreading

Requirements:
- Worker-based CPU parallelism
- Task graph execution model
- Asynchronous resource loading

---

## Tooling & Ecosystem

### 20. Developer Tooling

Requirements:
- Scene inspector
- Render pipeline debugger
- Shader debugger
- Performance profiler
- Hot-reload for assets and shaders

---

## Compatibility & Philosophy

### 21. Backward Compatibility

Requirements:
- Existing BangBang3D scenes must continue to function
- CPU-only mode remains first-class

---

### 22. Design Philosophy (Non-Negotiable)

- Deterministic rendering must remain possible
- Rendering pipeline must remain explicit
- No opaque magic layers
- Every pixel must remain traceable

---

## Final Statement

BangBang3D is not evolving to *imitate* existing engines.

It is evolving to **replace them**.

Where others hide complexity behind abstraction, BangBang3D will **expose power without surrendering clarity**.

This document defines the line in the sand.

