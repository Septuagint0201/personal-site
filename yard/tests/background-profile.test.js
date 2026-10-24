import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../depth-background.js', import.meta.url), 'utf8');
const profile = { kind: 'hyperbolic', shoulder: 67.68, edge: .18, bias: .438, exponent: 3, front: 1, radius: 70 };
const material = { thickness: 6, ior: 1.45, dispersion: .10, roughness: 1.5, tint: .15 };
const settings = { mode: 1, tilt: 15, depth: 31, shine: 48, dark: false, composition: 1, profile, material };

function setup() {
  const values = {}, counts = { draws: 0, copies: 0 }, listeners = {};
  const gl = {};
  for (const name of ['createShader', 'createProgram', 'createBuffer', 'createTexture']) gl[name] = () => ({});
  for (const name of ['shaderSource', 'compileShader', 'attachShader', 'linkProgram', 'deleteShader', 'useProgram',
    'bindBuffer', 'bufferData', 'enableVertexAttribArray', 'vertexAttribPointer', 'bindTexture', 'texParameteri',
    'texImage2D', 'pixelStorei', 'viewport', 'activeTexture']) gl[name] = () => {};
  gl.getShaderParameter = gl.getProgramParameter = () => true;
  gl.getAttribLocation = () => 0;
  gl.getUniformLocation = (_, name) => name;
  for (const name of ['uniform1i', 'uniform1f', 'uniform2f', 'uniform4f'])
    gl[name] = (key, ...args) => { values[key] = args; };
  gl.drawArrays = () => { counts.draws++; };
  const canvas = { getContext: () => gl, addEventListener: (type, listener) => { listeners[type] = listener; } };
  class ImageStub extends EventTarget {
    getAttribute(name) { return name === 'src' ? this.src || null : null; }
  }
  const scope = { window: { devicePixelRatio: 1 }, document: { createElement: () => canvas }, Image: ImageStub, console, queueMicrotask };
  vm.runInNewContext(source, scope);
  const renderer = scope.window.DepthBackground.createRenderer();
  const context = { drawImage: () => { counts.copies++; } };
  return { renderer, values, counts, listeners,
    paint(state = settings, camera = { x: 0, y: 0 }) { renderer.paint(context, 1280, 720, state, camera); } };
}

test('background shares the approved profile in 3D units and keeps its composition settings', () => {
  const t = setup(); t.paint();
  assert.deepEqual(t.values.u_profileEnabled, [1]);
  assert.deepEqual(t.values.u_curve, [67.68 / 160, .18, .438, 3]);
  assert.deepEqual(t.values.u_section, [6 / 160, 1, 1.45, .10]);
  assert.deepEqual(t.values.u_profileRadius, [70 / 160]);
  assert.deepEqual(t.values.u_depth, [31]);
  assert.deepEqual(t.values.u_shine, [.48]);
  assert.deepEqual(t.values.u_composition, [1]);
  assert.equal(t.counts.draws, 1);
  t.paint();
  assert.equal(t.counts.draws, 1, 'a stationary leaf reuses the cached background');
  assert.equal(t.counts.copies, 2);
  t.paint({ ...settings, material: { ...material, roughness: 5, tint: .8 } });
  assert.equal(t.counts.draws, 1, 'foreground haze/tint never replace the original background treatment');
});

test('shape and optical changes invalidate the cache while the legacy Depth Lab remains opt-in', () => {
  const t = setup(); t.paint();
  for (const [key, value] of [['shoulder', 50], ['bias', .6], ['front', .7], ['edge', .25], ['exponent', 4], ['radius', 100]])
    t.paint({ ...settings, profile: { ...profile, [key]: value } });
  for (const [key, value] of [['thickness', 80], ['ior', 2], ['dispersion', .2]])
    t.paint({ ...settings, material: { ...material, [key]: value } });
  assert.equal(t.counts.draws, 10);
  t.paint({ ...settings, profile: undefined, material: undefined });
  assert.deepEqual(t.values.u_profileEnabled, [0]);
  assert.deepEqual(t.values.u_profileRadius, [-1]);
  assert.equal(t.counts.draws, 11);
  t.listeners.webglcontextlost({ preventDefault() {} });
  t.listeners.webglcontextrestored();
  t.paint();
  assert.deepEqual(t.values.u_profileEnabled, [1]);
  assert.deepEqual(t.values.u_curve, [67.68 / 160, .18, .438, 3]);
  assert.equal(t.renderer.failed, false);
});
