/**
 * WorkerRenderer - Main thread wrapper for BangBangWorker
 * Manages communication with the Web Worker backend
 */
export class WorkerRenderer {
  constructor(options = {}) {
    this.canvas = options.canvas;
    this.width = options.width || 800;
    this.height = options.height || 600;
    this.pixelRatio = options.pixelRatio || 1;
    
    // Worker state
    this.worker = null;
    this.offscreenCanvas = null;
    this.isInitialized = false;
    this.isAnimating = false;
    
    // Callbacks
    this.onFrame = options.onFrame || null;
    this.onError = options.onError || null;
    
    // Stats
    this.stats = {
      renderTime: 0,
      triangleCount: 0,
      fps: 0
    };
    
    this._initWorker();
  }
  
  /**
   * Initialize Web Worker
   */
  _initWorker() {
    // Check for OffscreenCanvas support
    if (!this.canvas.transferControlToOffscreen) {
      const error = 'OffscreenCanvas is not supported in this browser';
      console.error(`[WorkerRenderer] ${error}`);
      if (this.onError) {
        this.onError(error);
      }
      return;
    }
    
    // Transfer canvas to OffscreenCanvas
    this.offscreenCanvas = this.canvas.transferControlToOffscreen();
    
    // Create worker
    this.worker = new Worker('../../src/renderer/BangBangWorker.js', { type: 'module' });
    
    // Set up message handler
    this.worker.onmessage = (e) => this._handleWorkerMessage(e);
    this.worker.onerror = (e) => this._handleWorkerError(e);
    
    // Initialize worker with canvas
    this.worker.postMessage({
      type: 'init',
      data: {
        canvas: this.offscreenCanvas,
        width: this.width,
        height: this.height,
        pixelRatio: this.pixelRatio
      }
    }, [this.offscreenCanvas]);
  }
  
  /**
   * Handle messages from worker
   */
  _handleWorkerMessage(e) {
    const { type, data } = e.data;
    
    switch (type) {
      case 'initialized':
        this.isInitialized = true;
        console.log('[WorkerRenderer] Worker initialized');
        break;
        
      case 'frameComplete':
        this.stats.renderTime = data.renderTime;
        this.stats.triangleCount = data.triangleCount;
        
        if (this.onFrame) {
          this.onFrame(this.stats);
        }
        break;
        
      case 'renderError':
        console.error('[WorkerRenderer] Render error:', data.error);
        if (this.onError) {
          this.onError(data.error);
        }
        break;
        
      case 'animationStarted':
        this.isAnimating = true;
        console.log('[WorkerRenderer] Animation started');
        break;
        
      case 'animationStopped':
        this.isAnimating = false;
        console.log('[WorkerRenderer] Animation stopped');
        break;
        
      case 'resized':
        console.log(`[WorkerRenderer] Resized to ${data.width}x${data.height}`);
        break;
        
      case 'disposed':
        console.log('[WorkerRenderer] Worker disposed');
        break;
        
      default:
        console.warn(`[WorkerRenderer] Unknown message type: ${type}`);
    }
  }
  
  /**
   * Handle worker errors
   */
  _handleWorkerError(e) {
    console.error('[WorkerRenderer] Worker error:', e.message);
    if (this.onError) {
      this.onError(e.message);
    }
  }
  
  /**
   * Set scene (serialize and send to worker)
   */
  setScene(scene) {
    if (!this.worker || !this.isInitialized) {
      console.warn('[WorkerRenderer] Worker not initialized');
      return;
    }
    
    // Serialize scene
    const serializedScene = this._serializeScene(scene);
    
    this.worker.postMessage({
      type: 'setScene',
      data: serializedScene
    });
  }
  
  /**
   * Set camera (serialize and send to worker)
   */
  setCamera(camera) {
    if (!this.worker || !this.isInitialized) {
      console.warn('[WorkerRenderer] Worker not initialized');
      return;
    }
    
    // Serialize camera
    const serializedCamera = this._serializeCamera(camera);
    
    this.worker.postMessage({
      type: 'setCamera',
      data: serializedCamera
    });
  }
  
  /**
   * Render a single frame
   */
  render(scene, camera) {
    if (!this.worker || !this.isInitialized) {
      console.warn('[WorkerRenderer] Worker not initialized');
      return;
    }
    
    // Send render command
    this.worker.postMessage({
      type: 'render',
      data: {}
    });
  }
  
  /**
   * Start animation loop in worker
   */
  startAnimation() {
    if (!this.worker || !this.isInitialized) {
      console.warn('[WorkerRenderer] Worker not initialized');
      return;
    }
    
    this.worker.postMessage({
      type: 'startAnimation',
      data: {}
    });
  }
  
  /**
   * Stop animation loop
   */
  stopAnimation() {
    if (!this.worker) {
      return;
    }
    
    this.worker.postMessage({
      type: 'stopAnimation',
      data: {}
    });
  }
  
  /**
   * Resize renderer
   */
  setSize(width, height) {
    this.width = width;
    this.height = height;
    
    if (!this.worker || !this.isInitialized) {
      return;
    }
    
    this.worker.postMessage({
      type: 'resize',
      data: { width, height }
    });
  }
  
  /**
   * Clean up resources
   */
  dispose() {
    if (this.worker) {
      this.worker.postMessage({
        type: 'dispose',
        data: {}
      });
      
      this.worker.terminate();
      this.worker = null;
    }
    
    this.offscreenCanvas = null;
    this.isInitialized = false;
    this.isAnimating = false;
  }
  
  /**
   * Serialize scene for transfer to worker
   * Note: This is a simplified version. Full implementation would need
   * to serialize all scene objects, geometries, materials, etc.
   */
  _serializeScene(scene) {
    return {
      // Simplified serialization
      type: 'Scene',
      children: scene.children.map(child => this._serializeObject(child))
    };
  }
  
  /**
   * Serialize object
   */
  _serializeObject(obj) {
    return {
      type: obj.type,
      position: obj.position.toArray(),
      rotation: obj.rotation.toArray(),
      scale: obj.scale.toArray(),
      // Add geometry and material data as needed
    };
  }
  
  /**
   * Serialize camera
   */
  _serializeCamera(camera) {
    return {
      type: camera.type,
      position: camera.position.toArray(),
      rotation: camera.rotation.toArray(),
      fov: camera.fov,
      aspect: camera.aspect,
      near: camera.near,
      far: camera.far
    };
  }
}
