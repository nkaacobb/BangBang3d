# BangBang3d Quick Start Guide

## What is BangBang3d?

BangBang3d is a complete 3D rendering engine featuring a **dual-backend architecture**:
- **CPU Backend**: Software rasterization (reference, deterministic, educational)
- **GPU Backend**: WebGPU/WebGL2 shader-driven pipeline (production-grade performance)

You choose the backend at runtime. The same scene API works with both.

## Getting Started (5 Minutes)

### 1. Clone or Download

```bash
cd your-project-folder
```

Ensure you have the BangBang3d directory structure:
```
BangBang3d/
├── src/          # Engine source
├── examples/     # Working demos
└── package.json
```

### 2. Run a Local Server

BangBang3d uses ES modules and requires a local server:

```bash
# Using Python 3
python -m http.server 8000

# Or using Node.js
npx serve

# Or using VS Code Live Server extension
# Right-click index.html → Open with Live Server
```

### 3. Open an Example

Navigate to:
- **Basic Cube**: `http://localhost:8000/examples/basic-cube/index.html`
- **Lighting**: `http://localhost:8000/examples/lights/index.html`
- **Textured**: `http://localhost:8000/examples/textured/index.html`
- **Grid Gizmo**: `http://localhost:8000/examples/grid-gizmo/index.html` (object picking and manipulation)
- **Glass**: `http://localhost:8000/examples/glass/index.html`
- **Backend Test**: `http://localhost:8000/examples/backend-test/index.html` (compare CPU vs GPU)
- **GPU Rendering**: `http://localhost:8000/examples/backend-selection-gpu-rendering/index.html` (GPU rendering with stats)
- **Post-Processing**: `http://localhost:8000/examples/post-processing-tonemapping-fxaa/index.html` (tone mapping, FXAA)
- **PBR Materials**: `http://localhost:8000/examples/pbr-lighting-shadows/index.html` (physically-based rendering)
- **Advanced Features Mock**: `http://localhost:8000/examples/advanced-features-dashboard-mock/index.html` (UI prototype)

You should see:
- ✅ A rotating 3D cube
- ✅ FPS counter in top-left
- ✅ Smooth animation

## Create Your First Scene

### Minimal Example (30 seconds)

Create `my-scene.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>My BangBang3d Scene</title>
  <style>
    body { margin: 0; }
    canvas { display: block; }
  </style>
</head>
<body>
  <canvas id="canvas"></canvas>
  
  <script type="module">
    import {
      Scene, Mesh, BoxGeometry, SphereGeometry, BasicMaterial,
      PerspectiveCamera, BangBangRenderer
    } from './src/index.js';

    // Setup
    const canvas = document.getElementById('canvas');
    const renderer = new BangBangRenderer({
      canvas: canvas,
      width: window.innerWidth,
      height: window.innerHeight,
      backend: 'auto'  // 'cpu' | 'gpu' | 'auto'
    });

    // Wait for async GPU initialization (if using GPU backend)
    await renderer.initialize();
    console.log('Backend:', renderer.backendType);

    const scene = new Scene();
    const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 5;

    // Create a cube (or try SphereGeometry!)
    const cube = new Mesh(
      new BoxGeometry(1, 1, 1),
      new BasicMaterial({ color: 0x00ff00 })  // Green
    );
    scene.add(cube);

    // Try a sphere:
    // const sphere = new Mesh(
    //   new SphereGeometry(1, 32, 24),  // radius, width segments, height segments
    //   new BasicMaterial({ color: 0xff0000 })  // Red
    // );
    // sphere.position.x = 2;
    // scene.add(sphere);

    // Animate
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

Open in browser → See rotating green cube!

## Add Lighting (2 minutes)

Replace the material and add lights:

```javascript
import {
  Scene, Mesh, BoxGeometry, LambertMaterial,  // Changed material
  PerspectiveCamera, BangBangRenderer,
  AmbientLight, DirectionalLight, Vector3      // Added lights
} from './src/index.js';

// ... setup code ...

// Add lights
const ambient = new AmbientLight(0xffffff, 0.4);
scene.add(ambient);

