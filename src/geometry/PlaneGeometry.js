import { BufferGeometry } from './BufferGeometry.js';
import { BufferAttribute } from './BufferAttribute.js';

/**
 * PlaneGeometry - Creates a plane geometry
 */
export class PlaneGeometry extends BufferGeometry {
  constructor(width = 1, height = 1, widthSegments = 1, heightSegments = 1) {
    super();

    this.type = 'PlaneGeometry';

    this.parameters = {
      width: width,
      height: height,
      widthSegments: widthSegments,
      heightSegments: heightSegments
    };

    widthSegments = Math.floor(widthSegments);
    heightSegments = Math.floor(heightSegments);

    const widthHalf = width / 2;
    const heightHalf = height / 2;

    const gridX = widthSegments;
    const gridY = heightSegments;

    const gridX1 = gridX + 1;
    const gridY1 = gridY + 1;

    const segmentWidth = width / gridX;
    const segmentHeight = height / gridY;

    // Buffers
    const indices = [];
    const vertices = [];
    const normals = [];
    const uvs = [];

    // Generate vertices, normals and uvs
    for (let iy = 0; iy < gridY1; iy++) {
      const y = iy * segmentHeight - heightHalf;

      for (let ix = 0; ix < gridX1; ix++) {
        const x = ix * segmentWidth - widthHalf;

        vertices.push(x, -y, 0);
        normals.push(0, 0, 1);
        uvs.push(ix / gridX);
        uvs.push(1 - (iy / gridY));
      }
    }

    // Indices
    for (let iy = 0; iy < gridY; iy++) {
      for (let ix = 0; ix < gridX; ix++) {
        const a = ix + gridX1 * iy;
        const b = ix + gridX1 * (iy + 1);
        const c = (ix + 1) + gridX1 * (iy + 1);
        const d = (ix + 1) + gridX1 * iy;

        // Faces
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    // Build geometry
    this.setIndex(indices);
    this.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
    this.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
    this.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  }

  static fromJSON(data) {
    return new PlaneGeometry(data.width, data.height, data.widthSegments, data.heightSegments);
  }
}
