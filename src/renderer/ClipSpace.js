import { Vector3 } from '../math/Vector3.js';
import { Vector4 } from '../math/Vector4.js';

/**
 * ClipSpace - Handles vertex transformation to clip space and screen space
 */
export class ClipSpace {
  /**
   * Transform vertex to clip space
   * @param {Vector3} vertex - World space vertex
   * @param {Matrix4} mvpMatrix - Model-View-Projection matrix
   * @param {Vector4} out - Output clip space vertex
   */
  static toClipSpace(vertex, mvpMatrix, out = new Vector4()) {
    out.set(vertex.x, vertex.y, vertex.z, 1.0);
    out.applyMatrix4(mvpMatrix);
    return out;
  }

  /**
   * Perform perspective divide
   * @param {Vector4} clipVertex - Clip space vertex
   * @param {Vector3} out - Output NDC vertex
   */
  static toNDC(clipVertex, out = new Vector3()) {
    // Guard against divide-by-zero only
    if (Math.abs(clipVertex.w) < 0.0001) {
      out.set(0, 0, 0);
      return out;
    }

    const invW = 1.0 / clipVertex.w;
    out.set(
      clipVertex.x * invW,
      clipVertex.y * invW,
      clipVertex.z * invW
    );
    return out;
  }

  /**
   * Transform from NDC to screen space
   * @param {Vector3} ndcVertex - NDC vertex (-1 to 1)
   * @param {number} width - Screen width
   * @param {number} height - Screen height
   * @param {Vector3} out - Output screen space vertex
   */
  static toScreenSpace(ndcVertex, width, height, out = new Vector3()) {
    out.set(
      (ndcVertex.x + 1.0) * 0.5 * width,
      (1.0 - ndcVertex.y) * 0.5 * height,  // Flip Y for screen coordinates
      ndcVertex.z
    );
    return out;
  }

  /**
   * Check if vertex is inside clip space
   * @param {Vector4} clipVertex - Clip space vertex
   */
  static isInClipSpace(clipVertex) {
    const w = Math.abs(clipVertex.w);
    return (
      Math.abs(clipVertex.x) <= w &&
      Math.abs(clipVertex.y) <= w &&
      Math.abs(clipVertex.z) <= w
    );
  }

  /**
   * Simple near plane clipping test
   * Returns true if vertex is in front of near plane
   */
  static isInFrontOfNear(clipVertex, nearPlane = 0.5) {
    return clipVertex.w > nearPlane;
  }
}
