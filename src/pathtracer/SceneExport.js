/**
 * Scene Export — flattens scene graph into GPU-friendly flat buffers for path tracing.
 *
 * Exports:
 *  - Triangle data (positions, normals, UVs) in world space
 *  - Material buffer (baseColor, metallic, roughness, emissive, etc.)
 *  - Emissive triangle list (for explicit light sampling)
 *  - Camera state
 */
export class SceneExport {
  /**
   * Export scene to flat arrays.
   * @param {import('../core/Scene.js').Scene} scene
   * @param {import('../core/Camera.js').Camera} camera
   * @param {object} [options]
   * @param {number} [options.maxTriangles=2000000]
   * @returns {SceneData}
   */
  static export(scene, camera, options = {}) {
    const { maxTriangles = 2_000_000 } = options;

    const meshes = [];
    scene.traverse(obj => {
      if (obj.isMesh && obj.visible && obj.geometry) {
        meshes.push(obj);
      }
    });

    if (meshes.length === 0) {
      console.warn('[SceneExport] No meshes in scene');
      return SceneExport._emptyData(camera);
    }

    // Count total triangles first
    let totalTris = 0;
    for (const mesh of meshes) {
      const geo = mesh.geometry;
      const posAttr = geo.getAttribute('position');
      if (!posAttr) continue;
      const idx = geo.index;
      totalTris += idx ? (idx.count / 3) | 0 : (posAttr.count / 3) | 0;
    }

    if (totalTris > maxTriangles) {
      console.error(`[SceneExport] Triangle count ${totalTris} exceeds limit ${maxTriangles}. Truncating.`);
      totalTris = maxTriangles;
    }

    // Allocate buffers
    // Per-triangle: 9 floats for positions, 9 for normals, 6 for UVs, 1 uint for materialId = 25 values
    const positions = new Float32Array(totalTris * 9);   // v0xyz, v1xyz, v2xyz per tri
    const normals = new Float32Array(totalTris * 9);
    const uvs = new Float32Array(totalTris * 6);         // v0uv, v1uv, v2uv
    const materialIds = new Uint32Array(totalTris);

    // Materials
    const materialMap = new Map(); // material -> index
    const materialsList = [];

    let triIdx = 0;

    for (const mesh of meshes) {
      if (triIdx >= totalTris) break;

      const geo = mesh.geometry;
      const posAttr = geo.getAttribute('position');
      if (!posAttr) continue;
      const normAttr = geo.getAttribute('normal');
      const uvAttr = geo.getAttribute('uv');
      const idx = geo.index;

      // Ensure world matrix is current
      mesh.updateMatrixWorld(true);
      const matWorld = mesh.matrixWorld.elements;

      // Get or register material
      const mat = mesh.material;
      let matId;
      if (materialMap.has(mat)) {
        matId = materialMap.get(mat);
      } else {
        matId = materialsList.length;
        materialMap.set(mat, matId);
        materialsList.push(mat);
      }

      const triCountMesh = idx ? (idx.count / 3) | 0 : (posAttr.count / 3) | 0;

      for (let t = 0; t < triCountMesh && triIdx < totalTris; t++, triIdx++) {
        const i0 = idx ? idx.array[t * 3] : t * 3;
        const i1 = idx ? idx.array[t * 3 + 1] : t * 3 + 1;
        const i2 = idx ? idx.array[t * 3 + 2] : t * 3 + 2;

        // Transform positions to world space
        for (let vi = 0; vi < 3; vi++) {
          const vertIdx = [i0, i1, i2][vi];
          const lx = posAttr.array[vertIdx * 3];
          const ly = posAttr.array[vertIdx * 3 + 1];
          const lz = posAttr.array[vertIdx * 3 + 2];

          // matWorld is column-major
          const wx = matWorld[0] * lx + matWorld[4] * ly + matWorld[8] * lz + matWorld[12];
          const wy = matWorld[1] * lx + matWorld[5] * ly + matWorld[9] * lz + matWorld[13];
          const wz = matWorld[2] * lx + matWorld[6] * ly + matWorld[10] * lz + matWorld[14];

          positions[triIdx * 9 + vi * 3] = wx;
          positions[triIdx * 9 + vi * 3 + 1] = wy;
          positions[triIdx * 9 + vi * 3 + 2] = wz;
        }

        // Transform normals (use upper-left 3x3 of matWorld, no translation)
        if (normAttr) {
          for (let vi = 0; vi < 3; vi++) {
            const vertIdx = [i0, i1, i2][vi];
            const nx = normAttr.array[vertIdx * 3];
            const ny = normAttr.array[vertIdx * 3 + 1];
            const nz = normAttr.array[vertIdx * 3 + 2];
            // Normal transform (approximate for uniform scale)
            let wnx = matWorld[0] * nx + matWorld[4] * ny + matWorld[8] * nz;
            let wny = matWorld[1] * nx + matWorld[5] * ny + matWorld[9] * nz;
            let wnz = matWorld[2] * nx + matWorld[6] * ny + matWorld[10] * nz;
            const len = Math.sqrt(wnx * wnx + wny * wny + wnz * wnz) || 1;
            normals[triIdx * 9 + vi * 3] = wnx / len;
            normals[triIdx * 9 + vi * 3 + 1] = wny / len;
            normals[triIdx * 9 + vi * 3 + 2] = wnz / len;
          }
        } else {
          // Compute face normal from positions
          const bx = triIdx * 9;
          const e1x = positions[bx + 3] - positions[bx], e1y = positions[bx + 4] - positions[bx + 1], e1z = positions[bx + 5] - positions[bx + 2];
          const e2x = positions[bx + 6] - positions[bx], e2y = positions[bx + 7] - positions[bx + 1], e2z = positions[bx + 8] - positions[bx + 2];
          let fnx = e1y * e2z - e1z * e2y, fny = e1z * e2x - e1x * e2z, fnz = e1x * e2y - e1y * e2x;
          const len = Math.sqrt(fnx * fnx + fny * fny + fnz * fnz) || 1;
          fnx /= len; fny /= len; fnz /= len;
          for (let vi = 0; vi < 3; vi++) {
            normals[triIdx * 9 + vi * 3] = fnx;
            normals[triIdx * 9 + vi * 3 + 1] = fny;
            normals[triIdx * 9 + vi * 3 + 2] = fnz;
          }
        }

        // UVs (no transform needed)
        if (uvAttr) {
          for (let vi = 0; vi < 3; vi++) {
            const vertIdx = [i0, i1, i2][vi];
            uvs[triIdx * 6 + vi * 2] = uvAttr.array[vertIdx * 2] || 0;
            uvs[triIdx * 6 + vi * 2 + 1] = uvAttr.array[vertIdx * 2 + 1] || 0;
          }
        }

        materialIds[triIdx] = matId;
      }
    }

    // Pack materials: 12 floats per material
    // [baseR, baseG, baseB, metallic, roughness, emR, emG, emB, emIntensity, opacity, ior, flags]
    const materialData = new Float32Array(materialsList.length * 12);
    for (let i = 0; i < materialsList.length; i++) {
      const m = materialsList[i];
      const b = i * 12;
      const color = m.color || { r: 0.8, g: 0.8, b: 0.8 };
      materialData[b] = color.r;
      materialData[b + 1] = color.g;
      materialData[b + 2] = color.b;
      materialData[b + 3] = m.metallic ?? 0;
      materialData[b + 4] = m.roughness ?? 0.5;
      const emissive = m.emissive || { r: 0, g: 0, b: 0 };
      materialData[b + 5] = emissive.r;
      materialData[b + 6] = emissive.g;
      materialData[b + 7] = emissive.b;
      materialData[b + 8] = m.emissiveIntensity ?? 1.0;
      materialData[b + 9] = m.opacity ?? 1.0;
      materialData[b + 10] = m.ior ?? 1.5;
      // Flags: bit0 = transparent, bit1 = doubleSided
      let flags = 0;
      if (m.transparent) flags |= 1;
      if (m.side === 'DoubleSide') flags |= 2;
      materialData[b + 11] = flags;
    }

    // Emissive triangle list for light sampling
    const emissiveTris = [];
    for (let i = 0; i < triIdx; i++) {
      const matSlot = materialIds[i];
      const mb = matSlot * 12;
      const emR = materialData[mb + 5], emG = materialData[mb + 6], emB = materialData[mb + 7];
      const emInt = materialData[mb + 8];
      if ((emR + emG + emB) * emInt > 0.001) {
        // Compute triangle area
        const b = i * 9;
        const e1x = positions[b + 3] - positions[b], e1y = positions[b + 4] - positions[b + 1], e1z = positions[b + 5] - positions[b + 2];
        const e2x = positions[b + 6] - positions[b], e2y = positions[b + 7] - positions[b + 1], e2z = positions[b + 8] - positions[b + 2];
        const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
        const area = Math.sqrt(cx * cx + cy * cy + cz * cz) * 0.5;
        const power = (emR + emG + emB) / 3 * emInt * area;
        emissiveTris.push({ triIndex: i, area, power });
      }
    }

    // Build emissive CDF for importance sampling
    let totalPower = 0;
    for (const et of emissiveTris) totalPower += et.power;
    // Pack: [triIndex, area, cdfValue, pad] per entry = 4 floats
    const emissiveData = new Float32Array(Math.max(emissiveTris.length, 1) * 4);
    let cumPower = 0;
    for (let i = 0; i < emissiveTris.length; i++) {
      cumPower += emissiveTris[i].power;
      emissiveData[i * 4] = emissiveTris[i].triIndex;
      emissiveData[i * 4 + 1] = emissiveTris[i].area;
      emissiveData[i * 4 + 2] = cumPower / (totalPower || 1);
      emissiveData[i * 4 + 3] = 0;
    }

    // Camera data (16 floats)
    const camData = SceneExport._packCamera(camera);

    const result = {
      positions: positions.subarray(0, triIdx * 9),
      normals: normals.subarray(0, triIdx * 9),
      uvs: uvs.subarray(0, triIdx * 6),
      materialIds: materialIds.subarray(0, triIdx),
      materialData,
      materialCount: materialsList.length,
      emissiveData,
      emissiveCount: emissiveTris.length,
      totalPower,
      triangleCount: triIdx,
      cameraData: camData,
      hasEnvironment: !!(scene.environment || scene.backgroundTexture),
      environmentIntensity: scene.environmentIntensity ?? 1.0
    };

    console.log(`[SceneExport] ${triIdx} triangles, ${materialsList.length} materials, ${emissiveTris.length} emissive tris`);

    return result;
  }

