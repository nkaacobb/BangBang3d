import { BufferGeometry } from '../core/BufferGeometry.js';
import { Mesh } from '../core/Mesh.js';
import { Matrix4 } from '../math/Matrix4.js';

/**
 * MeshBatcher - Automatic mesh batching system
 * Combines multiple meshes with the same material into single draw calls
 * Significant performance improvement for scenes with many small objects
 */
export class MeshBatcher {
    constructor() {
        // Batches organized by material
        this.batches = new Map();
        
        // Maximum vertices per batch (to avoid huge buffers)
        this.maxVerticesPerBatch = 65536;
        
        // Enable/disable batching
        this.enabled = true;
    }
    
    /**
     * Add a mesh to batching system
     * @param {Mesh} mesh - Mesh to batch
     */
    addMesh(mesh) {
        if (!this.enabled || !mesh.geometry || !mesh.material) {
            return;
        }
        
        // Skip if mesh is too large
        const vertexCount = mesh.geometry.attributes.position.count;
        if (vertexCount > this.maxVerticesPerBatch / 4) {
            return; // Don't batch large meshes
        }
        
        // Get or create batch for this material
        const materialKey = this._getMaterialKey(mesh.material);
        
        if (!this.batches.has(materialKey)) {
            this.batches.set(materialKey, {
                material: mesh.material,
                meshes: [],
                geometry: null,
                vertexCount: 0,
                needsUpdate: true
            });
        }
        
        const batch = this.batches.get(materialKey);
        
        // Check if adding this mesh would exceed limit
        if (batch.vertexCount + vertexCount > this.maxVerticesPerBatch) {
            // Create new batch for same material
            const newBatch = {
                material: mesh.material,
                meshes: [],
                geometry: null,
                vertexCount: 0,
                needsUpdate: true
            };
            
            // Generate unique key
            const newKey = `${materialKey}_${this.batches.size}`;
            this.batches.set(newKey, newBatch);
            
            newBatch.meshes.push(mesh);
            newBatch.vertexCount += vertexCount;
        } else {
            batch.meshes.push(mesh);
            batch.vertexCount += vertexCount;
            batch.needsUpdate = true;
        }
    }
    
    /**
     * Remove a mesh from batching
     * @param {Mesh} mesh - Mesh to remove
     */
    removeMesh(mesh) {
        const materialKey = this._getMaterialKey(mesh.material);
        const batch = this.batches.get(materialKey);
        
        if (batch) {
            const index = batch.meshes.indexOf(mesh);
            if (index !== -1) {
                batch.meshes.splice(index, 1);
                batch.needsUpdate = true;
                
                const vertexCount = mesh.geometry.attributes.position.count;
                batch.vertexCount -= vertexCount;
                
                // Remove batch if empty
                if (batch.meshes.length === 0) {
                    this.batches.delete(materialKey);
                }
            }
        }
    }
    
    /**
     * Update all batches (rebuild geometries)
     */
    update() {
        for (const [key, batch] of this.batches) {
            if (batch.needsUpdate) {
                batch.geometry = this._buildBatchGeometry(batch);
                batch.needsUpdate = false;
            }
        }
    }
    
