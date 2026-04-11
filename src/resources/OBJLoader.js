import { BufferGeometry } from '../geometry/BufferGeometry.js';
import { BufferAttribute } from '../geometry/BufferAttribute.js';
import { Mesh } from '../core/Mesh.js';
import { BasicMaterial } from '../materials/BasicMaterial.js';
import { LambertMaterial } from '../materials/LambertMaterial.js';
import { Vector3 } from '../math/Vector3.js';
import { MTLLoader } from './MTLLoader.js';

/**
 * OBJLoader - Loads Wavefront .obj model files
 * 
 * Supports:
 * - v (vertices)
 * - vt (texture coordinates)
 * - vn (normals)
 * - f (faces - triangles and quads)
 * - usemtl (material assignment)
 * - mtllib (material library reference)
 * - o/g (object/group names)
 */
export class OBJLoader {
  constructor() {
    this.basePath = '';
    this.materials = null;
    this.mtlLoader = new MTLLoader();
  }

  /**
   * Set base path for resolving relative paths
   */
  setPath(path) {
    this.basePath = path;
    this.mtlLoader.setPath(path);
    return this;
  }

  /**
   * Set materials to use (from MTLLoader)
   */
  setMaterials(materials) {
    this.materials = materials;
    return this;
  }

  /**
   * Load OBJ file from URL
   * @param {string} url - OBJ file URL
   * @param {Function} onLoad - Callback(group) on success
   * @param {Function} onProgress - Progress callback
   * @param {Function} onError - Callback(error) on failure
   */
  load(url, onLoad, onProgress, onError) {
    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`OBJLoader: HTTP ${response.status} - ${url}`);
        }
        return response.text();
      })
      .then(text => {
        const group = this.parse(text);
        if (onLoad) {
          onLoad(group);
        }
      })
      .catch(error => {
        console.error('OBJLoader: Error loading OBJ file', url, error);
        if (onError) {
          onError(error);
        }
      });
  }

  /**
   * Parse OBJ file content
   * @param {string} text - OBJ file content
   * @returns {Object} Object with meshes array and metadata
   */
  parse(text) {
    const state = {
      vertices: [],
      normals: [],
      uvs: [],
      materialGroups: {},
      currentMaterial: null,
      currentObject: 'default',
      mtlLibs: []
    };

    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

      // Skip empty lines and comments
      if (line === '' || line.startsWith('#')) {
        continue;
      }

      // Split line into tokens
      const tokens = line.split(/\s+/);
      const keyword = tokens[0].toLowerCase();

      switch (keyword) {
        case 'v':
          // Vertex position
          state.vertices.push(
            parseFloat(tokens[1]),
            parseFloat(tokens[2]),
            parseFloat(tokens[3])
          );
          break;

        case 'vt':
          // Texture coordinate
          state.uvs.push(
            parseFloat(tokens[1]),
            parseFloat(tokens[2])
          );
          break;

        case 'vn':
          // Vertex normal
          state.normals.push(
            parseFloat(tokens[1]),
            parseFloat(tokens[2]),
            parseFloat(tokens[3])
          );
          break;

        case 'f':
          // Face (triangle or quad)
          this.parseFace(tokens.slice(1), state);
          break;

        case 'usemtl':
          // Use material
          state.currentMaterial = tokens[1];
          if (!state.materialGroups[state.currentMaterial]) {
            state.materialGroups[state.currentMaterial] = {
              vertices: [],
              normals: [],
              uvs: [],
              indices: []
            };
          }
          break;

        case 'mtllib':
          // Material library reference
          state.mtlLibs.push(tokens[1]);
          break;

        case 'o':
        case 'g':
          // Object or group name (optional)
          state.currentObject = tokens[1] || 'default';
          break;
      }
    }

    // Build meshes from material groups
    return this.buildMeshes(state);
  }

  /**
   * Parse face definition (handles triangles and quads)
   */
  parseFace(faceTokens, state) {
    const materialKey = state.currentMaterial || 'default';
    if (!state.materialGroups[materialKey]) {
      state.materialGroups[materialKey] = {
        vertices: [],
        normals: [],
        uvs: [],
        indices: []
      };
    }

    const group = state.materialGroups[materialKey];
    const faceVertices = [];

    // Parse each vertex of the face
    for (let i = 0; i < faceTokens.length; i++) {
      const vertexData = this.parseVertexIndex(faceTokens[i], state);
      faceVertices.push(vertexData);
    }

    // Triangulate if quad (split into 2 triangles)
    if (faceVertices.length === 3) {
      // Already a triangle
      this.addTriangle(faceVertices[0], faceVertices[1], faceVertices[2], group);
    } else if (faceVertices.length === 4) {
      // Quad - split into two triangles: 0-1-2 and 0-2-3
      this.addTriangle(faceVertices[0], faceVertices[1], faceVertices[2], group);
      this.addTriangle(faceVertices[0], faceVertices[2], faceVertices[3], group);
    }
  }

  /**
   * Parse vertex index string (format: v/vt/vn)
   */
  parseVertexIndex(vertexString, state) {
    const parts = vertexString.split('/');

    const vIndex = parseInt(parts[0]);
    const vtIndex = parts[1] ? parseInt(parts[1]) : null;
    const vnIndex = parts[2] ? parseInt(parts[2]) : null;

    // Handle negative indices (relative to end)
    const vi = vIndex > 0 ? vIndex - 1 : state.vertices.length / 3 + vIndex;
    const vti = vtIndex && vtIndex > 0 ? vtIndex - 1 : vtIndex && state.uvs.length / 2 + vtIndex;
    const vni = vnIndex && vnIndex > 0 ? vnIndex - 1 : vnIndex && state.normals.length / 3 + vnIndex;

    return {
      position: [
        state.vertices[vi * 3],
        state.vertices[vi * 3 + 1],
        state.vertices[vi * 3 + 2]
      ],
      uv: vti !== null ? [
        state.uvs[vti * 2],
        state.uvs[vti * 2 + 1]
      ] : [0, 0],
      normal: vni !== null ? [
        state.normals[vni * 3],
        state.normals[vni * 3 + 1],
        state.normals[vni * 3 + 2]
      ] : [0, 0, 1]
    };
  }

  /**
   * Add a triangle to the geometry group
   */
  addTriangle(v0, v1, v2, group) {
    const startIndex = group.vertices.length / 3;

    // Add vertices
    group.vertices.push(...v0.position, ...v1.position, ...v2.position);

    // Add normals
    group.normals.push(...v0.normal, ...v1.normal, ...v2.normal);

    // Add UVs
    group.uvs.push(...v0.uv, ...v1.uv, ...v2.uv);

    // Add indices
    group.indices.push(startIndex, startIndex + 1, startIndex + 2);
  }

  /**
   * Build Mesh objects from parsed data
   */
  buildMeshes(state) {
    const meshes = [];

    for (const materialName in state.materialGroups) {
      const group = state.materialGroups[materialName];

      if (group.vertices.length === 0) continue;

      // Create geometry
      const geometry = new BufferGeometry();

      geometry.setAttribute('position', new BufferAttribute(new Float32Array(group.vertices), 3));
      geometry.setAttribute('normal', new BufferAttribute(new Float32Array(group.normals), 3));
      geometry.setAttribute('uv', new BufferAttribute(new Float32Array(group.uvs), 2));

      if (group.indices.length > 0) {
        geometry.setIndex(group.indices);
      }

      // Create material
      let material;
      if (this.materials && this.materials[materialName]) {
        const mtlData = this.materials[materialName];
        
        // Use LambertMaterial for better lighting
        material = new LambertMaterial();
        
        // Set diffuse color
        material.color.copy(mtlData.diffuse);

        // Apply diffuse texture if available
        if (mtlData.textureObjects && mtlData.textureObjects.diffuse) {
          material.map = mtlData.textureObjects.diffuse;
        }

        // Handle transparency
        if (mtlData.opacity < 1.0) {
          material.transparent = true;
          material.opacity = mtlData.opacity;
        }
      } else {
        // Default gray material
        material = new LambertMaterial({ color: 0x808080 });
      }

      // Create mesh
      const mesh = new Mesh(geometry, material);
      mesh.userData = {
        materialName: materialName
      };

      meshes.push(mesh);
    }

    return {
      meshes: meshes,
      materialLibs: state.mtlLibs
    };
  }

  /**
   * Compute bounding box for a group of meshes
   */
  computeBoundingBox(meshes) {
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);

    for (const mesh of meshes) {
      const positions = mesh.geometry.attributes.position;
      
      for (let i = 0; i < positions.count; i++) {
        const x = positions.array[i * 3];
        const y = positions.array[i * 3 + 1];
        const z = positions.array[i * 3 + 2];

        min.x = Math.min(min.x, x);
        min.y = Math.min(min.y, y);
        min.z = Math.min(min.z, z);

        max.x = Math.max(max.x, x);
        max.y = Math.max(max.y, y);
        max.z = Math.max(max.z, z);
      }
    }

    return { min, max };
  }
}
