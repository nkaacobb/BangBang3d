# Near-Plane Clipping Fix - Wedge Artifact

## Problem: Floor Wedge at Zoom Threshold

**Symptom**: When zooming camera closer to scene (camera at ~y=1.22, floor at y=-0.4), one of the two floor triangles suddenly disappears, creating a large black wedge. Only a thin strip of floor remains visible.

**Root Cause**: The "guard rail" approach added to prevent infinite projection was using a **discard strategy** instead of proper geometric clipping:

1. `ClipSpace.toNDC()` marked vertices with `w < near * 0.99` as invalid (set to `Infinity`)
2. `Pipeline.js` checked for invalid coordinates and discarded entire triangles
3. When camera reached threshold, ONE floor triangle had a vertex behind near plane → marked invalid → entire triangle discarded
4. The other floor triangle remained valid → created asymmetric "wedge" artifact

**Why It's Wrong**:
- **Geometric correctness**: Triangles that cross the near plane should be **clipped**, not discarded
- **Hard threshold**: Boolean test creates abrupt visual snap at specific zoom distance
- **Asymmetric behavior**: Two triangles of same quad can have different rejection outcomes

---

## Solution: Proper Sutherland-Hodgman Near-Plane Clipping

### Key Changes:

#### 1. **NearPlaneClipper Module** (`src/renderer/NearPlaneClipper.js`)
Implements geometric clipping against near plane in clip space:
- **Input**: 1 triangle with 3 vertices in clip space
- **Output**: 0, 1, or 2 triangles (clipped polygon)
- **Algorithm**: Sutherland-Hodgman clipping
  - All 3 vertices behind near → 0 triangles (fully clipped)
  - All 3 vertices in front → 1 triangle (unchanged)
  - 1 vertex in front, 2 behind → 1 triangle (clipped)
  - 2 vertices in front, 1 behind → 2 triangles (quad split)
- **Attribute interpolation**: All vertex attributes (position, normal, UV, etc.) are linearly interpolated at clip plane intersection

#### 2. **ClipSpace.toNDC() Simplified** (`src/renderer/ClipSpace.js`)
Removed near-plane guards - only keeps divide-by-zero check:
```javascript
// Before (WRONG):
if (clipVertex.w < nearPlane * 0.99) {
  out.set(Infinity, Infinity, Infinity);  // Mark invalid
  return out;
}

// After (CORRECT):
// No check - clipping already handled upstream
if (Math.abs(clipVertex.w) < 0.0001) {  // Only divide-by-zero guard
  out.set(0, 0, 0);
  return out;
}
```

#### 3. **Pipeline Refactored** (`src/renderer/Pipeline.js`)
New pipeline flow:
1. Build vertex structure with clip-space position + all attributes
2. **Clip triangle against near plane** (geometric clipping)
3. For each clipped triangle (0-2 output triangles):
   - Perform perspective divide (NDC)
   - Transform to screen space
   - Pass to rasterizer (backface culling happens here)

**Before (Discard Strategy)**:
```
Transform to clip → Test vertices → Discard if any invalid → Project → Rasterize
```

**After (Clipping Strategy)**:
```
Transform to clip → Clip geometry → Project valid triangles → Rasterize
```

#### 4. **Statistics Tracking**
Added `pipeline.stats` object:
- `trianglesSubmitted`: Input triangle count
- `trianglesClippedOut`: Fully behind near plane (0 output)
- `trianglesClippedNear`: Partially clipped (1 triangle → 2 triangles)
- `trianglesCulled`: Backface culled
- `trianglesRendered`: Successfully rasterized

---

## Technical Details

### Clipping Algorithm (Sutherland-Hodgman)

**Near plane test**: `w > nearPlane` (vertex in front of camera)

**Case 1: One vertex inside, two outside**
```
     Inside
       *
      /|\
     / | \
    /  |  \
   *---+---*   ← Near plane intersection
  Outside    Outside

Result: 1 smaller triangle
```

**Case 2: Two vertices inside, one outside**
```
   Inside   Inside
     *-------*
      \     /|
       \   / |
        \ /  |
         +---+  ← Near plane intersections
        Outside

Result: 2 triangles (quad)
```

### Intersection Calculation
For edge from `vInside` to `vOutside`:
```javascript
// Find t where interpolated w equals nearPlane
// w_lerp = w_in + t * (w_out - w_in) = nearPlane
t = (nearPlane - w_in) / (w_out - w_in)

// Interpolate all attributes at t
newVertex.clip = clipIn.lerp(clipOut, t)
newVertex.uv = uvIn.lerp(uvOut, t)
newVertex.normal = normalIn.lerp(normalOut, t)
// ... etc
```

---

## Why This Fixes The Wedge

**Before Fix**:
- Floor quad = 2 triangles
- Camera zooms close → one triangle has vertex with `w < 0.5` → marked invalid → **DISCARDED**
- Other triangle still valid → renders normally
- Result: Half the floor missing (wedge)

