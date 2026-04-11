import { Mesh } from './Mesh.js';
import { Matrix4 } from '../math/Matrix4.js';

/**
 * InstancedMesh - Renders multiple instances of the same geometry with different transforms
 * Significant performance improvement for rendering many identical objects
 * Uses GPU instancing (hardware instancing) when available
 */
export class InstancedMesh extends Mesh {
    /**
     * @param {BufferGeometry} geometry - Shared geometry for all instances
     * @param {Material} material - Shared material for all instances
     * @param {number} count - Maximum number of instances
     */
    constructor(geometry, material, count) {
        super(geometry, material);
        
        this.isInstancedMesh = true;
        this.type = 'InstancedMesh';
        
        // Maximum number of instances
        this.count = count;
        
        // Instance matrices (one per instance)
        // Each instance has its own transform matrix
        this.instanceMatrix = new Float32Array(count * 16);
        
        // Optional per-instance colors
        this.instanceColor = null;
        
        // Dirty flag to track when matrices need GPU update
        this.instanceMatrixDirty = false;
        
        // Initialize all instances to identity matrices
        for (let i = 0; i < count; i++) {
            const offset = i * 16;
            // Identity matrix
            this.instanceMatrix[offset + 0] = 1;
            this.instanceMatrix[offset + 5] = 1;
            this.instanceMatrix[offset + 10] = 1;
            this.instanceMatrix[offset + 15] = 1;
        }
        
        // Temporary matrix for modifications
        this._matrix = new Matrix4();
    }
    
    /**
     * Set the transform matrix for a specific instance
     * @param {number} index - Instance index (0 to count-1)
     * @param {Matrix4} matrix - Transform matrix for this instance
     */
    setMatrixAt(index, matrix) {
        if (index >= this.count) {
            console.warn(`InstancedMesh: index ${index} exceeds count ${this.count}`);
            return;
        }
        
        const offset = index * 16;
        const elements = matrix.elements;
        
        for (let i = 0; i < 16; i++) {
            this.instanceMatrix[offset + i] = elements[i];
        }
        
        this.instanceMatrixDirty = true;
    }
    
    /**
     * Get the transform matrix for a specific instance
     * @param {number} index - Instance index
     * @param {Matrix4} matrix - Target matrix to fill
     */
    getMatrixAt(index, matrix) {
        if (index >= this.count) {
            console.warn(`InstancedMesh: index ${index} exceeds count ${this.count}`);
            return;
        }
        
        const offset = index * 16;
        const elements = matrix.elements;
        
        for (let i = 0; i < 16; i++) {
            elements[i] = this.instanceMatrix[offset + i];
        }
    }
    
    /**
     * Set per-instance color (optional)
     * @param {number} index - Instance index
     * @param {Color} color - Color for this instance
     */
    setColorAt(index, color) {
        if (!this.instanceColor) {
            // Lazy initialization of color buffer
            this.instanceColor = new Float32Array(this.count * 3);
        }
        
        if (index >= this.count) {
            console.warn(`InstancedMesh: index ${index} exceeds count ${this.count}`);
            return;
        }
        
        const offset = index * 3;
        this.instanceColor[offset + 0] = color.r;
        this.instanceColor[offset + 1] = color.g;
        this.instanceColor[offset + 2] = color.b;
        
        this.instanceColorDirty = true;
    }
    
    /**
     * Get per-instance color
     * @param {number} index - Instance index
     * @param {Color} color - Target color to fill
     */
    getColorAt(index, color) {
        if (!this.instanceColor) {
            return;
        }
        
        if (index >= this.count) {
            console.warn(`InstancedMesh: index ${index} exceeds count ${this.count}`);
            return;
        }
        
        const offset = index * 3;
        color.r = this.instanceColor[offset + 0];
        color.g = this.instanceColor[offset + 1];
        color.b = this.instanceColor[offset + 2];
    }
    
    /**
     * Dispose of GPU resources
     */
    dispose() {
        super.dispose();
        
        // Mark for cleanup
        this.instanceMatrix = null;
        this.instanceColor = null;
    }
    
    /**
     * Copy instance data from another InstancedMesh
     * @param {InstancedMesh} source - Source mesh
     */
    copy(source) {
        super.copy(source);
        
        this.count = source.count;
        
        // Copy instance matrices
        this.instanceMatrix = new Float32Array(source.instanceMatrix);
        
        // Copy instance colors if present
        if (source.instanceColor) {
            this.instanceColor = new Float32Array(source.instanceColor);
        }
        
        return this;
    }
    
    /**
     * Clone this InstancedMesh
     */
    clone() {
        return new this.constructor(
            this.geometry,
            this.material,
            this.count
        ).copy(this);
    }
}
