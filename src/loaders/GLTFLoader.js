import { BufferGeometry } from '../geometry/BufferGeometry.js';
import { BufferAttribute } from '../geometry/BufferAttribute.js';
import { Mesh } from '../core/Mesh.js';
import { SkinnedMesh } from '../renderer/compute/SkinningShader.js';
import { BasicMaterial } from '../materials/BasicMaterial.js';
import { PBRMaterial } from '../materials/PBRMaterial.js';
import { Scene } from '../core/Scene.js';
import { Camera } from '../cameras/Camera.js';
import { PerspectiveCamera } from '../cameras/PerspectiveCamera.js';
import { Bone, Skeleton, AnimationClip, VectorKeyframeTrack, QuaternionKeyframeTrack } from '../animation/Skeleton.js';
import { Vector3 } from '../math/Vector3.js';
import { Quaternion } from '../math/Quaternion.js';
import { Matrix4 } from '../math/Matrix4.js';
import { Color } from '../math/Color.js';

/**
 * GLTFLoader - Load glTF 2.0 and GLB files
 * Supports geometry, materials, animations, and scenes
 * Implements core glTF 2.0 specification
 */
export class GLTFLoader {
    constructor() {
        this.path = '';
        this.resourcePath = '';
    }
    
    /**
     * Load a glTF file
     * @param {string} url - URL to glTF/GLB file
     * @returns {Promise<Object>} Loaded glTF object with scene, scenes, animations, etc.
     */
    async load(url) {
        this.path = this._extractPath(url);
        
        // Determine if GLB (binary) or glTF (JSON)
        const isGLB = url.toLowerCase().endsWith('.glb');
        
        let gltf;
        let buffers;
        
        if (isGLB) {
            const result = await this._loadGLB(url);
            gltf = result.json;
            buffers = result.buffers;
        } else {
            gltf = await this._loadJSON(url);
            buffers = await this._loadBuffers(gltf);
        }
        
        // Parse glTF
        return await this._parse(gltf, buffers);
    }
    
    /**
     * Load GLB binary file
     */
    async _loadGLB(url) {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const dataView = new DataView(arrayBuffer);
        
        // Parse GLB header
        const magic = dataView.getUint32(0, true);
        if (magic !== 0x46546C67) { // 'glTF' in ASCII
            throw new Error('Invalid GLB file');
        }
        
        const version = dataView.getUint32(4, true);
        if (version !== 2) {
            throw new Error(`Unsupported GLB version: ${version}`);
        }
        
        const length = dataView.getUint32(8, true);
        
        // Parse chunks
        let offset = 12;
        let jsonChunk = null;
        let binaryChunk = null;
        
        while (offset < length) {
            const chunkLength = dataView.getUint32(offset, true);
            const chunkType = dataView.getUint32(offset + 4, true);
            offset += 8;
            
            if (chunkType === 0x4E4F534A) { // 'JSON'
                const jsonData = new Uint8Array(arrayBuffer, offset, chunkLength);
                const jsonText = new TextDecoder().decode(jsonData);
                jsonChunk = JSON.parse(jsonText);
            } else if (chunkType === 0x004E4942) { // 'BIN'
                binaryChunk = arrayBuffer.slice(offset, offset + chunkLength);
            }
            
            offset += chunkLength;
        }
        
        return {
            json: jsonChunk,
            buffers: binaryChunk ? [binaryChunk] : []
        };
    }
    
    /**
     * Load glTF JSON file
     */
    async _loadJSON(url) {
        const response = await fetch(url);
        return await response.json();
    }
    
    /**
     * Load external buffers referenced by glTF
     */
    async _loadBuffers(gltf) {
        const buffers = [];
        
        if (gltf.buffers) {
            for (const bufferDef of gltf.buffers) {
                if (bufferDef.uri) {
                    const bufferUrl = this.path + bufferDef.uri;
                    const response = await fetch(bufferUrl);
                    const arrayBuffer = await response.arrayBuffer();
                    buffers.push(arrayBuffer);
                } else {
                    buffers.push(null);
                }
            }
        }
        
        return buffers;
    }
    
