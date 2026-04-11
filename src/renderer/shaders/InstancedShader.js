/**
 * InstancedShader - Shader support for GPU instancing
 * Renders multiple instances of the same geometry with per-instance transforms
 * Compatible with BasicMaterial and PBRMaterial
 */

export const InstancedShaderWGSL = {
    vertex: `
        struct Uniforms {
            viewProjectionMatrix: mat4x4<f32>,
            viewMatrix: mat4x4<f32>,
            projectionMatrix: mat4x4<f32>,
            cameraPosition: vec3<f32>,
        };
        
        struct Material {
            color: vec4<f32>,
            metallic: f32,
            roughness: f32,
        };
        
        @group(0) @binding(0) var<uniform> uniforms: Uniforms;
        @group(1) @binding(0) var<uniform> material: Material;
        
        // Instance data (per-instance transforms)
        struct InstanceData {
            modelMatrix: mat4x4<f32>,
        };
        
        @group(2) @binding(0) var<storage, read> instances: array<InstanceData>;
        
        struct VertexInput {
            @location(0) position: vec3<f32>,
            @location(1) normal: vec3<f32>,
            @location(2) uv: vec2<f32>,
            @builtin(instance_index) instanceIndex: u32,
        };
        
        struct VertexOutput {
            @builtin(position) position: vec4<f32>,
            @location(0) worldPosition: vec3<f32>,
            @location(1) normal: vec3<f32>,
            @location(2) uv: vec2<f32>,
            @location(3) instanceColor: vec3<f32>,
        };
        
        @vertex
        fn main(input: VertexInput) -> VertexOutput {
            var output: VertexOutput;
            
            // Get instance transform
            let modelMatrix = instances[input.instanceIndex].modelMatrix;
            
            // Transform position
            let worldPos = modelMatrix * vec4<f32>(input.position, 1.0);
            output.worldPosition = worldPos.xyz;
            output.position = uniforms.viewProjectionMatrix * worldPos;
            
            // Transform normal
            let normalMatrix = mat3x3<f32>(
                modelMatrix[0].xyz,
                modelMatrix[1].xyz,
                modelMatrix[2].xyz
            );
            output.normal = normalize(normalMatrix * input.normal);
            
            // Pass through UV
            output.uv = input.uv;
            
            // Default instance color (white)
            output.instanceColor = vec3<f32>(1.0, 1.0, 1.0);
            
            return output;
        }
    `,
    
    fragment: `
        struct Material {
            color: vec4<f32>,
            metallic: f32,
            roughness: f32,
        };
        
        struct Light {
            direction: vec3<f32>,
            color: vec3<f32>,
            intensity: f32,
        };
        
        @group(1) @binding(0) var<uniform> material: Material;
        @group(3) @binding(0) var<uniform> light: Light;
        
        struct FragmentInput {
            @location(0) worldPosition: vec3<f32>,
            @location(1) normal: vec3<f32>,
            @location(2) uv: vec2<f32>,
            @location(3) instanceColor: vec3<f32>,
        };
        
        @fragment
        fn main(input: FragmentInput) -> @location(0) vec4<f32> {
            let N = normalize(input.normal);
            let L = normalize(-light.direction);
            
            // Simple Lambert diffuse
            let NdotL = max(dot(N, L), 0.0);
            let diffuse = light.color * light.intensity * NdotL;
            
            // Ambient
            let ambient = vec3<f32>(0.1, 0.1, 0.1);
            
            // Combine with material color and instance color
            let baseColor = material.color.rgb * input.instanceColor;
            let finalColor = baseColor * (ambient + diffuse);
            
            return vec4<f32>(finalColor, material.color.a);
        }
    `
};

