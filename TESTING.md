# Testing Documentation

## Overview

BangBang3D includes a comprehensive smoke test and regression system that validates both CPU and GPU backend rendering against golden reference images.

**Important**: The smoke test suite is designed for **local development only**. Tests run in **headed mode** (visible browser window) because WebGPU and WebGL2 APIs are not reliable in headless Chromium. CI integration is not currently supported.

### What the Tests Validate

- **Backend Selection**: Correct CPU/GPU backend initialization and capability detection
- **Rendering Correctness**: Pixel-level comparison against golden references
- **Cross-Backend Consistency**: Validation that both backends produce expected output
- **Regression Prevention**: Automatic detection of rendering changes

## Test Infrastructure

### Components

1. **Playwright Test Runner** (`tests/smoke-test.js`)
   - Browser automation framework running in **headed mode** (visible window)
   - Runs 5 golden scenes across CPU and GPU backends
   - Validates backend selection and capabilities
   - Generates visual diffs on failures

2. **Test Server** (`tests/server.js`)
   - Static file server for test assets
   - Serves from repository root
   - Runs on port 8765
   - Auto-started by Playwright

3. **Image Comparison** (`tests/image-compare.js`)
   - PNG pixel comparison with tolerance
   - Generates visual diff images
   - Configurable thresholds per backend

4. **Golden References** (`tests/golden/`)
   - CPU references: `tests/golden/cpu/{scene}.png`
   - GPU references: `tests/golden/gpu/{webgpu|webgl2}/{scene}.png`
   - Separate reference sets for each GPU backend

## Test Scenes

The test suite includes 5 comprehensive scenes:

1. **basic_geometry**: Simple shapes (sphere, box, plane) with directional light
2. **multiple_lights**: Three point lights (RGB) illuminating a sphere
3. **pbr_materials**: Five spheres with varying roughness/metallic values
4. **transforms**: Spiral of boxes demonstrating scale, rotation, position
5. **stress_test**: Grid of 121 spheres (11x11) for performance validation

## Running Tests

### Prerequisites

Install dependencies and Playwright browsers:
```powershell
npm install
npx playwright install chromium
```

**Note**: A visible browser window will open during test execution. This is expected and required for GPU backend testing.

### Commands

**Run smoke tests:**
```powershell
npm run test:smoke
```

This will:
- Auto-start test server on port 8765 (via Playwright config)
- Launch Chromium in **headed mode** (visible browser window will open)
- Run backend selection tests
- Compare all scenes against golden references
- Generate failure artifacts in `tests/output/`
- Auto-stop test server when complete
- Display summary in terminal

**Why headed mode?** WebGPU and WebGL2 APIs do not work reliably in headless Chromium, so tests must run with a visible browser window.

**Regenerate golden references:**
```powershell
# Method 1: Using npm script
npm run test:smoke:regen

# Method 2: Set env var in PowerShell (more reliable on Windows)
$env:REGEN_GOLDEN='true'; npm run test:smoke
```

Use this when:
- Initial setup (no golden references exist)
- Intentional rendering changes
- Adding new test scenes

⚠️ **Warning**: This overwrites existing golden references. Review changes carefully before committing.

**Note**: On Windows, the direct PowerShell environment variable method (Method 2) is more reliable due to cross-env quirks.

**Run test server only:**
```powershell
npm run test:smoke:server
```

Useful for manual testing at `http://localhost:8765/tests/test-page.html`

## Comparison Tolerances

### CPU Backend
- **Tolerance**: 0 (pixel-perfect)
- **Threshold**: 0% (no pixels can differ)
- **Rationale**: CPU rendering is deterministic and should be exactly reproducible

### GPU Backend
- **Tolerance**: 3 (RGB per channel)
- **Threshold**: 2% (up to 2% of pixels can differ)
- **Rationale**: GPU drivers, hardware, and floating-point precision can cause minor variations

These tolerances are defined in `tests/smoke-test.js`:
```javascript
const CPU_TOLERANCE = 0;
const CPU_THRESHOLD = 0;
const GPU_TOLERANCE = 3;
const GPU_THRESHOLD = 0.02;
```

## Test Output

### Success
```
✓ Backend Selection > should support explicit CPU backend
✓ Backend Selection > should support GPU backend with fallback
✓ CPU: basic_geometry
✓ CPU: multiple_lights
...
✓ GPU: basic_geometry
✓ GPU: multiple_lights
...

Test Results: 15 passed
```

### Failure
```
✗ CPU: basic_geometry
  CPU basic_geometry FAILED:
    Difference: 0.0234%
    Max Delta: 5
    Output: tests/output/cpu/basic_geometry.png
    Diff: tests/output/cpu/basic_geometry_diff.png
```

On failure, check:
1. **Output image**: Current render (`tests/output/cpu/{scene}.png`)
2. **Diff image**: Visual comparison showing differences in red (`tests/output/cpu/{scene}_diff.png`)
3. **Metrics JSON**: Detailed comparison statistics (`tests/output/cpu/{scene}_metrics.json`)

Example metrics:
```json
{
  "width": 512,
  "height": 512,
  "totalPixels": 262144,
  "differentPixels": 614,
  "differencePercentage": 0.234,
  "maxDelta": 5,
  "avgDelta": 0.12,
  "tolerance": 0,
  "threshold": 0
}
```

## Golden Reference Files