    /**
     * Parse glTF JSON and create Three.js-compatible objects
     */
    async _parse(gltf, buffers) {
        const parser = new GLTFParser(gltf, buffers, this.path);
        
        // Parse scenes
        const scenes = [];
        if (gltf.scenes) {
            for (let i = 0; i < gltf.scenes.length; i++) {
                scenes.push(await parser.parseScene(i));
            }
        }
        
        // Parse animations
        const animations = [];
        if (gltf.animations) {
            for (let i = 0; i < gltf.animations.length; i++) {
                animations.push(parser.parseAnimation(i));
            }
        }
        
        // Parse cameras
        const cameras = [];
        if (gltf.cameras) {
            for (let i = 0; i < gltf.cameras.length; i++) {
                cameras.push(parser.parseCamera(i));
            }
        }
        
        return {
            scene: scenes[gltf.scene || 0],
            scenes: scenes,
            animations: animations,
            cameras: cameras,
            asset: gltf.asset
        };
    }
    
    /**
     * Extract directory path from URL
     */
    _extractPath(url) {
        const lastSlash = url.lastIndexOf('/');
        return lastSlash === -1 ? '' : url.substring(0, lastSlash + 1);
    }
}

/**
 * GLTFParser - Internal parser for glTF data structures
 */
class GLTFParser {
    constructor(json, buffers, path) {
        this.json = json;
        this.buffers = buffers;
        this.path = path;
        
        // Caches
        this.cache = {
            meshes: [],
            materials: [],
            textures: [],
            accessors: [],
            nodes: []
        };
    }
    
    /**
     * Parse a scene
     */
    async parseScene(sceneIndex) {
        const sceneDef = this.json.scenes[sceneIndex];
        const scene = new Scene();
        scene.name = sceneDef.name || `scene_${sceneIndex}`;
        
        if (sceneDef.nodes) {
            for (const nodeIndex of sceneDef.nodes) {
                const node = await this.parseNode(nodeIndex);
                if (node) {
                    scene.add(node);
                }
            }
        }
        
        return scene;
    }
    
    /**
     * Parse a node
     */
    async parseNode(nodeIndex) {
        if (this.cache.nodes[nodeIndex]) {
            return this.cache.nodes[nodeIndex];
        }
        
        const nodeDef = this.json.nodes[nodeIndex];
        let node;
        
        // Create appropriate node type
        if (nodeDef.mesh !== undefined) {
            const mesh = await this.parseMesh(nodeDef.mesh);
            node = mesh;
        } else if (nodeDef.camera !== undefined) {
            node = this.parseCamera(nodeDef.camera);
        } else {
            node = new Mesh(); // Empty container node
        }
        
        node.name = nodeDef.name || `node_${nodeIndex}`;
        
        // Apply transform
        if (nodeDef.matrix) {
            node.matrix.fromArray(nodeDef.matrix);
            node.matrix.decompose(node.position, node.quaternion, node.scale);
        } else {
            if (nodeDef.translation) {
                node.position.fromArray(nodeDef.translation);
            }
            if (nodeDef.rotation) {
                node.quaternion.fromArray(nodeDef.rotation);
            }
            if (nodeDef.scale) {
                node.scale.fromArray(nodeDef.scale);
            }
        }
        
        // Parse children
        if (nodeDef.children) {
            for (const childIndex of nodeDef.children) {
                const child = await this.parseNode(childIndex);
                if (child) {
                    node.add(child);
                }
            }
        }
        
        this.cache.nodes[nodeIndex] = node;
        return node;
    }
    
