import { ComputeShader } from './ComputeShader.js';

/**
 * SkinningShader - GPU-accelerated skeletal skinning
 * Computes vertex positions using bone transforms
 * Significantly faster than CPU skinning for complex meshes
 */

const SkinningWGSL = `
    // Bone transforms (one matrix per bone)
    struct BoneMatrices {
        matrices: array<mat4x4<f32>>,
    };
    
    // Input vertex data
    struct InputVertex {
        position: vec3<f32>,
        normal: vec3<f32>,
        skinIndex: vec4<u32>,    // Bone indices (up to 4 bones per vertex)
        skinWeight: vec4<f32>,   // Bone weights (sum = 1.0)
    };
    
    // Output vertex data (skinned)
    struct OutputVertex {
        position: vec3<f32>,
        normal: vec3<f32>,
    };
    
    // Bindings
    @group(0) @binding(0) var<storage, read> boneMatrices: BoneMatrices;
    @group(0) @binding(1) var<storage, read> inputVertices: array<InputVertex>;
    @group(0) @binding(2) var<storage, read_write> outputVertices: array<OutputVertex>;
    
    // Skin a single vertex
    fn skinVertex(vertex: InputVertex) -> OutputVertex {
        var output: OutputVertex;
        
        // Accumulate weighted transforms
        var skinnedPosition = vec4<f32>(0.0, 0.0, 0.0, 0.0);
        var skinnedNormal = vec3<f32>(0.0, 0.0, 0.0);
        
        // Apply up to 4 bone influences
        for (var i = 0u; i < 4u; i = i + 1u) {
            let boneIndex = vertex.skinIndex[i];
            let boneWeight = vertex.skinWeight[i];
            
            if (boneWeight > 0.0) {
                let boneMatrix = boneMatrices.matrices[boneIndex];
                
                // Transform position
                let transformedPos = boneMatrix * vec4<f32>(vertex.position, 1.0);
                skinnedPosition += transformedPos * boneWeight;
                
                // Transform normal (use mat3 part of bone matrix)
                let normalMatrix = mat3x3<f32>(
                    boneMatrix[0].xyz,
                    boneMatrix[1].xyz,
                    boneMatrix[2].xyz
                );
                let transformedNormal = normalMatrix * vertex.normal;
                skinnedNormal += transformedNormal * boneWeight;
            }
        }
        
        output.position = skinnedPosition.xyz;
        output.normal = normalize(skinnedNormal);
        
        return output;
    }
    
    // Main compute kernel
    @compute @workgroup_size(64, 1, 1)
    fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
        let vertexIndex = globalId.x;
        
        // Bounds check
        if (vertexIndex >= arrayLength(&inputVertices)) {
            return;
        }
        
        // Skin vertex
        let inputVertex = inputVertices[vertexIndex];
        let skinnedVertex = skinVertex(inputVertex);
        
        // Write output
        outputVertices[vertexIndex] = skinnedVertex;
    }
`;

/**
 * SkinningShader - GPU skinning compute shader
 */
export class SkinningShader extends ComputeShader {
    constructor() {
        super('Skinning', SkinningWGSL, {
            workgroupSize: [64, 1, 1]
        });
        
        // GPU buffers
        this.boneMatrixBuffer = null;
        this.inputVertexBuffer = null;
        this.outputVertexBuffer = null;
        
        // Vertex count
        this.vertexCount = 0;
    }
    
    /**
     * Update bone matrices
     * @param {GPUDevice} device - WebGPU device
     * @param {Float32Array} boneMatrices - Bone matrix array from Skeleton
     */
    updateBoneMatrices(device, boneMatrices) {
        if (!this.boneMatrixBuffer || this.boneMatrixBuffer.size < boneMatrices.byteLength) {
            // Create/recreate buffer
            if (this.boneMatrixBuffer) {
                this.boneMatrixBuffer.destroy();
            }
            
            this.boneMatrixBuffer = device.createBuffer({
                size: boneMatrices.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
            });
        }
        
        device.queue.writeBuffer(this.boneMatrixBuffer, 0, boneMatrices);
    }
    
