import { Vector2 } from '../../math/Vector2.js';
import { Vector3 } from '../../math/Vector3.js';
import { Quaternion } from '../../math/Quaternion.js';
import { Euler } from '../../math/Euler.js';

/**
 * OrbitControls - CPU-side camera controls
 * Allows orbiting, panning, and zooming around a target point
 */
export class OrbitControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement || document;
    
    // Target point to orbit around
    this.target = new Vector3();
    
    // Orbit settings
    this.minDistance = 0.1;
    this.maxDistance = Infinity;
    this.minPolarAngle = 0; // radians
    this.maxPolarAngle = Math.PI; // radians
    this.minAzimuthAngle = -Infinity; // radians
    this.maxAzimuthAngle = Infinity; // radians
    
    // Movement speeds
    this.rotateSpeed = 1.0;
    this.panSpeed = 1.0;
    this.zoomSpeed = 1.0;
    
    // Enable/disable controls
    this.enabled = true;
    this.enableRotate = true;
    this.enablePan = true;
    this.enableZoom = true;
    this.enableDamping = false;
    this.dampingFactor = 0.05;
    
    // Internal state
    this._state = {
      NONE: -1,
      ROTATE: 0,
      PAN: 1,
      ZOOM: 2
    };
    this._currentState = this._state.NONE;
    
    // Spherical coordinates
    this._spherical = {
      radius: 0,
      theta: 0, // azimuth angle
      phi: 0    // polar angle
    };
    this._sphericalDelta = {
      radius: 0,
      theta: 0,
      phi: 0
    };
    
    // Mouse state
    this._mouseStart = new Vector2();
    this._mouseEnd = new Vector2();
    this._mouseDelta = new Vector2();
    
    // Pan offset
    this._panOffset = new Vector3();
    
    // Temporary vectors
    this._offset = new Vector3();
    this._quat = new Quaternion();
    this._quatInverse = new Quaternion();
    this._lastPosition = new Vector3();
    this._lastQuaternion = new Quaternion();
    
    // Bind event handlers
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);
    this._onMouseWheel = this._handleMouseWheel.bind(this);
    this._onContextMenu = this._handleContextMenu.bind(this);
    
    // Initialize
    this._initEventListeners();
    this._updateCameraPosition();
  }
  
  /**
   * Initialize event listeners
   */
  _initEventListeners() {
    this.domElement.addEventListener('mousedown', this._onMouseDown);
    this.domElement.addEventListener('wheel', this._onMouseWheel);
    this.domElement.addEventListener('contextmenu', this._onContextMenu);
  }
  
  /**
   * Remove event listeners
   */
  dispose() {
    this.domElement.removeEventListener('mousedown', this._onMouseDown);
    this.domElement.removeEventListener('mousemove', this._onMouseMove);
    this.domElement.removeEventListener('mouseup', this._onMouseUp);
    this.domElement.removeEventListener('wheel', this._onMouseWheel);
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);
  }
  
  /**
   * Update camera position based on spherical coordinates
   */
  _updateCameraPosition() {
    // Calculate offset from target
    this._offset.copy(this.camera.position).sub(this.target);
    
    // Convert to spherical coordinates
    const radius = this._offset.length() || 0.001;
    this._spherical.radius = radius;
    this._spherical.theta = Math.atan2(this._offset.x, this._offset.z);
    this._spherical.phi = Math.acos(Math.max(-1, Math.min(1, this._offset.y / radius)));
  }
  
  /**
   * Apply spherical deltas and update camera
   */
  _applyUpdate() {
    // Apply deltas
    this._spherical.theta += this._sphericalDelta.theta;
    this._spherical.phi += this._sphericalDelta.phi;
    this._spherical.radius += this._sphericalDelta.radius;
    
    // Clamp angles
    this._spherical.theta = Math.max(this.minAzimuthAngle, Math.min(this.maxAzimuthAngle, this._spherical.theta));
    this._spherical.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this._spherical.phi));
    this._spherical.phi = Math.max(0.000001, Math.min(Math.PI - 0.000001, this._spherical.phi));
    this._spherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this._spherical.radius));
    
    // Apply pan offset
    this.target.add(this._panOffset);
    
    // Convert spherical to cartesian
    const sinPhiRadius = Math.sin(this._spherical.phi) * this._spherical.radius;
    this._offset.x = sinPhiRadius * Math.sin(this._spherical.theta);
    this._offset.y = Math.cos(this._spherical.phi) * this._spherical.radius;
    this._offset.z = sinPhiRadius * Math.cos(this._spherical.theta);
    
    // Update camera position
    this.camera.position.copy(this.target).add(this._offset);
    this.camera.lookAt(this.target);
    
    // Apply damping
    if (this.enableDamping) {
      this._sphericalDelta.theta *= (1 - this.dampingFactor);
      this._sphericalDelta.phi *= (1 - this.dampingFactor);
      this._sphericalDelta.radius *= (1 - this.dampingFactor);
      this._panOffset.multiplyScalar(1 - this.dampingFactor);
    } else {
      this._sphericalDelta.theta = 0;
      this._sphericalDelta.phi = 0;
      this._sphericalDelta.radius = 0;
      this._panOffset.set(0, 0, 0);
    }
  }
  
  /**
   * Rotate camera
   */
  _rotateCamera(deltaX, deltaY) {
    const element = this.domElement === document ? document.body : this.domElement;
    this._sphericalDelta.theta -= 2 * Math.PI * deltaX / element.clientWidth * this.rotateSpeed;
    this._sphericalDelta.phi -= 2 * Math.PI * deltaY / element.clientHeight * this.rotateSpeed;
  }
  
  /**
   * Pan camera
   */
  _panCamera(deltaX, deltaY) {
    const element = this.domElement === document ? document.body : this.domElement;
    
    // Calculate pan offset in camera space
    const offset = new Vector3();
    const targetDistance = this.camera.position.distanceTo(this.target);
    
    // Pan left/right
    offset.copy(this.camera.position).sub(this.target).cross(this.camera.up).normalize();
    offset.multiplyScalar(-deltaX * targetDistance / element.clientHeight * this.panSpeed);
    this._panOffset.add(offset);
    
    // Pan up/down
    offset.copy(this.camera.up).normalize();
    offset.multiplyScalar(deltaY * targetDistance / element.clientHeight * this.panSpeed);
    this._panOffset.add(offset);
  }
  
  /**
   * Zoom camera
   */
  _zoomCamera(delta) {
    this._sphericalDelta.radius -= delta * this.zoomSpeed;
  }
  
  /**
   * Handle mouse down
   */
  _handleMouseDown(event) {
    if (!this.enabled) return;
    
    event.preventDefault();
    
    this._mouseStart.set(event.clientX, event.clientY);
    
    if (event.button === 0 && this.enableRotate) {
      // Left button - rotate
      this._currentState = this._state.ROTATE;
    } else if (event.button === 2 && this.enablePan) {
      // Right button - pan
      this._currentState = this._state.PAN;
    } else if (event.button === 1 && this.enableZoom) {
      // Middle button - zoom
      this._currentState = this._state.ZOOM;
    }
    
    if (this._currentState !== this._state.NONE) {
      document.addEventListener('mousemove', this._onMouseMove);
      document.addEventListener('mouseup', this._onMouseUp);
    }
  }
  
  /**
   * Handle mouse move
   */
  _handleMouseMove(event) {
    if (!this.enabled) return;
    
    event.preventDefault();
    
    this._mouseEnd.set(event.clientX, event.clientY);
    this._mouseDelta.subVectors(this._mouseEnd, this._mouseStart);
    
    if (this._currentState === this._state.ROTATE) {
      this._rotateCamera(this._mouseDelta.x, this._mouseDelta.y);
    } else if (this._currentState === this._state.PAN) {
      this._panCamera(this._mouseDelta.x, this._mouseDelta.y);
    } else if (this._currentState === this._state.ZOOM) {
      this._zoomCamera(this._mouseDelta.y);
    }
    
    this._mouseStart.copy(this._mouseEnd);
    this.update();
  }
  
  /**
   * Handle mouse up
   */
  _handleMouseUp(event) {
    if (!this.enabled) return;
    
    event.preventDefault();
    
    this._currentState = this._state.NONE;
    
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);
  }
  
  /**
   * Handle mouse wheel
   */
  _handleMouseWheel(event) {
    if (!this.enabled || !this.enableZoom) return;
    
    event.preventDefault();
    
    const delta = event.deltaY;
    this._zoomCamera(-delta * 0.001);
    this.update();
  }
  
  /**
   * Handle context menu (prevent right-click menu)
   */
  _handleContextMenu(event) {
    if (!this.enabled) return;
    event.preventDefault();
  }
  
  /**
   * Update controls (call this in your animation loop)
   */
  update() {
    this._applyUpdate();
    
    // Check if camera has moved
    const hasChanged = 
      this._lastPosition.distanceToSquared(this.camera.position) > 0.000001 ||
      8 * (1 - this._lastQuaternion.dot(this.camera.quaternion)) > 0.000001;
    
    if (hasChanged) {
      this._lastPosition.copy(this.camera.position);
      this._lastQuaternion.copy(this.camera.quaternion);
      return true;
    }
    
    return false;
  }
  
  /**
   * Reset controls to initial state
   */
  reset() {
    this.target.set(0, 0, 0);
    this._sphericalDelta.radius = 0;
    this._sphericalDelta.theta = 0;
    this._sphericalDelta.phi = 0;
    this._panOffset.set(0, 0, 0);
    this._updateCameraPosition();
    this.update();
  }
  
  /**
   * Save current state
   */
  saveState() {
    return {
      target: this.target.clone(),
      position: this.camera.position.clone()
    };
  }
  
  /**
   * Restore saved state
   */
  restoreState(state) {
    this.target.copy(state.target);
    this.camera.position.copy(state.position);
    this.camera.lookAt(this.target);
    this._updateCameraPosition();
    this.update();
  }
}
