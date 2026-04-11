/**
 * CameraHelper.js
 *
 * Wireframe frustum visualiser for a Camera.
 * Renders a line-based pyramid/box showing the camera's field of view,
 * near plane, and far plane.  Updated each frame to follow the camera's
 * world transform.
 *
 * Usage:
 *   const helper = new CameraHelper(camera);
 *   scene.add(helper);
 *   // in animate loop:
 *   helper.update();
 *
 * Phase 3: Multi-Camera – Frustum Visualizer
 */

import { Object3D } from '../../core/Object3D.js';
import { Vector3 } from '../../math/Vector3.js';
import { Matrix4 } from '../../math/Matrix4.js';
import { Color } from '../../math/Color.js';
import { BufferGeometry } from '../../geometry/BufferGeometry.js';
import { BufferAttribute } from '../../geometry/BufferAttribute.js';
import { Mesh } from '../../core/Mesh.js';
import { BasicMaterial } from '../../materials/BasicMaterial.js';

export class CameraHelper extends Object3D {
    /**
     * @param {import('../../core/Camera.js').Camera} camera  The camera to visualise
     * @param {Object} [opts]
     * @param {number} [opts.color=0xffaa00]  Line colour (hex)
     * @param {number} [opts.farScale=1]      Scale factor for far-plane distance
     *                                        (useful for large far values)
     */
    constructor(camera, opts = {}) {
        super();

        this.type = 'CameraHelper';
        this.isCameraHelper = true;
        this.camera = camera;
        this.color = new Color(0, 0, 0);
        this.color.setHex(opts.color !== undefined ? opts.color : 0xffaa00);

        // Maximum far distance to visualise (capped for visual clarity)
        this._maxFarDist = 50;

        // Build initial line geometry
        this._linesMesh = null;
        this._buildGeometry();
    }

    /**
     * Rebuild geometry to match camera's current projection.
     */
    _buildGeometry() {
        // Dispose old mesh
        if (this._linesMesh) {
            this._linesMesh.geometry.dispose();
            this._linesMesh.material.dispose();
            this.remove(this._linesMesh);
        }

        const cam = this.camera;
        if (!cam) return;

        let nearCorners, farCorners;

        if (cam.isPerspectiveCamera) {
            const near = cam.near;
            const far = Math.min(cam.far, this._maxFarDist);
            const fovRad = (cam.fov * Math.PI) / 180;
            const aspect = cam.aspect;

            const nearH = 2 * Math.tan(fovRad / 2) * near;
            const nearW = nearH * aspect;

            const farH = 2 * Math.tan(fovRad / 2) * far;
            const farW = farH * aspect;

            // Near plane corners (camera-local, looking down -Z)
            nearCorners = [
                new Vector3(-nearW / 2,  nearH / 2, -near), // top-left
                new Vector3( nearW / 2,  nearH / 2, -near), // top-right
                new Vector3( nearW / 2, -nearH / 2, -near), // bottom-right
                new Vector3(-nearW / 2, -nearH / 2, -near), // bottom-left
            ];
            farCorners = [
                new Vector3(-farW / 2,  farH / 2, -far),
                new Vector3( farW / 2,  farH / 2, -far),
                new Vector3( farW / 2, -farH / 2, -far),
                new Vector3(-farW / 2, -farH / 2, -far),
            ];
        } else if (cam.isOrthographicCamera) {
            const near = cam.near;
            const far = Math.min(cam.far, this._maxFarDist);
            const zoom = cam.zoom || 1;
            const left   = cam.left   / zoom;
            const right  = cam.right  / zoom;
            const top    = cam.top    / zoom;
            const bottom = cam.bottom / zoom;

            nearCorners = [
                new Vector3(left  , top   , -near),
                new Vector3(right , top   , -near),
                new Vector3(right , bottom, -near),
                new Vector3(left  , bottom, -near),
            ];
            farCorners = [
                new Vector3(left  , top   , -far),
                new Vector3(right , top   , -far),
                new Vector3(right , bottom, -far),
                new Vector3(left  , bottom, -far),
            ];
        } else {
            // Unknown camera type – draw a simple marker
            nearCorners = [
                new Vector3(-0.2,  0.2, -0.2),
                new Vector3( 0.2,  0.2, -0.2),
                new Vector3( 0.2, -0.2, -0.2),
                new Vector3(-0.2, -0.2, -0.2),
            ];
            farCorners = [
                new Vector3(-1,  1, -3),
                new Vector3( 1,  1, -3),
                new Vector3( 1, -1, -3),
                new Vector3(-1, -1, -3),
            ];
        }

        // Build line segments as degenerate triangles
        // Each line is two vertices; we use a flat position buffer and
        // render with gl.LINES via a simple mesh with wireframe material.
        const positions = [];
        const addLine = (a, b) => {
            positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        };

        // Near plane rectangle
        for (let i = 0; i < 4; i++) {
            addLine(nearCorners[i], nearCorners[(i + 1) % 4]);
        }
        // Far plane rectangle
        for (let i = 0; i < 4; i++) {
            addLine(farCorners[i], farCorners[(i + 1) % 4]);
        }
        // Connecting edges (near → far)
        for (let i = 0; i < 4; i++) {
            addLine(nearCorners[i], farCorners[i]);
        }
        // Cross on near plane (visual aid)
        addLine(nearCorners[0], nearCorners[2]);
        addLine(nearCorners[1], nearCorners[3]);

        // "Up" indicator triangle on near plane
        const upMid = new Vector3(
            (nearCorners[0].x + nearCorners[1].x) / 2,
            (nearCorners[0].y + nearCorners[1].y) / 2 + (nearCorners[0].y - nearCorners[3].y) * 0.15,
            (nearCorners[0].z + nearCorners[1].z) / 2
        );
        addLine(nearCorners[0], upMid);
        addLine(nearCorners[1], upMid);

        const posArray = new Float32Array(positions);
        const vertexCount = posArray.length / 3;

        // Create geometry with position attribute only
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new BufferAttribute(posArray, 3));

