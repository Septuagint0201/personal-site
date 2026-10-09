import test from 'node:test';
import assert from 'node:assert/strict';
import { createRingNavigator } from '../src/ring-navigation.js';
import { createRingScroll } from '../src/ring-scroll.js';

function setup(options = {}) {
  const count = options.count || 5;
  const ring = createRingNavigator({ count, reducedMotion: options.reducedMotion,
    stiffness: 92, damping: 18.5 });
  const scroll = createRingScroll({ navigator: ring, count, ...options });
  return { ring, scroll, step: Math.PI * 2 / count,
    wheel: (delta, now, extras = {}) => scroll.wheel({ deltaY: delta, ...extras }, now),
    settle(now) {
      scroll.update(now + 160);
      for (let i = 0; i < 300; i++) ring.update(1 / 60);
    },
  };
}

test('small touchpad deltas move continuously before a card changes, then settle', () => {
  const t = setup();
  t.wheel(10, 0);
  assert.ok(t.ring.targetRotation > 0 && t.ring.targetRotation < t.step);
  assert.equal(t.ring.rotation, 0, 'input must not jump the visible angle');
  t.ring.update(1 / 60);
  assert.ok(t.ring.rotation > 0 && t.ring.rotation < t.ring.targetRotation);
  t.settle(0);
  assert.equal(t.ring.index, 0, 'tiny accidental movements return to the same station');
  assert.equal(t.ring.targetRotation, 0);
});

test('one mouse notch advances one station without a 650 ms lockout', () => {
  const t = setup();
  t.wheel(100, 0);
  t.settle(0);
  assert.equal(t.ring.index, 1);
  assert.equal(t.ring.targetRotation, t.step);
  t.wheel(100, 250);
  t.settle(250);
  assert.equal(t.ring.index, 2);
});

test('native momentum travels through multiple stops and wraps forward', () => {
  const t = setup({ count: 3 });
  let lastTarget = 0;
  for (let i = 0; i < 100; i++) {
    t.wheel(10, i * 16);
    t.ring.update(.016);
    assert.ok(t.ring.targetRotation >= lastTarget);
    lastTarget = t.ring.targetRotation;
  }
  assert.ok(t.ring.targetRotation > Math.PI * 2);
  t.settle(1600);
  assert.ok(Math.abs(t.ring.angle(t.ring.index)) < 1e-6);
});

test('a reversal changes the continuous target immediately and cancels opposing travel', () => {
  const t = setup();
  t.wheel(80, 0);
  const before = t.ring.targetRotation;
  t.wheel(-40, 30);
  assert.ok(t.ring.targetRotation < before);
  t.wheel(-40, 60);
  t.settle(60);
  assert.equal(t.ring.index, 0);
  assert.equal(t.ring.targetRotation, 0);
});

test('pixel, line, page and horizontal wheels normalize; pinch zoom is left alone', () => {
  for (const [delta, extras] of [[100, {}], [4, { deltaMode: 1 }], [1, { deltaMode: 2 }], [0, { deltaX: 100 }]]) {
    const t = setup();
    assert.equal(t.wheel(delta, 0, extras), true);
    t.settle(0);
    assert.equal(t.ring.index, 1);
  }
  const t = setup();
  assert.equal(t.wheel(200, 0, { ctrlKey: true }), false);
  assert.equal(t.wheel(200, 0, { metaKey: true }), false);
  assert.equal(t.wheel(200, 0, { defaultPrevented: true }), false);
  assert.equal(t.wheel(NaN, 0), false);
  assert.equal(t.scroll.active, false);
});

test('huge packets cannot queue many revolutions or reverse a forward gesture', () => {
  const t = setup();
  for (let i = 0; i < 200; i++) t.wheel(10000, i);
  assert.ok(t.ring.targetRotation <= t.step * 1.2);
  t.settle(200);
  assert.equal(t.ring.index, 1);
  t.ring.step(1);
  const pending = t.ring.targetRotation;
  t.wheel(100, 400);
  assert.ok(t.ring.targetRotation >= pending);
});

