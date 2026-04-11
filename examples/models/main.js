/**
 * BangBang3D Model Viewer - OBJ + MTL Loader Example
 * 
 * Demonstrates:
 * - Loading Wavefront OBJ models
 * - Parsing and applying MTL materials
 * - Texture mapping from external files
 * - Auto-centering and scaling models
 * - OrbitControls for camera navigation
 */

import {
  Scene,
  Mesh,
  BoxGeometry,
  BasicMaterial,
  LambertMaterial,
  PerspectiveCamera,
  BangBangRenderer,
  Vector3,
  AmbientLight,
  DirectionalLight,
  TextureLoader,
  OBJLoader,
  MTLLoader
} from '../../src/index.js';

import { OrbitControls } from '../../src/extras/controls/OrbitControls.js';

// ============================================================================
// Available Models Configuration
// ============================================================================

// NOTE: Update this list when adding new models to examples/models/
// Each entry should have obj and mtl filenames (or just obj if no mtl)
const AVAILABLE_MODELS = [
  {
    name: 'Beacon V2',
    obj: 'beacon-v2.obj',
    mtl: 'beacon-v2.mtl',
    description: 'Space beacon model'
  },
  {
    name: 'Enemy Fighter',
    obj: 'enemy_fighter.obj',
    mtl: 'enemy_fighter.mtl',
    description: 'Enemy spacecraft'
  },
  {
    name: 'Fighter V1',
    obj: 'fighterv1.obj',
    mtl: 'fighterv1.mtl',
    description: 'Player fighter ship'
  }
];

const MODELS_PATH = './';

// ============================================================================
// Scene Setup
// ============================================================================

// Helper to get current canvas (it gets replaced on backend switch)
const getCanvas = () => document.getElementById('canvas');

// Global renderer and controls variables
let renderer = null;
let controls = null;

// Initialize renderer with specified backend
async function initRenderer(backendType) {
  // Dispose old renderer if it exists
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  
  // Dispose old controls if they exist
  if (controls) {
    controls.dispose();
    controls = null;
  }
  
  console.log(`Initializing ${backendType} backend...`);
  
  // Important: Replace the canvas element to clear WebGPU context
  const oldCanvas = document.getElementById('canvas');
  const newCanvas = document.createElement('canvas');
  newCanvas.id = 'canvas';
  newCanvas.style.cssText = oldCanvas.style.cssText;
  oldCanvas.parentNode.replaceChild(newCanvas, oldCanvas);
  
  // Get updated canvas reference
  const canvas = document.getElementById('canvas');
  
  // Create renderer with specified backend
  renderer = new BangBangRenderer({
    canvas: canvas,
    width: window.innerWidth,
    height: window.innerHeight,
    pixelRatio: 0.8,
    backend: backendType
  });
  
  // Wait for initialization (GPU is async)
  await renderer.initialize();
  
  renderer.setClearColor(0x1a1a2e);
  
  console.log('Backend initialized:', renderer.backendType);
  
  // Recreate OrbitControls with new canvas
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 2;
  controls.maxDistance = 50;
  
  // Update UI
  document.getElementById('backendInfo').textContent = `Backend: ${renderer.backendType.toUpperCase()}`;
  
  // Update button states
  document.querySelectorAll('.backend-btn').forEach(btn => btn.classList.remove('active'));
  if (backendType === 'cpu') document.getElementById('cpuBtn').classList.add('active');
  else if (backendType === 'gpu') document.getElementById('gpuBtn').classList.add('active');
  else document.getElementById('autoBtn').classList.add('active');
  
  return renderer;
}

const scene = new Scene();

const camera = new PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(5, 5, 5);
camera.lookAt(new Vector3(0, 0, 0));

// OrbitControls will be created in initRenderer()

// ============================================================================
// Lighting
// ============================================================================

const ambientLight = new AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 10, 5);
directionalLight.target = new Vector3(0, 0, 0);
scene.add(directionalLight);

// ============================================================================
// Ground Plane
// ============================================================================

const groundSize = 20;
const groundGeometry = new BoxGeometry(groundSize, 0.2, groundSize);

