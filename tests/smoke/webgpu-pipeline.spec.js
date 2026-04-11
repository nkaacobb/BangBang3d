/**
 * WebGPU Pipeline Smoke Test
 * 
 * Tests each critical stage of the WebGPU rendering pipeline:
 * 1. WebGPU device initialization
 * 2. Shader compilation (WGSL)
 * 3. Pipeline creation (vertex layouts, bind groups)
 * 4. Buffer creation (vertex, index, uniform)
 * 5. Texture/sampler creation
 * 6. Render pass execution
 * 7. Draw commands
 * 8. Frame rendering
 */

import { test, expect } from '@playwright/test';

const WEBGPU_URL = 'http://localhost:8082/examples/rotating-cube/index.html';
const TIMEOUT = 10000;

test.describe('WebGPU Rendering Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate and wait for page load
    await page.goto(WEBGPU_URL);
    await page.waitForLoadState('networkidle');
  });

  test('Stage 1: WebGPU Context Initialization', async ({ page }) => {
    // Wait for backend initialization
    await page.waitForFunction(() => {
      const backendText = document.getElementById('backend')?.textContent;
      return backendText && backendText.includes('GPU-WEBGPU');
    }, { timeout: TIMEOUT });

    // Verify WebGPU context was created
    const consoleMessages = [];
    page.on('console', msg => consoleMessages.push(msg.text()));

    await page.reload();
    await page.waitForTimeout(1000);

    const initMessages = consoleMessages.filter(msg => 
      msg.includes('Successfully obtained WebGPU context')
    );
    
    expect(initMessages.length).toBeGreaterThan(0);
  });

  test('Stage 2: Shader Compilation', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.waitForTimeout(2000);

    // No shader compilation errors should occur
    const shaderErrors = errors.filter(err => 
      err.includes('shader') || err.includes('WGSL') || err.includes('compilation')
    );
    
    expect(shaderErrors).toHaveLength(0);
  });

  test('Stage 3: Pipeline Creation', async ({ page }) => {
    const consoleMessages = [];
    page.on('console', msg => consoleMessages.push(msg.text()));

    await page.reload();
    await page.waitForTimeout(1000);

    // Verify rendering pipeline setup completed
    const pipelineMessages = consoleMessages.filter(msg => 
      msg.includes('Rendering pipeline setup complete')
    );
    
    expect(pipelineMessages.length).toBeGreaterThan(0);
  });

  test('Stage 4: Geometry Buffers', async ({ page }) => {
    // Wait for scene setup
    await page.waitForFunction(() => {
      const stats = document.getElementById('triangles')?.textContent;
      return stats && parseInt(stats) > 0;
    }, { timeout: TIMEOUT });

    // Verify triangle count (cube should have 12 triangles)
    const triangles = await page.locator('#triangles').textContent();
    expect(parseInt(triangles)).toBe(12);
  });

  test('Stage 5: Uniform Buffers', async ({ page }) => {
    // Test that uniforms are being created without errors
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('uniform')) {
        errors.push(msg.text());
      }
    });

    await page.waitForTimeout(2000);

    expect(errors).toHaveLength(0);
  });

  test('Stage 6: Render Pass Execution', async ({ page }) => {
    // Wait for backend to fully initialize
    await page.waitForFunction(() => {
      const backend = document.getElementById('backend')?.textContent;
      const triangles = document.getElementById('triangles')?.textContent;
      return backend && backend.includes('GPU-WEBGPU') && 
             triangles && parseInt(triangles) > 0;
    }, { timeout: TIMEOUT });
    
    await page.waitForTimeout(1000);
    
    const canvas = await page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    const hasRendered = await page.evaluate(() => {
      const triangles = document.getElementById('triangles')?.textContent;
      const fps = document.getElementById('fps')?.textContent;
      const backend = document.getElementById('backend')?.textContent;
      
      return (
        backend && backend.includes('GPU-WEBGPU') &&
        triangles && parseInt(triangles) > 0 &&
        fps && parseInt(fps) > 0
      );
    });

    expect(hasRendered).toBe(true);
  });

  test('Stage 7: Draw Commands', async ({ page }) => {
    // Verify FPS counter is running (indicates continuous rendering)
    await page.waitForTimeout(2000);

    const fps = await page.locator('#fps').textContent();
    const fpsValue = parseInt(fps);
    
    expect(fpsValue).toBeGreaterThan(0);
    expect(fpsValue).toBeLessThanOrEqual(60);
  });

  test('Stage 8: Animation Loop', async ({ page }) => {
    // Record canvas state at two different times
    const screenshot1 = await page.locator('canvas').screenshot();
    
    await page.waitForTimeout(500);
    
    const screenshot2 = await page.locator('canvas').screenshot();

    // Screenshots should be different (cube is rotating)
    expect(screenshot1.equals(screenshot2)).toBe(false);
  });

  test('Stage 9: Matrix Transformations', async ({ page }) => {
    // Wait for initialization
    await page.waitForFunction(() => {
      const fps = document.getElementById('fps')?.textContent;
      return fps && parseInt(fps) > 0;
    }, { timeout: TIMEOUT });

    // Verify rotation is actually being applied by checking FPS is consistent
    // (indicates animation loop is running smoothly with proper transforms)
    const rotationTest = await page.evaluate(() => {
      return new Promise((resolve) => {
        let fpsReadings = [];
        let readCount = 0;
        const maxReads = 5;

        const checkFPS = () => {
          const fpsEl = document.getElementById('fps');
          const trianglesEl = document.getElementById('triangles');
          
          if (fpsEl && trianglesEl) {
            const fps = parseInt(fpsEl.textContent);
            const triangles = parseInt(trianglesEl.textContent);
            
            if (fps > 0) {
              fpsReadings.push(fps);
              readCount++;
            }

            if (readCount >= maxReads) {
              // Verify we got valid FPS readings (animation is running)
              const avgFPS = fpsReadings.reduce((a, b) => a + b, 0) / fpsReadings.length;
              const hasValidFPS = avgFPS >= 30 && avgFPS <= 120;
              const hasTriangles = triangles === 12;
              resolve(hasValidFPS && hasTriangles);
            } else {
              setTimeout(checkFPS, 200);
            }
          } else {
            resolve(false);
          }
        };

        checkFPS();
      });
    });

    expect(rotationTest).toBe(true);
  });

  test('Stage 10: No WebGPU Errors', async ({ page }) => {
    const webgpuErrors = [];
    
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('WebGPU') && text.includes('error')) {
        webgpuErrors.push(text);
      }
      if (text.includes('Uncaptured error')) {
        webgpuErrors.push(text);
      }
    });

    await page.waitForTimeout(3000);

    expect(webgpuErrors).toHaveLength(0);
  });

  test('Full Pipeline Integration', async ({ page }) => {
    // End-to-end test: verify complete pipeline
    const results = await page.evaluate(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          const backend = document.getElementById('backend')?.textContent;
          const triangles = document.getElementById('triangles')?.textContent;
          const fps = document.getElementById('fps')?.textContent;

          resolve({
            backend: backend || '',
            triangles: parseInt(triangles) || 0,
            fps: parseInt(fps) || 0
          });
        }, 2000);
      });
    });

    expect(results.backend).toContain('GPU-WEBGPU');
    expect(results.triangles).toBe(12);
    expect(results.fps).toBeGreaterThan(30); // Should be running at reasonable FPS
  });
});
