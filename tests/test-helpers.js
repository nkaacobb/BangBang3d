/**
 * Test helper functions for smoke tests
 * Provides scene rendering and capture utilities
 */

import { BangBangRenderer } from '../src/renderer/BangBangRenderer.js';
import { Scene } from '../src/core/Scene.js';
import { PerspectiveCamera } from '../src/core/PerspectiveCamera.js';
import { PointLight } from '../src/lights/PointLight.js';
import { DirectionalLight } from '../src/lights/DirectionalLight.js';
import { SphereGeometry } from '../src/geometry/SphereGeometry.js';
import { BoxGeometry } from '../src/geometry/BoxGeometry.js';
import { PlaneGeometry } from '../src/geometry/PlaneGeometry.js';
import { BasicMaterial } from '../src/materials/BasicMaterial.js';
import { Mesh } from '../src/core/Mesh.js';
import { Vector3 } from '../src/math/Vector3.js';
import { Color } from '../src/math/Color.js';

/**
 * Create golden test scenes
 */
const sceneCreators = {
  /**
   * Basic geometry test - simple shapes
   */
  basic_geometry() {
    const scene = new Scene();
    
    // Camera
    const camera = new PerspectiveCamera({
      fov: 60,
      aspect: 1.0,
      near: 0.1,
      far: 100
    });
    camera.position = new Vector3(0, 2, 5);
    camera.lookAt(new Vector3(0, 0, 0));
    
    // Light
    const light = new DirectionalLight({
      color: new Color(1, 1, 1),
      intensity: 1.0
    });
    light.position = new Vector3(2, 4, 3);
    scene.add(light);
    
    // Sphere
    const sphereGeo = new SphereGeometry({ radius: 1, segments: 32 });
    const sphereMat = new BasicMaterial({
      color: new Color(1, 0, 0),
      roughness: 0.5,
      metallic: 0.0
    });
    const sphere = new Mesh(sphereGeo, sphereMat);
    sphere.position = new Vector3(-2, 0, 0);
    scene.add(sphere);
    
    // Box
    const boxGeo = new BoxGeometry({ width: 1.5, height: 1.5, depth: 1.5 });
    const boxMat = new BasicMaterial({
      color: new Color(0, 1, 0),
      roughness: 0.5,
      metallic: 0.0
    });
    const box = new Mesh(boxGeo, boxMat);
    box.position = new Vector3(2, 0, 0);
    scene.add(box);
    
    // Ground plane
    const planeGeo = new PlaneGeometry({ width: 10, height: 10 });
    const planeMat = new BasicMaterial({
      color: new Color(0.3, 0.3, 0.3),
      roughness: 0.8,
      metallic: 0.0
    });
    const plane = new Mesh(planeGeo, planeMat);
    plane.position = new Vector3(0, -1, 0);
    plane.rotation.x = -Math.PI / 2;
    scene.add(plane);
    
    return { scene, camera };
  },
  
  /**
   * Multiple lights test
   */
  multiple_lights() {
    const scene = new Scene();
    
    const camera = new PerspectiveCamera({
      fov: 60,
      aspect: 1.0,
      near: 0.1,
      far: 100
    });
    camera.position = new Vector3(0, 3, 6);
    camera.lookAt(new Vector3(0, 0, 0));
    
    // Three point lights - RGB
    const light1 = new PointLight({
      color: new Color(1, 0, 0),
      intensity: 2.0,
      range: 10
    });
    light1.position = new Vector3(-3, 2, 0);
    scene.add(light1);
    
    const light2 = new PointLight({
      color: new Color(0, 1, 0),
      intensity: 2.0,
      range: 10
    });
    light2.position = new Vector3(3, 2, 0);
    scene.add(light2);
    
    const light3 = new PointLight({
      color: new Color(0, 0, 1),
      intensity: 2.0,
      range: 10
    });
    light3.position = new Vector3(0, 2, 3);
    scene.add(light3);
    
    // Central sphere
    const sphereGeo = new SphereGeometry({ radius: 1.5, segments: 32 });
    const sphereMat = new BasicMaterial({
      color: new Color(1, 1, 1),
      roughness: 0.3,
      metallic: 0.0
    });
    const sphere = new Mesh(sphereGeo, sphereMat);
    scene.add(sphere);
    
    return { scene, camera };
  },
  
  /**
   * PBR materials test
   */
  pbr_materials() {
    const scene = new Scene();
    
    const camera = new PerspectiveCamera({
      fov: 60,
      aspect: 1.0,
      near: 0.1,
      far: 100
    });
    camera.position = new Vector3(0, 2, 8);
    camera.lookAt(new Vector3(0, 0, 0));
    
    // Directional light
    const light = new DirectionalLight({
      color: new Color(1, 1, 1),
      intensity: 1.5
    });
    light.position = new Vector3(3, 5, 3);
    scene.add(light);
    
    // Row of spheres with varying roughness
    const sphereGeo = new SphereGeometry({ radius: 0.8, segments: 32 });
    
    for (let i = 0; i < 5; i++) {
      const roughness = i / 4;
      const mat = new BasicMaterial({
        color: new Color(1, 0.7, 0.3),
        roughness,
        metallic: 0.8
      });
      const sphere = new Mesh(sphereGeo, mat);
      sphere.position = new Vector3(-4 + i * 2, 0, 0);
      scene.add(sphere);
    }
    
    return { scene, camera };
  },
  
  /**
   * Transforms test - scaling, rotation
   */
  transforms() {
    const scene = new Scene();
    
    const camera = new PerspectiveCamera({
      fov: 60,
      aspect: 1.0,
      near: 0.1,
      far: 100
    });
    camera.position = new Vector3(0, 5, 10);
    camera.lookAt(new Vector3(0, 0, 0));
    
    const light = new DirectionalLight({
      color: new Color(1, 1, 1),
      intensity: 1.0
    });
    light.position = new Vector3(2, 5, 3);
    scene.add(light);
    
    // Spiral of boxes with transforms
    const boxGeo = new BoxGeometry({ width: 1, height: 1, depth: 1 });
    
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const radius = 3;
      const scale = 0.5 + (i / 8) * 1.0;
      
      const mat = new BasicMaterial({
        color: new Color(i / 8, 0.5, 1 - i / 8),
        roughness: 0.6,
        metallic: 0.2
      });
      
      const box = new Mesh(boxGeo, mat);
      box.position = new Vector3(
        Math.cos(angle) * radius,
        i * 0.5,
        Math.sin(angle) * radius
      );
      box.rotation.y = angle;
      box.scale = new Vector3(scale, scale, scale);
      scene.add(box);
    }
    
    return { scene, camera };
  },
  
  /**
   * Stress test - many objects
   */
  stress_test() {
    const scene = new Scene();
    
    const camera = new PerspectiveCamera({
      fov: 60,
      aspect: 1.0,
      near: 0.1,
      far: 100
    });
    camera.position = new Vector3(0, 8, 15);
    camera.lookAt(new Vector3(0, 0, 0));
    
    const light = new DirectionalLight({
      color: new Color(1, 1, 1),
      intensity: 1.0
    });
    light.position = new Vector3(5, 10, 5);
    scene.add(light);
    
    // Grid of spheres
    const sphereGeo = new SphereGeometry({ radius: 0.4, segments: 16 });
    
    for (let x = -5; x <= 5; x++) {
      for (let z = -5; z <= 5; z++) {
        const mat = new BasicMaterial({
          color: new Color(
            (x + 5) / 10,
            0.5,
            (z + 5) / 10
          ),
          roughness: 0.5,
          metallic: 0.3
        });
        
        const sphere = new Mesh(sphereGeo, mat);
        sphere.position = new Vector3(x * 1.2, 0, z * 1.2);
        scene.add(sphere);
      }
    }
    
    return { scene, camera };
  }
};