// Create simple grid texture
const textureLoader = new TextureLoader();
const gridTexture = textureLoader.createProcedural(256, 256, (x, y, w, h) => {
  const gridSize = 16;
  const gx = Math.floor(x / gridSize);
  const gy = Math.floor(y / gridSize);
  const isGrid = ((gx + gy) % 2 === 0);
  const shade = isGrid ? 0.3 : 0.2;
  return { r: shade, g: shade, b: shade, a: 1 };
});

const groundMaterial = new BasicMaterial({ color: 0x404040 });
groundMaterial.map = gridTexture;

const ground = new Mesh(groundGeometry, groundMaterial);
ground.position.y = -0.1;
scene.add(ground);

// ============================================================================
// Model Loading
// ============================================================================

let currentModel = null;
let currentModelMeshes = [];

const objLoader = new OBJLoader();
const mtlLoader = new MTLLoader();

function showLoading(show) {
  document.getElementById('loadingIndicator').style.display = show ? 'block' : 'none';
}

function showError(message) {
  const errorDiv = document.getElementById('errorMessage');
  const errorText = document.getElementById('errorText');
  errorText.textContent = message;
  errorDiv.style.display = 'block';
  
  setTimeout(() => {
    errorDiv.style.display = 'none';
  }, 5000);
}

function clearCurrentModel() {
  // Remove current model meshes from scene
  for (const mesh of currentModelMeshes) {
    scene.remove(mesh);
    
    // Dispose geometry and material resources
    if (mesh.geometry) {
      // BufferGeometry doesn't have dispose in this implementation,
      // but we can clear references
      mesh.geometry = null;
    }
    if (mesh.material) {
      mesh.material = null;
    }
  }
  
  currentModelMeshes = [];
  currentModel = null;
}

function centerAndScaleModel(meshes) {
  if (meshes.length === 0) return;
  
  // Compute bounding box
  const objLoader = new OBJLoader();
  const bbox = objLoader.computeBoundingBox(meshes);
  
  // Calculate center and size
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
  const scale = 3.0 / maxDim; // Target size of 3 units
  
  // Apply centering and scaling to all meshes
  for (const mesh of meshes) {
    // Center
    mesh.position.x = -center.x * scale;
    mesh.position.y = -bbox.min.y * scale + 0.1; // Sit on ground
    mesh.position.z = -center.z * scale;
    
    // Scale
    mesh.scale.set(scale, scale, scale);
  }
  
  return { center, size, scale };
}

function loadModel(modelConfig) {
  console.log(`🎭 Loading model: ${modelConfig.name}`);
  showLoading(true);
  
  // Clear previous model
  clearCurrentModel();
  
  const objPath = MODELS_PATH + modelConfig.obj;
  const mtlPath = modelConfig.mtl ? MODELS_PATH + modelConfig.mtl : null;
  
  // Function to load OBJ after materials are ready
  const loadOBJ = (materials) => {
    objLoader.setPath(MODELS_PATH);
    
    if (materials) {
      objLoader.setMaterials(materials);
    }
    
    objLoader.load(
      objPath,
      (result) => {
        showLoading(false);
        
        if (result.meshes.length === 0) {
          showError('No geometry found in OBJ file');
          return;
        }
        
        // Add meshes to scene
        currentModelMeshes = result.meshes;
        
        // Center and scale model
        const modelInfo = centerAndScaleModel(currentModelMeshes);
        
        // Add to scene
        for (const mesh of currentModelMeshes) {
          scene.add(mesh);
        }
        
        currentModel = modelConfig;
        
        // Update UI
        updateModelInfo(modelConfig, currentModelMeshes, modelInfo);
        
        console.log(`✓ Model loaded: ${modelConfig.name}`);
        console.log(`  Meshes: ${currentModelMeshes.length}`);
        console.log(`  Total triangles: ${countTriangles(currentModelMeshes)}`);
      },
      null,
      (error) => {
        showLoading(false);
        showError(`Failed to load OBJ: ${error.message}`);
        console.error('OBJ load error:', error);
      }
    );
  };
  
  // Load MTL first if specified
  if (mtlPath) {
    mtlLoader.setPath(MODELS_PATH);
    mtlLoader.load(
      mtlPath,
      (materials) => {
        console.log(`✓ Materials loaded from ${modelConfig.mtl}`);
        
        // Load textures referenced by materials
        mtlLoader.loadTextures(materials, (materialsWithTextures) => {
          console.log('✓ Textures loaded');
          loadOBJ(materialsWithTextures);
        });
      },
      (error) => {
        console.warn('MTL load failed, loading OBJ without materials:', error);
        loadOBJ(null);
      }
    );
  } else {
    // No MTL, just load OBJ
    loadOBJ(null);
  }
}

