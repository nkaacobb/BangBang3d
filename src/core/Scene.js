import { Object3D } from './Object3D.js';
import { Color } from '../math/Color.js';

/**
 * Scene - Root container for all renderable objects.
 * 
 * Supports scene-wide environment mapping for IBL reflections:
 * - `environment` (CubeTexture): Scene-wide environment cubemap used by all
 *   reflective materials (PBRMaterial) unless they override with per-material envMap.
 * - `backgroundTexture` (CubeTexture|null): Optional cubemap rendered as skybox.
 *   If null, `background` Color is used for clearing.
 * 
 * Phase 5: Reflections Architecture
 */
export class Scene extends Object3D {
  constructor() {
    super();

    this.type = 'Scene';
    this.isScene = true;

    /** Background color (used when backgroundTexture is null) */
    this.background = new Color(0, 0, 0);

    /**
     * Scene-wide environment cubemap for IBL reflections.
     * All PBRMaterials without a per-material envMap will use this.
     * @type {CubeTexture|null}
     */
    this.environment = null;

    /**
     * Optional cubemap rendered as skybox background.
     * If null, the background Color is used.
     * @type {CubeTexture|null}
     */
    this.backgroundTexture = null;

    /**
     * Global environment intensity multiplier.
     * Applied on top of per-material envMapIntensity.
     * @type {number}
     */
    this.environmentIntensity = 1.0;

    /**
     * Registered reflection probes.  The renderer selects the closest
     * probe with non-zero influence for each PBR mesh.
     * @type {ReflectionProbe[]}
     */
    this.reflectionProbes = [];

    /**
     * Registered cameras.
     * Use addCamera() / removeCamera() to manage the list.
     * The first camera in the array is considered the "active" camera
     * unless overridden by scene.activeCamera.
     * @type {import('./Camera.js').Camera[]}
     */
    this.cameras = [];

    /**
     * The currently active camera (used for single-camera rendering).
     * If null, scene.cameras[0] or the camera passed to render() is used.
     * @type {import('./Camera.js').Camera|null}
     */
    this.activeCamera = null;

    /** Fog (TODO: implement in renderer) */
    this.fog = null;

    /** Automatic update of matrices */
    this.autoUpdate = true;
  }

  /**
   * Register a ReflectionProbe so the renderer can use it.
   * The probe must also be added to the scene graph via `scene.add(probe)`.
   * @param {ReflectionProbe} probe
   */
  addReflectionProbe(probe) {
    if (!probe || !probe.isReflectionProbe) {
      console.warn('[Scene] addReflectionProbe() requires a ReflectionProbe instance');
      return;
    }
    if (!this.reflectionProbes.includes(probe)) {
      this.reflectionProbes.push(probe);
    }
  }

  /**
   * Unregister a ReflectionProbe.
   * @param {ReflectionProbe} probe
   */
  removeReflectionProbe(probe) {
    const idx = this.reflectionProbes.indexOf(probe);
    if (idx !== -1) this.reflectionProbes.splice(idx, 1);
  }

  // ─── Camera Registry ────────────────────────────────────────────────

  /**
   * Register a Camera.
   * Also adds it to the scene graph if not already a child.
   * @param {import('./Camera.js').Camera} camera
   */
  addCamera(camera) {
    if (!camera || !camera.isCamera) {
      console.warn('[Scene] addCamera() requires a Camera instance');
      return;
    }
    if (!this.cameras.includes(camera)) {
      this.cameras.push(camera);
    }
    // Ensure camera is part of the scene graph
    if (!camera.parent) {
      this.add(camera);
    }
    // First camera becomes active by default
    if (!this.activeCamera) {
      this.activeCamera = camera;
    }
  }

  /**
   * Unregister a Camera.
   * @param {import('./Camera.js').Camera} camera
   */
  removeCamera(camera) {
    const idx = this.cameras.indexOf(camera);
    if (idx !== -1) this.cameras.splice(idx, 1);
    if (this.activeCamera === camera) {
      this.activeCamera = this.cameras.length > 0 ? this.cameras[0] : null;
    }
  }

  /**
   * Set the active camera for single-view rendering.
   * @param {import('./Camera.js').Camera} camera
   */
  setActiveCamera(camera) {
    if (camera && camera.isCamera) {
      this.activeCamera = camera;
      if (!this.cameras.includes(camera)) {
        this.addCamera(camera);
      }
    }
  }

  copy(source, recursive) {
    super.copy(source, recursive);

    if (source.background !== null) this.background.copy(source.background);
    this.environment = source.environment;
    this.backgroundTexture = source.backgroundTexture;
    this.environmentIntensity = source.environmentIntensity;
    this.reflectionProbes = [...source.reflectionProbes];
    this.cameras = [...source.cameras];
    this.activeCamera = source.activeCamera;
    if (source.fog !== null) this.fog = source.fog.clone();

    return this;
  }

  toJSON(meta) {
    const data = super.toJSON(meta);

    if (this.background !== null) data.object.background = this.background.getHex();
    if (this.environment !== null) data.object.environment = this.environment.toJSON();
    if (this.backgroundTexture !== null) data.object.backgroundTexture = this.backgroundTexture.toJSON();
    data.object.environmentIntensity = this.environmentIntensity;
    if (this.fog !== null) data.object.fog = this.fog.toJSON();

    return data;
  }
}
