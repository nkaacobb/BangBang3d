/**
 * generate-samples.js
 *
 * Run with:  node tools/generate-samples.js
 *
 * Generates sample point cloud (.ply) and Gaussian splat (.splat) files
 * for the BangBang3D demos.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Sample PLY (ASCII, ~500 points — a torus knot) ────────────────────────

function generateTorusKnotPLY(outPath, numPoints = 500) {
  const points = [];
  for (let i = 0; i < numPoints; i++) {
    const t = (i / numPoints) * Math.PI * 4;
    const p = 2, q = 3, R = 2, r = 0.6;
    const pr = Math.cos(q * t) * r + R;
    const x = pr * Math.cos(p * t);
    const y = pr * Math.sin(p * t);
    const z = -Math.sin(q * t) * r;
    // Add a little noise
    const nx = x + (Math.random() - 0.5) * 0.05;
    const ny = y + (Math.random() - 0.5) * 0.05;
    const nz = z + (Math.random() - 0.5) * 0.05;
    // Colour: hue based on parameter t
    const hue = (i / numPoints) * 360;
    const [rr, gg, bb] = hslToRgb(hue, 0.9, 0.6);
    points.push({ x: nx, y: ny, z: nz, r: rr, g: gg, b: bb });
  }

  let ply = 'ply\nformat ascii 1.0\n';
  ply += `element vertex ${numPoints}\n`;
  ply += 'property float x\nproperty float y\nproperty float z\n';
  ply += 'property uchar red\nproperty uchar green\nproperty uchar blue\n';
  ply += 'end_header\n';
  for (const p of points) {
    ply += `${p.x.toFixed(6)} ${p.y.toFixed(6)} ${p.z.toFixed(6)} ${p.r} ${p.g} ${p.b}\n`;
  }
  writeFileSync(outPath, ply);
  console.log(`Written ${numPoints} points to ${outPath}`);
}

// ── Sample .splat (binary, ~200 splats — a fuzzy sphere) ──────────────────

function generateSphereSplat(outPath, numSplats = 200) {
  const RECORD = 32;
  const buf = Buffer.alloc(numSplats * RECORD);
  for (let i = 0; i < numSplats; i++) {
    // Fibonacci sphere for even distribution
    const phi = Math.acos(1 - 2 * (i + 0.5) / numSplats);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const radius = 1.5;
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);

    const off = i * RECORD;
    buf.writeFloatLE(x, off);
    buf.writeFloatLE(y, off + 4);
    buf.writeFloatLE(z, off + 8);
    // Scale
    const s = 0.08 + Math.random() * 0.04;
    buf.writeFloatLE(s, off + 12);
    buf.writeFloatLE(s, off + 16);
    buf.writeFloatLE(s, off + 20);
    // Colour
    const hue = (i / numSplats) * 360;
    const [r, g, b] = hslToRgb(hue, 0.8, 0.55);
    buf.writeUInt8(r, off + 24);
    buf.writeUInt8(g, off + 25);
    buf.writeUInt8(b, off + 26);
    buf.writeUInt8(200, off + 27); // opacity
    // Rotation (identity quaternion + small random)
    const ax = (Math.random() - 0.5) * 0.2;
    const ay = (Math.random() - 0.5) * 0.2;
    const az = (Math.random() - 0.5) * 0.2;
    const halfAngle = Math.sqrt(ax * ax + ay * ay + az * az);
    let qw = 1, qx = 0, qy = 0, qz = 0;
    if (halfAngle > 0.001) {
      qw = Math.cos(halfAngle);
      const s2 = Math.sin(halfAngle) / halfAngle;
      qx = ax * s2; qy = ay * s2; qz = az * s2;
    }
    // Encode: val * 128 + 128 clamped to [0,255]
    buf.writeUInt8(Math.max(0, Math.min(255, Math.round(qw * 128 + 128))), off + 28);
    buf.writeUInt8(Math.max(0, Math.min(255, Math.round(qx * 128 + 128))), off + 29);
    buf.writeUInt8(Math.max(0, Math.min(255, Math.round(qy * 128 + 128))), off + 30);
    buf.writeUInt8(Math.max(0, Math.min(255, Math.round(qz * 128 + 128))), off + 31);
  }
  writeFileSync(outPath, buf);
  console.log(`Written ${numSplats} splats to ${outPath}`);
}

function hslToRgb(h, s, l) {
  h /= 360;
  let r, g, b;
  if (s === 0) { r = g = b = l; } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p2 = 2 * l - q2;
    r = hue2rgb(p2, q2, h + 1/3);
    g = hue2rgb(p2, q2, h);
    b = hue2rgb(p2, q2, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// ── Run ───────────────────────────────────────────────────────────────────

const pcDir  = join(__dirname, '..', 'examples', 'point-cloud-viewer', 'assets');
const gsDir  = join(__dirname, '..', 'examples', 'gaussian-splats', 'assets');
mkdirSync(pcDir, { recursive: true });
mkdirSync(gsDir, { recursive: true });

generateTorusKnotPLY(join(pcDir, 'sample-torus.ply'), 2000);
generateSphereSplat(join(gsDir, 'sample-sphere.splat'), 500);

console.log('Done!');