    /**
     * Parse a mesh
     */
    async parseMesh(meshIndex) {
        if (this.cache.meshes[meshIndex]) {
            return this.cache.meshes[meshIndex].clone();
        }
        
        const meshDef = this.json.meshes[meshIndex];
        const primitive = meshDef.primitives[0]; // Use first primitive
        
        // Parse geometry
        const geometry = this.parseGeometry(primitive);
        
        // Parse material
        const material = primitive.material !== undefined
            ? await this.parseMaterial(primitive.material)
            : new BasicMaterial();
        
        // Create mesh
        const mesh = new Mesh(geometry, material);
        mesh.name = meshDef.name || `mesh_${meshIndex}`;
        
        this.cache.meshes[meshIndex] = mesh;
        return mesh;
    }
    
    /**
     * Parse geometry from primitive
     */
    parseGeometry(primitive) {
        const geometry = new BufferGeometry();
        
        // Parse attributes
        for (const [attributeName, accessorIndex] of Object.entries(primitive.attributes)) {
            const accessor = this.parseAccessor(accessorIndex);
            
            // Map glTF attribute names to our names
            let name = attributeName.toLowerCase();
            if (name === 'position') name = 'position';
            else if (name === 'normal') name = 'normal';
            else if (name === 'texcoord_0') name = 'uv';
            else if (name === 'color_0') name = 'color';
            
            geometry.setAttribute(name, accessor);
        }
        
        // Parse indices
        if (primitive.indices !== undefined) {
            const accessor = this.parseAccessor(primitive.indices);
            geometry.setIndex(accessor);
        }

        if (!geometry.getAttribute('normal') && geometry.getAttribute('position')) {
            geometry.computeVertexNormals();
        }
        
        return geometry;
    }
    
    /**
     * Parse accessor (vertex attributes, indices)
     */
    parseAccessor(accessorIndex) {
        if (this.cache.accessors[accessorIndex]) {
            return this.cache.accessors[accessorIndex];
        }
        
        const accessorDef = this.json.accessors[accessorIndex];
        const bufferViewDef = this.json.bufferViews[accessorDef.bufferView];
        const buffer = this.buffers[bufferViewDef.buffer];
        
        // Get typed array based on component type
        const TypedArray = this._getTypedArray(accessorDef.componentType);
        
        const byteOffset = (bufferViewDef.byteOffset || 0) + (accessorDef.byteOffset || 0);
        const itemSize = this._getItemSize(accessorDef.type);
        const count = accessorDef.count;

        const componentSize = this._getComponentSize(accessorDef.componentType);
        const elementSize = itemSize * componentSize;
        const byteStride = bufferViewDef.byteStride || elementSize;

        let array;

        if (byteStride === elementSize) {
            array = new TypedArray(
                buffer,
                byteOffset,
                count * itemSize
            );
        } else {
            array = new TypedArray(count * itemSize);
            const dataView = new DataView(buffer);

            for (let i = 0; i < count; i++) {
                const srcBase = byteOffset + i * byteStride;
                const dstBase = i * itemSize;

                for (let j = 0; j < itemSize; j++) {
                    array[dstBase + j] = this._readAccessorComponent(
                        dataView,
                        srcBase + j * componentSize,
                        accessorDef.componentType
                    );
                }
            }
        }

        this.cache.accessors[accessorIndex] = new BufferAttribute(
            array,
            itemSize,
            accessorDef.normalized === true
        );
        
        return this.cache.accessors[accessorIndex];
    }
    
    /**
     * Parse material
     */
    async parseMaterial(materialIndex) {
        if (this.cache.materials[materialIndex]) {
            return this.cache.materials[materialIndex];
        }
        
        const materialDef = this.json.materials[materialIndex];
        
        // Check if PBR material
        if (materialDef.pbrMetallicRoughness) {
            const pbr = materialDef.pbrMetallicRoughness;
            
            const material = new PBRMaterial({
                color: pbr.baseColorFactor
                    ? new Color(pbr.baseColorFactor[0], pbr.baseColorFactor[1], pbr.baseColorFactor[2])
                    : new Color(1, 1, 1),
                metallic: pbr.metallicFactor !== undefined ? pbr.metallicFactor : 1.0,
                roughness: pbr.roughnessFactor !== undefined ? pbr.roughnessFactor : 1.0
            });
            
            material.name = materialDef.name || `material_${materialIndex}`;
            
            this.cache.materials[materialIndex] = material;
            return material;
        } else {
            // Basic material fallback
            const material = new BasicMaterial({
                color: new Color(1, 1, 1)
            });
            
            material.name = materialDef.name || `material_${materialIndex}`;
            
            this.cache.materials[materialIndex] = material;
            return material;
        }
    }
    
