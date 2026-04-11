/**
 * PointCloudShader — renders PointCloud objects as gl.POINTS.
 *
 * Supports:
 *  - per-point colour (uint8 rgb delivered as vec3 attribute)
 *  - fixed or distance-attenuated point size
 *  - optional gamma correction
 *  - MRT outputs for SSR compatibility (non-reflective)
 */
import { Shader } from './Shader.js';

// ─── GLSL vertex ────────────────────────────────────────────────────────────

const GLSL_VERTEX = `#version 300 es
precision highp float;

uniform mat4 uModelViewProjection;
uniform mat4 uModelView;
uniform float uPointSize;
uniform int   uSizeMode; // 0 = fixed, 1 = attenuated
uniform float uCanvasHeight;

in vec3 aPosition;
in vec3 aColor;  // normalised [0..1]

out vec3 vColor;

void main() {
  vec4 mvPos = uModelView * vec4(aPosition, 1.0);
  gl_Position = uModelViewProjection * vec4(aPosition, 1.0);

  if (uSizeMode == 1) {
    // Attenuated: scale by distance (simple perspective model)
    float dist = -mvPos.z;
    gl_PointSize = uPointSize * (uCanvasHeight * 0.5) / max(dist, 0.5);
  } else {
    gl_PointSize = uPointSize;
  }

  vColor = aColor;
}
`;

// ─── GLSL fragment ──────────────────────────────────────────────────────────

const GLSL_FRAGMENT = `#version 300 es
precision highp float;

in vec3 vColor;
uniform float uOpacity;
uniform int   uGamma; // 1 = apply gamma

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 outNormalSSR;
layout(location = 2) out vec4 outMaterialSSR;

void main() {
  // Circular point sprite (discard corners)
  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  if (dot(cxy, cxy) > 1.0) discard;

  vec3 col = vColor;
  if (uGamma == 1) {
    col = pow(col, vec3(1.0 / 2.2));
  }
  fragColor = vec4(col, uOpacity);

  // SSR: non-reflective
  outNormalSSR   = vec4(0.5, 0.5, 1.0, 1.0);
  outMaterialSSR = vec4(0.0, 1.0, 0.0, 1.0);
}
`;


export class PointCloudShader extends Shader {
  constructor() {
    super(
      { glsl: GLSL_VERTEX },
      { glsl: GLSL_FRAGMENT },
      {}
    );
  }

  compile(api, context) {
    if (api !== 'webgl2') throw new Error('PointCloudShader only supports WebGL2');
    return this._compileWebGL2(context);
  }

  _compileWebGL2(gl) {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, this.vertexSource.glsl);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      throw new Error('PointCloudShader vertex compile:\n' + gl.getShaderInfoLog(vs));
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, this.fragmentSource.glsl);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      throw new Error('PointCloudShader fragment compile:\n' + gl.getShaderInfoLog(fs));
    }

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('PointCloudShader link:\n' + gl.getProgramInfoLog(program));
    }

    // Attributes
    this.attributeLocations.set('aPosition', gl.getAttribLocation(program, 'aPosition'));
    this.attributeLocations.set('aColor',    gl.getAttribLocation(program, 'aColor'));

    // Uniforms
    for (const name of [
      'uModelViewProjection', 'uModelView', 'uPointSize',
      'uSizeMode', 'uCanvasHeight', 'uOpacity', 'uGamma'
    ]) {
      this.uniformLocations.set(name, gl.getUniformLocation(program, name));
    }

    this.compiled = { api: 'webgl2', program, vertexShader: vs, fragmentShader: fs, gl };
    return this.compiled;
  }

  dispose() {
    if (this.compiled && this.compiled.api === 'webgl2') {
      const gl = this.compiled.gl;
      gl.deleteProgram(this.compiled.program);
      gl.deleteShader(this.compiled.vertexShader);
      gl.deleteShader(this.compiled.fragmentShader);
    }
    super.dispose();
  }
}
