import { BufferGeometry } from './BufferGeometry.js';
import { BufferAttribute } from './BufferAttribute.js';

/**
 * SphereGeometry - UV sphere with latitude/longitude subdivision
 * 
 * Generates a textured sphere with proper UV coordinates and normals.
 * Handles texture seam by duplicating vertices at u=0 and u=1.
 * 
 * @param {number} radius - Sphere radius (default: 1)
 * @param {number} widthSegments - Horizontal subdivisions (default: 16, min: 3)
 * @param {number} heightSegments - Vertical subdivisions (default: 12, min: 2)
 */
export class SphereGeometry extends BufferGeometry {
  constructor(radius = 1, widthSegments = 16, heightSegments = 12) {
    super();

    this.type = 'SphereGeometry';

    // Clamp segments to valid ranges
    widthSegments = Math.max(3, Math.floor(widthSegments));
    heightSegments = Math.max(2, Math.floor(heightSegments));

    const vertices = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    // Generate vertices, normals, and UVs
    for (let iy = 0; iy <= heightSegments; iy++) {
      const v = iy / heightSegments; // [0, 1] from top to bottom
      const phi = v * Math.PI; // [0, PI] latitude angle

      for (let ix = 0; ix <= widthSegments; ix++) {
        const u = ix / widthSegments; // [0, 1] around the sphere
        const theta = u * Math.PI * 2; // [0, 2PI] longitude angle

        // Spherical to Cartesian coordinates
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        const x = -radius * sinPhi * cosTheta;
        const y = radius * cosPhi;
        const z = radius * sinPhi * sinTheta;

        // Position
        vertices.push(x, y, z);

        // Normal (normalized position for unit sphere, scaled for actual radius)
        normals.push(-sinPhi * cosTheta, cosPhi, sinPhi * sinTheta);

        // UV coordinates
        uvs.push(u, v);
      }
    }

    // Generate indices
    for (let iy = 0; iy < heightSegments; iy++) {
      for (let ix = 0; ix < widthSegments; ix++) {
        const a = iy * (widthSegments + 1) + ix;
        const b = a + widthSegments + 1;
        const c = a + 1;
        const d = b + 1;

        // Create two triangles for each quad
        indices.push(a, b, d);
        indices.push(a, d, c);
      }
    }

    // Convert to typed arrays
    const positionArray = new Float32Array(vertices);
    const normalArray = new Float32Array(normals);
    const uvArray = new Float32Array(uvs);

    // Set attributes
    this.setIndex(indices); // Pass plain array, not typed array
    this.setAttribute('position', new BufferAttribute(positionArray, 3));
    this.setAttribute('normal', new BufferAttribute(normalArray, 3));
    this.setAttribute('uv', new BufferAttribute(uvArray, 2));

    // Store parameters
    this.parameters = {
      radius,
      widthSegments,
      heightSegments
    };
  }
}
