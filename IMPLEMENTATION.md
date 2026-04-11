# BangBang3d Implementation Summary

## Overview

**Note:** This document describes the **CPU backend** implementation (Milestones A-E). BangBang3d now features a dual-backend architecture with both CPU and GPU backends. For current dual-backend architecture, start with [PROJECT-COMPLETION.md](PROJECT-COMPLETION.md) and [DEVELOPER-REFERENCE.md](DEVELOPER-REFERENCE.md). Historical GPU implementation notes are archived in [archive/docs/PHASE-1-SUMMARY.md](archive/docs/PHASE-1-SUMMARY.md) through [archive/docs/PHASE-5-SUMMARY.md](archive/docs/PHASE-5-SUMMARY.md).

BangBang3d's CPU backend is a complete software rasterizer written entirely in JavaScript. It performs all rasterization, shading, and depth testing on the CPU without using WebGL or WebGPU. The CPU backend serves as a reference implementation, educational tool, and deterministic fallback.

## Implementation Status

✅ **Milestone A - Core Reality** (COMPLETE)
- Math library with Vector2, Vector3, Vector4, Matrix4, Quaternion, Euler, Color
- Scene graph with Object3D hierarchy and transform propagation
- PerspectiveCamera and OrthographicCamera with correct projection math
- BufferGeometry and BufferAttribute system

✅ **Milestone B - Pixels Exist** (COMPLETE)
- FrameBuffer (RGBA Uint8ClampedArray)
- DepthBuffer (Float32Array Z-buffer)
- Triangle rasterization using bounding box + barycentric coordinates
- Backface culling
- Near-plane clipping
- Perspective-correct depth interpolation
- BasicMaterial for flat shading

✅ **Milestone C - Light Touches Matter** (COMPLETE)
- Normal attribute support
- AmbientLight implementation
- DirectionalLight implementation
- LambertMaterial with CPU-based diffuse shading
- Perspective-correct normal interpolation
- Shading module with Lambert lighting model

✅ **Milestone D - Skin** (COMPLETE)
- Texture class with sampling and filtering
- TextureLoader with procedural generation
- UV interpolation (perspective-correct)
- Texture sampling in fragment shaders
- Procedural textures (checker, UV test, grid, wood, brick)
- Wrapping modes and bilinear filtering

✅ **Milestone E - Power** (COMPLETE)
- DebugMaterial (normals, depth, UVs visualization)
- Stats utility for performance monitoring
- OrbitControls for camera manipulation
- WorkerRenderer for Web Worker backend
- Debug views example
- Acceleration structures
- Optional WASM/SIMD path

## Architecture

### Directory Structure

```
BangBang3d/
├── src/
│   ├── index.js              # Public API exports
│   ├── math/                 # Math library
│   │   ├── Vector2.js
│   │   ├── Vector3.js
│   │   ├── Vector4.js
│   │   ├── Matrix4.js
│   │   ├── Quaternion.js
│   │   ├── Euler.js
│   │   ├── Color.js
│   │   └── MathUtils.js
│   ├── core/                 # Scene graph
│   │   ├── Object3D.js
│   │   ├── Scene.js
│   │   ├── Mesh.js
│   │   ├── Camera.js
│   │   ├── PerspectiveCamera.js
│   │   └── OrthographicCamera.js
│   ├── geometry/             # Geometry system
│   │   ├── BufferGeometry.js
│   │   ├── BufferAttribute.js
│   │   ├── BoxGeometry.js
│   │   └── PlaneGeometry.js
│   ├── materials/            # Material system
│   │   ├── Material.js
│   │   ├── BasicMaterial.js
│   │   └── LambertMaterial.js
│   ├── lights/               # Lighting system
│   │   ├── Light.js
│   │   ├── AmbientLight.js
│   │   └── DirectionalLight.js
│   └── renderer/             # Rendering pipeline
│       ├── BangBangRenderer.js
│       ├── Pipeline.js
│       ├── FrameBuffer.js
│       ├── DepthBuffer.js
│       ├── ClipSpace.js
│       ├── Rasterizer.js
│       └── Shading.js
├── examples/
│   ├── basic-cube/           # Flat shaded rotating cube
│   │   └── index.html
│   ├── lights/               # Diffuse lighting demo
│   │   └── index.html
│   ├── textured/             # Texture mapping demo
│   │   └── index.html
│   └── debug-views/          # Debug visualization modes
│       └── index.html
├── package.json
├── README.md
├── artifacts.md              # Required assets documentation
└── BangBang3d Specification.md
```

