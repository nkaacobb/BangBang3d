/**
 * BangBang3d - A complete 3D rendering engine with pluggable backends
 * Public API exports
 * 
 * Phase 1 (Complete): GPU Foundation and Backend Architecture
 * - Backend selection: cpu | gpu | auto
 * - CPU backend: software rasterization (reference, deterministic)
 * - GPU backend: WebGPU/WebGL2 initialization (rendering in Phase 2+)
 * - Capability detection system
 * - Backward compatible with all existing examples
 */

// Math
export { Vector2 } from './math/Vector2.js';
export { Vector3 } from './math/Vector3.js';
export { Vector4 } from './math/Vector4.js';
export { Matrix4 } from './math/Matrix4.js';
export { Quaternion } from './math/Quaternion.js';
export { Euler } from './math/Euler.js';
export { Color } from './math/Color.js';
export { MathUtils } from './math/MathUtils.js';

// Core
export { Object3D } from './core/Object3D.js';
export { Scene } from './core/Scene.js';
export { Mesh } from './core/Mesh.js';
export { Camera } from './core/Camera.js';
export { PerspectiveCamera } from './core/PerspectiveCamera.js';
export { OrthographicCamera } from './core/OrthographicCamera.js';

// Geometry
export { BufferGeometry } from './geometry/BufferGeometry.js';
export { BufferAttribute } from './geometry/BufferAttribute.js';
export { BoxGeometry } from './geometry/BoxGeometry.js';
export { PlaneGeometry } from './geometry/PlaneGeometry.js';
export { SphereGeometry } from './geometry/SphereGeometry.js';
export { ConeGeometry } from './geometry/ConeGeometry.js';
export { TetrahedronGeometry } from './geometry/TetrahedronGeometry.js';
export { OctahedronGeometry } from './geometry/OctahedronGeometry.js';
export { IcosahedronGeometry } from './geometry/IcosahedronGeometry.js';
export { DodecahedronGeometry } from './geometry/DodecahedronGeometry.js';

// Materials
export { Material } from './materials/Material.js';
export { BasicMaterial } from './materials/BasicMaterial.js';
export { LambertMaterial } from './materials/LambertMaterial.js';
export { DebugMaterial } from './materials/DebugMaterial.js';
export { PBRMaterial } from './materials/PBRMaterial.js';

// Lights
export { Light } from './lights/Light.js';
export { AmbientLight } from './lights/AmbientLight.js';
export { DirectionalLight } from './lights/DirectionalLight.js';
export { PointLight } from './lights/PointLight.js';
export { SpotLight } from './lights/SpotLight.js';
export { HemisphereLight } from './lights/HemisphereLight.js';

// Renderer
export { BangBangRenderer } from './renderer/BangBangRenderer.js';
export { FrameBuffer } from './renderer/FrameBuffer.js';
export { DepthBuffer } from './renderer/DepthBuffer.js';
export { Shading } from './renderer/Shading.js';
export { WorkerRenderer } from './renderer/WorkerRenderer.js';

// Resources
export { Texture } from './resources/Texture.js';
export { TextureLoader } from './resources/TextureLoader.js';
export { TextureResolver } from './resources/TextureResolver.js';
export { MaterialSerializer } from './resources/MaterialSerializer.js';
export { MTLLoader } from './resources/MTLLoader.js';
export { OBJLoader } from './resources/OBJLoader.js';
export { CubeTexture } from './resources/CubeTexture.js';
export { CubeTextureLoader } from './resources/CubeTextureLoader.js';

// IBL / Reflections
export { PMREMGenerator } from './renderer/ibl/PMREMGenerator.js';
export { ReflectionProbe } from './renderer/ibl/ReflectionProbe.js';
export { PlanarReflection } from './renderer/ibl/PlanarReflection.js';

// Post-Processing / SSR
export { SSRPass, SSR_DEFAULTS } from './renderer/postprocessing/SSRPass.js';
export { default as DitherPass } from './renderer/postprocessing/DitherPass.js';
export { default as PostFXPipeline } from './renderer/postprocessing/PostFXPipeline.js';
export { default as RenderTargetPool } from './renderer/postprocessing/RenderTargetPool.js';
export { default as PostProcessPass } from './renderer/postprocessing/PostProcessPass.js';
export { default as PostProcessComposer } from './renderer/postprocessing/PostProcessComposer.js';

// Point Clouds & Gaussian Splats
export { PointCloud } from './core/PointCloud.js';
export { GaussianSplatCloud } from './core/GaussianSplatCloud.js';
export { PLYLoader, SplatLoader, XYZRGBLoader } from './loaders/PointCloudLoaders.js';

// Extras
export { OrbitControls } from './extras/controls/OrbitControls.js';
export { Stats } from './extras/utils/Stats.js';
export { GridOverlay, GridOverlayMaterial } from './extras/utils/GridOverlay.js';
export { Raycaster } from './extras/utils/Raycaster.js';

// Light Helpers
export { PointLightHelper } from './extras/helpers/PointLightHelper.js';
export { SpotLightHelper } from './extras/helpers/SpotLightHelper.js';
export { DirectionalLightHelper } from './extras/helpers/DirectionalLightHelper.js';
export { HemisphereLightHelper } from './extras/helpers/HemisphereLightHelper.js';
export { CameraHelper } from './extras/helpers/CameraHelper.js';

// Path Tracing
export { PathTracerRenderer } from './pathtracer/PathTracerRenderer.js';
export { BVHBuilder } from './pathtracer/BVHBuilder.js';
export { SceneExport } from './pathtracer/SceneExport.js';
