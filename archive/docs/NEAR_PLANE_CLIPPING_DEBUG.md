# Near-Plane Clipping Bug Analysis

## Problem Summary
When camera zooms very close to the floor, triangles that straddle the near plane produce extreme warped geometry that appears to "continue infinitely" upward. The effect is abrupt - it appears/disappears within a narrow camera distance range.

## Root Cause
**Partially-clipped triangles with invalid perspective division.**

### What's Happening:

1. **Recent Change**: Modified near-plane clipping from "reject if ANY vertex behind" to "reject only if ALL vertices behind"
   - Intent: Prevent floor from disappearing completely
   - Side effect: Partially-clipped triangles now pass through to rasterization

2. **Invalid Vertices**: When a triangle straddles the near plane:
   - Some vertices have `w > near` (valid, in front of camera)
   - Some vertices have `w ≤ near` (invalid, behind camera)

3. **Extreme Perspective Division**: For vertices with `w < near`:
   ```javascript
   // Example: vertex behind near plane with w = 0.3, near = 0.5
   invW = 1.0 / 0.3 = 3.33
   ndcX = clipX * 3.33  // Could be 50.0 or higher (way outside -1 to 1)
   screenX = (50.0 + 1.0) * 0.5 * width  // Maps to extreme off-screen position
   ```

4. **Warped Rasterization**: Rasterizer draws triangle from:
   - Valid screen position (e.g., floor at bottom of screen)
   - Invalid extreme position (e.g., x=5000, y=-10000)
   - Result: Triangle stretches across entire screen creating "infinite floor" effect

### Why It's Abrupt:
- Binary threshold: either a vertex is behind the near plane or it isn't
- When camera moves slightly, the last invalid vertex crosses the threshold
- All vertices become valid instantly → artifact disappears

### Why Only the Floor:
- Floor positioned at y=-0.8 (below camera)
- When camera tilts down and zooms close, floor back wall triangles cross near plane
- Cube centered above doesn't intersect near plane at these camera positions

## Affected Pipeline Stages

### 1. Pipeline.js (Lines 91-99)
```javascript
// Near plane clipping - discard only if ALL vertices are behind near plane
const v0Behind = !ClipSpace.isInFrontOfNear(this._clipV0, camera.near);
const v1Behind = !ClipSpace.isInFrontOfNear(this._clipV1, camera.near);
const v2Behind = !ClipSpace.isInFrontOfNear(this._clipV2, camera.near);

if (v0Behind && v1Behind && v2Behind) {
  clippedCount++;
  continue;
}
```
**Issue**: Passes triangles with 1-2 vertices behind near plane to downstream stages.

### 2. ClipSpace.js toNDC (Lines 24-37)
```javascript
static toNDC(clipVertex, out = new Vector3()) {
  if (Math.abs(clipVertex.w) < 0.0001) {
    out.set(0, 0, 0);
    return out;
  }
  
  const invW = 1.0 / clipVertex.w;
  out.set(
    clipVertex.x * invW,
    clipVertex.y * invW,
    clipVertex.z * invW
  );
  return out;
}
```
**Issue**: Doesn't check if `w < near`. Produces extreme NDC values for vertices behind camera.

### 3. Rasterizer.js
**Issue**: Assumes all triangles have valid screen-space coordinates. No validation that coordinates are within reasonable bounds.

## Debugging Techniques

### 1. Log Vertices Near the Near Plane
Add to Pipeline.js after near-plane test:
```javascript
const hasPartialClip = (v0Behind || v1Behind || v2Behind) && 
                       !(v0Behind && v1Behind && v2Behind);
if (hasPartialClip) {
  console.log('Partially clipped triangle:', {
    v0: { w: this._clipV0.w, behind: v0Behind, 
          ndc: `${this._ndcV0.x.toFixed(2)}, ${this._ndcV0.y.toFixed(2)}` },
    v1: { w: this._clipV1.w, behind: v1Behind,
          ndc: `${this._ndcV1.x.toFixed(2)}, ${this._ndcV1.y.toFixed(2)}` },
    v2: { w: this._clipV2.w, behind: v2Behind,
          ndc: `${this._ndcV2.x.toFixed(2)}, ${this._ndcV2.y.toFixed(2)}` }
  });
}
```

### 2. Visualize Extreme Screen Coordinates
Add to Pipeline.js before rasterization:
```javascript
const maxCoord = Math.max(
  Math.abs(this._screenV0.x), Math.abs(this._screenV0.y),
  Math.abs(this._screenV1.x), Math.abs(this._screenV1.y),
  Math.abs(this._screenV2.x), Math.abs(this._screenV2.y)
);
if (maxCoord > this.frameBuffer.width * 2) {
  console.warn('Extreme screen coords detected:', maxCoord, {
    v0: `${this._screenV0.x.toFixed(0)}, ${this._screenV0.y.toFixed(0)}`,
    v1: `${this._screenV1.x.toFixed(0)}, ${this._screenV1.y.toFixed(0)}`,
    v2: `${this._screenV2.x.toFixed(0)}, ${this._screenV2.y.toFixed(0)}`
  });
}
```