    /**
     * Build combined geometry for a batch
     */
    _buildBatchGeometry(batch) {
        if (batch.meshes.length === 0) {
            return null;
        }
        
        const totalVertices = batch.vertexCount;
        
        // Allocate arrays
        const positions = new Float32Array(totalVertices * 3);
        const normals = new Float32Array(totalVertices * 3);
        const uvs = new Float32Array(totalVertices * 2);
        
        let vertexOffset = 0;
        
        // Merge geometries
        for (const mesh of batch.meshes) {
            const geometry = mesh.geometry;
            const posAttr = geometry.attributes.position;
            const normalAttr = geometry.attributes.normal;
            const uvAttr = geometry.attributes.uv;
            
            const vertCount = posAttr.count;
            const modelMatrix = mesh.matrixWorld;
            
            // Transform and copy positions
            for (let i = 0; i < vertCount; i++) {
                const srcIdx = i * 3;
                const dstIdx = (vertexOffset + i) * 3;
                
                // Apply transform
                const x = posAttr.array[srcIdx + 0];
                const y = posAttr.array[srcIdx + 1];
                const z = posAttr.array[srcIdx + 2];
                
                const transformed = modelMatrix.transformPoint({ x, y, z });
                
                positions[dstIdx + 0] = transformed.x;
                positions[dstIdx + 1] = transformed.y;
                positions[dstIdx + 2] = transformed.z;
            }
            
            // Transform and copy normals
            if (normalAttr) {
                for (let i = 0; i < vertCount; i++) {
                    const srcIdx = i * 3;
                    const dstIdx = (vertexOffset + i) * 3;
                    
                    const x = normalAttr.array[srcIdx + 0];
                    const y = normalAttr.array[srcIdx + 1];
                    const z = normalAttr.array[srcIdx + 2];
                    
                    const transformed = modelMatrix.transformDirection({ x, y, z });
                    
                    normals[dstIdx + 0] = transformed.x;
                    normals[dstIdx + 1] = transformed.y;
                    normals[dstIdx + 2] = transformed.z;
                }
            }
            
            // Copy UVs (no transform needed)
            if (uvAttr) {
                for (let i = 0; i < vertCount; i++) {
                    const srcIdx = i * 2;
                    const dstIdx = (vertexOffset + i) * 2;
                    
                    uvs[dstIdx + 0] = uvAttr.array[srcIdx + 0];
                    uvs[dstIdx + 1] = uvAttr.array[srcIdx + 1];
                }
            }
            
            vertexOffset += vertCount;
        }
        
        // Create batched geometry
        const batchedGeometry = new BufferGeometry();
        
        batchedGeometry.setAttribute('position', {
            array: positions,
            itemSize: 3,
            count: totalVertices
        });
        
        batchedGeometry.setAttribute('normal', {
            array: normals,
            itemSize: 3,
            count: totalVertices
        });
        
        batchedGeometry.setAttribute('uv', {
            array: uvs,
            itemSize: 2,
            count: totalVertices
        });
        
        return batchedGeometry;
    }
    
    /**
     * Get batched meshes for rendering
     * @returns {Array<Mesh>} Array of batched meshes
     */
    getBatchedMeshes() {
        const meshes = [];
        
        for (const [key, batch] of this.batches) {
            if (batch.geometry && batch.meshes.length > 0) {
                const batchedMesh = new Mesh(batch.geometry, batch.material);
                batchedMesh.isBatched = true;
                meshes.push(batchedMesh);
            }
        }
        
        return meshes;
    }
    
    /**
     * Clear all batches
     */
    clear() {
        this.batches.clear();
    }
    
    /**
     * Get statistics
     */
    getStats() {
        let totalMeshes = 0;
        let totalBatches = 0;
        
        for (const [key, batch] of this.batches) {
            totalMeshes += batch.meshes.length;
            totalBatches++;
        }
        
        return {
            batches: totalBatches,
            meshes: totalMeshes,
            drawCallReduction: totalMeshes > 0 ? totalMeshes - totalBatches : 0
        };
    }
    
    /**
     * Generate material key for batching
     */
    _getMaterialKey(material) {
        // Simple key generation based on material type and properties
        // Real implementation would need more sophisticated key
        return `${material.type}_${material.id || 0}`;
    }
}

/**
 * StaticMeshBatcher - Specialized batcher for static (non-moving) meshes
 * More aggressive batching since transforms don't change
 */
export class StaticMeshBatcher extends MeshBatcher {
    constructor() {
        super();
        
        // Track which meshes are static
        this.staticMeshes = new Set();
    }
    
    /**
     * Mark mesh as static (won't move)
     * @param {Mesh} mesh - Mesh to mark as static
     */
    markStatic(mesh) {
        this.staticMeshes.add(mesh);
        this.addMesh(mesh);
    }
    
    /**
     * Mark mesh as dynamic (can move)
     * @param {Mesh} mesh - Mesh to mark as dynamic
     */
    markDynamic(mesh) {
        this.staticMeshes.delete(mesh);
        this.removeMesh(mesh);
    }
    
    /**
     * Check if mesh is static
     * @param {Mesh} mesh - Mesh to check
     * @returns {boolean}
     */
    isStatic(mesh) {
        return this.staticMeshes.has(mesh);
    }
}

/**
 * DynamicMeshBatcher - Batcher for moving meshes
 * Rebuilds batches each frame (less efficient but handles dynamic objects)
 */
export class DynamicMeshBatcher extends MeshBatcher {
    constructor() {
        super();
        
        // Auto-rebuild each frame
        this.autoRebuild = true;
    }
    
    /**
     * Update and rebuild all batches
     */
    update() {
        if (this.autoRebuild) {
            // Mark all batches for rebuild
            for (const [key, batch] of this.batches) {
                batch.needsUpdate = true;
            }
        }
        
        super.update();
    }
}
