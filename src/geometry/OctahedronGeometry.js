import { BufferGeometry } from './BufferGeometry.js';
import { BufferAttribute } from './BufferAttribute.js';

/**
 * OctahedronGeometry - Creates an octahedron (8 triangular faces)
 * One of the five Platonic solids
 */
export class OctahedronGeometry extends BufferGeometry {
  constructor(radius = 1) {
    super();

    this.type = 'OctahedronGeometry';
    this.parameters = { radius };

    // Octahedron vertices (6 vertices at axis endpoints)
    const vertices = [
       radius,  0,  0,  // v0: +X
      -radius,  0,  0,  // v1: -X
       0,  radius,  0,  // v2: +Y
       0, -radius,  0,  // v3: -Y
       0,  0,  radius,  // v4: +Z
       0,  0, -radius   // v5: -Z
    ];

    // Indices for 8 triangular faces
    const indices = [
      0, 2, 4,  // top-front-right
      4, 2, 1,  // top-front-left
      1, 2, 5,  // top-back-left
      5, 2, 0,  // top-back-right
      0, 4, 3,  // bottom-front-right
      4, 1, 3,  // bottom-front-left
      1, 5, 3,  // bottom-back-left
      5, 0, 3   // bottom-back-right
    ];

    // Calculate normals and UVs for each face
    const normals = [];
    const uvs = [];

    for (let i = 0; i < 8; i++) {
      const i0 = indices[i * 3 + 0];
      const i1 = indices[i * 3 + 1];
      const i2 = indices[i * 3 + 2];

      // Get vertices
      const v0 = [vertices[i0 * 3], vertices[i0 * 3 + 1], vertices[i0 * 3 + 2]];
      const v1 = [vertices[i1 * 3], vertices[i1 * 3 + 1], vertices[i1 * 3 + 2]];
      const v2 = [vertices[i2 * 3], vertices[i2 * 3 + 1], vertices[i2 * 3 + 2]];

      // Calculate face normal
      const edge1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
      const edge2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
      
      const normal = [
        edge1[1] * edge2[2] - edge1[2] * edge2[1],
        edge1[2] * edge2[0] - edge1[0] * edge2[2],
        edge1[0] * edge2[1] - edge1[1] * edge2[0]
      ];

      // Normalize
      const len = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
      normal[0] /= len;
      normal[1] /= len;
      normal[2] /= len;

      // Assign same normal to all 3 vertices (flat shading)
      for (let j = 0; j < 3; j++) {
        normals.push(normal[0], normal[1], normal[2]);
      }

      // UVs for triangle
      uvs.push(0.5, 0, 1, 1, 0, 1);
    }

    // Expand vertices array
    const expandedVertices = [];
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      expandedVertices.push(
        vertices[idx * 3],
        vertices[idx * 3 + 1],
        vertices[idx * 3 + 2]
      );
    }

    // Build geometry
    this.setIndex(Array.from({ length: indices.length }, (_, i) => i));
    this.setAttribute('position', new BufferAttribute(new Float32Array(expandedVertices), 3));
    this.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
    this.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  }
}
