import { AnimationClip, VectorKeyframeTrack, QuaternionKeyframeTrack } from './Skeleton.js';
import { Quaternion } from '../math/Quaternion.js';
import { Vector3 } from '../math/Vector3.js';

/**
 * AnimationAction - Controls playback of an AnimationClip
 * Manages play/pause, time, weight, and blending
 */
export class AnimationAction {
    /**
     * @param {AnimationClip} clip - Animation clip to play
     * @param {AnimationMixer} mixer - Parent mixer
     * @param {Object3D} root - Root object for animation
     */
    constructor(clip, mixer, root) {
        this.clip = clip;
        this.mixer = mixer;
        this.root = root;
        
        // Playback state
        this.time = 0;
        this.timeScale = 1.0;
        this.weight = 1.0;
        this.loop = true;
        this.enabled = true;
        this.paused = false;
        
        // Fade in/out
        this.fadeInDuration = 0;
        this.fadeOutDuration = 0;
        this.fadeDirection = 0; // 0: none, 1: in, -1: out
        this.fadeTime = 0;
        
        // Cached property accessors
        this._propertyBindings = [];
        this._initPropertyBindings();
    }
    
    /**
     * Initialize property bindings for tracks
     */
    _initPropertyBindings() {
        const tracks = this.clip.tracks;
        
        for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            const binding = this._createPropertyBinding(track);
            
            if (binding) {
                this._propertyBindings.push(binding);
            }
        }
    }
    
    /**
     * Create property binding for a track
     * @param {KeyframeTrack} track - Animation track
     */
    _createPropertyBinding(track) {
        // Parse track name: "boneName.property"
        const parts = track.name.split('.');
        if (parts.length < 2) {
            console.warn(`[AnimationAction] Invalid track name: ${track.name}`);
            return null;
        }
        
        const objectName = parts[0];
        const propertyName = parts[1];
        
        // Find target object
        let targetObject = this.root;
        
        if (objectName !== this.root.name) {
            targetObject = this.root.getObjectByName(objectName);
        }
        
        if (!targetObject) {
            console.warn(`[AnimationAction] Object not found: ${objectName}`);
            return null;
        }
        
        return {
            track: track,
            object: targetObject,
            property: propertyName,
            buffer: new Float32Array(track.valueSize)
        };
    }
    
    /**
     * Play the animation
     */
    play() {
        this.enabled = true;
        this.paused = false;
        this.mixer._activateAction(this);
        return this;
    }
    
    /**
     * Stop the animation
     */
    stop() {
        this.enabled = false;
        this.time = 0;
        this.mixer._deactivateAction(this);
        return this;
    }
    
    /**
     * Pause the animation
     */
    pause() {
        this.paused = true;
        return this;
    }
    
    /**
     * Resume paused animation
     */
    resume() {
        this.paused = false;
        return this;
    }
    
    /**
     * Fade in animation over duration
     * @param {number} duration - Fade duration in seconds
     */
    fadeIn(duration) {
        this.fadeInDuration = duration;
        this.fadeDirection = 1;
        this.fadeTime = 0;
        this.weight = 0;
        return this.play();
    }
    
    /**
     * Fade out animation over duration
     * @param {number} duration - Fade duration in seconds
     */
    fadeOut(duration) {
        this.fadeOutDuration = duration;
        this.fadeDirection = -1;
        this.fadeTime = 0;
        return this;
    }
    
    /**
     * Set animation weight (for blending)
     * @param {number} weight - Weight (0-1)
     */
    setWeight(weight) {
        this.weight = Math.max(0, Math.min(1, weight));
        return this;
    }
    
    /**
     * Set time scale (playback speed)
     * @param {number} scale - Time scale (1.0 = normal speed)
     */
    setTimeScale(scale) {
        this.timeScale = scale;
        return this;
    }
    
    /**
     * Update animation state
     * @param {number} deltaTime - Time delta in seconds
     */
    update(deltaTime) {
        if (!this.enabled || this.paused) {
            return;
        }
        
        // Update time
        this.time += deltaTime * this.timeScale;
        
        // Handle looping
        if (this.loop) {
            this.time = this.time % this.clip.duration;
        } else {
            this.time = Math.min(this.time, this.clip.duration);
            
            if (this.time >= this.clip.duration) {
                this.stop();
                return;
            }
        }
        
        // Update fade
        if (this.fadeDirection !== 0) {
            this.fadeTime += deltaTime;
            
            if (this.fadeDirection === 1) {
                // Fade in
                this.weight = Math.min(1, this.fadeTime / this.fadeInDuration);
                if (this.fadeTime >= this.fadeInDuration) {
                    this.fadeDirection = 0;
                }
            } else {
                // Fade out
                this.weight = Math.max(0, 1 - this.fadeTime / this.fadeOutDuration);
                if (this.fadeTime >= this.fadeOutDuration) {
                    this.stop();
                    return;
                }
            }
        }
        
        // Apply animation
        this._applyAnimation();
    }
    
    /**
     * Apply animation to target objects
     */
    _applyAnimation() {
        const weight = this.weight;
        
        for (let i = 0; i < this._propertyBindings.length; i++) {
            const binding = this._propertyBindings[i];
            
            // Interpolate track at current time
            binding.track.interpolate(this.time, binding.buffer);
            
            // Apply to object property
            const obj = binding.object;
            const prop = binding.property;
            
            if (prop === 'position') {
                if (weight === 1.0) {
                    obj.position.set(
                        binding.buffer[0],
                        binding.buffer[1],
                        binding.buffer[2]
                    );
                } else {
                    // Blend with existing position
                    obj.position.lerp(
                        new Vector3(binding.buffer[0], binding.buffer[1], binding.buffer[2]),
                        weight
                    );
                }
            } else if (prop === 'quaternion' || prop === 'rotation') {
                const quat = new Quaternion(
                    binding.buffer[0],
                    binding.buffer[1],
                    binding.buffer[2],
                    binding.buffer[3]
                );
                
                if (weight === 1.0) {
                    obj.quaternion.copy(quat);
                } else {
                    obj.quaternion.slerp(quat, weight);
                }
            } else if (prop === 'scale') {
                if (weight === 1.0) {
                    obj.scale.set(
                        binding.buffer[0],
                        binding.buffer[1],
                        binding.buffer[2]
                    );
                } else {
                    obj.scale.lerp(
                        new Vector3(binding.buffer[0], binding.buffer[1], binding.buffer[2]),
                        weight
                    );
                }
            }
        }
    }
}

