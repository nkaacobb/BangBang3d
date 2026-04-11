# BangBang3d

A complete, vertically integrated 3D rendering engine written entirely in JavaScript. BangBang3d features a **dual-backend architecture** supporting both CPU software rasterization and GPU-accelerated rendering (WebGPU/WebGL2).

## Features

- **Dual Backend Architecture**: Choose CPU (software rasterization) or GPU (WebGPU/WebGL2) at runtime
- **CPU Backend**: Reference implementation with deterministic, inspectable rendering
- **GPU Backend**: Modern shader-driven pipeline with WebGPU (primary) and WebGL2 (fallback)
- **Complete Pipeline**: Scene graph, materials, lighting, shadows, post-processing, and animation
- **Production-Ready**: PBR materials, compute shaders, instancing, skeletal animation, and glTF/GLB loading
- **Educational**: CPU backend makes every step explicit and debuggable
- **Deterministic**: CPU rendering produces reproducible results across all platforms

## Quick Start

### Option 1: Import from Your Web Server

If BangBang3d is served from your web server (e.g., `http://127.0.0.1/repo/Projects/Utilities/BangBang3d/`), you can import directly from any application:

```html
<!DOCTYPE html>
<html>
<head>
    <title>My BangBang3d App</title>
</head>
<body>
    <canvas id="canvas" width="800" height="600"></canvas>
    
    <script type="module">
        // Import from your web server URL
        import {
            Scene,
            Mesh,
            BoxGeometry,
            BasicMaterial,
            PerspectiveCamera,
            BangBangRenderer
        } from 'http://127.0.0.1/repo/Projects/Utilities/BangBang3d/src/index.js';
        
        const canvas = document.getElementById('canvas');
        
        // Backend options: 'cpu' | 'gpu' | 'auto'
        // 'auto' tries GPU first (WebGPU → WebGL2), falls back to CPU
        const renderer = new BangBangRenderer({ 
            canvas, 
            width: 800, 
            height: 600,
            backend: 'auto'  // Use GPU when available
        });
        
        // Wait for async GPU initialization
        await renderer.initialize();
        console.log('Using backend:', renderer.backendType);
        console.log('Capabilities:', renderer.capabilities);
        
        const scene = new Scene();
        const camera = new PerspectiveCamera(75, 800 / 600, 0.1, 100);
        camera.position.z = 5;
        
        const geometry = new BoxGeometry(1, 1, 1);
        const material = new BasicMaterial({ color: 0xff0000 });
        const cube = new Mesh(geometry, material);
        scene.add(cube);
        
        function animate() {
            cube.rotation.x += 0.01;
            cube.rotation.y += 0.01;
            renderer.render(scene, camera);
            requestAnimationFrame(animate);
        }
        animate();
    </script>
</body>
</html>
```

### Option 2: Run Local Development Server

Run a development server from the BangBang3d directory:

```bash
cd d:\Repo\Projects\Utilities\BangBang3d
python -m http.server 8000
# Or using Node.js: npx serve

# Open http://localhost:8000/examples/basic-cube/
# Or http://localhost:8000/examples/debug-views/
```

Then use relative imports in your HTML files:

```javascript
import {
  Scene,
  Mesh,
  BoxGeometry,
  BasicMaterial,
  PerspectiveCamera,
  BangBangRenderer
} from './src/index.js';

// ... rest of your code
```

## Examples

See the `examples/` directory for working demos:
- `basic-cube/` - Rotating cube with flat shading
- `lights/` - Diffuse lighting with multiple light sources
- `textured/` - Texture mapping with procedural textures
- `grid-gizmo/` - Interactive object manipulation with grid reference and picking
- `debug-views/` - Debug visualizations (normals, depth, UVs)
- `backend-test/` - Backend selection (CPU vs GPU)
- `backend-selection-gpu-rendering/` - GPU rendering with geometry management and stats
- `post-processing-tonemapping-fxaa/` - Post-processing (tone mapping, gamma, FXAA)
- `pbr-lighting-shadows/` - PBR materials and advanced lighting (PBR, shadows)
- `advanced-features-dashboard-mock/` - UI mockup for Phase 5 features (prototype only)

## Architecture

### Core vs Backend vs Pipeline

BangBang3d is structured in three layers:

**1. Core (Authoring Layer)**
- Scene graph (Scene, Object3D, Mesh)
- Geometries (BoxGeometry, SphereGeometry, etc.)
- Materials (BasicMaterial, LambertMaterial, PBRMaterial)
- Cameras (PerspectiveCamera, OrthographicCamera)
- Lights (Directional, Point, Spot, Hemisphere)
- Animation (Skeleton, AnimationMixer)
- Assets (glTF/GLB loader)

**2. Backend (Execution Layer)**
- **CPU Backend**: Software rasterization (reference, deterministic, debuggable)
  - Pure JavaScript implementation
  - Complete graphics pipeline in CPU code
  - Rasterization, Z-buffer, shading on CPU
  - Deterministic, reproducible results
  
- **GPU Backend**: Shader-driven pipeline (WebGPU/WebGL2)
  - WebGPU primary (modern, compute shaders)
  - WebGL2 fallback (broad compatibility)
  - Shader compilation for materials
  - GPU buffers and texture management
  - Compute shader support (frustum culling, skinning, particles)

**3. Pipeline (Rendering Orchestration)**
- Render graph for pass scheduling
- Material shader system
- Post-processing composer
- Shadow map passes
- Compute passes (WebGPU only)

