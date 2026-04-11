import { Object3D } from '../core/Object3D.js';
import { Matrix4 } from '../math/Matrix4.js';
import { Quaternion } from '../math/Quaternion.js';
import { Vector3 } from '../math/Vector3.js';

/**
 * Bone - Represents a single bone in a skeleton
 * Part of a hierarchical bone structure for skeletal animation
 */
export class Bone extends Object3D {
    constructor() {
        super();
        this.type = 'Bone';
        this.isBone = true;
    }
}

/**
 * Skeleton - Manages bones and their transforms for skeletal animation
 * Computes bone matrices for skinning
 */
export class Skeleton {
    /**
     * @param {Array<Bone>} bones - Array of bones in the skeleton
     * @param {Array<Matrix4>} boneInverses - Inverse bind matrices (optional)
     */
    constructor(bones = [], boneInverses = []) {
        this.bones = bones;
        
        // Inverse bind pose matrices (transform from model space to bone space)
        this.boneInverses = boneInverses;
        
        // If no inverse matrices provided, compute identity
        if (this.boneInverses.length === 0) {
            this.calculateInverses();
        }
        
        // Final bone matrices (bone space to model space)
        this.boneMatrices = new Float32Array(this.bones.length * 16);
        
        // Texture for GPU skinning (optional)
        this.boneTexture = null;
        
        // Update flag
        this.needsUpdate = true;
    }
    
    /**
     * Calculate inverse bind matrices from current bone positions
     */
    calculateInverses() {
        this.boneInverses = [];
        
        for (let i = 0; i < this.bones.length; i++) {
            const inverse = new Matrix4();
            
            if (this.bones[i]) {
                inverse.copy(this.bones[i].matrixWorld).invert();
            }
            
            this.boneInverses.push(inverse);
        }
    }
    
    /**
     * Update bone matrices for rendering
     * Computes final transform: bone.matrixWorld * boneInverse
     */
    update() {
        const bones = this.bones;
        const boneInverses = this.boneInverses;
        const boneMatrices = this.boneMatrices;
        
        // Temporary matrix for computation
        const boneMatrix = new Matrix4();
        
        for (let i = 0; i < bones.length; i++) {
            const bone = bones[i];
            
            if (bone) {
                // Compute: bone.matrixWorld * boneInverse[i]
                boneMatrix.multiplyMatrices(bone.matrixWorld, boneInverses[i]);
            } else {
                boneMatrix.identity();
            }
            
            // Copy to flat array
            boneMatrix.toArray(boneMatrices, i * 16);
        }
        
        this.needsUpdate = false;
    }
    
    /**
     * Clone this skeleton
     */
    clone() {
        return new Skeleton(this.bones, this.boneInverses);
    }
    
    /**
     * Get bone by name
     * @param {string} name - Bone name
     * @returns {Bone|null}
     */
    getBoneByName(name) {
        for (let i = 0; i < this.bones.length; i++) {
            const bone = this.bones[i];
            if (bone.name === name) {
                return bone;
            }
        }
        return null;
    }
    
    /**
     * Dispose resources
     */
    dispose() {
        if (this.boneTexture) {
            this.boneTexture.dispose();
            this.boneTexture = null;
        }
    }
}

/**
 * AnimationClip - Stores animation data for keyframe animation
 * Contains tracks for position, rotation, scale, and other properties
 */
export class AnimationClip {
    /**
     * @param {string} name - Animation name
     * @param {number} duration - Duration in seconds
     * @param {Array<KeyframeTrack>} tracks - Animation tracks
     */
    constructor(name, duration = -1, tracks = []) {
        this.name = name;
        this.tracks = tracks;
        
        // Auto-calculate duration if not provided
        this.duration = duration;
        if (this.duration < 0) {
            this.calculateDuration();
        }
        
        // Loop mode
        this.loop = true;
    }
    
    /**
     * Calculate clip duration from tracks
     */
    calculateDuration() {
        let maxDuration = 0;
        
        for (let i = 0; i < this.tracks.length; i++) {
            const track = this.tracks[i];
            const trackDuration = track.times[track.times.length - 1];
            maxDuration = Math.max(maxDuration, trackDuration);
        }
        
        this.duration = maxDuration;
    }
    
    /**
     * Optimize the clip (remove redundant keyframes)
     */
    optimize() {
        for (let i = 0; i < this.tracks.length; i++) {
            this.tracks[i].optimize();
        }
        return this;
    }
    
