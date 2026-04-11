/**
 * BangBang3D Physics Demo - Bouncing Balls in Rotatable Glass Cube
 * 
 * Demonstrates:
 * - Transparent materials (glass cube)
 * - Cube-local physics using quaternion inversion
 * - Pointer-based camera controls (rotate, pan, zoom)
 * - CPU-based real-time rendering
 */

import {
  Scene,
  Mesh,
  BoxGeometry,
  SphereGeometry,
  BasicMaterial,
  PerspectiveCamera,
  BangBangRenderer,
  Vector3,
  Quaternion
} from '../../src/index.js';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  physics: {
    gravity: 9.8,           // World gravity magnitude
    restitution: 0.85,      // Bounciness (< 1 for energy loss)
    drag: 0.98,             // Air resistance per frame
    maxDeltaTime: 0.033     // Cap timestep to 30fps for stability
  },
  cube: {
    size: 4,                // Cube interior size
    opacity: 0.2,           // Glass transparency
    initialRotation: 0.3    // Initial tilt (radians)
  },
  balls: {
    count: 8,               // Number of balls
    radius: 0.25,           // Ball size
    segments: 12            // Sphere geometry detail
  },
  camera: {
    fov: 60,
    near: 0.1,
    far: 1000,
    distance: 12            // Initial distance from cube
  }
};

// Ball colors (vibrant palette)
const BALL_COLORS = [
  0xff4444, // Red
  0x44ff44, // Green
  0x4444ff, // Blue
  0xffff44, // Yellow
  0xff44ff, // Magenta
  0x44ffff, // Cyan
  0xff8844, // Orange
  0x88ff44  // Lime
];

// ============================================================================
// Scene Setup
// ============================================================================

// Helper to get current canvas (it gets replaced on backend switch)
const getCanvas = () => document.getElementById('canvas');

// Global renderer variable
let renderer = null;
let animationId = null;

