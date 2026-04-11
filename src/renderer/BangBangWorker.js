/**
 * BangBangWorker - Web Worker backend for BangBang3d rendering
 * Offloads rendering to a separate thread to keep the main thread responsive
 */

// Import the entire BangBang3d engine (in worker context)
importScripts('../index.js');

let renderer = null;
let scene = null;
let camera = null;
let canvas = null;
let animationId = null;

/**
 * Handle messages from main thread
 */
self.onmessage = function(e) {
  const { type, data } = e.data;
  
  switch (type) {
    case 'init':
      initRenderer(data);
      break;
      
    case 'setScene':
      setScene(data);
      break;
      
    case 'setCamera':
      setCamera(data);
      break;
      
    case 'render':
      renderFrame(data);
      break;
      
    case 'startAnimation':
      startAnimationLoop(data);
      break;
      
    case 'stopAnimation':
      stopAnimationLoop();
      break;
      
    case 'resize':
      resizeRenderer(data);
      break;
      
    case 'dispose':
      dispose();
      break;
      
    default:
      console.warn(`[BangBangWorker] Unknown message type: ${type}`);
  }
};

/**
 * Initialize renderer with OffscreenCanvas
 */
function initRenderer(data) {
  const { canvas: offscreenCanvas, width, height, pixelRatio } = data;
  
  canvas = offscreenCanvas;
  
  // Note: In a real implementation, we would need to pass the serialized
  // scene data and reconstruct it in the worker. For now, this is a template.
  
  self.postMessage({
    type: 'initialized',
    data: { success: true }
  });
}

/**
 * Set scene data (serialized)
 */
function setScene(data) {
  // Deserialize scene from data
  // This would require custom serialization/deserialization
  scene = data;
  
  self.postMessage({
    type: 'sceneSet',
    data: { success: true }
  });
}

/**
 * Set camera data (serialized)
 */
function setCamera(data) {
  // Deserialize camera from data
  camera = data;
  
  self.postMessage({
    type: 'cameraSet',
    data: { success: true }
  });
}

/**
 * Render a single frame
 */
function renderFrame(data) {
  if (!renderer || !scene || !camera) {
    self.postMessage({
      type: 'renderError',
      data: { error: 'Renderer, scene, or camera not initialized' }
    });
    return;
  }
  
  const startTime = performance.now();
  
  // Update scene if delta provided
  if (data && data.delta) {
    // Update animations, etc.
  }
  
  // Render
  renderer.render(scene, camera);
  
  const renderTime = performance.now() - startTime;
  
  // Send frame complete message
  self.postMessage({
    type: 'frameComplete',
    data: {
      renderTime,
      triangleCount: renderer.triangleCount || 0
    }
  });
}

/**
 * Start animation loop in worker
 */
function startAnimationLoop(data) {
  if (animationId !== null) {
    stopAnimationLoop();
  }
  
  let lastTime = performance.now();
  
  function animate() {
    const now = performance.now();
    const delta = (now - lastTime) / 1000;
    lastTime = now;
    
    renderFrame({ delta });
    
    animationId = requestAnimationFrame(animate);
  }
  
  animationId = requestAnimationFrame(animate);
  
  self.postMessage({
    type: 'animationStarted',
    data: { success: true }
  });
}

/**
 * Stop animation loop
 */
function stopAnimationLoop() {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
    
    self.postMessage({
      type: 'animationStopped',
      data: { success: true }
    });
  }
}

/**
 * Resize renderer
 */
function resizeRenderer(data) {
  const { width, height } = data;
  
  if (renderer) {
    renderer.setSize(width, height);
    
    self.postMessage({
      type: 'resized',
      data: { success: true, width, height }
    });
  }
}

/**
 * Clean up resources
 */
function dispose() {
  stopAnimationLoop();
  
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  
  scene = null;
  camera = null;
  canvas = null;
  
  self.postMessage({
    type: 'disposed',
    data: { success: true }
  });
}

// Log that worker is ready
console.log('[BangBangWorker] Worker initialized and ready');
