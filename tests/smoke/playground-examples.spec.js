import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

function analyzeCanvas(buffer) {
  const png = PNG.sync.read(buffer);
  let inspected = 0;
  let nonBlack = 0;
  let luminanceSum = 0;
  let luminanceSqSum = 0;

  for (let y = 0; y < png.height; y += 2) {
    for (let x = Math.floor(png.width * 0.25); x < png.width; x += 2) {
      const offset = (y * png.width + x) * 4;
      const red = png.data[offset];
      const green = png.data[offset + 1];
      const blue = png.data[offset + 2];
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

      inspected++;
      if (red + green + blue > 24) nonBlack++;
      luminanceSum += luminance;
      luminanceSqSum += luminance * luminance;
    }
  }

  const mean = luminanceSum / inspected;
  const variance = luminanceSqSum / inspected - mean * mean;

  return {
    nonBlackRatio: nonBlack / inspected,
    luminanceStdDev: Math.sqrt(Math.max(variance, 0))
  };
}

function collectPageProblems(page) {
  const pageErrors = [];
  const failedRequests = [];

  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });
  page.on('requestfailed', request => failedRequests.push(`${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
      failedRequests.push(`${response.status()} ${response.url()}`);
    }
  });

  return { pageErrors, failedRequests };
}

function relevantPageErrors(errors) {
  return errors.filter(text => !text.includes('404 (Not Found)'));
}

test.describe('playground examples', () => {
  test('lighting playground preserves user scene when enabling reflections and shadows', async ({ page }) => {
    const problems = collectPageProblems(page);

    await page.goto('/examples/light-playground/index.html');
    await expect(page.locator('#backend-indicator')).toContainText('GPU', { timeout: 15000 });

    await page.locator('#btnAddSphere').click();
    await page.locator('#btnAddCube').click();
    await page.locator('#btnAddDirectional').click();

    const before = await page.evaluate(() => ({
      lights: document.getElementById('lights-list').children.length,
      objects: document.getElementById('objects-list').children.length
    }));
    expect(before.lights).toBe(2);
    expect(before.objects).toBe(2);

    await page.locator('#btnAddReflectionProbe').click();
    await expect(page.locator('#backend-indicator')).toContainText('WEBGL2', { timeout: 15000 });
    await expect(page.locator('#probe-status')).toContainText('Probe added');

    const afterProbe = await page.evaluate(() => ({
      lights: document.getElementById('lights-list').children.length,
      objects: document.getElementById('objects-list').children.length
    }));
    expect(afterProbe).toEqual(before);

    await page.locator('#btnToggleShadows').click();
    await expect(page.locator('#btnToggleShadows')).toContainText('Disable Shadows');
    await expect(page.locator('#shadow-warning')).toBeHidden();

    const afterShadows = await page.evaluate(() => ({
      lights: document.getElementById('lights-list').children.length,
      objects: document.getElementById('objects-list').children.length
    }));
    expect(afterShadows).toEqual(before);

    const canvasStats = analyzeCanvas(await page.locator('#canvas').screenshot());
    expect(canvasStats.nonBlackRatio).toBeGreaterThan(0.02);
    expect(canvasStats.luminanceStdDev).toBeGreaterThan(4);

    expect(problems.failedRequests).toEqual([]);
    expect(relevantPageErrors(problems.pageErrors)).toEqual([]);
  });

  test('glass transparency example renders and switches backends without blanking', async ({ page }) => {
    const problems = collectPageProblems(page);

    await page.goto('/examples/glass/index.html');
    await expect(page.locator('#backendInfo')).toContainText('Backend:', { timeout: 15000 });
    await expect(page.locator('#fps')).not.toContainText('--', { timeout: 15000 });

    for (const button of ['#cpuBtn', '#gpuBtn', '#autoBtn']) {
      await page.locator(button).click();
      await expect(page.locator('#backendInfo')).not.toContainText('--', { timeout: 15000 });
      await page.waitForTimeout(250);
      const canvasStats = analyzeCanvas(await page.locator('#canvas').screenshot());
      expect(canvasStats.nonBlackRatio).toBeGreaterThan(0.02);
      expect(canvasStats.luminanceStdDev).toBeGreaterThan(4);
    }

    expect(problems.failedRequests).toEqual([]);
    expect(relevantPageErrors(problems.pageErrors)).toEqual([]);
  });
});