/**
 * AnimationMixer - Manages multiple animation actions and blending
 * Updates animations and applies them to the scene
 */
export class AnimationMixer {
    /**
     * @param {Object3D} root - Root object for all animations
     */
    constructor(root) {
        this.root = root;
        
        // Active actions
        this._actions = [];
        this._activeActions = [];
        
        // Time tracking
        this.time = 0;
        this.timeScale = 1.0;
    }
    
    /**
     * Create an action from an animation clip
     * @param {AnimationClip} clip - Animation clip
     * @returns {AnimationAction}
     */
    clipAction(clip) {
        // Check if action already exists
        for (let i = 0; i < this._actions.length; i++) {
            if (this._actions[i].clip === clip) {
                return this._actions[i];
            }
        }
        
        // Create new action
        const action = new AnimationAction(clip, this, this.root);
        this._actions.push(action);
        
        return action;
    }
    
    /**
     * Activate an action (start tracking for updates)
     * @param {AnimationAction} action - Action to activate
     */
    _activateAction(action) {
        if (this._activeActions.indexOf(action) === -1) {
            this._activeActions.push(action);
        }
    }
    
    /**
     * Deactivate an action
     * @param {AnimationAction} action - Action to deactivate
     */
    _deactivateAction(action) {
        const index = this._activeActions.indexOf(action);
        if (index !== -1) {
            this._activeActions.splice(index, 1);
        }
    }
    
    /**
     * Update all active animations
     * @param {number} deltaTime - Time delta in seconds
     */
    update(deltaTime) {
        this.time += deltaTime * this.timeScale;
        
        const scaledDelta = deltaTime * this.timeScale;
        
        // Update all active actions
        for (let i = 0; i < this._activeActions.length; i++) {
            this._activeActions[i].update(scaledDelta);
        }
    }
    
    /**
     * Stop all animations
     */
    stopAllAction() {
        for (let i = 0; i < this._actions.length; i++) {
            this._actions[i].stop();
        }
    }
    
    /**
     * Get existing action for a clip
     * @param {AnimationClip} clip - Animation clip
     * @returns {AnimationAction|null}
     */
    getAction(clip) {
        for (let i = 0; i < this._actions.length; i++) {
            if (this._actions[i].clip === clip) {
                return this._actions[i];
            }
        }
        return null;
    }
    
    /**
     * Dispose resources
     */
    dispose() {
        this._actions = [];
        this._activeActions = [];
    }
}