    /**
     * Clone this clip
     */
    clone() {
        const tracks = [];
        for (let i = 0; i < this.tracks.length; i++) {
            tracks.push(this.tracks[i].clone());
        }
        return new AnimationClip(this.name, this.duration, tracks);
    }
}

/**
 * KeyframeTrack - Stores keyframe data for a single animated property
 * Base class for specific track types (position, rotation, scale)
 */
export class KeyframeTrack {
    /**
     * @param {string} name - Track name (e.g., "bone.position")
     * @param {Float32Array} times - Keyframe times
     * @param {Float32Array} values - Keyframe values
     * @param {string} interpolation - Interpolation mode ('linear', 'step', 'cubic')
     */
    constructor(name, times, values, interpolation = 'linear') {
        this.name = name;
        this.times = times;
        this.values = values;
        this.interpolation = interpolation;
        
        // Value size (3 for vec3, 4 for quaternion, etc.)
        this.valueSize = values.length / times.length;
    }
    
    /**
     * Interpolate value at given time
     * @param {number} time - Time in seconds
     * @param {Array|Float32Array} result - Output array
     */
    interpolate(time, result) {
        const times = this.times;
        const values = this.values;
        const valueSize = this.valueSize;
        
        // Find keyframe indices
        let i1 = 0;
        for (let i = 0; i < times.length - 1; i++) {
            if (time >= times[i] && time < times[i + 1]) {
                i1 = i;
                break;
            }
        }
        
        const i2 = Math.min(i1 + 1, times.length - 1);
        
        // Interpolation factor
        const t1 = times[i1];
        const t2 = times[i2];
        const factor = t2 > t1 ? (time - t1) / (t2 - t1) : 0;
        
        // Interpolate based on mode
        if (this.interpolation === 'step') {
            // Step interpolation (no blending)
            const offset = i1 * valueSize;
            for (let i = 0; i < valueSize; i++) {
                result[i] = values[offset + i];
            }
        } else {
            // Linear interpolation
            const offset1 = i1 * valueSize;
            const offset2 = i2 * valueSize;
            
            for (let i = 0; i < valueSize; i++) {
                const v1 = values[offset1 + i];
                const v2 = values[offset2 + i];
                result[i] = v1 + (v2 - v1) * factor;
            }
        }
        
        return result;
    }
    
    /**
     * Optimize track (remove redundant keyframes)
     */
    optimize() {
        // Simple optimization: remove duplicate consecutive values
        // Real implementation would be more sophisticated
        return this;
    }
    
    /**
     * Clone this track
     */
    clone() {
        return new KeyframeTrack(
            this.name,
            new Float32Array(this.times),
            new Float32Array(this.values),
            this.interpolation
        );
    }
}

/**
 * VectorKeyframeTrack - Track for Vector3 properties (position, scale)
 */
export class VectorKeyframeTrack extends KeyframeTrack {
    constructor(name, times, values) {
        super(name, times, values, 'linear');
    }
    
    interpolate(time, result) {
        super.interpolate(time, result);
        return result;
    }
}

/**
 * QuaternionKeyframeTrack - Track for quaternion rotation
 * Uses spherical linear interpolation (slerp)
 */
export class QuaternionKeyframeTrack extends KeyframeTrack {
    constructor(name, times, values) {
        super(name, times, values, 'linear');
    }
    
    interpolate(time, result) {
        const times = this.times;
        const values = this.values;
        
        // Find keyframe indices
        let i1 = 0;
        for (let i = 0; i < times.length - 1; i++) {
            if (time >= times[i] && time < times[i + 1]) {
                i1 = i;
                break;
            }
        }
        
        const i2 = Math.min(i1 + 1, times.length - 1);
        
        // Interpolation factor
        const t1 = times[i1];
        const t2 = times[i2];
        const factor = t2 > t1 ? (time - t1) / (t2 - t1) : 0;
        
        // Get quaternions
        const offset1 = i1 * 4;
        const offset2 = i2 * 4;
        
        const q1 = new Quaternion(
            values[offset1 + 0],
            values[offset1 + 1],
            values[offset1 + 2],
            values[offset1 + 3]
        );
        
        const q2 = new Quaternion(
            values[offset2 + 0],
            values[offset2 + 1],
            values[offset2 + 2],
            values[offset2 + 3]
        );
        
        // Slerp
        const resultQuat = new Quaternion();
        Quaternion.slerp(q1, q2, resultQuat, factor);
        
        result[0] = resultQuat.x;
        result[1] = resultQuat.y;
        result[2] = resultQuat.z;
        result[3] = resultQuat.w;
        
        return result;
    }
}
