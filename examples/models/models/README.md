# Models Directory

Place your Wavefront OBJ and MTL model files in this directory.

## File Structure

```
models/
  ├── modelname.obj      # Geometry file
  ├── modelname.mtl      # Material library (optional)
  └── texture.png        # Texture images referenced by MTL
```

## Supported Formats

### OBJ Files
- Vertices (v)
- Texture coordinates (vt)
- Normals (vn)
- Faces (f) - triangles and quads
- Material references (usemtl)
- Material library (mtllib)
- Object/group names (o/g)

### MTL Files
- Material name (newmtl)
- Ambient color (Ka)
- Diffuse color (Kd)
- Specular color (Ks)
- Specular exponent (Ns)
- Transparency (d/Tr)
- Diffuse texture (map_Kd)
- Ambient texture (map_Ka)

## Adding Models to the Viewer

1. Place your .obj and .mtl files in this directory
2. Place any texture files referenced by the MTL in this directory
3. Edit `../main.js` and update the `AVAILABLE_MODELS` array:

```javascript
const AVAILABLE_MODELS = [
  {
    name: 'My Model',
    obj: 'mymodel.obj',
    mtl: 'mymodel.mtl',  // or null if no materials
    description: 'Description of the model'
  },
  // ... add more models
];
```

## Example Model Sources

Free OBJ models can be found at:
- https://free3d.com/3d-models/obj
- https://www.turbosquid.com/Search/3D-Models/free/obj
- https://sketchfab.com/3d-models?features=downloadable&sort_by=-likeCount

## Notes

- Models are automatically centered and scaled to fit a 3-unit target size
- The lowest point of the model will be positioned just above the ground plane
- Textures must be in formats supported by the browser (PNG, JPG, GIF, etc.)
- Large models may impact CPU rendering performance
