import { ComputeShader } from './ComputeShader.js';

/**
 * FrustumCullingShader - GPU-accelerated frustum culling
 * Culls objects against view frustum using compute shader
 * Outputs visibility flags for draw call generation
 */

const FrustumCullingWGSL = `
    // Frustum planes (6 planes: left, right, bottom, top, near, far)
    struct FrustumPlane {
        normal: vec3<f32>,
        distance: f32,
    };
    
    struct Frustum {
        planes: array<FrustumPlane, 6>,
    };
    
    // Bounding sphere for each object
    struct BoundingSphere {
        center: vec3<f32>,
        radius: f32,
    };
    
    // Object data
    struct ObjectData {
        modelMatrix: mat4x4<f32>,
        boundingSphere: BoundingSphere,
    };
    
    // Visibility output (1 = visible, 0 = culled)
    struct VisibilityData {
        visible: u32,
    };
    
    // Bindings
    @group(0) @binding(0) var<uniform> frustum: Frustum;
    @group(0) @binding(1) var<storage, read> objects: array<ObjectData>;
    @group(0) @binding(2) var<storage, read_write> visibility: array<VisibilityData>;
    
    // Check if sphere is outside frustum plane
    fn sphereOutsidePlane(center: vec3<f32>, radius: f32, plane: FrustumPlane) -> bool {
        let distance = dot(plane.normal, center) + plane.distance;
        return distance < -radius;
    }
    
    // Main compute kernel
    @compute @workgroup_size(64, 1, 1)
    fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
        let objectIndex = globalId.x;
        
        // Bounds check
        if (objectIndex >= arrayLength(&objects)) {
            return;
        }
        
        let object = objects[objectIndex];
        
        // Transform bounding sphere center to world space
        let worldCenter = (object.modelMatrix * vec4<f32>(object.boundingSphere.center, 1.0)).xyz;
        let radius = object.boundingSphere.radius;
        
        // Test against all 6 frustum planes
        var isVisible = true;
        
        for (var i = 0u; i < 6u; i = i + 1u) {
            if (sphereOutsidePlane(worldCenter, radius, frustum.planes[i])) {
                isVisible = false;
                break;
            }
        }
        
        // Write visibility result
        visibility[objectIndex].visible = select(0u, 1u, isVisible);
    }
`;

/**
 * FrustumCullingShader - GPU frustum culling compute shader
 */
export class FrustumCullingShader extends ComputeShader {
    constructor() {
        super('FrustumCulling', FrustumCullingWGSL, {
            workgroupSize: [64, 1, 1]
        });
        
        // GPU buffers
        this.frustumBuffer = null;
        this.objectBuffer = null;
        this.visibilityBuffer = null;
        
        // CPU data
        this.frustumPlanes = new Float32Array(6 * 4); // 6 planes * (vec3 normal + float distance)
        this.objects = [];
    }
    
    /**
     * Update frustum planes from camera
     * @param {Camera} camera - Camera with projection and view matrices
     */
    updateFrustum(camera) {
        // Extract frustum planes from view-projection matrix
        const vp = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse);
        const m = vp.elements;
        
        // Left plane
        this.frustumPlanes[0] = m[3] + m[0];   // nx
        this.frustumPlanes[1] = m[7] + m[4];   // ny
        this.frustumPlanes[2] = m[11] + m[8];  // nz
        this.frustumPlanes[3] = m[15] + m[12]; // d
        
        // Right plane
        this.frustumPlanes[4] = m[3] - m[0];
        this.frustumPlanes[5] = m[7] - m[4];
        this.frustumPlanes[6] = m[11] - m[8];
        this.frustumPlanes[7] = m[15] - m[12];
        
        // Bottom plane
        this.frustumPlanes[8] = m[3] + m[1];
        this.frustumPlanes[9] = m[7] + m[5];
        this.frustumPlanes[10] = m[11] + m[9];
        this.frustumPlanes[11] = m[15] + m[13];
        
        // Top plane
        this.frustumPlanes[12] = m[3] - m[1];
        this.frustumPlanes[13] = m[7] - m[5];
        this.frustumPlanes[14] = m[11] - m[9];
        this.frustumPlanes[15] = m[15] - m[13];
        
