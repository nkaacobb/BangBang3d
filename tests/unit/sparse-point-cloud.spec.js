import { test, expect } from '@playwright/test';
import { SparsePointCloud } from '../../src/core/SparsePointCloud.js';

function makeSource(count) {
  const positions = new Float32Array(count * 3);
  const colors = new Uint8Array(count * 4);

  for (let index = 0; index < count; index++) {
    positions[index * 3] = index * 0.01;
    positions[index * 3 + 1] = (index % 10) * 0.02;
    positions[index * 3 + 2] = Math.floor(index / 10) * 0.03;

    colors[index * 4] = index % 255;
    colors[index * 4 + 1] = (index * 3) % 255;
    colors[index * 4 + 2] = (index * 7) % 255;
    colors[index * 4 + 3] = 200;
  }

  return { positions, colors };
}

test.describe('SparsePointCloud', () => {
  test('creates a deterministic stride sample and drops alpha for point rendering', () => {
    const { positions, colors } = makeSource(100);
    const sparse = new SparsePointCloud({ samplingMode: 'stride', maxPoints: 10 });

    sparse.setSparseData(positions, colors);

    expect(sparse.isPointCloud).toBe(true);
    expect(sparse.isSparsePointCloud).toBe(true);
    expect(sparse.sourceCount).toBe(100);
    expect(sparse.count).toBe(10);
    expect(sparse.positions).toHaveLength(30);
    expect(sparse.colors).toHaveLength(30);
    expect(sparse.selectedIndices).toHaveLength(10);
  });

  test('random sampling is stable for a fixed seed', () => {
    const { positions, colors } = makeSource(200);
    const first = SparsePointCloud.sample(positions, colors, { samplingMode: 'random', maxPoints: 25, seed: 42 });
    const second = SparsePointCloud.sample(positions, colors, { samplingMode: 'random', maxPoints: 25, seed: 42 });

    expect(Array.from(first.indices)).toEqual(Array.from(second.indices));
  });

  test('voxel sampling keeps a sparse representative set', () => {
    const { positions, colors } = makeSource(500);
    const sparse = SparsePointCloud.sample(positions, colors, {
      samplingMode: 'voxel',
      maxPoints: 50,
      voxelSize: 0.15
    });

    expect(sparse.indices.length).toBeGreaterThan(0);
    expect(sparse.indices.length).toBeLessThanOrEqual(50);
    expect(sparse.positions.length).toBe(sparse.indices.length * 3);
    expect(sparse.colors.length).toBe(sparse.indices.length * 3);
  });
});