const sun = new DirectionalLight(0xffffff, 0.8);
sun.position.set(5, 5, 5);
sun.target = new Vector3(0, 0, 0);
scene.add(sun);

// Use Lambert material (reacts to light)
const cube = new Mesh(
  new BoxGeometry(1, 1, 1),
  new LambertMaterial({ color: 0xcccccc })  // Gray base
);
scene.add(cube);
```

Now your cube responds to lighting!

## Understanding the API

### Backend Selection

BangBang3d supports three backend modes:

```javascript
// Option 1: CPU Backend (software rasterization)
const renderer = new BangBangRenderer({ 
  canvas, 
  width: 800, 
  height: 600,
  backend: 'cpu'  // Explicit CPU
});

// Option 2: GPU Backend (WebGPU/WebGL2)
const renderer = new BangBangRenderer({ 
  canvas, 
  width: 800, 
  height: 600,
  backend: 'gpu'  // Try WebGPU → WebGL2 → fail
});

// Option 3: Auto (recommended for production)
const renderer = new BangBangRenderer({ 
  canvas, 
  width: 800, 
  height: 600,
  backend: 'auto'  // Try GPU first, fallback to CPU
});

// GPU backend initialization is async
await renderer.initialize();

// Check which backend is active
console.log('Backend:', renderer.backendType);  // 'cpu', 'webgpu', or 'webgl2'

// Query capabilities
const caps = renderer.capabilities;
console.log('PBR support:', caps.supportsPBR);
console.log('Compute shaders:', caps.supportsComputeShaders);
console.log('Instancing:', caps.supportsInstancing);
```

**Backend Capabilities:**

| Feature | CPU | WebGPU | WebGL2 |
|---------|-----|--------|--------|
| Basic rendering | ✅ | ✅ | ✅ |
| PBR materials | ❌ | ✅ | ✅ |
| Shadows | ❌ | ✅ | ✅ |
| Post-processing | ❌ | ✅ | ✅ |
| Instancing | ❌ | ✅ | ✅ |
| Compute shaders | ❌ | ✅ | ❌ |
| GPU skinning | ❌ | ✅ | ❌ |
| GPU particles | ❌ | ✅ | ❌ |

### Core Classes

| Class | Purpose | Example |
|-------|---------|---------|
| `Scene` | Container for all objects | `const scene = new Scene()` |
| `Mesh` | 3D object (geometry + material) | `new Mesh(geometry, material)` |
| `PerspectiveCamera` | Camera with perspective | `new PerspectiveCamera(fov, aspect, near, far)` |
| `BangBangRenderer` | Main renderer | `new BangBangRenderer({ canvas, width, height })` |

### Geometries

| Geometry | Creates | Example |
|----------|---------|---------|
| `BoxGeometry` | Cube/Box | `new BoxGeometry(width, height, depth)` |
| `PlaneGeometry` | Flat plane | `new PlaneGeometry(width, height)` |
| `SphereGeometry` | UV Sphere | `new SphereGeometry(radius, widthSegments, heightSegments)` |
| `ConeGeometry` | Cone | `new ConeGeometry(radius, height, radialSegments)` |
| `TetrahedronGeometry` | 4-sided (Platonic) | `new TetrahedronGeometry(radius)` |
| `OctahedronGeometry` | 8-sided (Platonic) | `new OctahedronGeometry(radius)` |
| `IcosahedronGeometry` | 20-sided (Platonic) | `new IcosahedronGeometry(radius)` |
| `DodecahedronGeometry` | 12-sided (Platonic) | `new DodecahedronGeometry(radius)` |
### Materials

| Material | Type | Lighting | Backend |
|----------|------|----------|----------|
| `BasicMaterial` | Flat color | No (unlit) | CPU + GPU |
| `LambertMaterial` | Diffuse | Yes (reacts to lights) | CPU + GPU |
| `PBRMaterial` | Physically-based | Yes (metallic/roughness) | GPU only |

### Lights

| Light | Effect | Example | Backend |
|-------|--------|---------|----------|
| `AmbientLight` | Uniform illumination | `new AmbientLight(0xffffff, 0.3)` | CPU + GPU |
| `DirectionalLight` | Parallel rays (sun) | `new DirectionalLight(0xffffff, 1.0)` | CPU + GPU |
| `PointLight` | Omnidirectional | `new PointLight(0xffffff, 1.0, 10)` | GPU only |
| `SpotLight` | Cone-shaped beam | `new SpotLight(0xffffff, 1.0, 15, Math.PI/4)` | GPU only |
| `HemisphereLight` | Sky/ground colors | `new HemisphereLight(0x87ceeb, 0x8b4513)` | GPU only |

### Light Helpers

| Helper | Visualizes | Example |
|--------|------------|----------|
| `PointLightHelper` | Point light position | `new PointLightHelper(light, 0.3)` |
| `SpotLightHelper` | Spotlight cone | `new SpotLightHelper(light)` |
| `DirectionalLightHelper` | Directional light | `new DirectionalLightHelper(light, 2)` |
| `HemisphereLightHelper` | Hemisphere light | `new HemisphereLightHelper(light, 1.5)` |

## Common Patterns

### Creating Different Geometries

```javascript
// Box (cube)
const box = new BoxGeometry(1, 1, 1);  // width, height, depth