// Initialize renderer with specified backend
async function initRenderer(backendType) {
  // Stop animation loop during backend switch
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  
  // Dispose old renderer if it exists
  if (renderer) {
    renderer.dispose();
    renderer = null;
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
  
  // Re-attach event listeners to new canvas
  attachCanvasListeners(canvas);
  
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
  
  renderer.setClearColor(0x000000);
  
  console.log('Backend initialized:', renderer.backendType);
  
  // Update UI
  document.getElementById('backendInfo').textContent = `Backend: ${renderer.backendType.toUpperCase()}`;
  
  // Update button states
  document.querySelectorAll('.backend-btn').forEach(btn => btn.classList.remove('active'));
  if (backendType === 'cpu') document.getElementById('cpuBtn').classList.add('active');
  else if (backendType === 'gpu') document.getElementById('gpuBtn').classList.add('active');
  else document.getElementById('autoBtn').classList.add('active');
  
  // Restart animation loop
  if (!animationId) {
    animate();
  }
  
  return renderer;
}

const scene = new Scene();

const camera = new PerspectiveCamera(
  CONFIG.camera.fov,
  window.innerWidth / window.innerHeight,
  CONFIG.camera.near,
  CONFIG.camera.far
);
camera.position.set(0, 0, CONFIG.camera.distance);
camera.lookAt(new Vector3(0, 0, 0));

// ============================================================================
// Create Glass Cube
// ============================================================================

const cubeGeometry = new BoxGeometry(
  CONFIG.cube.size,
  CONFIG.cube.size,
  CONFIG.cube.size
);

// IMPORTANT: Create material with color only, then set transparency flags
const cubeMaterial = new BasicMaterial({ color: 0x88ccff });
cubeMaterial.transparent = true;
cubeMaterial.opacity = CONFIG.cube.opacity;
cubeMaterial.depthWrite = false;

const glassCube = new Mesh(cubeGeometry, cubeMaterial);
glassCube.rotation.x = CONFIG.cube.initialRotation;
glassCube.rotation.y = CONFIG.cube.initialRotation;
scene.add(glassCube);

// ============================================================================
// Create Balls with Physics Data
// ============================================================================

const balls = [];

for (let i = 0; i < CONFIG.balls.count; i++) {
  const ballGeometry = new SphereGeometry(
    CONFIG.balls.radius,
    CONFIG.balls.segments,
    CONFIG.balls.segments
  );
  
  const ballMaterial = new BasicMaterial({ 
    color: BALL_COLORS[i % BALL_COLORS.length] 
  });
  
  const ballMesh = new Mesh(ballGeometry, ballMaterial);
  
  // Random starting position inside cube (with some margin)
  const margin = CONFIG.balls.radius * 2;
  const range = (CONFIG.cube.size / 2) - margin;
  ballMesh.position.set(
    (Math.random() - 0.5) * range * 2,
    (Math.random() - 0.5) * range * 2,
    (Math.random() - 0.5) * range * 2
  );
  
  // Add ball as child of cube (physics in cube-local space)
  glassCube.add(ballMesh);
  
  // Store physics data
  balls.push({
    mesh: ballMesh,
    velocity: new Vector3(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2
    )
  });
}

// ============================================================================
// Physics Simulation
// ============================================================================

let lastTime = performance.now();

function updatePhysics() {
  const now = performance.now();
  let deltaTime = (now - lastTime) / 1000; // Convert to seconds
  lastTime = now;
  
  // Cap delta time to prevent instability
  deltaTime = Math.min(deltaTime, CONFIG.physics.maxDeltaTime);
  
  // CRITICAL: Ensure cube transform is fully updated before reading quaternion
  glassCube.updateMatrixWorld(true);
  
  // Convert world gravity to cube-local gravity using quaternion inversion
  const worldGravity = new Vector3(0, -CONFIG.physics.gravity, 0);
  const cubeQuatInverse = glassCube.quaternion.clone();
  cubeQuatInverse.invert();
  
  const localGravity = worldGravity.clone();
  localGravity.applyQuaternion(cubeQuatInverse);
  
  // Update each ball
  for (const ball of balls) {
    const pos = ball.mesh.position;
    const vel = ball.velocity;
    
    // Apply gravity
    vel.x += localGravity.x * deltaTime;
    vel.y += localGravity.y * deltaTime;
    vel.z += localGravity.z * deltaTime;
    
    // Apply drag
    vel.multiplyScalar(CONFIG.physics.drag);
    
    // Update position
    pos.x += vel.x * deltaTime;
    pos.y += vel.y * deltaTime;
    pos.z += vel.z * deltaTime;
    
    // Collision detection with cube interior
    const halfSize = CONFIG.cube.size / 2;
    const ballRadius = CONFIG.balls.radius;
    const bound = halfSize - ballRadius;
    
    // X axis
    if (pos.x < -bound) {
      pos.x = -bound;
      vel.x = Math.abs(vel.x) * CONFIG.physics.restitution;
    } else if (pos.x > bound) {
      pos.x = bound;
      vel.x = -Math.abs(vel.x) * CONFIG.physics.restitution;
    }
    
    // Y axis
    if (pos.y < -bound) {
      pos.y = -bound;
      vel.y = Math.abs(vel.y) * CONFIG.physics.restitution;
    } else if (pos.y > bound) {
      pos.y = bound;
      vel.y = -Math.abs(vel.y) * CONFIG.physics.restitution;
    }
    
    // Z axis
    if (pos.z < -bound) {
      pos.z = -bound;
      vel.z = Math.abs(vel.z) * CONFIG.physics.restitution;
    } else if (pos.z > bound) {
      pos.z = bound;
      vel.z = -Math.abs(vel.z) * CONFIG.physics.restitution;
    }
  }
  
  // Ball-to-ball collision detection
  const ballRadius = CONFIG.balls.radius;
  const minDist = ballRadius * 2;
  
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const ball1 = balls[i];
      const ball2 = balls[j];
      
      const pos1 = ball1.mesh.position;
      const pos2 = ball2.mesh.position;
      const vel1 = ball1.velocity;
      const vel2 = ball2.velocity;
      
      // Calculate distance between centers
      const dx = pos2.x - pos1.x;
      const dy = pos2.y - pos1.y;
      const dz = pos2.z - pos1.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      const dist = Math.sqrt(distSq);
      
      // Check if balls are colliding
      if (dist < minDist && dist > 0.0001) {
        // Collision normal (from ball1 to ball2)
        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;
        
        // Separate balls to prevent overlap
        const overlap = minDist - dist;
        const separation = overlap / 2;
        
        pos1.x -= nx * separation;
        pos1.y -= ny * separation;
        pos1.z -= nz * separation;
        
        pos2.x += nx * separation;
        pos2.y += ny * separation;
        pos2.z += nz * separation;
        
        // Relative velocity
        const relVelX = vel1.x - vel2.x;
        const relVelY = vel1.y - vel2.y;
        const relVelZ = vel1.z - vel2.z;
        
        // Relative velocity along collision normal
        const velAlongNormal = relVelX * nx + relVelY * ny + relVelZ * nz;
        
        // Only resolve if balls are moving toward each other
        if (velAlongNormal > 0) continue;
        
        // Calculate impulse scalar (assuming equal mass)
        const restitution = CONFIG.physics.restitution;
        const impulse = -(1 + restitution) * velAlongNormal / 2;
        
        // Apply impulse to both balls
        vel1.x += impulse * nx;
        vel1.y += impulse * ny;
        vel1.z += impulse * nz;
        
        vel2.x -= impulse * nx;
        vel2.y -= impulse * ny;
        vel2.z -= impulse * nz;
      }
    }
  }
}