**After Fix**:
- Floor quad = 2 triangles  
- Camera zooms close → one triangle crosses near plane → **CLIPPED** geometrically
- Clipping produces 1-2 smaller triangles that are fully valid
- Both original triangles contribute geometry → no gaps
- Result: Complete floor, no wedge

---

## Backface Culling Correctness

**Timing**: Culling happens in **Rasterizer** after projection to screen space

**Winding Test**:
```javascript
// Screen space cross product (canvas Y increases downward)
cross = edge1x * edge2y - edge1y * edge2x
shouldCull = cross >= 0  // Cull if counter-clockwise in screen space
```

**Material Control**:
```javascript
material.side === 'DoubleSide'  → cullBackface = false
material.side === 'FrontSide'   → cullBackface = true
```

Floor uses `DoubleSide` to be visible from above and below.

---

## Performance Impact

**Clipping overhead**:
- Worst case: 2 triangles output instead of 1 (when 2 vertices inside, 1 outside)
- Typical case: Most triangles fully in front → no clipping, same performance
- Only triangles crossing near plane pay clipping cost

**Memory**:
- No additional buffers needed
- Clipped triangles are transient (processed immediately)

**Benefit**:
- Eliminates visual artifacts
- Mathematically correct rendering
- Matches GPU behavior

---

## Testing The Fix

### Reproduction Steps:
1. Open textured example: `examples/textured/index.html`
2. Start at "good" camera position: `(2.15, 1.72, 3.43)`, Distance: ~4.2
3. Zoom in slowly toward cube
4. **Before fix**: At threshold (~distance 2.8), floor suddenly collapses to wedge
5. **After fix**: Floor remains complete, smoothly clips at near plane

### Debug Verification:
Check `pipeline.stats` per frame:
```javascript
console.log({
  submitted: pipeline.stats.trianglesSubmitted,     // e.g., 14 (cube 12 + floor 2)
  clippedOut: pipeline.stats.trianglesClippedOut,   // Should be 0 for floor
  clippedNear: pipeline.stats.trianglesClippedNear, // May be 1-2 when floor crosses near
  culled: pipeline.stats.trianglesCulled,            // Backface culling count
  rendered: pipeline.stats.trianglesRendered        // Should be ~12-14
});
```

At the problematic zoom threshold:
- **Before**: `clippedOut` suddenly jumps (floor triangle rejected)
- **After**: `clippedNear` increments (floor triangle clipped, not rejected)

---

## Files Modified

### Core Rendering:
1. **`src/renderer/NearPlaneClipper.js`** (NEW)
   - Sutherland-Hodgman clipping implementation
   - Handles 1-vertex-inside and 2-vertices-inside cases
   - Interpolates all vertex attributes at intersection

2. **`src/renderer/ClipSpace.js`**
   - Removed near-plane guards from `toNDC()`
   - Simplified to only handle divide-by-zero

3. **`src/renderer/Pipeline.js`**
   - Added `NearPlaneClipper` import
   - Added `stats` object for frame statistics
   - Refactored `renderMesh()` to use clipping
   - New methods: `buildVertex()`, `processTriangle()`

4. **`src/renderer/Rasterizer.js`**
   - Removed invalid coordinate check (no longer needed)
   - Return value indicates if triangle was culled

### Examples (TODO - Debug Toggle):
5. **`examples/textured/index.html`**
   - Add keyboard toggle ('C' key) to disable culling
   - Display `pipeline.stats` in debug overlay
   - Show frame-by-frame triangle counts

---

## Comparison: Discard vs Clip

| Aspect | Discard Strategy (Old) | Clipping Strategy (New) |
|--------|------------------------|-------------------------|
| **Correctness** | ❌ Incorrect (holes in geometry) | ✅ Correct (complete geometry) |
| **Visual Quality** | ❌ Abrupt wedge artifacts | ✅ Smooth clipping |
| **GPU Match** | ❌ Doesn't match hardware | ✅ Matches GPU behavior |
| **Complexity** | Simple (boolean test) | Moderate (geometric intersection) |
| **Performance** | Slightly faster | Negligible overhead |
| **Robustness** | ❌ Threshold-dependent bugs | ✅ Handles all cases |

---

## Summary

The floor wedge bug was caused by **discarding entire triangles** when any vertex crossed the near plane threshold. This is geometrically incorrect and creates visible artifacts at specific camera distances.

The fix implements **proper Sutherland-Hodgman clipping** that:
1. Geometrically clips triangles against the near plane in clip space
2. Generates 0-2 output triangles with correctly interpolated attributes  
3. Eliminates hard thresholds and abrupt visual snaps
4. Matches GPU rendering pipeline behavior

Result: Floor and cube remain stable and complete at **all zoom levels** with no wedge artifacts.
