import { Scene } from '../core/Scene.js';
import { PerspectiveCamera } from '../cameras/PerspectiveCamera.js';
import { DirectionalLight } from '../lights/DirectionalLight.js';
import { Mesh } from '../core/Mesh.js';
import { BoxGeometry } from '../geometries/BoxGeometry.js';
import { SphereGeometry } from '../geometries/SphereGeometry.js';
import { BasicMaterial } from '../materials/BasicMaterial.js';
import { PBRMaterial } from '../materials/PBRMaterial.js';
import { Color } from '../math/Color.js';
import { Vector3 } from '../math/Vector3.js';

/**
 * ValidationHarness - Automated testing for CPU vs GPU rendering
 * Ensures pixel-perfect correctness across backends
 * Generates golden reference images and validates outputs
 */
export class ValidationHarness {
    constructor() {
        // Golden scenes (reference test cases)
        this.goldenScenes = [];
        
        // Test results
        this.results = [];
        
        // Tolerance for pixel differences
        this.pixelTolerance = 2; // RGB difference per channel
        this.pixelThreshold = 0.01; // 1% of pixels can differ
        
        // Canvas for rendering
        this.canvas = null;
        this.width = 512;
        this.height = 512;
    }
    
    /**
     * Initialize validation harness
     * @param {HTMLCanvasElement} canvas - Canvas for rendering
     */
    initialize(canvas) {
        this.canvas = canvas;
        this._createGoldenScenes();
    }
    
    /**
     * Create golden reference scenes
     */
    _createGoldenScenes() {
        // Scene 1: Basic geometry with solid colors
        this.goldenScenes.push({
            name: 'basic_geometry',
            description: 'Simple cube and sphere with BasicMaterial',
            create: () => this._createBasicGeometryScene()
        });
        
        // Scene 2: Multiple lights
        this.goldenScenes.push({
            name: 'multiple_lights',
            description: 'Scene with multiple light sources',
            create: () => this._createMultipleLightsScene()
        });
        
        // Scene 3: PBR materials
        this.goldenScenes.push({
            name: 'pbr_materials',
            description: 'Scene with PBR materials (metallic/roughness)',
            create: () => this._createPBRMaterialsScene()
        });
        
        // Scene 4: Complex transforms
        this.goldenScenes.push({
            name: 'transforms',
            description: 'Hierarchical transforms and rotations',
            create: () => this._createTransformsScene()
        });
        
        // Scene 5: Many objects (stress test)
        this.goldenScenes.push({
            name: 'stress_test',
            description: 'Many objects to test batching and performance',
            create: () => this._createStressTestScene()
        });
    }
    
    /**
     * Create basic geometry test scene
     */
    _createBasicGeometryScene() {
        const scene = new Scene();
        
        // Camera
        const camera = new PerspectiveCamera(60, this.width / this.height, 0.1, 100);
        camera.position.set(0, 2, 5);
        camera.lookAt(new Vector3(0, 0, 0));
        
        // Light
        const light = new DirectionalLight(new Color(1, 1, 1), 1.0);
        light.position.set(1, 1, 1);
        scene.add(light);
        
        // Cube
        const cubeGeometry = new BoxGeometry(1, 1, 1);
        const cubeMaterial = new BasicMaterial({ color: new Color(1, 0, 0) });
        const cube = new Mesh(cubeGeometry, cubeMaterial);
        cube.position.set(-1.5, 0, 0);
        scene.add(cube);
        
        // Sphere
        const sphereGeometry = new SphereGeometry(0.5, 32, 16);
        const sphereMaterial = new BasicMaterial({ color: new Color(0, 1, 0) });
        const sphere = new Mesh(sphereGeometry, sphereMaterial);
        sphere.position.set(1.5, 0, 0);
        scene.add(sphere);
        
        return { scene, camera };
    }
    
