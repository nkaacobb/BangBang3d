/**
 * Smoke test runner for BangBang3D
 * Tests CPU and GPU backends with golden reference images
 * Validates backend selection, capabilities, and rendering correctness
 */

import { test, expect } from '@playwright/test';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { compareImages, saveImage, goldenExists, loadImage } from './image-compare.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_PORT = 8765;
const TEST_URL = `http://localhost:${TEST_PORT}`;
const GOLDEN_DIR = path.join(__dirname, 'golden');
const OUTPUT_DIR = path.join(__dirname, 'output');

// Detect regen mode from env var or CLI flag
const REGEN_MODE = 
  process.env.REGEN_GOLDEN === 'true' || 
  process.env.REGEN_GOLDEN === '1' ||
  process.argv.includes('--regen');

if (REGEN_MODE) {
  console.log('\n=== REGENERATION MODE ENABLED ===');
  console.log('Golden references will be overwritten');
  console.log('================================\n');
}

// Test configuration
const TEST_SCENES = [
  'basic_geometry',
  'multiple_lights',
  'pbr_materials',
  'transforms',
  'stress_test'
];

const BACKENDS = ['cpu', 'gpu'];

// Tolerance settings
const CPU_TOLERANCE = 0;       // CPU must be pixel-perfect
const CPU_THRESHOLD = 0;
const GPU_TOLERANCE = 3;       // GPU allows small differences
const GPU_THRESHOLD = 0.02;    // 2% of pixels can differ

/**
 * Audit: Check for Three.js or WebGL leakage
 */
test.describe('Audit - Dependency Check', () => {
  test('should not import Three.js', async () => {
    const srcFiles = getAllJsFiles(path.join(__dirname, '..', 'src'));
    
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      
      // Check for Three.js imports
      expect(content).not.toMatch(/from\s+['"]three['"]/);
      expect(content).not.toMatch(/import.*THREE/);
      
      // Allow only in backend internals (normalize path for cross-platform)
      const normalizedFile = file.replace(/\\/g, '/');
      if (!normalizedFile.includes('renderer/backends/')) {
        expect(content).not.toMatch(/\.getContext\s*\(\s*['"]webgl/);
      }
    }
  });
});

/**
 * Helper to attach browser logging to page
 */
function attachBrowserLogging(page) {
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    const location = msg.location();
    console.log(`  [Browser ${type}] ${text}${location.url ? ` (${location.url}:${location.lineNumber})` : ''}`);
  });
  
  page.on('pageerror', err => {
    console.error('  [Browser Error]', err.stack || err.message);
  });
  
  page.on('requestfailed', req => {
    console.error(`  [Request Failed] ${req.url()} - ${req.failure().errorText}`);
  });
}

/**
 * Collect GPU availability diagnostics from browser
 */
async function collectGPUDiagnostics(page) {
  const diagnostics = await page.evaluate(async () => {
    const diag = {
      userAgent: navigator.userAgent,
      isHeadless: navigator.webdriver || /HeadlessChrome/.test(navigator.userAgent),
      webgpu: {
        available: !!navigator.gpu,
        adapter: null,
        adapterInfo: null
      },
      webgl2: {
        available: false,
        vendor: null,
        renderer: null
      },
      bangbang3d: {
        backendType: null,
        isReady: false,
        capabilities: null,
        initError: null
      }
    };
    
    // Test WebGPU adapter
    if (navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        diag.webgpu.adapter = adapter ? 'available' : 'not available';
        if (adapter) {
          try {
            const info = await adapter.requestAdapterInfo?.();
            if (info) {
              diag.webgpu.adapterInfo = {
                vendor: info.vendor,
                architecture: info.architecture,
                device: info.device,
                description: info.description
              };
            }
          } catch (e) {
            diag.webgpu.adapterInfo = `Error: ${e.message}`;
          }
        }
      } catch (e) {
        diag.webgpu.adapter = `Error: ${e.message}`;
      }
    }
    
    // Test WebGL2
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      diag.webgl2.available = !!gl;
      
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          diag.webgl2.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
          diag.webgl2.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        } else {
          diag.webgl2.vendor = gl.getParameter(gl.VENDOR);
          diag.webgl2.renderer = gl.getParameter(gl.RENDERER);
        }
      }
    } catch (e) {
      diag.webgl2.error = e.message;
    }
    
    // Test BangBang3D renderer
    try {
      const { BangBangRenderer } = await import('../src/renderer/BangBangRenderer.js');
      const canvas = document.getElementById('test-canvas');
      const renderer = new BangBangRenderer({
        canvas,
        width: 512,
        height: 512,
        backend: 'auto'
      });
      
      await renderer.waitForInitialization();
      
      diag.bangbang3d.backendType = renderer.backendType;
      diag.bangbang3d.isReady = renderer.isReady();
      diag.bangbang3d.capabilities = renderer.capabilities;
      
      // Capture lastError from backend if available
      if (renderer._backend && renderer._backend.lastError) {
        diag.bangbang3d.lastError = renderer._backend.lastError;
      }
      
      // Cleanup
      renderer.dispose();
    } catch (e) {
      diag.bangbang3d.initError = e.message;
    }
    
    return diag;
  });
  
  return diagnostics;
}

