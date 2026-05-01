import { test, expect } from '@playwright/test';
import { GaussianSplatCloud } from '../../src/core/GaussianSplatCloud.js';

test.describe('GaussianSplatCloud', () => {
  test('selectRenderSubset keeps coverage across the sorted depth range', () => {
    const sorted = Uint32Array.from([900, 800, 700, 600, 500, 400, 300, 200, 100, 0]);

    const subset = GaussianSplatCloud.selectRenderSubset(sorted, sorted.length, 5);

    expect(Array.from(subset)).toEqual([900, 700, 500, 300, 100]);
  });

  test('selectRenderSubset returns the full sorted order when budget is unlimited', () => {
    const sorted = Uint32Array.from([4, 3, 2, 1, 0]);

    const subset = GaussianSplatCloud.selectRenderSubset(sorted, sorted.length, sorted.length);

    expect(Array.from(subset)).toEqual([4, 3, 2, 1, 0]);
  });
});