function countTriangles(meshes) {
  let count = 0;
  for (const mesh of meshes) {
    if (mesh.geometry.index) {
      count += mesh.geometry.index.length / 3;
    } else {
      const positions = mesh.geometry.attributes.position;
      count += positions.count / 3;
    }
  }
  return Math.floor(count);
}

function updateModelInfo(modelConfig, meshes, modelInfo) {
  const triangles = countTriangles(meshes);
  
  document.getElementById('modelInfo').innerHTML = `
    <strong>${modelConfig.name}</strong><br>
    ${modelConfig.description}<br>
    Meshes: ${meshes.length} | Triangles: ${triangles}
  `;
  
  document.getElementById('debugInfo').innerHTML = `
    Model: ${modelConfig.name}<br>
    Meshes: ${meshes.length}<br>
    Triangles: ${triangles}<br>
    Size: ${modelInfo.size.x.toFixed(2)} × ${modelInfo.size.y.toFixed(2)} × ${modelInfo.size.z.toFixed(2)}<br>
    Scale: ${modelInfo.scale.toFixed(3)}x
  `;
}

// ============================================================================
// UI Generation
// ============================================================================

function initializeUI() {
  const container = document.getElementById('modelButtons');
  
  AVAILABLE_MODELS.forEach((modelConfig, index) => {
    const button = document.createElement('button');
    button.textContent = modelConfig.name;
    button.id = `btnModel${index}`;
    button.title = modelConfig.description;
    
    button.addEventListener('click', () => {
      // Update active state
      document.querySelectorAll('#modelButtons button').forEach(btn => {
        btn.classList.remove('active');
      });
      button.classList.add('active');
      
      // Load model
      loadModel(modelConfig);
    });
    
    container.appendChild(button);
  });
  
  // Load first model by default
  if (AVAILABLE_MODELS.length > 0) {
    document.getElementById('btnModel0').classList.add('active');
    loadModel(AVAILABLE_MODELS[0]);
  } else {
    showError('No models available. Add .obj files to examples/models/models/');
  }
}

// ============================================================================
// Window Resize
// ============================================================================

window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  if (renderer) {
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
});

// ============================================================================
// Animation Loop
// ============================================================================

const fpsElement = document.getElementById('fps');
let frameCount = 0;
let fpsTime = performance.now();

function animate() {
  // Update controls
  if (controls) {
    controls.update();
  }
  
  // Render scene
  if (renderer) {
    renderer.render(scene, camera);
  }
  
  // Update FPS counter
  frameCount++;
  const now = performance.now();
  if (now - fpsTime >= 1000) {
    const fps = Math.round((frameCount * 1000) / (now - fpsTime));
    fpsElement.textContent = `FPS: ${fps}`;
    frameCount = 0;
    fpsTime = now;
  }
  
  requestAnimationFrame(animate);
}

// ============================================================================
// Start Application
// ============================================================================

// Backend toggle buttons
document.getElementById('cpuBtn').addEventListener('click', async () => {
  await initRenderer('cpu');
});

document.getElementById('gpuBtn').addEventListener('click', async () => {
  await initRenderer('gpu');
});

document.getElementById('autoBtn').addEventListener('click', async () => {
  await initRenderer('auto');
});

console.log('🎭 BangBang3D Model Viewer');
console.log(`Available models: ${AVAILABLE_MODELS.length}`)

// Initialize renderer (GPU backend supports Lambert materials)
await initRenderer('gpu');

initializeUI();
animate();
