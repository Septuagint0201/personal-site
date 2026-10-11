import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSandField, duneHeight } from '../src/sand-field.js';
import { createTetrahedralLattice, bodyVolume, createDesertPhysics, TETHER_RADIUS, CRYSTAL_RADIUS, GEL_SOFT_STRETCH,
  gelGrabReach, gelStretchResponse, cornerVolume } from '../src/desert-physics.js';
import { createDesertSkin } from '../src/desert-skin.js';

const run = (body, sand, seconds, dt = 1 / 60) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) { body.update(dt); sand.relax(dt); sand.consumeDirty(); }
};
function setup() {
  const sand = createSandField(); let detachments = 0;
  const body = createDesertPhysics(sand, { onDetach: () => detachments++ });
  return { sand, body, detachments: () => detachments,
    detach() { body.grab([...body.center]); body.moveGrab([3, body.center[1], 0]); run(body, sand, 1); body.release(); } };
}
function extents(body) {
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < body.positions.length; i++) {
    low[i % 3] = Math.min(low[i % 3], body.positions[i]); high[i % 3] = Math.max(high[i % 3], body.positions[i]);
  }
  return high.map((v, i) => v - low[i]);
}
function strain(body) {
  let maximum = 0, error = 0;
  for (const edge of body.model.edges) {
    const length = Math.hypot(...[0, 1, 2].map(axis => body.positions[edge.a * 3 + axis] - body.positions[edge.b * 3 + axis]));
    maximum = Math.max(maximum, length / Math.max(edge.length, edge.softLength));
    error += (length / edge.softLength - 1) ** 2;
  }
  return { maximum, error: Math.sqrt(error / body.model.edges.length) };
}

test('the initial crystal is a regular tetrahedron with one upward apex and a closed surface', () => {
  const model = createTetrahedralLattice(), lengths = [];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++)
    lengths.push(Math.hypot(...model.corners[i].map((v, a) => v - model.corners[j][a])));
  assert.ok(Math.max(...lengths) - Math.min(...lengths) < 1e-12);
  assert.ok(model.corners[0][1] > 0 && model.corners.slice(1).every(p => p[1] < 0));
  assert.ok(Math.abs(bodyVolume(model.rest, model.faces) - lengths[0] ** 3 / (6 * Math.sqrt(2))) < 1e-10);
  const edges = new Map();
  for (let i = 0; i < model.faces.length; i += 3) for (let n = 0; n < 3; n++) {
    const a = model.faces[i + n], b = model.faces[i + (n + 1) % 3], key = [a, b].sort((x, y) => x - y).join(',');
    edges.set(key, (edges.get(key) || 0) + 1);
  }
  assert.ok([...edges.values()].every(count => count === 2));
});

test('a gentle impulse returns to the field without detaching or marking the ground', () => {
  const t = setup(); t.body.push([1, 0, 0], 1.8);
  run(t.body, t.sand, .5); assert.ok(t.body.distance > .1 && t.body.distance < TETHER_RADIUS);
  run(t.body, t.sand, 6);
  assert.equal(t.body.phase, 'suspended'); assert.ok(t.body.distance < .08);
  assert.equal(t.detachments(), 0); assert.equal(t.sand.revision, 0);
});

test('crossing the tether releases once; returning to the old anchor never restores levitation', () => {
  const t = setup(); t.detach();
  assert.equal(t.body.phase, 'released'); assert.equal(t.detachments(), 1);
  t.body.grab([...t.body.center]); t.body.moveGrab([...t.body.anchor]);
  run(t.body, t.sand, 2); t.body.release(); run(t.body, t.sand, 5);
  assert.equal(t.body.phase, 'released'); assert.equal(t.detachments(), 1);
  assert.ok(t.body.center[1] < 1.2); assert.ok(t.sand.revision > 0);
});

test('falling and settling retain volume, finite coordinates and ground contact', () => {
  const t = setup(); t.detach(); run(t.body, t.sand, 15);
  assert.ok(Math.abs(t.body.volumeRatio - 1) < .03);
  assert.ok(Array.from(t.body.positions).every(Number.isFinite));
  assert.ok(t.body.contacts > 0);
  for (let i = 0; i < t.body.positions.length; i += 3)
    assert.ok(t.body.positions[i + 1] >= t.sand.sample(t.body.positions[i], t.body.positions[i + 2]) - .025);
  assert.ok(Math.max(...t.sand.displacement) < .5);
});