## Technical Implementation Details

### Rendering Pipeline

1. **Scene Traversal**: Walk the scene graph, collect visible meshes and lights
2. **World Transform**: Update matrixWorld for all objects (Object3D hierarchy)
3. **Vertex Transformation**: Transform vertices through model-view-projection matrix
4. **Near-Plane Clipping**: Discard triangles behind camera's near plane
5. **Perspective Divide**: Convert clip space to NDC (-1 to 1)
6. **Viewport Transform**: Map NDC to screen space (pixels)
7. **Backface Culling**: Discard triangles facing away from camera
8. **Rasterization**: For each triangle:
   - Calculate screen-space bounding box
   - For each pixel in bounding box:
     - Calculate barycentric coordinates
     - Test if pixel is inside triangle
     - Interpolate depth (perspective-correct)
     - Perform depth test
     - Run fragment shader
     - Write pixel to framebuffer
9. **Presentation**: Copy framebuffer to canvas via putImageData

### Key Algorithms

#### Barycentric Coordinates
```javascript
// Used for point-in-triangle tests and attribute interpolation
const denom = (v1y - v2y) * (v0x - v2x) + (v2x - v1x) * (v0y - v2y);
const u = ((v1y - v2y) * (px - v2x) + (v2x - v1x) * (py - v2y)) / denom;
const v = ((v2y - v0y) * (px - v2x) + (v0x - v2x) * (py - v2y)) / denom;
const w = 1.0 - u - v;
```

#### Perspective-Correct Interpolation
```javascript
// For normals, UVs, and other attributes
const invW0 = 1.0 / v0.w;
const invW1 = 1.0 / v1.w;
const invW2 = 1.0 / v2.w;
const interpInvW = u * invW0 + v * invW1 + w * invW2;
const result = (u * a0 * invW0 + v * a1 * invW1 + w * a2 * invW2) / interpInvW;
```

#### Lambert Diffuse Shading
```javascript
// Lambertian reflectance: I = max(N · L, 0)
const NdotL = Math.max(0, normal.dot(lightDir));
const diffuse = materialColor * lightColor * lightIntensity * NdotL;
```

### Performance Characteristics

- **TypedArrays**: All buffers use TypedArrays (Float32Array, Uint8ClampedArray)
- **Zero Allocations**: Inner loops reuse scratch variables
- **Deterministic**: Same input always produces same output
- **Inspectable**: All rendering state is JavaScript objects

**Expected Performance**:
- Simple scenes (< 1000 triangles): 30-60 FPS at 800x600
- Medium scenes (1000-5000 triangles): 15-30 FPS at 800x600
- Complex scenes (> 5000 triangles): < 15 FPS at 800x600

*Note: Performance is CPU-bound and depends on triangle count, resolution, and scene complexity.*

## Usage Examples

### Using BangBang3d in Your Applications

BangBang3d can be used in two primary ways:

#### Method 1: Import from Web Server URL

If BangBang3d is accessible via your web server (e.g., `http://127.0.0.1/repo/Projects/Utilities/BangBang3d/`), import directly:

```html
<script type="module">
  // Import from your web server's BangBang3d location
  import {
    Scene, Mesh, BoxGeometry, BasicMaterial,
    PerspectiveCamera, BangBangRenderer
  } from 'http://127.0.0.1/repo/Projects/Utilities/BangBang3d/src/index.js';
  
  const canvas = document.getElementById('canvas');
  const renderer = new BangBangRenderer({ canvas, width: 800, height: 600 });
  
  const scene = new Scene();
  const camera = new PerspectiveCamera(75, 800/600, 0.1, 100);
  camera.position.z = 5;
  
  const cube = new Mesh(
    new BoxGeometry(1, 1, 1),
    new BasicMaterial({ color: 0xff0000 })
  );
  scene.add(cube);
  
  function animate() {
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
</script>
```

