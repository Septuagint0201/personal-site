import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiquidRenderer } from '../src/chapter02-renderer.js';

function setup(t, { parallel = true } = {}) {
  let now = 0, nextFrame = 0;
  const frames = new Map(), programs = [], allocations = [], errors = [];
  const constants = new Map();
  const gl = new Proxy({
    getParameter: () => 16384,
    getExtension: name => name === 'KHR_parallel_shader_compile'
      ? parallel && { COMPLETION_STATUS_KHR: 'complete' } : {},
    createProgram() { const program = { complete: !parallel }; programs.push(program); return program; },
    getProgramParameter(program, parameter) {
      if (parameter === 'complete') return program.complete;
      assert.ok(program.complete, 'do not block on link status before completion');
      return true;
    },
    texImage2D: (...args) => allocations.push([args[3], args[4]]),
  }, { get(target, key) {
    if (key in target) return target[key];
    if (/^[A-Z_0-9]+$/.test(key)) {
      if (!constants.has(key)) constants.set(key, key);
      return constants.get(key);
    }
    return () => ({});
  } });
  const document = Object.assign(new EventTarget(), { hidden: false });
  const canvas = Object.assign(new EventTarget(), {
    dataset: {}, width: 300, height: 150, getContext: () => gl,
    getBoundingClientRect: () => ({ width: 1280, height: 720 }),
  });
  const values = {
    document, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }),
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  const descriptors = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  t.mock.method(performance, 'now', () => now);
  let ready = 0;
  const renderer = createLiquidRenderer(canvas, { onReady: () => ready++, onError: error => errors.push(error) });
  t.after(() => {
    renderer.dispose();
    for (const [key, descriptor] of descriptors)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  });
  return {
    renderer, programs, allocations, errors, document, canvas,
    get ready() { return ready; },
    tick(time) {
      now = time;
      const pending = [...frames.values()]; frames.clear();
      pending.forEach(fn => fn(time));
    },
  };
}

test('preparing coalesces quality changes and allocates only the final HDR resolution', t => {
  const run = setup(t);
  run.renderer.setQuality('ultra');
  run.renderer.setQuality('high');
  run.tick(16);
  assert.equal(run.ready, 0);
  assert.deepEqual(run.allocations, []);
  run.programs.forEach(program => { program.complete = true; });
  run.tick(32);
  assert.equal(run.ready, 1);
  assert.deepEqual(run.errors, []);
  assert.deepEqual(run.allocations, [[1280,720],[1280,720],[1280,720],[1280,720],
    [640,360],[320,180],[160,90],[80,45]]);
});

test('a completed compilation survives returning after the wall-clock timeout', t => {
  const run = setup(t);
  run.document.hidden = true;
  run.document.dispatchEvent(new Event('visibilitychange'));
  run.programs.forEach(program => { program.complete = true; });
  run.document.hidden = false;
  run.document.dispatchEvent(new Event('visibilitychange'));
  run.tick(120000);
  assert.equal(run.ready, 1);
  assert.deepEqual(run.errors, []);
});

test('a genuinely stalled program still reports the preparation timeout', t => {
  const run = setup(t);
  run.tick(90001);
  assert.equal(run.ready, 0);
  assert.match(run.errors[0].message, /could not finish preparing/);
  assert.deepEqual(run.allocations, []);
});

test('drivers without parallel compilation retain the synchronous fallback', t => {
  const run = setup(t, { parallel: false });
  run.tick(16);
  assert.equal(run.ready, 1);
  assert.deepEqual(run.errors, []);
  assert.equal(run.allocations.length, 8);
});

test('restoring a graphics context prepares again before reallocating', t => {
  const run = setup(t);
  run.programs.forEach(program => { program.complete = true; });
  run.tick(16);
  run.canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  run.canvas.dispatchEvent(new Event('webglcontextrestored'));
  run.tick(32);
  assert.equal(run.ready, 1);
  assert.equal(run.allocations.length, 8);
  run.programs.forEach(program => { program.complete = true; });
  run.tick(48);
  assert.equal(run.ready, 2);
  assert.equal(run.allocations.length, 16);
});
