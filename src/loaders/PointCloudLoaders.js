import { PointCloud } from '../core/PointCloud.js';
import { GaussianSplatCloud } from '../core/GaussianSplatCloud.js';

/**
 * PLYLoader — loads binary-little-endian and ASCII PLY files into a PointCloud.
 *
 * Supported properties:
 *   x, y, z     — position (float)
 *   red, green, blue — colour 0-255 (uchar) or float
 *   f_dc_0, f_dc_1, f_dc_2 — Gaussian splat spherical-harmonic DC colour
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
    if (options.as === 'splat' || options.as === 'gaussian-splat' || options.as === 'gaussian-splats') {
      return PLYLoader.parseGaussianSplats(data, options);
    }

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
    const hasSHColor = 'f_dc_0' in propIndex && 'f_dc_1' in propIndex && 'f_dc_2' in propIndex;
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
        } else if (hasSHColor) {
          colors[i3]     = PLYLoader._shDcToByte(vals[propIndex.f_dc_0]);
          colors[i3 + 1] = PLYLoader._shDcToByte(vals[propIndex.f_dc_1]);
          colors[i3 + 2] = PLYLoader._shDcToByte(vals[propIndex.f_dc_2]);
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
            colors[i * 3]     = PLYLoader._colorToByte(PLYLoader._readScalar(dv, base + propOffsets[propIndex.red], properties[propIndex.red].type));
            colors[i * 3 + 1] = PLYLoader._colorToByte(PLYLoader._readScalar(dv, base + propOffsets[propIndex.green], properties[propIndex.green].type));
            colors[i * 3 + 2] = PLYLoader._colorToByte(PLYLoader._readScalar(dv, base + propOffsets[propIndex.blue], properties[propIndex.blue].type));
          }
        } else if (hasSHColor) {
          colors[i * 3]     = PLYLoader._shDcToByte(PLYLoader._readScalar(dv, base + propOffsets[propIndex.f_dc_0], properties[propIndex.f_dc_0].type));
          colors[i * 3 + 1] = PLYLoader._shDcToByte(PLYLoader._readScalar(dv, base + propOffsets[propIndex.f_dc_1], properties[propIndex.f_dc_1].type));
          colors[i * 3 + 2] = PLYLoader._shDcToByte(PLYLoader._readScalar(dv, base + propOffsets[propIndex.f_dc_2], properties[propIndex.f_dc_2].type));
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

  /** Return true when a PLY file contains common 3D Gaussian Splatting vertex fields. */
  static hasGaussianSplatProperties(data) {
    const { propIndex } = PLYLoader._readHeader(data);
    return 'x' in propIndex && 'y' in propIndex && 'z' in propIndex &&
      'f_dc_0' in propIndex && 'f_dc_1' in propIndex && 'f_dc_2' in propIndex;
  }

  /** Parse a 3DGS-style PLY into a GaussianSplatCloud. */
  static parseGaussianSplats(data, options = {}) {
    const isString = typeof data === 'string';
    const { format, vertexCount, properties, propIndex, byteOffset } = PLYLoader._readHeader(data);

    if (!PLYLoader.hasGaussianSplatProperties(data)) {
      throw new Error('PLYLoader: PLY does not contain Gaussian splat colour fields f_dc_0, f_dc_1, f_dc_2');
    }

    const positions = new Float32Array(vertexCount * 3);
    const colors = new Uint8Array(vertexCount * 4);
    const scales = new Float32Array(vertexCount * 3);
    const rotations = new Float32Array(vertexCount * 4);

    const readRowValue = (values, name, fallback = 0) => {
      const index = propIndex[name];
      return index === undefined ? fallback : values[index];
    };

    const writeVertex = (vertexIndex, getValue) => {
      const positionOffset = vertexIndex * 3;
      const colorOffset = vertexIndex * 4;
      positions[positionOffset] = getValue('x');
      positions[positionOffset + 1] = getValue('y');
      positions[positionOffset + 2] = getValue('z');

      colors[colorOffset] = PLYLoader._shDcToByte(getValue('f_dc_0'));
      colors[colorOffset + 1] = PLYLoader._shDcToByte(getValue('f_dc_1'));
      colors[colorOffset + 2] = PLYLoader._shDcToByte(getValue('f_dc_2'));
      colors[colorOffset + 3] = PLYLoader._opacityToByte(getValue('opacity', 2.2));

      scales[positionOffset] = Math.exp(getValue('scale_0', Math.log(0.04)));
      scales[positionOffset + 1] = Math.exp(getValue('scale_1', Math.log(0.04)));
      scales[positionOffset + 2] = Math.exp(getValue('scale_2', Math.log(0.04)));

      const quat = PLYLoader._normalizeQuaternion(
        getValue('rot_0', 1),
        getValue('rot_1', 0),
        getValue('rot_2', 0),
        getValue('rot_3', 0)
      );
      rotations[colorOffset] = quat[0];
      rotations[colorOffset + 1] = quat[1];
      rotations[colorOffset + 2] = quat[2];
      rotations[colorOffset + 3] = quat[3];
    };

    if (format === 'ascii' || isString) {
      const allText = isString ? data : new TextDecoder().decode(data);
      const dataStr = allText.substring(allText.indexOf('end_header') + 'end_header'.length).trim();
      const dataLines = dataStr.split(/\r?\n/);
      for (let i = 0; i < vertexCount && i < dataLines.length; i++) {
        const values = dataLines[i].trim().split(/\s+/).map(Number);
        writeVertex(i, (name, fallback = 0) => readRowValue(values, name, fallback));
      }
    } else if (format === 'binary_little_endian') {
      let stride = 0;
      const propOffsets = [];
      for (const property of properties) {
        propOffsets.push(stride);
        stride += PLYLoader._typeSize(property.type);
      }

      const dv = new DataView(data, byteOffset);
      for (let i = 0; i < vertexCount; i++) {
        const base = i * stride;
        writeVertex(i, (name, fallback = 0) => {
          const index = propIndex[name];
          if (index === undefined) return fallback;
          return PLYLoader._readScalar(dv, base + propOffsets[index], properties[index].type);
        });
      }
    } else {
      throw new Error(`PLYLoader: unsupported format "${format}"`);
    }

    const cloud = new GaussianSplatCloud(options);
    cloud.setData(positions, colors, scales, rotations);
    return cloud;
  }

  /** Load a 3DGS-style PLY from URL, returns Promise<GaussianSplatCloud>. */
  static async loadGaussianSplats(url, options = {}) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`PLYLoader: fetch failed ${url} (${resp.status})`);
    const buf = await resp.arrayBuffer();
    return PLYLoader.parseGaussianSplats(buf, options);
  }

  static _readHeader(data) {
    const isString = typeof data === 'string';
    const text = isString ? data : new TextDecoder().decode(new Uint8Array(data, 0, Math.min(data.byteLength, 65536)));
    const headerEnd = text.indexOf('end_header');
    if (headerEnd === -1) throw new Error('PLYLoader: no end_header found');

    const headerStr = text.substring(0, headerEnd);
    const lines = headerStr.split(/\r?\n/);
    let vertexCount = 0;
    const properties = [];
    let inVertexElement = false;
    let format = 'ascii';

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

    const propIndex = {};
    properties.forEach((property, index) => { propIndex[property.name] = index; });

    let byteOffset = 0;
    if (!isString) {
      const u8 = new Uint8Array(data);
      for (let i = 0; i < Math.min(u8.length - 10, 65536); i++) {
        if (u8[i] === 0x65 && u8[i + 1] === 0x6E && u8[i + 2] === 0x64 && u8[i + 3] === 0x5F &&
            u8[i + 4] === 0x68 && u8[i + 5] === 0x65 && u8[i + 6] === 0x61 && u8[i + 7] === 0x64 &&
            u8[i + 8] === 0x65 && u8[i + 9] === 0x72) {
          byteOffset = i + 10;
          while (byteOffset < u8.length && (u8[byteOffset] === 0x0A || u8[byteOffset] === 0x0D)) byteOffset++;
          break;
        }
      }
    }

    return { format, vertexCount, properties, propIndex, byteOffset };
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

  static _readScalar(dv, offset, type) {
    switch (type) {
      case 'char': case 'int8': return dv.getInt8(offset);
      case 'uchar': case 'uint8': return dv.getUint8(offset);
      case 'short': case 'int16': return dv.getInt16(offset, true);
      case 'ushort': case 'uint16': return dv.getUint16(offset, true);
      case 'int': case 'int32': return dv.getInt32(offset, true);
      case 'uint': case 'uint32': return dv.getUint32(offset, true);
      case 'double': case 'float64': return dv.getFloat64(offset, true);
      case 'float': case 'float32': default: return dv.getFloat32(offset, true);
    }
  }

  static _colorToByte(value) {
    if (!Number.isFinite(value)) return 200;
    const scaled = value <= 1 ? value * 255 : value;
    return Math.max(0, Math.min(255, Math.round(scaled)));
  }

  static _shDcToByte(value) {
    const SH_C0 = 0.28209479177387814;
    if (!Number.isFinite(value)) return 200;
    const linear = Math.max(0, Math.min(1, value * SH_C0 + 0.5));
    return Math.round(linear * 255);
  }

  static _opacityToByte(value) {
    if (!Number.isFinite(value)) return 230;
    const alpha = 1 / (1 + Math.exp(-value));
    return Math.max(0, Math.min(255, Math.round(alpha * 255)));
  }

  static _normalizeQuaternion(w, x, y, z) {
    const length = Math.sqrt(w * w + x * x + y * y + z * z) || 1;
    return [w / length, x / length, y / length, z / length];
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
 * SOGLoader — loads PlayCanvas Spatially Ordered Gaussians (.sog).
 *
 * A bundled .sog file is a ZIP archive with meta.json and property images:
 * means_l/u, scales, quats, and sh0. This loader decodes those textures into
 * the existing GaussianSplatCloud arrays. Higher-order SH textures are ignored
 * for now; the current renderer consumes DC color and opacity.
 */
export class SOGLoader {
  static async load(url, options = {}) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`SOGLoader: fetch failed ${url} (${resp.status})`);
    const buf = await resp.arrayBuffer();
    return SOGLoader.parse(buf, options);
  }

  static async parse(data, options = {}) {
    const entries = await SOGLoader._readZipEntries(data);
    return SOGLoader._parseEntries(entries, options);
  }

  static async parseFileSet(files, options = {}) {
    const entries = new Map();
    for (const file of files) {
      const name = SOGLoader._normalizePath(file.webkitRelativePath || file.name);
      entries.set(name, new Uint8Array(await file.arrayBuffer()));
    }
    return SOGLoader._parseEntries(entries, options);
  }

  static async _parseEntries(entries, options) {
    const metaName = [...entries.keys()].find(name => name.endsWith('meta.json'));
    if (!metaName) throw new Error('SOGLoader: meta.json not found');

    const meta = JSON.parse(new TextDecoder().decode(entries.get(metaName)));
    if (meta.version !== 2) throw new Error(`SOGLoader: unsupported version ${meta.version}`);

    const basePath = metaName.includes('/') ? metaName.slice(0, metaName.lastIndexOf('/') + 1) : '';
    const getFileBytes = (name) => {
      const normalized = SOGLoader._normalizePath(name);
      const candidates = [normalized, `${basePath}${normalized}`, normalized.split('/').pop()];
      for (const candidate of candidates) {
        if (entries.has(candidate)) return entries.get(candidate);
      }
      throw new Error(`SOGLoader: missing file ${name}`);
    };

    const images = {
      meansL: await SOGLoader._decodeImage(getFileBytes(meta.means.files[0]), meta.means.files[0]),
      meansU: await SOGLoader._decodeImage(getFileBytes(meta.means.files[1]), meta.means.files[1]),
      scales: await SOGLoader._decodeImage(getFileBytes(meta.scales.files[0]), meta.scales.files[0]),
      quats: await SOGLoader._decodeImage(getFileBytes(meta.quats.files[0]), meta.quats.files[0]),
      sh0: await SOGLoader._decodeImage(getFileBytes(meta.sh0.files[0]), meta.sh0.files[0])
    };

    return SOGLoader._decodeSogData(meta, images, options);
  }

  static _decodeSogData(meta, images, options = {}) {
    const count = meta.count | 0;
    if (count <= 0) throw new Error('SOGLoader: meta.count must be greater than zero');

    const { meansL, meansU, scales: scalesImage, quats, sh0 } = images;
    const width = meansL.width;
    const height = meansL.height;
    if (count > width * height) throw new Error('SOGLoader: meta.count exceeds image capacity');

    for (const [name, image] of Object.entries(images)) {
      if (image.width !== width || image.height !== height) {
        throw new Error(`SOGLoader: image dimensions mismatch for ${name}`);
      }
    }

    const positions = new Float32Array(count * 3);
    const colors = new Uint8Array(count * 4);
    const scales = new Float32Array(count * 3);
    const rotations = new Float32Array(count * 4);
    const scaleCodebook = meta.scales.codebook;
    const colorCodebook = meta.sh0.codebook;
    const meansMins = meta.means.mins;
    const meansMaxs = meta.means.maxs;

    for (let i = 0; i < count; i++) {
      const pixelOffset = i * 4;
      const positionOffset = i * 3;
      const rotationOffset = i * 4;

      const qx = (meansU.data[pixelOffset] << 8) | meansL.data[pixelOffset];
      const qy = (meansU.data[pixelOffset + 1] << 8) | meansL.data[pixelOffset + 1];
      const qz = (meansU.data[pixelOffset + 2] << 8) | meansL.data[pixelOffset + 2];

      positions[positionOffset] = SOGLoader._unlog(SOGLoader._lerp(meansMins[0], meansMaxs[0], qx / 65535));
      positions[positionOffset + 1] = SOGLoader._unlog(SOGLoader._lerp(meansMins[1], meansMaxs[1], qy / 65535));
      positions[positionOffset + 2] = SOGLoader._unlog(SOGLoader._lerp(meansMins[2], meansMaxs[2], qz / 65535));

      scales[positionOffset] = scaleCodebook[scalesImage.data[pixelOffset]] ?? 0.04;
      scales[positionOffset + 1] = scaleCodebook[scalesImage.data[pixelOffset + 1]] ?? 0.04;
      scales[positionOffset + 2] = scaleCodebook[scalesImage.data[pixelOffset + 2]] ?? 0.04;

      const quaternion = SOGLoader._decodeQuaternion(
        quats.data[pixelOffset],
        quats.data[pixelOffset + 1],
        quats.data[pixelOffset + 2],
        quats.data[pixelOffset + 3]
      );
      rotations[rotationOffset] = quaternion[3];
      rotations[rotationOffset + 1] = quaternion[0];
      rotations[rotationOffset + 2] = quaternion[1];
      rotations[rotationOffset + 3] = quaternion[2];

      colors[rotationOffset] = SOGLoader._sogColorToByte(colorCodebook[sh0.data[pixelOffset]]);
      colors[rotationOffset + 1] = SOGLoader._sogColorToByte(colorCodebook[sh0.data[pixelOffset + 1]]);
      colors[rotationOffset + 2] = SOGLoader._sogColorToByte(colorCodebook[sh0.data[pixelOffset + 2]]);
      colors[rotationOffset + 3] = sh0.data[pixelOffset + 3];
    }

    const cloud = new GaussianSplatCloud(options);
    cloud.setData(positions, colors, scales, rotations);
    return cloud;
  }

  static async _readZipEntries(data) {
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const eocdOffset = SOGLoader._findEndOfCentralDirectory(dv);
    if (eocdOffset < 0) throw new Error('SOGLoader: .sog file is not a ZIP archive');

    const entryCount = dv.getUint16(eocdOffset + 10, true);
    let centralOffset = dv.getUint32(eocdOffset + 16, true);
    const entries = new Map();

    for (let i = 0; i < entryCount; i++) {
      if (dv.getUint32(centralOffset, true) !== 0x02014b50) {
        throw new Error('SOGLoader: invalid ZIP central directory');
      }

      const method = dv.getUint16(centralOffset + 10, true);
      const compressedSize = dv.getUint32(centralOffset + 20, true);
      const uncompressedSize = dv.getUint32(centralOffset + 24, true);
      const nameLength = dv.getUint16(centralOffset + 28, true);
      const extraLength = dv.getUint16(centralOffset + 30, true);
      const commentLength = dv.getUint16(centralOffset + 32, true);
      const localOffset = dv.getUint32(centralOffset + 42, true);
      const nameBytes = u8.slice(centralOffset + 46, centralOffset + 46 + nameLength);
      const name = SOGLoader._normalizePath(new TextDecoder().decode(nameBytes));

      if (!name.endsWith('/')) {
        if (dv.getUint32(localOffset, true) !== 0x04034b50) {
          throw new Error(`SOGLoader: invalid local header for ${name}`);
        }
        const localNameLength = dv.getUint16(localOffset + 26, true);
        const localExtraLength = dv.getUint16(localOffset + 28, true);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const compressed = u8.slice(dataStart, dataStart + compressedSize);
        const bytes = method === 0
          ? compressed
          : await SOGLoader._inflateRaw(compressed, uncompressedSize, name);
        entries.set(name, bytes);
      }

      centralOffset += 46 + nameLength + extraLength + commentLength;
    }

    return entries;
  }

  static _findEndOfCentralDirectory(dv) {
    const minOffset = Math.max(0, dv.byteLength - 65557);
    for (let offset = dv.byteLength - 22; offset >= minOffset; offset--) {
      if (dv.getUint32(offset, true) === 0x06054b50) return offset;
    }
    return -1;
  }

  static async _inflateRaw(data, expectedSize, name) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error(`SOGLoader: ZIP entry ${name} is deflated, but DecompressionStream is unavailable`);
    }

    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    if (expectedSize > 0 && bytes.length !== expectedSize) {
      throw new Error(`SOGLoader: invalid inflated size for ${name}`);
    }
    return bytes;
  }

  static async _decodeImage(bytes, filename = '') {
    if (typeof createImageBitmap === 'undefined') {
      throw new Error('SOGLoader: image decoding requires browser createImageBitmap support');
    }

    const mimeType = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/webp';
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType }), { colorSpaceConversion: 'none' });
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(bitmap.width, bitmap.height)
      : document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    if (bitmap.close) bitmap.close();
    return { width: imageData.width, height: imageData.height, data: imageData.data };
  }

  static _decodeQuaternion(r, g, b, alpha) {
    const toComp = (value) => (value / 255 - 0.5) * 2 / Math.SQRT2;
    const a = toComp(r);
    const keptB = toComp(g);
    const c = toComp(b);
    const mode = alpha - 252;
    const omitted = Math.sqrt(Math.max(0, 1 - a * a - keptB * keptB - c * c));

    switch (mode) {
      case 0: return [omitted, a, keptB, c];
      case 1: return [a, omitted, keptB, c];
      case 2: return [a, keptB, omitted, c];
      case 3: return [a, keptB, c, omitted];
      default: throw new Error(`SOGLoader: invalid quaternion mode ${mode}`);
    }
  }

  static _sogColorToByte(value) {
    const SH_C0 = 0.28209479177387814;
    if (!Number.isFinite(value)) return 200;
    return Math.max(0, Math.min(255, Math.round((0.5 + value * SH_C0) * 255)));
  }

  static _lerp(min, max, t) {
    return min + (max - min) * t;
  }

  static _unlog(value) {
    return Math.sign(value) * (Math.exp(Math.abs(value)) - 1);
  }

  static _normalizePath(path) {
    return path.replace(/\\/g, '/').replace(/^\.\//, '');
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
