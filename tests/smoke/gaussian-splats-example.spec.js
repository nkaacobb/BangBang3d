import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

function analyzeCanvasPng(buffer) {
  const png = PNG.sync.read(buffer);
  const startX = Math.floor(png.width * 0.35);
  let inspected = 0;
  let nonBackground = 0;
  let luminanceSum = 0;
  let luminanceSqSum = 0;

  for (let y = 0; y < png.height; y++) {
    for (let x = startX; x < png.width; x++) {
      const offset = (y * png.width + x) * 4;
      const red = png.data[offset];
      const green = png.data[offset + 1];
      const blue = png.data[offset + 2];
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const backgroundDistance = Math.abs(red - 15) + Math.abs(green - 15) + Math.abs(blue - 26);

      inspected++;
      if (backgroundDistance > 28) nonBackground++;
      luminanceSum += luminance;
      luminanceSqSum += luminance * luminance;
    }
  }

  const mean = luminanceSum / inspected;
  const variance = luminanceSqSum / inspected - mean * mean;

  return {
    nonBackgroundRatio: nonBackground / inspected,
    luminanceMean: mean,
    luminanceStdDev: Math.sqrt(Math.max(variance, 0))
  };
}

test.describe('Gaussian splats example', () => {
  test('loads sample data and renders splat, sparse, and point-cloud views', async ({ page }) => {
    const consoleErrors = [];
    const failedRequests = [];

    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('requestfailed', request => failedRequests.push(`${request.url()} ${request.failure()?.errorText || ''}`));
    page.on('response', response => {
      if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
        failedRequests.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto('/examples/gaussian-splats/index.html');

    const hasWebGL2 = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
    test.skip(!hasWebGL2, 'WebGL2 is not available in this browser context');

    await expect(page.locator('#status')).toContainText('Loaded sample-sphere.splat', { timeout: 15000 });
    await expect(page.locator('#stats')).toContainText('Gaussian Splats');

    await page.waitForFunction(() => document.querySelector('#stats')?.textContent.includes('FPS:'));
    let canvasStats = analyzeCanvasPng(await page.locator('#canvas').screenshot());
    expect(canvasStats.nonBackgroundRatio).toBeGreaterThan(0.002);
    expect(canvasStats.nonBackgroundRatio).toBeLessThan(0.65);
    expect(canvasStats.luminanceStdDev).toBeGreaterThan(4);

    await page.locator('#btnSparse').click();
    await expect(page.locator('#stats')).toContainText('Sparse Point Cloud');
    await expect(page.locator('#stats')).toContainText('Sampling:');
    canvasStats = analyzeCanvasPng(await page.locator('#canvas').screenshot());
    expect(canvasStats.nonBackgroundRatio).toBeGreaterThan(0.001);

    await page.locator('#btnPointCloud').click();
    await expect(page.locator('#stats')).toContainText('Point Cloud');
    canvasStats = analyzeCanvasPng(await page.locator('#canvas').screenshot());
    expect(canvasStats.nonBackgroundRatio).toBeGreaterThan(0.001);

    expect(failedRequests).toEqual([]);
    expect(consoleErrors.filter(text => !text.includes('WebGPU') && !text.includes('404 (Not Found)'))).toEqual([]);
  });
});
