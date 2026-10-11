import test from 'node:test';
import assert from 'node:assert/strict';
import { createSandField } from '../src/sand-field.js';
import { createSandGrains } from '../src/sand-grains.js';
import { createDesertPhysics, bodyVolume } from '../src/desert-physics.js';
import { createDesertSkin } from '../src/desert-skin.js';
import { createSandContact } from '../src/sand-contact.js';

const event = { x: 0, z: 0, radius: 2, flowX: 1, flowZ: 0, energy: 1 };
const countSurface = grains => Array.from(grains.sizes).filter(size => size > 0).length;

test('surface grains become airborne once and return to the ground without changing grain count', () => {
  const sand = createSandField(), grains = createSandGrains(sand, { count: 2000, capacity: 64 });
  const before = [...grains.positions];
  grains.disturb(event);
  assert.ok(grains.activeCount > 0);
  assert.equal(countSurface(grains) + grains.activeCount, grains.count);
  assert.equal(new Set(Array.from(grains.ids).filter(id => id >= 0)).size, grains.activeCount);
  const paused = [...grains.flying]; grains.update(0); assert.deepEqual([...grains.flying], paused);
  for (let i = 0; i < 500; i++) grains.update(1 / 120);
  assert.equal(grains.activeCount, 0); assert.equal(countSurface(grains), grains.count);
  assert.ok(grains.positions.some((value, i) => i % 3 !== 1 && Math.abs(value - before[i]) > .01));
  for (let i = 0; i < grains.count; i++) {
    const a = i * 3;
    assert.ok(Math.abs(grains.positions[a + 1] - sand.sample(grains.positions[a], grains.positions[a + 2]) - grains.radii[i] * .32) < 1e-6);
  }
  grains.reset(); assert.deepEqual([...grains.positions], before);
});

test('large disturbance bursts respect spawn budgets, capacity and the High preset', () => {
  const sand = createSandField(), grains = createSandGrains(sand, { count: 2000, capacity: 128 });
  const large = { ...event, radius: 7 };
  for (let i = 0; i < 100; i++) grains.disturb(large);
  assert.ok(grains.activeCount <= 40);
  grains.setQuality(true);
  for (let frame = 0; frame < 30; frame++) { grains.update(1 / 60); grains.disturb(large); }
  assert.ok(grains.activeCount <= 64);
  assert.equal(countSurface(grains) + grains.activeCount, grains.count);
  const assigned = Array.from(grains.ids).filter(id => id >= 0);
  assert.equal(new Set(assigned).size, assigned.length);
  grains.reset(); assert.equal(grains.activeCount, 0);
  grains.disturb(large);
  assert.ok(Array.from(grains.ids).filter(id => id >= 0).every(id => id < grains.visibleCount));
});

test('terrain edits update individual resting grains and gel contact never leaves grains attached', () => {
  const sand = createSandField(), grains = createSandGrains(sand, { count: 1800, capacity: 96 });
  sand.stamp(0, 0, 1, .25); sand.relax(); grains.syncSurface(sand.consumeDirty());
  for (let id = 0; id < grains.count; id++) {
    const a = id * 3;
    assert.ok(Math.abs(grains.positions[a + 1] - sand.sample(grains.positions[a], grains.positions[a + 2]) - grains.radii[id] * .32) < 1e-6);
  }
  grains.disturb(event);
  const body = createDesertPhysics(sand), skin = createDesertSkin(body.model, 2);
  const positions = new Float32Array(skin.count * 3);
  skin.write(positions, body.model.softRest.map((value, i) => value + (i % 3 === 1 ? .55 : 0)), .5, [0, .55, 0]);
  const collider = createSandContact(skin.faces); collider.update(positions);
  for (let i = 0; i < 500; i++) grains.update(1 / 120, collider);
  assert.equal(grains.activeCount, 0);
  assert.ok(grains.positions.every(Number.isFinite));
  for (let id = 0; id < grains.count; id++) {
    const a = id * 3;
    assert.ok(Math.abs(grains.positions[a + 1] - sand.sample(grains.positions[a], grains.positions[a + 2]) - grains.radii[id] * .32) < 1e-6);
  }
});

test('repose settling continues after a render consumes dirty bounds, conserves volume and eventually sleeps', () => {
  const sand = createSandField(); sand.stamp(0, 0, .25, .34);
  const before = sand.revision; sand.consumeDirty();
  assert.equal(sand.active, true);
  for (let i = 0; i < 400; i++) { sand.relax(1 / 60); sand.consumeDirty(); }
  assert.ok(sand.revision > before);
  assert.equal(sand.active, false);
  const sum = sand.displacement.reduce((total, v) => total + v, 0) * sand.spacing ** 2;
  assert.ok(Math.abs(sum) < 1e-5);
  assert.ok(Math.max(...sand.compaction) > .5);
  sand.clear(); assert.equal(sand.active, false); assert.ok(sand.compaction.every(v => v === 0));
});

test('fixed repose steps agree at 30 and 120 Hz and quiet contact emits no spray', () => {
  let events = 0;
  const a = createSandField({ onDisplace: () => events++ }), b = createSandField();
  a.stamp(0, 0, .3, .3, 0, 0, 0); assert.equal(events, 0);
  b.stamp(0, 0, .3, .3);
  for (let i = 0; i < 60; i++) { a.relax(1 / 30); a.consumeDirty(); }
  for (let i = 0; i < 240; i++) { b.relax(1 / 120); b.consumeDirty(); }
  assert.deepEqual(a.displacement, b.displacement);
  a.stamp(1, 1, .4, .2); assert.equal(events, 1);
});

test('dragged sand builds a directional rim while preserving the displaced volume', () => {
  const forward = createSandField(), backward = createSandField(), still = createSandField();
  forward.stamp(0, 0, .7, .2, 1, 0); backward.stamp(0, 0, .7, .2, -1, 0);
  still.stamp(0, 0, .7, .2, NaN, Infinity);
  const centroid = field => {
    let moment = 0, mass = 0;
    for (let i = 0; i < field.displacement.length; i++) {
      const height = Math.max(0, field.displacement[i]);
      moment += height * (i % field.stride * field.spacing - field.size / 2); mass += height;
    }
    return moment / mass;
  };
  assert.ok(centroid(forward) > .1);
  assert.ok(centroid(backward) < -.1);
  assert.ok(Math.abs(centroid(still)) < 1e-6);
  for (const field of [forward, backward, still]) {
    assert.ok(field.displacement.every(Number.isFinite));
    const volume = field.displacement.reduce((sum, h) => sum + h, 0) * field.spacing ** 2;
    assert.ok(Math.abs(volume) < 1e-6);
  }
});

test('softened target retains the four original corners and the original volume', () => {
  const { model, restVolume } = createDesertPhysics(createSandField());
  assert.ok(Math.abs(bodyVolume(model.softRest, model.faces) / restVolume - 1) < 1e-10);
  const ids = model.corners.map(corner => {
    let nearest = 0, gap = Infinity;
    for (let i = 0; i < model.rest.length / 3; i++) {
      const d = Math.hypot(...corner.map((v, a) => model.rest[i * 3 + a] - v));
      if (d < gap) { gap = d; nearest = i; }
    }
    return nearest;
  });
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const length = data => Math.hypot(...[0, 1, 2].map(a => data[ids[i] * 3 + a] - data[ids[j] * 3 + a]));
    assert.ok(length(model.softRest) / length(model.rest) > .86);
  }
});
