import { Vector2 } from '../math/Vector2.js';
import { Vector3 } from '../math/Vector3.js';

/**
 * Rasterizer - Triangle rasterization using bounding box + barycentric coordinates
 */
export class Rasterizer {
  constructor() {
    // Scratch variables to avoid allocations
    this._edge1 = new Vector3();
    this._edge2 = new Vector3();
    this._normal = new Vector3();
  }

  /**
   * Calculate barycentric coordinates for point p in triangle (v0, v1, v2)
   * Returns { u, v, w } where u + v + w = 1
   */
  barycentric(p, v0, v1, v2) {
    const v0x = v0.x, v0y = v0.y;
    const v1x = v1.x, v1y = v1.y;
    const v2x = v2.x, v2y = v2.y;
    const px = p.x, py = p.y;

    const denom = (v1y - v2y) * (v0x - v2x) + (v2x - v1x) * (v0y - v2y);
    
    if (Math.abs(denom) < 0.0001) {
      return { u: -1, v: -1, w: -1 };
    }

    const u = ((v1y - v2y) * (px - v2x) + (v2x - v1x) * (py - v2y)) / denom;
    const v = ((v2y - v0y) * (px - v2x) + (v0x - v2x) * (py - v2y)) / denom;
    const w = 1.0 - u - v;

    return { u, v, w };
  }

  /**
   * Check if point is inside triangle using barycentric coordinates
   */
  isInsideTriangle(bary) {
    return bary.u >= 0 && bary.v >= 0 && bary.w >= 0;
  }

  /**
   * Backface culling test
   * Returns true if triangle should be culled (facing away)
   */
  shouldCull(v0, v1, v2) {
    // Calculate cross product of edges in screen space
    const edge1x = v1.x - v0.x;
    const edge1y = v1.y - v0.y;
    const edge2x = v2.x - v0.x;
    const edge2y = v2.y - v0.y;

    // Cross product Z component (facing direction)
    const cross = edge1x * edge2y - edge1y * edge2x;

    // Cull if facing away (counter-clockwise in screen space after Y-flip)
    return cross >= 0;
  }

