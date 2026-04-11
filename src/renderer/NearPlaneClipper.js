import { Vector4 } from '../math/Vector4.js';

/**
 * NearPlaneClipper - Implements Sutherland-Hodgman clipping against the near plane
 * 
 * Clips triangles in homogeneous clip space against the near plane.
 * For OpenGL-style clip space, the near plane is: z = -w (or z + w = 0)
 * A vertex is "inside" (in front of near) if: z > -w, or equivalently: z + w > 0
 */
export class NearPlaneClipper {
  /**
   * Clip a triangle against the near plane
   * @param {Object} v0 - Vertex 0 with {clip: Vector4, ...attributes}
   * @param {Object} v1 - Vertex 1
   * @param {Object} v2 - Vertex 2
   * @param {number} nearPlane - Near plane distance
   * @returns {Array} Array of 0, 1, or 2 triangles (each triangle is [v0, v1, v2])
   */
  static clipTriangle(v0, v1, v2, nearPlane) {
    const vertices = [v0, v1, v2];
    
    // Test vertices against near plane: w > nearPlane
    // (This is the test for "in front of near plane")
    const inside = vertices.map(v => v.clip.w > nearPlane);
    const insideCount = inside.filter(Boolean).length;

    // All vertices in front - no clipping needed
    if (insideCount === 3) {
      return [[v0, v1, v2]];
    }

    // All vertices behind - discard triangle
    if (insideCount === 0) {
      return [];
    }

    // Partial clipping needed - either 1 or 2 vertices inside
    if (insideCount === 1) {
      // 1 vertex inside, 2 outside - clip to 1 triangle
      return this.clipOneInside(vertices, inside, nearPlane);
    } else {
      // 2 vertices inside, 1 outside - clip to 2 triangles (quad)
      return this.clipTwoInside(vertices, inside, nearPlane);
    }
  }

  /**
   * Clip case: 1 vertex inside, 2 outside
   * Result: 1 triangle
   */
  static clipOneInside(vertices, inside, nearPlane) {
    // Find the inside vertex
    const insideIdx = inside.indexOf(true);
    const vInside = vertices[insideIdx];
    const vOut1 = vertices[(insideIdx + 1) % 3];
    const vOut2 = vertices[(insideIdx + 2) % 3];

    // Create two new vertices at the intersection points
    const vNew1 = this.clipEdge(vInside, vOut1, nearPlane);
    const vNew2 = this.clipEdge(vInside, vOut2, nearPlane);

    // Return single clipped triangle
    return [[vInside, vNew1, vNew2]];
  }

  /**
   * Clip case: 2 vertices inside, 1 outside
   * Result: 2 triangles (forming a quad)
   */
  static clipTwoInside(vertices, inside, nearPlane) {
    // Find the outside vertex
    const outsideIdx = inside.indexOf(false);
    const vOut = vertices[outsideIdx];
    const vIn1 = vertices[(outsideIdx + 1) % 3];
    const vIn2 = vertices[(outsideIdx + 2) % 3];

    // Create two new vertices at the intersection points
    const vNew1 = this.clipEdge(vIn1, vOut, nearPlane);
    const vNew2 = this.clipEdge(vIn2, vOut, nearPlane);

    // Return two triangles forming a quad
    // Triangle 1: [vIn1, vIn2, vNew1]
    // Triangle 2: [vIn2, vNew2, vNew1]
    return [
      [vIn1, vIn2, vNew1],
      [vIn2, vNew2, vNew1]
    ];
  }

  /**
   * Clip an edge against the near plane
   * Returns a new vertex at the intersection point with interpolated attributes
   */
  static clipEdge(vInside, vOutside, nearPlane) {
    const clipIn = vInside.clip;
    const clipOut = vOutside.clip;

    // Calculate intersection parameter t
    // At intersection: w_lerp = nearPlane
    // w_lerp = w_in + t * (w_out - w_in) = nearPlane
    // t = (nearPlane - w_in) / (w_out - w_in)
    const wIn = clipIn.w;
    const wOut = clipOut.w;
    const t = (nearPlane - wIn) / (wOut - wIn);

    // Clamp t to [0, 1] for numerical stability
    const tClamped = Math.max(0, Math.min(1, t));

    // Interpolate clip-space position
    const newClip = new Vector4(
      clipIn.x + tClamped * (clipOut.x - clipIn.x),
      clipIn.y + tClamped * (clipOut.y - clipIn.y),
      clipIn.z + tClamped * (clipOut.z - clipIn.z),
      clipIn.w + tClamped * (clipOut.w - clipIn.w)
    );

    // Create new vertex with interpolated attributes
    const newVertex = {
      clip: newClip
    };

    // Interpolate all other attributes that exist
    const attributeKeys = Object.keys(vInside).filter(key => key !== 'clip');
    
    for (const key of attributeKeys) {
      const attrIn = vInside[key];
      const attrOut = vOutside[key];

      if (attrIn === undefined || attrOut === undefined) continue;

      // Handle Vector3 attributes (position, normal, etc.)
      if (attrIn.isVector3) {
        newVertex[key] = attrIn.clone().lerp(attrOut, tClamped);
      }
      // Handle UV coordinates {x, y}
      else if (typeof attrIn === 'object' && 'x' in attrIn && 'y' in attrIn) {
        newVertex[key] = {
          x: attrIn.x + tClamped * (attrOut.x - attrIn.x),
          y: attrIn.y + tClamped * (attrOut.y - attrIn.y)
        };
      }
      // Handle scalar attributes
      else if (typeof attrIn === 'number') {
        newVertex[key] = attrIn + tClamped * (attrOut - attrIn);
      }
      // For other types, use inside value (conservative)
      else {
        newVertex[key] = attrIn;
      }
    }

    return newVertex;
  }

  /**
   * Test if a vertex is in front of the near plane
   */
  static isInFrontOfNear(clipVertex, nearPlane) {
    return clipVertex.w > nearPlane;
  }
}