    /**
     * Setup input vertex buffer
     * @param {GPUDevice} device - WebGPU device
     * @param {BufferGeometry} geometry - Geometry with skinning data
     */
    setupInputBuffer(device, geometry) {
        // Extract vertex data
        const positions = geometry.attributes.position.array;
        const normals = geometry.attributes.normal.array;
        const skinIndices = geometry.attributes.skinIndex.array;
        const skinWeights = geometry.attributes.skinWeight.array;
        
        this.vertexCount = positions.length / 3;
        
        // Pack input data
        // Format: position(3) + normal(3) + skinIndex(4) + skinWeight(4) = 14 floats per vertex
        // But skinIndex needs to be u32, so we'll use separate alignment
        const inputData = new Float32Array(this.vertexCount * 14);
        
        for (let i = 0; i < this.vertexCount; i++) {
            const dst = i * 14;
            const srcPos = i * 3;
            const srcSkin = i * 4;
            
            // Position
            inputData[dst + 0] = positions[srcPos + 0];
            inputData[dst + 1] = positions[srcPos + 1];
            inputData[dst + 2] = positions[srcPos + 2];
            
            // Normal
            inputData[dst + 3] = normals[srcPos + 0];
            inputData[dst + 4] = normals[srcPos + 1];
            inputData[dst + 5] = normals[srcPos + 2];
            
            // Skin indices (converted to floats for now, shader will cast)
            inputData[dst + 6] = skinIndices[srcSkin + 0];
            inputData[dst + 7] = skinIndices[srcSkin + 1];
            inputData[dst + 8] = skinIndices[srcSkin + 2];
            inputData[dst + 9] = skinIndices[srcSkin + 3];
            
            // Skin weights
            inputData[dst + 10] = skinWeights[srcSkin + 0];
            inputData[dst + 11] = skinWeights[srcSkin + 1];
            inputData[dst + 12] = skinWeights[srcSkin + 2];
            inputData[dst + 13] = skinWeights[srcSkin + 3];
        }
        
        // Create input buffer
        if (this.inputVertexBuffer) {
            this.inputVertexBuffer.destroy();
        }
        
        this.inputVertexBuffer = device.createBuffer({
            size: inputData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(this.inputVertexBuffer, 0, inputData);
        
        // Create output buffer
        if (this.outputVertexBuffer) {
            this.outputVertexBuffer.destroy();
        }
        
        const outputSize = this.vertexCount * 6 * 4; // position(3) + normal(3), 4 bytes per float
        this.outputVertexBuffer = device.createBuffer({
            size: outputSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.VERTEX
        });
    }
    
    /**
     * Execute skinning pass
     * @param {GPUDevice} device - WebGPU device
     * @param {GPUCommandEncoder} encoder - Command encoder
     * @param {Skeleton} skeleton - Skeleton with updated bone matrices
     * @param {BufferGeometry} geometry - Geometry to skin
     */
    execute(device, encoder, skeleton, geometry) {
        if (!this.compiled) {
            this.compile(device);
        }
        
        // Update bone matrices
        skeleton.update();
        this.updateBoneMatrices(device, skeleton.boneMatrices);
        
        // Setup buffers if needed
        if (!this.inputVertexBuffer) {
            this.setupInputBuffer(device, geometry);
        }
        
        // Create bind group
        const bindGroupLayout = this.pipeline.getBindGroupLayout(0);
        const bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.boneMatrixBuffer } },
                { binding: 1, resource: { buffer: this.inputVertexBuffer } },
                { binding: 2, resource: { buffer: this.outputVertexBuffer } }
            ]
        });
        
        this.bindGroups[0] = bindGroup;
        
        // Dispatch compute
        const workgroups = ComputeShader.calculateWorkgroups(this.vertexCount, 64);
        this.dispatch(encoder, workgroups);
    }
    
    /**
     * Get skinned vertex buffer for rendering
     * @returns {GPUBuffer}
     */
    getSkinnedVertexBuffer() {
        return this.outputVertexBuffer;
    }
    
    /**
     * Dispose resources
     */
    dispose() {
        super.dispose();
        
        if (this.boneMatrixBuffer) {
            this.boneMatrixBuffer.destroy();
            this.boneMatrixBuffer = null;
        }
        
        if (this.inputVertexBuffer) {
            this.inputVertexBuffer.destroy();
            this.inputVertexBuffer = null;
        }
        
        if (this.outputVertexBuffer) {
            this.outputVertexBuffer.destroy();
            this.outputVertexBuffer = null;
        }
    }
}

/**
 * SkinnedMesh - Mesh with skeletal animation support
 * Combines geometry, material, and skeleton
 */
export class SkinnedMesh {
    /**
     * @param {BufferGeometry} geometry - Geometry with skinning attributes
     * @param {Material} material - Material
     * @param {Skeleton} skeleton - Skeleton for animation
     */
    constructor(geometry, material, skeleton) {
        this.geometry = geometry;
        this.material = material;
        this.skeleton = skeleton;
        
        this.isSkinnedMesh = true;
        this.type = 'SkinnedMesh';
        
        // Bind skeleton to geometry
        this.bind(skeleton);
        
        // GPU skinning shader (lazy init)
        this.skinningShader = null;
    }
    
    /**
     * Bind skeleton to this mesh
     * @param {Skeleton} skeleton - Skeleton
     */
    bind(skeleton) {
        this.skeleton = skeleton;
        
        // Ensure geometry has required attributes
        if (!this.geometry.attributes.skinIndex || !this.geometry.attributes.skinWeight) {
            console.warn('[SkinnedMesh] Geometry missing skinIndex or skinWeight attributes');
        }
    }
    
    /**
     * Update skeleton (called before rendering)
     */
    updateSkeleton() {
        if (this.skeleton) {
            this.skeleton.update();
        }
    }
    
    /**
     * Initialize GPU skinning
     * @param {GPUDevice} device - WebGPU device
     */
    initGPUSkinning(device) {
        if (!this.skinningShader) {
            this.skinningShader = new SkinningShader();
            this.skinningShader.compile(device);
        }
    }
    
    /**
     * Dispose resources
     */
    dispose() {
        if (this.skeleton) {
            this.skeleton.dispose();
        }
        
        if (this.skinningShader) {
            this.skinningShader.dispose();
        }
    }
}