        // Near plane
        this.frustumPlanes[16] = m[3] + m[2];
        this.frustumPlanes[17] = m[7] + m[6];
        this.frustumPlanes[18] = m[11] + m[10];
        this.frustumPlanes[19] = m[15] + m[14];
        
        // Far plane
        this.frustumPlanes[20] = m[3] - m[2];
        this.frustumPlanes[21] = m[7] - m[6];
        this.frustumPlanes[22] = m[11] - m[10];
        this.frustumPlanes[23] = m[15] - m[14];
        
        // Normalize planes
        for (let i = 0; i < 6; i++) {
            const offset = i * 4;
            const nx = this.frustumPlanes[offset + 0];
            const ny = this.frustumPlanes[offset + 1];
            const nz = this.frustumPlanes[offset + 2];
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
            
            this.frustumPlanes[offset + 0] /= len;
            this.frustumPlanes[offset + 1] /= len;
            this.frustumPlanes[offset + 2] /= len;
            this.frustumPlanes[offset + 3] /= len;
        }
    }
    
    /**
     * Add object for culling
     * @param {Object} object - Object with modelMatrix and geometry
     */
    addObject(object) {
        // Compute bounding sphere from geometry (simple implementation)
        const geometry = object.geometry;
        let radius = 1.0;
        
        if (geometry && geometry.boundingSphere) {
            radius = geometry.boundingSphere.radius;
        }
        
        this.objects.push({
            modelMatrix: object.matrixWorld,
            boundingSphere: {
                center: { x: 0, y: 0, z: 0 },
                radius: radius
            }
        });
    }
    
    /**
     * Clear objects list
     */
    clearObjects() {
        this.objects = [];
    }
    
    /**
     * Execute culling pass
     * @param {GPUDevice} device - WebGPU device
     * @param {GPUCommandEncoder} encoder - Command encoder
     * @returns {Promise<Uint32Array>} Visibility results
     */
    async execute(device, encoder) {
        const objectCount = this.objects.length;
        
        if (objectCount === 0) {
            return new Uint32Array(0);
        }
        
        // Create/update buffers (simplified - real implementation would cache these)
        this.frustumBuffer = device.createBuffer({
            size: this.frustumPlanes.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(this.frustumBuffer, 0, this.frustumPlanes);
        
        // Create object buffer (simplified)
        const objectData = new Float32Array(objectCount * 20); // 16 (matrix) + 4 (sphere)
        for (let i = 0; i < objectCount; i++) {
            const obj = this.objects[i];
            const offset = i * 20;
            
            // Copy matrix
            const m = obj.modelMatrix.elements;
            for (let j = 0; j < 16; j++) {
                objectData[offset + j] = m[j];
            }
            
            // Copy bounding sphere
            objectData[offset + 16] = obj.boundingSphere.center.x;
            objectData[offset + 17] = obj.boundingSphere.center.y;
            objectData[offset + 18] = obj.boundingSphere.center.z;
            objectData[offset + 19] = obj.boundingSphere.radius;
        }
        
        this.objectBuffer = device.createBuffer({
            size: objectData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(this.objectBuffer, 0, objectData);
        
        // Create visibility output buffer
        this.visibilityBuffer = device.createBuffer({
            size: objectCount * 4, // u32 per object
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        });
        
        // Setup bind group
        const bindGroupLayout = this.pipeline.getBindGroupLayout(0);
        const bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.frustumBuffer } },
                { binding: 1, resource: { buffer: this.objectBuffer } },
                { binding: 2, resource: { buffer: this.visibilityBuffer } }
            ]
        });
        
        this.bindGroups[0] = bindGroup;
        
        // Dispatch compute
        const workgroups = ComputeShader.calculateWorkgroups(objectCount, 64);
        this.dispatch(encoder, workgroups);
        
        // Read back results (simplified - real implementation would avoid stall)
        const readbackBuffer = device.createBuffer({
            size: objectCount * 4,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });
        
        encoder.copyBufferToBuffer(
            this.visibilityBuffer,
            0,
            readbackBuffer,
            0,
            objectCount * 4
        );
        
        // Submit and wait
        device.queue.submit([encoder.finish()]);
        
        await readbackBuffer.mapAsync(GPUMapMode.READ);
        const visibility = new Uint32Array(readbackBuffer.getMappedRange());
        const result = new Uint32Array(visibility);
        readbackBuffer.unmap();
        
        return result;
    }
}
