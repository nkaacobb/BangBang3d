/**
 * Instrumentation.js
 * 
 * Performance tracking and debugging instrumentation for the renderer.
 * Tracks frame timing, draw calls, triangle counts, and pass performance.
 * 
 * Phase 3: Debug Instrumentation
 */

export default class Instrumentation {
    constructor() {
        // Frame statistics
        this.frameCount = 0;
        this.fps = 0;
        this.frameTime = 0;
        this.deltaTime = 0;
        
        // Render statistics (per frame)
        this.stats = {
            drawCalls: 0,
            triangles: 0,
            vertices: 0,
            textures: 0,
            shaderSwitches: 0,
            bufferUploads: 0
        };
        
        // Pass timing (map of pass name to timing data)
        this.passTiming = new Map();
        
        // GPU memory tracking (estimates)
        this.memory = {
            geometries: 0,
            textures: 0,
            renderTargets: 0,
            total: 0
        };
        
        // Frame timing history (for FPS calculation)
        this._lastFrameTime = performance.now();
        this._frameTimes = [];
        this._maxFrameHistory = 60;
        
        // Overdraw visualization state
        this.overdrawMode = false;
        
        // Debug overlays
        this.overlayEnabled = false;
        this.overlayElement = null;
    }
    
    /**
     * Begin frame timing
     */
    beginFrame() {
        const now = performance.now();
        this.deltaTime = now - this._lastFrameTime;
        this._lastFrameTime = now;
        
        // Update frame history
        this._frameTimes.push(this.deltaTime);
        if (this._frameTimes.length > this._maxFrameHistory) {
            this._frameTimes.shift();
        }
        
        // Calculate FPS (average over last N frames)
        const avgFrameTime = this._frameTimes.reduce((a, b) => a + b, 0) / this._frameTimes.length;
        this.fps = avgFrameTime > 0 ? 1000 / avgFrameTime : 0;
        
        // Reset per-frame stats
        this.stats.drawCalls = 0;
        this.stats.triangles = 0;
        this.stats.vertices = 0;
        this.stats.shaderSwitches = 0;
        this.stats.bufferUploads = 0;
    }
    
    /**
     * End frame timing
     */
    endFrame() {
        this.frameCount++;
        this.frameTime = performance.now() - this._lastFrameTime;
        
        // Update overlay if enabled
        if (this.overlayEnabled && this.overlayElement) {
            this._updateOverlay();
        }
    }
    
    /**
     * Begin pass timing
     */
    beginPass(passName) {
        if (!this.passTiming.has(passName)) {
            this.passTiming.set(passName, {
                name: passName,
                time: 0,
                count: 0,
                avgTime: 0
            });
        }
        
        const timing = this.passTiming.get(passName);
        timing._startTime = performance.now();
    }
    
    /**
     * End pass timing
     */
    endPass(passName) {
        const timing = this.passTiming.get(passName);
        if (!timing || timing._startTime === undefined) return;
        
        const elapsed = performance.now() - timing._startTime;
        timing.time = elapsed;
        timing.count++;
        timing.avgTime = timing.avgTime * 0.95 + elapsed * 0.05; // Exponential moving average
        
        delete timing._startTime;
    }
    
    /**
     * Record draw call
     */
    recordDrawCall(triangleCount = 0, vertexCount = 0) {
        this.stats.drawCalls++;
        this.stats.triangles += triangleCount;
        this.stats.vertices += vertexCount;
    }
    
    /**
     * Record shader switch
     */
    recordShaderSwitch() {
        this.stats.shaderSwitches++;
    }
    
    /**
     * Record buffer upload
     */
    recordBufferUpload() {
        this.stats.bufferUploads++;
    }
    
    /**
     * Update memory estimate
     */
    updateMemory(geometries, textures, renderTargets) {
        this.memory.geometries = geometries;
        this.memory.textures = textures;
        this.memory.renderTargets = renderTargets;
        this.memory.total = geometries + textures + renderTargets;
    }
    
    /**
     * Enable/disable overdraw visualization
     */
    setOverdrawMode(enabled) {
        this.overdrawMode = enabled;
    }
    
    /**
     * Enable debug overlay
     */
    enableOverlay(container = document.body) {
        if (this.overlayElement) return;
        
        this.overlayElement = document.createElement('div');
        this.overlayElement.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: #0f0;
            font-family: monospace;
            font-size: 12px;
            padding: 10px;
            border-radius: 4px;
            z-index: 9999;
            pointer-events: none;
            min-width: 200px;
        `;
        
        container.appendChild(this.overlayElement);
        this.overlayEnabled = true;
    }
    
    /**
     * Disable debug overlay
     */
    disableOverlay() {
        if (this.overlayElement && this.overlayElement.parentNode) {
            this.overlayElement.parentNode.removeChild(this.overlayElement);
        }
        this.overlayElement = null;
        this.overlayEnabled = false;
    }
    
    /**
     * Update overlay display
     */
    _updateOverlay() {
        if (!this.overlayElement) return;
        
        const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);
        
        let html = `
            <div style="color: #fff; font-weight: bold; margin-bottom: 5px;">BangBang3D Stats</div>
            <div>FPS: <span style="color: ${this.fps < 30 ? '#f00' : this.fps < 50 ? '#ff0' : '#0f0'}">${this.fps.toFixed(1)}</span></div>
            <div>Frame: ${this.frameTime.toFixed(2)}ms</div>
            <div style="margin-top: 5px;">Draw Calls: ${this.stats.drawCalls}</div>
            <div>Triangles: ${this.stats.triangles.toLocaleString()}</div>
            <div>Vertices: ${this.stats.vertices.toLocaleString()}</div>
            <div style="margin-top: 5px;">Shader Switches: ${this.stats.shaderSwitches}</div>
            <div>Buffer Uploads: ${this.stats.bufferUploads}</div>
        `;
        
        if (this.memory.total > 0) {
            html += `
                <div style="margin-top: 5px;">Memory (est):</div>
                <div>  Geometries: ${mb(this.memory.geometries)} MB</div>
                <div>  Textures: ${mb(this.memory.textures)} MB</div>
                <div>  RenderTargets: ${mb(this.memory.renderTargets)} MB</div>
                <div>  Total: ${mb(this.memory.total)} MB</div>
            `;
        }
        
        if (this.passTiming.size > 0) {
            html += `<div style="margin-top: 5px; color: #ff0;">Pass Timing:</div>`;
            for (const [name, timing] of this.passTiming) {
                html += `<div>  ${name}: ${timing.avgTime.toFixed(2)}ms</div>`;
            }
        }
        
        this.overlayElement.innerHTML = html;
    }
    
    /**
     * Get current statistics as an object
     */
    getStats() {
        return {
            frameCount: this.frameCount,
            fps: this.fps,
            frameTime: this.frameTime,
            deltaTime: this.deltaTime,
            drawCalls: this.stats.drawCalls,
            triangles: this.stats.triangles,
            vertices: this.stats.vertices,
            shaderSwitches: this.stats.shaderSwitches,
            bufferUploads: this.stats.bufferUploads,
            memory: { ...this.memory },
            passTiming: Array.from(this.passTiming.values())
        };
    }
    
    /**
     * Reset all statistics
     */
    reset() {
        this.frameCount = 0;
        this.fps = 0;
        this.frameTime = 0;
        this.deltaTime = 0;
        this.stats.drawCalls = 0;
        this.stats.triangles = 0;
        this.stats.vertices = 0;
        this.stats.shaderSwitches = 0;
        this.stats.bufferUploads = 0;
        this.passTiming.clear();
        this._frameTimes = [];
    }
}