/**
 * Diagnostics tests
 */
test.describe('Diagnostics', () => {
  let browser;
  let page;
  
  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });
  
  test.afterAll(async () => {
    await browser.close();
  });
  
  test.beforeEach(async () => {
    page = await browser.newPage();
    attachBrowserLogging(page);
  });
  
  test.afterEach(async () => {
    await page.close();
  });
  
  test('should import test-helpers module', async () => {
    const errors = [];
    const consoleMessages = [];
    const failedRequests = [];
    
    page.on('console', msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location()
      });
    });
    
    page.on('pageerror', err => {
      errors.push({
        message: err.message,
        stack: err.stack
      });
    });
    
    page.on('requestfailed', req => {
      failedRequests.push({
        url: req.url(),
        error: req.failure().errorText
      });
    });
    
    await page.goto(`${TEST_URL}/tests/test-page.html?cb=${Date.now()}`);
    
    const result = await page.evaluate(async () => {
      try {
        const helpers = await import('./test-helpers.js');
        return { success: true, exports: Object.keys(helpers) };
      } catch (err) {
        return { success: false, error: err.message, stack: err.stack };
      }
    });
    
    if (!result.success) {
      console.error('\n=== IMPORT FAILED ===');
      console.error('Import error:', result.error);
      console.error('Stack:', result.stack);
      console.error('\n=== BROWSER ERRORS ===');
      errors.forEach(err => console.error(err));
      console.error('\n=== BROWSER CONSOLE ===');
      consoleMessages.forEach(msg => console.log(msg));
      console.error('\n=== FAILED REQUESTS ===');
      failedRequests.forEach(req => console.error(req));
      
      throw new Error(`Import failed: ${result.error}\nErrors: ${JSON.stringify(errors)}\nFailed requests: ${JSON.stringify(failedRequests)}`);
    }
    
    expect(result.success).toBe(true);
    expect(result.exports).toContain('renderScene');
  });
});

/**
 * Backend selection and capability tests
 */