test('stretch and squeeze deform the released body and recover after releasing input', () => {
  const t = setup(); t.detach(); run(t.body, t.sand, 4);
  const resting = extents(t.body);
  const point = [...t.body.center]; point[1] += .5;
  t.body.grab(point); t.body.moveGrab([point[0] + .8, point[1] + 1, point[2]]);
  run(t.body, t.sand, 1.5);
  assert.ok(t.body.center[1] > .8);
  assert.ok(extents(t.body)[1] > resting[1] * 1.2, 'the surface must stretch, not merely translate');
  assert.ok(Math.abs(t.body.volumeRatio - 1) < .06);
  t.body.release(); run(t.body, t.sand, 4);
  t.body.squeeze(.9); run(t.body, t.sand, 2);
  const squeezed = extents(t.body);
  assert.ok(squeezed[1] < resting[1] * .85, `${squeezed[1]} vs ${resting[1]}`);
  t.body.release(); run(t.body, t.sand, 4);
  assert.ok(extents(t.body)[1] > squeezed[1] * 1.03);
  assert.ok(Math.abs(t.body.volumeRatio - 1) < .04);
});

test('fixed simulation steps agree across display frame rates and reset restores the exact tetrahedron', () => {
  const a = setup(), b = setup();
  a.body.push([1, 0, 0], 2); b.body.push([1, 0, 0], 2);
  run(a.body, a.sand, 2, 1 / 30); run(b.body, b.sand, 2, 1 / 120);
  a.body.positions.forEach((value, i) => assert.ok(Math.abs(value - b.body.positions[i]) < 1e-8));
  a.detach(); a.body.reset();
  assert.equal(a.body.phase, 'suspended');
  assert.equal(a.body.distance, 0); assert.ok(Math.abs(a.body.volumeRatio - 1) < 1e-12);
});

test('extreme drag reversals yield past the soft boundary without runaway stretching or volume loss', () => {
  const t = setup(); t.detach(); run(t.body, t.sand, 4);
  const point = [...t.body.center]; point[1] += .5; t.body.grab(point);
  let peakStretch = 0;
  for (const target of [[100, 100, 100], [-100, -100, -100], [0, 100, 0], [100, -100, 100]]) {
    t.body.moveGrab(target);
    for (let i = 0; i < 240; i++) {
      run(t.body, t.sand, 1 / 120, 1 / 120);
      assert.ok(strain(t.body).maximum < GEL_SOFT_STRETCH + .6);
      peakStretch = Math.max(peakStretch, strain(t.body).maximum);
      assert.ok(Math.abs(t.body.volumeRatio - 1) < .06);
      assert.ok(t.body.positions.every(Number.isFinite));
    }
  }
  assert.ok(peakStretch > GEL_SOFT_STRETCH + .02, 'the nominal boundary yields instead of clamping every edge');
  t.body.release(); run(t.body, t.sand, 6);
  assert.equal(t.body.phase, 'released');
  assert.ok(Math.abs(t.body.volumeRatio - 1) < .04);
});

test('the soft boundary has continuous gradients and diminishing pointer gain without a hard stop', () => {
  const h = 1e-5, knee = CRYSTAL_RADIUS * 1.1;
  const slope = x => (gelGrabReach(x + h) - gelGrabReach(x - h)) / (2 * h);
  assert.ok(Math.abs(slope(knee - h) - slope(knee + h)) < 1e-6);
  assert.ok(slope(knee + .8) < slope(knee + .2));
  assert.ok(slope(knee + 3) > 0 && slope(knee + 3) < .25);
  assert.ok(gelGrabReach(10) > CRYSTAL_RADIUS * GEL_SOFT_STRETCH, 'extra reach remains possible under increasing resistance');
  for (const ratio of [1.3 - h, 1.3, 1.3 + h, 1.45, GEL_SOFT_STRETCH - h, GEL_SOFT_STRETCH, GEL_SOFT_STRETCH + h, 1.8, 2]) {
    const numerical = (gelStretchResponse(ratio + h)[0] - gelStretchResponse(ratio - h)[0]) / (2 * h);
    assert.ok(Math.abs(numerical - gelStretchResponse(ratio)[1]) < 1e-5, 'the nonlinear solver must use the matching derivative');
  }
  for (const boundary of [1.3, GEL_SOFT_STRETCH]) {
    const below = gelStretchResponse(boundary - h), above = gelStretchResponse(boundary + h);
    assert.ok(Math.abs(above[0] - below[0]) < .001);
    assert.ok(Math.abs(above[1] - below[1]) < .003, 'no stiffness jump at the soft boundary');
  }
});