#### Method 2: Run Local Development Server

Run a development server from the BangBang3d directory:

```bash
cd d:\Repo\Projects\Utilities\BangBang3d
python -m http.server 8000
# Or using Node.js: npx serve

# Access examples:
# http://localhost:8000/examples/basic-cube/
# http://localhost:8000/examples/lights/
# http://localhost:8000/examples/textured/
# http://localhost:8000/examples/debug-views/
```

Then use relative imports:

```javascript
import {
  Scene, Mesh, BoxGeometry, BasicMaterial,
  PerspectiveCamera, BangBangRenderer
} from './src/index.js';

// ... rest of your code
```

### Basic Cube (Flat Shading)

### Diffuse Lighting

```javascript
import {
  Scene, Mesh, BoxGeometry, LambertMaterial,
  PerspectiveCamera, BangBangRenderer,
  AmbientLight, DirectionalLight, Vector3
} from './src/index.js';

const scene = new Scene();

// Add ambient light
const ambient = new AmbientLight(0xffffff, 0.3);
scene.add(ambient);

// Add directional light
const dirLight = new DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 5, 3);
dirLight.target = new Vector3(0, 0, 0);
scene.add(dirLight);

// Add lit mesh
const cube = new Mesh(
  new BoxGeometry(1, 1, 1),
  new LambertMaterial({ color: 0xcccccc })
);
scene.add(cube);

renderer.render(scene, camera);
```

## Testing the Implementation

### Running Examples

#### Option 1: Using Existing Web Server

If BangBang3d is already accessible via a web server (e.g., `http://127.0.0.1/repo/Projects/Utilities/BangBang3d/`), simply navigate to:

- Basic cube: `http://127.0.0.1/repo/Projects/Utilities/BangBang3d/examples/basic-cube/`
- Lights: `http://127.0.0.1/repo/Projects/Utilities/BangBang3d/examples/lights/`
- Textured: `http://127.0.0.1/repo/Projects/Utilities/BangBang3d/examples/textured/`
- Debug views: `http://127.0.0.1/repo/Projects/Utilities/BangBang3d/examples/debug-views/`

#### Option 2: Run Local Development Server

1. Start a local web server in the BangBang3d root directory:
   ```bash
   cd d:\Repo\Projects\Utilities\BangBang3d
   
   # Using Python
   python -m http.server 8000
   
   # Or using Node.js
   npx serve
   ```

2. Open in browser:
   - Basic cube: `http://localhost:8000/examples/basic-cube/`
   - Lights: `http://localhost:8000/examples/lights/`
   - Textured: `http://localhost:8000/examples/textured/`
   - Debug views: `http://localhost:8000/examples/debug-views/`

### Expected Results

**Basic Cube Example**:
- Red cube rotating smoothly
- Clean edges with depth buffer
- FPS counter showing performance
- No WebGL used (check browser console)

**Lights Example**:
- White cube with orange and blue lighting
- Gray ground plane
- Lighting responds to cube rotation
- Visible ambient + directional light contribution

## Critical Implementation Notes

### Vector3.isVector3 Property
**IMPORTANT**: The Vector3 class MUST include `this.isVector3 = true` in its constructor. This property is required by Object3D.lookAt() and other methods that perform polymorphic type checking. Without this property, lookAt() will fail to properly identify Vector3 parameters, resulting in NaN values in transformation matrices.

```javascript
export class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.isVector3 = true; // REQUIRED for type identification
  }
}
```

### Backface Culling Direction
**IMPORTANT**: Screen-space backface culling must account for Y-flip. After viewport transformation, screen Y coordinates are inverted (origin at top-left). This inverts the winding order, so the culling test should be `cross >= 0` (not `<= 0`).