export const InstancedShaderGLSL = {
    vertex: `#version 300 es
        precision highp float;
        
        // Uniforms
        uniform mat4 u_viewProjectionMatrix;
        uniform mat4 u_viewMatrix;
        uniform mat4 u_projectionMatrix;
        
        // Per-instance data (using instanced arrays)
        // Note: This requires setting up instanced vertex attributes
        layout(location = 0) in vec3 a_position;
        layout(location = 1) in vec3 a_normal;
        layout(location = 2) in vec2 a_uv;
        
        // Instance matrix (4 vec4s for mat4)
        layout(location = 3) in vec4 a_instanceMatrix0;
        layout(location = 4) in vec4 a_instanceMatrix1;
        layout(location = 5) in vec4 a_instanceMatrix2;
        layout(location = 6) in vec4 a_instanceMatrix3;
        
        // Outputs
        out vec3 v_worldPosition;
        out vec3 v_normal;
        out vec2 v_uv;
        out vec3 v_instanceColor;
        
        void main() {
            // Reconstruct instance model matrix
            mat4 instanceMatrix = mat4(
                a_instanceMatrix0,
                a_instanceMatrix1,
                a_instanceMatrix2,
                a_instanceMatrix3
            );
            
            // Transform position
            vec4 worldPos = instanceMatrix * vec4(a_position, 1.0);
            v_worldPosition = worldPos.xyz;
            gl_Position = u_viewProjectionMatrix * worldPos;
            
            // Transform normal
            mat3 normalMatrix = mat3(instanceMatrix);
            v_normal = normalize(normalMatrix * a_normal);
            
            // Pass through UV
            v_uv = a_uv;
            
            // Default instance color
            v_instanceColor = vec3(1.0, 1.0, 1.0);
        }
    `,
    
    fragment: `#version 300 es
        precision highp float;
        
        // Material uniforms
        uniform vec4 u_color;
        uniform float u_metallic;
        uniform float u_roughness;
        
        // Light uniforms
        uniform vec3 u_lightDirection;
        uniform vec3 u_lightColor;
        uniform float u_lightIntensity;
        
        // Inputs
        in vec3 v_worldPosition;
        in vec3 v_normal;
        in vec2 v_uv;
        in vec3 v_instanceColor;
        
        // Output
        layout(location = 0) out vec4 fragColor;
        layout(location = 1) out vec4 outNormalSSR;
        layout(location = 2) out vec4 outMaterialSSR;
        
        void main() {
            vec3 N = normalize(v_normal);
            vec3 L = normalize(-u_lightDirection);
            
            // Simple Lambert diffuse
            float NdotL = max(dot(N, L), 0.0);
            vec3 diffuse = u_lightColor * u_lightIntensity * NdotL;
            
            // Ambient
            vec3 ambient = vec3(0.1, 0.1, 0.1);
            
            // Combine with material color and instance color
            vec3 baseColor = u_color.rgb * v_instanceColor;
            vec3 finalColor = baseColor * (ambient + diffuse);
            
            fragColor = vec4(finalColor, u_color.a);

            // SSR: instanced objects are non-reflective
            outNormalSSR  = vec4(normalize(v_normal) * 0.5 + 0.5, 1.0);
            outMaterialSSR = vec4(0.0, 1.0, 0.0, 1.0);
        }
    `
};

/**
 * Instancing shader generator
 * Generates shader code with instancing support enabled
 */
export class InstancedShader {
    constructor() {
        this.name = 'InstancedShader';
        this.wgsl = InstancedShaderWGSL;
        this.glsl = InstancedShaderGLSL;
    }
    
    /**
     * Check if a mesh should use instanced rendering
     * @param {Object} mesh - Mesh object
     * @returns {boolean}
     */
    static isInstancedMesh(mesh) {
        return mesh && mesh.isInstancedMesh === true;
    }
    
    /**
     * Get instance count from mesh
     * @param {Object} mesh - InstancedMesh object
     * @returns {number}
     */
    static getInstanceCount(mesh) {
        return mesh.isInstancedMesh ? mesh.count : 1;
    }
}
