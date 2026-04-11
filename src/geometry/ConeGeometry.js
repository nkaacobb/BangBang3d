import { BufferGeometry } from './BufferGeometry.js';
import { BufferAttribute } from './BufferAttribute.js';

/**
 * ConeGeometry - Cone with circular base
 * 
 * Generates a cone pointing upward along the Y axis.
 * Base is centered at origin, apex at (0, height, 0).
 * 
 * @param {number} radius - Base radius (default: 1)
 * @param {number} height - Cone height along Y axis (default: 1)
 * @param {number} radialSegments - Number of segments around the circumference (default: 8, min: 3)
 * @param {number} heightSegments - Number of vertical segments (default: 1, min: 1)
 * @param {boolean} openEnded - Whether to close the base (default: false)
 */
export class ConeGeometry extends BufferGeometry {
  constructor(radius = 1, height = 1, radialSegments = 8, heightSegments = 1, openEnded = false) {
    super();

    this.type = 'ConeGeometry';
    
    // Store parameters for reference
    this.parameters = {
      radius: radius,
      height: height,
      radialSegments: radialSegments,
      heightSegments: heightSegments,
      openEnded: openEnded
    };

    // Clamp segments to valid ranges
    radialSegments = Math.max(3, Math.floor(radialSegments));
    heightSegments = Math.max(1, Math.floor(heightSegments));

    const vertices = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    let index = 0;
    const indexArray = [];
    const halfHeight = height / 2;

    // Generate torso (side of cone)
    for (let y = 0; y <= heightSegments; y++) {
      const indexRow = [];
      const v = y / heightSegments;
      const yPos = v * height - halfHeight;
      
      // Radius tapers from base to apex
      const radiusY = radius * (1 - v);

      for (let x = 0; x <= radialSegments; x++) {
        const u = x / radialSegments;
        const theta = u * Math.PI * 2;

        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        // Position
        vertices.push(radiusY * cosTheta, yPos, radiusY * sinTheta);

        // Normal calculation for cone surface
        // The slope of the cone creates an angle with the vertical
        const slope = radius / height;
        const normalLength = Math.sqrt(1 + slope * slope);
        normals.push(cosTheta / normalLength, slope / normalLength, sinTheta / normalLength);

        // UV
        uvs.push(u, v);

        indexRow.push(index++);
      }

      indexArray.push(indexRow);
    }

    // Generate indices for torso
    for (let y = 0; y < heightSegments; y++) {
      for (let x = 0; x < radialSegments; x++) {
        const a = indexArray[y][x];
        const b = indexArray[y + 1][x];
        const c = indexArray[y + 1][x + 1];
        const d = indexArray[y][x + 1];

        // Create two triangles for each quad
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    // Generate base cap (if not open ended)
    if (!openEnded && radius > 0) {
      const baseIndexStart = index;

      // Center vertex of base
      vertices.push(0, -halfHeight, 0);
      normals.push(0, -1, 0);
      uvs.push(0.5, 0.5);
      index++;

      // Base perimeter vertices
      for (let x = 0; x <= radialSegments; x++) {
        const u = x / radialSegments;
        const theta = u * Math.PI * 2;

        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        vertices.push(radius * cosTheta, -halfHeight, radius * sinTheta);
        normals.push(0, -1, 0);
        uvs.push((cosTheta * 0.5) + 0.5, (sinTheta * 0.5) + 0.5);
        index++;
      }

      // Generate indices for base
      for (let x = 0; x < radialSegments; x++) {
        const center = baseIndexStart;
        const a = baseIndexStart + 1 + x;
        const b = baseIndexStart + 1 + x + 1;
        indices.push(center, a, b);
      }
    }

    // Convert to typed arrays
    const positionArray = new Float32Array(vertices);
    const normalArray = new Float32Array(normals);
    const uvArray = new Float32Array(uvs);

    // Set attributes
    this.setIndex(indices);
    this.setAttribute('position', new BufferAttribute(positionArray, 3));
    this.setAttribute('normal', new BufferAttribute(normalArray, 3));
    this.setAttribute('uv', new BufferAttribute(uvArray, 2));
  }
}