```javascript
shouldCull(v0, v1, v2) {
  const edge1x = v1.x - v0.x;
  const edge1y = v1.y - v0.y;
  const edge2x = v2.x - v0.x;
  const edge2y = v2.y - v0.y;
  const cross = edge1x * edge2y - edge1y * edge2x;
  return cross >= 0; // Cull if positive (accounts for screen space Y-flip)
}
```

### Normal Vector Normalization
**IMPORTANT**: Normal vectors MUST be normalized after transformation and after interpolation:
1. After transforming normals with the normal matrix (inverse transpose of model matrix)
2. After barycentric interpolation in the fragment shader

Failure to normalize can result in incorrect lighting calculations.

```javascript
// After transformation
const worldNormal = normal.clone()
  .applyMatrix4(normalMatrix)
  .normalize(); // REQUIRED

// After interpolation
const fragmentNormal = interpolateNormal(u, v, w, n0, n1, n2);
fragmentNormal.normalize(); // REQUIRED
```

### Ground Plane Geometry
**IMPORTANT**: For horizontal ground planes, use thin BoxGeometry instead of PlaneGeometry. PlaneGeometry is single-sided and requires rotation, which can cause depth sorting issues from certain angles. A thin box (e.g., BoxGeometry(10, 0.1, 10)) renders correctly from all viewing angles.

```javascript
// Recommended approach
const ground = new Mesh(
  new BoxGeometry(10, 0.1, 10),  // Thin box
  material
);
ground.position.set(0, -0.05, 0);  // Position so top surface is at y=0

// Avoid this (problematic from some angles)
const ground = new Mesh(
  new PlaneGeometry(10, 10),  // Single-sided
  material
);
ground.rotation.x = -Math.PI / 2;  // Can cause depth issues
```

## Known Limitations (Current Implementation)

1. **Simple Clipping**: Only near-plane rejection (no proper clipping)
2. **No Anti-Aliasing**: Raw pixel sampling
3. **Limited Geometry**: Only Box and Plane primitives
4. **No Point/Spot Lights**: Only ambient and directional
5. **Worker Serialization**: WorkerRenderer requires manual scene serialization

## Milestone D - Textures (COMPLETE)

**Features Implemented**:
- ✅ Texture class with sampling and filtering
- ✅ TextureLoader with procedural generation
- ✅ Perspective-correct UV interpolation
- ✅ Texture sampling in fragment shaders
- ✅ Procedural texture generators (checker, UV test, grid, wood, brick)
- ✅ Support for wrapping modes (repeat, clampToEdge, mirroredRepeat)
- ✅ Bilinear texture filtering

**Key Implementation Details**:

**Texture.js**: Core texture storage and sampling
```javascript
const texture = new Texture(imageData);
texture.wrapS = 'repeat';
texture.wrapT = 'repeat';
texture.filter = 'linear'; // or 'nearest'
const color = texture.sample(u, v);
```

**TextureLoader.js**: Procedural texture generation
- `createCheckerTexture(size, color1, color2)` - Classic checkerboard
- `createUVTestTexture(size)` - UV coordinate visualization
- `createGridTexture(size, gridSize, lineColor, bgColor)` - Grid pattern
- `createWoodTexture(size)` - Wood grain simulation
- `createBrickTexture(size)` - Brick wall pattern
- `createProcedural(size, generator)` - Custom generator function

**Perspective-Correct Interpolation**:
```javascript
interpolateUV(u, v, w, uv0, uv1, uv2, invW0, invW1, invW2) {
  const interpInvW = u * invW0 + v * invW1 + w * invW2;
  return {
    x: (u * uv0.x * invW0 + v * uv1.x * invW1 + w * uv2.x * invW2) / interpInvW,
    y: (u * uv0.y * invW0 + v * uv1.y * invW1 + w * uv2.y * invW2) / interpInvW
  };
}
```

## Milestone E - Power (COMPLETE)