### Directory Structure
```
tests/golden/
├── cpu/                        # CPU backend goldens (committed)
│   ├── basic_geometry.png
│   ├── multiple_lights.png
│   ├── pbr_materials.png
│   ├── transforms.png
│   └── stress_test.png
└── gpu/
    ├── gpu-webgpu/             # WebGPU backend goldens (committed)
    │   ├── basic_geometry.png
    │   ├── multiple_lights.png
    │   ├── pbr_materials.png
    │   ├── transforms.png
    │   └── stress_test.png
    └── gpu-webgl2/             # WebGL2 backend goldens (if present)
        └── (same structure)
```

### About GPU Golden References

- **CPU goldens**: Deterministic and pixel-perfect across all platforms
- **GPU goldens**: May vary slightly due to driver/hardware differences
- **Treatment**: This repository treats GPU goldens as **local baselines**
- **Cross-platform**: GPU goldens are machine-specific; variations on different GPUs/drivers are expected
- **Committed**: Both CPU and GPU goldens are committed to version control for local regression testing

## CI Integration

**CI integration is not currently supported** due to the headed mode requirement. To enable CI in the future:

1. Configure headless GPU rendering (requires specialized CI runners with GPU support)
2. Use Xvfb or similar virtual display on Linux
3. Adjust tolerances for CI-specific GPU variations
4. Consider skipping GPU tests in CI and only running CPU tests

For now, the test suite is optimized for **local development workflow**.

## Extending Tests

### Add New Scene

1. **Add scene creator** in `tests/test-helpers.js`:
   ```javascript
   const sceneCreators = {
     // ... existing scenes
     
     my_new_scene() {
       const scene = new Scene();
       const camera = new PerspectiveCamera({ ... });
       // Build your scene
       return { scene, camera };
     }
   };
   ```

2. **Add to test suite** in `tests/smoke-test.js`:
   ```javascript
   const TEST_SCENES = [
     'basic_geometry',
     'multiple_lights',
     'pbr_materials',
     'transforms',
     'stress_test',
     'my_new_scene'  // Add here
   ];
   ```

3. **Generate golden reference**:
   ```powershell
   npm run test:smoke:regen
   ```

4. **Verify and commit**:
   ```powershell
   git add tests/golden/cpu/my_new_scene.png
   git add tests/golden/gpu/webgpu/my_new_scene.png
   git commit -m "Add my_new_scene smoke test"
   ```

### Adjust Tolerances

If GPU tests fail due to driver variations, adjust in `tests/smoke-test.js`:

```javascript
// Increase tolerance for specific GPUs
const GPU_TOLERANCE = 5;      // Allow larger per-channel delta
const GPU_THRESHOLD = 0.05;   // Allow 5% of pixels to differ
```

### Test Specific Backend

Modify `tests/smoke-test.js` to skip backends:

```javascript
// Test only CPU
const BACKENDS = ['cpu'];

// Test only GPU
const BACKENDS = ['gpu'];
```

## Troubleshooting

### Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::8765
```

**Solution**: Stop the existing server:
```powershell
# Find process using port 8765
netstat -ano | findstr :8765

# Kill process (replace PID)
taskkill /PID <PID> /F
```

### GPU Not Available
```
GPU backend not available
```

**Causes**:
- WebGPU not supported (older Chromium versions, need >= 113)
- Incompatible GPU or drivers
- GPU acceleration disabled in browser settings

**Solution**: Tests will skip GPU tests gracefully. Ensure you have:
- Chromium/Chrome 113 or newer
- Compatible GPU with up-to-date drivers
- GPU acceleration enabled

### Golden References Missing
```
Golden reference missing: tests/golden/cpu/basic_geometry.png
Run with REGEN_GOLDEN=true to generate
```

**Solution**: Generate golden references:
```powershell
npm run test:smoke:regen
```

### All Tests Fail After Intentional Change

This is expected! If you intentionally changed rendering:

1. Review one failure manually to confirm change is correct
2. Regenerate all golden references:
   ```powershell
   npm run test:smoke:regen
   ```
3. Review diff in git to ensure changes match expectations
4. Commit new golden references

### Test Timeout

**Increase timeout** in `playwright.config.js`:
```javascript
export default defineConfig({
  timeout: 120000, // 2 minutes
  // ...
});
```

## Best Practices

1. **Run tests before committing**: Catch regressions early
2. **Review diff images**: Don't just trust metrics
3. **Separate CPU/GPU goldens**: Different backends have different characteristics
4. **Version control goldens**: Track rendering changes over time
5. **Update docs**: Document test changes in commit messages

## Files Reference

```
tests/
├── smoke-test.js          # Main Playwright test suite
├── test-helpers.js        # Scene creation and rendering utilities
├── test-page.html         # Minimal HTML test page
├── server.js              # Static file server
├── image-compare.js       # PNG comparison and diff generation
├── golden/                # Golden reference images (committed)
│   ├── cpu/
│   │   ├── basic_geometry.png
│   │   ├── multiple_lights.png
│   │   ├── pbr_materials.png
│   │   ├── transforms.png
│   │   └── stress_test.png
│   └── gpu/
│       ├── gpu-webgpu/
│       │   └── *.png
│       └── gpu-webgl2/
│           └── *.png
└── output/                # Test output (gitignored)
    ├── cpu/
    │   ├── *.png
    │   ├── *_diff.png
    │   └── *_metrics.json
    └── gpu/
        ├── gpu-webgpu/
        └── gpu-webgl2/

playwright.config.js       # Playwright configuration
package.json              # Test scripts and dependencies
```

## Additional Resources

- [Playwright Documentation](https://playwright.dev)
- [pngjs Documentation](https://www.npmjs.com/package/pngjs)
- [WebGPU Compatibility](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)
