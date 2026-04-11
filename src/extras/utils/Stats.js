/**
 * Stats - Performance monitoring utility
 * Tracks FPS, frame time, triangle count, and other metrics
 */
export class Stats {
  constructor() {
    // Configuration
    this.updateInterval = 500; // Update display every 500ms
    
    // Metrics
    this.fps = 0;
    this.frameTime = 0;
    this.triangleCount = 0;
    this.pixelsDrawn = 0;
    
    // Internal tracking
    this._frameCount = 0;
    this._lastUpdateTime = performance.now();
    this._lastFrameTime = performance.now();
    this._frameTimeSamples = [];
    this._maxSamples = 60;
    
    // DOM elements
    this._container = null;
    this._initialized = false;
  }
  
  /**
   * Initialize the stats display
   */
  init(parentElement = document.body) {
    if (this._initialized) return;
    
    // Create container
    this._container = document.createElement('div');
    this._container.id = 'forge-stats';
    this._container.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: #0f0;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      padding: 10px;
      border-radius: 4px;
      z-index: 10000;
      min-width: 200px;
      line-height: 1.5;
    `;
    
    parentElement.appendChild(this._container);
    this._initialized = true;
    this.update();
  }
  
  /**
   * Begin frame timing
   */
  begin() {
    this._lastFrameTime = performance.now();
  }
  
  /**
   * End frame timing and update stats
   */
  end() {
    const now = performance.now();
    const frameTime = now - this._lastFrameTime;
    
    // Track frame time
    this._frameTimeSamples.push(frameTime);
    if (this._frameTimeSamples.length > this._maxSamples) {
      this._frameTimeSamples.shift();
    }
    
    this._frameCount++;
    
    // Update FPS calculation periodically
    const elapsed = now - this._lastUpdateTime;
    if (elapsed >= this.updateInterval) {
      // Calculate FPS
      this.fps = Math.round((this._frameCount / elapsed) * 1000);
      
      // Calculate average frame time
      const sum = this._frameTimeSamples.reduce((a, b) => a + b, 0);
      this.frameTime = Math.round((sum / this._frameTimeSamples.length) * 100) / 100;
      
      // Reset counters
      this._frameCount = 0;
      this._lastUpdateTime = now;
      
      // Update display
      if (this._initialized) {
        this.update();
      }
    }
  }
  
  /**
   * Set triangle count for current frame
   */
  setTriangleCount(count) {
    this.triangleCount = count;
  }
  
  /**
   * Set pixels drawn for current frame
   */
  setPixelsDrawn(count) {
    this.pixelsDrawn = count;
  }
  
  /**
   * Update the stats display
   */
  update() {
    if (!this._container) return;
    
    const html = `
      <div style="color: #0f0; font-weight: bold; margin-bottom: 5px;">⚡ BangBang3d Stats</div>
      <div><span style="color: #888;">FPS:</span> ${this.fps}</div>
      <div><span style="color: #888;">Frame:</span> ${this.frameTime}ms</div>
      <div><span style="color: #888;">Triangles:</span> ${this.triangleCount.toLocaleString()}</div>
      <div><span style="color: #888;">Pixels:</span> ${this.pixelsDrawn.toLocaleString()}</div>
      <div style="margin-top: 5px; color: #666; font-size: 10px;">CPU-based rendering</div>
    `;
    
    this._container.innerHTML = html;
  }
  
  /**
   * Show the stats display
   */
  show() {
    if (this._container) {
      this._container.style.display = 'block';
    }
  }
  
  /**
   * Hide the stats display
   */
  hide() {
    if (this._container) {
      this._container.style.display = 'none';
    }
  }
  
  /**
   * Remove the stats display
   */
  dispose() {
    if (this._container && this._container.parentElement) {
      this._container.parentElement.removeChild(this._container);
      this._container = null;
      this._initialized = false;
    }
  }
  
  /**
   * Get formatted stats object
   */
  getStats() {
    return {
      fps: this.fps,
      frameTime: this.frameTime,
      triangleCount: this.triangleCount,
      pixelsDrawn: this.pixelsDrawn
    };
  }
}
