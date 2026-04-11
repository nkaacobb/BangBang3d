# Lighting Playground

Interactive lighting demonstration and testing environment for BangBang3D. Create, manipulate, and experiment with five different light types in real-time.

## Features

### Light Types
Add and configure five types of lights:

- **Point Light**: Omnidirectional light with distance attenuation
- **Spot Light**: Cone-shaped light with angle and penumbra controls
- **Directional Light**: Parallel rays simulating sunlight
- **Hemisphere Light**: Dual-color ambient light (sky + ground)
- **Ambient Light**: Uniform illumination affecting all objects equally

### Interactive Tools

- **Visual Light Helpers**: Each light shows a geometric representation for easy selection
  - Point lights shown as spheres
  - Spot lights shown as wireframe cones
  - Directional lights shown as planes with arrows
 - Hemisphere lights shown as split-color hemispheres
  - Ambient lights have no visual helper (they affect the entire scene)

- **Light Selection & Dragging**: Click lights to select, drag to reposition
  - Drag normally: Move in XY plane relative to camera
  - Ctrl + Drag: Move along Z axis (depth)

- **Dynamic Properties Panel**: Edit active light properties in real-time
  - Color picker for light color
  - Intensity slider
  - Distance and decay (point/spot)
  - Cone angle and penumbra (spot)
  - Sky and ground colors (hemisphere)

- **Spatial Inspector**: Lower-right schematic visualization showing:
  - Point light: Concentric circles representing attenuation range
  - Spot light: Cone diagram with angle visualization
  - Directional light: Parallel rays showing direction
  - Hemisphere light: Sky/ground dome representation
  - Ambient light: Radial pattern indicating omnidirectional effect

- **Test Objects**: Add sphere and cube meshes with Lambert material to see lighting effects

- **Duplicate & Delete**: Clone lights with matching properties or remove selected lights

## Controls

### Camera Controls
- **Left Mouse Drag**: Rotate camera around scene
- **Right Mouse Drag**: Pan camera
- **Mouse Wheel**: Zoom in/out

### Light Controls
- **Click Light Helper**: Select light (updates properties panel and spatial inspector)
- **Drag Selected Light**: Move light position
  - Normal drag: Move in XY plane (relative to camera view)
  - **Ctrl + Drag**: Move along Z axis (depth)
- **Click Empty Space**: Deselect current light

### Property Editing
When a light is selected, the properties panel shows:
- **Color**: Interactive color picker
- **Intensity**: Slider control (range varies by light type)
- **Distance**: Maximum effective range (point and spot lights)
- **Decay**: Attenuation model - 0=constant, 1=linear, 2=inverse square (point and spot)
- **Angle**: Cone spread angle (spot lights)
- **Penumbra**: Soft edge falloff 0-1 (spot lights)
- **Sky/Ground Color**: Dual color pickers (hemisphere lights)

### UI Buttons

**Add Lights:**
- **+ Point Light**: Create omnidirectional point light
- **+ Spot Light**: Create directional cone light
- **+ Directional Light**: Create parallel ray light (sunlight)
- **+ Hemisphere Light**: Create sky/ground ambient dome
- **+ Ambient Light**: Create uniform scene illumination

**Test Objects:**
- **Add Sphere**: Spawn Lambert-shaded sphere to visualize lighting
- **Add Cube**: Spawn Lambert-shaded cube to visualize lighting

**Actions:**
- **Clear Lights**: Remove all lights (keeps one ambient for visibility)
- **Clear All**: Remove all lights and objects
- **Duplicate**: Clone selected light with same properties
- **Delete**: Remove selected light

## Technical Details

### Light Helper System
Each light type (except ambient) has a corresponding helper class that creates visual geometry:
- `PointLightHelper`: Small sphere positioned at light location
- `SpotLightHelper`: Wireframe cone showing beam spread
- `DirectionalLightHelper`: Plane with arrow indicators showing ray direction
- `HemisphereLightHelper`: Split-color hemisphere mesh

Helpers are child objects of their lights, automatically following position updates.

### Picking & Selection
Light selection uses the `Raycaster` system to intersect with helper geometry:
```javascript
const intersects = raycaster.intersectObjects(lightHelpers, true);
if (intersects.length > 0) {
  const clickedLight = intersects[0].object.light;
  selectLight(clickedLight);
}
```

### Dragging System
Constrained dragging converts screen-space mouse deltas to world-space movement:
- Calculates camera's right/up/forward vectors from transformation matrix
- Scales mouse movement by distance and FOV for consistent feel
- Ctrl key switches from XY plane movement to Z-axis movement