/**
 * Render a scene (does not capture screenshot - Playwright will do that)
 * @param {string} sceneName - Name of scene to render
 * @param {string} backend - 'cpu' or 'gpu'
 * @returns {Promise<Object>} Renderer metadata
 */
export async function renderScene(sceneName, backend) {
  // Get canvas
  const canvas = document.getElementById('test-canvas');
  if (!canvas) {
    throw new Error('Test canvas not found');
  }
  
  // Create scene
  const creator = sceneCreators[sceneName];
  if (!creator) {
    throw new Error(`Unknown scene: ${sceneName}`);
  }
  
  const { scene, camera } = creator();
  
  // Create renderer
  const renderer = new BangBangRenderer({
    canvas,
    width: 512,
    height: 512,
    backend: backend === 'gpu' ? 'auto' : 'cpu'
  });
  
  // Wait for initialization (GPU is async)
  await renderer.waitForInitialization();
  
  // Check if GPU backend is available
  if (backend === 'gpu' && renderer.backendType === 'cpu') {
    return { available: false, backendType: 'cpu', error: 'GPU not available' };
  }
  
  // Clear and render
  renderer.clear();
  renderer.render(scene, camera);
  
  // Store renderer on window for later disposal
  window.__bbTest = {
    renderer,
    backendType: renderer.backendType,
    capabilities: renderer.capabilities
  };
  
  return {
    available: true,
    backendType: renderer.backendType,
    capabilities: renderer.capabilities
  };
}
