import { PointCloud } from '../core/PointCloud.js';
import { GaussianSplatCloud } from '../core/GaussianSplatCloud.js';

/**
 * PLYLoader — loads binary-little-endian and ASCII PLY files into a PointCloud.
 *
 * Supported properties:
 *   x, y, z     — position (float)
 *   red, green, blue — colour 0-255 (uchar) or float
 *   nx, ny, nz  — normals (ignored for point clouds, reserved)
 *   scalar_intensity / intensity — mapped to grey if no rgb present
 */
export class PLYLoader {
  /**
   * @param {ArrayBuffer|string} data  ArrayBuffer (binary) or string (ASCII)
   * @param {object} [options]
   * @returns {PointCloud}
   */
  static parse(data, options = {}) {
    const isString = typeof data === 'string';
    const text = isString ? data : new TextDecoder().decode(new Uint8Array(data, 0, Math.min(data.byteLength, 4096)));
    const headerEnd = text.indexOf('end_header');
    if (headerEnd === -1) throw new Error('PLYLoader: no end_header found');
    const headerStr = text.substring(0, headerEnd);

    // Parse header
    const lines = headerStr.split(/\r?\n/);
    let vertexCount = 0;
    const properties = [];
    let inVertexElement = false;
    let format = 'ascii'; // 'ascii' | 'binary_little_endian'

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts[0] === 'format') format = parts[1];
      if (parts[0] === 'element' && parts[1] === 'vertex') {
        vertexCount = parseInt(parts[2], 10);
        inVertexElement = true;
      } else if (parts[0] === 'element') {
        inVertexElement = false;
      }
      if (inVertexElement && parts[0] === 'property') {
        properties.push({ type: parts[1], name: parts[2] });
      }
    }

    if (vertexCount === 0) throw new Error('PLYLoader: no vertices found');

    // Map property names to indices
    const propIndex = {};
    properties.forEach((p, i) => { propIndex[p.name] = i; });

    const positions = new Float32Array(vertexCount * 3);
    const colors = new Uint8Array(vertexCount * 3);
    const hasRGB = 'red' in propIndex && 'green' in propIndex && 'blue' in propIndex;
    const hasIntensity = 'intensity' in propIndex || 'scalar_intensity' in propIndex;

    if (format === 'ascii' || isString) {
      const allText = isString ? data : new TextDecoder().decode(data);
      const dataStr = allText.substring(allText.indexOf('end_header') + 'end_header'.length).trim();
      const dataLines = dataStr.split(/\r?\n/);
      for (let i = 0; i < vertexCount && i < dataLines.length; i++) {
        const vals = dataLines[i].trim().split(/\s+/).map(Number);
        const i3 = i * 3;
        positions[i3]     = vals[propIndex.x] || 0;
        positions[i3 + 1] = vals[propIndex.y] || 0;
        positions[i3 + 2] = vals[propIndex.z] || 0;
        if (hasRGB) {
          const rProp = properties[propIndex.red];
          const scale = rProp.type === 'float' || rProp.type === 'float32' || rProp.type === 'double' ? 255 : 1;
          colors[i3]     = Math.min(255, (vals[propIndex.red] * scale) | 0);
          colors[i3 + 1] = Math.min(255, (vals[propIndex.green] * scale) | 0);
          colors[i3 + 2] = Math.min(255, (vals[propIndex.blue] * scale) | 0);
        } else if (hasIntensity) {
          const idx = propIndex.intensity ?? propIndex.scalar_intensity;
          const g = Math.min(255, (vals[idx] * 255) | 0);
          colors[i3] = colors[i3 + 1] = colors[i3 + 2] = g;
        } else {
          colors[i3] = colors[i3 + 1] = colors[i3 + 2] = 200;
        }
      }
    } else if (format === 'binary_little_endian') {
      // Find byte offset after "end_header\n"
      const headerBytes = new TextEncoder().encode(headerStr + '\nend_header\n');
      let byteOffset = 0;
      const u8 = new Uint8Array(data);
      // Scan for end_header
      for (let i = 0; i < Math.min(u8.length, 8192); i++) {
        if (u8[i] === 0x65 && u8[i+1] === 0x6E && u8[i+2] === 0x64 && u8[i+3] === 0x5F &&
            u8[i+4] === 0x68 && u8[i+5] === 0x65 && u8[i+6] === 0x61 && u8[i+7] === 0x64 &&
            u8[i+8] === 0x65 && u8[i+9] === 0x72) {
          byteOffset = i + 10;
          // Skip the newline character(s)
          while (byteOffset < u8.length && (u8[byteOffset] === 0x0A || u8[byteOffset] === 0x0D)) byteOffset++;
          break;
        }
      }

      // Calculate stride
      let stride = 0;
      const propOffsets = [];
      for (const p of properties) {
        propOffsets.push(stride);
        stride += PLYLoader._typeSize(p.type);
      }

      const dv = new DataView(data, byteOffset);
      for (let i = 0; i < vertexCount; i++) {
        const base = i * stride;
        positions[i * 3]     = dv.getFloat32(base + propOffsets[propIndex.x], true);
        positions[i * 3 + 1] = dv.getFloat32(base + propOffsets[propIndex.y], true);
        positions[i * 3 + 2] = dv.getFloat32(base + propOffsets[propIndex.z], true);
        if (hasRGB) {
          const rType = properties[propIndex.red].type;
          if (rType === 'uchar' || rType === 'uint8') {
            colors[i * 3]     = dv.getUint8(base + propOffsets[propIndex.red]);
            colors[i * 3 + 1] = dv.getUint8(base + propOffsets[propIndex.green]);
            colors[i * 3 + 2] = dv.getUint8(base + propOffsets[propIndex.blue]);
          } else {
            colors[i * 3]     = Math.min(255, (dv.getFloat32(base + propOffsets[propIndex.red], true) * 255) | 0);
            colors[i * 3 + 1] = Math.min(255, (dv.getFloat32(base + propOffsets[propIndex.green], true) * 255) | 0);
            colors[i * 3 + 2] = Math.min(255, (dv.getFloat32(base + propOffsets[propIndex.blue], true) * 255) | 0);
          }
        } else {
          colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = 200;
        }
      }
    } else {
      throw new Error(`PLYLoader: unsupported format "${format}"`);
    }

    const pc = new PointCloud(options);
    pc.setData(positions, colors);
    return pc;
  }

  /** Load from URL, returns Promise<PointCloud> */
  static async load(url, options = {}) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`PLYLoader: fetch failed ${url} (${resp.status})`);
    const buf = await resp.arrayBuffer();
    return PLYLoader.parse(buf, options);
  }

  static _typeSize(t) {
    switch (t) {
      case 'char': case 'int8': case 'uchar': case 'uint8': return 1;
      case 'short': case 'int16': case 'ushort': case 'uint16': return 2;
      case 'int': case 'int32': case 'uint': case 'uint32': case 'float': case 'float32': return 4;
      case 'double': case 'float64': return 8;
      default: return 4;
    }
  }
}