### Properties System
Dynamic UI generation creates appropriate controls for each light type:
```javascript
function createRangeProperty(label, value, min, max, step, onChange) {
  // Creates labeled slider with live value display
  // Calls onChange callback on input events
}

function createColorProperty(label, color, onChange) {
  // Creates color picker that converts hex to Color object
}
```

### Spatial Inspector
The schematic canvas uses 2D drawing to visualize 3D light properties:
- **Point lights**: Concentric circles scaled by distance property
- **Spot lights**: Triangle/cone with angle-based spread
- **Directional lights**: Parallel lines with arrowheads
- **Hemisphere lights**: Semi-circle with gradient fill
- **Ambient lights**: Radial burst pattern

Redrawn whenever light selection changes or properties update.

### Default Scene Setup
Scene initializes with:
- Dark blue background (#1a1a2e)
- Blender-style grid overlay (red X axis, green Z axis)
- One default ambient light for base visibility
- OrbitControls for camera interaction

## Lighting Best Practices

### Point Lights
- Use `distance` to control effective range (0 = infinite)
- `decay = 2` gives physically accurate inverse-square falloff
- Position above objects for natural lighting

### Spot Lights
- `angle` controls cone spread (radians, try π/6 to π/4)
- `penumbra` adds soft edges (0 = hard, 1 = very soft)
- `target` Object3D determines aim direction
- Good for flashlights, stage lights, focused illumination

### Directional Lights
- Simulates distant light source (sun, moon)
- Position doesn't affect illumination, only direction matters
- `target` Vector3 determines ray direction
- Excellent for outdoor scenes and consistent shadows

### Hemisphere Lights
- `color` (sky) illuminates surfaces facing up
- `groundColor` illuminates surfaces facing down
- Creates natural outdoor ambient lighting
- Lower intensity than other lights (try 0.4-0.6)

### Ambient Lights
- Provides uniform base illumination
- Prevents completely black shadows
- Use low intensity (0.2-0.5) to preserve contrast
- Not physically accurate but improves visual quality

### Performance Tips
- Limit point and spot lights (expensive per-fragment calculations)
- Use directional lights for primary illumination
- Combine directional + hemisphere + low ambient for efficient outdoor scenes
- Reduce light `distance` to minimize affected fragments

## Code Structure

### Main Data Structures
```javascript
let lights = [];           // Array of all Light objects
let lightHelpers = [];     // Array of all LightHelper meshes
let selectedLight = null;  // Currently selected light
let lightCounter = {};     // Naming counter per light type
```

### Key Functions
- `addLight(type)`: Creates light, helper, adds to scene
- `selectLight(light)`: Updates selection state and UI
- `updatePropertiesPanel()`: Rebuilds property controls for selected light
- `drawSchematic()`: Renders spatial inspector canvas
- `duplicateLight()`: Clones selected light with same properties
- `deleteLight()`: Removes light, helper, and updates UI

### Update Loop
```javascript
function animate() {
  controls.update();
  
  // Update all light helpers to match light state
  lightHelpers.forEach(helper => {
    if (helper.update) helper.update();
  });
  
  renderer.render(scene, camera);
}
```

## Extending the Example

### Add New Light Type
1. Create light class extending `Light` in `src/lights/`
2. Create corresponding helper class in `src/extras/helpers/`
3. Add creation case in `addLight()` switch statement
4. Add property controls in `updatePropertiesPanel()`
5. Add schematic visualization in `drawSchematic()`
6. Export new classes from `src/index.js`

### Add Target Editing Mode
To make spot/directional light targets draggable:
1. Create small sphere meshes for target visualization
2. Add target meshes to pickable objects array
3. Detect target mesh intersection in `onMouseDown()`
4. Update light properties when target dragged
5. Redraw helper geometry on target update

### Add Light Animation
```javascript
// In animate() loop
lights.forEach(light => {
  if (light.userData.animate) {
    light.position.y = 3 + Math.sin(Date.now() * 0.001) * 2;
  }
});
```

### Save/Load Light Setups
```javascript
function exportLightSetup() {
  return lights.map(light => ({
    type: light.userData.type,
    position: light.position.toArray(),
    color: light.color.getHex(),
    intensity: light.intensity,
    // ... other properties
  }));
}
```

## Related Examples
- **Grid Gizmo**: Object picking and constrained dragging patterns
- **Textured**: Grid overlay visualization
- **Multi Camera**: Multiple viewport rendering with different lighting

## Further Reading
- [DEVELOPER-REFERENCE.md](../../DEVELOPER-REFERENCE.md) - Complete BangBang3D API documentation
- [QUICKSTART.md](../../QUICKSTART.md) - Getting started guide with lighting examples
- Light classes: `src/lights/` directory
- Helper classes: `src/extras/helpers/` directory