        // Generate trivial normals and UVs to satisfy the shader
        const normals = new Float32Array(vertexCount * 3);
        const uvs = new Float32Array(vertexCount * 2);
        geometry.setAttribute('normal', new BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new BufferAttribute(uvs, 2));

        // Indices: wireframe pairs
        const indices = [];
        for (let i = 0; i < vertexCount; i += 2) {
            // We'll rely on the engine rendering this as lines via a thin triangle strip hack:
            // Each line segment AB → triangle ABB (degenerate)
            if (i + 1 < vertexCount) {
                indices.push(i, i + 1, i + 1);
            }
        }
        geometry.setIndex(indices);

        const material = new BasicMaterial({
            color: this.color.clone(),
            wireframe: true,
            transparent: true,
            opacity: 0.85
        });

        this._linesMesh = new Mesh(geometry, material);
        this._linesMesh.frustumCulled = false;
        this.add(this._linesMesh);
    }

    /**
     * Update the helper's world transform to match the camera.
     * Call once per frame (e.g. in your animate loop).
     */
    update() {
        if (!this.camera) return;

        // Copy camera's world matrix to this helper
        this.camera.updateMatrixWorld(true);
        // Set helper's world matrix to match camera
        this.position.setFromMatrixPosition(this.camera.matrixWorld);
        // Extract rotation from camera world matrix
        const m = this.camera.matrixWorld.elements;
        // Copy the full matrix and override position
        this.matrixWorld.copy(this.camera.matrixWorld);
        this.matrixAutoUpdate = false;

        // Rebuild geometry if projection changed (fov, near, far, etc.)
        // For simplicity, just rebuild every time (cheap with small vertex count)
        this._buildGeometry();
    }

    /**
     * Dispose of helper resources.
     */
    dispose() {
        if (this._linesMesh) {
            this._linesMesh.geometry.dispose();
            this._linesMesh.material.dispose();
        }
    }
}