/**
 * SplatLoader — loads the common headerless ".splat" binary format.
 *
 * Record layout (32 bytes per splat):
 *   float32 x, y, z        — position (12 bytes)
 *   float32 sx, sy, sz     — scale    (12 bytes)
 *   uint8   r, g, b, a     — colour   (4 bytes)
 *   uint8   qw, qx, qy, qz — rotation as normalised quaternion  (4 bytes)
 *                             (each stored as (q * 128 + 128) clamped to [0,255])
 *
 * Total: 32 bytes per splat, headerless binary file.
 *
 * This layout matches the widely-used ".splat" format from
 * antimatter15/splat and many other 3DGS viewers.
 */
export class SplatLoader {
  /**
   * @param {ArrayBuffer} data  Raw .splat binary
   * @param {object} [options]
   * @returns {GaussianSplatCloud}
   */
  static parse(data, options = {}) {
    const RECORD = 32;
    const count = (data.byteLength / RECORD) | 0;
    if (count === 0) throw new Error('SplatLoader: empty or invalid data');

    const positions  = new Float32Array(count * 3);
    const colors     = new Uint8Array(count * 4);
    const scales     = new Float32Array(count * 3);
    const rotations  = new Float32Array(count * 4);

    const dv = new DataView(data);
    for (let i = 0; i < count; i++) {
      const off = i * RECORD;
      // Position
      positions[i * 3]     = dv.getFloat32(off,     true);
      positions[i * 3 + 1] = dv.getFloat32(off + 4, true);
      positions[i * 3 + 2] = dv.getFloat32(off + 8, true);
      // Scale
      scales[i * 3]     = dv.getFloat32(off + 12, true);
      scales[i * 3 + 1] = dv.getFloat32(off + 16, true);
      scales[i * 3 + 2] = dv.getFloat32(off + 20, true);
      // Colour RGBA
      colors[i * 4]     = dv.getUint8(off + 24);
      colors[i * 4 + 1] = dv.getUint8(off + 25);
      colors[i * 4 + 2] = dv.getUint8(off + 26);
      colors[i * 4 + 3] = dv.getUint8(off + 27);
      // Rotation quaternion (decode from uint8)
      const qw = (dv.getUint8(off + 28) - 128) / 128;
      const qx = (dv.getUint8(off + 29) - 128) / 128;
      const qy = (dv.getUint8(off + 30) - 128) / 128;
      const qz = (dv.getUint8(off + 31) - 128) / 128;
      // Normalise
      const len = Math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz) || 1;
      rotations[i * 4]     = qw / len;
      rotations[i * 4 + 1] = qx / len;
      rotations[i * 4 + 2] = qy / len;
      rotations[i * 4 + 3] = qz / len;
    }

    const cloud = new GaussianSplatCloud(options);
    cloud.setData(positions, colors, scales, rotations);
    return cloud;
  }

  /** Load from URL, returns Promise<GaussianSplatCloud> */
  static async load(url, options = {}) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`SplatLoader: fetch failed ${url} (${resp.status})`);
    const buf = await resp.arrayBuffer();
    return SplatLoader.parse(buf, options);
  }
}


/**
 * XYZRGBLoader — loads simple text files with one point per line:
 *   x y z r g b
 * Whitespace-separated, colours 0-255.
 */
export class XYZRGBLoader {
  static parse(text, options = {}) {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim().length > 0 && !l.startsWith('#'));
    const count = lines.length;
    const positions = new Float32Array(count * 3);
    const colors = new Uint8Array(count * 3);
    for (let i = 0; i < count; i++) {
      const parts = lines[i].trim().split(/\s+/).map(Number);
      positions[i * 3]     = parts[0] || 0;
      positions[i * 3 + 1] = parts[1] || 0;
      positions[i * 3 + 2] = parts[2] || 0;
      colors[i * 3]     = Math.min(255, parts[3] || 200);
      colors[i * 3 + 1] = Math.min(255, parts[4] || 200);
      colors[i * 3 + 2] = Math.min(255, parts[5] || 200);
    }
    const pc = new PointCloud(options);
    pc.setData(positions, colors);
    return pc;
  }

  static async load(url, options = {}) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`XYZRGBLoader: fetch failed ${url} (${resp.status})`);
    const text = await resp.text();
    return XYZRGBLoader.parse(text, options);
  }
}
