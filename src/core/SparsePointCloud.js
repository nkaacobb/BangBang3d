import { PointCloud } from './PointCloud.js';

/**
 * SparsePointCloud - deterministic sparse previews for dense point/splat data.
 *
 * Sampling modes:
 * - stride: evenly spaced indices, stable and fast
 * - random: deterministic reservoir sample using a seed
 * - voxel: keeps one representative per voxel before applying maxPoints
 */
export class SparsePointCloud extends PointCloud {
  constructor(options = {}) {
    super(options);

    this.type = 'SparsePointCloud';
    this.isSparsePointCloud = true;

    this.samplingMode = options.samplingMode ?? options.method ?? 'stride';
    this.maxPoints = options.maxPoints ?? 50000;
    this.sampleRatio = options.sampleRatio ?? 1.0;
    this.voxelSize = options.voxelSize ?? 0.05;
    this.seed = options.seed ?? 1337;

    this.sourceCount = 0;
    this.selectedIndices = null;
  }

  setSparseData(positions, colors = null, options = {}) {
    const sampled = SparsePointCloud.sample(positions, colors, {
      samplingMode: options.samplingMode ?? this.samplingMode,
      maxPoints: options.maxPoints ?? this.maxPoints,
      sampleRatio: options.sampleRatio ?? this.sampleRatio,
      voxelSize: options.voxelSize ?? this.voxelSize,
      seed: options.seed ?? this.seed
    });

    this.samplingMode = sampled.samplingMode;
    this.maxPoints = sampled.maxPoints;
    this.sampleRatio = sampled.sampleRatio;
    this.voxelSize = sampled.voxelSize;
    this.seed = sampled.seed;
    this.sourceCount = sampled.sourceCount;
    this.selectedIndices = sampled.indices;

    super.setData(sampled.positions, sampled.colors);
    return this;
  }

  static sample(positions, colors = null, options = {}) {
    if (!(positions instanceof Float32Array)) {
      throw new Error('SparsePointCloud.sample: positions must be a Float32Array');
    }

    const sourceCount = Math.floor(positions.length / 3);
    if (sourceCount === 0) {
      throw new Error('SparsePointCloud.sample: no positions provided');
    }

    const samplingMode = options.samplingMode ?? options.method ?? 'stride';
    const sampleRatio = SparsePointCloud._clamp(options.sampleRatio ?? 1.0, 0.001, 1.0);
    const maxPoints = Math.max(0, Math.floor(options.maxPoints ?? 50000));
    const voxelSize = Math.max(0, Number(options.voxelSize ?? 0.05));
    const seed = Number(options.seed ?? 1337) >>> 0;
    const ratioTarget = Math.max(1, Math.floor(sourceCount * sampleRatio));
    const targetCount = maxPoints > 0 ? Math.min(sourceCount, ratioTarget, maxPoints) : Math.min(sourceCount, ratioTarget);

    let indices;
    if (targetCount >= sourceCount && samplingMode !== 'voxel') {
      indices = SparsePointCloud._range(sourceCount);
    } else if (samplingMode === 'voxel') {
      indices = SparsePointCloud._voxelIndices(positions, sourceCount, targetCount, voxelSize);
    } else if (samplingMode === 'random') {
      indices = SparsePointCloud._randomIndices(sourceCount, targetCount, seed);
    } else {
      indices = SparsePointCloud._strideIndices(sourceCount, targetCount);
    }

    const sampledPositions = new Float32Array(indices.length * 3);
    const sampledColors = new Uint8Array(indices.length * 3);
    const colorChannels = colors ? Math.floor(colors.length / sourceCount) : 0;

    for (let sampleIndex = 0; sampleIndex < indices.length; sampleIndex++) {
      const sourceIndex = indices[sampleIndex];
      const sourcePositionOffset = sourceIndex * 3;
      const samplePositionOffset = sampleIndex * 3;

      sampledPositions[samplePositionOffset] = positions[sourcePositionOffset];
      sampledPositions[samplePositionOffset + 1] = positions[sourcePositionOffset + 1];
      sampledPositions[samplePositionOffset + 2] = positions[sourcePositionOffset + 2];

      if (colors && colorChannels >= 3) {
        const sourceColorOffset = sourceIndex * colorChannels;
        sampledColors[samplePositionOffset] = SparsePointCloud._toByteColor(colors[sourceColorOffset]);
        sampledColors[samplePositionOffset + 1] = SparsePointCloud._toByteColor(colors[sourceColorOffset + 1]);
        sampledColors[samplePositionOffset + 2] = SparsePointCloud._toByteColor(colors[sourceColorOffset + 2]);
      } else {
        sampledColors[samplePositionOffset] = 210;
        sampledColors[samplePositionOffset + 1] = 220;
        sampledColors[samplePositionOffset + 2] = 230;
      }
    }

    return {
      positions: sampledPositions,
      colors: sampledColors,
      indices,
      sourceCount,
      samplingMode,
      maxPoints,
      sampleRatio,
      voxelSize,
      seed
    };
  }

  static _range(count) {
    const indices = new Uint32Array(count);
    for (let index = 0; index < count; index++) indices[index] = index;
    return indices;
  }

  static _strideIndices(sourceCount, targetCount) {
    const indices = new Uint32Array(targetCount);
    const step = sourceCount / targetCount;
    for (let index = 0; index < targetCount; index++) {
      indices[index] = Math.min(sourceCount - 1, Math.floor(index * step + step * 0.5));
    }
    return indices;
  }

  static _randomIndices(sourceCount, targetCount, seed) {
    const selected = new Uint32Array(targetCount);
    for (let index = 0; index < targetCount; index++) selected[index] = index;

    let state = seed || 1337;
    const random = () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };

    for (let sourceIndex = targetCount; sourceIndex < sourceCount; sourceIndex++) {
      const selectedIndex = Math.floor(random() * (sourceIndex + 1));
      if (selectedIndex < targetCount) selected[selectedIndex] = sourceIndex;
    }

    selected.sort();
    return selected;
  }

  static _voxelIndices(positions, sourceCount, targetCount, voxelSize) {
    if (voxelSize <= 0) return SparsePointCloud._strideIndices(sourceCount, targetCount);

    const selected = [];
    const occupied = new Set();

    for (let sourceIndex = 0; sourceIndex < sourceCount; sourceIndex++) {
      const offset = sourceIndex * 3;
      const key = `${Math.floor(positions[offset] / voxelSize)},${Math.floor(positions[offset + 1] / voxelSize)},${Math.floor(positions[offset + 2] / voxelSize)}`;
      if (!occupied.has(key)) {
        occupied.add(key);
        selected.push(sourceIndex);
      }
    }

    if (selected.length <= targetCount) return Uint32Array.from(selected);

    const reduced = new Uint32Array(targetCount);
    const step = selected.length / targetCount;
    for (let index = 0; index < targetCount; index++) {
      reduced[index] = selected[Math.min(selected.length - 1, Math.floor(index * step + step * 0.5))];
    }
    return reduced;
  }

  static _toByteColor(value) {
    if (!Number.isFinite(value)) return 0;
    const scaled = value <= 1 ? value * 255 : value;
    return Math.max(0, Math.min(255, Math.round(scaled)));
  }

  static _clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value)));
  }
}
