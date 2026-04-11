# BangBang3d Developer Reference

Complete class and method reference for the BangBang3d dual-backend 3D rendering framework.

**Backend Architecture:** BangBang3d supports both CPU (software rasterization) and GPU (WebGPU/WebGL2) backends. The Core API remains consistent across backends.

---

## Table of Contents

1. [Renderer & Backend Classes](#renderer--backend-classes)
2. [Math Classes](#math-classes)
3. [Core Classes](#core-classes)
4. [Geometry Classes](#geometry-classes)
5. [Material Classes](#material-classes)
6. [Light Classes](#light-classes)
7. [Animation Classes](#animation-classes)
8. [Resource Classes](#resource-classes)
9. [Extras & Utilities Classes](#extras--utilities-classes)
10. [Common Patterns](#common-patterns)
11. [Shadow System](#shadow-system-phase-5)
12. [Reflections & IBL](#reflections--image-based-lighting-phase-5)
13. [Screen-Space Reflections (SSR)](#screen-space-reflections-ssr)
14. [Point Clouds & Gaussian Splats](#point-clouds--gaussian-splats)
15. [Path Tracing (WebGPU)](#path-tracing-webgpu)

---

## Renderer & Backend Classes

### BangBangRenderer

Main renderer with pluggable backend system. Supports CPU (software rasterization) and GPU (WebGPU/WebGL2) backends.

**Constructor:**
```javascript
new BangBangRenderer(parameters = {})
```

**Parameters (object):**
- `canvas` - HTMLCanvasElement (required)
- `width` - Canvas width in pixels (default: 800)
- `height` - Canvas height in pixels (default: 600)
- `pixelRatio` - Rendering resolution multiplier (default: 1)
- `backend` - Backend selection: `'cpu'` | `'gpu'` | `'webgpu'` | `'webgl2'` | `'auto'` (default: `'cpu'`)
  - `'cpu'`: Software rasterization (deterministic, debuggable)
  - `'gpu'`: WebGPU/WebGL2 (tries WebGPU first, falls back to WebGL2)
  - `'webgpu'`: Force WebGPU only (no fallback to WebGL2)
  - `'webgl2'`: Force WebGL2 only (skip WebGPU)
  - `'auto'`: Tries GPU first, falls back to CPU if unavailable

**Properties:**
- `canvas` - Canvas element
- `backendType` - Active backend type: `'cpu'`, `'webgpu'`, or `'webgl2'` (getter)
- `backend` - Direct access to the active backend instance (getter)
- `capabilities` - Backend capabilities object (getter, read-only)
- `info` - Render statistics (getter): `{ render: { frame, triangles } }`
- `shadows` - Shadow configuration object:
  - `enabled` - Enable shadow mapping (default: `false`)
  - `type` - Shadow type: `'hard'` | `'pcf'` (default: `'hard'`)
  - `maxShadowLights` - Maximum shadow-casting lights (default: `2`)

**Methods:**
- `async initialize()` - Initialize the renderer backend (required for GPU backends)
- `isReady()` - Check if renderer is ready to render
- `async render(scene, camera)` - Render scene from camera
  - Automatically separates meshes into opaque and transparent groups
  - Renders opaque objects first with depth testing
  - Sorts transparent objects back-to-front by distance to camera
  - Renders transparent objects with alpha blending
- `setSize(width, height, updateStyle)` - Resize renderer
- `setPixelRatio(ratio)` - Change pixel ratio
- `setClearColor(color, alpha)` - Set clear color
- `clear()` - Clear buffers
- `getContext()` - Get rendering context (2D for CPU, WebGPU/WebGL2 for GPU)
- `getDebugInfo()` - Get debug information
- `dispose()` - Free resources

**Capabilities Object:**

Accessed via `renderer.capabilities`. Properties vary by backend:

**Common to all backends:**
- `maxTextureSize` - Maximum texture dimension

**CPU Backend:**
- `backend: 'cpu'`
- Limited feature set (basic rendering only)

**GPU Backends (WebGPU/WebGL2):**
- `backend: 'webgpu'` or `'webgl2'`
- `supportsShaders: true`
- `supportsGeometryCaching: true`
- `supportsRenderGraph: true`
- `supportsPostProcessing: true`
- `supportsPBR: true` (PBR materials)
- `supportsPointLights: true`
- `supportsSpotLights: true`
- `supportsHemisphereLights: true`
- `supportsShadows: true` (shadow maps)
- `supportsInstancing: true` (hardware instancing)
- `supportsBatching: true` (mesh batching)
- `supportsSkeletalAnimation: true`
- `supportsReflections: true` (reflection system)
- `supportsIBL: true` (image-based lighting)
- `supportsCubemaps: true` (cubemap textures)

**WebGPU-only capabilities:**
- `supportsComputeShaders: true`
- `supportsFrustumCulling: true` (GPU compute)
- `supportsGPUSkinning: true` (GPU compute)
- `supportsParticles: true` (GPU compute)

**Example - Backend Selection:**
```javascript
// Auto-select backend (recommended for production)
const renderer = new BangBangRenderer({
  canvas: document.getElementById('canvas'),
  width: window.innerWidth,
  height: window.innerHeight,
  backend: 'auto'  // Try GPU first, fallback to CPU
});

// Initialize the renderer backend (required for GPU backends)
await renderer.initialize();

console.log('Backend:', renderer.backendType);  // 'cpu', 'webgpu', or 'webgl2'
console.log('PBR support:', renderer.capabilities.supportsPBR);
console.log('Compute shaders:', renderer.capabilities.supportsComputeShaders);

// Use capabilities to enable features conditionally
if (renderer.capabilities.supportsInstancing) {
  // Use InstancedMesh for massive object counts
  const instancedMesh = new InstancedMesh(geometry, material, 1000);
  scene.add(instancedMesh);
}

if (renderer.capabilities.supportsPBR) {
  // Use PBR materials
  const pbrMaterial = new PBRMaterial({
    color: new Color(1, 1, 1),
    metallic: 0.9,
    roughness: 0.2
  });
}
```

**Example - CPU Backend (debugging/education):**
```javascript
const renderer = new BangBangRenderer({
  canvas: document.getElementById('canvas'),
  width: 800,
  height: 600,
  pixelRatio: 0.5,  // Lower resolution for CPU
  backend: 'cpu'
});

// CPU backend is synchronous, no need to wait
console.log('Backend:', renderer.backendType);  // 'cpu'

function animate() {
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
```

**Example - GPU Backend (production):**
```javascript
const renderer = new BangBangRenderer({
  canvas: document.getElementById('canvas'),
  width: window.innerWidth,
  height: window.innerHeight,
  backend: 'gpu'  // Explicit GPU
});

// Initialize the renderer backend
await renderer.initialize();

if (renderer.backendType === 'webgpu') {
  console.log('Using WebGPU - full feature set available');
  // Use compute shaders, GPU skinning, etc.
} else if (renderer.backendType === 'webgl2') {
  console.log('Using WebGL2 - no compute shaders');
  // Fallback to CPU compute features
}

renderer.setClearColor(0x000000);

function animate() {
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
```

**Example - Resize Handling:**
```javascript
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
```

---

### Backend Classes (Internal)

These classes are used internally by BangBangRenderer. You typically don't instantiate them directly.

**CPUBackend:**
- Software rasterization implementation
- Complete graphics pipeline in JavaScript
- Deterministic, reproducible rendering
- Excellent for debugging and education
- Lower performance (100-500 triangles @ 60 FPS)

**GPUBackend:**
- WebGPU and WebGL2 implementation
- Shader-driven rendering pipeline
- Hardware-accelerated (100,000+ triangles @ 60 FPS)
- Supports PBR, shadows, post-processing
- Compute shaders (WebGPU only)
- Automatic shader compilation for materials

---

## Math Classes

### Vector2

2D vector for UV coordinates and 2D operations.

**Constructor:**
```javascript
new Vector2(x = 0, y = 0)
```

**Properties:**
- `x` - X component
- `y` - Y component

**Methods:**
- `set(x, y)` - Set vector components
- `setScalar(scalar)` - Set both components to same value
- `copy(v)` - Copy from another vector
- `clone()` - Create a new copy
- `add(v)` - Add vector
- `sub(v)` - Subtract vector
- `multiply(v)` - Multiply component-wise
- `multiplyScalar(scalar)` - Multiply by scalar
- `divide(v)` - Divide component-wise
- `divideScalar(scalar)` - Divide by scalar
- `dot(v)` - Dot product
- `length()` - Get magnitude
- `lengthSq()` - Get squared magnitude
- `normalize()` - Normalize to unit length
- `distanceTo(v)` - Distance to another vector
- `lerp(v, alpha)` - Linear interpolation
- `equals(v)` - Check equality
- `fromArray(array, offset)` - Load from array
- `toArray(array, offset)` - Store to array

**Example:**
```javascript
const uv = new Vector2(0.5, 0.5);
uv.add(new Vector2(0.1, 0.0));
const len = uv.length();
```

---

### Vector3

3D vector for positions, directions, and 3D operations.

**Constructor:**
```javascript
new Vector3(x = 0, y = 0, z = 0)
```

**Properties:**
- `x` - X component
- `y` - Y component
- `z` - Z component

**Methods:**
- `set(x, y, z)` - Set vector components
- `setScalar(scalar)` - Set all components to same value
- `copy(v)` - Copy from another vector
- `clone()` - Create a new copy
- `add(v)` - Add vector
- `addScalar(s)` - Add scalar to all components
- `addVectors(a, b)` - Set to a + b
- `sub(v)` - Subtract vector
- `subVectors(a, b)` - Set to a - b
- `multiply(v)` - Multiply component-wise
- `multiplyScalar(scalar)` - Multiply by scalar
- `divide(v)` - Divide component-wise
- `divideScalar(scalar)` - Divide by scalar
- `dot(v)` - Dot product
- `cross(v)` - Cross product (modifies this)
- `crossVectors(a, b)` - Set to a × b
- `length()` - Get magnitude
- `lengthSq()` - Get squared magnitude
- `normalize()` - Normalize to unit length
- `distanceTo(v)` - Distance to another vector
- `distanceToSquared(v)` - Squared distance
- `negate()` - Negate all components
- `lerp(v, alpha)` - Linear interpolation
- `applyMatrix4(m)` - Apply 4×4 matrix transform
- `applyQuaternion(q)` - Apply quaternion rotation
- `transformDirection(m)` - Transform as direction (no translation)
- `equals(v)` - Check equality
- `fromArray(array, offset)` - Load from array
- `toArray(array, offset)` - Store to array

**Example:**
```javascript
const position = new Vector3(0, 1, 0);
const direction = new Vector3(1, 0, 0).normalize();
position.add(direction.multiplyScalar(2));

const cross = new Vector3().crossVectors(
  new Vector3(1, 0, 0),
  new Vector3(0, 1, 0)
); // Result: (0, 0, 1)
```

---

### Vector4

4D vector for homogeneous coordinates and RGBA colors.

**Constructor:**
```javascript
new Vector4(x = 0, y = 0, z = 0, w = 1)
```

**Properties:**
- `x, y, z, w` - Components

**Methods:**
Similar to Vector3, plus:
- `applyMatrix4(m)` - Apply 4×4 matrix transform

---

### Matrix4

4×4 matrix for transformations (translation, rotation, scale, projection).

**Constructor:**
```javascript
new Matrix4()  // Identity matrix
```

**Properties:**
- `elements` - Float32Array(16) in column-major order

**Methods:**
- `set(n11, n12, ..., n44)` - Set all 16 elements
- `identity()` - Set to identity matrix
- `copy(m)` - Copy from another matrix
- `clone()` - Create a new copy
- `multiply(m)` - Multiply by another matrix (this = this × m)
- `premultiply(m)` - Multiply by another matrix (this = m × this)
- `multiplyMatrices(a, b)` - Set to a × b
- `makeTranslation(x, y, z)` - Create translation matrix
- `makeRotationX(theta)` - Create rotation around X axis
- `makeRotationY(theta)` - Create rotation around Y axis
- `makeRotationZ(theta)` - Create rotation around Z axis
- `makeRotationAxis(axis, angle)` - Create rotation around arbitrary axis
- `makeScale(x, y, z)` - Create scale matrix
- `compose(position, quaternion, scale)` - Create TRS matrix
- `decompose(position, quaternion, scale)` - Extract TRS components
- `makePerspective(left, right, top, bottom, near, far)` - Create perspective projection (OpenGL clip space: Z -1 to 1)
- `makePerspectiveWebGPU(left, right, top, bottom, near, far)` - Create perspective projection for WebGPU (clip space: Z 0 to 1)
- `makeOrthographic(left, right, top, bottom, near, far)` - Create orthographic projection (OpenGL clip space: Z -1 to 1)
- `makeOrthographicWebGPU(left, right, top, bottom, near, far)` - Create orthographic projection for WebGPU (clip space: Z 0 to 1)
- `lookAt(eye, target, up)` - Create view matrix
- `invert()` - Invert matrix
- `transpose()` - Transpose matrix
- `determinant()` - Calculate determinant

**Example:**
```javascript
const transform = new Matrix4();
transform.makeTranslation(10, 0, 0);

const rotation = new Matrix4().makeRotationY(Math.PI / 4);
transform.multiply(rotation);

const pos = new Vector3(1, 2, 3);
pos.applyMatrix4(transform);
```

---

### Quaternion

Quaternion for rotation representation (avoids gimbal lock).

**Constructor:**
```javascript
new Quaternion(x = 0, y = 0, z = 0, w = 1)
```

**Properties:**
- `x, y, z, w` - Quaternion components

**Methods:**
- `set(x, y, z, w)` - Set components
- `copy(q)` - Copy from another quaternion
- `clone()` - Create a new copy
- `setFromEuler(euler)` - Create from Euler angles
- `setFromAxisAngle(axis, angle)` - Create from axis-angle
- `setFromRotationMatrix(m)` - Extract from matrix
- `multiply(q)` - Multiply quaternions (this = this × q)
- `slerp(q, t)` - Spherical linear interpolation
- `normalize()` - Normalize to unit quaternion
- `conjugate()` - Conjugate quaternion (negates x, y, z; keeps w)
- `invert()` - Invert quaternion (mathematically correct for unit and non-unit quaternions)

**Example:**
```javascript
const quat = new Quaternion();
quat.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);

const vector = new Vector3(1, 0, 0);
vector.applyQuaternion(quat);  // Rotates 90° around Y
```

**Converting World Vectors to Object-Local Space:**
```javascript
// Get object's rotation quaternion
const objectQuat = mesh.quaternion.clone();

// Invert to get reverse rotation
objectQuat.invert();

// Apply to world-space vector (e.g., gravity)
const worldGravity = new Vector3(0, -9.8, 0);
const localGravity = worldGravity.clone();
localGravity.applyQuaternion(objectQuat);
// localGravity now represents gravity direction in object's local coordinate system
```

**Conjugate vs Invert:**
- For **unit quaternions** (normalized rotations): `conjugate()` and `invert()` produce the same result
- `conjugate()` is faster (no division) but only correct for unit quaternions
- `invert()` is mathematically correct for all quaternions (handles non-normalized cases)
- Use `invert()` for general-purpose inverse rotations

---

### Euler

Euler angles for rotation (roll, pitch, yaw).

**Constructor:**
```javascript
new Euler(x = 0, y = 0, z = 0, order = 'XYZ')
```

**Properties:**
- `x, y, z` - Rotation angles (radians)
- `order` - Rotation order ('XYZ', 'YZX', 'ZXY', 'XZY', 'YXZ', 'ZYX')

**Methods:**
- `set(x, y, z, order)` - Set all parameters
- `copy(euler)` - Copy from another Euler
- `setFromQuaternion(q, order)` - Convert from quaternion
- `setFromRotationMatrix(m, order)` - Extract from matrix

**Example:**
```javascript
const rotation = new Euler(0, Math.PI / 4, 0, 'XYZ');
object.rotation.copy(rotation);
```

---

### Color

RGB color representation.

**Constructor:**
```javascript
new Color(r = 1, g = 1, b = 1)
```

**Properties:**
- `r, g, b` - Color components (0-1 range)

**Methods:**
- `set(r, g, b)` - Set RGB values
- `setHex(hex)` - Set from hex (0xRRGGBB)
- `setScalar(scalar)` - Set all components to same value
- `copy(color)` - Copy from another color
- `clone()` - Create a new copy
- `add(color)` - Add colors
- `multiply(color)` - Multiply colors
- `multiplyScalar(s)` - Multiply by scalar
- `lerp(color, alpha)` - Linear interpolation
- `equals(color)` - Check equality
- `getHex()` - Get as hex number
- `getHexString()` - Get as hex string

**Example:**
```javascript
const red = new Color(1, 0, 0);
const blue = new Color().setHex(0x0000ff);
const purple = red.clone().lerp(blue, 0.5);
```

---

### MathUtils

Static utility functions.

**Methods:**
- `MathUtils.degToRad(degrees)` - Convert degrees to radians
- `MathUtils.radToDeg(radians)` - Convert radians to degrees
- `MathUtils.clamp(value, min, max)` - Clamp value to range
- `MathUtils.lerp(a, b, t)` - Linear interpolation (0 ≤ t ≤ 1)
- `MathUtils.smoothstep(x, min, max)` - Smooth Hermite interpolation (ease-in-out)
- `MathUtils.randFloat(low, high)` - Random float in range [low, high)
- `MathUtils.randInt(low, high)` - Random integer in range [low, high] (inclusive)
- `MathUtils.isPowerOfTwo(value)` - Check if value is power of 2
- `MathUtils.generateUUID()` - Generate unique identifier

**Example:**
```javascript
// Angle conversion
const angle = MathUtils.degToRad(45);

// Clamping
const health = MathUtils.clamp(damage, 0, 100);

// Linear interpolation
const midpoint = MathUtils.lerp(start, end, 0.5);

// Smooth interpolation (ease-in-out)
const eased = MathUtils.smoothstep(t, 0, 1);

// Random values
const randomX = MathUtils.randFloat(-10, 10);  // e.g., -3.7482
const diceRoll = MathUtils.randInt(1, 6);      // 1, 2, 3, 4, 5, or 6

// Power of 2 check (useful for texture sizes)
const isValid = MathUtils.isPowerOfTwo(512);   // true
```

---

## Core Classes

### Object3D

Base class for all 3D scene objects. Provides transformation hierarchy.

**Constructor:**
```javascript
new Object3D()
```

**Properties:**
- `uuid` - Unique identifier
- `name` - Optional name string
- `type` - Object type identifier
- `position` - Vector3 local position
- `rotation` - Euler local rotation
- `quaternion` - Quaternion local rotation (synced with rotation)
- `scale` - Vector3 local scale
- `matrix` - Matrix4 local transform
- `matrixWorld` - Matrix4 world transform
- `parent` - Parent Object3D
- `children` - Array of child Object3Ds
- `visible` - Visibility flag
- `frustumCulled` - Whether to cull when outside frustum
- `matrixAutoUpdate` - Auto-update matrix from position/rotation/scale

**Methods:**
- `add(object)` - Add child object
- `remove(object)` - Remove child object
- `clear()` - Remove all children
- `getObjectById(id)` - Find object by UUID
- `getObjectByName(name)` - Find object by name
- `traverse(callback)` - Call function on this and all descendants
- `traverseVisible(callback)` - Traverse only visible objects
- `updateMatrix()` - Update local matrix from position/rotation/scale
- `updateMatrixWorld(force)` - Update world matrix (propagates to children)
- `lookAt(target)` - Orient to look at target position

**Example:**
```javascript
const group = new Object3D();
group.position.set(0, 5, 0);
group.add(mesh1);
group.add(mesh2);
scene.add(group);

group.traverse((obj) => {
  console.log(obj.name);
});
```

---

### Scene

Container for all renderable objects. Extends Object3D.

**Constructor:**
```javascript
new Scene()
```

**Properties:**
- All Object3D properties
- `background` - Background color (Color)
- `backgroundTexture` - Background texture (Texture, optional)
- `environment` - Environment map for IBL reflections (CubeTexture, optional)
- `environmentIntensity` - Intensity multiplier for environment map (default: `1.0`)
- `cameras` - Registered camera array (Camera[])
- `activeCamera` - Currently active camera (Camera|null)
- `fog` - Scene fog configuration (object, optional)
- `autoUpdate` - Whether to auto-update world matrices before render (default: `true`)

**Methods:**
- All Object3D methods
- `addCamera(camera)` - Register a camera and add to scene graph
- `removeCamera(camera)` - Unregister a camera
- `setActiveCamera(camera)` - Set the active rendering camera

**Example:**
```javascript
const scene = new Scene();
scene.background = new Color(0.2, 0.2, 0.3);
scene.add(mesh);
scene.add(light);

// Camera management
const cam1 = new PerspectiveCamera(60, aspect, 0.5, 100);
scene.addCamera(cam1);
scene.setActiveCamera(cam1);

// Environment map for PBR reflections
const cubeLoader = new CubeTextureLoader();
const envMap = await cubeLoader.load([px, nx, py, ny, pz, nz]);
scene.environment = envMap;
scene.environmentIntensity = 1.0;
```

---

### Mesh

Renderable 3D object combining geometry and material. Extends Object3D.

**Constructor:**
```javascript
new Mesh(geometry, material)
```

**Properties:**
- All Object3D properties
- `geometry` - BufferGeometry
- `material` - Material

**Methods:**
- All Object3D methods

**Example:**
```javascript
const geometry = new BoxGeometry(1, 1, 1);
const material = new BasicMaterial({ color: 0xff0000 });
const mesh = new Mesh(geometry, material);
mesh.position.set(0, 1, 0);
mesh.rotation.y = Math.PI / 4;
scene.add(mesh);
```

---

### Camera

Base camera class. Extends Object3D.

**Constructor:**
```javascript
new Camera()
```

**Properties:**
- All Object3D properties
- `projectionMatrix` - Matrix4 projection matrix
- `projectionMatrixInverse` - Matrix4 inverse projection
- `matrixWorldInverse` - Matrix4 inverse world matrix (view matrix)
- `postFXEnabled` - Whether per-camera post-processing is active (boolean)
- `postFXPipeline` - PostFXPipeline instance (null until enablePostFX/setPostFXProfile)
- `postFXProfile` - Active profile name (e.g. `'mac_dither'`)
- `postFXParams` - Profile parameter overrides (object)
- `viewport` - Optional viewport `{ x, y, width, height }` in canvas pixels (null = full canvas)

**Methods:**
- All Object3D methods
- `updateProjectionMatrix(coordinateSystem = 'opengl')` - Update projection matrix
  - `coordinateSystem`: `'opengl'` (Z clip space -1 to 1) or `'webgpu'` (Z clip space 0 to 1)
- `enablePostFX(on)` - Enable/disable per-camera post-processing (creates pipeline lazily)
- `setPostFXProfile(profile, options)` - Apply a named profile (async, creates DitherPass, etc.)
- `setPostFXProfileSync(PostFXPipelineCtor, profile, options)` - Synchronous variant

---

### PerspectiveCamera

Camera with perspective projection. Extends Camera.

**Constructor:**
```javascript
new PerspectiveCamera(fov = 50, aspect = 1, near = 0.5, far = 2000)
```

**Parameters:**
- `fov` - Field of view in degrees (vertical)
- `aspect` - Aspect ratio (width / height)
- `near` - Near clipping plane distance
- `far` - Far clipping plane distance

**Properties:**
- All Camera properties
- `fov` - Field of view (degrees)
- `aspect` - Aspect ratio
- `near` - Near plane
- `far` - Far plane

**Methods:**
- All Camera methods
- `updateProjectionMatrix(coordinateSystem = 'opengl')` - Rebuilds projection from parameters
  - Uses `makePerspective()` for `'opengl'` (default)
  - Uses `makePerspectiveWebGPU()` for `'webgpu'` (GPU backend)
- `setFocalLength(focalLength)` - Set FOV from focal length (mm)
- `getFocalLength()` - Get focal length from FOV

**Example:**
```javascript
const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);
camera.lookAt(new Vector3(0, 0, 0));

// On window resize:
camera.aspect = newWidth / newHeight;
camera.updateProjectionMatrix();
```

---

### OrthographicCamera

Camera with orthographic (parallel) projection. Extends Camera.

**Constructor:**
```javascript
new OrthographicCamera(left, right, top, bottom, near = 0.1, far = 2000)
```

**Parameters:**
- `left, right, top, bottom` - View frustum bounds
- `near, far` - Clipping plane distances

**Properties:**
- All Camera properties
- `left, right, top, bottom, near, far` - Frustum parameters

**Methods:**
- All Camera methods
- `updateProjectionMatrix(coordinateSystem = 'opengl')` - Rebuilds projection from parameters
  - Uses `makeOrthographic()` for `'opengl'` (default)
  - Uses `makeOrthographicWebGPU()` for `'webgpu'` (GPU backend)

**Example:**
```javascript
const camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
camera.position.z = 50;
```

---

## Geometry Classes

### BufferGeometry

Base geometry class. Stores vertex data in typed arrays.

**Constructor:**
```javascript
new BufferGeometry()
```

**Properties:**
- `attributes` - Object containing BufferAttributes (position, normal, uv, etc.)
- `index` - Index array for indexed rendering
- `boundingBox` - Axis-aligned bounding box (computed on demand)
- `boundingSphere` - Bounding sphere (computed on demand)

**Methods:**
- `setAttribute(name, attribute)` - Add vertex attribute
- `getAttribute(name)` - Get vertex attribute
- `deleteAttribute(name)` - Remove attribute
- `setIndex(index)` - Set index array (array or BufferAttribute)
- `computeBoundingBox()` - Calculate bounding box
- `computeBoundingSphere()` - Calculate bounding sphere
- `dispose()` - Free resources

**Example:**
```javascript
const geometry = new BufferGeometry();

const positions = new Float32Array([
  -1, -1, 0,
   1, -1, 0,
   0,  1, 0
]);
geometry.setAttribute('position', new BufferAttribute(positions, 3));

const indices = [0, 1, 2];
geometry.setIndex(indices);
```

---

### BufferAttribute

Stores typed array data for geometry attributes.

**Constructor:**
```javascript
new BufferAttribute(array, itemSize, normalized = false)
```

**Parameters:**
- `array` - TypedArray (Float32Array, Uint16Array, etc.)
- `itemSize` - Components per vertex (3 for position, 2 for UV)
- `normalized` - Whether to normalize integer values

**Properties:**
- `array` - Underlying typed array
- `itemSize` - Components per item
- `count` - Number of items (array.length / itemSize)
- `normalized` - Normalization flag

**Methods:**
- `setXYZ(index, x, y, z)` - Set 3-component value
- `setXY(index, x, y)` - Set 2-component value
- `getX(index)` - Get X component
- `getY(index)` - Get Y component
- `getZ(index)` - Get Z component

**Example:**
```javascript
const positions = new Float32Array(9);  // 3 vertices × 3 components
const positionAttribute = new BufferAttribute(positions, 3);
positionAttribute.setXYZ(0, 0, 0, 0);
positionAttribute.setXYZ(1, 1, 0, 0);
positionAttribute.setXYZ(2, 0, 1, 0);
```

---

### BoxGeometry

Creates a box (cube) geometry. Extends BufferGeometry.

**Constructor:**
```javascript
new BoxGeometry(width = 1, height = 1, depth = 1, widthSegments = 1, heightSegments = 1, depthSegments = 1)
```

**Parameters:**
- `width` - X dimension
- `height` - Y dimension
- `depth` - Z dimension
- `widthSegments` - Number of segments along width
- `heightSegments` - Number of segments along height
- `depthSegments` - Number of segments along depth

**Example:**
```javascript
const box = new BoxGeometry(2, 3, 1);  // 2×3×1 box
const cube = new BoxGeometry(1, 1, 1);  // Unit cube
const tessellated = new BoxGeometry(1, 1, 1, 4, 4, 4);  // More subdivisions
```

---

### PlaneGeometry

Creates a flat plane geometry. Extends BufferGeometry.

**Constructor:**
```javascript
new PlaneGeometry(width = 1, height = 1, widthSegments = 1, heightSegments = 1)
```

**Parameters:**
- `width` - Width along X
- `height` - Height along Y
- `widthSegments` - Subdivisions along width
- `heightSegments` - Subdivisions along height

**Example:**
```javascript
const ground = new PlaneGeometry(100, 100);
const wall = new PlaneGeometry(10, 5, 10, 5);  // With subdivisions
```

---

### SphereGeometry

Creates a UV sphere geometry. Extends BufferGeometry.

**Constructor:**
```javascript
new SphereGeometry(radius = 1, widthSegments = 16, heightSegments = 12)
```

**Parameters:**
- `radius` - Sphere radius
- `widthSegments` - Horizontal segments (around equator)
- `heightSegments` - Vertical segments (pole to pole)

**Example:**
```javascript
const sphere = new SphereGeometry(1, 32, 24);  // Smooth sphere
const lowPoly = new SphereGeometry(1, 8, 6);  // Faceted sphere
const highPoly = new SphereGeometry(1, 64, 48);  // Very smooth (expensive)
```

---

### ConeGeometry

Creates a cone geometry pointing upward along Y axis. Extends BufferGeometry.

**Constructor:**
```javascript
new ConeGeometry(radius = 1, height = 1, radialSegments = 8, heightSegments = 1, openEnded = false)
```

**Parameters:**
- `radius` - Base circle radius
- `height` - Cone height along Y axis
- `radialSegments` - Segments around circumference (min: 3)
- `heightSegments` - Vertical subdivisions (min: 1)
- `openEnded` - Whether to cap the base (default: false = closed)

**Geometry Orientation:**
- Base centered at origin (Y = 0)
- Apex points upward to (0, height, 0)
- Base circle in XZ plane

**Example:**
```javascript
// Basic cone
const cone = new ConeGeometry(1, 2, 16);

// Low-poly cone (for performance)
const lowPoly = new ConeGeometry(1, 2, 6);

// Open-ended cone (no base cap)
const tube = new ConeGeometry(1, 2, 16, 1, true);

// Tall narrow cone
const spike = new ConeGeometry(0.2, 5, 8);
```

**Use Cases:**
- Tree trunks (inverted)
- Spotlight helper visualization
- Arrows and pointers
- Party hats
- Traffic cones

---

### TetrahedronGeometry

Creates a regular tetrahedron (4 triangular faces). Extends BufferGeometry.

**Constructor:**
```javascript
new TetrahedronGeometry(radius = 1)
```

**Parameters:**
- `radius` - Radius of circumscribed sphere

**Example:**
```javascript
const tetra = new TetrahedronGeometry(1);
```

---

### OctahedronGeometry

Creates a regular octahedron (8 triangular faces). Extends BufferGeometry.

**Constructor:**
```javascript
new OctahedronGeometry(radius = 1)
```

**Parameters:**
- `radius` - Radius of circumscribed sphere

**Example:**
```javascript
const octa = new OctahedronGeometry(1);
```

---

### IcosahedronGeometry

Creates a regular icosahedron (20 triangular faces). Extends BufferGeometry.

**Constructor:**
```javascript
new IcosahedronGeometry(radius = 1)
```

**Parameters:**
- `radius` - Radius of circumscribed sphere

**Example:**
```javascript
const icosa = new IcosahedronGeometry(1);  // Good low-poly sphere approximation
```

---

### DodecahedronGeometry

Creates a regular dodecahedron (12 pentagonal faces). Extends BufferGeometry.

**Constructor:**
```javascript
new DodecahedronGeometry(radius = 1)
```

**Parameters:**
- `radius` - Radius of circumscribed sphere

**Example:**
```javascript
const dodeca = new DodecahedronGeometry(1);
```

---

## Material Classes

### Material

Base material class.

**Constructor:**
```javascript
new Material()
```

**Properties:**
- `type` - Material type identifier
- `side` - Face culling mode ('FrontSide', 'BackSide', 'DoubleSide')
- `visible` - Visibility flag
- `transparent` - Enable transparency rendering (default: false)
- `opacity` - Material opacity 0-1 (default: 1.0)
- `depthWrite` - Write to depth buffer (default: true, set false for transparent objects)

**Transparency Notes:**
- Set `transparent = true` and `opacity < 1.0` to enable alpha blending
- Transparent objects are automatically sorted back-to-front by the renderer
- Set `depthWrite = false` for transparent objects to prevent depth occlusion issues
- Alpha blending formula: `finalColor = srcColor * srcAlpha + dstColor * (1 - srcAlpha)`

---

### BasicMaterial

Unlit material with solid color or texture. Extends Material.

**Constructor:**
```javascript
new BasicMaterial(parameters = {})
```

**Parameters (object):**
- `color` - Color instance or hex number (default: 0xffffff)
- `map` - Texture for color (default: null)

**Properties:**
- All Material properties
- `color` - Base color (Color)
- `map` - Texture map (Texture or null)

**Example:**
```javascript
const material = new BasicMaterial({
  color: 0xff0000
});

const textured = new BasicMaterial({
  color: 0xffffff,
  map: texture
});
```

---

### LambertMaterial

Diffuse material that responds to lighting. Extends Material.

**Constructor:**
```javascript
new LambertMaterial(parameters = {})
```

**Parameters (object):**
- `color` - Color instance or hex number (default: 0xffffff)
- `map` - Texture for color (default: null)

**Properties:**
- All Material properties
- `color` - Base color (Color)
- `map` - Texture map (Texture or null)

**Example:**
```javascript
const material = new LambertMaterial({
  color: 0x888888
});

scene.add(new AmbientLight(0xffffff, 0.4));
scene.add(new DirectionalLight(0xffffff, 0.8));
```

---

### PBRMaterial

Physically-based rendering material with metallic/roughness workflow. Extends Material.

**Backend Support:** GPU only (WebGPU and WebGL2)

**Constructor:**
```javascript
new PBRMaterial(parameters = {})
```

**Parameters (object):**
- `color` - Base color (Color or hex, default: 0xffffff)
- `metallic` - Metallic factor 0-1 (default: 0.0)
  - 0.0 = dielectric (plastic, wood, stone)
  - 1.0 = metal (iron, gold, copper)
- `roughness` - Roughness factor 0-1 (default: 0.5)
  - 0.0 = smooth (mirror-like reflections)
  - 1.0 = rough (diffuse-like)
- `map` - Base color texture (default: null)
- `normalMap` - Normal map texture (default: null)
- `normalScale` - Normal map influence (default: 1.0)
- `metalnessMap` - Metalness texture, samples from Blue channel (default: null)
- `roughnessMap` - Roughness texture, samples from Green channel (default: null)
- `aoMap` - Ambient occlusion map (default: null)
- `aoMapIntensity` - AO map strength (default: 1.0)
- `envMap` - Environment map for reflections/IBL (default: null)
- `envMapIntensity` - Environment map strength (default: 1.0)
- `emissive` - Emissive color (Color or hex, default: 0x000000)
- `emissiveIntensity` - Emissive strength (default: 1.0)
- `emissiveMap` - Emissive texture (default: null)
- `transparent` - Enable transparency (default: false)
- `opacity` - Opacity 0-1 (default: 1.0)
- `clearcoat` - Clearcoat layer intensity 0-1 (default: 0.0)
- `clearcoatRoughness` - Clearcoat roughness 0-1 (default: 0.0)
- `sheen` - Sheen intensity for cloth-like materials 0-1 (default: 0.0)
- `sheenRoughness` - Sheen roughness 0-1 (default: 1.0)
- `sheenColor` - Sheen tint color (Color, default: white)

**Properties:**
- All Material properties
- `color` - Base albedo color (Color)
- `metallic` - Metallic factor (0-1)
- `roughness` - Roughness factor (0-1)
- `map` - Albedo texture
- `normalMap` - Normal map for surface detail
- `normalScale` - Normal map influence multiplier
- `metalnessMap` - Metalness texture
- `roughnessMap` - Roughness texture
- `aoMap` - Ambient occlusion texture
- `aoMapIntensity` - AO map strength multiplier
- `envMap` - Environment/reflection map
- `envMapIntensity` - Environment map strength multiplier
- `emissive` - Self-illumination color
- `emissiveIntensity` - Emissive strength multiplier
- `emissiveMap` - Emissive texture
- `clearcoat` - Clearcoat layer intensity
- `clearcoatRoughness` - Clearcoat layer roughness
- `sheen` - Sheen intensity (cloth-like)
- `sheenRoughness` - Sheen roughness
- `sheenColor` - Sheen tint color
- `defines` - Shader defines (auto-managed)

**Setter Methods:**
- `setMap(texture)` - Set base color texture and update defines
- `setNormalMap(texture, scale = 1.0)` - Set normal map with optional scale
- `setMetalnessMap(texture)` - Set metalness texture and update defines
- `setRoughnessMap(texture)` - Set roughness texture and update defines
- `setAOMap(texture, intensity = 1.0)` - Set AO map with optional intensity
- `setEnvMap(texture, intensity = 1.0)` - Set environment map with optional intensity

**BRDF Model:**
- Cook-Torrance microfacet model
- Fresnel: Schlick approximation
- Distribution: GGX (Trowbridge-Reitz)
- Geometry: Smith's method with GGX
- Energy conserving

**Example - Metallic Materials:**
```javascript
// Polished gold
const gold = new PBRMaterial({
  color: new Color(1.0, 0.766, 0.336),
  metallic: 1.0,
  roughness: 0.2
});

// Brushed aluminum
const aluminum = new PBRMaterial({
  color: new Color(0.913, 0.921, 0.925),
  metallic: 1.0,
  roughness: 0.5
});

// Rusty iron
const iron = new PBRMaterial({
  color: new Color(0.56, 0.57, 0.58),
  metallic: 1.0,
  roughness: 0.8
});
```

**Example - Dielectric Materials:**
```javascript
// Plastic (smooth)
const plastic = new PBRMaterial({
  color: new Color(0.8, 0.2, 0.2),
  metallic: 0.0,
  roughness: 0.3
});

// Wood (rough)
const wood = new PBRMaterial({
  color: new Color(0.6, 0.4, 0.2),
  metallic: 0.0,
  roughness: 0.7
});

// Rubber
const rubber = new PBRMaterial({
  color: new Color(0.1, 0.1, 0.1),
  metallic: 0.0,
  roughness: 0.9
});
```

**Example - Textured PBR:**
```javascript
const textureLoader = new TextureLoader();

const pbrMaterial = new PBRMaterial({
  map: textureLoader.load('textures/albedo.jpg'),
  normalMap: textureLoader.load('textures/normal.jpg'),
  metalnessMap: textureLoader.load('textures/metalness.jpg'),
  roughnessMap: textureLoader.load('textures/roughness.jpg'),
  metallic: 1.0,  // These scale the texture values
  roughness: 1.0
});
```

**Example - IBL Reflections:**
```javascript
// Set up environment map for PBR reflections
const cubeLoader = new CubeTextureLoader();
const envMap = await cubeLoader.load([
  'px.hdr', 'nx.hdr', 'py.hdr', 'ny.hdr', 'pz.hdr', 'nz.hdr'
]);

const chrome = new PBRMaterial({
  color: 0xcccccc,
  metallic: 1.0,
  roughness: 0.05,
  envMap: envMap,
  envMapIntensity: 1.0
});

// Or set via Scene environment (applies to all PBR materials)
scene.environment = envMap;
```

**Backend Check:**
```javascript
if (renderer.capabilities.supportsPBR) {
  mesh.material = new PBRMaterial({ color: 0xff0000, metallic: 0.9, roughness: 0.2 });
} else {
  mesh.material = new LambertMaterial({ color: 0xff0000 });
}
```

---

### DebugMaterial

Special material for debugging (shows normals, UVs, etc.). Extends Material.

**Constructor:**
```javascript
new DebugMaterial(parameters = {})
```

**Parameters (object):**
- `mode` - Debug mode ('normal', 'uv', 'depth', 'wireframe')

**Example:**
```javascript
const debugMat = new DebugMaterial({ mode: 'normal' });
mesh.material = debugMat;
```

---

### MaterialHelper

Utility class for material type checking and automatic fallback conversion.

**CPU Backend Fallback:**

The MaterialHelper automatically converts unsupported materials to compatible alternatives. This is handled transparently by the CPUBackend.

```javascript
import { MaterialHelper } from './BangBang3D';

// Check if a material is supported by backend
const isSupported = MaterialHelper.isMaterialSupported(
  material, 
  renderer.capabilities
);

// Get fallback material if needed (used internally by backends)
const effectiveMaterial = MaterialHelper.getFallbackMaterial(
  material,
  renderer.capabilities
);

// PBRMaterial on CPU backend automatically converts to LambertMaterial:
// - Albedo color → diffuse color
// - Albedo map → diffuse map
// - Emissive contribution added to color
// - Metallic/roughness/normal maps ignored (not supported in Lambert)
```

**Automatic Fallback Behavior:**

When using `backend: 'cpu'` or `backend: 'auto'` with CPU fallback:
- PBRMaterial → LambertMaterial (preserves color, map, emissive)
- LambertMaterial → works as-is (CPU backend supports lighting)
- BasicMaterial → works as-is
- DebugMaterial → works as-is

Original material is never modified; fallback is temporary for rendering only.

**Example Workflow:**
```javascript
// Create PBR material
const material = new PBRMaterial({
  color: 0x8B4513,
  metallic: 0.2,
  roughness: 0.7,
  map: woodTexture
});

mesh.material = material;

// On GPU backend: renders with full PBR lighting
// On CPU backend: automatically uses Lambert fallback
//   → color: 0x8B4513 (preserved)
//   → map: woodTexture (preserved)
//   → metallic/roughness ignored (not supported)

// Original material unchanged
console.log(mesh.material.type); // "PBRMaterial"
```

---

### Working with Transparency and Glass

BangBang3D supports full alpha blending for transparent and glass materials. The renderer automatically handles transparent object sorting and depth buffer management.

**Basic Transparency:**
```javascript
// Semi-transparent material
const material = new BasicMaterial({
  color: 0xff0000,
  transparent: true,
  opacity: 0.5  // 50% transparent
});
```

**Glass Material Pattern:**
```javascript
// Realistic glass sphere
const glassMaterial = new BasicMaterial({
  color: 0x88ccff,     // Light blue tint
  transparent: true,
  opacity: 0.3,        // 70% transparent
  depthWrite: false    // Don't occlude other transparent objects
});

const glassSphere = new Mesh(
  new SphereGeometry(2, 32, 24),
  glassMaterial
);
```

**Transparency Best Practices:**
1. **Always set `transparent: true`** when using `opacity < 1.0`
2. **Set `depthWrite: false`** for transparent objects to prevent occlusion artifacts
3. **Use higher opacity values** (0.3-0.7) for glass-like effects
4. **Sorting is automatic** - renderer sorts transparent objects back-to-front
5. **Performance** - Transparent objects require extra sorting overhead

**Layered Transparency:**
```javascript
// Multiple transparent objects render correctly
const glass1 = new Mesh(
  new SphereGeometry(1),
  new BasicMaterial({ 
    color: 0xff0000, 
    transparent: true, 
    opacity: 0.4,
    depthWrite: false 
  })
);

const glass2 = new Mesh(
  new BoxGeometry(2, 2, 2),
  new BasicMaterial({ 
    color: 0x0000ff, 
    transparent: true, 
    opacity: 0.4,
    depthWrite: false 
  })
);

// Both render correctly with proper blending
scene.add(glass1);
scene.add(glass2);
```

**How Transparency Works:**
- The renderer separates meshes into opaque and transparent groups
- Opaque objects render first with normal depth testing
- Transparent objects are sorted by distance to camera (farthest first)
- Transparent objects render back-to-front with alpha blending
- FrameBuffer blends colors: `final = src * srcAlpha + dst * (1 - srcAlpha)`
- When `depthWrite: false`, transparent objects don't write to depth buffer

**Common Use Cases:**
- **Glass windows/objects**: `opacity: 0.2-0.4, depthWrite: false`
- **Water surfaces**: `opacity: 0.6-0.8, depthWrite: false`
- **Fog/smoke effects**: `opacity: 0.1-0.3, depthWrite: false`
- **Fade in/out animations**: Animate opacity from 0 to 1
- **X-ray view**: `opacity: 0.3, depthWrite: true` (occlude but show through)

---

### Material and Texture Serialization

**Status:** ✅ Implemented (Phase 2)

BangBang3D supports full JSON serialization and deserialization of materials and textures, including procedural textures. This enables material libraries, scene saving/loading, and material sharing.

**Material Serialization:**

```javascript
// Export material to JSON
const material = new LambertMaterial({ 
  color: 0xff0000, 
  transparent: true, 
  opacity: 0.5 
});
const json = material.toJSON();
console.log(JSON.stringify(json, null, 2));

// Result:
// {
//   "type": "LambertMaterial",
//   "name": "",
//   "visible": true,
//   "side": "FrontSide",
//   "transparent": true,
//   "opacity": 0.5,
//   "depthTest": true,
//   "depthWrite": true,
//   "color": 16711680,
//   "emissive": 0,
//   "emissiveIntensity": 1.0
// }

// Import material from JSON
import { LambertMaterial, TextureResolver } from './BangBang3D';
const textureResolver = new TextureResolver();
const materialFromJSON = LambertMaterial.fromJSON(json, textureResolver);
```

**PBR Material Serialization:**

```javascript
// Export PBR material to JSON
const pbrMaterial = new PBRMaterial({
  color: 0xccaa77,
  metallic: 0.8,
  roughness: 0.3,
  emissive: 0xff4400,
  emissiveIntensity: 0.5
});

// Add procedural textures
pbrMaterial.map = loader.createWoodTexture(512);
pbrMaterial.normalMap = loader.createNoiseTexture(256);

const pbrJSON = pbrMaterial.toJSON();

// Result includes all PBR properties and texture descriptors:
// {
//   "type": "PBRMaterial",
//   "color": 13413495,
//   "metallic": 0.8,
//   "roughness": 0.3,
//   "normalScale": 1.0,
//   "aoMapIntensity": 1.0,
//   "envMapIntensity": 1.0,
//   "emissive": 16729088,
//   "emissiveIntensity": 0.5,
//   "map": { /* texture descriptor */ },
//   "normalMap": { /* texture descriptor */ }
// }

// Import PBR material from JSON
const recreatedPBR = PBRMaterial.fromJSON(pbrJSON, textureResolver);
// All properties and textures are restored
```

**Texture Serialization:**

```javascript
import { TextureLoader } from './BangBang3D';

const loader = new TextureLoader();
const texture = loader.createCheckerTexture(256, 8);

// Export texture
const textureJSON = texture.toJSON();

// Result includes procedural descriptor:
// {
//   "uuid": "...",
//   "name": "",
//   "wrapS": "repeat",
//   "wrapT": "repeat",
//   "repeat": { "x": 1, "y": 1 },
//   "offset": { "x": 0, "y": 0 },
//   "rotation": 0,
//   "magFilter": "nearest",
//   "minFilter": "nearest",
//   "flipY": true,
//   "procedural": {
//     "generator": "checker",
//     "options": { "size": 256, "checkerCount": 8 }
//   }
// }

// Import texture
import { Texture } from './BangBang3D';
const textureFromJSON = Texture.fromJSON(textureJSON, loader);
```

**Material with Textures:**

```javascript
// Material with procedural texture
const material = new BasicMaterial({ color: 0xffffff });
material.map = loader.createWoodTexture(512);

const json = material.toJSON();
// json.map contains full texture descriptor including procedural info

// Deserialize maintains texture reference
const recreated = BasicMaterial.fromJSON(json, textureResolver);
// recreated.map is a Texture object recreated from descriptor
```

**MaterialSerializer Helper:**

```javascript
import { MaterialSerializer } from './BangBang3D';

const serializer = new MaterialSerializer();

// Export single material
const jsonString = JSON.stringify(
  serializer.serializeMaterial(material), 
  null, 
  2
);

// Export material library
const materials = [material1, material2, material3];
const libraryJSON = serializer.exportLibrary(materials);

// Import material library
const imported = serializer.importLibrary(libraryJSON);
// Returns array of Material objects with textures resolved

// Access texture resolver
const resolver = serializer.getTextureResolver();
console.log(resolver.getStats()); // { textureCount: N, textures: [...] }
```

**Procedural Texture Generators:**

All procedural textures store their generation parameters and can be fully serialized:

- `createCheckerTexture(size, checkerCount)` - Checker pattern
- `createUVTestTexture(size)` - UV coordinate visualization
- `createGridTexture(size, gridSize, lineWidth)` - Grid lines
- `createWoodTexture(size)` - Wood grain pattern
- `createBrickTexture(size)` - Brick wall pattern
- `createNoiseTexture(size, scale, seed)` - Procedural noise
- `createGradientTexture(size, type, colorStart, colorEnd)` - Color gradients

Each generator's output includes a `procedural` metadata field that enables exact recreation from JSON.

**Texture Transform Properties:**

Textures support UV transforms that are preserved during serialization:

```javascript
const texture = loader.createCheckerTexture(256, 8);
texture.repeat = { x: 2, y: 2 };   // Repeat 2x in each direction
texture.offset = { x: 0.5, y: 0 };  // Shift by half
texture.rotation = Math.PI / 4;     // Rotate 45 degrees

const json = texture.toJSON(); // Transforms included
const restored = Texture.fromJSON(json, loader); // Transforms restored
```

**TextureResolver and Caching:**

The `TextureResolver` manages texture instances and prevents duplication:

```javascript
import { TextureResolver } from './BangBang3D';

const resolver = new TextureResolver();

// Resolves from JSON descriptor, uses cache by UUID
const texture1 = resolver.resolveTexture(textureJSON);
const texture2 = resolver.resolveTexture(textureJSON); // Returns same instance

// Manually add to cache
resolver.addTexture(myTexture);

// Check cache
if (resolver.hasTexture(uuid)) {
  const cached = resolver.getTexture(uuid);
}

// Clear cache
resolver.clear();
```

**Example: Complete Material Library Workflow:**

```javascript
import { 
  BasicMaterial, 
  LambertMaterial,
  TextureLoader, 
  MaterialSerializer 
} from './BangBang3D';

// Create materials
const loader = new TextureLoader();
const mat1 = new BasicMaterial({ 
  color: 0xff0000,
  map: loader.createCheckerTexture(256, 8)
});
const mat2 = new LambertMaterial({ 
  color: 0x00ff00,
  map: loader.createWoodTexture(512)
});

// Export library
const serializer = new MaterialSerializer();
const libraryJSON = serializer.exportLibrary([mat1, mat2]);
localStorage.setItem('myMaterials', libraryJSON);

// Later: Import library
const savedJSON = localStorage.getItem('myMaterials');
const materials = serializer.importLibrary(savedJSON);
materials.forEach(mat => {
  console.log(`Loaded ${mat.type}: ${mat.color.getHex()}`);
  if (mat.map) {
    console.log(`  Texture: ${mat.map.procedural?.generator || 'image'}`);
  }
});
```

---

## Light Classes

### Light

Base light class. Extends Object3D.

**Constructor:**
```javascript
new Light(color, intensity)
```

**Properties:**
- All Object3D properties
- `color` - Light color (Color)
- `intensity` - Light intensity (0-1+)
- `enabled` - Enable/disable this light (default: `true`). When `false`, the renderer skips this light during shading, shadowing, and IBL passes across all material types (Basic, Lambert, PBR). This does **not** remove the light from the scene graph — it simply excludes it from lighting calculations.

```javascript
light.enabled = false;  // Light stays in scene but has no effect
light.enabled = true;   // Re-enable the light
```

---

### AmbientLight

Uniform ambient illumination (no direction). Extends Light.

**Constructor:**
```javascript
new AmbientLight(color = 0xffffff, intensity = 1)
```

**Parameters:**
- `color` - Light color (hex or Color)
- `intensity` - Light intensity

**Example:**
```javascript
const ambient = new AmbientLight(0xffffff, 0.4);
scene.add(ambient);
```

---

### DirectionalLight

Directional light with parallel rays (like sunlight). Extends Light.

**Backend Support:** CPU + GPU

**Constructor:**
```javascript
new DirectionalLight(color = 0xffffff, intensity = 1)
```

**Parameters:**
- `color` - Light color (hex or Color)
- `intensity` - Light intensity

**Properties:**
- All Light properties
- `target` - Vector3 target position (light direction = position → target)
- `castShadow` - Whether light casts shadows (default: false)
- `shadow` - Shadow configuration object:
  - `mapSize` - Shadow map resolution: `{ width: 1024, height: 1024 }`
  - `bias` - Depth bias to reduce shadow acne (default: 0.0005)
  - `normalBias` - Normal-direction bias (default: 0.0)
  - `radius` - PCF filter radius (default: 1.0)
  - `frustumSize` - Orthographic shadow camera half-extent (default: 10)
  - `camera` - Shadow camera (auto-created on `initShadowCamera()`)
  - `map` - Shadow map texture (auto-created)
  - `matrix` - Shadow projection matrix (auto-computed)

**Methods:**
- `getDirection(out)` - Get normalized direction vector from position to target
- `initShadowCamera()` - Create orthographic shadow camera based on `shadow.frustumSize`
- `updateShadowCamera()` - Update shadow camera matrices from light position/target

**Example:**
```javascript
const sun = new DirectionalLight(0xffffff, 0.8);
sun.position.set(10, 10, 5);
sun.target = new Vector3(0, 0, 0);
scene.add(sun);

// Enable shadows
sun.castShadow = true;
sun.shadow.mapSize = { width: 2048, height: 2048 };
sun.shadow.bias = 0.0005;
sun.shadow.frustumSize = 20;
sun.initShadowCamera();
```

---

### PointLight

Omnidirectional light emitting from a single point. Supports distance-based attenuation.

**Backend Support:** GPU only (WebGPU and WebGL2)

**Constructor:**
```javascript
new PointLight(color = 0xffffff, intensity = 1.0, distance = 0, decay = 2)
```

**Parameters:**
- `color` - Light color (hex or Color)
- `intensity` - Light intensity multiplier
- `distance` - Maximum light range (0 = infinite)
- `decay` - Attenuation decay rate (1 = linear, 2 = physically accurate inverse square)

**Properties:**
- All Light properties
- `distance` - Range at which intensity becomes zero (0 = infinite)
- `decay` - Decay rate (1 = linear, 2 = inverse square)
- `castShadow` - Whether light casts shadows (default: false)

**Methods:**
- `getAttenuation(distance)` - Calculate light attenuation at given distance

**Attenuation Formula:**
- **Linear** (decay = 1): `max(0, 1.0 - distance / maxDistance)`
- **Inverse Square** (decay = 2): `1.0 / (distance²)` with cutoff normalization

**Example:**
```javascript
// Simple point light
const pointLight = new PointLight(0xffffff, 1.0);
pointLight.position.set(0, 5, 0);
scene.add(pointLight);

// Point light with limited range
const lamp = new PointLight(0xffaa00, 1.5, 10, 2);
lamp.position.set(2, 2, 0);
scene.add(lamp);

// Multiple colored point lights
const lights = [
  { color: 0xff0000, pos: [-5, 2, 0] },
  { color: 0x00ff00, pos: [0, 2, 0] },
  { color: 0x0000ff, pos: [5, 2, 0] }
];

lights.forEach(({ color, pos }) => {
  const light = new PointLight(color, 1.0, 20, 2);
  light.position.set(...pos);
  scene.add(light);
});
```

**Capacity Limits:**
- Maximum 8 point lights per scene (GPU limitation)
- Additional lights beyond limit are ignored

---

### SpotLight

Cone-shaped light beam with angular falloff. Like a flashlight or stage spotlight.

**Backend Support:** GPU only (WebGPU and WebGL2)

**Constructor:**
```javascript
new SpotLight(color = 0xffffff, intensity = 1.0, distance = 0, angle = Math.PI/3, penumbra = 0, decay = 2)
```

**Parameters:**
- `color` - Light color (hex or Color)
- `intensity` - Light intensity multiplier
- `distance` - Maximum light range (0 = infinite)
- `angle` - Maximum cone angle in radians (default: π/3 = 60°)
- `penumbra` - Soft edge as percentage of cone (0-1, default: 0)
- `decay` - Distance attenuation rate (1 = linear, 2 = inverse square)

**Properties:**
- All Light properties
- `distance` - Range at which intensity becomes zero
- `angle` - Maximum cone angle (radians)
- `penumbra` - Soft edge percentage (0 = hard edge, 1 = very soft)
- `decay` - Distance decay rate
- `target` - Object3D target to point at (default: points down -Z)
- `castShadow` - Whether light casts shadows (default: false)
- `shadow` - Shadow configuration object:
  - `mapSize` - Shadow map resolution: `{ width: 1024, height: 1024 }`
  - `bias` - Depth bias (default: 0.0005)
  - `normalBias` - Normal-direction bias (default: 0.0)
  - `radius` - PCF filter radius (default: 1.0)
  - `camera` - Shadow camera (auto-created on `initShadowCamera()`)
  - `map` - Shadow map texture (auto-created)
  - `matrix` - Shadow projection matrix (auto-computed)

**Methods:**
- `getDirection(target)` - Get normalized direction from light to target
- `getDistanceAttenuation(distance)` - Calculate distance-based attenuation
- `getAngularAttenuation(lightToSurface)` - Calculate angular falloff
- `initShadowCamera()` - Create perspective shadow camera from light's angle/distance
- `updateShadowCamera()` - Update shadow camera position and matrices

**Angular Falloff:**
- **Inner cone** (angle × (1 - penumbra)): Full intensity
- **Outer cone** (full angle): Zero intensity
- **Between**: Smooth falloff using smoothstep

**Example:**
```javascript
// Basic spotlight
const spot = new SpotLight(0xffffff, 1.0);
spot.position.set(0, 5, 0);
spot.target.position.set(0, 0, 0);
scene.add(spot);
scene.add(spot.target); // Target must be in scene

// Stage spotlight with soft edges
const stageLight = new SpotLight(
  0xffddaa,           // Warm white
  2.0,                // Bright
  15,                 // 15 unit range
  Math.PI / 6,        // 30° cone
  0.3,                // 30% soft edge
  2                   // Inverse square falloff
);
stageLight.position.set(0, 10, 5); stageLight.target.position.set(0, 0, 0);
scene.add(stageLight);
scene.add(stageLight.target);

// Animate spotlight direction
function animate() {
  const time = Date.now() * 0.001;
  spot.target.position.x = Math.sin(time) * 5;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
```

**Capacity Limits:**
- Maximum 4 spotlights per scene (GPU limitation)
- Additional lights beyond limit are ignored

---

### HemisphereLight

Two-color hemispheric lighting (sky and ground). Perfect for outdoor scenes with sky and ground reflection.

**Backend Support:** GPU only (WebGPU and WebGL2)

**Constructor:**
```javascript
new HemisphereLight(skyColor = 0xffffff, groundColor = 0x000000, intensity = 1.0)
```

**Parameters:**
- `skyColor` - Color of upper hemisphere (hex or Color)
- `groundColor` - Color of lower hemisphere (hex or Color)
- `intensity` - Light intensity multiplier

**Properties:**
- `color` - Sky/upper hemisphere color (Color)
- `groundColor` - Ground/lower hemisphere color (Color)
- `intensity` - Intensity multiplier (0-1+)
- `position` - Position represents "up" direction (default: 0, 1, 0)

**Methods:**
- `getColorForNormal(normal)` - Get interpolated color based on surface normal

**Color Interpolation:**
- Surface normals pointing up (+Y) receive sky color
- Surface normals pointing down (-Y) receive ground color
- Normals at angle receive blend: `lerp(groundColor, skyColor, normal.y * 0.5 + 0.5)`

**Example:**
```javascript
// Basic hemisphere light
const hemiLight = new HemisphereLight(
  0x87ceeb,  // Sky blue
  0x8b4513,  // Ground brown
  0.6
);
scene.add(hemiLight);

// Outdoor scene lighting
const skyLight = new HemisphereLight(
  0xffffbb,  // Warm sky
  0x080820,  // Dark ground
  1.0
);
scene.add(skyLight);

// Combined with directional sun
const hemi = new HemisphereLight(0xffffff, 0x444444, 0.4);
const sun = new DirectionalLight(0xffffff, 0.8);
sun.position.set(10, 10, 5);
scene.add(hemi);
scene.add(sun);
```

**Use Cases:**
- Outdoor scenes (sky + ground ambient)
- Subsurface scattering approximation
- Soft ambient lighting with directionality
- Natural-looking base lighting

---

## Light Helper Classes

Visual helpers for debugging and visualizing light positions, directions, and influence areas.

### PointLightHelper

Visualizes a PointLight as a small colored sphere at its position.

**Constructor:**
```javascript
new PointLightHelper(light, size = 0.2, color = null)
```

**Parameters:**
- `light` - PointLight to visualize
- `size` - Sphere radius (default: 0.2)
- `color` - Optional color override (default: uses light.color)

**Methods:**
- `update()` - Update helper to match light's current state
- `dispose()` - Free resources

**Example:**
```javascript
import { PointLight, PointLightHelper } from './src/index.js';

const light = new PointLight(0xff0000, 1.0, 10);
light.position.set(2, 3, 0);
scene.add(light);

const helper = new PointLightHelper(light, 0.3);
scene.add(helper);

// Hide helper without disabling light
helper.visible = false;
```

---

### SpotLightHelper

Visualizes a SpotLight with a grabbable sphere marker at the light position and a semi-transparent cone showing the beam direction. Extends Object3D (contains child meshes).

**Constructor:**
```javascript
new SpotLightHelper(light, color = null)
```

**Parameters:**
- `light` - SpotLight to visualize
- `color` - Optional color override (default: uses light.color)

**Properties:**
- `marker` - Mesh (SphereGeometry, r=0.3) — solid colored sphere at the light position, used for click/drag selection
- `cone` - Mesh (ConeGeometry) — semi-transparent cone (opacity 0.15) showing the spotlight beam
- `light` - Reference to the SpotLight being visualised
- Cone geometry is automatically sized to light's angle and distance at creation time
- Cone is oriented toward the light's target

**Methods:**
- `update()` - Update helper colors and orientation to match light's current state
- `dispose()` - Free sphere + cone geometry and material resources

**Example:**
```javascript
import { SpotLight, SpotLightHelper } from './src/index.js';

const light = new SpotLight(0xffffff, 1.0, 10, Math.PI / 4, 0.2);
light.position.set(0, 5, 0);
light.target.position.set(0, 0, 0);
scene.add(light);
scene.add(light.target);

const helper = new SpotLightHelper(light);
scene.add(helper);

// Update helper in animation loop
function animate() {
  helper.position.copy(light.position); // Sync position
  helper.update(); // Sync color and orientation
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
```

**Note:** SpotLightHelper extends `Object3D` (not `Mesh`). Raycasting with `intersectObjects(helpers, true)` will hit the child sphere/cone meshes. Traverse up via `.parent` to find the helper root with the `.light` reference.

---

### DirectionalLightHelper

Visualizes a DirectionalLight as a plane with arrow lines showing parallel ray direction.

**Constructor:**
```javascript
new DirectionalLightHelper(light, size = 1, color = null)
```

**Parameters:**
- `light` - DirectionalLight to visualize
- `size` - Helper plane size (default: 1)
- `color` - Optional color override (default: uses light.color)

**Visual Components:**
- Transparent plane representing light source area
- Multiple arrow lines showing parallel ray direction
- Automatically oriented toward light's target

**Methods:**
- `update()` - Update helper to match light's current state
- `dispose()` - Free resources (disposes all child meshes)

**Example:**
```javascript
import { DirectionalLight, DirectionalLightHelper, Vector3 } from './src/index.js';

const light = new DirectionalLight(0xffffff, 0.8);
light.position.set(10, 10, 5);
light.target = new Vector3(0, 0, 0);
scene.add(light);

const helper = new DirectionalLightHelper(light, 2);
scene.add(helper);

// Update in animation loop if light moves
function animate() {
  helper.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
```

---

### HemisphereLightHelper

Visualizes a HemisphereLight as a two-colored hemisphere showing sky and ground colors.

**Constructor:**
```javascript
new HemisphereLightHelper(light, size = 1)
```

**Parameters:**
- `light` - HemisphereLight to visualize
- `size` - Hemisphere radius (default: 1)

**Visual Components:**
- Upper hemisphere in sky color
- Lower hemisphere in ground color
- Both semi-transparent for visibility
- Double-sided rendering

**Methods:**
- `update()` - Update helper colors to match light's current state
- `dispose()` - Free resources (disposes both hemisphere meshes)

**Example:**
```javascript
import { HemisphereLight, HemisphereLightHelper } from './src/index.js';

const light = new HemisphereLight(0x87ceeb, 0x8b4513, 0.6);
light.position.set(0, 5, 0);
scene.add(light);

const helper = new HemisphereLightHelper(light, 1.5);
scene.add(helper);

// Update if light colors change
light.color.setHex(0xffffbb);
light.groundColor.setHex(0x080820);
helper.update(); // Refresh helper colors
```

---

### Managing Light Helpers

**Common Pattern - Store Helpers with Lights:**
```javascript
const lightHelpers = [];

function addLightWithHelper(light, helperClass, ...helperArgs) {
  scene.add(light);
  
  const helper = new helperClass(light, ...helperArgs);
  scene.add(helper);
  
  lightHelpers.push({ light, helper });
  
  return { light, helper };
}

// Add lights with helpers
const { light: pointLight, helper: pointHelper } = addLightWithHelper(
  new PointLight(0xff0000, 1.0, 10),
  PointLightHelper,
  0.3
);
pointLight.position.set(2, 2, 0);

const { light: spotLight, helper: spotHelper } = addLightWithHelper(
  new SpotLight(0xffffff, 1.0, 15, Math.PI / 4),
  SpotLightHelper
);
spotLight.position.set(0, 5, 0);
```

**Toggle Helper Visibility:**
```javascript
// Hide all helpers
lightHelpers.forEach(({ helper }) => {
  helper.visible = false;
});

// Show specific helper
pointHelper.visible = true;

// Hide helper without disabling light
helper.visible = false;  // Helper hidden
light.intensity = 1.0;   // Light still active
```

**Update Helpers in Animation Loop:**
```javascript
function animate() {
  // Update all helpers (important for moving lights)
  lightHelpers.forEach(({ light, helper }) => {
    if (helper.update) {
      // Sync helper position with light
      if (light.position) {
        helper.position.copy(light.position);
      }
      helper.update();
    }
  });
  
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
```

---

## Renderer Classes

### BangBangRenderer

Main renderer with dual backend architecture (see [Renderer & Backend Classes](#renderer--backend-classes) for complete API documentation).

**Internal Architecture Overview:**

The renderer uses a pluggable backend system:
- **CPU Backend**: Software rasterization with FrameBuffer, DepthBuffer, and Pipeline
- **GPU Backend** (WebGPU/WebGL2): Hardware-accelerated rendering with shader-based pipeline

**CPU Backend Components:**
- `frameBuffer` - Internal FrameBuffer for color
- `depthBuffer` - Internal DepthBuffer for Z-testing  
- `pipeline` - Rendering Pipeline with vertex/fragment shaders

**GPU Backend Components:**
- `device` - WebGPU device or WebGL2 context
- `bindGroups` - Shader uniform bindings
- `pipelines` - Compiled render pipelines

**Automatic Transparency Handling:**

Both backends automatically handle transparent object rendering:
1. Separate meshes into opaque and transparent groups
2. Render opaque objects first with depth testing
3. Sort transparent objects back-to-front by distance to camera
4. Render transparent objects with alpha blending

See backend-specific sections below for implementation details.

---

### FrameBuffer

Color buffer for CPU backend rendering. Supports alpha blending for transparency.

*Note: GPU backend uses hardware framebuffers internally.*

**Constructor:**
```javascript
new FrameBuffer(width, height)
```

**Methods:**
- `clear(color)` - Clear to color
- `setPixel(x, y, r, g, b, a)` - Set pixel color with alpha blending
  - When alpha < 255: blends with existing pixel using `src * srcAlpha + dst * (1 - srcAlpha)`
  - When alpha = 255: direct write (faster)
- `getPixel(x, y)` - Get pixel color
- `resize(width, height)` - Resize buffer

---

### DepthBuffer

Depth buffer (Z-buffer) for CPU backend depth testing. Supports optional depth writing for transparency.

*Note: GPU backend uses hardware depth buffers internally.*

**Constructor:**
```javascript
new DepthBuffer(width, height)
```

**Methods:**
- `clear(depth)` - Clear to depth value
- `test(x, y, depth)` - Test depth and write if passed (returns true if passed)
- `testOnly(x, y, depth)` - Test depth without writing (for transparent objects with depthWrite=false)
- `setDepth(x, y, depth)` - Write depth value directly
- `getDepth(x, y)` - Read depth value
- `resize(width, height)` - Resize buffer

---

## Animation Classes

### AnimationMixer

Central manager for animations on a scene graph. Creates and updates `AnimationAction` instances that control individual clip playback.

**Constructor:**
```javascript
new AnimationMixer(root)
```

**Parameters:**
- `root` - Root Object3D used to resolve animation track targets by name

**Properties:**
- `root` - Root object for all animations
- `time` - Current mixer time (seconds)
- `timeScale` - Global time scale multiplier (default: 1.0)

**Methods:**
- `clipAction(clip)` - Get or create an AnimationAction for the given AnimationClip. Returns existing action if one already exists for this clip.
- `update(deltaTime)` - Advance all active animations by `deltaTime` seconds
- `stopAllAction()` - Stop all actions
- `getAction(clip)` - Get existing action for a clip (returns null if none)
- `dispose()` - Release all actions and resources

**Example:**
```javascript
import { AnimationMixer } from './src/index.js';

// After loading a glTF with animations
const mixer = new AnimationMixer(gltf.scene);

// Play first animation
const action = mixer.clipAction(gltf.animations[0]);
action.play();

// In render loop
function animate() {
  const delta = clock.getDelta();
  mixer.update(delta);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
```

---

### AnimationAction

Controls playback of an individual AnimationClip. Created by `AnimationMixer.clipAction()`.

**Constructor:**
```javascript
new AnimationAction(clip, mixer, root)
```

**Properties:**
- `clip` - The AnimationClip being played
- `time` - Current playback time (seconds)
- `timeScale` - Playback speed multiplier (default: 1.0)
- `weight` - Blend weight 0-1 (default: 1.0)
- `loop` - Whether to loop (default: true)
- `enabled` - Whether the action is active (default: true)
- `paused` - Whether the action is paused (default: false)

**Methods:**
- `play()` - Start or resume playback (returns `this`)
- `stop()` - Stop and reset to time 0 (returns `this`)
- `pause()` - Pause playback (returns `this`)
- `resume()` - Resume after pause (returns `this`)
- `fadeIn(duration)` - Fade weight from 0 to 1 over duration seconds (returns `this`)
- `fadeOut(duration)` - Fade weight from 1 to 0 over duration seconds, stops when complete (returns `this`)
- `setWeight(weight)` - Set blend weight 0-1 (returns `this`)
- `setTimeScale(scale)` - Set playback speed (returns `this`)

**Example - Animation Blending:**
```javascript
const idleAction = mixer.clipAction(idleClip);
const walkAction = mixer.clipAction(walkClip);

// Start idle
idleAction.play();

// Transition to walk
idleAction.fadeOut(0.5);
walkAction.fadeIn(0.5);
```

---

### AnimationClip

Container for a named set of keyframe tracks representing a single animation.

**Constructor:**
```javascript
new AnimationClip(name, duration = -1, tracks = [])
```

**Parameters:**
- `name` - Animation name (e.g., 'Walk', 'Idle')
- `duration` - Clip duration in seconds (-1 to auto-calculate from tracks)
- `tracks` - Array of KeyframeTrack instances

**Properties:**
- `name` - Clip name
- `duration` - Duration in seconds
- `tracks` - Array of KeyframeTrack
- `loop` - Whether clip loops (default: true)

**Methods:**
- `calculateDuration()` - Recalculate duration from track data
- `optimize()` - Remove redundant keyframes from all tracks
- `clone()` - Deep clone the clip and all tracks

---

### KeyframeTrack

Base class for keyframe data on a single animated property (e.g., position, rotation).

**Constructor:**
```javascript
new KeyframeTrack(name, times, values, interpolation = 'linear')
```

**Parameters:**
- `name` - Track name in format `"objectName.property"` (e.g., `"LeftArm.position"`)
- `times` - Float32Array of keyframe times in seconds
- `values` - Float32Array of keyframe values (length = times.length × valueSize)
- `interpolation` - `'linear'`, `'step'`, or `'cubic'`

**Properties:**
- `name` - Track name
- `times` - Keyframe time array
- `values` - Keyframe value array
- `valueSize` - Components per keyframe (auto-calculated: values.length / times.length)
- `interpolation` - Interpolation mode

**Methods:**
- `interpolate(time, result)` - Sample interpolated value at given time into result array
- `optimize()` - Remove redundant keyframes
- `clone()` - Deep clone the track

**Subclasses:**
- `VectorKeyframeTrack` - For Vector3 properties (position, scale). valueSize = 3
- `QuaternionKeyframeTrack` - For Quaternion properties (rotation). valueSize = 4, uses slerp interpolation

---

### Bone

Represents a single bone in a skeleton hierarchy. Extends Object3D.

**Constructor:**
```javascript
new Bone()
```

**Properties:**
- All Object3D properties
- `type` - `'Bone'`
- `isBone` - `true`

---

### Skeleton

Manages a set of bones and computes bone matrices for GPU skinning.

**Constructor:**
```javascript
new Skeleton(bones = [], boneInverses = [])
```

**Parameters:**
- `bones` - Array of Bone objects
- `boneInverses` - Array of Matrix4 inverse bind matrices (auto-calculated if omitted)

**Properties:**
- `bones` - Array of Bone instances
- `boneInverses` - Inverse bind pose matrices
- `boneMatrices` - Float32Array of final bone matrices (16 floats per bone)
- `boneTexture` - Bone texture for GPU skinning (optional)
- `needsUpdate` - Whether matrices need recalculation

**Methods:**
- `calculateInverses()` - Compute inverse bind matrices from current bone world transforms
- `update()` - Recompute `boneMatrices` from current bone transforms and inverses
- `getBoneByName(name)` - Find a bone by name (returns Bone or null)
- `clone()` - Clone the skeleton
- `dispose()` - Release bone texture resources

---

## Resource Classes

### Texture

Texture data container.

**Constructor:**
```javascript
new Texture(image)
```

**Parameters:**
- `image` - ImageData or HTMLImageElement

**Properties:**
- `image` - Image data
- `width, height` - Dimensions
- `magFilter` - Magnification filter ('nearest' or 'linear')
- `minFilter` - Minification filter ('nearest' or 'linear')
- `wrapS` - Horizontal wrap mode ('repeat', 'clamp')
- `wrapT` - Vertical wrap mode ('repeat', 'clamp')

**Methods:**
- `sample(u, v)` - Sample texture at UV coordinates
- `needsUpdate()` - Mark for update

**Example:**
```javascript
const texture = new Texture(imageData);
texture.magFilter = 'linear';
texture.minFilter = 'linear';
texture.wrapS = 'repeat';
texture.wrapT = 'repeat';
```

---

### TextureLoader

Utility for creating textures.

**Constructor:**
```javascript
new TextureLoader()
```

**Methods:**
- `createCheckerTexture(size, divisions)` - Create checker pattern
- `createUVTestTexture(size)` - Create UV test grid
- `createGridTexture(size, gridSize, lineWidth)` - Create grid pattern
- `createWoodTexture(size)` - Create wood grain
- `createBrickTexture(size)` - Create brick pattern
- `createNoiseTexture(size)` - Create noise pattern
- `createGradientTexture(size, color1, color2)` - Create gradient

**Example:**
```javascript
const loader = new TextureLoader();

const checker = loader.createCheckerTexture(256, 8);
const uvTest = loader.createUVTestTexture(512);
const wood = loader.createWoodTexture(512);

const material = new BasicMaterial({
  color: 0xffffff,
  map: checker
});
```

---

### MTLLoader

Loads Wavefront .mtl material library files.

**Constructor:**
```javascript
new MTLLoader()
```

**Methods:**
- `setPath(path)` - Set base path for resolving texture paths
- `load(url, onLoad, onError)` - Load MTL file from URL
- `parse(text)` - Parse MTL file content (returns materials object)
- `loadTextures(materials, onAllLoaded)` - Load all textures referenced by materials

**Supported MTL Properties:**
- `newmtl` - Material name
- `Ka` - Ambient color (RGB 0-1)
- `Kd` - Diffuse color (RGB 0-1)
- `Ks` - Specular color (RGB 0-1)
- `Ns` - Specular exponent (shininess)
- `d` - Dissolve/opacity (0-1)
- `Tr` - Transparency (inverse of d)
- `map_Kd` - Diffuse texture map
- `map_Ka` - Ambient texture map
- `map_Ks` - Specular texture map

**Example:**
```javascript
import { MTLLoader } from './src/index.js';

const mtlLoader = new MTLLoader();
mtlLoader.setPath('./models/');

mtlLoader.load(
  'model.mtl',
  (materials) => {
    console.log('Materials loaded:', materials);
    
    // Load textures referenced by materials
    mtlLoader.loadTextures(materials, (materialsWithTextures) => {
      console.log('Textures loaded');
      // Use materials with OBJLoader
    });
  },
  (error) => {
    console.error('Failed to load MTL:', error);
  }
);
```

**Material Object Structure:**
```javascript
{
  'MaterialName': {
    name: 'MaterialName',
    ambient: Color(r, g, b),      // Ka
    diffuse: Color(r, g, b),      // Kd
    specular: Color(r, g, b),     // Ks
    shininess: 30,                // Ns
    opacity: 1.0,                 // d/Tr
    textures: {
      diffuse: 'path/to/texture.png',
      ambient: 'path/to/ambient.png'
    },
    textureObjects: {             // After loadTextures()
      diffuse: Texture,
      ambient: Texture
    }
  }
}
```

---

### OBJLoader

Loads Wavefront .obj 3D model files.

**Constructor:**
```javascript
new OBJLoader()
```

**Methods:**
- `setPath(path)` - Set base path for resolving relative paths
- `setMaterials(materials)` - Set materials from MTLLoader
- `load(url, onLoad, onProgress, onError)` - Load OBJ file from URL
- `parse(text)` - Parse OBJ file content (returns object with meshes)
- `computeBoundingBox(meshes)` - Calculate bounding box for mesh array

**Supported OBJ Features:**
- `v` - Vertex positions (x y z)
- `vt` - Texture coordinates (u v)
- `vn` - Vertex normals (x y z)
- `f` - Faces (triangles and quads, auto-triangulated)
- `usemtl` - Material assignment
- `mtllib` - Material library reference
- `o` / `g` - Object/group names (optional)

**Face Formats Supported:**
- `f v1 v2 v3` - Position indices only
- `f v1/vt1 v2/vt2 v3/vt3` - Position + UV
- `f v1/vt1/vn1 v2/vt2/vn2 v3/vt3/vn3` - Position + UV + Normal
- `f v1//vn1 v2//vn2 v3//vn3` - Position + Normal (no UV)
- Negative indices (relative to end of list)

**Example:**
```javascript
import { OBJLoader, MTLLoader } from './src/index.js';

const objLoader = new OBJLoader();
const mtlLoader = new MTLLoader();

// Load materials first
mtlLoader.setPath('./models/');
mtlLoader.load('model.mtl', (materials) => {
  mtlLoader.loadTextures(materials, (materialsWithTextures) => {
    
    // Load OBJ with materials
    objLoader.setPath('./models/');
    objLoader.setMaterials(materialsWithTextures);
    
    objLoader.load(
      'model.obj',
      (result) => {
        // Add meshes to scene
        for (const mesh of result.meshes) {
          scene.add(mesh);
        }
        
        console.log(`Loaded ${result.meshes.length} meshes`);
      },
      null, // onProgress
      (error) => {
        console.error('Failed to load OBJ:', error);
      }
    );
  });
});
```

**Result Object Structure:**
```javascript
{
  meshes: [
    Mesh {
      geometry: BufferGeometry,  // With position, normal, uv attributes
      material: LambertMaterial, // From MTL or default gray
      userData: {
        materialName: 'MaterialName'
      }
    },
    // ... more meshes (one per material)
  ],
  materialLibs: ['model.mtl']
}
```

**Auto-Centering and Scaling:**
```javascript
// After loading model
const bbox = objLoader.computeBoundingBox(result.meshes);

const center = new Vector3(
  (bbox.min.x + bbox.max.x) / 2,
  (bbox.min.y + bbox.max.y) / 2,
  (bbox.min.z + bbox.max.z) / 2
);

const size = new Vector3(
  bbox.max.x - bbox.min.x,
  bbox.max.y - bbox.min.y,
  bbox.max.z - bbox.min.z
);

const maxDim = Math.max(size.x, size.y, size.z);
const scale = 5.0 / maxDim; // Target size of 5 units

for (const mesh of result.meshes) {
  mesh.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  mesh.scale.set(scale, scale, scale);
}
```

**Complete Loading Pipeline:**
```javascript
import { Scene, AmbientLight, DirectionalLight, Vector3, OBJLoader, MTLLoader } from './src/index.js';

const scene = new Scene();
const objLoader = new OBJLoader();
const mtlLoader = new MTLLoader();
const basePath = './models/';

// 1. Load MTL
mtlLoader.setPath(basePath);
mtlLoader.load('model.mtl', (materials) => {
  
  // 2. Load textures
  mtlLoader.loadTextures(materials, (materialsWithTextures) => {
    
    // 3. Load OBJ with materials
    objLoader.setPath(basePath);
    objLoader.setMaterials(materialsWithTextures);
    
    objLoader.load('model.obj', (result) => {
      
      // 4. Center and scale model
      const bbox = objLoader.computeBoundingBox(result.meshes);
      const center = new Vector3(
        (bbox.min.x + bbox.max.x) / 2,
        (bbox.min.y + bbox.max.y) / 2,
        (bbox.min.z + bbox.max.z) / 2
      );
      
      for (const mesh of result.meshes) {
        mesh.position.set(-center.x, -center.y, -center.z);
        scene.add(mesh);
      }
      
      // 5. Add lights for LambertMaterial
      scene.add(new AmbientLight(0xffffff, 0.5));
      const dirLight = new DirectionalLight(0xffffff, 0.8);
      dirLight.position.set(10, 10, 5);
      scene.add(dirLight);
    });
  });
});
```

---

### GLTFLoader

Loads glTF 2.0 and GLB (binary glTF) 3D model files. Supports geometry, PBR materials, animations, cameras, and multi-scene files.

**Constructor:**
```javascript
new GLTFLoader()
```

**Properties:**
- `path` - Base path for resolving relative URIs (auto-set from load URL)
- `resourcePath` - Resource path for textures/buffers (defaults to `path`)

**Methods:**
- `async load(url)` - Load a glTF or GLB file. Returns a Promise resolving to the result object.

**Result Object Structure:**
```javascript
{
  scene: Scene,           // Default scene (first scene or constructed)
  scenes: [Scene, ...],   // All scenes defined in file
  animations: [           // AnimationClip array
    AnimationClip {
      name: 'Walk',
      duration: 1.5,
      tracks: [VectorKeyframeTrack, QuaternionKeyframeTrack, ...]
    }
  ],
  cameras: [Camera, ...], // Cameras defined in file
  asset: {                // Asset metadata from file
    version: '2.0',
    generator: '...',
    ...
  }
}
```

**Supported glTF Features:**
- **Geometry:** Positions, normals, UVs, indices, tangents, skinning weights/joints
- **Materials:** PBR metallic/roughness workflow (base color, metallic, roughness, normal, occlusion, emissive)
- **Textures:** Embedded (base64) and external URI references
- **Animations:** Translation, rotation, scale keyframe tracks
- **Cameras:** Perspective cameras with fov, aspect, near, far
- **Scenes:** Multiple scene support
- **Nodes:** Full node hierarchy with transforms (translation, rotation, scale, matrix)
- **Skins:** Skeleton/bone hierarchies for skinned meshes
- **GLB:** Binary container format with embedded buffers

**Example - Basic Loading:**
```javascript
import { GLTFLoader } from './src/index.js';

const loader = new GLTFLoader();
const gltf = await loader.load('models/character.glb');

// Add loaded scene to your scene
scene.add(gltf.scene);

// Play animations if present
if (gltf.animations.length > 0) {
  const mixer = new AnimationMixer(gltf.scene);
  const action = mixer.clipAction(gltf.animations[0]);
  action.play();
}
```

**Example - With Cameras:**
```javascript
const gltf = await loader.load('models/scene.gltf');
scene.add(gltf.scene);

// Use camera from file if available
const camera = gltf.cameras.length > 0
  ? gltf.cameras[0]
  : new PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 100);
```

---

## Extras & Utilities Classes

### Raycaster

Ray casting for object picking and 3D mouse interaction. Converts 2D screen coordinates to 3D rays and tests intersections with scene geometry.

**Constructor:**
```javascript
new Raycaster()
```

**Properties:**
- `ray` - Ray object with `origin` (Vector3) and `direction` (Vector3)
- `near` - Near clipping distance (default: 0)
- `far` - Far clipping distance (default: Infinity)

**Methods:**
- `setFromCamera(coords, camera)` - Set ray from camera and normalized device coordinates
  - `coords` - Vector2 with normalized coordinates (-1 to 1 for both X and Y)
  - `camera` - Camera to cast ray from
- `intersectObjects(objects, recursive)` - Test ray intersection with array of objects
  - `objects` - Array of Object3D to test
  - `recursive` - Whether to test children recursively (default: false)
  - Returns: Array of intersection objects sorted by distance (closest first)
- `intersectObject(object, recursive)` - Test ray intersection with single object
  - Returns: Array of intersection objects

**Intersection Object Format:**
```javascript
{
  distance: 5.23,           // Distance from ray origin to intersection
  point: Vector3,           // World-space intersection point
  object: Mesh,             // The intersected mesh
  face: { a: 0, b: 1, c: 2 } // Triangle face indices
}
```

**Algorithm:**
- Uses Möller–Trumbore ray-triangle intersection
- Transforms ray to object local space for accurate testing
- Tests all triangles in geometry
- Returns closest intersection per object

**Example - Basic Picking:**
```javascript
import { Raycaster, Vector2 } from './src/index.js';

const raycaster = new Raycaster();
const mouse = new Vector2();

function onMouseClick(event) {
  // Convert screen coordinates to normalized device coordinates
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  // Cast ray from camera through mouse position
  raycaster.setFromCamera(mouse, camera);
  
  // Test intersection with objects
  const intersects = raycaster.intersectObjects(scene.children, true);
  
  if (intersects.length > 0) {
    const firstHit = intersects[0];
    console.log('Clicked object:', firstHit.object.name);
    console.log('Distance:', firstHit.distance);
    console.log('Point:', firstHit.point);
  }
}

canvas.addEventListener('click', onMouseClick);
```

**Example - Object Selection:**
```javascript
let selectedObject = null;

function onMouseClick(event) {
  const rect = canvas.getBoundingClientRect();
  const mouse = new Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(pickableObjects, false);
  
  // Deselect previous
  if (selectedObject) {
    selectedObject.material.color.setHex(selectedObject.userData.originalColor);
  }
  
  // Select new object
  if (intersects.length > 0) {
    selectedObject = intersects[0].object;
    selectedObject.userData.originalColor = selectedObject.material.color.getHex();
    selectedObject.material.color.setHex(0xffff00); // Highlight
  } else {
    selectedObject = null;
  }
}
```

**Example - Hover Effects:**
```javascript
let hoveredObject = null;

function onMouseMove(event) {
  const rect = canvas.getBoundingClientRect();
  const mouse = new Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);
  
  // Clear previous hover
  if (hoveredObject) {
    canvas.style.cursor = 'default';
    hoveredObject = null;
  }
  
  // Apply new hover
  if (intersects.length > 0) {
    hoveredObject = intersects[0].object;
    canvas.style.cursor = 'pointer';
  }
}

canvas.addEventListener('mousemove', onMouseMove);
```

**Performance Tips:**
- Limit the array passed to `intersectObjects()` to only pickable objects
- Use `recursive: false` if you don't need to test children
- Consider using bounding boxes for early rejection (future feature)
- Cache raycaster and mouse vector instances (don't recreate each frame)

---

### OrbitControls

Interactive camera controls for orbiting, panning, and zooming around a target point. Provides standard 3D viewport navigation.

**Constructor:**
```javascript
new OrbitControls(camera, domElement)
```

**Parameters:**
- `camera` - Camera to control (PerspectiveCamera or OrthographicCamera)
- `domElement` - DOM element to attach mouse/touch listeners (typically canvas)

**Properties:**
- `enabled` - Enable/disable controls (default: true)
- `target` - Vector3 target point to orbit around (default: origin)
- `minDistance` - Minimum zoom distance (default: 0)
- `maxDistance` - Maximum zoom distance (default: Infinity)
- `minPolarAngle` - Minimum vertical angle in radians (default: 0)
- `maxPolarAngle` - Maximum vertical angle in radians (default: Math.PI)
- `minAzimuthAngle` - Minimum horizontal angle (default: -Infinity)
- `maxAzimuthAngle` - Maximum horizontal angle (default: Infinity)
- `enableDamping` - Smooth camera movement (default: false)
- `dampingFactor` - Damping inertia (default: 0.05)
- `enableRotate` - Enable rotation (default: true)
- `rotateSpeed` - Rotation speed multiplier (default: 1.0)
- `enableZoom` - Enable zooming (default: true)
- `zoomSpeed` - Zoom speed multiplier (default: 1.0)
- `enablePan` - Enable panning (default: true)
- `panSpeed` - Pan speed multiplier (default: 1.0)

**Methods:**
- `update()` - Update controls (call in animation loop if enableDamping is true)
- `dispose()` - Remove event listeners and free resources
- `reset()` - Reset camera to initial position
- `saveState()` - Save current camera state
- `getPolarAngle()` - Get current vertical angle
- `getAzimuthalAngle()` - Get current horizontal angle
- `getDistance()` - Get distance from target

**Default Mouse Controls:**
- **Left Mouse Drag**: Rotate camera around target
- **Right Mouse Drag**: Pan camera
- **Middle Mouse Drag**: Zoom in/out (alternative)
- **Mouse Wheel**: Zoom in/out (primary)

**Example - Basic Setup:**
```javascript
import { OrbitControls } from './src/index.js';

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

function animate() {
  controls.update(); // Required if enableDamping is true
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
```

**Example - Constrained Orbiting:**
```javascript
const controls = new OrbitControls(camera, canvas);

// Prevent camera from going below ground
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI / 2; // 90 degrees

// Limit zoom range
controls.minDistance = 5;
controls.maxDistance = 50;

// Limit horizontal rotation
controls.minAzimuthAngle = -Math.PI / 4; // -45 degrees
controls.maxAzimuthAngle = Math.PI / 4;  // +45 degrees
```

**Example - Disable Specific Features:**
```javascript
const controls = new OrbitControls(camera, canvas);

// Disable panning (rotation and zoom only)
controls.enablePan = false;

// Disable rotation (pan and zoom only)
controls.enableRotate = false;

// Disable zoom (rotation and pan only)
controls.enableZoom = false;
```

**Example - Change Target Point:**
```javascript
// Orbit around object
controls.target.copy(mesh.position);

// Smoothly move to new target
controls.target.lerp(newTargetPosition, 0.1);
```

**Example - Custom Speed Settings:**
```javascript
const controls = new OrbitControls(camera, canvas);

// Faster rotation
controls.rotateSpeed = 2.0;

// Slower zoom
controls.zoomSpeed = 0.5;

// Faster pan
controls.panSpeed = 1.5;
```

**Cleanup:**
```javascript
// When switching scenes or disposing renderer
controls.dispose();
```

---

### GridOverlay

Blender-style infinite reference grid for viewport orientation. Renders a procedural grid with colored world axes and horizon fade.

**Constructor:**
```javascript
new GridOverlay(options = {})
```

**Options (object):**
- `size` - Grid plane size (default: 1000)
- `yPosition` - Y position of grid plane (default: 0.0)
- `gridScale` - Grid spacing in world units (default: 1.0)
- `gridOpacity` - Overall opacity 0-1 (default: 0.8)
- `fadeDistance` - Distance at which grid fades out (default: 100.0)
- `adaptive` - Adaptive grid density based on camera distance (default: false)
- `gridAlpha` - Grid line visibility boost (default: 0.65)
- `gridColor` - Grid line color as {r, g, b} (default: {r: 0.5, g: 0.5, b: 0.5})
- `axisXColor` - X-axis line color (default: {r: 1.0, g: 0.2, b: 0.2}) - Red
- `axisZColor` - Z-axis line color (default: {r: 0.2, g: 1.0, b: 0.2}) - Green
- `horizonColor` - Horizon fade color (default: {r: 0.5, g: 0.5, b: 0.5})

**Properties:**
- `mesh` - Internal Mesh object
- `visible` - Visibility flag

**Methods:**
- `addToScene(scene)` - Add grid to scene
- `removeFromScene(scene)` - Remove grid from scene
- `setVisible(visible)` - Show/hide grid
- `setOpacity(opacity)` - Set overall opacity 0-1
- `setScale(scale)` - Set grid spacing
- `setGridAlpha(alpha)` - Set grid line visibility boost
- `setGridColor(r, g, b)` - Set grid line color (0-1 RGB values)

**Features:**
- Shader-based rendering for both CPU and GPU backends
- Procedural grid generation (no geometry overhead)
- Smooth horizon fade
- Colored world axes (red X, green Z)
- Origin indicator at (0, 0, 0)
- Distance-based fade for infinite feel
- Optional adaptive grid density

**Example - Basic Grid:**
```javascript
import { GridOverlay } from './src/index.js';

const gridOverlay = new GridOverlay({
  yPosition: 0.0,
  gridScale: 1.0,
  gridOpacity: 1.0,
  fadeDistance: 100.0
});
gridOverlay.addToScene(scene);
```

**Example - Custom Colors:**
```javascript
const gridOverlay = new GridOverlay({
  yPosition: 0.0,
  gridColor: { r: 0.529, g: 0.529, b: 0.529 },  // RGB(135, 135, 135)
  axisXColor: { r: 1.0, g: 0.2, b: 0.2 },       // Red X axis
  axisZColor: { r: 0.2, g: 1.0, b: 0.2 },       // Green Z axis
  horizonColor: { r: 0.314, g: 0.314, b: 0.314 } // Match background
});
gridOverlay.addToScene(scene);
```

**Example - Interactive Controls:**
```javascript
// Toggle visibility
document.getElementById('btnToggleGrid').addEventListener('click', () => {
  gridOverlay.visible = !gridOverlay.visible;
  gridOverlay.setVisible(gridOverlay.visible);
});

// Adjust opacity
document.getElementById('gridOpacity').addEventListener('input', (e) => {
  const opacity = parseInt(e.target.value) / 100;
  gridOverlay.setOpacity(opacity);
});

// Change grid color
document.getElementById('gridColor').addEventListener('input', (e) => {
  const hex = e.target.value;
  const r = parseInt(hex.substr(1, 2), 16) / 255;
  const g = parseInt(hex.substr(3, 2), 16) / 255;
  const b = parseInt(hex.substr(5, 2), 16) / 255;
  gridOverlay.setGridColor(r, g, b);
});
```

**Example - Match Background:**
```javascript
// Set horizon color to blend with scene background
const bgColor = scene.background; // Color instance
const gridOverlay = new GridOverlay({
  yPosition: 0.0,
  horizonColor: { r: bgColor.r, g: bgColor.g, b: bgColor.b }
});
```

**Axis Convention:**
- **Red line**: X axis (left-right, typically "width")
- **Green line**: Z axis (forward-back, typically "depth")
- **Y axis**: Vertical (up-down, typically "height") - not drawn on grid

**Performance:**
- Minimal geometry overhead (single large plane)
- Shader-based grid rendering (procedural)
- Works efficiently on both CPU and GPU backends
- No performance impact from grid spacing changes

---

## Common Patterns

### Basic Scene Setup

```javascript
import {
  Scene, Mesh, BoxGeometry, BasicMaterial,
  PerspectiveCamera, BangBangRenderer
} from './src/index.js';

const canvas = document.getElementById('canvas');
const renderer = new BangBangRenderer({
  canvas: canvas,
  width: window.innerWidth,
  height: window.innerHeight
});

const scene = new Scene();
const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

const geometry = new BoxGeometry(1, 1, 1);
const material = new BasicMaterial({ color: 0xff0000 });
const cube = new Mesh(geometry, material);
scene.add(cube);

function animate() {
  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
```

---

### Scene with Lighting

```javascript
import {
  Scene, Mesh, SphereGeometry, LambertMaterial,
  PerspectiveCamera, BangBangRenderer,
  AmbientLight, DirectionalLight, Vector3
} from './src/index.js';

const scene = new Scene();

// Add ambient light
const ambient = new AmbientLight(0xffffff, 0.4);
scene.add(ambient);

// Add directional light (sun)
const sun = new DirectionalLight(0xffffff, 0.8);
sun.position.set(10, 10, 5);
sun.target = new Vector3(0, 0, 0);
scene.add(sun);

// Create objects with Lambert material (reacts to light)
const sphere = new Mesh(
  new SphereGeometry(1, 32, 24),
  new LambertMaterial({ color: 0xcccccc })
);
scene.add(sphere);
```

---

### Textured Objects

```javascript
import { TextureLoader } from './src/index.js';

const textureLoader = new TextureLoader();
const texture = textureLoader.createCheckerTexture(256, 8);

const material = new BasicMaterial({
  color: 0xffffff,  // White tint
  map: texture
});

const mesh = new Mesh(geometry, material);
```

---

### Object Hierarchy

```javascript
// Create parent-child relationships
const solarSystem = new Object3D();

const earth = new Mesh(new SphereGeometry(1), material);
earth.position.x = 10;
solarSystem.add(earth);

const moon = new Mesh(new SphereGeometry(0.3), material);
moon.position.x = 2;
earth.add(moon);  // Moon orbits Earth

scene.add(solarSystem);

// In animation loop:
solarSystem.rotation.y += 0.001;  // Solar system rotates
earth.rotation.y += 0.01;          // Earth rotates
// Moon automatically orbits Earth due to hierarchy
```

---

### Multiple Geometries

```javascript
const geometries = [
  new TetrahedronGeometry(1),
  new BoxGeometry(1, 1, 1),
  new OctahedronGeometry(1),
  new IcosahedronGeometry(1),
  new DodecahedronGeometry(1),
  new SphereGeometry(1, 32, 24)
];

geometries.forEach((geo, i) => {
  const mesh = new Mesh(geo, material);
  mesh.position.x = (i - 2.5) * 2.5;
  scene.add(mesh);
});
```

---

### Object Picking and Selection

Use Raycaster for interactive object selection and manipulation.

```javascript
import { Raycaster, Vector2, Vector3, OrbitControls } from './src/index.js';

const raycaster = new Raycaster();
const mouse = new Vector2();
let selectedObject = null;
let controls = new OrbitControls(camera, canvas); // Orbit controls instance

// Convert mouse coordinates to normalized device coordinates (-1 to 1)
function getMouseCoords(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return new Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
}

// Handle object selection on click
function onMouseClick(event) {
  mouse.copy(getMouseCoords(event, canvas));
  raycaster.setFromCamera(mouse, camera);
  
  // Test only clickable objects
  const intersects = raycaster.intersectObjects(pickableObjects, false);
  
  // Deselect previous object
  if (selectedObject) {
    selectedObject.material.color.setHex(selectedObject.userData.originalColor);
  }
  
  // Select new object
  if (intersects.length > 0) {
    selectedObject = intersects[0].object;
    // Store original color
    selectedObject.userData.originalColor = selectedObject.material.color.getHex();
    // Highlight selection
    selectedObject.material.color.setHex(0xffff00); // Yellow
  } else {
    selectedObject = null;
  }
}

canvas.addEventListener('click', onMouseClick);
```

**With Constrained Dragging:**
```javascript
let isDragging = false;
let dragStartPos = new Vector2();
let dragStartObjPos = new Vector3();

function onMouseDown(event) {
  if (event.button !== 0) return; // Left click only
  
  mouse.copy(getMouseCoords(event, canvas));
  raycaster.setFromCamera(mouse, camera);
  
  const intersects = raycaster.intersectObjects(pickableObjects, false);
  
  // Start drag if clicking on selected object
  if (intersects.length > 0 && intersects[0].object === selectedObject) {
    isDragging = true;
    dragStartPos.copy(mouse);
    dragStartObjPos.copy(selectedObject.position);
    controls.enabled = false; // Disable orbit during drag
  }
}

function onMouseMove(event) {
  if (!isDragging || !selectedObject) return;
  
  mouse.copy(getMouseCoords(event, canvas));
  const deltaX = mouse.x - dragStartPos.x;
  const deltaY = mouse.y - dragStartPos.y;
  
  // Convert screen-space delta to world-space movement
  const distance = camera.position.distanceTo(selectedObject.position);
  const fov = camera.fov * Math.PI / 180;
  const scale = 2 * Math.tan(fov / 2) * distance;
  
  // Get camera right and up vectors from world matrix
  const right = new Vector3(
    camera.matrixWorld.elements[0],
    camera.matrixWorld.elements[1],
    camera.matrixWorld.elements[2]
  );
  const up = new Vector3(
    camera.matrixWorld.elements[4],
    camera.matrixWorld.elements[5],
    camera.matrixWorld.elements[6]
  );
  
  if (event.ctrlKey) {
    // Ctrl held: move along Z axis (depth)
    const forward = new Vector3(
      camera.matrixWorld.elements[8],
      camera.matrixWorld.elements[9],
      camera.matrixWorld.elements[10]
    );
    selectedObject.position.copy(dragStartObjPos);
    selectedObject.position.add(forward.multiplyScalar(deltaY * scale));
  } else {
    // Default: move in XY plane relative to camera
    selectedObject.position.copy(dragStartObjPos);
    selectedObject.position.add(right.multiplyScalar(deltaX * scale));
    selectedObject.position.add(up.multiplyScalar(deltaY * scale));
  }
}

function onMouseUp() {
  if (isDragging) {
    controls.enabled = true; // Re-enable orbit controls
  }
  isDragging = false;
}

canvas.addEventListener('mousedown', onMouseDown);
canvas.addEventListener('mousemove', onMouseMove);
canvas.addEventListener('mouseup', onMouseUp);
```

**Hover Effects:**
```javascript
let hoveredObject = null;

function onMouseMove(event) {
  mouse.copy(getMouseCoords(event, canvas));
  raycaster.setFromCamera(mouse, camera);
  
  const intersects = raycaster.intersectObjects(hoverableObjects, false);
  
  // Clear previous hover
  if (hoveredObject) {
    canvas.style.cursor = 'default';
  }
  
  // Apply new hover
  if (intersects.length > 0) {
    hoveredObject = intersects[0].object;
    canvas.style.cursor = 'pointer';
  } else {
    hoveredObject = null;
  }
}

canvas.addEventListener('mousemove', onMouseMove);
```

---

### Performance Optimization

```javascript
// 1. Lower resolution
const renderer = new BangBangRenderer({
  canvas: canvas,
  width: 800,
  height: 600,
  pixelRatio: 0.5  // Half resolution
});

// 2. Reduce polygon count
const lowPolySphere = new SphereGeometry(1, 8, 6);  // 96 triangles

// 3. Use unlit materials when possible
const material = new BasicMaterial({ color: 0xff0000 });  // No lighting calculations

// 4. Cull off-screen objects
object.frustumCulled = true;

// 5. Monitor performance
console.log('Triangles:', geometry.index.count / 3);
const debugInfo = renderer.getDebugInfo();
console.log('Rendered:', debugInfo);
```

---

### Debug Visualization

```javascript
import { DebugMaterial } from './src/index.js';

// Show normals
const normalDebug = new DebugMaterial({ mode: 'normal' });
mesh.material = normalDebug;

// Show UVs
const uvDebug = new DebugMaterial({ mode: 'uv' });

// Show depth
const depthDebug = new DebugMaterial({ mode: 'depth' });
```

---

### Backend-Agnostic Render Statistics

Different backends expose render statistics in different ways. Use this pattern for backend-agnostic stat access:

```javascript
// Helper function to get render stats (works for both CPU and GPU backends)
function getRenderStats() {
  if (renderer.backendType === 'cpu' && renderer._backend && renderer._backend.pipeline) {
    // CPU backend has detailed pipeline stats
    const stats = renderer._backend.pipeline.stats;
    return {
      trianglesRendered: stats.trianglesRendered || 0,
      trianglesSubmitted: stats.trianglesSubmitted || 0,
      trianglesClipped: stats.trianglesClippedNear || 0,
      trianglesCulled: stats.trianglesCulled || 0
    };
  } else {
    // GPU backend has simpler info
    const info = renderer.info.render;
    return {
      trianglesRendered: info.triangles || 0,
      trianglesSubmitted: info.triangles || 0,
      trianglesClipped: 0,
      trianglesCulled: 0
    };
  }
}

// Helper function to reset stats (if supported by backend)
function resetRenderStats() {
  if (renderer.backendType === 'cpu' && renderer._backend && renderer._backend.pipeline) {
    renderer._backend.pipeline.stats.reset();
  }
  // GPU backends reset automatically each frame
}

// Usage in animation loop:
function animate() {
  // Reset stats at start of frame (CPU only, GPU auto-resets)
  resetRenderStats();
  
  // Render scene
  renderer.render(scene, camera);
  
  // Display stats
  const stats = getRenderStats();
  console.log(`Triangles: ${stats.trianglesRendered}`);
  
  requestAnimationFrame(animate);
}
```

**Backend Differences:**
- **CPU Backend**: Detailed stats via `renderer._backend.pipeline.stats`
  - `trianglesSubmitted` - Total triangles sent to pipeline
  - `trianglesClippedNear` - Triangles clipped to near plane
  - `trianglesCulled` - Triangles culled (backface, frustum)
  - `trianglesRendered` - Triangles actually rasterized
- **GPU Backend**: Simple stats via `renderer.info.render`
  - `triangles` - Total triangles rendered
  - GPU handles clipping/culling internally

---

## Performance Guidelines

### Triangle Budgets

**CPU Backend** (software rasterization):

| Target FPS | Max Triangles | Recommended Geometry |
|------------|---------------|----------------------|
| 60 FPS | < 2,000 | Low-poly models |
| 30 FPS | < 5,000 | Medium detail |
| 15 FPS | < 10,000 | High detail |

**GPU Backend** (WebGPU/WebGL2):

| Target FPS | Max Triangles | Recommended Geometry |
|------------|---------------|----------------------|
| 60 FPS | < 200,000 | High detail scenes |
| 30 FPS | < 500,000 | Very high detail |
| 15 FPS | < 1,000,000 | Extreme detail |

*Note: GPU performance varies significantly by hardware. Test on target devices.*

### Sphere Detail Levels

```javascript
// Very low poly (48 tris) - for small/distant objects
new SphereGeometry(1, 6, 4)

// Low poly (240 tris) - good for most uses
new SphereGeometry(1, 16, 12)

**CPU Backend** - Order from fastest to slowest:
1. `BasicMaterial` (no lighting) - **Fastest**
2. `LambertMaterial` (diffuse only) - Moderate

**GPU Backend** - Order from fastest to slowest:
1. `BasicMaterial` (no lighting) - **Fastest**
2. `LambertMaterial` (diffuse only) - Fast (GPU-optimized)
3. `PBRMaterial` (physically-based) - Moderate (more complex shaders)

*Note: GPU backend handles lighting calculations much more efficiently than CPU.* expensive
new SphereGeometry(1, 64, 48)

// Alternative: Use IcosahedronGeometry (20 tris) for small spheres
new IcosahedronGeometry(1)
```

### Material Performance

Order from fastest to slowest:
1. `BasicMaterial` (no lighting, unlit) - **Fastest**
2. `LambertMaterial` (diffuse lighting only) - Moderate
3. `PBRMaterial` (full Cook-Torrance BRDF) - Most expensive
   - Cost increases with: normal maps, IBL/environment maps, clearcoat, sheen
4. `DebugMaterial` (diagnostic overlay) - Low cost

---

## Best Practices

1. **Always await GPU backend initialization:**
   ```javascript
   const renderer = new BangBangRenderer({
     canvas: canvas,
     backend: 'auto'
   });
   await renderer.initialize();
   
   // Now safe to render
   await renderer.render(scene, camera);
   ```

2. **Always update projection matrix after camera changes:**
   ```javascript
   camera.aspect = newAspect;
   camera.updateProjectionMatrix();
   ```

3. **Check backend capabilities before using features:**
   ```javascript
   if (renderer.capabilities.supportsPBR) {
     mesh.material = new PBRMaterial({ metallic: 0.9, roughness: 0.2 });
   } else {
     mesh.material = new LambertMaterial({ color: 0xff0000 });
   }
   ```

4. **Reuse geometries and materials:**
   ```javascript
   const sharedGeo = new SphereGeometry(1, 16, 12);
   const sharedMat = new BasicMaterial({ color: 0xff0000 });
   
   for (let i = 0; i < 100; i++) {
     const mesh = new Mesh(sharedGeo, sharedMat);
     scene.add(mesh);
   }
   ```

5. **Use appropriate geometry detail:**
   - Small/distant objects: Low poly
   - Large/close objects: High poly
   - Consider Platonic solids for small objects
   - GPU backend can handle 100x more triangles than CPU

6. **Lighting is expensive (especially on CPU backend):**
   - Minimize number of lights
   - Use BasicMaterial when lighting not needed
   - Prefer directional lights (cheapest)
   - GPU backend handles lighting much more efficiently

7. **Transparency best practices:**
   - Always set `transparent: true` when `opacity < 1.0`
   - Set `depthWrite: false` for glass-like materials
   - Be aware transparent objects require sorting overhead

8. **Update matrices only when needed:**
   ```javascript
   object.matrixAutoUpdate = false;  // Manual control
   object.updateMatrix();            // Update when changed
   ```

9. **Use 'auto' backend for production:**
   ```javascript
   const renderer = new BangBangRenderer({
     canvas: canvas,
     backend: 'auto'  // GPU with CPU fallback
   });
   ```

---

## Shadow System (Phase 5)

BangBang3D supports real-time shadow mapping for DirectionalLight and SpotLight on GPU backends (WebGPU and WebGL2). PointLight shadows are planned for a future phase.

### Enabling Shadows

Shadows require three steps: enable on the renderer, enable on shadow-casting lights, and (optionally) configure shadow map quality.

```javascript
// 1. Enable shadows on the renderer
renderer.shadows = {
  enabled: true,
  type: 'pcf',           // 'hard' or 'pcf' (percentage-closer filtering)
  maxShadowLights: 2     // Max simultaneous shadow-casting lights
};

// 2. Enable shadow casting on lights
const sun = new DirectionalLight(0xffffff, 1.0);
sun.position.set(10, 15, 10);
sun.castShadow = true;

// 3. Configure shadow quality
sun.shadow.mapSize = { width: 2048, height: 2048 };
sun.shadow.bias = 0.0005;
sun.shadow.normalBias = 0.02;
sun.shadow.frustumSize = 20;  // DirectionalLight only

// Initialize the shadow camera (required before first render)
sun.initShadowCamera();
scene.add(sun);
```

### Shadow Configuration

**Renderer Shadow Settings (`renderer.shadows`):**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | boolean | `false` | Master shadow toggle |
| `type` | string | `'hard'` | Shadow type: `'hard'` or `'pcf'` |
| `maxShadowLights` | number | `2` | Max shadow-casting lights |

**Per-Light Shadow Settings (`light.shadow`):**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `mapSize.width` | number | `1024` | Shadow map width in pixels |
| `mapSize.height` | number | `1024` | Shadow map height in pixels |
| `bias` | number | `0.0005` | Depth bias to reduce shadow acne |
| `normalBias` | number | `0.0` | Normal-direction bias |
| `radius` | number | `1.0` | PCF filter radius (soft shadows) |
| `frustumSize` | number | `10` | Orthographic extent (DirectionalLight only) |

### Shadow Light Support

| Light Type | Shadow Support | Shadow Camera | Notes |
|-----------|---------------|---------------|-------|
| DirectionalLight | Yes | Orthographic | Uses `frustumSize` for bounds |
| SpotLight | Yes | Perspective | Uses light `angle` and `distance` |
| PointLight | Not yet | — | `castShadow` property exists, backend not wired |
| HemisphereLight | No | — | Ambient light, no shadows |
| AmbientLight | No | — | Ambient light, no shadows |

### Shadow Methods on Lights

- `light.initShadowCamera()` - Creates the shadow camera based on light type and shadow config. Must be called after setting shadow parameters and before the first render.
- `light.updateShadowCamera()` - Updates shadow camera position and matrices. Called automatically during render if `castShadow` is true.

### Example - Shadows with DirectionalLight

```javascript
const renderer = new BangBangRenderer({ canvas, backend: 'gpu' });
await renderer.initialize();

renderer.shadows = { enabled: true, type: 'pcf' };

const sun = new DirectionalLight(0xffffff, 1.0);
sun.position.set(5, 10, 7);
sun.castShadow = true;
sun.shadow.mapSize = { width: 2048, height: 2048 };
sun.shadow.bias = 0.0005;
sun.shadow.normalBias = 0.02;
sun.shadow.frustumSize = 15;
sun.initShadowCamera();
scene.add(sun);

await renderer.render(scene, camera);
```

### Example - Shadows with SpotLight

```javascript
const spot = new SpotLight(0xffffff, 1.5, 30, Math.PI / 6, 0.3, 2);
spot.position.set(0, 8, 0);
spot.target.position.set(0, 0, 0);
spot.castShadow = true;
spot.shadow.mapSize = { width: 1024, height: 1024 };
spot.shadow.bias = 0.001;
spot.initShadowCamera();
scene.add(spot);
scene.add(spot.target);
```

---

## Reflections & Image-Based Lighting (Phase 5)

BangBang3D includes an engine-level reflections system with IBL (Image-Based Lighting), reflection probes, and planar reflections.

### How to Get Object-to-Object Reflections (Step-by-Step)

Reflection probes capture a cubemap snapshot of the scene and apply it to nearby PBR materials as environment lighting. This is how you make one object appear "reflected" on the surface of another.

**Prerequisites:**
- **WebGL2 backend** — probe capture only works on WebGL2 (not WebGPU, not CPU)
- **PBR materials** — only `PBRMaterial` supports environment reflections. Objects using `BasicMaterial` or `LambertMaterial` will not show reflections.
- **Metallic + low roughness** — reflections are most visible on metallic surfaces with low roughness. A roughness of 1.0 produces a matte surface with no visible reflection.

**Step-by-step (code):**

```javascript
import {
  Scene, Mesh, SphereGeometry, BoxGeometry, PBRMaterial,
  PerspectiveCamera, BangBangRenderer, ReflectionProbe,
  AmbientLight, DirectionalLight
} from './src/index.js';

// 1. Create renderer with WebGL2 backend
const renderer = new BangBangRenderer({
  canvas: document.getElementById('canvas'),
  width: 800, height: 600,
  backend: 'webgl2'  // REQUIRED for probe capture
});
await renderer.initialize();

const scene = new Scene();
const camera = new PerspectiveCamera(60, 800/600, 0.1, 100);
camera.position.set(0, 3, 6);

// 2. Add lights — probes capture whatever lighting exists in the scene
scene.add(new AmbientLight(0xffffff, 0.3));
const sun = new DirectionalLight(0xffffff, 1.0);
sun.position.set(5, 8, 4);
scene.add(sun);

// 3. Add objects to the scene
//    The RED CUBE is the object we want to see reflected
const cube = new Mesh(
  new BoxGeometry(1, 1, 1),
  new PBRMaterial({ color: 0xff0000, metallic: 0.0, roughness: 0.5 })
);
cube.position.set(-2, 0.5, 0);
scene.add(cube);

//    The CHROME SPHERE is the reflective surface
const sphere = new Mesh(
  new SphereGeometry(1, 32, 32),
  new PBRMaterial({
    color: 0xffffff,
    metallic: 1.0,      // fully metallic = mirror-like
    roughness: 0.05,    // very smooth = sharp reflections
    envMapIntensity: 1.0
  })
);
sphere.position.set(2, 1, 0);
scene.add(sphere);

// 4. Create and register a ReflectionProbe
const probe = new ReflectionProbe({
  resolution: 256,       // higher = sharper but slower capture
  influenceRadius: 50,   // must be large enough to cover your objects!
  updateMode: 'manual'
});
probe.position.set(0, 2, 0);  // place near the center of the scene
scene.add(probe);              // add to scene graph
scene.addReflectionProbe(probe); // register with the scene's probe list

// 5. CAPTURE the probe — this renders 6 cubemap faces + PMREM prefiltering
//    Objects must already be in the scene before capture!
probe.update(renderer, scene);

// 6. Render — the PBR shader will automatically sample the probe's cubemap
function animate() {
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
```

**In the Light Playground:**
1. Switch to **WebGL2** backend (click "Force WebGL2")
2. Add objects (spheres/cubes) to the scene
3. Change at least one object's material to **PBR** with **metallic = 1.0** and **roughness < 0.2**
4. Click **"Add Reflection Probe"** in the Reflections section
5. Click **"Capture Probe"** — this takes a snapshot of the scene
6. The metallic PBR object should now show reflections of surrounding objects

**Common pitfalls:**
- If nothing reflects: check that the material is `PBRMaterial`, not `LambertMaterial`
- If reflections are dark/missing: make sure `metallic` is high (≥ 0.8) and `roughness` is low (≤ 0.3)
- If only some objects reflect: the probe's `influenceRadius` must cover the reflective object's position
- If reflections look stale: re-capture the probe after moving objects
- If capture fails silently: you must be on the WebGL2 backend

**How it works internally:**
1. `probe.update()` calls `backend.captureReflectionProbe()` which renders the scene 6 times (one per cubemap face) from the probe's position
2. The captured cubemap is fed through `PMREMGenerator` to create a prefiltered mipmap chain (rough surfaces sample blurry mips, smooth surfaces sample sharp mips)
3. When drawing each PBR mesh, the renderer picks the nearest probe whose influence radius covers the mesh and binds its cubemap to texture unit 6
4. The PBR shader samples the cubemap using the surface reflection vector and roughness-based LOD

---

### Scene Environment

Set a `CubeTexture` as the scene environment to enable IBL for all PBR materials:

```javascript
import { CubeTexture, CubeTextureLoader, PMREMGenerator } from './src/index.js';

// Load cubemap from 6 face images
const loader = new CubeTextureLoader();
const envMap = await loader.load([
  'px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg'
]);

// Or load from equirectangular panorama
const envMap = await loader.loadEquirectangular('panorama.hdr', 256);

// Assign to scene — all PBR materials will reflect this
scene.environment = envMap;
scene.environmentIntensity = 1.0; // global multiplier
```

The renderer automatically generates a prefiltered mipmap chain (PMREM) and BRDF LUT when `scene.environment` is set. Each roughness level samples the appropriate mip.

### Per-Material Control

PBRMaterial respects per-material environment intensity:

```javascript
const material = new PBRMaterial({
  metallic: 1.0,
  roughness: 0.1,
  envMapIntensity: 1.5  // multiplied with scene.environmentIntensity
});
```

Set `envMapIntensity: 0` to disable reflections on a specific material.

### CubeTexture

6-face cubemap texture with optional equirectangular conversion:

```javascript
const cube = new CubeTexture();
cube.setImages([px, nx, py, ny, pz, nz]); // HTMLImageElement or HTMLCanvasElement

// Programmatic: convert equirectangular panorama
cube.setFromEquirectangular(panoramaCanvas, 256);
```

**Properties:**
- `images` - Array of 6 face images (+X, -X, +Y, -Y, +Z, -Z)
- `resolution` - Face resolution in pixels
- `sourceType` - `'cubemap'` or `'equirectangular'`
- `format` - `'rgba8'`

### PMREMGenerator

CPU-based prefiltered environment map and BRDF LUT generation:

```javascript
const pmrem = new PMREMGenerator();
const prefiltered = pmrem.fromCubeTexture(envCube, { mipLevels: 6 });
const brdfLUT = pmrem.generateBRDFLUT(256); // returns HTMLCanvasElement
```

Normally you don't call this directly — the renderer handles it when `scene.environment` is set.

### ReflectionProbe

Captures the scene into a cubemap from the probe's position, providing
localised environment reflections for PBR materials.

```javascript
import { ReflectionProbe } from './src/index.js';

const probe = new ReflectionProbe({
  resolution: 256,         // cubemap face size (default 256)
  influenceRadius: 20,     // world-unit blend radius (default 10)
  updateMode: 'manual',    // 'manual' | 'ondemand'
  nearPlane: 0.1,
  farPlane: 1000
});
probe.position.set(0, 2, 0);
scene.add(probe);
scene.addReflectionProbe(probe);   // register with the scene

// Capture — renders 6 faces, runs PMREM prefiltering, uploads cubemap
probe.update(renderer, scene);
```

**Selection order** — when drawing a PBR mesh the renderer picks:

1. `material.envMap` (per-material override, if set)  
2. Nearest `ReflectionProbe` whose `influenceRadius` covers the mesh  
3. `scene.environment` (global IBL, if set)

**Properties:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `resolution` | number | 256 | Cubemap face resolution (px) |
| `influenceRadius` | number | 10 | Blend radius in world units |
| `updateMode` | string | `'manual'` | `'manual'` or `'ondemand'` |
| `nearPlane` | number | 0.1 | Capture camera near plane |
| `farPlane` | number | 1000 | Capture camera far plane |
| `envMapKey` | string \| null | null | GPU resource key (set after capture) |
| `envMapMaxLod` | number | 0 | Mip levels in prefiltered cubemap |

**Scene integration:**

```javascript
scene.addReflectionProbe(probe);     // register
scene.removeReflectionProbe(probe);  // unregister
scene.reflectionProbes;              // ReflectionProbe[]
```

**Performance notes:**
- Each `update()` renders the scene 6 times + CPU PMREM prefiltering.  
  Call sparingly — e.g. once at scene load, or when geometry changes.
- Default resolution of 256 is a good quality/speed trade-off.
- Requires WebGL2 backend.

**Light-playground demo:**  
The Lighting Playground example (`examples/light-playground/index.html`) includes
"Add Reflection Probe" and "Capture Probe" buttons for interactive testing.

**Reflections-playground demo:**  
The Reflections Playground (`examples/reflections-playground/index.html`) provides a
focused environment for testing IBL, environment maps, and PBR material presets
(chrome, brushed metal, gold, plastic, rubber) with procedural cubemap environments.

### IBL / Reflection Probe Internals & Fixes

The PBR split-sum IBL pipeline uses these texture units:

| Unit | Uniform | Content |
|------|---------|---------|
| `TEXTURE0` | `baseColorTexture` | Material albedo map |
| `TEXTURE6` | `uEnvMap` | Prefiltered env cubemap (probe or scene) |
| `TEXTURE7` | `uBRDFLUT` | BRDF integration LUT (Karis/Lazarov) |
| `TEXTURE8` | `uPlanarReflectionMap` | Planar reflection (if any) |

**Uniforms that control IBL intensity:**

| Uniform | Set By | Purpose |
|---------|--------|---------|
| `uSceneEnvIntensity` | `_setPBRIBLUniformsWebGL2` | Combined `scene.environmentIntensity × material.envMapIntensity` |
| `envMapIntensity` | `_setPBRIBLUniformsWebGL2` | Per-material intensity multiplier (always 1.0 — combined value is in `uSceneEnvIntensity`) |
| `uHasEnvMap` | `_setPBRIBLUniformsWebGL2` | 1 if env cubemap is bound, 0 otherwise |
| `uHasBRDFLUT` | `_setPBRIBLUniformsWebGL2` | 1 if BRDF LUT is bound |

**Critical fixes applied (v5.2):**

1. **`envMapIntensity` uniform was never set** — The GLSL shader declares `uniform float envMapIntensity` and multiplies all IBL output by `envMapIntensity × uSceneEnvIntensity`. However, the uniform location was never cached in `compileWebGL2()` and never set via `gl.uniform1f()`. GLSL defaults unset floats to `0.0`, so the entire IBL contribution was silently zeroed out. Fixed by caching the uniform location in `PBRMaterialShader.js` and setting it to `1.0` in `_setPBRIBLUniformsWebGL2`.

2. **BRDF LUT not generated for probe-only scenarios** — `_ensureIBLResources()` returned early when `scene.environment` was not set, which meant the BRDF LUT was never generated. Reflection probes require the BRDF LUT for correct split-sum approximation. Fixed by moving BRDF LUT generation before the `scene.environment` guard.

3. **`capturedCube._resolution` property mismatch** — `captureReflectionProbe()` set `capturedCube._resolution = res` (private), but `PMREMGenerator.fromCubeTexture()` reads the public `cubeTexture.resolution`. Fixed to `capturedCube.resolution = res`.

**Console verification logs (throttled to 1 per 2 seconds):**
- `[GPUBackend] ReflectionProbe captured (256px, 6 mips)` — probe capture + PMREM succeeded
- `[GPUBackend] PBR mesh bound to ReflectionProbe (key=..., lod=..., weight=...)` — probe selected for a mesh
- `[GPUBackend] IBL resources uploaded (6 mip levels, base 256px)` — scene.environment IBL ready

### PlanarReflection

Mirror-like planar reflection (floors, water):

```javascript
import { PlanarReflection } from './src/index.js';

const mirror = new PlanarReflection({
  plane: { normal: { x: 0, y: 1, z: 0 }, constant: 0 },
  resolution: 512
});
scene.add(mirror);
mirror.update(renderer, scene, camera);
```

### Capability Checking

```javascript
if (renderer.capabilities.supportsReflections) {
  scene.environment = envMap;
}

if (renderer.capabilities.supportsIBL) {
  material.envMapIntensity = 1.0;
}
```

### Backend Support

| Feature | WebGPU | WebGL2 | CPU |
|---------|--------|--------|-----|
| IBL Environment Maps | Yes | Yes | No |
| BRDF LUT | Yes | Yes | No |
| Cubemap Textures | Yes | Yes | No |
| Reflection Probes (capture) | No | **Yes** | No |
| Planar Reflections | Stub | Stub | No |
| Screen-Space Reflections (SSR) | No | **Yes** | No |

---

## Screen-Space Reflections (SSR)

SSR adds real-time view-dependent reflections that update every frame — unlike reflection probes, SSR reflects objects exactly as the camera sees them, with no manual capture step. It works by ray-marching in screen space against the depth buffer.

### Quick Start

```javascript
// Enable SSR (requires WebGL2 backend)
renderer.enableSSR(true);

// Adjust options at runtime
renderer.ssrPass.ssrOptions.stepCount = 96;
renderer.ssrPass.ssrOptions.maxDistance = 40;

// Disable
renderer.enableSSR(false);
```

### How It Works

1. **MRT Forward Pass** — all scene shaders output 3 render targets simultaneously:
   - `COLOR_ATTACHMENT0`: Scene color (RGBA8, same as normal rendering)
   - `COLOR_ATTACHMENT1`: View-space normals encoded as `N * 0.5 + 0.5` (RGBA8)
   - `COLOR_ATTACHMENT2`: Material properties — R=metallic, G=roughness, B=reflectivity (RGBA8)
   - `DEPTH_ATTACHMENT`: Depth texture (DEPTH_COMPONENT24)

2. **SSR Ray-March Pass** — a fullscreen pass that, for each pixel:
   - Reconstructs view-space position from depth
   - Computes reflection direction from the view-space normal
   - Steps along the ray in screen space (linear march + binary refinement)
   - Outputs hit color + confidence factor

3. **Composite Pass** — a second fullscreen pass that blends:
   - SSR reflection (weighted by `confidence × fresnelFactor × (1 - roughness²)`)
   - Fallback to scene color when SSR misses (off-screen, sky, occluded)
   - Supports 5 debug visualization modes

### SSR Options

| Option | Type | Default | Range | Description |
|--------|------|---------|-------|-------------|
| `stepCount` | int | 64 | 16–128 | Linear ray-march steps (more = sharper, slower) |
| `maxDistance` | float | 20 | 1–80 | Max world-space ray distance |
| `thickness` | float | 0.3 | 0.05–2.0 | Depth comparison tolerance |
| `binarySteps` | int | 5 | 1–8 | Binary refinement iterations |
| `roughnessFade` | float | 0.4 | 0.1–1.0 | Roughness above which SSR fades out |
| `minConfidence` | float | 0.1 | 0–0.5 | Minimum confidence to show SSR |
| `jitter` | float | 1.0 | 0–1 | Temporal jitter for ray start (0=off) |
| `debugView` | string | `'final'` | see below | Visualization mode |

### Debug Views

Access via `renderer.ssrPass.ssrOptions.debugView`:

| Value | Shows |
|-------|-------|
| `'final'` | Normal composited output (default) |
| `'ssr-only'` | Raw SSR reflection buffer |
| `'ssr-mask'` | Confidence mask (white = SSR hit, black = miss) |
| `'normals'` | View-space normals (RGB) |
| `'depth'` | Linearized depth (grayscale) |

### Limitations

- **Off-screen geometry** — SSR can only reflect what's visible on screen. Objects behind the camera or outside the frustum won't appear in reflections. Use reflection probes as fallback.
- **LDR sampling** — SSR samples the already-tonemapped scene color. HDR bright highlights may appear clamped in reflections.
- **Single-bounce** — only one level of reflection. A mirror reflecting a mirror won't show recursive reflections.
- **Performance** — fullscreen ray-march with 64+ steps. Reduce `stepCount` or `maxDistance` for lower-end GPUs.
- **WebGL2 only** — not available on WebGPU or CPU backends.

### Fallback Strategy

When SSR fails (ray misses, off-screen, high roughness), the composite shader falls back to the original scene color, which already includes:
1. Reflection probe contributions (if a probe was captured)
2. Scene environment IBL (if `scene.environment` is set)

This means SSR augments the existing reflection pipeline — it doesn't replace it.

### Light-Playground Controls

The `examples/light-playground/index.html` includes an SSR control panel:

- **Enable SSR** — toggles SSR on/off
- **SSR Demo Setup** — one-click preset: adds a ground plane, red cube, chrome sphere, and directional light, then enables SSR
- **Debug View** dropdown — switch between visualization modes
- **Sliders** — Steps, Max Distance, Thickness, Roughness Fade, Confidence Threshold

### MRT Shader Compatibility

All 6 scene-rendering shaders output MRT data:

| Shader | Metallic | Roughness | Reflectivity | Notes |
|--------|----------|-----------|--------------|-------|
| PBRMaterialShader | From material | From material | Schlick F0 | Full SSR support |
| LambertMaterialShader | 0.0 | 1.0 | 0.0 | Non-reflective |
| BasicMaterialShader | 0.0 | 1.0 | 0.0 | Non-reflective |
| GridOverlayShader | 0.0 | 1.0 | 0.0 | Non-reflective |
| DebugMaterialShader | 0.0 | 1.0 | 0.0 | Non-reflective |
| InstancedShader | 0.0 | 1.0 | 0.0 | Non-reflective |

When SSR is disabled (no MRT FBO bound), the extra `layout(location=1/2)` outputs are harmlessly discarded since only `COLOR_ATTACHMENT0` is active on the default framebuffer.

---

## Point Clouds & Gaussian Splats

BangBang3D supports **Point Clouds** and **Gaussian Splats** (3D Gaussian Splatting) as first-class renderable objects. Both extend `Object3D` and integrate into the standard `scene.add()` / `renderer.render()` pipeline.

| Feature | WebGL2 | WebGPU | CPU |
|---------|--------|--------|-----|
| Point Clouds | ✅ | — | — |
| Gaussian Splats | ✅ | — | — |

### PointCloud

`src/core/PointCloud.js` — Renders a set of 3D coloured points using `gl.POINTS` with circular point-sprite clipping.

```javascript
import { PointCloud, PLYLoader } from 'bangbang3d';

// From data arrays
const pc = new PointCloud({ pointSize: 4, sizeMode: 'attenuated', gammaCorrect: true });
pc.setData(
  new Float32Array([x0,y0,z0, x1,y1,z1, ...]),  // positions (3 floats per point)
  new Uint8Array([r0,g0,b0, r1,g1,b1, ...])      // colours   (3 bytes per point)
);
scene.add(pc);

// From a PLY file
const cloud = await PLYLoader.load('model.ply');
scene.add(cloud);
```

**Constructor Options:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `pointSize` | `number` | `2` | Base point size in pixels |
| `sizeMode` | `string` | `'fixed'` | `'fixed'` or `'attenuated'` (perspective-scaled) |
| `blendMode` | `string` | `'none'` | `'none'`, `'alpha'`, or `'additive'` |
| `gammaCorrect` | `boolean` | `true` | Apply sRGB gamma correction |

**Properties:** `positions` (Float32Array), `colors` (Uint8Array), `sizes` (Float32Array|null), `count`, `boundingBox`

**Methods:**
- `setData(positions, colors, sizes?)` — Set per-point data; auto-computes bounding box
- `computeBounds()` — Recompute axis-aligned bounding box
- `dispose()` — Free all data arrays

### GaussianSplatCloud

`src/core/GaussianSplatCloud.js` — Renders 3D Gaussian Splats as oriented screen-space ellipses using instanced quads. Each splat has position, anisotropic scale, quaternion rotation, and RGBA colour with opacity.

```javascript
import { GaussianSplatCloud, SplatLoader } from 'bangbang3d';

// From a .splat file
const splats = await SplatLoader.load('scene.splat');
splats.cutoff = 3.0;
splats.maxSplats = 50000;
scene.add(splats);
```

**Constructor Options:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `maxSplats` | `number` | `Infinity` | Cap on rendered splats |
| `cutoff` | `number` | `3.0` | Gaussian sigma cutoff (quad extent) |
| `blendMode` | `string` | `'premultiplied'` | `'premultiplied'` or `'additive'` |
| `depthTest` | `boolean` | `true` | Enable depth testing |
| `depthWrite` | `boolean` | `false` | Write to depth buffer |
| `resolutionScale` | `number` | `1.0` | Internal resolution multiplier |
| `lodThreshold` | `number` | `0` | Skip splats below this projected size |

**Data Layout:**
- `positions` — `Float32Array`, 3 floats per splat (x, y, z)
- `colors` — `Uint8Array`, 4 bytes per splat (R, G, B, A)
- `scales` — `Float32Array`, 3 floats per splat (sx, sy, sz)
- `rotations` — `Float32Array`, 4 floats per splat (w, x, y, z quaternion)

**Methods:**
- `setData(positions, colors, scales, rotations)` — Set all per-splat data
- `sortByDepth(viewMatrix)` — Back-to-front bucket sort for transparency; stores indices in `_sortedIndices`
- `computeBounds()` — Recompute AABB from positions
- `dispose()` — Free all data arrays

**Sorting:** The engine automatically sorts splats back-to-front each frame using a 65 536-bucket radix sort (for counts > 65 536) or a standard comparison sort for smaller datasets. Re-sorting is skipped when the camera moves less than `_sortThreshold` (default 0.1 units).

### File Loaders

All loaders live in `src/loaders/PointCloudLoaders.js` and are re-exported from the main index.

#### PLYLoader

Loads **Stanford PLY** files (ASCII or `binary_little_endian`). Returns a `PointCloud`.

```javascript
import { PLYLoader } from 'bangbang3d';

// Async from URL
const cloud = await PLYLoader.load('assets/model.ply');

// Synchronous from ArrayBuffer
const cloud = PLYLoader.parse(arrayBuffer);
```

**Supported properties:** `x`, `y`, `z`, `red`, `green`, `blue` (uchar or float), `intensity` (float, mapped to grey).

#### SplatLoader

Loads headerless `.splat` files (32 bytes per record). Returns a `GaussianSplatCloud`.

```javascript
import { SplatLoader } from 'bangbang3d';
const splats = await SplatLoader.load('assets/scene.splat');
```

**Binary record layout (32 bytes):**

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 0 | 12 | 3×float32 | Position (x, y, z) |
| 12 | 12 | 3×float32 | Scale (sx, sy, sz) |
| 24 | 4 | 4×uint8 | Colour (R, G, B, A) |
| 28 | 4 | 4×uint8 | Quaternion (w, x, y, z) encoded as `q * 128 + 128` |

#### XYZRGBLoader

Loads whitespace-separated text files with one point per line: `x y z r g b`. Returns a `PointCloud`.

```javascript
import { XYZRGBLoader } from 'bangbang3d';
const cloud = await XYZRGBLoader.load('assets/model.xyz');
```

Colour values 0–255 are treated as bytes; values 0.0–1.0 are scaled to 0–255.

### Rendering Pipeline Integration

Point clouds and Gaussian splats are collected during `scene.traverseVisible()` alongside meshes and rendered in the WebGL2 path:

1. **Opaque meshes** (front-to-back)
2. **Transparent meshes** (back-to-front)
3. **Point clouds** — blended per `blendMode`, rendered as `gl.POINTS`
4. **Gaussian splats** — sorted back-to-front, instanced quad rendering with premultiplied alpha

Both types output non-reflective values to the SSR G-buffer (MRT locations 1 & 2), so they will not produce screen-space reflections but will render correctly alongside reflective meshes.

**Point cloud rendering:**
- Per-point colour via vertex attributes (Uint8, normalized)
- Point size: fixed or attenuated (`baseSize * canvasHeight / -viewZ`)
- Circular point sprites via fragment `discard` for `dot(coord, coord) > 1`

**Gaussian splat rendering:**
- Per-splat data delivered via 4 × RGBA32F data textures (one texel per splat)
- Sorted indices uploaded each frame as R32F texture
- 3D covariance: $R \cdot S^2 \cdot R^T$ computed from per-splat rotation and scale
- Projected to 2D via Jacobian: $J = \begin{bmatrix} f_x / z & 0 \\ 0 & f_y / z \end{bmatrix}$
- 2D covariance: $\Sigma_{2D} = J \cdot \Sigma_{3D,\text{view}} \cdot J^T$ + low-pass filter (0.3)
- Eigendecomposition of symmetric 2×2 for ellipse axes
- Fragment: $\alpha = \exp(-0.5 \cdot d^2)$ with discard at 0.004

### Performance Notes

- **Sorting cost:** Bucket sort with 65 536 bins runs in O(n) time. For 1M splats, expect ~5–8 ms per sort on desktop. Only re-sorts when camera moves beyond threshold.
- **Data textures:** Splat data is packed into square RGBA32F textures of width $\lceil\sqrt{n}\rceil$. WebGL2 limits texture dimensions to at least 4096 (16M splats max).
- **Max splats:** Set `maxSplats` to limit per-frame draw count. The engine draws `min(count, maxSplats)` splats.
- **GPU memory:** Each splat uses ~80 bytes of GPU texture memory (4 × RGBA32F texels + sorted index).
- **Point clouds** are simpler: two vertex buffers (position + colour) with no sorting overhead.
- **Instanced drawing:** Splats use `drawElementsInstanced` — a single quad (4 vertices, 6 indices) instanced N times.

### Examples

- **`examples/point-cloud-viewer/`** — Load PLY or XYZRGB files, adjust point size, size mode, blend mode, and gamma. Ships with a 2 000-point torus knot sample.
- **`examples/gaussian-splats/`** — Load `.splat` files, toggle between point cloud and Gaussian splat rendering modes, adjust cutoff, max splats, blend mode, and depth settings. Ships with a 500-splat Fibonacci sphere sample.

---

## TypeScript Usage

BangBang3d is written in JavaScript but can be used with TypeScript:

```typescript
import {
  Scene, Mesh, BoxGeometry, BasicMaterial,
  PerspectiveCamera, BangBangRenderer
} from './src/index.js';

const scene: Scene = new Scene();
const camera: PerspectiveCamera = new PerspectiveCamera(75, 1, 0.1, 1000);
const renderer: BangBangRenderer = new BangBangRenderer({
  canvas: document.getElementById('canvas') as HTMLCanvasElement,
  width: 800,
  height: 600
});
```

---

## Further Resources

- [QUICKSTART.md](QUICKSTART.md) - Quick start guide
- [README.md](README.md) - Project overview
- [BangBang3d Specification.md](BangBang3d%20Specification.md) - Complete specifications
- [IMPLEMENTATION.md](IMPLEMENTATION.md) - Technical implementation details
- `examples/` - Working example code

---

### Scene Export/Import (Light Playground)

The Light Playground (`examples/light-playground/`) supports full JSON export and import of scene state including all lights and objects with their properties.

**Export:**
```javascript
// Triggered via the "📥 Export Scene" button
// Downloads a bangbang3d-scene.json file containing:
{
  "version": 1,
  "lights": [
    {
      "type": "point",
      "name": "Point Light 1",
      "enabled": true,
      "position": { "x": 0, "y": 3, "z": 0 },
      "color": 16777215,
      "intensity": 1.5,
      "distance": 20,
      "decay": 2
    }
  ],
  "objects": [
    {
      "name": "Sphere 1",
      "geometryType": "sphere",
      "position": { "x": 0, "y": 1, "z": 0 },
      "rotation": { "x": 0, "y": 0, "z": 0 },
      "scale": { "x": 1, "y": 1, "z": 1 },
      "material": {
        "type": "PBRMaterial",
        "color": 16777215,
        "metallic": 1.0,
        "roughness": 0.1
      }
    }
  ]
}
```

**Import:**
- Click "📤 Import Scene" and select a `.json` file
- The current scene is cleared and all lights/objects are recreated from the JSON
- Material types (Basic, Lambert, PBR, Debug) and their properties are fully restored
- Light-specific properties (angle, penumbra, distance, castShadow, target, groundColor) are restored

---

## Path Tracing (WebGPU)

BangBang3D includes a production-grade progressive path tracer built on WebGPU compute shaders. Unlike the rasterization pipeline (which approximates global illumination via probes and SSR), the path tracer solves the full rendering equation with physically correct light transport — producing ground-truth images with soft shadows, color bleeding, caustics, and multi-bounce reflections.

**Requirements:** WebGPU-capable browser (Chrome 113+, Edge 113+, or Firefox Nightly with WebGPU flag). Falls back gracefully if unavailable.

### Architecture

```
Scene Graph → SceneExport → flat typed arrays
                                ↓
                         BVHBuilder (SAH)
                                ↓
                    PathTracerRenderer uploads to GPU
                                ↓
              integrator.wgsl  (compute shader, per-pixel path tracing)
                                ↓
                denoise.wgsl  (à-trous wavelet denoiser, optional)
                                ↓
                  blit.wgsl   (fullscreen triangle, display to canvas)
```

### Module Layout

| File | Purpose |
|------|---------|
| `src/pathtracer/BVHBuilder.js` | CPU-side SAH BVH builder, flat node array |
| `src/pathtracer/SceneExport.js` | Flattens scene graph into GPU-friendly buffers |
| `src/pathtracer/PathTracerRenderer.js` | GPU orchestrator — pipelines, buffers, dispatch |
| `src/pathtracer/integrator.wgsl` | Core path tracing compute shader |
| `src/pathtracer/denoise.wgsl` | À-trous wavelet denoiser compute shader |
| `src/pathtracer/blit.wgsl` | Fullscreen triangle blit to canvas |

### Quick Start

```javascript
import { Scene, PerspectiveCamera, BangBangRenderer, Mesh, SphereGeometry, PBRMaterial, PathTracerRenderer } from './src/index.js';

const renderer = new BangBangRenderer({ canvas, backend: 'webgpu' });
await renderer.initialize();

// Create path tracer using the WebGPU device
const pathTracer = new PathTracerRenderer(renderer.backend.device, canvas);
await pathTracer.initialize();

// Build your scene (meshes, materials, etc.)
const scene = new Scene();
// ... add meshes ...
scene.traverse(obj => { if (obj.updateMatrixWorld) obj.updateMatrixWorld(true); });

// Export and build BVH
pathTracer.buildScene(scene, camera);

// Render loop — path tracer progressively accumulates samples
function animate() {
  requestAnimationFrame(animate);
  pathTracer.render(camera);
}
animate();
```

### Alternative: Via BangBangRenderer API

```javascript
const renderer = new BangBangRenderer({ canvas, backend: 'webgpu' });
await renderer.initialize();
await renderer.enablePathTracing(true, { maxBounces: 8, denoise: true });

// Build scene data for the path tracer
renderer.pathTracer.buildScene(scene, camera);

// Render loop — automatically delegates to path tracer
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
```

### API Reference

#### `PathTracerRenderer`

| Method | Description |
|--------|-------------|
| `constructor(device, canvas)` | Create with WebGPU device and target canvas |
| `initialize()` | Async — loads shaders, creates pipelines |
| `buildScene(scene, camera)` | Export scene graph, build BVH, upload to GPU |
| `render(camera)` | Dispatch compute + denoise + blit. Accumulates progressively. |
| `setOptions(opts)` | Merge new options. Resets accumulation for rendering-affecting changes. |
| `resetAccumulation()` | Clear accumulated samples and restart |
| `getDebugInfo()` | Returns `{ samples, frames, triangles, bvhNodes, materials, emissiveTris, resolution, deviceLost }` |
| `dispose()` | Destroy all GPU resources |

#### `BVHBuilder`

| Method | Description |
|--------|-------------|
| `static build(positions, triCount, options)` | Build SAH BVH from flat position array. Returns `{ nodes, triIndices, nodeCount }` |

Options: `{ maxLeafSize: 4, sahBuckets: 12 }`

#### `SceneExport`

| Method | Description |
|--------|-------------|
| `static export(scene, camera, options)` | Flatten scene to GPU arrays. Returns `{ positions, normals, uvs, materialIds, materials, emissiveTrisCDF, camera, triCount, materialCount, emissiveCount }` |

### Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `samplesPerFrame` | int | 1 | Samples per pixel per frame (1–8) |
| `maxBounces` | int | 6 | Maximum path bounces (1–16) |
| `russianRouletteDepth` | int | 3 | Bounce depth before Russian roulette kicks in |
| `clampLuminance` | float | 10 | Max luminance per sample (firefly control) |
| `enableNEE` | bool | true | Next Event Estimation (direct light sampling) |
| `enableMIS` | bool | true | Multiple Importance Sampling |
| `denoise` | bool | true | Enable à-trous wavelet denoiser |
| `denoiseStrength` | float | 0.5 | Denoise filter strength |
| `denoiseIterations` | int | 3 | Number of à-trous filter passes |
| `envIntensity` | float | 1.0 | Environment (sky) light intensity |
| `debugMode` | int | 0 | Debug view mode (see below) |
| `resolutionScale` | float | 1.0 | Render at fraction of canvas resolution |
| `paused` | bool | false | Pause accumulation |
| `fixedSeed` | int | 0 | Fixed RNG seed (0 = use frameIndex) |

### Debug Modes

| Value | Mode | Description |
|-------|------|-------------|
| 0 | Beauty | Full path-traced result with tone mapping |
| 1 | Albedo | Base color of hit surfaces |
| 2 | Normals | World-space normals (mapped to RGB) |
| 3 | Depth | Linear depth (white = near, black = far) |
| 4 | Sample Count | Heat map of accumulated samples per pixel |
| 5 | NaN Heatmap | Highlights pixels with NaN/Inf values in red |

### Supported Materials

The path tracer reads `PBRMaterial` properties and packs them into a flat GPU buffer:

| Material Property | Path Tracer Usage |
|-------------------|-------------------|
| `color` (RGB) | Base albedo for diffuse and specular |
| `metallic` | Metallic weight (0=dielectric, 1=metal) |
| `roughness` | GGX microfacet roughness |
| `emissive` (RGB) | Emissive color |
| `emissiveIntensity` | Emissive brightness multiplier |
| `opacity` | Transparency (currently binary in BVH) |
| `ior` | Index of refraction (for Fresnel) |

**Note:** Texture maps are not yet sampled in the path tracer — only flat material properties are used. Normal maps, metallic maps, etc. are planned for future versions.

### Lighting

The path tracer supports:

- **Emissive mesh lights**: Any mesh with `emissive` + `emissiveIntensity > 0` acts as an area light. Power-weighted CDF enables importance sampling.
- **Environment lighting**: Gradient sky (white → blue) scaled by `envIntensity`. Full HDR environment maps planned for future versions.

Traditional scene lights (Directional, Point, Spot) are **not** used by the path tracer — all illumination comes from emissive geometry and environment.

### BVH Acceleration

The BVH (Bounding Volume Hierarchy) is built on the CPU using the Surface Area Heuristic (SAH):

- **12-bucket SAH** sweep on all 3 axes per split
- **Flat node array**: 8 floats per node `[minXYZ, leftOrTriStart, maxXYZ, rightOrTriCount]`
- **Leaf identification**: Bit 31 set in field 7 (`triCount | 0x80000000`)
- **Triangle reordering**: `triIndices` array maps leaf triangle ranges to original triangle indices
- **maxLeafSize**: 4 triangles (default)
- **Validation pass**: Checks bounds containment, index ranges, and leaf triangle sum

### Performance Tuning

| Adjustment | Effect |
|------------|--------|
| `resolutionScale: 0.5` | Render at half resolution — 4× faster convergence |
| `samplesPerFrame: 4` | More samples per frame — faster convergence but lower FPS |
| `maxBounces: 3` | Fewer bounces — faster but less accurate GI |
| `denoise: true` | Perceptually cleaner at low sample counts |
| `clampLuminance: 5` | Aggressive firefly removal (may lose bright highlights) |
| `enableNEE: false` | Disable direct light sampling (slower convergence for difficult lighting) |

### Limitations

- **WebGPU only** — requires `navigator.gpu`. No WebGL2 fallback for path tracing.
- **No texture sampling** — materials use flat properties only (no albedo maps, normal maps, etc.)
- **No spectral rendering** — RGB only
- **No volumetric scattering** — surfaces only
- **No adaptive sampling** — uniform samples per pixel
- **Scene rebuild required** — call `buildScene()` after modifying geometry, materials, or adding/removing meshes
- **No instancing** — each mesh is fully flattened into the triangle buffer
- **Triangle budget** — 2M triangles max (configurable via `SceneExport` options)

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Black screen | No emissive geometry | Add emissive mesh or increase `envIntensity` |
| Fireflies | Bright specular paths | Lower `clampLuminance` (e.g., 5) |
| Slow convergence | Too many bounces / large scene | Reduce `maxBounces`, enable NEE+MIS |
| NaN heatmap shows red | Degenerate geometry or normals | Check mesh normals, avoid zero-area triangles |
| "WebGPU not supported" | Browser lacks WebGPU | Use Chrome 113+ or Edge 113+ |
| Image doesn't update | Paused or device lost | Check `paused` option, check console for device lost |

### Backend Support

| Feature | WebGPU | WebGL2 | CPU |
|---------|--------|--------|-----|
| Path Tracing (compute) | ✅ | ❌ | ❌ |
| Progressive Accumulation | ✅ | ❌ | ❌ |
| BVH Traversal (GPU) | ✅ | ❌ | ❌ |
| À-trous Denoising | ✅ | ❌ | ❌ |
| Rasterization | ✅ | ✅ | ✅ |
| PBR Materials | ✅ | ✅ | ✅ |
| Shadows | ✅ | ✅ | ✅ |
| SSR | ✅ | ✅ | ❌ |

---

**Last Updated:** February 13, 2026  
**Version:** 5.5 (Post-Processing: Per-camera PostFX pipeline, ordered dithering, camera registry, camera helpers)

---

## Post-Processing

### Architecture

BangBang3D provides a per-camera post-processing pipeline built on top of the existing `PostProcessPass`/`PostProcessComposer`/`RenderTarget` infrastructure.

**Key Classes:**
- `PostProcessPass` — Base class for fullscreen shader passes (GLSL + WGSL)
- `PostFXPipeline` — Per-camera pipeline owning an ordered pass list and an off-screen render target
- `DitherPass` — "Classic Mac OS / MacPaint" ordered-dithering pass (extends PostProcessPass)
- `RenderTargetPool` — Manages a cache of RenderTargets keyed by (width, height, format)
- `PostProcessComposer` — Low-level multi-pass chain with ping-pong targets

**Data Flow (WebGL2):**
1. `GPUBackend.render()` detects `camera.postFXPipeline` with active passes
2. Calls `pipeline.ensureTargets(backend, w, h)` to lazy-create FBOs
3. Binds `pipeline.inputTarget` (off-screen FBO) before `_renderWebGL2()`
4. Scene draws opaques → transparents → point clouds → splat clouds → SSR composite — all into the FBO
5. Unbinds FBO, calls `pipeline.execute(backend, null)` to run all passes in order
6. Last pass writes to the canvas (back buffer)

### DitherPass — Retro B/W Ordered Dithering

A true 1-bit black-and-white output using Bayer ordered-dithering matrices (4×4 or 8×8).

**Uniforms:**
| Uniform | Type | Range | Description |
|---------|------|-------|-------------|
| `uDitherStrength` | float | 0–1 | Mix between original colour and dithered B/W |
| `uThresholdBias` | float | −0.5–0.5 | Shifts the black-to-white threshold |
| `uInvert` | float | 0 or 1 | Swap black ↔ white |
| `uMatrixSize` | float | 4 or 8 | Bayer matrix dimension |
| `uViewportOrigin` | vec2 | pixels | Viewport offset for stable per-camera dithering |
| `uResolution` | vec2 | pixels | Output resolution |

**Quick Start:**
```javascript
import { PerspectiveCamera, PostFXPipeline, DitherPass } from 'bangbang3d';

const camera = new PerspectiveCamera(60, aspect, 0.5, 100);

// Option A: Convenience method
camera.setPostFXProfileSync(PostFXPipeline, 'mac_dither', {
  strength: 1.0,   // full dither
  matrixSize: 8,    // 8×8 Bayer
  bias: 0.0,        // no threshold shift
  invert: false     // black on white
});

// Option B: Manual pass creation
import DitherPass from './src/renderer/postprocessing/DitherPass.js';
camera.postFXPipeline = new PostFXPipeline();
const dither = new DitherPass({ strength: 1.0, matrixSize: 8 });
camera.postFXPipeline.addPass(dither);
camera.postFXEnabled = true;

// Runtime parameter adjustment
dither.strength = 0.7;
dither.bias = 0.1;
dither.invert = true;
dither.matrixSize = 4;   // switch to 4×4 Bayer
dither.macPaintPreset();  // reset to full MacPaint look
```

**BangBangRenderer Convenience API:**
```javascript
renderer.enableDither(camera, { strength: 1, matrixSize: 8 });
renderer.disableDither(camera);
const pass = renderer.getDitherPass(camera);
```

### Per-Camera Post-Processing

Each camera can have its own independent PostFX pipeline:

```javascript
// Camera A — no effects
const camA = new PerspectiveCamera(60, aspect, 0.5, 100);

// Camera B — retro dither
const camB = new PerspectiveCamera(60, aspect, 0.5, 100);
camB.setPostFXProfileSync(PostFXPipeline, 'mac_dither', { matrixSize: 8 });

// Render with different cameras — each gets its own postFX
renderer.render(scene, camA);  // normal
renderer.render(scene, camB);  // dithered
```

### CameraHelper

Wireframe frustum visualiser for a camera. Renders near plane, far plane, connecting edges, and an up indicator.

```javascript
import { CameraHelper } from 'bangbang3d';

const helper = new CameraHelper(camera, { color: 0xffaa00 });
scene.add(helper);

// In animate loop:
helper.update();
```

### Multi-Camera Scene Registry

```javascript
scene.addCamera(cam1);
scene.addCamera(cam2);
scene.setActiveCamera(cam1);
scene.removeCamera(cam2);

// scene.cameras — array of registered cameras
// scene.activeCamera — the currently active camera
```

### Backend Support

| Feature | WebGPU | WebGL2 | CPU |
|---------|--------|--------|-----|
| PostFX Pipeline | ✅ | ✅ | ❌ |
| DitherPass | ✅ | ✅ | ❌ |
| Per-Camera PostFX | ✅ | ✅ | ❌ |
| Camera Registry | ✅ | ✅ | ✅ |
| CameraHelper | ✅ | ✅ | ✅ |

### Examples

- **`examples/dither-viewer/`** — Standalone dither demo with controls for strength, bias, matrix size, invert
- **`examples/light-playground/`** — Updated with Camera section in hierarchy, dither toggle, camera demo setup
