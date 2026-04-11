# Example Review Checklist

## Status Summary

### Post-Processing-Tonemapping-FXAA Example ✅ FIXED
- [x] Backend switching infrastructure implemented
- [x] Canvas replacement pattern added
- [x] Animation loop management fixed
- [x] Camera aspect ratio updates added
- [x] Scene state preservation working

### PBR-Lighting-Shadows Example ✅ FIXED
- [x] Backend switching infrastructure implemented
- [x] Canvas replacement pattern added
- [x] Animation loop management fixed
- [x] Camera aspect ratio updates added
- [x] Scene state preservation working

---

## Post-Processing-Tonemapping-FXAA Example

### Backend Switching Infrastructure
- [ ] Verify backend selection buttons exist (CPU/GPU/Auto)
- [ ] Check if canvas variable is `let` (not `const`) for replacement
- [ ] Confirm `initRenderer()` or equivalent function exists
- [ ] Verify renderer disposal before creating new instance

### Canvas Replacement Pattern
- [ ] Cancel animation loop before switching backends
- [ ] Dispose old renderer properly
- [ ] Replace canvas element to clear WebGPU context lock:
  ```javascript
  const oldCanvas = canvas;
  const newCanvas = document.createElement('canvas');
  newCanvas.id = 'canvas';
  newCanvas.width = /* width */;
  newCanvas.height = /* height */;
  oldCanvas.parentNode.replaceChild(newCanvas, oldCanvas);
  canvas = newCanvas;
  ```
- [ ] Update camera aspect ratio after canvas replacement
- [ ] Update camera projection matrix

### Post-Processing Specific Checks
- [ ] Verify post-processing render graph is recreated on backend switch
- [ ] Check if tone mapping settings persist across switches
- [ ] Verify FXAA settings persist across switches
- [ ] Test render target recreation (if applicable)
- [ ] Ensure post-processing only works on GPU backend
- [ ] Graceful fallback message if CPU backend selected
- [ ] Check if post-processing controls are disabled for CPU backend

### Animation Loop Management
- [ ] Stop animation loop before backend switch (cancelAnimationFrame)
- [ ] Clear animationId reference
- [ ] Always restart animation loop after successful initialization
- [ ] Ensure only one animation loop runs at a time

### Scene State Preservation
- [ ] Verify scene objects persist across backend switches
- [ ] Check object positions remain unchanged
- [ ] Verify materials/colors persist
- [ ] Test rotation/animation state preservation
- [ ] Confirm camera position/rotation preserved

### Testing Checklist
- [ ] Load in GPU mode - post-processing works
- [ ] Toggle to CPU mode - shows appropriate message/fallback
- [ ] Toggle back to GPU mode - post-processing works again
- [ ] Add/remove objects - persists across switches
- [ ] Adjust tone mapping - settings preserved
- [ ] Adjust FXAA - settings preserved
- [ ] Switch backends 5+ times - no memory leaks
- [ ] Check browser console - no errors
- [ ] Verify FPS counter updates correctly
- [ ] Test all sliders/controls work after switch

### Known Issues to Check
- [ ] WebGPU context lock preventing CPU 2D context
- [ ] Animation loop running multiple times
- [ ] Black screen after multiple switches
- [ ] Scene objects disappearing
- [ ] Post-processing not reapplying after switch

---

## PBR-Lighting-Shadows Example

### Backend Switching Infrastructure
- [ ] Verify backend selection buttons exist (CPU/GPU/Auto)
- [ ] Check if canvas variable is `let` (not `const`) for replacement
- [ ] Confirm `initRenderer()` or equivalent function exists
- [ ] Verify renderer disposal before creating new instance

### Canvas Replacement Pattern
- [ ] Cancel animation loop before switching backends
- [ ] Dispose old renderer properly
- [ ] Replace canvas element to clear WebGPU context lock:
  ```javascript
  const oldCanvas = canvas;
  const newCanvas = document.createElement('canvas');
  newCanvas.id = 'canvas';
  newCanvas.width = /* width */;
  newCanvas.height = /* height */;
  oldCanvas.parentNode.replaceChild(newCanvas, oldCanvas);
  canvas = newCanvas;
  ```
- [ ] Update camera aspect ratio after canvas replacement
- [ ] Update camera projection matrix

### PBR-Specific Checks
- [ ] Verify PBRMaterial only works on GPU backend
- [ ] Check graceful fallback for CPU backend (use LambertMaterial or BasicMaterial)
- [ ] Verify metallic/roughness parameters persist
- [ ] Check normal maps load correctly
- [ ] Verify environment maps (if used)
- [ ] Test material switching between PBR and fallback materials