### Backend Selection

```javascript
// Explicitly choose CPU backend (software rasterization)
const renderer = new BangBangRenderer({ canvas, backend: 'cpu' });

// Explicitly choose GPU backend (WebGPU/WebGL2)
const renderer = new BangBangRenderer({ canvas, backend: 'gpu' });

// Auto-select: Try GPU first, fallback to CPU
const renderer = new BangBangRenderer({ canvas, backend: 'auto' });
await renderer.initialize();

// Check which backend is active
console.log(renderer.backendType);  // 'cpu', 'webgpu', or 'webgl2'

// Query capabilities
if (renderer.capabilities.supportsPBR) {
    // Use PBR materials
}
if (renderer.capabilities.supportsComputeShaders) {
    // Use GPU compute features
}
```

## Major Features (Current)

**Phase 1-2: Foundation**
- CPU and GPU backend architecture
- WebGPU/WebGL2 initialization and capability detection
- Material shader system (BasicMaterial, LambertMaterial)
- Geometry caching and GPU buffer management

**Phase 3: Render Graph & Post-Processing**
- Render graph for complex pipelines
- Render target management
- Post-processing composer
- Tone mapping (ACES, Reinhard, Linear)
- Gamma correction
- FXAA anti-aliasing

**Phase 4: Lighting & PBR**
- PBR materials with Cook-Torrance BRDF
- Point lights with distance attenuation
- Spot lights with cone falloff
- Hemisphere lights for ambient
- Shadow map infrastructure

**Phase 5: Compute, Animation, Instancing**
- Hardware instancing (1000+ objects per draw call)
- Compute shader infrastructure (WebGPU)
- GPU frustum culling
- Skeletal animation system with mixer
- GPU skinning (10-100x faster than CPU)
- GPU particle system (10,000+ particles @ 60 FPS)
- glTF/GLB asset loader
- Mesh batching (static and dynamic)
- Validation harness with golden scenes

**Legacy Features (Milestone A-E)**
- Debug visualizations (normals, depth, UVs)
- Performance stats and profiling
- Orbit controls for camera
- OBJ/MTL model loading

## Implementation Notes

### Critical Requirements

When implementing or extending BangBang3d, note these critical details:

1. **Vector3.isVector3**: The Vector3 class must include `this.isVector3 = true` in the constructor for polymorphic type checking in Object3D.lookAt() and similar methods.

2. **Backface Culling**: Screen-space culling must use `cross >= 0` (not `<= 0`) due to Y-axis inversion in screen coordinates.

3. **Normal Normalization**: Normalize normals after transformation AND after interpolation to ensure correct lighting.

4. **Ground Planes**: Use thin BoxGeometry instead of PlaneGeometry for horizontal surfaces to avoid depth sorting issues.

See IMPLEMENTATION.md for detailed explanations and code examples.

## Performance

### Backend Comparison

**CPU Backend:**
- Prioritizes correctness and debuggability
- Suitable for 100-500 triangles at 60 FPS
- Deterministic, reproducible rendering
- Educational value: every step is inspectable

**GPU Backend:**
- Production-grade performance
- 100,000+ triangles at 60 FPS
- Hardware instancing for massive object counts
- Compute shaders for GPU-parallel algorithms
- PBR materials, shadows, post-processing

### Optimization Tips

**For CPU Backend:**
- Keep polygon counts reasonable (< 2000 triangles)
- Use `pixelRatio: 0.5` for lower resolution
- Use BasicMaterial (faster than LambertMaterial)
- Minimize lights (each adds per-pixel cost)

**For GPU Backend:**
- Use instancing for repeated objects
- Enable batching for static geometry
- Use compute frustum culling for large scenes
- Profile with browser DevTools

**General:**
- Use TypedArrays for geometry data
- Profile before optimizing
- Check `renderer.info` for render statistics

## Philosophy

- **Nothing is magic**: Pipeline is explicit and debuggable
- **Dual backends, dual strengths**: CPU for correctness, GPU for performance
- **Backend transparency**: Same scene API works with both backends
- **Graceful degradation**: GPU features fallback to CPU when needed
- **Educational clarity**: CPU backend makes rendering inspectable
- **Production ready**: GPU backend delivers modern real-time performance

## Testing

BangBang3d includes comprehensive smoke tests and regression testing using Playwright. The test suite validates both CPU and GPU backends against golden reference images.

**Note**: Tests are designed for **local development only** and run in **headed mode** (visible browser window) because WebGPU/WebGL2 are not reliable in headless Chromium.

### Quick Start

```powershell
# Install dependencies
npm install

# Install Playwright Chromium
npx playwright install chromium

# Run smoke tests (browser window will open)
npm run test:smoke

# Regenerate golden references (after intentional rendering changes)
npm run test:smoke:regen
```

### Test Coverage

- **Backend Selection**: Validates CPU/GPU initialization and capability detection
- **Golden References**: 5 comprehensive test scenes (512×512 resolution)
  - basic_geometry, multiple_lights, pbr_materials, transforms, stress_test
- **CPU Tests**: Pixel-perfect comparison (deterministic)
- **GPU Tests**: Tolerance-based comparison (accounts for driver variations)
- **Failure Artifacts**: Diff images, metrics JSON, and screenshots on failures

See [TESTING.md](TESTING.md) for complete documentation.

## License

MIT