  /**
   * Pack camera into 16-float buffer.
   * [posX, posY, posZ, fov, rightX, rightY, rightZ, aspect, upX, upY, upZ, nearZ, forwardX, forwardY, forwardZ, farZ]
   */
  static _packCamera(camera) {
    const data = new Float32Array(16);
    const e = camera.matrixWorld.elements;
    // Position (column 3)
    data[0] = e[12]; data[1] = e[13]; data[2] = e[14];
    data[3] = (camera.fov || 60) * Math.PI / 180;
    // Right (column 0)
    data[4] = e[0]; data[5] = e[1]; data[6] = e[2];
    data[7] = camera.aspect || 1;
    // Up (column 1)
    data[8] = e[4]; data[9] = e[5]; data[10] = e[6];
    data[11] = camera.near || 0.1;
    // Forward (negative column 2 — camera looks along -Z)
    data[12] = -e[8]; data[13] = -e[9]; data[14] = -e[10];
    data[15] = camera.far || 100;
    return data;
  }

  static _emptyData(camera) {
    return {
      positions: new Float32Array(0),
      normals: new Float32Array(0),
      uvs: new Float32Array(0),
      materialIds: new Uint32Array(0),
      materialData: new Float32Array(12), // 1 dummy material
      materialCount: 1,
      emissiveData: new Float32Array(4),
      emissiveCount: 0,
      totalPower: 0,
      triangleCount: 0,
      cameraData: SceneExport._packCamera(camera),
      hasEnvironment: false,
      environmentIntensity: 1.0
    };
  }
}