test('buttons, thumbnail selection and interruption leave no stale fractional offset', () => {
  for (const action of ['step', 'select']) {
    const t = setup();
    t.wheel(60, 0);
    t.scroll.cancel();
    t.ring[action](1);
    t.settle(0);
    assert.equal(t.ring.index, 1);
    assert.ok(Math.abs(t.ring.angle(1)) < 1e-6);
    assert.equal(t.scroll.update(2000), false);
  }
  const t = setup();
  t.wheel(15, 0);
  t.scroll.cancel();
  t.ring.snap();
  t.settle(0);
  assert.equal(t.ring.index, 0);
});

test('reduced motion advances once per gesture without continuous rotation', () => {
  const t = setup({ reducedMotion: true });
  for (let i = 0; i < 20; i++) t.wheel(10, i * 20);
  assert.equal(t.ring.index, 1);
  assert.equal(t.ring.rotation, t.step);
  t.settle(400);
  t.wheel(-80, 600);
  assert.equal(t.ring.index, 0);
  assert.equal(t.ring.rotation, 0);
});

test('continuous targets and explicit navigation preserve unequal station spacing', () => {
  const ring = createRingNavigator({ count: 4, stops: [0, .7, 2.6, 5.1] });
  ring.seek(.4);
  assert.equal(ring.index, 1);
  ring.step(1);
  assert.equal(ring.targetRotation, 2.6);
  ring.seek(6.4);
  assert.equal(ring.index, 0);
  ring.select(0);
  assert.equal(ring.targetRotation, Math.PI * 2);
  ring.seek(6.1);
  ring.setReducedMotion(true);
  assert.equal(ring.rotation, Math.PI * 2);
});

test('drag follows both axes, holds its position during a pause and snaps on release', () => {
  for (const span of [220, 460]) {
    const t = setup();
    t.scroll.beginDrag();
    t.scroll.drag(span * .35, span);
    assert.ok(Math.abs(t.ring.targetRotation - t.step * .35) < 1e-10);
    assert.equal(t.scroll.update(10000), true, 'a held finger must not snap on an idle timer');
    assert.equal(t.scroll.waiting, false, 'a stationary drag needs no timer frames');
    t.scroll.endDrag();
    t.settle(10000);
    assert.equal(t.ring.index, 1);
    assert.ok(Math.abs(t.ring.angle(1)) < 1e-6);
  }
});

test('drag reversal, cancellation and reduced motion have no delayed selection', () => {
  const t = setup();
  t.scroll.beginDrag();
  t.scroll.drag(80, 200);
  t.scroll.drag(0, 200);
  t.scroll.endDrag();
  assert.equal(t.ring.targetRotation, 0);
  t.scroll.beginDrag();
  t.scroll.drag(80, 200);
  t.scroll.cancel();
  t.ring.snap();
  assert.equal(t.scroll.drag(100, 200), false);
  t.scroll.endDrag();
  assert.equal(t.ring.index, 0);
  const reduced = setup({ reducedMotion: true });
  reduced.scroll.beginDrag();
  reduced.scroll.drag(100, 200);
  assert.equal(reduced.ring.rotation, 0);
  reduced.scroll.endDrag();
  assert.equal(reduced.ring.index, 1);
  assert.equal(reduced.ring.rotation, reduced.step);
});

test('grabbing during a transition takes over the visible angle without a jump', () => {
  const t = setup();
  t.ring.step(1);
  t.ring.update(.04);
  const visible = t.ring.rotation;
  t.scroll.beginDrag();
  assert.equal(t.ring.targetRotation, visible);
  assert.equal(t.ring.rotation, visible);
  t.scroll.drag(0, 200);
  assert.equal(t.ring.targetRotation, visible);
  t.scroll.drag(40, 200);
  assert.ok(Math.abs(t.ring.targetRotation - visible - t.step * .2) < 1e-10);
});