// Plane
const plane = new PlaneGeometry(5, 5);  // width, height

// Sphere (smooth, parameterized)
const sphere = new SphereGeometry(1, 32, 24);  // radius, widthSegments, heightSegments
// Lower segments = faster but more faceted
const lowPolySphere = new SphereGeometry(1, 8, 6);  // 96 triangles
const highPolySphere = new SphereGeometry(1, 64, 48);  // 6144 triangles

// Platonic solids (regular polyhedra)
const tetrahedron = new TetrahedronGeometry(1);  // 4 faces
const octahedron = new OctahedronGeometry(1);  // 8 faces
const icosahedron = new IcosahedronGeometry(1);  // 20 faces (good sphere approximation)
const dodecahedron = new DodecahedronGeometry(1);  // 12 pentagonal faces
// Cone (points upward along Y axis)
const cone = new ConeGeometry(1, 2, 16);  // radius, height, segments
const lowPolyCone = new ConeGeometry(1, 2, 6);  // Fewer segments for performance
```

### Working with All Light Types

```javascript
import {
  Scene, AmbientLight, DirectionalLight, PointLight, 
  SpotLight, HemisphereLight, Vector3
} from './src/index.js';

const scene = new Scene();

// 1. Ambient Light - uniform illumination (works on CPU + GPU)
const ambient = new AmbientLight(0xffffff, 0.3);
scene.add(ambient);

// 2. Directional Light - parallel rays like sunlight (works on CPU + GPU)
const sun = new DirectionalLight(0xffffff, 0.8);
sun.position.set(10, 10, 5);
sun.target = new Vector3(0, 0, 0);
scene.add(sun);

// 3. Point Light - omnidirectional from a point (GPU only)
const pointLight = new PointLight(
  0xff0000,  // Red color
  1.5,       // Intensity
  20,        // Distance (0 = infinite)
  2          // Decay (2 = inverse square, physically accurate)
);
pointLight.position.set(-5, 3, 0);
scene.add(pointLight);

// 4. Spot Light - cone-shaped beam (GPU only)
const spotLight = new SpotLight(
  0xffffff,      // White color
  1.5,           // Intensity
  15,            // Distance
  Math.PI / 4,   // Angle (45 degrees)
  0.2,           // Penumbra (soft edge)
  2              // Decay
);
spotLight.position.set(0, 5, 0);
spotLight.target.position.set(0, 0, 0);
scene.add(spotLight);
scene.add(spotLight.target); // Important: target must be in scene

// 5. Hemisphere Light - sky and ground colors (GPU only)
const hemiLight = new HemisphereLight(
  0x87ceeb,  // Sky blue
  0x8b4513,  // Ground brown
  0.6        // Intensity
);
scene.add(hemiLight);

// Pro tip: Check GPU backend before adding GPU-only lights
if (renderer.backendType === 'webgpu' || renderer.backendType === 'webgl2') {
  // GPU backend - all light types supported
  scene.add(pointLight);
  scene.add(spotLight);
  scene.add(hemiLight);
} else {
  // CPU backend - only ambient and directional
  console.log('GPU lights disabled (CPU backend)');
}
```

### Adding Light Helpers for Debugging

```javascript
import {
  PointLight, PointLightHelper,
  SpotLight, SpotLightHelper,
  DirectionalLight, DirectionalLightHelper,
  HemisphereLight, HemisphereLightHelper
} from './src/index.js';

