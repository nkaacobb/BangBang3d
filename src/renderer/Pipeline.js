import { Vector3 } from '../math/Vector3.js';
import { Vector4 } from '../math/Vector4.js';
import { Matrix4 } from '../math/Matrix4.js';
import { ClipSpace } from './ClipSpace.js';
import { Rasterizer } from './Rasterizer.js';
import { Shading } from './Shading.js';
import { NearPlaneClipper } from './NearPlaneClipper.js';

/**
 * Pipeline - Orchestrates the full rendering pipeline
 */
export class Pipeline {
  constructor(frameBuffer, depthBuffer) {
    this.frameBuffer = frameBuffer;
    this.depthBuffer = depthBuffer;
    this.rasterizer = new Rasterizer();

    // Rendering statistics
    this.stats = {
      trianglesSubmitted: 0,
      trianglesClippedOut: 0,
      trianglesClippedNear: 0,
      trianglesCulled: 0,
      trianglesRendered: 0
    };

    // Scratch variables to avoid allocations
    this._mvpMatrix = new Matrix4();
    this._modelViewMatrix = new Matrix4();
    this._normalMatrix = new Matrix4();
    this._clipV0 = new Vector4();
    this._clipV1 = new Vector4();
    this._clipV2 = new Vector4();
    this._ndcV0 = new Vector3();
    this._ndcV1 = new Vector3();
    this._ndcV2 = new Vector3();
    this._screenV0 = new Vector3();
    this._screenV1 = new Vector3();
    this._screenV2 = new Vector3();
  }

  /**
   * Render a mesh with the given camera and lights
   */
  renderMesh(mesh, camera, lights) {
    const geometry = mesh.geometry;
    const material = mesh.material;

    if (!geometry || !material) return;

    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const uvs = geometry.getAttribute('uv');
    const index = geometry.index;

    if (!positions) return;

    // Update matrices
    mesh.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);

    // Calculate MVP matrix
    this._modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
    this._mvpMatrix.multiplyMatrices(camera.projectionMatrix, this._modelViewMatrix);

    // Calculate normal matrix (for transforming normals)
    this._normalMatrix.copy(mesh.matrixWorld);
    this._normalMatrix.extractRotation(mesh.matrixWorld);

    // Get triangle count
    const triangleCount = index ? index.count / 3 : positions.count / 3;