// ============================================================================
// Camera Controls (Pointer-based)
// ============================================================================

const controls = {
  rotating: false,
  panning: false,
  lastX: 0,
  lastY: 0,
  cubeRotationX: CONFIG.cube.initialRotation,
  cubeRotationY: CONFIG.cube.initialRotation,
  cubeOffsetX: 0,
  cubeOffsetY: 0
};

// Attach pointer event listeners to canvas
function attachCanvasListeners(canvas) {
  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    controls.lastX = event.clientX;
    controls.lastY = event.clientY;
  });

  canvas.addEventListener('pointermove', (event) => {
    // Use buttons bitmask (reliable across browsers)
    const leftButton = (event.buttons & 1) !== 0;
    const rightButton = (event.buttons & 2) !== 0;
    
    if (!leftButton && !rightButton) return;
    
    const deltaX = event.clientX - controls.lastX;
    const deltaY = event.clientY - controls.lastY;
    controls.lastX = event.clientX;
    controls.lastY = event.clientY;
    
    if (leftButton) {
      // Rotate cube
      controls.cubeRotationY += deltaX * 0.005;
      controls.cubeRotationX += deltaY * 0.005;
      
      // Clamp X rotation to prevent gimbal lock
      controls.cubeRotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, controls.cubeRotationX));
      
      glassCube.rotation.x = controls.cubeRotationX;
      glassCube.rotation.y = controls.cubeRotationY;
      
      // CRITICAL: Manually sync quaternion from Euler angles
      glassCube.quaternion.setFromEuler(glassCube.rotation);
    }
    
    if (rightButton) {
      // Pan cube in screen space
      controls.cubeOffsetX += deltaX * 0.01;
      controls.cubeOffsetY -= deltaY * 0.01;
      
      glassCube.position.x = controls.cubeOffsetX;
      glassCube.position.y = controls.cubeOffsetY;
    }
  });

  canvas.addEventListener('pointerup', (event) => {
    canvas.releasePointerCapture(event.pointerId);
  });

  // Prevent context menu on right click
  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  // Zoom with mouse wheel
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    
    const zoomSpeed = 0.001;
    const delta = event.deltaY * zoomSpeed;
    
    camera.position.z += delta * Math.abs(camera.position.z);
    camera.position.z = Math.max(5, Math.min(30, camera.position.z));
    
    camera.lookAt(new Vector3(0, 0, 0));
  }, { passive: false });
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
// Animation Loop with FPS Counter
// ============================================================================

const fpsElement = document.getElementById('fps');
let frameCount = 0;
let fpsTime = performance.now();

function animate() {
  // Update physics
  updatePhysics();
  
  // Render scene
  renderer.render(scene, camera);
  
  // Update FPS counter
  frameCount++;
  const now = performance.now();
  if (now - fpsTime >= 1000) {
    const fps = Math.round((frameCount * 1000) / (now - fpsTime));
    fpsElement.textContent = `FPS: ${fps}`;
    frameCount = 0;
    fpsTime = now;
  }
  
  animationId = requestAnimationFrame(animate);
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

console.log('🎱 BangBang3D Physics Cube Demo');
console.log(`Balls: ${CONFIG.balls.count}`);
console.log(`Cube size: ${CONFIG.cube.size} units`);
console.log('Controls: Left drag = rotate, Right drag = pan, Wheel = zoom');

// Initialize renderer with CPU backend by default (best for physics demo)
await initRenderer('cpu');