// Point light with helper
const pointLight = new PointLight(0xff0000, 1.5, 20);
pointLight.position.set(2, 3, 0);
scene.add(pointLight);

const pointHelper = new PointLightHelper(pointLight, 0.3);
scene.add(pointHelper);

// Spotlight with helper
const spotLight = new SpotLight(0xffffff, 1.5, 15, Math.PI / 4);
spotLight.position.set(0, 5, 0);
spotLight.target.position.set(0, 0, 0);
scene.add(spotLight);
scene.add(spotLight.target);

const spotHelper = new SpotLightHelper(spotLight);
scene.add(spotHelper);

// Directional light with helper
const dirLight = new DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 10, 5);
scene.add(dirLight);

const dirHelper = new DirectionalLightHelper(dirLight, 2);
scene.add(dirHelper);

// Hemisphere light with helper
const hemiLight = new HemisphereLight(0x87ceeb, 0x8b4513, 0.6);
scene.add(hemiLight);

const hemiHelper = new HemisphereLightHelper(hemiLight, 1.5);
scene.add(hemiHelper);

// Update helpers in animation loop (important for moving lights)
function animate() {
  pointHelper.update();
  spotHelper.update();
  dirHelper.update();
  hemiHelper.update();
  
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// Toggle helper visibility without affecting light
pointHelper.visible = false;  // Hide helper
pointLight.intensity = 1.5;   // Light still active```

### Positioning Objects

```javascript
cube.position.set(x, y, z);
cube.position.x = 5;

camera.position.z = 10;
camera.lookAt(new Vector3(0, 0, 0));
```

### Rotating Objects

```javascript
// Euler angles (in radians)
cube.rotation.x = Math.PI / 4;
cube.rotation.y += 0.01;  // Continuous rotation
```

### Scaling Objects

```javascript
cube.scale.set(2, 1, 1);  // Stretch X axis
```

### Changing Colors

```javascript
// Hex color
material.color.setHex(0xff0000);

// RGB (0-1 range)
material.color.set(1, 0, 0);
```

### Creating Glass and Transparent Materials

```javascript
// Basic transparency
const transparentMaterial = new BasicMaterial({
  color: 0xff0000,
  transparent: true,
  opacity: 0.5  // 50% transparent (0 = invisible, 1 = opaque)
});

// Glass material
const glassMaterial = new BasicMaterial({
  color: 0x88ccff,    // Light blue tint
  transparent: true,
  opacity: 0.3,       // 70% transparent
  depthWrite: false   // Prevents z-fighting with other transparent objects
});

const glassSphere = new Mesh(
  new SphereGeometry(1, 32, 24),
  glassMaterial
);
scene.add(glassSphere);
```

**Transparency Tips:**
- Always set `transparent: true` when using `opacity < 1.0`
- Use `depthWrite: false` for glass-like materials
- Lower opacity values (0.2-0.4) work best for glass
- The renderer automatically sorts transparent objects for correct blending
- See `examples/glass/index.html` for a complete demo

### Loading OBJ Models

Load external Wavefront .obj and .mtl files:

```javascript
import {
  Scene, OBJLoader, MTLLoader,
  AmbientLight, DirectionalLight, Vector3
} from './src/index.js';

const scene = new Scene();
const objLoader = new OBJLoader();
const mtlLoader = new MTLLoader();
const basePath = './models/';

// 1. Load the .mtl file (materials)
mtlLoader.setPath(basePath);
mtlLoader.load('mymodel.mtl', (materials) => {
  
  // 2. Load textures referenced by materials
  mtlLoader.loadTextures(materials, (materialsWithTextures) => {
    
    // 3. Load the .obj file with materials
    objLoader.setPath(basePath);
    objLoader.setMaterials(materialsWithTextures);
    
    objLoader.load('mymodel.obj', (result) => {
      // Add all meshes to scene
      for (const mesh of result.meshes) {
        scene.add(mesh);
      }
      console.log(`Loaded ${result.meshes.length} meshes`);
    });
  });
});

// Add lights for materials to be visible
scene.add(new AmbientLight(0xffffff, 0.5));
const dirLight = new DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 10, 5);
scene.add(dirLight);
```

**Auto-Centering and Scaling:**
```javascript
objLoader.load('mymodel.obj', (result) => {
  // Compute bounding box
  const bbox = objLoader.computeBoundingBox(result.meshes);
  
  // Calculate center
  const center = new Vector3(
    (bbox.min.x + bbox.max.x) / 2,
    (bbox.min.y + bbox.max.y) / 2,
    (bbox.min.z + bbox.max.z) / 2
  );
  
  // Calculate size and scale factor
  const size = new Vector3(
    bbox.max.x - bbox.min.x,
    bbox.max.y - bbox.min.y,
    bbox.max.z - bbox.min.z
  );
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = 5.0 / maxDim;  // Fit to 5 units
  
  // Apply centering and scaling
  for (const mesh of result.meshes) {
    mesh.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    mesh.scale.set(scale, scale, scale);
    scene.add(mesh);
  }
});
```

**Supported Features:**
- Wavefront .obj and .mtl formats
- Vertex positions, normals, and UV coordinates
- Triangle and quad faces (auto-triangulated)
- Multiple materials per model
- Diffuse textures (map_Kd)
- Ambient, diffuse, specular colors (Ka, Kd, Ks)
- Transparency (d/Tr) and shininess (Ns)

**Model Loading Tips:**
- Place .obj and .mtl files in a `models/` directory
- Ensure texture paths in .mtl are relative to the .mtl file
- Always load .mtl before .obj to apply materials correctly
- Use `computeBoundingBox()` to auto-center/scale models
- See `examples/models/index.html` for a complete viewer!

### Window Resize

```javascript
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
```

### Camera Controls with OrbitControls

Add interactive camera controls for rotating, panning, and zooming:

```javascript
import { OrbitControls } from './src/index.js';

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

function animate() {
  controls.update(); // Required if enableDamping is true
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
```

**Mouse Controls:**
- **Left drag**: Rotate camera around target
- **Right drag**: Pan camera
- **Mouse wheel**: Zoom in/out

**Constrain camera movement:**
```javascript
controls.minDistance = 5;    // Minimum zoom
controls.maxDistance = 50;   // Maximum zoom
controls.minPolarAngle = 0;  // Prevent going below ground
controls.maxPolarAngle = Math.PI / 2; // 90 degrees
```

### Adding a Reference Grid

Add a Blender-style reference grid for viewport orientation:

```javascript
import { GridOverlay } from './src/index.js';

const gridOverlay = new GridOverlay({
  yPosition: 0.0,                           // Ground level
  gridScale: 1.0,                            // 1 unit spacing
  gridColor: { r: 0.5, g: 0.5, b: 0.5 },    // Gray
  axisXColor: { r: 1.0, g: 0.2, b: 0.2 },   // Red X axis
  axisZColor: { r: 0.2, g: 1.0, b: 0.2 }    // Green Z axis
});
gridOverlay.addToScene(scene);

// Interactive controls
gridOverlay.setOpacity(0.8);
gridOverlay.setGridColor(0.6, 0.6, 0.6); // Lighter gray
```

### Object Picking and Selection

Click objects to select them using Raycaster:

```javascript
import { Raycaster, Vector2 } from './src/index.js';

const raycaster = new Raycaster();
const mouse = new Vector2();
let selectedObject = null;

canvas.addEventListener('click', (event) => {
  // Convert to normalized device coordinates
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  // Cast ray from camera through mouse position
  raycaster.setFromCamera(mouse, camera);
  
  // Test intersection with objects
  const intersects = raycaster.intersectObjects(scene.children, true);
  
  // Deselect previous
  if (selectedObject) {
    selectedObject.material.color.setHex(selectedObject.userData.originalColor);
  }
  
  // Select new object
  if (intersects.length > 0) {
    selectedObject = intersects[0].object;
    selectedObject.userData.originalColor = selectedObject.material.color.getHex();
    selectedObject.material.color.setHex(0xffff00); // Yellow highlight
    console.log('Selected:', selectedObject.name, 'at', intersects[0].point);
  } else {
    selectedObject = null;
  }
});
```

**Hover effects:**
```javascript
canvas.addEventListener('mousemove', (event) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);
  
  canvas.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
});
```

See `examples/grid-gizmo/index.html` for a complete example with dragging!

## Performance Tips

### Backend-Specific Tips

**CPU Backend (for debugging/education):**
- Target < 2000 triangles for 60 FPS
- Lower resolution: `pixelRatio: 0.5`
- Use BasicMaterial (faster than LambertMaterial)
- Minimize lights (1-2 max)
- Reduce sphere segments: `new SphereGeometry(1, 16, 12)`

**GPU Backend (for production):**
- 100,000+ triangles at 60 FPS
- Use hardware instancing for repeated objects
- Enable mesh batching for static geometry
- Use compute culling for large scenes
- PBR materials are GPU-optimized
- GPU skinning is 10-100x faster than CPU

### 🚀 General Tips

1. **Choose the Right Backend**
   ```javascript
   // For education/debugging:
   const renderer = new BangBangRenderer({ canvas, backend: 'cpu' });
   
   // For production/performance:
   const renderer = new BangBangRenderer({ canvas, backend: 'auto' });
   ```

2. **Lower Resolution** (CPU backend)
   ```javascript
   new BangBangRenderer({ canvas, width: 800, height: 600, pixelRatio: 0.5, backend: 'cpu' })
   ```
   
3. **Use Instancing** (GPU backend)
   ```javascript
   import { InstancedMesh } from './src/index.js';
   const instancedMesh = new InstancedMesh(geometry, material, 1000);
   ```

2. **Reduce Triangle Count**
   - Use simple geometry
   - For spheres, reduce segments: `new SphereGeometry(1, 16, 12)` instead of `(1, 64, 48)`
   - Use Platonic solids instead of high-poly spheres for small objects
   - CPU: Target < 2000 triangles for 60 FPS
   - GPU: 100,000+ triangles is fine

3. **Use BasicMaterial** (CPU backend)
   - Faster than LambertMaterial
   - No lighting calculations

4. **Minimize Lights** (CPU backend)
   - Each light adds per-pixel calculations
   - 1-2 lights is optimal for CPU
   - GPU backend handles many lights efficiently

### 📊 Monitoring Performance

```javascript
// Check active backend
console.log('Backend type:', renderer.backendType);

// Check capabilities
console.log('Capabilities:', renderer.capabilities);

// Render statistics
console.log('Render info:', renderer.info);

// Geometry info
console.log('Triangles:', geometry.index.count / 3);
```

## Debugging

### Check Console

The renderer logs backend initialization:
```
[BangBangRenderer] Initializing auto backend...
[BangBangRenderer] Auto backend selection: trying GPU first...
[BangBangRenderer] Auto selected GPU backend (webgpu)
```

Examples log useful information:
```
BangBang3d Basic Cube Example
Backend: webgpu
Scene triangles: 12
```

### Backend Verification

You can verify which backend is being used:

```javascript
console.log('Backend:', renderer.backendType);  // 'cpu', 'webgpu', or 'webgl2'

// For GPU backends, check DevTools:
// - Performance tab will show WebGPU/WebGL activity
// - Memory tab may show GPU buffers

// For CPU backend:
// - No GPU activity in Performance tab
// - All work happens in JavaScript
```

### Common Issues

**Black Screen?**
- Check camera position (is it inside the object?)
- Check canvas size (is it 0x0?)
- Check console for errors

**Nothing Visible?**
- Is camera far enough away? Try `camera.position.z = 5`
- Is object at origin? Try `console.log(cube.position)`
- Is object scale too small? Try `cube.scale.set(10, 10, 10)`

**Poor Performance?**
- Check backend: `console.log(renderer.backendType)`
- For CPU backend: Reduce resolution with `pixelRatio: 0.5`
- For CPU backend: Use fewer triangles
- For CPU backend: Use BasicMaterial instead of LambertMaterial
- For GPU backend: Check browser console for errors
- Consider switching: `backend: 'auto'` for best performance

## What's Next?

### Explore Examples
- Study `examples/basic-cube/index.html`
- Study `examples/lights/index.html`
- Try `examples/textured/index.html` - All geometries with textures!
- Try `examples/grid-gizmo/index.html` - Object picking, selection, and constrained dragging!
- Check `examples/glass/index.html` - Transparency and glass materials!
- Explore `examples/models/index.html` - Load and view OBJ/MTL models!
- Experiment with modifications

### Read Documentation
- [README.md](README.md) - Project overview and architecture
- [DEVELOPER-REFERENCE.md](DEVELOPER-REFERENCE.md) - Complete API reference
- [IMPLEMENTATION.md](IMPLEMENTATION.md) - Technical details
- [PROJECT-COMPLETION.md](PROJECT-COMPLETION.md) - Current dual-backend feature overview
- [BangBang3d Specification.md](BangBang3d%20Specification.md) - Original CPU spec and design intent
- [archive/docs/BangBang3D-upgrade-requirements.md](archive/docs/BangBang3D-upgrade-requirements.md) - Historical GPU upgrade specification
- [archive/docs/PHASE-1-SUMMARY.md](archive/docs/PHASE-1-SUMMARY.md) - Historical backend architecture notes
- [archive/docs/PHASE-5-SUMMARY.md](archive/docs/PHASE-5-SUMMARY.md) - Historical final phase summary
- [PROJECT-COMPLETION.md](PROJECT-COMPLETION.md) - Complete feature overview

### Experiment
- Add multiple objects (cubes, spheres, platonic solids)
- Try different geometries (SphereGeometry, TetrahedronGeometry, etc.)
- Try different colors and materials
- Add more lights
- Create custom animations

### Learn the Internals
- Explore `src/math/` to understand vectors and matrices
- Study `src/core/` for scene graph and object hierarchy
- Read `src/renderer/backends/CPUBackend.js` to see software rasterization
- Read `src/renderer/backends/GPUBackend.js` to see shader compilation
- Check `src/renderer/shaders/` for WGSL and GLSL shader code

## Current Capabilities

### Phase 1-2: Foundation ✅
- Dual backend architecture (CPU + GPU)
- Backend selection and capability detection
- Material shader system
- Geometry GPU buffer management

### Phase 3: Render Graph & Post-Processing ✅
- Render graph for complex pipelines
- Post-processing composer
- Tone mapping (ACES, Reinhard, Linear)
- Gamma correction
- FXAA anti-aliasing

### Phase 4: Lighting & PBR ✅
- PBR materials with Cook-Torrance BRDF
- Point lights, spot lights, hemisphere lights
- Shadow map infrastructure

### Phase 5: Compute, Animation, Instancing ✅
- Hardware instancing
- Compute shader infrastructure (WebGPU)
- GPU frustum culling
- Skeletal animation with mixer
- GPU skinning
- GPU particle system
- glTF/GLB asset loader
- Mesh batching
- Validation harness

### Legacy Features (Milestone A-E) ✅
- Scene graph and transforms
- Perspective/Orthographic cameras
- Triangle rasterization with Z-buffer (CPU)
- Backface culling
- Flat shading (BasicMaterial)
- Diffuse lighting (LambertMaterial)
- Textures with UV mapping
- Multiple geometries (Box, Plane, Sphere, Platonic solids)
- Transparency & glass materials
- OBJ/MTL model loading
- Debug visualizations
- Performance stats
- Orbit controls

## Getting Help

1. Check the examples first
2. Read the error messages in console
3. Review [IMPLEMENTATION.md](IMPLEMENTATION.md)
4. Check [artifacts.md](artifacts.md) for asset requirements

## Philosophy

BangBang3d is built for:
- **Dual Backends**: CPU for correctness and education, GPU for performance
- **Flexibility**: Choose the right backend for your use case
- **Transparency**: Backend selection is explicit, capabilities are queryable
- **Determinism**: CPU backend produces reproducible results
- **Hackability**: CPU backend makes every pixel debuggable
- **Performance**: GPU backend delivers production-grade rendering

> "Nothing is magic. The pipeline is explicit. Both backends are first-class."

---

**Ready to build?** Start with the minimal example above, then explore the demos! 🎨🔺

