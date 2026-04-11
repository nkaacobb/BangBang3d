# BangBang3d - Required Artifacts

This document lists all non-code artifacts required by the BangBang3d engine and its examples.

## Current Status (Milestones A-E Completed)

As of the current implementation (**Milestones A through E complete**), **no external artifacts are required**. 

### Milestone D - Texture System (COMPLETED)

The texture system is fully implemented with:
- ✅ Texture class with sampling and filtering
- ✅ TextureLoader with procedural texture generation
- ✅ Perspective-correct UV interpolation
- ✅ Bilinear texture filtering
- ✅ Texture wrapping modes (repeat, clampToEdge, mirroredRepeat)
- ✅ Procedural texture generators (checker, UV test, grid, wood, brick)

**All textures in current examples are procedurally generated** - no external image files required!

### Milestone E - Advanced Features (COMPLETED)

The advanced feature set is fully implemented:
- ✅ DebugMaterial for pipeline visualization (normals, depth, UVs, world position)
- ✅ Stats utility for real-time performance monitoring
- ✅ OrbitControls for interactive camera manipulation
- ✅ WorkerRenderer for Web Worker-based rendering
- ✅ Debug views example with interactive UI

## Current Examples (No External Assets)

### 1. Basic Cube (`examples/basic-cube/`)
- Uses: BoxGeometry (procedural)
- Material: BasicMaterial with flat color
- Assets: None

### 2. Lights (`examples/lights/`)
- Uses: BoxGeometry, PlaneGeometry (procedural)
- Material: LambertMaterial with diffuse shading
- Assets: None

### 3. Textured Cube (`examples/textured/`)
- Uses: BoxGeometry, PlaneGeometry (procedural)
- Material: BasicMaterial with texture maps
- Textures: All procedurally generated via TextureLoader
  - Checker pattern (256x256)
  - UV test gradient (512x512)
  - Grid pattern (256x256)
  - Wood grain (512x512)
  - Brick texture (512x512)
- Assets: None

### 4. Debug Views (`examples/debug-views/`)
- Uses: BoxGeometry, PlaneGeometry (procedural)
- Material: DebugMaterial with multiple visualization modes
- Features: OrbitControls, Stats overlay, interactive UI
- Modes: Normals (RGB), Depth (grayscale), UVs (RG), World Position (RGB)
- Assets: None

## Future Artifacts (Optional Enhancements)

The following artifacts are **optional** and only needed if you want to load external images:

### External Image Textures (Optional)

Since BangBang3d now supports texture loading via `TextureLoader.load()`, you can optionally add external image files. However, **this is not required** as the procedural texture generators provide full functionality.

#### Loading External Images

```javascript
import { TextureLoader } from './src/resources/TextureLoader.js';

const loader = new TextureLoader();
const texture = loader.load('./path/to/image.png', (loadedTexture) => {
  console.log('Texture loaded!', loadedTexture);
  material.map = loadedTexture;
});
```

**Supported formats**: PNG, JPG, GIF, WebP (any format supported by HTML Image element)

#### Example External Assets (If Desired)

If you want to add your own textures:
- Place images in `examples/textured/assets/`
- Use power-of-two dimensions (256, 512, 1024, 2048)
- PNG for transparency, JPG for photos
- Ensure proper licensing

## Procedural Texture Generators (Built-in)

The following textures can be generated without any external files:

### TextureLoader Methods

1. **`createCheckerTexture(size, checkerCount)`**
   - Creates a checker pattern
   - Default: 256x256, 8x8 checkers
   - Colors: Light gray and dark gray

2. **`createUVTestTexture(size)`**
   - UV gradient with checker pattern
   - Default: 512x512
   - Shows UV mapping correctness

3. **`createGridTexture(size, gridSize, lineWidth)`**
   - Grid lines on white background
   - Default: 256x256, 32px grid, 2px lines
   - Useful for scale reference

4. **`createWoodTexture(size)`**
   - Procedural wood grain
   - Default: 512x512
   - Brown tones with sine wave grain

5. **`createBrickTexture(size)`**
   - Brick wall pattern
   - Default: 512x512
   - Red bricks with gray mortar

6. **`createProcedural(width, height, generator)`**
   - Custom texture from generator function
   - Generator: `(x, y, width, height) => { r, g, b, a }`
   - Full control over every pixel

### Usage Example

```javascript
import { TextureLoader } from './src/resources/TextureLoader.js';

const loader = new TextureLoader();

// Checker pattern
const checker = loader.createCheckerTexture(256, 8);

// Custom procedural texture
const custom = loader.createProcedural(512, 512, (x, y, w, h) => {
  const u = x / w;
  const v = y / h;
  return { r: u, g: v, b: 0.5, a: 1.0 };
});

material.map = checker;
```

## Future Milestone Assets

### Milestone E - Advanced Features (Not Yet Implemented)

When Milestone E is implemented, these optional assets may be useful:

- Debug font bitmap for on-screen stats
- Performance test models (high poly count)
- Benchmark scenes

**Status**: Not required - Milestone E not yet started

## Summary

**Current Requirements**: ✅ **ZERO external assets needed**

All current examples work with:
- Procedurally generated geometry (BoxGeometry, SphereGeometry, Platonic solids)
- Procedurally generated textures (TextureLoader generators)
- Dual-backend rendering (CPU software rasterization OR GPU WebGPU/WebGL2)
- Backend selection at runtime (`backend: 'cpu' | 'gpu' | 'auto'`)

You can start using BangBang3d immediately without downloading any assets!

**Note:** For glTF/GLB models (Phase 5), you'll need to provide your own .gltf or .glb files. The engine includes a complete glTF 2.0 loader.

---

**BangBang3d Milestones A-E Complete**: Full CPU-based 3D rendering with textures, lighting, debug views, and performance tools. **Phases 1-5 Complete**: GPU-accelerated rendering with WebGPU/WebGL2, PBR materials, compute shaders, skeletal animation, and instancing. Zero external dependencies! 🎨🔺
- Smaller textures (512x512) perform better than larger ones
- Consider providing both high and low-resolution versions

## License Requirements

Any assets added to this project must:
1. Be original creations, or
2. Be properly licensed for distribution (CC0, CC-BY, MIT, etc.)
3. Include attribution if required by license
4. Be documented in this file with license information

## Asset Checklist for Contributors

When adding a new asset:
- [ ] Add entry to this document with all required fields
- [ ] Specify exact file path relative to repository root
- [ ] Mark as REQUIRED or OPTIONAL
- [ ] Include dimensions/specifications
- [ ] Document the feature that depends on it
- [ ] Verify license compatibility
- [ ] Add to .gitignore if files are large and should be downloaded separately

## No Assets Required for Current Examples

The current examples (`basic-cube` and `lights`) use:
- **BoxGeometry**: Procedurally generated cube mesh
- **PlaneGeometry**: Procedurally generated plane mesh
- **BasicMaterial**: Flat color shading (no textures)
- **LambertMaterial**: Diffuse shading with CPU lighting (no textures)

All rendering is performed using generated geometry and computed colors. No external files are needed to run these examples.

## Future Milestones

### Milestone D - Textures
- Will require UV test texture and at least 2 example textures
- TextureLoader will need implementation
- Image loading and Canvas 2D sampling required

### Milestone E - Advanced Features
- May require debug fonts for stats display
- Optional: demo scenes with complex geometry
- Optional: benchmark assets

## Contact

If you need to add an artifact that isn't listed here, please update this document following the format above.