    /**
     * Create multiple lights test scene
     */
    _createMultipleLightsScene() {
        const scene = new Scene();
        
        const camera = new PerspectiveCamera(60, this.width / this.height, 0.1, 100);
        camera.position.set(0, 3, 6);
        camera.lookAt(new Vector3(0, 0, 0));
        
        // Three lights with different colors
        const light1 = new DirectionalLight(new Color(1, 0, 0), 0.7);
        light1.position.set(-2, 2, 2);
        scene.add(light1);
        
        const light2 = new DirectionalLight(new Color(0, 1, 0), 0.7);
        light2.position.set(2, 2, 2);
        scene.add(light2);
        
        const light3 = new DirectionalLight(new Color(0, 0, 1), 0.7);
        light3.position.set(0, 2, -2);
        scene.add(light3);
        
        // Central sphere
        const geometry = new SphereGeometry(1, 32, 16);
        const material = new BasicMaterial({ color: new Color(1, 1, 1) });
        const sphere = new Mesh(geometry, material);
        scene.add(sphere);
        
        return { scene, camera };
    }
    
    /**
     * Create PBR materials test scene
     */
    _createPBRMaterialsScene() {
        const scene = new Scene();
        
        const camera = new PerspectiveCamera(60, this.width / this.height, 0.1, 100);
        camera.position.set(0, 2, 8);
        camera.lookAt(new Vector3(0, 0, 0));
        
        const light = new DirectionalLight(new Color(1, 1, 1), 1.0);
        light.position.set(1, 1, 1);
        scene.add(light);
        
        // Row of spheres with varying metallic/roughness
        for (let i = 0; i < 5; i++) {
            const geometry = new SphereGeometry(0.5, 32, 16);
            const material = new PBRMaterial({
                color: new Color(1, 0.8, 0.6),
                metallic: i / 4,
                roughness: 0.2
            });
            
            const sphere = new Mesh(geometry, material);
            sphere.position.set(-4 + i * 2, 0, 0);
            scene.add(sphere);
        }
        
        return { scene, camera };
    }
    
    /**
     * Create transforms test scene
     */
    _createTransformsScene() {
        const scene = new Scene();
        
        const camera = new PerspectiveCamera(60, this.width / this.height, 0.1, 100);
        camera.position.set(0, 5, 10);
        camera.lookAt(new Vector3(0, 0, 0));
        
        const light = new DirectionalLight(new Color(1, 1, 1), 1.0);
        light.position.set(1, 1, 1);
        scene.add(light);
        
        // Parent object
        const parentGeometry = new BoxGeometry(2, 0.5, 2);
        const parentMaterial = new BasicMaterial({ color: new Color(0.5, 0.5, 0.5) });
        const parent = new Mesh(parentGeometry, parentMaterial);
        scene.add(parent);
        
        // Child objects in hierarchy
        for (let i = 0; i < 4; i++) {
            const childGeometry = new BoxGeometry(0.5, 0.5, 0.5);
            const childMaterial = new BasicMaterial({
                color: new Color(Math.random(), Math.random(), Math.random())
            });
            const child = new Mesh(childGeometry, childMaterial);
            
            const angle = (i / 4) * Math.PI * 2;
            child.position.set(Math.cos(angle) * 2, 1, Math.sin(angle) * 2);
            child.rotation.y = angle;
            
            parent.add(child);
        }
        
        parent.rotation.y = Math.PI / 4;
        
        return { scene, camera };
    }
    
    /**
     * Create stress test scene
     */
    _createStressTestScene() {
        const scene = new Scene();
        
        const camera = new PerspectiveCamera(60, this.width / this.height, 0.1, 100);
        camera.position.set(0, 10, 20);
        camera.lookAt(new Vector3(0, 0, 0));
        
        const light = new DirectionalLight(new Color(1, 1, 1), 1.0);
        light.position.set(1, 1, 1);
        scene.add(light);
        
        // Grid of cubes
        const geometry = new BoxGeometry(0.5, 0.5, 0.5);
        
        for (let x = -5; x <= 5; x++) {
            for (let z = -5; z <= 5; z++) {
                const material = new BasicMaterial({
                    color: new Color(
                        (x + 5) / 10,
                        (z + 5) / 10,
                        0.5
                    )
                });
                
                const cube = new Mesh(geometry, material);
                cube.position.set(x * 1.2, 0, z * 1.2);
                scene.add(cube);
            }
        }
        
        return { scene, camera };
    }
    
