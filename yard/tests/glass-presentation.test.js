import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../liquid-glass.js', import.meta.url), 'utf8');
function setup(overlay = false, parallel = false) {
  const counts = { uploads: 0, draws: 0, linkChecks: 0, shaderDeletes: 0, programDeletes: 0 }, uniforms = {}, pending = new Map(), listeners = {}, documentListeners = {};
  const bounds = { left: 0, top: 0, width: 320.4, height: 600.25 };
  let top = 80, frame = 0, now = 0, attributes, complete = !parallel, linked = true, framebufferComplete = true;
  const statuses = [];
  const classes = { add() {}, remove() {} };
  const style = { removeProperty(name) { delete this[name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]; } };
  const context = { setTransform() {}, drawImage() {} };
  const gl = new Proxy({
    getParameter: () => 8192,
    getExtension: () => parallel ? { COMPLETION_STATUS_KHR: 'complete' } : null,
    getShaderParameter() { assert.fail('individual shader status can stall the main thread'); },
    getProgramParameter(_, parameter) {
      if (parameter === 'complete') return complete;
      counts.linkChecks++;
      assert.ok(complete, 'link validation must wait for completion');
      return linked;
    },
    getProgramInfoLog: () => 'test link failure', getShaderInfoLog: () => '',
    deleteShader() { counts.shaderDeletes++; }, deleteProgram(program) { if (program) counts.programDeletes++; },
    getAttribLocation: () => 0, getUniformLocation: (_, name) => name,
    checkFramebufferStatus: () => framebufferComplete ? 'FRAMEBUFFER_COMPLETE' : 'FRAMEBUFFER_UNSUPPORTED',
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
    removeEventListener(type) { delete listeners[type]; },
  };
  const scene = { style, classList: classes, dataset: {}, querySelector: () => canvas,
    getBoundingClientRect: () => ({ ...bounds }), clientWidth: 320, clientHeight: 600 };
  const surface = { dataset: { radius: '30' }, offsetWidth: 160,
    parentElement: { closest: () => null }, hasAttribute: () => false, contains: () => false,
    getBoundingClientRect: () => ({ left: 30, right: 190, top, bottom: top + 300, width: 160, height: 300 }) };
  const scope = {
    window: { devicePixelRatio: 2 }, document: { hidden: false,
      addEventListener(type, callback) { documentListeners[type] = callback; },
      removeEventListener(type) { delete documentListeners[type]; },
      createElement: () => ({ width: 0, height: 0, getContext: () => context, toDataURL: () => 'data:image/png;base64,AA==' }) },
    ResizeObserver: class { observe() {} disconnect() {} },
    performance: { now: () => now },
    requestAnimationFrame(callback) { pending.set(++frame, callback); return frame; },
    cancelAnimationFrame(id) { pending.delete(id); }, console: { warn() {} },
  };
  vm.runInNewContext(source, scope);
  const renderer = new scope.window.LiquidGlass.Renderer(scene, {
    overlay, scissorSurfaces: true, maxDpr: 2, maxPixels: 1600000,
    getSurfaces: () => [surface], paintBackground() {},
    onStatus: instance => statuses.push({ ready: instance.ready, failed: instance.failed }),
    getState: () => ({ material: { ior: 1.45, thickness: 6, roughness: 1.5, dispersion: .1, tint: .15 } }),
  });
  renderer.resize(); renderer.renderNow();
  return { renderer, canvas, counts, uniforms, pending, listeners, documentListeners, scene, bounds, statuses,
    finish(success = true) { complete = true; linked = success; },
    failFramebuffer() { framebufferComplete = false; },
    advance(ms) { now += ms; },
    lose() { listeners.webglcontextlost({ preventDefault() {} }); complete = false; },
    hide(hidden) { scope.document.hidden = hidden; documentListeners.visibilitychange(); },
    tick() { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback()); },
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

test('parallel preparation yields without link checks, uploads or a premature ready notification', () => {
  const t = setup(false, true);
  assert.equal(t.renderer.ready, false);
  for (let i = 0; i < 3; i++) { t.renderer.refreshBackground(); t.renderer.renderNow(); t.tick(); }
  assert.equal(t.counts.linkChecks, 0);
  assert.equal(t.counts.uploads, 0);
  assert.equal(t.counts.draws, 0);
  assert.equal(t.pending.size, 1);
  assert.deepEqual(t.statuses, []);
  t.finish(); t.tick();
  assert.equal(t.renderer.ready, true);
  assert.equal(t.counts.linkChecks, 1);
  assert.ok(t.counts.uploads > 0 && t.counts.draws > 0);
  assert.deepEqual(t.statuses, [{ ready: true, failed: false }]);
});

test('a hidden pending compositor resumes even when its scene has no animation loop', () => {
  const t = setup(true, true);
  t.hide(true);
  t.advance(120000);
  assert.equal(t.pending.size, 0);
  t.finish(); t.renderer.request();
  assert.equal(t.pending.size, 0);
  t.hide(false); t.tick();
  assert.equal(t.renderer.ready, true);
  assert.ok(t.counts.draws > 0);
});

test('a genuinely stalled link stops polling and retains fallback', () => {
  const t = setup(false, true);
  t.advance(90001); t.tick();
  assert.equal(t.renderer.failed, true);
  assert.equal(t.pending.size, 0);
  assert.equal(t.counts.linkChecks, 0);
  assert.equal(t.counts.programDeletes, 1);
  assert.match(t.scene.style.backgroundImage, /^url\(data:image/);
});

test('resizes during linking upload only the latest viewport dimensions', () => {
  const t = setup(false, true);
  t.bounds.width = 600; t.bounds.height = 400; t.renderer.resize();
  t.bounds.width = 400; t.bounds.height = 600; t.renderer.resize();
  assert.equal(t.counts.uploads, 0);
  t.finish(); t.tick();
  assert.equal(t.renderer.textureWidth, t.canvas.width);
  assert.equal(t.renderer.textureHeight, t.canvas.height);
  assert.deepEqual(t.uniforms.u_resolution, [400, 600]);
  assert.equal(t.counts.uploads, 3);
});

test('a failed link frees pending objects and keeps fallback without polling forever', () => {
  const t = setup(false, true);
  t.finish(false); t.tick();
  assert.equal(t.renderer.ready, false);
  assert.equal(t.renderer.failed, true);
  assert.equal(t.pending.size, 0);
  assert.equal(t.counts.shaderDeletes, 2);
  assert.equal(t.counts.programDeletes, 1);
  assert.equal(t.counts.draws, 0);
  assert.match(t.scene.style.backgroundImage, /^url\(data:image/);
  assert.deepEqual(t.statuses, [{ ready: false, failed: true }]);
});

test('framebuffer allocation failure after linking does not publish an unusable optical layer', () => {
  const t = setup(false, true);
  t.failFramebuffer(); t.finish(); t.tick();
  assert.equal(t.renderer.ready, false);
  assert.equal(t.renderer.failed, true);
  assert.equal(t.counts.draws, 0);
  assert.equal(t.pending.size, 0);
  assert.match(t.scene.style.backgroundImage, /^url\(data:image/);
  assert.deepEqual(t.statuses.at(-1), { ready: false, failed: true });
});

test('attached presentation stops before uploading to an invalid framebuffer', () => {
  const t = setup();
  const sourceVersion = t.renderer.sourceVersion;
  t.failFramebuffer(); t.renderer.targetWidth = 0;
  const view = t.renderer.prepareAttachedFrame(t.bounds, [], { thickness: 6, roughness: 1.5 });
  assert.equal(view, null);
  assert.equal(t.renderer.failed, true);
  assert.equal(t.renderer.sourceVersion, sourceVersion);
});

test('context restoration keeps its fallback until the replacement program completes', () => {
  const t = setup(true, true);
  t.finish(); t.tick(); t.lose();
  t.listeners.webglcontextrestored();
  assert.equal(t.renderer.ready, false);
  assert.match(t.scene.style.backgroundImage, /^url\(data:image/);
  const before = t.counts.draws;
  t.tick(); assert.equal(t.counts.draws, before);
  t.finish(); t.tick();
  assert.equal(t.renderer.ready, true);
  assert.equal(t.scene.style.backgroundImage, undefined);
  assert.ok(t.counts.draws > before);
});

test('disposing a pending program removes lifecycle listeners and prevents late revival', () => {
  const t = setup(false, true);
  const restored = t.listeners.webglcontextrestored;
  t.renderer.dispose();
  assert.equal(t.pending.size, 0);
  assert.equal(t.counts.shaderDeletes, 2);
  assert.equal(t.counts.programDeletes, 1);
  assert.deepEqual(t.listeners, {});
  assert.deepEqual(t.documentListeners, {});
  const before = { ...t.counts };
  t.finish(); restored(); t.renderer.initialize(); t.renderer.renderNow();
  assert.deepEqual(t.counts, before);
});