### 3. Color-Code Partially Clipped Triangles
Modify fragment shader to highlight affected triangles:
```javascript
if (hasPartialClip) {
  // Pass flag to rasterizer
  vertex0.partiallyClipped = true;
  vertex1.partiallyClipped = true;
  vertex2.partiallyClipped = true;
}

// In Rasterizer: override color for debugging
if (v0.partiallyClipped) {
  return { r: 255, g: 0, b: 255, a: 255 }; // Magenta for partially clipped
}
```

### 4. Track Triangle Classifications
Add counters to Pipeline render method:
```javascript
let fullyValid = 0;
let partiallyClipped = 0;
let fullyClipped = 0;

// After each triangle:
if (v0Behind && v1Behind && v2Behind) fullyClipped++;
else if (v0Behind || v1Behind || v2Behind) partiallyClipped++;
else fullyValid++;

// Log periodically
console.log(`Triangle stats: valid=${fullyValid}, partial=${partiallyClipped}, clipped=${fullyClipped}`);
```

### 5. Visualize Near Plane Intersection
Add debug rendering of the near plane itself:
```javascript
// Draw near plane as a colored quad in world space
const nearPlaneZ = -camera.near; // In camera space
// Transform to world space and render as semi-transparent overlay
```

## Solution Options

### Option 1: Reject Partially Clipped Triangles (Simple, Lossy)
Revert to original behavior - reject if ANY vertex behind near:
```javascript
if (v0Behind || v1Behind || v2Behind) {
  clippedCount++;
  continue;
}
```
**Pros**: Simple, no warping
**Cons**: Floor disappears at close zoom (original problem returns)

### Option 2: Proper Triangle Clipping (Correct, Complex)
Implement Sutherland-Hodgman clipping against near plane:
1. Detect vertices behind near plane
2. Calculate intersection points with near plane
3. Generate 1-2 new triangles fully in front of near plane
4. Rasterize only valid triangles

**Pros**: Mathematically correct, no artifacts
**Cons**: Complex implementation, performance cost

### Option 3: Guard Rails in NDC Conversion (Pragmatic)
Clamp or reject vertices with invalid w values:
```javascript
static toNDC(clipVertex, out = new Vector3()) {
  // Reject vertices behind near plane before perspective divide
  if (clipVertex.w < 0.01) {  // Or use camera.near
    out.set(Infinity, Infinity, Infinity);  // Mark as invalid
    return out;
  }
  // ... rest of perspective divide
}

// In Rasterizer: check for invalid vertices
if (!isFinite(v0.position.x) || !isFinite(v1.position.x) || !isFinite(v2.position.x)) {
  return; // Skip triangle
}
```
**Pros**: Simple safety check, prevents warping
**Cons**: Still loses triangles, but more gracefully

### Option 4: Move Floor Higher (Workaround)
Change floor position from y=-0.8 to y=-0.05 (like debug-views example):
**Pros**: Avoids near plane intersection at normal zoom levels
**Cons**: Doesn't fix underlying bug, just avoids triggering it

## Recommended Approach

**Short-term**: Option 3 (Guard Rails) + Option 4 (Floor Position)
- Add invalid coordinate detection in toNDC and rasterizer
- Standardize floor position to y=-0.05 across all examples
- Prevents warping while maintaining reasonable floor visibility

**Long-term**: Option 2 (Proper Clipping)
- Implement Sutherland-Hodgman near-plane clipping
- Required for production-quality renderer
- Can be added incrementally without breaking existing functionality

## Test Cases

1. **Close Zoom Test**: Camera at position (0, 0, 2) looking at floor at y=-0.8
   - Expected: Floor partially visible, no warping
   - Current: Warping when any floor triangle straddles near=0.5

2. **Steep Angle Test**: Camera tilted 45° down, zooming toward floor
   - Expected: Smooth clipping as floor approaches near plane
   - Current: Abrupt snap from warped to normal

3. **Cube Proximity Test**: Camera very close to cube (0.1 units away)
   - Expected: Cube partially visible, properly clipped
   - Current: Likely works (cube doesn't extend below camera)

## Related Files

- `src/renderer/Pipeline.js` - Near-plane clipping logic (lines 91-99)
- `src/renderer/ClipSpace.js` - Perspective divide (lines 24-37)
- `src/renderer/Rasterizer.js` - Triangle rasterization (assumes valid coords)
- `examples/textured/index.html` - Floor at y=-0.8 triggers bug
- `examples/lights/index.html` - Floor at y=-0.8 triggers bug
- `examples/debug-views/index.html` - Floor at y=-0.05 avoids bug

## Validation

Bug is confirmed when:
1. Logging shows triangles with w values below camera.near passing through
2. NDC coordinates exceed ±10.0 (way outside normal -1 to 1 range)
3. Screen coordinates exceed 2× viewport dimensions
4. Visual artifact appears at same camera position as logged invalid triangles

Fix is validated when:
1. No triangles with w < near reach rasterization
2. All NDC coordinates stay within reasonable bounds (-5 to 5 is acceptable)
3. Visual artifact disappears at all camera positions and angles
4. Floor remains visible at normal zoom levels (doesn't disappear completely)