### Lighting System Checks
- [ ] Verify DirectionalLight persists across switches
- [ ] Check AmbientLight settings preserved
- [ ] Test PointLight functionality (GPU only)
- [ ] Test SpotLight functionality (GPU only)
- [ ] Verify light intensity settings persist
- [ ] Check light colors preserved
- [ ] Test light position/direction persistence

### Shadow System Checks
- [ ] Verify shadows only work on GPU backend
- [ ] Check shadow map recreation on backend switch
- [ ] Test shadow quality settings persistence
- [ ] Verify shadow bias settings preserved
- [ ] Check shadow frustum/camera recreation
- [ ] Test multiple shadow-casting lights
- [ ] Graceful disable of shadows on CPU backend

### Animation Loop Management
- [ ] Stop animation loop before backend switch (cancelAnimationFrame)
- [ ] Clear animationId reference
- [ ] Always restart animation loop after successful initialization
- [ ] Ensure only one animation loop runs at a time

### Scene State Preservation
- [ ] Verify PBR objects persist (or convert to fallback materials)
- [ ] Check object positions remain unchanged
- [ ] Verify material properties preserved
- [ ] Test rotation/animation state preservation
- [ ] Confirm camera position/rotation preserved
- [ ] Check light positions/directions preserved

### Capabilities Handling
- [ ] Check `renderer.capabilities.supportsPBR` before using PBRMaterial
- [ ] Check `renderer.capabilities.supportsShadows` before enabling shadows
- [ ] Check `renderer.capabilities.supportsPointLights` for point lights
- [ ] Check `renderer.capabilities.supportsSpotLights` for spot lights
- [ ] Display capability status in UI
- [ ] Graceful degradation when features unavailable

### Testing Checklist
- [ ] Load in GPU mode - PBR materials render correctly
- [ ] Toggle to CPU mode - materials fallback gracefully
- [ ] Toggle back to GPU mode - PBR materials restore
- [ ] Verify shadows work on GPU
- [ ] Verify shadows disabled on CPU
- [ ] Adjust metallic slider - changes visible
- [ ] Adjust roughness slider - changes visible
- [ ] Move lights - shadows update correctly
- [ ] Switch backends 5+ times - no memory leaks
- [ ] Check browser console - no errors
- [ ] Verify FPS counter updates correctly
- [ ] Test all controls work after switch

### Material-Specific Tests
- [ ] GPU: LambertMaterial shows proper shading
- [ ] GPU: PBRMaterial shows metallic reflections
- [ ] GPU: PBRMaterial roughness affects specular
- [ ] CPU: LambertMaterial fallback works
- [ ] CPU: BasicMaterial fallback works
- [ ] Normal matrix calculation correct (Lambert/PBR)
- [ ] Lighting uniforms passed correctly

### Known Issues to Check
- [ ] WebGPU context lock preventing CPU 2D context
- [ ] Animation loop running multiple times
- [ ] Black screen after multiple switches
- [ ] Scene objects disappearing
- [ ] PBR materials rendering as flat colors
- [ ] Shadows not updating
- [ ] Light uniforms not being passed
- [ ] Normal matrix calculation errors

---

## Common Issues Across Both Examples

### Critical Patterns to Verify
1. **Canvas Replacement**: Must replace entire canvas DOM element when switching from GPU to CPU
2. **Animation Loop**: Must cancel before switch and restart after
3. **Camera Updates**: Must update aspect ratio and projection matrix
4. **Scene Preservation**: Scene objects should persist across switches
5. **Capability Checking**: Always check `renderer.capabilities` before using features

### Console Error Patterns to Watch For
- "Failed to get 2D canvas context" → Missing canvas replacement
- "Cannot set properties of undefined (setting 'X')" → Missing userData initialization
- WebGPU validation errors → Buffer size mismatches, pipeline errors
- "Invalid CommandBuffer" → GPU rendering errors
- Multiple animation loops → Missing cancelAnimationFrame

### Performance Checks
- [ ] GPU mode: 60 FPS with complex scenes
- [ ] CPU mode: 10-15 FPS (acceptable for fallback)
- [ ] No memory leaks after multiple switches
- [ ] Renderer properly disposed
- [ ] WebGPU resources cleaned up

### Documentation Updates Needed
- [ ] Update example comments to explain backend switching
- [ ] Document post-processing GPU requirement
- [ ] Document PBR GPU requirement
- [ ] Add inline comments for canvas replacement pattern
- [ ] Document capability checks