  /**
   * Rasterize a triangle
   * @param {Object} v0 - Vertex 0 with { position, normal, uv, color }
   * @param {Object} v1 - Vertex 1
   * @param {Object} v2 - Vertex 2
   * @param {FrameBuffer} frameBuffer - Target framebuffer
   * @param {DepthBuffer} depthBuffer - Depth buffer
   * @param {Function} fragmentShader - Fragment shader function(bary, v0, v1, v2) => {r, g, b, a}
   * @param {Object} options - Rasterization options { cullBackface, depthTest, depthWrite }
   */
  rasterizeTriangle(v0, v1, v2, frameBuffer, depthBuffer, fragmentShader, options = {}) {
    const { cullBackface = true, depthTest = true, depthWrite = true } = options;

    const p0 = v0.position;
    const p1 = v1.position;
    const p2 = v2.position;

    // Backface culling (happens after projection)
    if (cullBackface && this.shouldCull(p0, p1, p2)) {
      return true;  // Return true to indicate triangle was culled
    }

    // Calculate bounding box
    const minX = Math.max(0, Math.floor(Math.min(p0.x, p1.x, p2.x)));
    const maxX = Math.min(frameBuffer.width - 1, Math.ceil(Math.max(p0.x, p1.x, p2.x)));
    const minY = Math.max(0, Math.floor(Math.min(p0.y, p1.y, p2.y)));
    const maxY = Math.min(frameBuffer.height - 1, Math.ceil(Math.max(p0.y, p1.y, p2.y)));

    // Early exit if triangle is completely outside screen
    if (minX > maxX || minY > maxY) {
      return;
    }

    // Pre-calculate 1/w for perspective-correct interpolation
    const invW0 = 1.0 / v0.w;
    const invW1 = 1.0 / v1.w;
    const invW2 = 1.0 / v2.w;

    // Rasterize pixels in bounding box
    const p = new Vector2();

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        p.set(x + 0.5, y + 0.5); // Sample at pixel center

        // Calculate barycentric coordinates
        const bary = this.barycentric(p, p0, p1, p2);

        // Check if pixel is inside triangle
        if (!this.isInsideTriangle(bary)) {
          continue;
        }

        // Perspective-correct depth interpolation
        // Interpolate clip-space Z and W separately, then divide to get NDC depth
        // This matches GPU depth calculation: NDC_z = clip_z / clip_w
        const oneOverW = bary.u * invW0 + bary.v * invW1 + bary.w * invW2;
        const w = 1.0 / oneOverW;
        
        // Interpolate clip-space Z using perspective-correct formula
        const clipZ = (bary.u * v0.clipZ * invW0 + bary.v * v1.clipZ * invW1 + bary.w * v2.clipZ * invW2) * w;
        // Final depth is clip_z / clip_w, which gives NDC depth
        const depth = clipZ * oneOverW;

        // Depth test and write
        if (depthTest) {
          if (depthWrite) {
            // Test and write depth
            if (!depthBuffer.test(x, y, depth)) {
              continue;
            }
          } else {
            // Test only, don't write depth (for transparent objects)
            if (!depthBuffer.testOnly(x, y, depth)) {
              continue;
            }
          }
        }

        // Run fragment shader
        const color = fragmentShader(bary, v0, v1, v2, invW0, invW1, invW2);

        // Write pixel
        frameBuffer.setPixel(
          x, y,
          Math.floor(color.r * 255),
          Math.floor(color.g * 255),
          Math.floor(color.b * 255),
          Math.floor((color.a !== undefined ? color.a : 1.0) * 255)
        );
      }
    }

    return false;  // Return false to indicate triangle was rendered (not culled)
  }

  /**
   * Perspective-correct attribute interpolation
   * @param {number} u - Barycentric u
   * @param {number} v - Barycentric v
   * @param {number} w - Barycentric w
   * @param {number} a0 - Attribute at vertex 0
   * @param {number} a1 - Attribute at vertex 1
   * @param {number} a2 - Attribute at vertex 2
   * @param {number} invW0 - 1/w at vertex 0
   * @param {number} invW1 - 1/w at vertex 1
   * @param {number} invW2 - 1/w at vertex 2
   */
  static interpolateAttribute(u, v, w, a0, a1, a2, invW0, invW1, invW2) {
    const interpInvW = u * invW0 + v * invW1 + w * invW2;
    return (u * a0 * invW0 + v * a1 * invW1 + w * a2 * invW2) / interpInvW;
  }

  /**
   * Perspective-correct Vector3 interpolation
   */
  static interpolateVector3(u, v, w, v0, v1, v2, invW0, invW1, invW2, out = new Vector3()) {
    const interpInvW = u * invW0 + v * invW1 + w * invW2;
    
    out.x = (u * v0.x * invW0 + v * v1.x * invW1 + w * v2.x * invW2) / interpInvW;
    out.y = (u * v0.y * invW0 + v * v1.y * invW1 + w * v2.y * invW2) / interpInvW;
    out.z = (u * v0.z * invW0 + v * v1.z * invW1 + w * v2.z * invW2) / interpInvW;
    
    return out;
  }

  /**
   * Perspective-correct UV interpolation
   */
  static interpolateUV(u, v, w, uv0, uv1, uv2, invW0, invW1, invW2) {
    const interpInvW = u * invW0 + v * invW1 + w * invW2;
    
    const interpU = (u * uv0.x * invW0 + v * uv1.x * invW1 + w * uv2.x * invW2) / interpInvW;
    const interpV = (u * uv0.y * invW0 + v * uv1.y * invW1 + w * uv2.y * invW2) / interpInvW;
    
    return { x: interpU, y: interpV };
  }
}