    /**
     * Parse animation
     */
    parseAnimation(animationIndex) {
        const animationDef = this.json.animations[animationIndex];
        const tracks = [];
        
        for (const channel of animationDef.channels) {
            const sampler = animationDef.samplers[channel.sampler];
            const target = channel.target;
            
            // Get time and value accessors
            const inputAccessor = this.parseAccessor(sampler.input);
            const outputAccessor = this.parseAccessor(sampler.output);
            
            // Create track based on path
            const nodeName = this.json.nodes[target.node].name || `node_${target.node}`;
            const trackName = `${nodeName}.${target.path}`;
            
            let track;
            if (target.path === 'translation') {
                track = new VectorKeyframeTrack(
                    trackName.replace('translation', 'position'),
                    inputAccessor.array,
                    outputAccessor.array
                );
            } else if (target.path === 'rotation') {
                track = new QuaternionKeyframeTrack(
                    trackName.replace('rotation', 'quaternion'),
                    inputAccessor.array,
                    outputAccessor.array
                );
            } else if (target.path === 'scale') {
                track = new VectorKeyframeTrack(
                    trackName,
                    inputAccessor.array,
                    outputAccessor.array
                );
            }
            
            if (track) {
                tracks.push(track);
            }
        }
        
        const clip = new AnimationClip(
            animationDef.name || `animation_${animationIndex}`,
            -1,
            tracks
        );
        
        return clip;
    }
    
    /**
     * Parse camera
     */
    parseCamera(cameraIndex) {
        const cameraDef = this.json.cameras[cameraIndex];
        
        if (cameraDef.type === 'perspective') {
            const perspective = cameraDef.perspective;
            return new PerspectiveCamera(
                perspective.yfov * 180 / Math.PI, // Convert to degrees
                perspective.aspectRatio,
                perspective.znear,
                perspective.zfar || 1000
            );
        }
        
        return new Camera();
    }
    
    /**
     * Get TypedArray constructor for component type
     */
    _getTypedArray(componentType) {
        switch (componentType) {
            case 5120: return Int8Array;
            case 5121: return Uint8Array;
            case 5122: return Int16Array;
            case 5123: return Uint16Array;
            case 5125: return Uint32Array;
            case 5126: return Float32Array;
            default: throw new Error(`Unknown component type: ${componentType}`);
        }
    }

    _getComponentSize(componentType) {
        switch (componentType) {
            case 5120:
            case 5121:
                return 1;
            case 5122:
            case 5123:
                return 2;
            case 5125:
            case 5126:
                return 4;
            default:
                throw new Error(`Unknown component type: ${componentType}`);
        }
    }

    _readAccessorComponent(dataView, byteOffset, componentType) {
        switch (componentType) {
            case 5120: return dataView.getInt8(byteOffset);
            case 5121: return dataView.getUint8(byteOffset);
            case 5122: return dataView.getInt16(byteOffset, true);
            case 5123: return dataView.getUint16(byteOffset, true);
            case 5125: return dataView.getUint32(byteOffset, true);
            case 5126: return dataView.getFloat32(byteOffset, true);
            default: throw new Error(`Unknown component type: ${componentType}`);
        }
    }
    
    /**
     * Get item size for accessor type
     */
    _getItemSize(type) {
        switch (type) {
            case 'SCALAR': return 1;
            case 'VEC2': return 2;
            case 'VEC3': return 3;
            case 'VEC4': return 4;
            case 'MAT2': return 4;
            case 'MAT3': return 9;
            case 'MAT4': return 16;
            default: throw new Error(`Unknown accessor type: ${type}`);
        }
    }
}
