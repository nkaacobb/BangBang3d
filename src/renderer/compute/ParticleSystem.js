import { ComputeShader } from './ComputeShader.js';
import { Vector3 } from '../../math/Vector3.js';
import { Color } from '../../math/Color.js';

/**
 * ParticleSystem - GPU-accelerated particle system
 * Uses compute shaders for particle simulation
 * Supports forces, lifetime, color, and size variation
 */

const ParticleUpdateWGSL = `
    // Particle data structure
    struct Particle {
        position: vec3<f32>,
        velocity: vec3<f32>,
        color: vec4<f32>,
        size: f32,
        lifetime: f32,
        age: f32,
        active: u32,
    };
    
    // Simulation parameters
    struct SimulationParams {
        deltaTime: f32,
        gravity: vec3<f32>,
        damping: f32,
    };
    
    // Bindings
    @group(0) @binding(0) var<uniform> params: SimulationParams;
    @group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
    
    // Update single particle
    fn updateParticle(particle: ptr<storage, Particle, read_write>, dt: f32) {
        // Check if particle is active
        if ((*particle).active == 0u) {
            return;
        }
        
        // Update age
        (*particle).age += dt;
        
        // Kill particle if lifetime exceeded
        if ((*particle).age >= (*particle).lifetime) {
            (*particle).active = 0u;
            return;
        }
        
        // Apply gravity
        (*particle).velocity += params.gravity * dt;
        
        // Apply damping
        (*particle).velocity *= (1.0 - params.damping * dt);
        
        // Update position
        (*particle).position += (*particle).velocity * dt;
        
        // Fade out based on lifetime
        let lifeRatio = (*particle).age / (*particle).lifetime;
        (*particle).color.a = 1.0 - lifeRatio;
        
        // Shrink based on lifetime (optional)
        (*particle).size *= (1.0 - dt * 0.1);
    }
    
    // Main compute kernel
    @compute @workgroup_size(64, 1, 1)
    fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
        let particleIndex = globalId.x;
        
        // Bounds check
        if (particleIndex >= arrayLength(&particles)) {
            return;
        }
        
        // Update particle
        updateParticle(&particles[particleIndex], params.deltaTime);
    }
`;

/**
 * ParticleEmitter - Emits particles with configurable properties
 */
export class ParticleEmitter {
    constructor(maxParticles = 1000) {
        this.maxParticles = maxParticles;
        
        // Emission properties
        this.emissionRate = 10; // particles per second
        this.emissionAccumulator = 0;
        
        // Position and velocity
        this.position = new Vector3(0, 0, 0);
        this.velocity = new Vector3(0, 1, 0);
        this.velocityVariation = new Vector3(0.5, 0.5, 0.5);
        
        // Particle properties
        this.lifetime = 2.0;
        this.lifetimeVariation = 0.5;
        this.size = 1.0;
        this.sizeVariation = 0.2;
        this.color = new Color(1, 1, 1);
        
        // Simulation
        this.gravity = new Vector3(0, -9.8, 0);
        this.damping = 0.1;
        
        // Particle data (CPU-side)
        this.particles = [];
        this.nextParticleIndex = 0;
        
        // Initialize particle pool
        for (let i = 0; i < maxParticles; i++) {
            this.particles.push({
                position: new Vector3(),
                velocity: new Vector3(),
                color: new Color(),
                size: 1.0,
                lifetime: 1.0,
                age: 0.0,
                active: false
            });
        }
    }
    
    /**
     * Emit a single particle
     */
    emit() {
        // Find inactive particle
        let particle = null;
        
        for (let i = 0; i < this.maxParticles; i++) {
            const idx = (this.nextParticleIndex + i) % this.maxParticles;
            if (!this.particles[idx].active) {
                particle = this.particles[idx];
                this.nextParticleIndex = (idx + 1) % this.maxParticles;
                break;
            }
        }
        
        if (!particle) {
            return; // No inactive particles available
        }
        
        // Initialize particle
        particle.position.copy(this.position);
        
        particle.velocity.copy(this.velocity);
        particle.velocity.x += (Math.random() - 0.5) * this.velocityVariation.x;
        particle.velocity.y += (Math.random() - 0.5) * this.velocityVariation.y;
        particle.velocity.z += (Math.random() - 0.5) * this.velocityVariation.z;
        
        particle.color.copy(this.color);
        
        particle.size = this.size + (Math.random() - 0.5) * this.sizeVariation;
        particle.lifetime = this.lifetime + (Math.random() - 0.5) * this.lifetimeVariation;
        particle.age = 0.0;
        particle.active = true;
    }
    
