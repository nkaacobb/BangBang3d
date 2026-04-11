import { BufferGeometry } from './BufferGeometry.js';
import { BufferAttribute } from './BufferAttribute.js';

/**
 * DodecahedronGeometry - Creates a dodecahedron (12 pentagonal faces, triangulated)
 * One of the five Platonic solids
 */
export class DodecahedronGeometry extends BufferGeometry {
  constructor(radius = 1) {
    super();

    this.type = 'DodecahedronGeometry';
    this.parameters = { radius };

    // Golden ratio
    const t = (1 + Math.sqrt(5)) / 2;
    const r = 1 / t;

    const scale = radius / Math.sqrt(3);

    // Dodecahedron has 20 vertices
    const vertices = [
      // Cube vertices
      -1, -1, -1,   -1, -1,  1,   -1,  1, -1,   -1,  1,  1,
       1, -1, -1,    1, -1,  1,    1,  1, -1,    1,  1,  1,
      // Rectangle in xy plane
       0, -r, -t,    0, -r,  t,    0,  r, -t,    0,  r,  t,
      // Rectangle in yz plane
      -r, -t,  0,   -r,  t,  0,    r, -t,  0,    r,  t,  0,
      // Rectangle in zx plane
      -t,  0, -r,    t,  0, -r,   -t,  0,  r,    t,  0,  r
    ];

    // Scale vertices
    for (let i = 0; i < vertices.length; i++) {
      vertices[i] *= scale;
    }

    // Dodecahedron faces (12 pentagons, each split into 3 triangles from center)
    // Each pentagon: we'll triangulate from a center point
    const indices = [
      // Pentagon 1: 0, 1, 9, 11, 18
      0, 1, 9,   0, 9, 11,   0, 11, 18,
      // Pentagon 2: 2, 3, 11, 13, 10
      2, 3, 11,  2, 11, 13,  2, 13, 10,
      // Pentagon 3: 4, 6, 17, 8, 16
      4, 6, 17,  4, 17, 8,   4, 8, 16,
      // Pentagon 4: 5, 7, 15, 19, 14
      5, 7, 15,  5, 15, 19,  5, 19, 14,
      // Pentagon 5: 0, 18, 2, 10, 8
      0, 18, 2,  0, 2, 10,   0, 10, 8,
      // Pentagon 6: 1, 9, 5, 14, 12
      1, 9, 5,   1, 5, 14,   1, 14, 12,
      // Pentagon 7: 3, 11, 9, 5, 19
      3, 11, 9,  3, 9, 5,    3, 5, 19,
      // Pentagon 8: 4, 16, 0, 8, 17
      4, 16, 0,  4, 0, 8,    8, 0, 16,
      // Pentagon 9: 6, 7, 15, 13, 17
      6, 7, 15,  6, 15, 13,  6, 13, 17,
      // Pentagon 10: 2, 18, 16, 4, 6
      2, 18, 16, 2, 16, 4,   2, 4, 6,
      // Pentagon 11: 7, 19, 3, 13, 15
      7, 19, 3,  7, 3, 13,   7, 13, 15,
      // Pentagon 12: 10, 12, 14, 19, 11
      10, 12, 14, 10, 14, 19, 10, 19, 11,
      // Additional
      1, 12, 18, 1, 18, 0,   6, 17, 13, 12, 10, 18
    ];

    // Calculate normals and UVs
    const normals = [];
    const uvs = [];

    const faceCount = indices.length / 3;
    for (let i = 0; i < faceCount; i++) {
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
      if (len > 0) {
        normal[0] /= len;
        normal[1] /= len;
        normal[2] /= len;
      }

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
