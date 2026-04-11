/**
 * BVH (Bounding Volume Hierarchy) Builder
 * 
 * Builds a flat-array BVH from triangle data using SAH (Surface Area Heuristic).
 * Output is a GPU-friendly flat node array for stack-based traversal in WGSL.
 * 
 * Node layout (8 floats per node):
 *   [minX, minY, minZ, leftOrTriStart, maxX, maxY, maxZ, rightOrTriCount]
 *   - Interior node: leftOrTriStart = left child index, rightOrTriCount = right child index (bit 31 clear)
 *   - Leaf node: leftOrTriStart = first triangle index, rightOrTriCount = count | 0x80000000 (bit 31 set)
 */
export class BVHBuilder {
  /**
   * Build BVH from triangle data.
   * @param {Float32Array} positions - xyz per vertex, 9 floats per triangle
   * @param {number} triCount - number of triangles
   * @param {object} [options]
   * @param {number} [options.maxLeafSize=4] - max triangles per leaf
   * @param {number} [options.sahBuckets=12] - SAH bucket count
   * @returns {{ nodes: Float32Array, triIndices: Uint32Array, nodeCount: number }}
   */
  static build(positions, triCount, options = {}) {
    const { maxLeafSize = 4, sahBuckets = 12 } = options;

    if (triCount === 0) {
      console.warn('[BVHBuilder] Empty geometry — creating single empty node');
      return {
        nodes: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0x80000000]),
        triIndices: new Uint32Array(0),
        nodeCount: 1
      };
    }

    // Pre-compute triangle centroids and AABBs
    const centroids = new Float32Array(triCount * 3);
    const triBBMin = new Float32Array(triCount * 3);
    const triBBMax = new Float32Array(triCount * 3);
    const triIndices = new Uint32Array(triCount);

    for (let i = 0; i < triCount; i++) {
      triIndices[i] = i;
      const base = i * 9;
      const v0x = positions[base], v0y = positions[base + 1], v0z = positions[base + 2];
      const v1x = positions[base + 3], v1y = positions[base + 4], v1z = positions[base + 5];
      const v2x = positions[base + 6], v2y = positions[base + 7], v2z = positions[base + 8];

      triBBMin[i * 3] = Math.min(v0x, v1x, v2x);
      triBBMin[i * 3 + 1] = Math.min(v0y, v1y, v2y);
      triBBMin[i * 3 + 2] = Math.min(v0z, v1z, v2z);
      triBBMax[i * 3] = Math.max(v0x, v1x, v2x);
      triBBMax[i * 3 + 1] = Math.max(v0y, v1y, v2y);
      triBBMax[i * 3 + 2] = Math.max(v0z, v1z, v2z);

      centroids[i * 3] = (v0x + v1x + v2x) / 3;
      centroids[i * 3 + 1] = (v0y + v1y + v2y) / 3;
      centroids[i * 3 + 2] = (v0z + v1z + v2z) / 3;
    }

    // Allocate flat node array (worst case: 2*triCount - 1 nodes, 8 floats each)
    const maxNodes = Math.max(2 * triCount, 16);
    const nodesF32 = new Float32Array(maxNodes * 8);
    let nodeCount = 0;

    function allocNode() {
      const idx = nodeCount++;
      if (idx >= maxNodes) throw new Error('[BVHBuilder] Node array overflow');
      return idx;
    }

    function surfaceArea(minX, minY, minZ, maxX, maxY, maxZ) {
      const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
      return 2 * (dx * dy + dx * dz + dy * dz);
    }

    function computeBounds(start, count) {
      let mnx = Infinity, mny = Infinity, mnz = Infinity;
      let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
      for (let i = start; i < start + count; i++) {
        const ti = triIndices[i];
        mnx = Math.min(mnx, triBBMin[ti * 3]);
        mny = Math.min(mny, triBBMin[ti * 3 + 1]);
        mnz = Math.min(mnz, triBBMin[ti * 3 + 2]);
        mxx = Math.max(mxx, triBBMax[ti * 3]);
        mxy = Math.max(mxy, triBBMax[ti * 3 + 1]);
        mxz = Math.max(mxz, triBBMax[ti * 3 + 2]);
      }
      return [mnx, mny, mnz, mxx, mxy, mxz];
    }

    function buildNode(start, count) {
      const nodeIdx = allocNode();
      const base = nodeIdx * 8;
      const [mnx, mny, mnz, mxx, mxy, mxz] = computeBounds(start, count);

      nodesF32[base] = mnx; nodesF32[base + 1] = mny; nodesF32[base + 2] = mnz;
      nodesF32[base + 4] = mxx; nodesF32[base + 5] = mxy; nodesF32[base + 6] = mxz;

      // Leaf?
      if (count <= maxLeafSize) {
        // Store triStart as uint32 (WGSL reads via bitcast<u32>)
        const dv = new DataView(nodesF32.buffer, nodesF32.byteOffset);
        dv.setUint32((base + 3) * 4, start >>> 0, true);
        // Set bit 31 via DataView to mark leaf and store count
        dv.setUint32((base + 7) * 4, (count | 0x80000000) >>> 0, true);
        return nodeIdx;
      }

      // Find best SAH split
      const parentSA = surfaceArea(mnx, mny, mnz, mxx, mxy, mxz);
      let bestCost = Infinity;
      let bestAxis = -1;
      let bestSplitIdx = -1;

      for (let axis = 0; axis < 3; axis++) {
        // Compute centroid bounds along axis
        let cmin = Infinity, cmax = -Infinity;
        for (let i = start; i < start + count; i++) {
          const c = centroids[triIndices[i] * 3 + axis];
          if (c < cmin) cmin = c;
          if (c > cmax) cmax = c;
        }

        if (cmax - cmin < 1e-10) continue; // flat along axis

        // Bucket assignment
        const buckets = new Array(sahBuckets);
        for (let b = 0; b < sahBuckets; b++) {
          buckets[b] = {
            count: 0,
            mnx: Infinity, mny: Infinity, mnz: Infinity,
            mxx: -Infinity, mxy: -Infinity, mxz: -Infinity
          };
        }
        const invRange = sahBuckets / (cmax - cmin);
        for (let i = start; i < start + count; i++) {
          const ti = triIndices[i];
          const c = centroids[ti * 3 + axis];
          let b = ((c - cmin) * invRange) | 0;
          if (b >= sahBuckets) b = sahBuckets - 1;
          buckets[b].count++;
          buckets[b].mnx = Math.min(buckets[b].mnx, triBBMin[ti * 3]);
          buckets[b].mny = Math.min(buckets[b].mny, triBBMin[ti * 3 + 1]);
          buckets[b].mnz = Math.min(buckets[b].mnz, triBBMin[ti * 3 + 2]);
          buckets[b].mxx = Math.max(buckets[b].mxx, triBBMax[ti * 3]);
          buckets[b].mxy = Math.max(buckets[b].mxy, triBBMax[ti * 3 + 1]);
          buckets[b].mxz = Math.max(buckets[b].mxz, triBBMax[ti * 3 + 2]);
        }

        // Sweep left-to-right for SAH cost at each split
        const leftSA = new Float32Array(sahBuckets - 1);
        const leftCount = new Int32Array(sahBuckets - 1);
        let lmnx = Infinity, lmny = Infinity, lmnz = Infinity;
        let lmxx = -Infinity, lmxy = -Infinity, lmxz = -Infinity;
        let lCount = 0;
        for (let i = 0; i < sahBuckets - 1; i++) {
          const b = buckets[i];
          if (b.count > 0) {
            lmnx = Math.min(lmnx, b.mnx); lmny = Math.min(lmny, b.mny); lmnz = Math.min(lmnz, b.mnz);
            lmxx = Math.max(lmxx, b.mxx); lmxy = Math.max(lmxy, b.mxy); lmxz = Math.max(lmxz, b.mxz);
          }
          lCount += b.count;
          leftSA[i] = lCount > 0 ? surfaceArea(lmnx, lmny, lmnz, lmxx, lmxy, lmxz) : 0;
          leftCount[i] = lCount;
        }

        let rmnx = Infinity, rmny = Infinity, rmnz = Infinity;
        let rmxx = -Infinity, rmxy = -Infinity, rmxz = -Infinity;
        let rCount = 0;
        for (let i = sahBuckets - 1; i >= 1; i--) {
          const b = buckets[i];
          if (b.count > 0) {
            rmnx = Math.min(rmnx, b.mnx); rmny = Math.min(rmny, b.mny); rmnz = Math.min(rmnz, b.mnz);
            rmxx = Math.max(rmxx, b.mxx); rmxy = Math.max(rmxy, b.mxy); rmxz = Math.max(rmxz, b.mxz);
          }
          rCount += b.count;
          const rSA = rCount > 0 ? surfaceArea(rmnx, rmny, rmnz, rmxx, rmxy, rmxz) : 0;
          const cost = 0.125 + (leftCount[i - 1] * leftSA[i - 1] + rCount * rSA) / parentSA;
          if (cost < bestCost) {
            bestCost = cost;
            bestAxis = axis;
            bestSplitIdx = i;
          }
        }
      }

      // If SAH split isn't better than leaf cost, make a leaf
      const leafCost = count;
      if (bestAxis === -1 || bestCost >= leafCost) {
        const dv = new DataView(nodesF32.buffer, nodesF32.byteOffset);
        dv.setUint32((base + 3) * 4, start >>> 0, true);
        dv.setUint32((base + 7) * 4, (count | 0x80000000) >>> 0, true);
        return nodeIdx;
      }

      // Partition triIndices[start..start+count) by the chosen split
      const cmin2 = (() => {
        let cm = Infinity;
        for (let i = start; i < start + count; i++) {
          const c = centroids[triIndices[i] * 3 + bestAxis];
          if (c < cm) cm = c;
        }
        return cm;
      })();
      const cmax2 = (() => {
        let cm = -Infinity;
        for (let i = start; i < start + count; i++) {
          const c = centroids[triIndices[i] * 3 + bestAxis];
          if (c > cm) cm = c;
        }
        return cm;
      })();
      const invRange2 = sahBuckets / (cmax2 - cmin2 || 1);

      // Dutch National Flag partition
      let mid = start;
      let hi = start + count;
      let lo = start;
      // Simple partition: all with bucket < bestSplitIdx go left
      for (let i = lo; i < hi;) {
        const ti = triIndices[i];
        const c = centroids[ti * 3 + bestAxis];
        let b = ((c - cmin2) * invRange2) | 0;
        if (b >= sahBuckets) b = sahBuckets - 1;
        if (b < bestSplitIdx) {
          // swap to left
          const tmp = triIndices[lo]; triIndices[lo] = triIndices[i]; triIndices[i] = tmp;
          lo++;
          i++;
        } else {
          i++;
        }
      }
      mid = lo;

      // Ensure we don't degenerate (at least 1 on each side)
      if (mid === start) mid = start + 1;
      if (mid === start + count) mid = start + count - 1;

      const leftCount2 = mid - start;
      const rightCount2 = count - leftCount2;

      const leftChild = buildNode(start, leftCount2);
      const rightChild = buildNode(mid, rightCount2);

      // Store child indices as uint32 (WGSL reads via bitcast<u32>)
      const dv = new DataView(nodesF32.buffer, nodesF32.byteOffset);
      dv.setUint32((base + 3) * 4, leftChild >>> 0, true);
      // Store right child index with bit 31 clear (interior)
      dv.setUint32((base + 7) * 4, rightChild >>> 0, true);

      return nodeIdx;
    }

    buildNode(0, triCount);

    // Trim to actual size
    const finalNodes = new Float32Array(nodesF32.buffer, 0, nodeCount * 8);

    // Validation
    BVHBuilder._validate(finalNodes, nodeCount, triIndices, triCount, positions);

    console.log(`[BVHBuilder] Built BVH: ${triCount} triangles → ${nodeCount} nodes`);

    return {
      nodes: finalNodes,
      triIndices,
      nodeCount
    };
  }

  /**
   * Validate BVH structure.
   * @private
   */
  static _validate(nodes, nodeCount, triIndices, triCount, positions) {
    const dv = new DataView(nodes.buffer, nodes.byteOffset);
    let leafTriTotal = 0;

    for (let i = 0; i < nodeCount; i++) {
      const base = i * 8;
      const mnx = nodes[base], mny = nodes[base + 1], mnz = nodes[base + 2];
      const mxx = nodes[base + 4], mxy = nodes[base + 5], mxz = nodes[base + 6];

      // Bounds valid
      if (mnx > mxx || mny > mxy || mnz > mxz) {
        console.error(`[BVHBuilder] Invalid bounds at node ${i}:`, mnx, mny, mnz, '→', mxx, mxy, mxz);
      }

      const field7 = dv.getUint32((base + 7) * 4, true);
      const isLeaf = (field7 & 0x80000000) !== 0;

      if (isLeaf) {
        const triStart = nodes[base + 3] | 0;
        const triCountLeaf = field7 & 0x7FFFFFFF;
        leafTriTotal += triCountLeaf;

        if (triStart < 0 || triStart + triCountLeaf > triCount) {
          console.error(`[BVHBuilder] Leaf ${i}: triStart=${triStart} count=${triCountLeaf} out of range (total=${triCount})`);
        }
      } else {
        const leftChild = nodes[base + 3] | 0;
        const rightChild = field7;
        if (leftChild < 0 || leftChild >= nodeCount || rightChild >= nodeCount) {
          console.error(`[BVHBuilder] Interior ${i}: child indices out of range: left=${leftChild} right=${rightChild} nodeCount=${nodeCount}`);
        }
      }
    }

    if (leafTriTotal !== triCount) {
      console.warn(`[BVHBuilder] Leaf triangle sum (${leafTriTotal}) ≠ total (${triCount})`);
    }
  }
}
