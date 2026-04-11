# Golden Reference Images

This directory contains reference images for smoke tests. These images represent the expected rendering output for validation.

## Structure

```
golden/
├── cpu/              # CPU backend references (deterministic)
│   ├── basic_geometry.png
│   ├── multiple_lights.png
│   ├── pbr_materials.png
│   ├── transforms.png
│   └── stress_test.png
└── gpu/              # GPU backend references (per-backend)
    ├── webgpu/       # WebGPU-specific references
    │   ├── basic_geometry.png
    │   ├── multiple_lights.png
    │   ├── pbr_materials.png
    │   ├── transforms.png
    │   └── stress_test.png
    └── webgl2/       # WebGL2-specific references
        ├── basic_geometry.png
        ├── multiple_lights.png
        ├── pbr_materials.png
        ├── transforms.png
        └── stress_test.png
```

## CPU vs GPU References

### CPU References
- **Deterministic**: Exact same output every run
- **Pixel-perfect**: No tolerance for differences
- **Single set**: Same on all platforms

### GPU References
- **Per-backend**: Separate for WebGPU and WebGL2
- **Tolerant**: Small variations allowed (driver/hardware differences)
- **Machine-specific**: GPU goldens are treated as local baselines and may vary across different hardware/drivers
- **Committed**: Both CPU and GPU goldens are committed for local regression testing

## Regenerating References

**Generate all references:**
```powershell
# Method 1: Using npm script
npm run test:smoke:regen

# Method 2: Direct PowerShell (more reliable on Windows)
$env:REGEN_GOLDEN='true'; npm run test:smoke
```

**Note**: Tests run in headed mode (visible browser window will open) because GPU APIs require a visible rendering context.

**When to regenerate:**
- ✅ Initial setup
- ✅ Intentional rendering changes
- ✅ Adding new test scenes
- ✅ Fixing rendering bugs
- ❌ Random test failures (investigate first!)

## Validation

Before committing new golden references:

1. **Visual inspection**: Open images and verify they look correct
2. **Compare with previous**: Use git diff to review changes
3. **Run tests**: Ensure new references pass
4. **Cross-platform check**: Test on different systems if possible

## Maintenance

- **Version control**: These files must be committed to git
- **File size**: Keep scenes reasonably complex (currently 512x512 PNG)
- **Consistency**: Regenerate all scenes together, not individually
- **Review changes**: Always review git diff before committing

## Test Scenes

1. **basic_geometry**: Simple sphere, box, and plane
   - Tests: Basic shape rendering, directional lighting
   - Size: ~15KB per reference

2. **multiple_lights**: Sphere with RGB point lights
   - Tests: Multiple light sources, color blending
   - Size: ~12KB per reference

3. **pbr_materials**: 5 spheres with varying PBR properties
   - Tests: Material system, roughness/metallic
   - Size: ~18KB per reference

4. **transforms**: Spiral of rotated/scaled boxes
   - Tests: Transform matrices, scaling, rotation
   - Size: ~20KB per reference

5. **stress_test**: 11x11 grid of spheres (121 objects)
   - Tests: Performance, many objects
   - Size: ~45KB per reference

Total size: ~350KB (CPU) + ~350KB (GPU-WebGPU) + ~350KB (GPU-WebGL2) ≈ 1MB

## Troubleshooting

### Reference Doesn't Match
Check if rendering changed:
- Compare output with golden in image viewer
- Review recent commits affecting renderer
- Check if tolerance needs adjustment (GPU only)

### Missing References
Generate them:
```powershell
npm run test:smoke:regen
```

### Wrong Backend Reference
If GPU test uses wrong reference (e.g., WebGPU using WebGL2 reference):
- Check `tests/smoke-test.js` backend detection
- Ensure correct directory structure
- Regenerate references

## Platform Notes

### All Platforms
- Tests run in headed mode (visible browser window)
- GPU goldens may vary between hardware/driver combinations
- This is expected and tolerated within threshold limits

### Windows
- Uses native file paths (`\`)
- Playwright handles conversion automatically
- No special setup needed

### macOS/Linux
- Uses POSIX paths (`/`)
- WebGPU support varies by driver
- May need vulkan-loader (Linux)

### CI Environment
- Headless rendering
- Software rasterization fallback common
- GPU tests may be skipped
