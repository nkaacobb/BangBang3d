/**
 * Raycaster - Ray casting for object picking and intersection
 * 
 * Converts screen coordinates to 3D rays and tests intersection with scene objects.
 */

import { Vector3 } from '../../math/Vector3.js';
import { Matrix4 } from '../../math/Matrix4.js';

export class Raycaster {
  constructor() {
    this.ray = {
      origin: new Vector3(),
      direction: new Vector3()
    };
    this.near = 0;
    this.far = Infinity;
  }

  /**
   * Set ray from camera and normalized device coordinates
   * @param {Vector2} coords - Normalized coordinates (-1 to 1)
   * @param {Camera} camera - Camera to cast ray from
   */
  setFromCamera(coords, camera) {
    // Create NDC point at near and far planes
    const nearPoint = new Vector3(coords.x, coords.y, -1);
    const farPoint = new Vector3(coords.x, coords.y, 1);
    
    // Get inverse projection matrix
    const invProjectionMatrix = new Matrix4().copy(camera.projectionMatrix).invert();
    const invViewMatrix = new Matrix4().copy(camera.matrixWorld);
    
    // Unproject points from NDC to view space, then to world space
    nearPoint.applyMatrix4(invProjectionMatrix);
    farPoint.applyMatrix4(invProjectionMatrix);
    
    nearPoint.applyMatrix4(invViewMatrix);
    farPoint.applyMatrix4(invViewMatrix);
    
    // Set ray origin and direction
    this.ray.origin.copy(nearPoint);
    this.ray.direction.copy(farPoint).sub(nearPoint).normalize();
    
    return this;
  }

  /**
   * Test ray intersection with a list of objects
   * @param {Array} objects - Objects to test
   * @param {boolean} recursive - Test children recursively
   * @returns {Array} Array of intersections sorted by distance
   */
  intersectObjects(objects, recursive = false) {
    const intersects = [];
    
    for (let i = 0; i < objects.length; i++) {
      this._intersectObject(objects[i], intersects, recursive);
    }
    
    intersects.sort((a, b) => a.distance - b.distance);
    return intersects;
  }

  /**
   * Test ray intersection with a single object
   * @param {Object3D} object - Object to test
   * @param {Array} intersects - Array to store results
   * @param {boolean} recursive - Test children recursively
   */
  _intersectObject(object, intersects, recursive) {
    if (!object.visible) return;
    
    // Test mesh intersection
    if (object.isMesh && object.geometry) {
      const intersection = this._intersectMesh(object);
      if (intersection) {
        intersects.push(intersection);
      }
    }
    
    // Recursively test children
    if (recursive) {
      const children = object.children;
      for (let i = 0; i < children.length; i++) {
        this._intersectObject(children[i], intersects, recursive);
      }
    }
  }

  /**
   * Test ray intersection with a mesh
   * @param {Mesh} mesh - Mesh to test
   * @returns {Object|null} Intersection record or null
   */
  _intersectMesh(mesh) {
    const geometry = mesh.geometry;
    const positions = geometry.attributes.position;
    const indices = geometry.index;
    
    if (!positions || !indices) return null;
    
    // Get world matrix
    const worldMatrix = mesh.matrixWorld;
    const worldMatrixInverse = new Matrix4().copy(worldMatrix).invert();
    
    // Transform ray to object space
    const localRayOrigin = new Vector3().copy(this.ray.origin).applyMatrix4(worldMatrixInverse);
    const localRayDirection = new Vector3().copy(this.ray.direction).transformDirection(worldMatrixInverse);
    
    let closestIntersection = null;
    let closestDistance = Infinity;
    
    // Test all triangles
    const posArray = positions.array;
    const idxArray = indices.array;
    
    for (let i = 0; i < idxArray.length; i += 3) {
      const i0 = idxArray[i] * 3;
      const i1 = idxArray[i + 1] * 3;
      const i2 = idxArray[i + 2] * 3;
      
      const v0 = new Vector3(posArray[i0], posArray[i0 + 1], posArray[i0 + 2]);
      const v1 = new Vector3(posArray[i1], posArray[i1 + 1], posArray[i1 + 2]);
      const v2 = new Vector3(posArray[i2], posArray[i2 + 1], posArray[i2 + 2]);
      
      const intersection = this._intersectTriangle(localRayOrigin, localRayDirection, v0, v1, v2);
      
      if (intersection && intersection.distance < closestDistance) {
        closestDistance = intersection.distance;
        closestIntersection = intersection;
      }
    }
    
    if (closestIntersection) {
      // Transform intersection point to world space
      const worldPoint = closestIntersection.point.applyMatrix4(worldMatrix);
      const distanceToCamera = worldPoint.distanceTo(this.ray.origin);
      
      return {
        distance: distanceToCamera,
        point: worldPoint,
        object: mesh,
        face: closestIntersection.face
      };
    }
    
    return null;
  }

  /**
   * Ray-triangle intersection using Möller–Trumbore algorithm
   * @param {Vector3} origin - Ray origin
   * @param {Vector3} direction - Ray direction (normalized)
   * @param {Vector3} v0 - Triangle vertex 0
   * @param {Vector3} v1 - Triangle vertex 1
   * @param {Vector3} v2 - Triangle vertex 2
   * @returns {Object|null} Intersection record or null
   */
  _intersectTriangle(origin, direction, v0, v1, v2) {
    const EPSILON = 0.0000001;
    
    const edge1 = new Vector3().copy(v1).sub(v0);
    const edge2 = new Vector3().copy(v2).sub(v0);
    const h = new Vector3().copy(direction).cross(edge2);
    const a = edge1.dot(h);
    
    if (a > -EPSILON && a < EPSILON) {
      return null; // Ray is parallel to triangle
    }
    
    const f = 1.0 / a;
    const s = new Vector3().copy(origin).sub(v0);
    const u = f * s.dot(h);
    
    if (u < 0.0 || u > 1.0) {
      return null;
    }
    
    const q = new Vector3().copy(s).cross(edge1);
    const v = f * direction.dot(q);
    
    if (v < 0.0 || u + v > 1.0) {
      return null;
    }
    
    const t = f * edge2.dot(q);
    
    if (t > EPSILON) {
      const point = new Vector3().copy(direction).multiplyScalar(t).add(origin);
      return {
        distance: t,
        point: point,
        face: { a: 0, b: 1, c: 2 } // Triangle face indices
      };
    }
    
    return null;
  }
}
