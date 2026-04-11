# Grid Gizmo Demo

Interactive 3D object manipulation demo with Blender-style grid reference.

## Features

- **Infinite Grid Overlay**: Blender-style reference grid with colored axes
  - Red line: X axis
  - Green line: Z axis  
  - Blue axis: Y (vertical, shown by object movement)
  
- **Object Spawning**: Add spheres and cubes to the scene
  
- **Object Selection**: Click objects to select them (highlighted appearance)

- **Constrained Dragging**: Move selected objects along world axes
  - Drag left/right: Move along X axis
  - Drag up/down: Move along Y axis
  - Ctrl + drag up/down: Move along Z axis
  
- **Live Position Display**: Real-time X, Y, Z coordinates of selected object

- **Color Controls**: Adjust grid color and background color interactively

## Controls

### Camera Controls (no object selected)
- **Left Mouse Drag**: Rotate camera around scene
- **Right Mouse Drag**: Pan camera
- **Mouse Wheel**: Zoom in/out

### Object Controls
- **Click Object**: Select object (highlighted)
- **Click Empty Space**: Deselect current object
- **Drag Selected Object**: 
  - Move mouse left/right → object moves along world X axis
  - Move mouse up/down → object moves along world Y axis  
  - Hold **Ctrl** and move up/down → object moves along world Z axis (depth)

### UI Buttons
- **Add Sphere**: Spawn a new sphere at random position
- **Add Cube**: Spawn a new cube at random position
- **Clear All**: Remove all spawned objects (confirmation required)
- **Grid Color**: Color picker for grid lines
- **Background**: Color picker for scene background

## Technical Details

### Grid Implementation
The grid system is implemented using the same `GridOverlay` class as the textured example:
- Infinite-feeling grid with horizon fade
- Shader-based rendering (GPU) and procedural rendering (CPU)
- Grid lines visible at 135,135,135 RGB
- Grid spacing: 1.0 units

### Object Picking
Uses the new `Raycaster` utility class for ray-triangle intersection:
- Möller–Trumbore algorithm for triangle intersection
- Transforms rays to object local space
- Returns intersection point and distance

### Dragging System
- Calculates world-space movement from screen-space mouse delta
- Accounts for camera distance and FOV for consistent feel at all zoom levels
- Uses camera's local right/up/forward vectors for axis-aligned movement
- Disables orbit controls during drag to prevent conflicts

## Running the Demo

Open `index.html` in a web browser. The demo will automatically initialize with WebGPU (falls back to WebGL2 if unavailable).

## Code Structure

- **Scene Setup**: Camera positioned at (6.85, 10.72, 16.87) for good overview
- **Grid**: Same implementation as textured example, reusing GridOverlay
- **Raycaster**: New engine-level picking system in `src/extras/utils/Raycaster.js`
- **Selection**: Visual feedback via color tint (50% blend toward white)
- **Object Management**: Array tracking all spawned objects, counter for naming

## Browser Compatibility

- **Chrome 113+**: Full WebGPU support
- **Edge 113+**: Full WebGPU support  
- **Firefox/Safari**: WebGL2 fallback (full feature parity)
