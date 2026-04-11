import { BufferGeometry } from './BufferGeometry.js';
import { BufferAttribute } from './BufferAttribute.js';

/**
 * BoxGeometry - Creates a box (cube) geometry
 */
export class BoxGeometry extends BufferGeometry {
  constructor(width = 1, height = 1, depth = 1, widthSegments = 1, heightSegments = 1, depthSegments = 1) {
    super();

    this.type = 'BoxGeometry';

    this.parameters = {
      width: width,
      height: height,
      depth: depth,
      widthSegments: widthSegments,
      heightSegments: heightSegments,
      depthSegments: depthSegments
    };

    widthSegments = Math.floor(widthSegments);
    heightSegments = Math.floor(heightSegments);
    depthSegments = Math.floor(depthSegments);

    // Buffers
    const indices = [];
    const vertices = [];
    const normals = [];
    const uvs = [];

    // Helper variables
    let numberOfVertices = 0;

    // Build each side of the box
    buildPlane('z', 'y', 'x', -1, -1, depth, height, width, depthSegments, heightSegments, 0); // px
    buildPlane('z', 'y', 'x', 1, -1, depth, height, -width, depthSegments, heightSegments, 1); // nx
    buildPlane('x', 'z', 'y', 1, 1, width, depth, height, widthSegments, depthSegments, 2); // py
    buildPlane('x', 'z', 'y', 1, -1, width, depth, -height, widthSegments, depthSegments, 3); // ny
    buildPlane('x', 'y', 'z', 1, -1, width, height, depth, widthSegments, heightSegments, 4); // pz
    buildPlane('x', 'y', 'z', -1, -1, width, height, -depth, widthSegments, heightSegments, 5); // nz

    // Build geometry
    this.setIndex(indices);
    this.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
    this.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
    this.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));

    function buildPlane(u, v, w, udir, vdir, width, height, depth, gridX, gridY, materialIndex) {
      const segmentWidth = width / gridX;
      const segmentHeight = height / gridY;

      const widthHalf = width / 2;
      const heightHalf = height / 2;
      const depthHalf = depth / 2;

      const gridX1 = gridX + 1;
      const gridY1 = gridY + 1;

      let vertexCounter = 0;

      const vector = {};

      // Generate vertices, normals and uvs
      for (let iy = 0; iy < gridY1; iy++) {
        const y = iy * segmentHeight - heightHalf;

        for (let ix = 0; ix < gridX1; ix++) {
          const x = ix * segmentWidth - widthHalf;

          // Set values to correct vector component
          vector[u] = x * udir;
          vector[v] = y * vdir;
          vector[w] = depthHalf;

          // Now apply vector to vertex buffer
          vertices.push(vector.x, vector.y, vector.z);

          // Set values to correct vector component
          vector[u] = 0;
          vector[v] = 0;
          vector[w] = depth > 0 ? 1 : -1;

          // Now apply vector to normal buffer
          normals.push(vector.x, vector.y, vector.z);

          // uvs
          uvs.push(ix / gridX);
          uvs.push(1 - (iy / gridY));

          // Counters
          vertexCounter += 1;
        }
      }

      // Indices

      // 1. Generate indices for each quad
      for (let iy = 0; iy < gridY; iy++) {
        for (let ix = 0; ix < gridX; ix++) {
          const a = numberOfVertices + ix + gridX1 * iy;
          const b = numberOfVertices + ix + gridX1 * (iy + 1);
          const c = numberOfVertices + (ix + 1) + gridX1 * (iy + 1);
          const d = numberOfVertices + (ix + 1) + gridX1 * iy;

          // Faces (two triangles per quad)
          indices.push(a, b, d);
          indices.push(b, c, d);
        }
      }

      // Update total number of vertices
      numberOfVertices += vertexCounter;
    }
  }

  static fromJSON(data) {
    return new BoxGeometry(
      data.width,
      data.height,
      data.depth,
      data.widthSegments,
      data.heightSegments,
      data.depthSegments
    );
  }
}