test('release eases into shape recovery without a first-frame elastic kick', () => {
  const t = setup(); t.detach(); run(t.body, t.sand, 4);
  const point = [...t.body.center]; point[1] += .5;
  t.body.grab(point); t.body.moveGrab([point[0] + .8, point[1] + 1, point[2]]);
  run(t.body, t.sand, 1.5);
  const heldError = strain(t.body).error;
  assert.ok(heldError > .12, 'keep visible elasticity while held');
  let previous = t.body.positions.slice();
  run(t.body, t.sand, 1 / 120, 1 / 120);
  let velocity = t.body.positions.map((p, i) => (p - previous[i]) * 120);
  t.body.release();
  for (let frame = 0; frame < 12; frame++) {
    previous = t.body.positions.slice(); run(t.body, t.sand, 1 / 120, 1 / 120);
    const next = t.body.positions.map((p, i) => (p - previous[i]) * 120);
    const acceleration = next.map((v, i) => (v - velocity[i]) * 120), mean = [0, 0, 0];
    acceleration.forEach((a, i) => { mean[i % 3] += a / (acceleration.length / 3); });
    const elasticAcceleration = Math.sqrt(acceleration.reduce((sum, a, i) => sum + (a - mean[i % 3]) ** 2, 0) / (acceleration.length / 3));
    assert.ok(elasticAcceleration < 40, `elastic acceleration: ${elasticAcceleration}`);
    velocity = next;
  }
  run(t.body, t.sand, 5);
  assert.ok(strain(t.body).error < .04, 'recover the tetrahedral rest distances after a pull');
  t.body.squeeze(.9); run(t.body, t.sand, 2);
  const pressedError = strain(t.body).error;
  t.body.release(); run(t.body, t.sand, 6);
  assert.ok(strain(t.body).error < pressedError * .75, 'a long squeeze must not replace the remembered shape');
});

test('ordinary recoil keeps its pacing while a near-boundary pull recovers without a mid-return speed jump', () => {
  for (const { pull, hold, slowest } of [{ pull: 1, hold: 4, slowest: .26 }, { pull: 3, hold: 1.5, slowest: .315 }]) {
    const t = setup(); t.detach(); run(t.body, t.sand, 4);
    const point = [...t.body.center]; point[1] += .5;
    t.body.grab(point); t.body.moveGrab([point[0] + .8, point[1] + pull, point[2]]);
    run(t.body, t.sand, hold);
    const initial = strain(t.body).error;
    let previousError = initial, previousRate, halfTime;
    t.body.release();
    for (let frame = 1; frame <= 48; frame++) {
      run(t.body, t.sand, 1 / 120, 1 / 120);
      const error = strain(t.body).error, rate = (error - previousError) * 120;
      if (frame <= 30 && previousRate !== undefined)
        assert.ok(Math.abs(rate - previousRate) < .3, 'shape recovery must not switch speeds at the old boundary');
      if (halfTime === undefined && error < initial / 2) halfTime = frame / 120;
      previousError = error; previousRate = rate;
    }
    assert.ok(halfTime >= .18 && halfTime <= slowest, `shape half-recovery time: ${halfTime}`);
  }
});

test('returning from above preserves gel shape, volume and sand, then falls without an invisible ceiling', () => {
  const t = setup();
  assert.equal(t.body.dropFromAbove(10), false, 'a suspended crystal cannot return as gel');
  t.detach(); run(t.body, t.sand, 4);
  t.body.grab([...t.body.center]); assert.equal(t.body.dropFromAbove(10), false);
  t.body.release(); t.body.squeeze(.8); assert.equal(t.body.dropFromAbove(10), false);
  t.body.release();
  const positions = t.body.positions.slice(), center = [...t.body.center], volume = t.body.volumeRatio;
  const ground = t.sand.displacement.slice(), freeAge = t.body.freeAge;
  assert.equal(t.body.dropFromAbove(10), true);
  assert.equal(t.body.phase, 'released'); assert.equal(t.body.freeAge, freeAge); assert.equal(t.body.contacts, 0);
  assert.ok(Math.abs(t.body.volumeRatio - volume) < 1e-12);
  assert.deepEqual(t.sand.displacement, ground);
  positions.forEach((p, i) => assert.ok(Math.abs(t.body.positions[i] - t.body.center[i % 3] - p + center[i % 3]) < 1e-12));
  run(t.body, t.sand, 1 / 60);
  assert.ok(t.body.center[1] < 10 && t.body.center[1] > 9.9);
  assert.ok(Math.min(...t.body.positions.filter((_, i) => i % 3 === 1)) > 7);
  run(t.body, t.sand, 5);
  assert.ok(t.body.contacts > 0); assert.ok(t.body.center[1] < 1.2);
  assert.ok(Math.abs(t.body.volumeRatio - 1) < .04); assert.equal(t.detachments(), 1);
});