    // Process each triangle
    for (let i = 0; i < triangleCount; i++) {
      this.stats.trianglesSubmitted++;

      // Get vertex indices
      let i0, i1, i2;
      if (index) {
        i0 = index.getX(i * 3 + 0);
        i1 = index.getX(i * 3 + 1);
        i2 = index.getX(i * 3 + 2);
      } else {
        i0 = i * 3 + 0;
        i1 = i * 3 + 1;
        i2 = i * 3 + 2;
      }

      // Build vertex structures with all attributes in clip space
      const buildVertex = (idx) => {
        const pos = new Vector3(positions.getX(idx), positions.getY(idx), positions.getZ(idx));
        const clip = new Vector4();
        ClipSpace.toClipSpace(pos, this._mvpMatrix, clip);

        const vert = { clip, position: pos };

        if (normals) {
          vert.normal = new Vector3(normals.getX(idx), normals.getY(idx), normals.getZ(idx));
          vert.normal.transformDirection(this._normalMatrix).normalize();
        }

        if (uvs) {
          vert.uv = { x: uvs.getX(idx), y: uvs.getY(idx) };
        }

        vert.worldPosition = pos.clone().applyMatrix4(mesh.matrixWorld);
        return vert;
      };

      const vert0 = buildVertex(i0);
      const vert1 = buildVertex(i1);
      const vert2 = buildVertex(i2);

      // Clip triangle against near plane (proper geometric clipping)
      const clippedTriangles = NearPlaneClipper.clipTriangle(vert0, vert1, vert2, camera.near);

      if (clippedTriangles.length === 0) {
        this.stats.trianglesClippedOut++;
        continue;
      }

      if (clippedTriangles.length > 1) {
        this.stats.trianglesClippedNear++;
      }

      // Process each clipped triangle (0-2 triangles)
      for (const [cv0, cv1, cv2] of clippedTriangles) {
        // Perspective divide to NDC
        ClipSpace.toNDC(cv0.clip, this._ndcV0);
        ClipSpace.toNDC(cv1.clip, this._ndcV1);
        ClipSpace.toNDC(cv2.clip, this._ndcV2);

        // Transform to screen space
        ClipSpace.toScreenSpace(this._ndcV0, this.frameBuffer.width, this.frameBuffer.height, this._screenV0);
        ClipSpace.toScreenSpace(this._ndcV1, this.frameBuffer.width, this.frameBuffer.height, this._screenV1);
        ClipSpace.toScreenSpace(this._ndcV2, this.frameBuffer.width, this.frameBuffer.height, this._screenV2);

        // Prepare vertex data for rasterizer
        const vertex0 = {
          position: this._screenV0.clone(),
          w: cv0.clip.w,
          clipZ: cv0.clip.z,
          worldPosition: cv0.worldPosition
        };
        const vertex1 = {
          position: this._screenV1.clone(),
          w: cv1.clip.w,
          clipZ: cv1.clip.z,
          worldPosition: cv1.worldPosition
        };
        const vertex2 = {
          position: this._screenV2.clone(),
          w: cv2.clip.w,
          clipZ: cv2.clip.z,
          worldPosition: cv2.worldPosition
        };

        // Copy normals if available
        if (cv0.normal) {
          vertex0.normal = cv0.normal;
          vertex1.normal = cv1.normal;
          vertex2.normal = cv2.normal;
        }

        // Copy UVs if available
        if (cv0.uv) {
          vertex0.uv = cv0.uv;
          vertex1.uv = cv1.uv;
          vertex2.uv = cv2.uv;
        }

        // Create fragment shader based on material type
        const fragmentShader = this.createFragmentShader(material, lights, camera);

        // Rasterize triangle (backface culling happens here, after projection)
        const shouldCullBackface = material.side !== 'DoubleSide';
        const wasCulled = this.rasterizer.rasterizeTriangle(
          vertex0,
          vertex1,
          vertex2,
          this.frameBuffer,
          this.depthBuffer,
          fragmentShader,
          {
            cullBackface: shouldCullBackface,
            depthTest: material.depthTest,
            depthWrite: material.depthWrite
          }
        );

        if (wasCulled) {
          this.stats.trianglesCulled++;
        } else {
          this.stats.trianglesRendered++;
        }
      }
    }
  }

  /**
   * Create a fragment shader function based on material type
   */
  createFragmentShader(material, lights, camera) {
    if (material.type === 'DebugMaterial') {
      // Debug material - visualize normals, depth, UVs, etc.
      return (bary, v0, v1, v2, invW0, invW1, invW2) => {
        const data = {};
        
        // Interpolate normal if available
        if (v0.normal) {
          data.normal = Rasterizer.interpolateVector3(
            bary.u, bary.v, bary.w,
            v0.normal, v1.normal, v2.normal,
            invW0, invW1, invW2
          );
        }
        
        // Calculate depth (average of vertex depths)
        data.depth = (v0.position.z * bary.u + v1.position.z * bary.v + v2.position.z * bary.w);
        
        // Interpolate UV if available
        if (v0.uv && v1.uv && v2.uv) {
          data.uv = Rasterizer.interpolateUV(
            bary.u, bary.v, bary.w,
            v0.uv, v1.uv, v2.uv,
            invW0, invW1, invW2
          );
        }
        
        // Interpolate world position for worldPosition debug mode
        if (v0.worldPosition && v1.worldPosition && v2.worldPosition) {
          data.worldPosition = Rasterizer.interpolateVector3(
            bary.u, bary.v, bary.w,
            v0.worldPosition, v1.worldPosition, v2.worldPosition,
            invW0, invW1, invW2
          );
        }
        
        // Get debug color based on mode
        const tempColor = { r: 0, g: 0, b: 0 };
        material.getDebugColor(material.mode, data, tempColor);
        
        return {
          r: tempColor.r,
          g: tempColor.g,
          b: tempColor.b,
          a: 1.0
        };
      };
    } else if (material.isBasicMaterial) {
      return (bary, v0, v1, v2, invW0, invW1, invW2) => {
        let finalColor = { r: material.color.r, g: material.color.g, b: material.color.b };

        // Apply texture if present
        if (material.map && material.map.data && v0.uv && v1.uv && v2.uv) {
          // Perspective-correct UV interpolation
          const uv = Rasterizer.interpolateUV(
            bary.u, bary.v, bary.w,
            v0.uv, v1.uv, v2.uv,
            invW0, invW1, invW2
          );

          // Sample texture
          const texColor = material.map.sample(uv.x, uv.y);

          // Multiply texture color with material color
          finalColor.r *= texColor.r;
          finalColor.g *= texColor.g;
          finalColor.b *= texColor.b;
        }

        return {
          r: finalColor.r,
          g: finalColor.g,
          b: finalColor.b,
          a: material.opacity
        };
      };
    } else if (material.isLambertMaterial) {
      return (bary, v0, v1, v2, invW0, invW1, invW2) => {
        // Get base color
        let baseColor = { r: material.color.r, g: material.color.g, b: material.color.b };

        // Apply texture if present
        if (material.map && material.map.data && v0.uv && v1.uv && v2.uv) {
          // Perspective-correct UV interpolation
          const uv = Rasterizer.interpolateUV(
            bary.u, bary.v, bary.w,
            v0.uv, v1.uv, v2.uv,
            invW0, invW1, invW2
          );

          // Sample texture
          const texColor = material.map.sample(uv.x, uv.y);

          // Multiply texture color with material color
          baseColor.r *= texColor.r;
          baseColor.g *= texColor.g;
          baseColor.b *= texColor.b;
        }

        // Interpolate normal (perspective-correct)
        const normal = Rasterizer.interpolateVector3(
          bary.u, bary.v, bary.w,
          v0.normal, v1.normal, v2.normal,
          invW0, invW1, invW2
        );
        normal.normalize(); // Normalize after interpolation

        // Calculate lighting with textured base color
        const litColor = Shading.lambert(
          { r: baseColor.r, g: baseColor.g, b: baseColor.b },
          normal,
          lights,
          material.emissive,
          material.emissiveIntensity
        );

        return {
          r: litColor.r,
          g: litColor.g,
          b: litColor.b,
          a: material.opacity
        };
      };
    } else if (material.type === 'GridOverlayMaterial') {
      // Grid overlay material - procedural grid rendering
      return (bary, v0, v1, v2, invW0, invW1, invW2) => {
        // Interpolate world position (perspective-correct)
        const worldPosition = Rasterizer.interpolateVector3(
          bary.u, bary.v, bary.w,
          v0.worldPosition, v1.worldPosition, v2.worldPosition,
          invW0, invW1, invW2
        );
        
        // FIXED: Calculate distance from camera, not origin
        const dx = worldPosition.x - camera.position.x;
        const dy = worldPosition.y - camera.position.y;
        const dz = worldPosition.z - camera.position.z;
        const viewDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        const scale = material.gridScale || 1.0;
        const fadeDistance = material.fadeDistance || 100.0;
        const majorLineInterval = material.majorLineInterval || 10.0;
        const opacity = material.opacity || 1.0;
        
        // Grid line function - matches GPU shader logic
        const gridLine = (coord, gridScale, lineWidth) => {
          const scaled = coord * gridScale;
          // Approximate derivative using a fixed value (like fwidth)
          const derivative = 0.02;
          // Match GPU: fract(scaled - 0.5) - 0.5
          const fract = (scaled - 0.5) - Math.floor(scaled - 0.5);
          const grid = Math.abs(fract - 0.5) / derivative;
          const line = 1.0 - Math.min(grid / lineWidth, 1.0);
          return Math.max(0, line);
        };
        
        // Calculate grid lines
        const gridX = gridLine(worldPosition.x, scale, 2.0);
        const gridZ = gridLine(worldPosition.z, scale, 2.0);
        const grid = Math.max(gridX, gridZ);
        
        // Major grid lines
        const majorScale = scale / majorLineInterval;
        const majorGridX = gridLine(worldPosition.x, majorScale, 3.0);
        const majorGridZ = gridLine(worldPosition.z, majorScale, 3.0);
        const majorGrid = Math.max(majorGridX, majorGridZ);
        
        // World axes
        const axisThreshold = 0.08;
        const onAxisX = Math.abs(worldPosition.z) < axisThreshold;
        const onAxisZ = Math.abs(worldPosition.x) < axisThreshold;
        const atOrigin = Math.abs(worldPosition.x) < axisThreshold * 2.0 && 
                         Math.abs(worldPosition.z) < axisThreshold * 2.0;
        
        // Distance fade - smoothstep to match GPU
        const smoothstep = (edge0, edge1, x) => {
          const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
          return t * t * (3.0 - 2.0 * t);
        };
        const fade = 1.0 - smoothstep(fadeDistance * 0.3, fadeDistance, viewDistance);
        
        // Base color and alpha
        let color = { r: 0.5, g: 0.5, b: 0.5 };
        let alpha = (grid * 0.7 + majorGrid * 0.5) * fade * opacity;
        alpha = alpha * 1.5; // Boost visibility
        
        // Axis colors
        const axisXColor = material.axisXColor || { r: 1.0, g: 0.2, b: 0.2 };
        const axisZColor = material.axisZColor || { r: 0.2, g: 1.0, b: 0.2 };
        const horizonColor = material.horizonColor || { r: 0.5, g: 0.5, b: 0.5 };
        
        if (onAxisX && !onAxisZ) {
          color = axisXColor;
          alpha = 0.95 * opacity;
        }
        if (onAxisZ && !onAxisX) {
          color = axisZColor;
          alpha = 0.95 * opacity;
        }
        if (atOrigin) {
          alpha = 1.0 * opacity;
          color = {
            r: (axisXColor.r + axisZColor.r) * 0.5,
            g: (axisXColor.g + axisZColor.g) * 0.5,
            b: (axisXColor.b + axisZColor.b) * 0.5
          };
        }
        
        // Horizon fade - match GPU
        const horizonFade = smoothstep(fadeDistance * 0.85, fadeDistance, viewDistance);
        const mix = (a, b, t) => a * (1 - t) + b * t;
        color = {
          r: mix(color.r, horizonColor.r, horizonFade * 0.3),
          g: mix(color.g, horizonColor.g, horizonFade * 0.3),
          b: mix(color.b, horizonColor.b, horizonFade * 0.3)
        };
        
        // Clamp alpha
        alpha = Math.max(0, Math.min(1, alpha));
        
        return {
          r: color.r,
          g: color.g,
          b: color.b,
          a: alpha
        };
      };
    }

    // Fallback: magenta for unknown materials
    return () => ({ r: 1, g: 0, b: 1, a: 1 });
  }

  /**
   * Reset rendering statistics
   */
  resetStats() {
    this.stats.trianglesSubmitted = 0;
    this.stats.trianglesClippedOut = 0;
    this.stats.trianglesClippedNear = 0;
    this.stats.trianglesCulled = 0;
    this.stats.trianglesRendered = 0;
  }
}