**Features Implemented**:
- ✅ DebugMaterial for pipeline visualization
- ✅ Stats utility for performance monitoring
- ✅ OrbitControls for camera manipulation
- ✅ WorkerRenderer for threaded rendering
- ✅ Debug views example

**Key Implementation Details**:

**DebugMaterial.js**: Visualization modes
```javascript
const debugMat = new DebugMaterial({
  mode: 'normals', // 'normals', 'depth', 'uvs', 'worldPosition'
  depthNear: 1.0,
  depthFar: 100.0,
  uvScale: 1.0
});
```

**Stats.js**: Real-time performance metrics
```javascript
const stats = new Stats();
stats.init(); // Creates on-screen display

function animate() {
  stats.begin();
  renderer.render(scene, camera);
  stats.end(); // Updates FPS, frame time, triangle count
}
```

**OrbitControls.js**: Interactive camera controls
```javascript
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 5;
controls.maxDistance = 50;

function animate() {
  controls.update();
  renderer.render(scene, camera);
}
```

**WorkerRenderer.js**: Web Worker backend
```javascript
const renderer = new WorkerRenderer({
  canvas,
  width: 800,
  height: 600,
  onFrame: (stats) => console.log(`FPS: ${stats.fps}`)
});

renderer.setScene(scene);
renderer.setCamera(camera);
renderer.startAnimation(); // Renders in worker thread
```

## Future Enhancements

### Geometry
- [ ] SphereGeometry
- [ ] CylinderGeometry
- [ ] TorusGeometry
- [ ] Custom geometry builder utilities

### Lighting
- [ ] PointLight with distance attenuation
- [ ] SpotLight with cone angle
- [ ] PhongMaterial with specular highlights

### Rendering
- [ ] Wireframe rendering mode
- [ ] Line and point primitive rendering
- [ ] Proper triangle clipping (not just rejection)
- [ ] Multi-sample anti-aliasing (MSAA)

### Performance
- [ ] Acceleration structures (spatial partitioning)
- [ ] Frustum culling
- [ ] WASM/SIMD optimization path
- [ ] Better worker scene serialization
- [ ] Tiled rendering

### Code Quality
- [ ] Unit tests for math library
- [ ] Integration tests for rendering
- [ ] Performance benchmarks
- [ ] API documentation (JSDoc)

## Design Decisions

### Why CPU Rendering?

1. **Educational**: Explicit pipeline, every step visible
2. **Deterministic**: No driver variations
3. **Debuggable**: Set breakpoints anywhere
4. **Portable**: Runs anywhere JavaScript runs
5. **Novel**: Enables non-standard rendering techniques

### Why Column-Major Matrices?

- Maintains compatibility with WebGL/Three.js conventions
- Easier mental model for developers familiar with 3D graphics
- Direct correspondence to mathematical notation

### Why Perspective-Correct Interpolation?

- Essential for correct depth values
- Required for proper texture mapping (Milestone D)
- Industry-standard approach
- Minimal performance overhead

## Performance Tips (CPU Backend)

1. **Reduce Resolution**: Use pixelRatio < 1 for faster rendering
2. **Limit Triangles**: Keep scenes under 2000 triangles for 60 FPS on CPU
3. **Disable Depth Test**: For non-overlapping geometry (if sorted)
4. **Flat Shading**: BasicMaterial is faster than LambertMaterial
5. **Reduce Lights**: Each light adds per-fragment calculations
6. **Consider GPU Backend**: Use `backend: 'auto'` for production (100x+ faster)

## Contributing

When adding features:
1. Follow existing code style
2. Add JSDoc comments to public APIs
3. Update artifacts.md for new assets
4. Create examples demonstrating features
5. Keep files focused and small
6. Avoid allocations in inner loops

## License

MIT License - See repository for details

## Contact

For questions or contributions, see the main repository.

---
 CPU Backend**: Complete software rasterizer for education, debugging, and deterministic rendering. For production use, see the GPU backend (Phases 1-5)
**BangBang3d**: A complete 3D engine where every pixel is earned on the CPU. 🎨🔺