test('the captured inward apex recovers without changing the gel material or restoring levitation', () => {
  const pose = JSON.parse(readFileSync(new URL('./fixtures/desert-inward-corner.json', import.meta.url), 'utf8'));
  const t = setup(); t.detach(); run(t.body, t.sand, 4); t.body.dropFromAbove(10);
  t.body.positions.set(pose.positions.map((p, i) => p + (i % 3 === 1 ? 2 : 0)));
  t.body.center.splice(0, 3, ...pose.center.map((p, i) => p + (i === 1 ? 2 : 0)));
  const ratios = () => t.body.model.cornerCells.map(cell => cornerVolume(t.body.positions, cell) / cornerVolume(t.body.model.softRest, cell));
  assert.ok(ratios()[0] < -.99);
  run(t.body, t.sand, .25, 1 / 120);
  assert.ok(ratios().every(value => value > .8));
  assert.ok(Math.abs(t.body.volumeRatio - 1) < .01);
  run(t.body, t.sand, 6);
  assert.ok(ratios().every(value => value > .8)); assert.equal(t.body.phase, 'released');
});

test('the orientation barrier repairs any mirrored corner under a rotated pose', () => {
  for (let corner = 0; corner < 4; corner++) {
    const t = setup(); t.detach(); run(t.body, t.sand, 4); t.body.dropFromAbove(10);
    const p = t.body.positions, rest = t.body.model.softRest;
    for (let i = 0; i < p.length; i += 3) {
      const x = rest[i] * Math.cos(.7) - rest[i + 1] * Math.sin(.7);
      const y = rest[i] * Math.sin(.7) + rest[i + 1] * Math.cos(.7), z = rest[i + 2];
      p[i] = x * Math.cos(.4) + z * Math.sin(.4); p[i + 1] = y + 2;
      p[i + 2] = z * Math.cos(.4) - x * Math.sin(.4);
    }
    t.body.center.splice(0, 3, 0, 2, 0);
    const cell = t.body.model.cornerCells[corner], [a, b, c, d] = cell.map(id => id * 3);
    const u = [0, 1, 2].map(axis => p[c + axis] - p[b + axis]);
    const v = [0, 1, 2].map(axis => p[d + axis] - p[b + axis]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const distance = n.reduce((sum, value, axis) => sum + value * (p[a + axis] - p[b + axis]), 0) / n.reduce((sum, value) => sum + value * value, 0);
    for (let axis = 0; axis < 3; axis++) p[a + axis] -= 2 * distance * n[axis];
    assert.ok(cornerVolume(p, cell) / cornerVolume(rest, cell) < -.99);
    run(t.body, t.sand, .25, 1 / 120);
    assert.ok(cornerVolume(p, cell) / cornerVolume(rest, cell) > .8);
    assert.ok(Math.abs(t.body.volumeRatio - 1) < .015);
  }
});

test('sand impressions preserve displaced volume, form raised rims and survive idle sampling', () => {
  const sand = createSandField();
  for (let i = 0; i < 25; i++) { sand.stamp(-1 + i * .08, .4, .32, .15); sand.relax(); sand.consumeDirty(); }
  const total = Array.from(sand.displacement).reduce((sum, value) => sum + value, 0) * sand.spacing ** 2;
  assert.ok(Math.abs(total) < 1e-5);
  assert.ok(Math.min(...sand.displacement) < -.08);
  assert.ok(Math.max(...sand.displacement) > .02);
  const before = sand.sample(0, .4), revision = sand.revision;
  for (let i = 0; i < 100; i++) sand.sample(0, .4);
  assert.equal(sand.sample(0, .4), before); assert.equal(sand.revision, revision);
  assert.equal(sand.stamp(10, 10), false);
  assert.equal(sand.sample(15, 15), duneHeight(15, 15));
  sand.clear(); assert.ok(sand.displacement.every(value => value === 0));
});

test('subdivided skin preserves the sharp crystal and translations without extra physics nodes', () => {
  const model = createTetrahedralLattice();
  for (const levels of [2, 3]) {
    const skin = createDesertSkin(model, levels), a = new Float32Array(skin.count * 3), b = new Float32Array(a.length);
    skin.write(a, model.rest, 0, [0, 0, 0]);
    assert.ok(Math.abs(bodyVolume(a, skin.faces) - bodyVolume(model.rest, model.faces)) < 1e-6);
    const translated = model.rest.map((value, i) => value + [2, 3, 4][i % 3]);
    skin.write(a, model.rest, .9, [0, 0, 0]); skin.write(b, translated, .9, [2, 3, 4]);
    for (let i = 0; i < a.length; i++) assert.ok(Math.abs(b[i] - a[i] - [2, 3, 4][i % 3]) < 1e-6);
    const edges = new Map();
    for (let i = 0; i < skin.faces.length; i += 3) for (let axis = 0; axis < 3; axis++) {
      const key = [skin.faces[i + axis], skin.faces[i + (axis + 1) % 3]].sort((x, y) => x - y).join(',');
      edges.set(key, (edges.get(key) || 0) + 1);
    }
    assert.ok([...edges.values()].every(count => count === 2), 'the finer skin must stay closed without cracks');
  }
});