test.describe('Backend Selection', () => {
  let browser;
  let page;
  
  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });
  
  test.afterAll(async () => {
    await browser.close();
  });
  
  test.beforeEach(async () => {
    page = await browser.newPage();
    attachBrowserLogging(page);
  });
  
  test.afterEach(async () => {
    await page.close();
  });
  
  test('should support explicit CPU backend', async () => {
    await page.goto(`${TEST_URL}/tests/test-page.html?cb=${Date.now()}`);
    
    const result = await page.evaluate(async () => {
      const { BangBangRenderer } = await import('../src/renderer/BangBangRenderer.js');
      
      const canvas = document.getElementById('test-canvas');
      
      const renderer = new BangBangRenderer({
        canvas,
        width: 512,
        height: 512,
        backend: 'cpu'
      });
      
      await renderer.waitForInitialization();
      
      return {
        backendType: renderer.backendType,
        capabilities: renderer.capabilities
      };
    });
    
    expect(result.backendType).toBe('cpu');
    expect(result.capabilities.supportsCompute).toBe(false);
  });
  
  test('should support GPU backend with fallback', async () => {
    await page.goto(`${TEST_URL}/tests/test-page.html?cb=${Date.now()}`);
    
    const result = await page.evaluate(async () => {
      const { BangBangRenderer } = await import('../src/renderer/BangBangRenderer.js');
      
      const canvas = document.getElementById('test-canvas');
      
      const renderer = new BangBangRenderer({
        canvas,
        width: 512,
        height: 512,
        backend: 'auto'
      });
      
      await renderer.waitForInitialization();
      
      return {
        backendType: renderer.backendType,
        capabilities: renderer.capabilities,
        isReady: renderer.isReady()
      };
    });
    
    // Should select GPU when available, or fallback to CPU
    expect(['cpu', 'gpu-webgpu', 'gpu-webgl2']).toContain(result.backendType);
    expect(result.isReady).toBe(true);
    
    // GPU backends should report appropriate capabilities
    if (result.backendType === 'gpu-webgpu') {
      expect(result.capabilities.supportsCompute).toBe(true);
    } else if (result.backendType === 'gpu-webgl2') {
      expect(result.capabilities.supportsCompute).toBe(false);
    }
  });
});

/**
 * Golden reference smoke tests
 */
test.describe('Golden Reference Tests - CPU Backend', () => {
  let browser;
  
  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: false }); // Use headful for canvas access
    
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
  });
  
  test.afterAll(async () => {
    await browser.close();
  });
  
  for (const sceneName of TEST_SCENES) {
    test(`CPU: ${sceneName}`, async () => {
      const page = await browser.newPage();
      attachBrowserLogging(page);
      
      try {
        await page.goto(`${TEST_URL}/tests/test-page.html?cb=${Date.now()}`);
        
        // Render scene
        const result = await page.evaluate(async (scene) => {
          const { renderScene } = await import('./test-helpers.js');
          return await renderScene(scene, 'cpu');
        }, sceneName);
        
        if (!result.available) {
          throw new Error(`CPU backend failed: ${result.error}`);
        }
        
        // Capture screenshot using Playwright
        const screenshotBuffer = await page.locator('#test-canvas').screenshot({ type: 'png' });
        
        // Dispose renderer
        await page.evaluate(() => {
          if (window.__bbTest && window.__bbTest.renderer) {
            window.__bbTest.renderer.dispose();
            window.__bbTest = null;
          }
        });
        
        const goldenPath = path.join(GOLDEN_DIR, 'cpu', `${sceneName}.png`);
        const outputPath = path.join(OUTPUT_DIR, 'cpu', `${sceneName}.png`);
        const diffPath = path.join(OUTPUT_DIR, 'cpu', `${sceneName}_diff.png`);
        
        // Save current render
        await saveImage(screenshotBuffer, outputPath);
        
        if (REGEN_MODE) {
          // Regenerate golden reference
          await saveImage(screenshotBuffer, goldenPath);
          console.log(`[REGEN] Saved golden: ${goldenPath}`);
        } else {
          // Compare against golden
          if (!goldenExists(goldenPath)) {
            throw new Error(`Golden reference missing: ${goldenPath}\nRun with REGEN_GOLDEN=true to generate`);
          }
          
          const goldenImage = await loadImage(goldenPath);
          const comparison = compareImages(screenshotBuffer, goldenImage, {
            tolerance: CPU_TOLERANCE,
            threshold: CPU_THRESHOLD,
            generateDiff: true
          });
          
          // Save diff if failed
          if (!comparison.passed && comparison.diffImage) {
            await saveImage(comparison.diffImage, diffPath);
          }
          
          // Save metrics
          const metricsPath = path.join(OUTPUT_DIR, 'cpu', `${sceneName}_metrics.json`);
          fs.writeFileSync(metricsPath, JSON.stringify(comparison.metrics, null, 2));
          
          // Assert
          expect(comparison.passed).toBe(true);
          if (!comparison.passed) {
            console.error(`CPU ${sceneName} FAILED:`);
            console.error(`  Difference: ${comparison.metrics.differencePercentage.toFixed(4)}%`);
            console.error(`  Max Delta: ${comparison.metrics.maxDelta}`);
            console.error(`  Output: ${outputPath}`);
            console.error(`  Diff: ${diffPath}`);
          }
        }
      } finally {
        await page.close();
      }
    });
  }
});

