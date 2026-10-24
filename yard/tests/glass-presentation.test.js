import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../liquid-glass.js', import.meta.url), 'utf8');
function setup(overlay = false) {
  const counts = { uploads: 0, draws: 0 }, uniforms = {}, pending = new Map(), listeners = {};
  const bounds = { left: 0, top: 0, width: 320.4, height: 600.25 };
  let top = 80, frame = 0, attributes;
  const classes = { add() {}, remove() {} };
  const style = { removeProperty(name) { delete this[name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]; } };
  const context = { setTransform() {}, drawImage() {} };
  const gl = new Proxy({
    getParameter: () => 8192, getShaderParameter: () => true, getProgramParameter: () => true,
    getAttribLocation: () => 0, getUniformLocation: (_, name) => name,
    checkFramebufferStatus: () => 'FRAMEBUFFER_COMPLETE',
    texImage2D() { counts.uploads++; }, texSubImage2D() { counts.uploads++; },
    drawArrays() { counts.draws++; },
  }, { get(target, name) {
    if (name in target) return target[name];
    if (name.startsWith('create')) return () => ({});
    if (name.startsWith('uniform')) return (key, ...values) => { uniforms[key] = values; };
    return /^[A-Z_0-9]+$/.test(name) ? name : () => {};
  } });
  const canvas = { width: 0, height: 0,
    getContext(type, options) { attributes = options; return gl; },
    addEventListener(type, callback) { listeners[type] = callback; },
  };
  const scene = { style, classList: classes, dataset: {}, querySelector: () => canvas,
    getBoundingClientRect: () => ({ ...bounds }), clientWidth: 320, clientHeight: 600 };
  const surface = { dataset: { radius: '30' }, offsetWidth: 160,
    parentElement: { closest: () => null }, hasAttribute: () => false, contains: () => false,
    getBoundingClientRect: () => ({ left: 30, right: 190, top, bottom: top + 300, width: 160, height: 300 }) };
  const scope = {
    window: { devicePixelRatio: 2 }, document: { hidden: false,
      createElement: () => ({ width: 0, height: 0, getContext: () => context, toDataURL: () => 'data:image/png;base64,AA==' }) },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame(callback) { pending.set(++frame, callback); return frame; },
    cancelAnimationFrame(id) { pending.delete(id); }, console,
  };
  vm.runInNewContext(source, scope);
  const renderer = new scope.window.LiquidGlass.Renderer(scene, {
    overlay, scissorSurfaces: true, maxDpr: 2, maxPixels: 1600000,
    getSurfaces: () => [surface], paintBackground() {},
    getState: () => ({ material: { ior: 1.45, thickness: 6, roughness: 1.5, dispersion: .1, tint: .15 } }),
  });
  renderer.resize(); renderer.renderNow();
  return { renderer, canvas, counts, uniforms, pending, listeners, scene, bounds,
    attributes: () => attributes, move(y) { top = y; } };
}

test('scroll redraw keeps source texture and viewport capacity, cancelling a queued duplicate frame', () => {
  const t = setup(), before = { uploads: t.counts.uploads, version: t.renderer.sourceVersion,
    width: t.canvas.width, height: t.canvas.height, frames: t.renderer.renderCount };
  for (const y of [-450, 120, -200, 80]) { t.move(y); t.renderer.request(); t.renderer.renderNow(); }
  assert.equal(t.pending.size, 0);
  assert.equal(t.counts.uploads, before.uploads);
  assert.equal(t.renderer.sourceVersion, before.version);
  assert.equal(t.canvas.width, before.width); assert.equal(t.canvas.height, before.height);
  assert.equal(t.renderer.renderCount, before.frames + 4);
  assert.equal(t.renderer.layers.size, 0);
  assert.equal(t.renderer.view.top, 0);
});

test('fractional viewport coordinates use the actual per-axis drawing-buffer scale', () => {
  const t = setup();
  assert.deepEqual(t.uniforms.u_resolution, [t.bounds.width, t.bounds.height]);
  assert.deepEqual(t.uniforms.u_pixelScale, [t.canvas.width / t.bounds.width, t.canvas.height / t.bounds.height]);
});

test('transparent viewport restores without a stale opaque fallback snapshot', () => {
  const t = setup(true);
  assert.equal(t.attributes().alpha, true);
  t.listeners.webglcontextlost({ preventDefault() {} });
  assert.match(t.scene.style.backgroundImage, /^url\(data:image/);
  t.listeners.webglcontextrestored();
  assert.equal(t.renderer.failed, false);
  assert.equal(t.scene.style.backgroundImage, undefined);
  assert.equal(t.scene.style.backgroundSize, undefined);
});

test('disposed compositors cannot submit deferred draws or allocate textures', () => {
  const t = setup(); t.renderer.request(); t.renderer.dispose();
  const before = { ...t.counts };
  t.renderer.renderNow(); t.renderer.request(); t.renderer.resize(); t.renderer.refreshBackground();
  assert.deepEqual(t.counts, before);
  assert.equal(t.pending.size, 0);
});
