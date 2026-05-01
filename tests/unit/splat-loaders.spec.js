import { test, expect } from '@playwright/test';
import { PLYLoader, SOGLoader } from '../../src/loaders/PointCloudLoaders.js';

const SH_C0 = 0.28209479177387814;
const shCoeff = (linear) => (linear - 0.5) / SH_C0;

test.describe('Gaussian splat loaders', () => {
  test('decodes Gaussian PLY SH DC color instead of falling back to gray', () => {
    const ply = [
      'ply',
      'format ascii 1.0',
      'element vertex 2',
      'property float x',
      'property float y',
      'property float z',
      'property float f_dc_0',
      'property float f_dc_1',
      'property float f_dc_2',
      'property float opacity',
      'property float scale_0',
      'property float scale_1',
      'property float scale_2',
      'property float rot_0',
      'property float rot_1',
      'property float rot_2',
      'property float rot_3',
      'end_header',
      `0 0 0 ${shCoeff(1)} ${shCoeff(0.5)} ${shCoeff(0)} 2.2 -3 -3 -3 1 0 0 0`,
      `1 2 3 ${shCoeff(0)} ${shCoeff(1)} ${shCoeff(0.5)} 0 -2 -2 -2 1 0 0 0`
    ].join('\n');

    const cloud = PLYLoader.parseGaussianSplats(ply);

    expect(cloud.isGaussianSplatCloud).toBe(true);
    expect(cloud.count).toBe(2);
    expect(Array.from(cloud.colors.slice(0, 4))).toEqual([255, 128, 0, 230]);
    expect(Array.from(cloud.colors.slice(4, 8))).toEqual([0, 255, 128, 128]);
    expect(cloud.scales[0]).toBeCloseTo(Math.exp(-3), 5);
  });

  test('decodes SOG image data into Gaussian splat arrays', () => {
    const scaleCodebook = new Array(256).fill(0.04);
    scaleCodebook[1] = 0.1;
    scaleCodebook[2] = 0.2;
    scaleCodebook[3] = 0.3;

    const sh0Codebook = new Array(256).fill(0);
    sh0Codebook[1] = shCoeff(1);
    sh0Codebook[2] = shCoeff(0.5);
    sh0Codebook[3] = shCoeff(0);

    const meta = {
      version: 2,
      count: 2,
      antialias: false,
      means: { mins: [0, 0, 0], maxs: [Math.log(2), Math.log(3), Math.log(4)], files: ['means_l.webp', 'means_u.webp'] },
      scales: { codebook: scaleCodebook, files: ['scales.webp'] },
      quats: { files: ['quats.webp'] },
      sh0: { codebook: sh0Codebook, files: ['sh0.webp'] }
    };

    const images = {
      meansL: image(2, 1, [0, 0, 0, 255, 255, 255, 255, 255]),
      meansU: image(2, 1, [0, 0, 0, 255, 255, 255, 255, 255]),
      scales: image(2, 1, [1, 2, 3, 255, 3, 2, 1, 255]),
      quats: image(2, 1, [128, 128, 128, 255, 128, 128, 128, 255]),
      sh0: image(2, 1, [1, 2, 3, 200, 3, 1, 2, 180])
    };

    const cloud = SOGLoader._decodeSogData(meta, images);

    expect(cloud.isGaussianSplatCloud).toBe(true);
    expect(cloud.count).toBe(2);
    expect(cloud.positions[0]).toBeCloseTo(0, 5);
    expect(cloud.positions[3]).toBeCloseTo(1, 5);
    expect(cloud.positions[4]).toBeCloseTo(2, 5);
    expect(cloud.positions[5]).toBeCloseTo(3, 5);
    expect(Array.from(cloud.colors.slice(0, 4))).toEqual([255, 128, 0, 200]);
    expect(Array.from(cloud.colors.slice(4, 8))).toEqual([0, 255, 128, 180]);
    expect(cloud.scales[0]).toBeCloseTo(0.1, 5);
    expect(cloud.scales[1]).toBeCloseTo(0.2, 5);
    expect(cloud.scales[2]).toBeCloseTo(0.3, 5);
    expect(cloud.rotations[0]).toBeGreaterThan(0.99);
  });
});

function image(width, height, values) {
  return { width, height, data: new Uint8ClampedArray(values) };
}