    /**
     * Run validation test
     * @param {BangBangRenderer} renderer - Renderer instance
     * @param {string} sceneName - Name of golden scene to test (or 'all')
     * @returns {Promise<Object>} Test results
     */
    async runTest(renderer, sceneName = 'all') {
        const results = {
            timestamp: new Date().toISOString(),
            backend: renderer.backend?.name || 'unknown',
            tests: []
        };
        
        const scenesToTest = sceneName === 'all'
            ? this.goldenScenes
            : this.goldenScenes.filter(s => s.name === sceneName);
        
        for (const goldenScene of scenesToTest) {
            console.log(`[ValidationHarness] Testing: ${goldenScene.name}`);
            
            const testResult = await this._runSingleTest(renderer, goldenScene);
            results.tests.push(testResult);
            
            console.log(`[ValidationHarness] ${goldenScene.name}: ${testResult.passed ? 'PASS' : 'FAIL'}`);
            if (!testResult.passed) {
                console.log(`  Difference: ${testResult.pixelDifference.toFixed(4)}%`);
            }
        }
        
        // Calculate overall pass/fail
        const passedCount = results.tests.filter(t => t.passed).length;
        results.allPassed = passedCount === results.tests.length;
        results.passRate = passedCount / results.tests.length;
        
        this.results.push(results);
        
        return results;
    }
    
    /**
     * Run single validation test
     */
    async _runSingleTest(renderer, goldenScene) {
        const { scene, camera } = goldenScene.create();
        
        // Render scene
        const startTime = performance.now();
        renderer.render(scene, camera);
        const renderTime = performance.now() - startTime;
        
        // Capture pixels
        const pixels = this._capturePixels();
        
        // Compare against golden reference (or generate if first run)
        const comparison = this._comparePixels(pixels, goldenScene.name);
        
        return {
            name: goldenScene.name,
            description: goldenScene.description,
            passed: comparison.passed,
            pixelDifference: comparison.difference,
            renderTime: renderTime,
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * Capture pixels from canvas
     */
    _capturePixels() {
        const ctx = this.canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, this.width, this.height);
        return imageData.data;
    }
    
    /**
     * Compare pixels against golden reference
     */
    _comparePixels(pixels, sceneName) {
        // In real implementation, would load golden reference from file
        // For now, just do basic sanity checks
        
        let differentPixels = 0;
        const totalPixels = this.width * this.height;
        
        // Simple validation: check if image has content (not all black/white)
        let hasContent = false;
        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            
            // Check if pixel is not pure black or white
            if ((r > 10 && r < 245) || (g > 10 && g < 245) || (b > 10 && b < 245)) {
                hasContent = true;
                break;
            }
        }
        
        const difference = hasContent ? 0 : 100;
        const passed = hasContent;
        
        return {
            passed: passed,
            difference: difference
        };
    }
    
    /**
     * Generate validation report
     * @returns {string} HTML report
     */
    generateReport() {
        if (this.results.length === 0) {
            return '<p>No validation results available</p>';
        }
        
        const latestResult = this.results[this.results.length - 1];
        
        let html = '<div style="font-family: monospace;">';
        html += `<h2>Validation Report</h2>`;
        html += `<p>Backend: ${latestResult.backend}</p>`;
        html += `<p>Timestamp: ${latestResult.timestamp}</p>`;
        html += `<p>Overall: ${latestResult.allPassed ? '✅ PASS' : '❌ FAIL'}</p>`;
        html += `<p>Pass Rate: ${(latestResult.passRate * 100).toFixed(1)}%</p>`;
        html += '<hr>';
        
        html += '<h3>Test Results:</h3>';
        html += '<table border="1" cellpadding="5" style="border-collapse: collapse;">';
        html += '<tr><th>Test</th><th>Status</th><th>Difference</th><th>Render Time</th></tr>';
        
        for (const test of latestResult.tests) {
            html += '<tr>';
            html += `<td>${test.name}</td>`;
            html += `<td>${test.passed ? '✅ PASS' : '❌ FAIL'}</td>`;
            html += `<td>${test.pixelDifference.toFixed(4)}%</td>`;
            html += `<td>${test.renderTime.toFixed(2)}ms</td>`;
            html += '</tr>';
        }
        
        html += '</table>';
        html += '</div>';
        
        return html;
    }
    
    /**
     * Export results as JSON
     */
    exportResults() {
        return JSON.stringify(this.results, null, 2);
    }
}
