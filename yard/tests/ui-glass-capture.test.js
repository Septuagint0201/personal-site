import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createFramePacer } from '../src/frame-pacing.js';

const source = readFileSync(new URL('../src/ui-glass.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?$/gm, '').replaceAll('export ', '');

function setup() {
  let now = 0, id = 0, observer;
  const timers = new Map(), frames = new Map(), copies = [], presented = [];
  function element(kind) {
    const node = { width: 300, height: 150, dataset: {}, style: { setProperty() {} },
      classList: { toggle() {}, remove() {} }, setAttribute() {}, append() {}, remove() {} };
    if (kind === 'canvas') node.getContext = () => ({ drawImage(source) {
      node.storedFrame = source.frame;
      copies.push({ time: now, frame: source.frame, width: node.width, height: node.height });
    } });
    return node;
  }
  const document = { body: element('body'), documentElement: element('html'), hidden: false,
    createElement: element, querySelectorAll: () => [], querySelector: () => null,
    addEventListener() {}, removeEventListener() {} };
  class Renderer {
    constructor(stage, options) { this.options = options; this.ready = true; this.failed = false; }
    refreshBackground() { this.options.paintBackground({ drawImage: source => presented.push(source.storedFrame) }, 800, 600); }
    request() {} renderNow() {} resize() {} dispose() {}
  }
  const scope = { document, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
    window: { SiteGlassPreset: { revision: 'test', profile: { radius: 70 } },
      SiteSurfaceButtons: { applyTheme() {}, classify: nodes => nodes }, LiquidGlass: { Renderer },
      addEventListener() {}, removeEventListener() {} },
    performance: { now: () => now }, createFramePacer,
    MutationObserver: class { constructor(callback) { observer = callback; } observe() {} disconnect() {} },
    requestAnimationFrame(callback) { frames.set(++id, callback); return id; }, cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(callback, delay) { timers.set(++id, { callback, due: now + delay }); return id; }, clearTimeout(id) { timers.delete(id); },
  };
  vm.runInNewContext(source, scope);
  const ui = scope.createUIGlass();
  const canvas = { width: 800, height: 600, frame: 0 };
  return { ui, copies, presented, frames, timers, canvas, scope,
    advance(time) {
      now = time;
      for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.callback(); }
      for (const [id, callback] of [...frames]) { frames.delete(id); callback(now); }
    },
    capture(frame, continuous = true, version) { canvas.frame = frame; ui.capture(canvas, version, continuous); },
    mutate(oldValue, value) { observer([{ oldValue, attributeName: 'hidden', target: { getAttribute: () => value } }]); },
  };
}

test('continuous scene snapshots stay at 30Hz across high refresh rates', () => {
  for (const refresh of [60, 90, 120, 144, 240]) {
    const run = setup();
    for (let frame = 0; frame < refresh * 2; frame++) { run.advance(frame * 1000 / refresh); run.capture(frame); }
    assert.equal(run.copies.length, 60, `${refresh}Hz scene`);
  }
});

test('the last scene frame is retained before its WebGL buffer is discarded', () => {
  const run = setup();
  run.capture(1);
  run.advance(10); run.capture(2);
  assert.equal(run.copies.length, 1);
  run.advance(16); run.capture(3, false);
  run.canvas.frame = 0; // Browser clears a non-preserved drawing buffer.
  run.advance(34);
  assert.equal(run.copies.length, 2);
  assert.deepEqual(run.presented, [1, 3]);
  assert.equal(run.timers.size, 0);
});

test('resize and source replacement capture immediately inside the normal budget', () => {
  const run = setup(); run.capture(1);
  run.advance(5); run.scope.innerWidth = 400; run.capture(2);
  assert.equal(run.copies.at(-1).width, 400);
  run.advance(6); run.ui.capture({ width: 800, height: 600, frame: 3 }, undefined, true);
  assert.deepEqual(run.copies.map(copy => copy.frame), [1, 2, 3]);
  run.advance(34); assert.equal(run.presented.at(-1), 3);
});

test('skipped source versions can still be captured when the next slot arrives', () => {
  const run = setup(); run.capture(1, true, 1);
  run.advance(10); run.capture(2, true, 2);
  run.advance(34); run.capture(2, true, 2);
  run.advance(68); run.capture(2, true, 2);
  assert.deepEqual(run.copies.map(copy => copy.frame), [1, 2]);
});

test('single-frame callers retain the existing final-frame behavior', () => {
  const run = setup();
  run.capture(1, false); run.advance(10); run.capture(2, false); run.advance(20); run.capture(3, false);
  run.advance(34);
  assert.deepEqual(run.copies.map(copy => copy.frame), [1, 2, 3]);
  assert.deepEqual(run.presented, [1, 3]);
});

test('hidden or disposed scenes cannot queue copies, and resume has no catch-up burst', () => {
  const run = setup(); run.capture(1);
  run.scope.document.hidden = true; run.advance(20); run.capture(2);
  run.scope.document.hidden = false; run.advance(10000); run.capture(3);
  run.advance(10001); run.capture(4);
  assert.deepEqual(run.copies.map(copy => copy.frame), [1, 3]);
  run.ui.dispose(); run.advance(10040); run.capture(5);
  assert.equal(run.copies.length, 2);
  assert.equal(run.timers.size, 0);
});

test('idempotent hidden mutations do not start a continuous interaction redraw', () => {
  const run = setup();
  run.mutate('', ''); run.mutate(null, null);
  assert.equal(run.frames.size, 0);
  run.mutate(null, '');
  assert.equal(run.frames.size, 1);
});