test.describe('Golden Reference Tests - GPU Backend', () => {
  let browser;
  
  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: false });
  });
  
  test.afterAll(async () => {
    await browser.close();
  });
  
  for (const sceneName of TEST_SCENES) {
    test(`GPU: ${sceneName}`, async () => {
      const page = await browser.newPage();
      attachBrowserLogging(page);
      
      try {
        await page.goto(`${TEST_URL}/tests/test-page.html?cb=${Date.now()}`);
        
        // Render scene
        const result = await page.evaluate(async (scene) => {
          const { renderScene } = await import('./test-helpers.js');
          return await renderScene(scene, 'gpu');
        }, sceneName);
        
        if (!result.available) {
          // Collect GPU diagnostics before skipping
          const diagnostics = await collectGPUDiagnostics(page);
          
          // Check if GPU APIs are available but initialization failed
          const gpuApisAvailable = diagnostics.webgpu.available || diagnostics.webgl2.available;
          const rendererUsedCPU = diagnostics.bangbang3d.backendType === 'cpu';
          
          if (gpuApisAvailable && rendererUsedCPU) {
            // GPU APIs are available but BangBang3D fell back to CPU - this is a FAILURE
            console.error('\n=== GPU INIT FAILURE (EXPECTED GPU, GOT CPU FALLBACK) ===');
            console.error('User Agent:', diagnostics.userAgent);
            console.error('Headless:', diagnostics.isHeadless);
            console.error('\nWebGPU:');
            console.error('  Available:', diagnostics.webgpu.available);
            console.error('  Adapter:', diagnostics.webgpu.adapter);
            if (diagnostics.webgpu.adapterInfo) {
              console.error('  Adapter Info:', JSON.stringify(diagnostics.webgpu.adapterInfo, null, 2));
            }
            console.error('\nWebGL2:');
            console.error('  Available:', diagnostics.webgl2.available);
            if (diagnostics.webgl2.vendor) {
              console.error('  Vendor:', diagnostics.webgl2.vendor);
              console.error('  Renderer:', diagnostics.webgl2.renderer);
            }
            console.error('\nBangBang3D:');
            console.error('  Backend Type:', diagnostics.bangbang3d.backendType, '(EXPECTED: gpu-webgpu or gpu-webgl2)');
            console.error('  Ready:', diagnostics.bangbang3d.isReady);
            if (diagnostics.bangbang3d.initError) {
              console.error('  Init Error:', diagnostics.bangbang3d.initError);
            }
            if (diagnostics.bangbang3d.lastError) {
              console.error('  Last Error:', JSON.stringify(diagnostics.bangbang3d.lastError, null, 2));
            }
            console.error('================================\n');
            
            // Save diagnostics as artifact
            const diagnosticsPath = path.join(OUTPUT_DIR, 'gpu', 'diagnostics_failure.json');
            if (!fs.existsSync(path.dirname(diagnosticsPath))) {
              fs.mkdirSync(path.dirname(diagnosticsPath), { recursive: true });
            }
            fs.writeFileSync(diagnosticsPath, JSON.stringify(diagnostics, null, 2));
            console.error(`GPU failure diagnostics saved to: ${diagnosticsPath}\n`);
            
            // Fail the test with detailed error
            const errorMessage = diagnostics.bangbang3d.lastError 
              ? `GPU initialization failed at stage "${diagnostics.bangbang3d.lastError.stage}": ${diagnostics.bangbang3d.lastError.message}\n\nError details: ${diagnostics.bangbang3d.lastError.error}`
              : 'GPU initialization failed but no detailed error was recorded';
            throw new Error(`GPU backends are available but initialization failed and fell back to CPU.\n${errorMessage}\n\nSee ${diagnosticsPath} for full diagnostics.`);
          }
          
          // GPU APIs are genuinely unavailable - skip the test
          console.log('\n=== GPU BACKEND NOT AVAILABLE (SKIPPING) ===');
          console.log('User Agent:', diagnostics.userAgent);
          console.log('Headless:', diagnostics.isHeadless);
          console.log('\nWebGPU:');
          console.log('  Available:', diagnostics.webgpu.available);
          console.log('  Adapter:', diagnostics.webgpu.adapter);
          console.log('\nWebGL2:');
          console.log('  Available:', diagnostics.webgl2.available);
          if (diagnostics.webgl2.vendor) {
            console.log('  Vendor:', diagnostics.webgl2.vendor);
            console.log('  Renderer:', diagnostics.webgl2.renderer);
          }
          console.log('\nBangBang3D:');
          console.log('  Backend Type:', diagnostics.bangbang3d.backendType);
          console.log('  Ready:', diagnostics.bangbang3d.isReady);
          console.log('================================\n');
          
          // Save diagnostics as artifact
          const diagnosticsPath = path.join(OUTPUT_DIR, 'gpu', 'diagnostics.json');
          if (!fs.existsSync(path.dirname(diagnosticsPath))) {
            fs.mkdirSync(path.dirname(diagnosticsPath), { recursive: true });
          }
          fs.writeFileSync(diagnosticsPath, JSON.stringify(diagnostics, null, 2));
          console.log(`GPU diagnostics saved to: ${diagnosticsPath}\n`);
          
          test.skip('GPU backend not available');
          return;
        }
        
        const backendType = result.backendType; // 'webgpu' or 'webgl2'
        
        // Capture screenshot using Playwright
        const screenshotBuffer = await page.locator('#test-canvas').screenshot({ type: 'png' });
        
        // Dispose renderer
        await page.evaluate(() => {
          if (window.__bbTest && window.__bbTest.renderer) {
            window.__bbTest.renderer.dispose();
            window.__bbTest = null;
          }
        });
        
        const goldenPath = path.join(GOLDEN_DIR, 'gpu', backendType, `${sceneName}.png`);
        const outputPath = path.join(OUTPUT_DIR, 'gpu', backendType, `${sceneName}.png`);
        const diffPath = path.join(OUTPUT_DIR, 'gpu', backendType, `${sceneName}_diff.png`);
        
        // Save current render
        await saveImage(screenshotBuffer, outputPath);
        
        if (REGEN_MODE) {
          // Regenerate golden reference
          await saveImage(screenshotBuffer, goldenPath);
          console.log(`[REGEN] Saved golden: ${goldenPath}`);
        } else {
          // Compare against golden
          if (!goldenExists(goldenPath)) {
            throw new Error(`Golden reference missing: ${goldenPath}\nRun with REGEN_GOLDEN=true to generate`);
          }
          
          const goldenImage = await loadImage(goldenPath);
          const comparison = compareImages(screenshotBuffer, goldenImage, {
            tolerance: GPU_TOLERANCE,
            threshold: GPU_THRESHOLD,
            generateDiff: true
          });
          
          // Save diff if failed
          if (!comparison.passed && comparison.diffImage) {
            await saveImage(comparison.diffImage, diffPath);
          }
          
          // Save metrics
          const metricsPath = path.join(OUTPUT_DIR, 'gpu', backendType, `${sceneName}_metrics.json`);
          fs.writeFileSync(metricsPath, JSON.stringify({
            ...comparison.metrics,
            backendType
          }, null, 2));
          
          // Assert
          expect(comparison.passed).toBe(true);
          if (!comparison.passed) {
            console.error(`GPU ${backendType} ${sceneName} FAILED:`);
            console.error(`  Difference: ${comparison.metrics.differencePercentage.toFixed(4)}%`);
            console.error(`  Max Delta: ${comparison.metrics.maxDelta}`);
            console.error(`  Output: ${outputPath}`);
            console.error(`  Diff: ${diffPath}`);
          }
        }
      } finally {
        await page.close();
      }
    });
  }
});

/**
 * Helper: Get all JS files recursively
 */
function getAllJsFiles(dir) {
  const files = [];
  
  function traverse(currentPath) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      
      if (entry.isDirectory()) {
        traverse(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }
  
  traverse(dir);
  return files;
}