    /**
     * Update emitter and emit particles
     * @param {number} deltaTime - Time delta in seconds
     */
    update(deltaTime) {
        // Emit particles based on emission rate
        this.emissionAccumulator += deltaTime * this.emissionRate;
        
        while (this.emissionAccumulator >= 1.0) {
            this.emit();
            this.emissionAccumulator -= 1.0;
        }
    }
    
    /**
     * Get particle data as Float32Array for GPU
     * @returns {Float32Array} Packed particle data
     */
    getParticleData() {
        // Pack: position(3) + velocity(3) + color(4) + size(1) + lifetime(1) + age(1) + active(1) = 14 floats
        const data = new Float32Array(this.maxParticles * 14);
        
        for (let i = 0; i < this.maxParticles; i++) {
            const p = this.particles[i];
            const offset = i * 14;
            
            data[offset + 0] = p.position.x;
            data[offset + 1] = p.position.y;
            data[offset + 2] = p.position.z;
            
            data[offset + 3] = p.velocity.x;
            data[offset + 4] = p.velocity.y;
            data[offset + 5] = p.velocity.z;
            
            data[offset + 6] = p.color.r;
            data[offset + 7] = p.color.g;
            data[offset + 8] = p.color.b;
            data[offset + 9] = p.active ? 1.0 : 0.0; // alpha
            
            data[offset + 10] = p.size;
            data[offset + 11] = p.lifetime;
            data[offset + 12] = p.age;
            data[offset + 13] = p.active ? 1.0 : 0.0;
        }
        
        return data;
    }
}

/**
 * GPUParticleSystem - GPU-accelerated particle system
 */
export class GPUParticleSystem extends ComputeShader {
    constructor(maxParticles = 10000) {
        super('ParticleUpdate', ParticleUpdateWGSL, {
            workgroupSize: [64, 1, 1]
        });
        
        this.maxParticles = maxParticles;
        
        // Emitter
        this.emitter = new ParticleEmitter(maxParticles);
        
        // GPU buffers
        this.particleBuffer = null;
        this.paramsBuffer = null;
        
        // Simulation parameters
        this.simulationParams = new Float32Array(8); // deltaTime + gravity(3) + damping + padding
    }
    
    /**
     * Initialize GPU resources
     * @param {GPUDevice} device - WebGPU device
     */
    initialize(device) {
        if (!this.compiled) {
            this.compile(device);
        }
        
        // Create particle buffer
        const particleDataSize = this.maxParticles * 14 * 4; // 14 floats per particle
        this.particleBuffer = device.createBuffer({
            size: particleDataSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });
        
        // Create params buffer
        this.paramsBuffer = device.createBuffer({
            size: this.simulationParams.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        
        // Upload initial particle data
        const particleData = this.emitter.getParticleData();
        device.queue.writeBuffer(this.particleBuffer, 0, particleData);
    }
    
    /**
     * Update particle system
     * @param {GPUDevice} device - WebGPU device
     * @param {GPUCommandEncoder} encoder - Command encoder
     * @param {number} deltaTime - Time delta in seconds
     */
    update(device, encoder, deltaTime) {
        // Update emitter (emit new particles)
        this.emitter.update(deltaTime);
        
        // Update simulation parameters
        this.simulationParams[0] = deltaTime;
        this.simulationParams[1] = this.emitter.gravity.x;
        this.simulationParams[2] = this.emitter.gravity.y;
        this.simulationParams[3] = this.emitter.gravity.z;
        this.simulationParams[4] = this.emitter.damping;
        
        device.queue.writeBuffer(this.paramsBuffer, 0, this.simulationParams);
        
        // Upload particle data
        const particleData = this.emitter.getParticleData();
        device.queue.writeBuffer(this.particleBuffer, 0, particleData);
        
        // Create bind group
        const bindGroupLayout = this.pipeline.getBindGroupLayout(0);
        const bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.paramsBuffer } },
                { binding: 1, resource: { buffer: this.particleBuffer } }
            ]
        });
        
        this.bindGroups[0] = bindGroup;
        
        // Dispatch compute
        const workgroups = ComputeShader.calculateWorkgroups(this.maxParticles, 64);
        this.dispatch(encoder, workgroups);
    }
    
    /**
     * Get particle buffer for rendering
     * @returns {GPUBuffer}
     */
    getParticleBuffer() {
        return this.particleBuffer;
    }
    
    /**
     * Dispose resources
     */
    dispose() {
        super.dispose();
        
        if (this.particleBuffer) {
            this.particleBuffer.destroy();
            this.particleBuffer = null;
        }
        
        if (this.paramsBuffer) {
            this.paramsBuffer.destroy();
            this.paramsBuffer = null;
        }
    }
}
