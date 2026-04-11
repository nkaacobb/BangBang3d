import { BufferGeometry } from './BufferGeometry.js';
import { BufferAttribute } from './BufferAttribute.js';

/**
 * IcosahedronGeometry - Creates an icosahedron (20 triangular faces)
 * One of the five Platonic solids
 */
export class IcosahedronGeometry extends BufferGeometry {
  constructor(radius = 1) {
    super();

    this.type = 'IcosahedronGeometry';
    this.parameters = { radius };

    // Golden ratio
    const t = (1 + Math.sqrt(5)) / 2;
    const scale = radius / Math.sqrt(1 + t * t);

    // Icosahedron has 12 vertices
    const vertices = [
      -1,  t,  0,   0,  1,  t,   0,  1, -t,  // top ring
      -1, -t,  0,   0, -1, -t,   0, -1,  t,  // bottom ring
       t,  0,  1,   t,  0, -1,  -t,  0, -1,  // middle ring 1
      -t,  0,  1,   1,  t,  0,   1, -t,  0   // middle ring 2
    ];

    // Scale vertices
    for (let i = 0; i < vertices.length; i++) {
      vertices[i] *= scale;
    }

    // 20 triangular faces
    const indices = [
      0, 9, 1,   0, 1, 10,   1, 6, 10,   1, 9, 6,   9, 5, 6,
      0, 2, 9,   2, 8, 9,    2, 7, 8,    7, 4, 8,   4, 5, 8,
      10, 6, 11, 6, 5, 11,   5, 4, 11,   4, 3, 11,  3, 10, 11,
      0, 10, 2,  2, 10, 7,   7, 10, 3,   3, 4, 7,   8, 5, 9
    ];

    // Calculate normals and UVs
    const normals = [];
    const uvs = [];

    for (let i = 0; i < 20; i++) {
      const i0 = indices[i * 3 + 0];
      const i1 = indices[i * 3 + 1];
      const i2 = indices[i * 3 + 2];

      const v0 = [vertices[i0 * 3], vertices[i0 * 3 + 1], vertices[i0 * 3 + 2]];
      const v1 = [vertices[i1 * 3], vertices[i1 * 3 + 1], vertices[i1 * 3 + 2]];
      const v2 = [vertices[i2 * 3], vertices[i2 * 3 + 1], vertices[i2 * 3 + 2]];

      const edge1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
      const edge2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
      
      const normal = [
        edge1[1] * edge2[2] - edge1[2] * edge2[1],
        edge1[2] * edge2[0] - edge1[0] * edge2[2],
        edge1[0] * edge2[1] - edge1[1] * edge2[0]
      ];

      const len = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
      normal[0] /= len;
      normal[1] /= len;
      normal[2] /= len;

      for (let j = 0; j < 3; j++) {
        normals.push(normal[0], normal[1], normal[2]);
      }

      uvs.push(0.5, 0, 1, 1, 0, 1);
    }

    // Expand vertices
    const expandedVertices = [];
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      expandedVertices.push(
        vertices[idx * 3],
        vertices[idx * 3 + 1],
        vertices[idx * 3 + 2]
      );
    }

    this.setIndex(Array.from({ length: indices.length }, (_, i) => i));
    this.setAttribute('position', new BufferAttribute(new Float32Array(expandedVertices), 3));
    this.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
    this.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  }
}
