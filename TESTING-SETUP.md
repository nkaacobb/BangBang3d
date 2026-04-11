# BangBang3D Smoke Test System - Setup Complete

The comprehensive smoke test and regression system has been successfully implemented! 🎉

**Important**: Tests run in **headed mode** (visible browser window) because WebGPU/WebGL2 APIs require a visible rendering context. This is a known limitation of Chromium's GPU stack in headless mode. The test suite is designed for **local development only**.

## What Was Created

### Test Infrastructure
1. **tests/smoke-test.js**: Playwright test suite with backend validation and golden reference comparison
2. **tests/test-helpers.js**: Scene creators for 5 golden test scenes
3. **tests/test-page.html**: Minimal HTML test harness
4. **tests/server.js**: Static file server for test assets
5. **tests/image-compare.js**: PNG comparison with tolerance and diff generation
6. **playwright.config.js**: Playwright configuration with WebGPU support

### Configuration
7. **package.json**: Updated with test dependencies and scripts
8. **.gitignore**: Excludes test output and node_modules
9. **TESTING.md**: Comprehensive testing documentation

### Golden Reference Structure
10. **tests/golden/**: Directory structure for reference images
    - `cpu/` - CPU backend references (deterministic)
    - `gpu/webgpu/` - WebGPU-specific references
    - `gpu/webgl2/` - WebGL2-specific references

## Next Steps

### 1. Install Dependencies

```powershell
cd "d:\Repo\Projects\Utilities\Forge3d"
npm install
```

This will install:
- `@playwright/test` - Test runner and browser automation
- `pngjs` - PNG image manipulation
- `cross-env` - Cross-platform environment variables

### 2. Install Playwright Browsers

```powershell
npx playwright install chromium
```

**Note**: When tests run, you will see a Chromium browser window open. This is expected and required for GPU backend validation.

### 3. Generate Initial Golden References

Since no golden references exist yet, generate them:

```powershell
# Method 1: Using npm script
npm run test:smoke:regen

# Method 2: Direct PowerShell env var (more reliable on Windows)
$env:REGEN_GOLDEN='true'; npm run test:smoke
```

This will:
- Auto-start test server (via Playwright config)
- Open Chromium browser in **headed mode** (visible window)
- Render all 5 test scenes with CPU backend
- Render all 5 test scenes with GPU backend (WebGPU if available)
- Save golden reference images to `tests/golden/`
- Auto-stop test server

**Important**: Visually inspect the generated images in `tests/golden/` to ensure they look correct before committing!

### 4. Run Tests

After generating golden references, run normal tests:

```powershell
npm run test:smoke
```

Expected output:
```
✓ Audit - Dependency Check > should not import Three.js
✓ Backend Selection > should support explicit CPU backend
✓ Backend Selection > should support GPU backend with fallback
✓ CPU: basic_geometry
✓ CPU: multiple_lights
✓ CPU: pbr_materials
✓ CPU: transforms
✓ CPU: stress_test
✓ GPU: basic_geometry
✓ GPU: multiple_lights
✓ GPU: pbr_materials
✓ GPU: transforms
✓ GPU: stress_test

Test Results: 15 passed
```

## Test Features

### Backend Validation
- ✅ Validates explicit CPU backend selection
- ✅ Validates GPU backend with fallback (auto mode)
- ✅ Checks `renderer.backendType` matches expected
- ✅ Validates capabilities flags (compute shaders, instancing, etc.)

### Golden Reference Comparison
- ✅ CPU: Pixel-perfect comparison (0 tolerance)
- ✅ GPU: Tolerance-based comparison (3 RGB/channel, 2% threshold)
- ✅ Separate golden sets for WebGPU and WebGL2
- ✅ Visual diff generation on failures

### Failure Artifacts
When tests fail, artifacts are saved to `tests/output/`:
- `{backend}/{scene}.png` - Current render
- `{backend}/{scene}_diff.png` - Visual diff (differences in red)
- `{backend}/{scene}_metrics.json` - Detailed comparison stats

### 5 Test Scenes

1. **basic_geometry**: Sphere, box, plane with directional light
2. **multiple_lights**: Three RGB point lights on white sphere
3. **pbr_materials**: Five spheres with varying roughness/metallic
4. **transforms**: Spiral of scaled/rotated boxes
5. **stress_test**: 11×11 grid of 121 spheres

## Troubleshooting

### Port Already in Use
If you see "EADDRINUSE: port 8765 already in use":

```powershell
# Find process
netstat -ano | findstr :8765

# Kill it (replace <PID>)
taskkill /PID <PID> /F
```

### GPU Not Available
If GPU tests are skipped:
- This is normal in some environments (older GPUs, unsupported drivers)
- CPU tests will still run
- To enable WebGPU, ensure Chromium >= 113 and compatible GPU drivers

### Golden References Missing
If you see "Golden reference missing" errors:
```powershell
npm run test:smoke:regen
```

## Optional: Local Development Server

For manual testing and debugging:

```powershell
# Start test server
npm run test:smoke:server

# Open in browser
# http://localhost:8765/tests/test-page.html
```

## CI Integration Status

**Not currently supported.** The test suite requires headed mode (visible browser window) for GPU backend testing. CI integration would require:
- GPU-enabled CI runners
- Virtual display (Xvfb on Linux)
- Adjusted tolerances for CI GPU variations

For now, the test suite is optimized for **local development workflow**.

## Troubleshooting

### Port Already in Use
If you see "EADDRINUSE: port 8765 already in use":

```powershell
# Find process
netstat -ano | findstr :8765

# Kill it (replace <PID>)
taskkill /PID <PID> /F
```
```

## Documentation

See [TESTING.md](TESTING.md) for:
## Documentation Structure

- **README.md**: Quick testing overview and commands
- **TESTING.md**: Comprehensive testing guide (detailed)
- **TESTING-SETUP.md**: This file - initial setup walkthrough
- **tests/golden/README.md**: Golden reference file documentation
- **archive/docs/SMOKE-TEST-IMPLEMENTATION.md**: Historical smoke test implementation details

## Summary

The test system is ready for local development and provides:
- ✅ Comprehensive backend validation
- ✅ Pixel-level regression detection
- ✅ Cross-platform consistency checks
- ✅ Visual diff generation
- ✅ Headed mode for GPU testing
- ✅ Detailed documentation

All that's left is to run `npm install`, `npx playwright install chromium`, and `npm run test:smoke:regen` to generate your first golden references! 🚀
