import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const scope = { window: {} };
vm.runInNewContext(readFileSync(new URL('../../liquid-glass.js', import.meta.url), 'utf8'), scope);
vm.runInNewContext(readFileSync(new URL('../../ui-glass-preset.js', import.meta.url), 'utf8'), scope);
const { material, profile } = scope.window.SiteGlassPreset;

// Exercise the actual render dispatch. The browser separately compiles/renders
// the shader; these checks protect the user's existing haze and tint values.
function capture(state) {
  const calls = [], values = {};
  const gl = {};
  for (const name of ['useProgram', 'viewport', 'activeTexture', 'bindFramebuffer', 'bindTexture']) gl[name] = () => {};
  for (const name of ['uniform1i', 'uniform1f', 'uniform2f', 'uniform3f', 'uniform4f'])
    gl[name] = (key, ...args) => { values[key] = args; };
  gl.drawArrays = () => { if (values.rect[2] > 0) calls.push(structuredClone(values)); };
  const outer = { left: 0, top: 0, width: 420, height: 570 };
  const surface = nested => ({ getBoundingClientRect: () => nested ? { left: 28, top: 200, width: 364, height: 44 } : outer,
    parentElement: { closest: () => nested ? {} : null }, hasAttribute: () => false, dataset: { radius: nested ? 14 : 36 } });
  const renderer = Object.create(scope.window.LiquidGlass.Renderer.prototype);
  Object.assign(renderer, { gl, width: 640, height: 720, dpr: 1, light: [0, 0],
    canvas: { width: 640, height: 720 }, element: { getBoundingClientRect: () => outer, dataset: {} },
    targets: [{ texture: 1, framebuffer: 1 }, { texture: 2, framebuffer: 2 }], sourceTexture: 0,
    options: { getState: () => state, getSurfaces: () => [surface(false), surface(true)] },
    uniforms: Object.fromEntries(['texture', 'resolution', 'dpr', 'dark', 'invert', 'profile', 'curve', 'section', 'enabled', 'light', 'lens', 'rect', 'radius', 'corners', 'surface', 'material', 'tint'].map(key => [key, key])) });
  renderer.render();
  return calls;
}

test('homepage trial applies one thickness profile while preserving per-control haze and tint', () => {
  const [card, button] = capture({ material, profile, invertedTint: true, edgeProfile: 'soft', refraction: true });
  for (const draw of [card, button]) {
    assert.deepEqual(draw.profile, [3]);
    assert.deepEqual(draw.curve, [67.68, .18, .438, 3]);
    assert.deepEqual(draw.section, [1, 384]);
    assert.deepEqual(draw.corners, [-1, -1, -1, -1]);
    assert.equal(draw.material[0], 1.45);
    assert.equal(draw.material[1], 6);
    assert.equal(draw.material[3], .10);
    assert.deepEqual(draw.invert, [1]);
  }
  assert.equal(card.material[2], 1.5); assert.equal(card.tint[0], .15);
  assert.equal(button.material[2], 1.5 * .45); assert.equal(button.tint[0], .15 * .65);
});

test('detached close pocket keeps a corner larger than half-width and fits CSS edge sums', () => {
  const fit = scope.window.LiquidGlass.fitCornerRadii;
  assert.deepEqual(Array.from(fit([70, 176, 70, 70], 282, 600)), [70, 176, 70, 70]);
  const radius = 176, buttonRadius = 22, centreInset = 28;
  const clearance = Math.SQRT2 * (radius - centreInset) - radius - buttonRadius;
  assert.ok(clearance > 10, 'the separate close button has a real gap to the card');
  const fitted = Array.from(fit([70, 176, 70, 70], 220, 180));
  assert.ok(fitted[0] + fitted[1] <= 220 && fitted[2] + fitted[3] <= 220);
  assert.ok(fitted[0] + fitted[3] <= 180 && fitted[1] + fitted[2] <= 180);
  assert.ok(fitted.every((r, i) => Math.abs(r / [70, 176, 70, 70][i] - fitted[0] / 70) < 1e-10));
});

test('other labs keep the legacy material path unless an explicit profile is supplied', () => {
  const [card, button] = capture({ material, invertedTint: true, edgeProfile: 'soft' });
  assert.deepEqual(card.profile, [2]); assert.deepEqual(button.profile, [2]);
  assert.equal(card.material[1], 6); assert.equal(button.material[1], 6 * .42);
  assert.equal(button.material[2], 1.5 * .45); assert.equal(button.tint[0], .15 * .65);
});
