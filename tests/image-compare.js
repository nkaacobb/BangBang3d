/**
 * Image comparison utilities for golden reference testing
 * Provides pixel-level comparison with tolerance for GPU rendering
 */

import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

/**
 * Compare two images and generate diff
 * @param {Buffer} img1 - First image (PNG buffer)
 * @param {Buffer} img2 - Second image (PNG buffer)
 * @param {Object} options - Comparison options
 * @returns {Object} Comparison result with metrics and diff image
 */
export function compareImages(img1, img2, options = {}) {
  const {
    tolerance = 2,        // Per-channel tolerance (0-255)
    threshold = 0.01,     // Percentage of pixels allowed to differ (0-1)
    generateDiff = true   // Generate diff image
  } = options;
  
  const png1 = PNG.sync.read(img1);
  const png2 = PNG.sync.read(img2);
  
  // Ensure same dimensions
  if (png1.width !== png2.width || png1.height !== png2.height) {
    return {
      passed: false,
      error: 'Image dimensions do not match',
      metrics: {
        width1: png1.width,
        height1: png1.height,
        width2: png2.width,
        height2: png2.height
      }
    };
  }
  
  const width = png1.width;
  const height = png1.height;
  const totalPixels = width * height;
  
  // Create diff image
  const diff = generateDiff ? new PNG({ width, height }) : null;
  
  let differentPixels = 0;
  let maxDelta = 0;
  let totalDelta = 0;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      
      const r1 = png1.data[idx];
      const g1 = png1.data[idx + 1];
      const b1 = png1.data[idx + 2];
      const a1 = png1.data[idx + 3];
      
      const r2 = png2.data[idx];
      const g2 = png2.data[idx + 1];
      const b2 = png2.data[idx + 2];
      const a2 = png2.data[idx + 3];
      
      const deltaR = Math.abs(r1 - r2);
      const deltaG = Math.abs(g1 - g2);
      const deltaB = Math.abs(b1 - b2);
      const deltaA = Math.abs(a1 - a2);
      
      const delta = Math.max(deltaR, deltaG, deltaB, deltaA);
      maxDelta = Math.max(maxDelta, delta);
      totalDelta += delta;
      
      const isDifferent = delta > tolerance;
      if (isDifferent) {
        differentPixels++;
      }
      
      // Generate diff visualization
      if (diff) {
        if (isDifferent) {
          // Highlight differences in red
          diff.data[idx] = 255;
          diff.data[idx + 1] = 0;
          diff.data[idx + 2] = 0;
          diff.data[idx + 3] = 255;
        } else {
          // Show original (grayscale)
          const gray = (r1 + g1 + b1) / 3;
          diff.data[idx] = gray;
          diff.data[idx + 1] = gray;
          diff.data[idx + 2] = gray;
          diff.data[idx + 3] = 255;
        }
      }
    }
  }
  
  const differencePercentage = (differentPixels / totalPixels) * 100;
  const passed = differencePercentage <= (threshold * 100);
  const avgDelta = totalDelta / (totalPixels * 4);
  
  return {
    passed,
    metrics: {
      width,
      height,
      totalPixels,
      differentPixels,
      differencePercentage,
      maxDelta,
      avgDelta,
      tolerance,
      threshold: threshold * 100
    },
    diffImage: diff ? PNG.sync.write(diff) : null
  };
}

/**
 * Load image from file
 * @param {string} filePath - Path to PNG file
 * @returns {Promise<Buffer>} Image data
 */
export async function loadImage(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

/**
 * Save image to file
 * @param {Buffer} imageData - PNG buffer
 * @param {string} filePath - Output file path
 */
export async function saveImage(imageData, filePath) {
  // Ensure directory exists
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, imageData, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Check if golden reference exists
 * @param {string} filePath - Path to golden reference
 * @returns {boolean} True if exists
 */
export function goldenExists(filePath) {
  return fs.existsSync(filePath);
}
