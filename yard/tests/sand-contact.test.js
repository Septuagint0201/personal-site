import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, FogExp2, Vector3 } from 'three';
import { createSandContact } from '../src/sand-contact.js';
import { createSandGrains } from '../src/sand-grains.js';
import { createSandGrainView } from '../src/sand-grain-view.js';

const flatSand = { size: 20, spacing: .125, sample: () => 0 };
function surface(size = 1, slope = 0) {
  const points = [-size, .5 - size * slope, -size, 0, .5, size, size, .5 + size * slope, -size];
  const collider = createSandContact(new Uint16Array([0, 1, 2]));
  collider.update(points);
  return { collider, points };
}

test('a grain outside the visible triangle receives no artificial sideways repulsion', () => {
  const { collider } = surface();
  const position = new Float64Array([.8, .49, .8]), velocity = new Float64Array([0, -1, 0]);
  assert.equal(collider.resolve(position, velocity, 0, .01, .8, .7, .8, 1 / 120), false);
  assert.deepEqual([...position], [.8, .49, .8]); assert.deepEqual([...velocity], [0, -1, 0]);
});

test('contact only corrects penetration and inward velocity, with very low bounce', () => {
  const { collider } = surface();
  const position = new Float64Array([0, .49, 0]), velocity = new Float64Array([.1, -1, 0]);
  assert.equal(collider.resolve(position, velocity, 0, .01, 0, .6, 0, 1 / 120), true);
  assert.ok(Math.abs(position[1] - .51) < .00001); assert.equal(position[0], 0);
  assert.ok(velocity[1] >= 0 && velocity[1] < .04);
  assert.ok(velocity[0] > .09 && velocity[0] <= .1);
  const below = new Float64Array([0, .2, 0]), still = new Float64Array([0, 0, 0]);
  assert.equal(collider.resolve(below, still, 0, .01, 0, .19, 0, 1 / 120), false);
  assert.deepEqual([...below], [0, .2, 0], 'buried grains are not teleported onto the glass');
});

test('grains can rest on glass beyond the old lifetime and fall when support moves away', () => {
  const grains = createSandGrains(flatSand, { count: 1000, capacity: 1 });
  const { collider, points } = surface(5);
  grains.disturb({ x: 0, z: 0, radius: 8, energy: .1 });
  assert.equal(grains.activeCount, 1);
  const slot = grains.ids.findIndex(id => id >= 0); grains.flying.set([0, .6, 0], slot * 3);
  for (let frame = 0; frame < 480; frame++) grains.update(1 / 120, collider);
  assert.equal(grains.activeCount, 1, 'surface contact is not forcibly expired after three seconds');
  assert.ok(grains.flying[slot * 3 + 1] > .5 && grains.flying[slot * 3 + 1] < .53);
  collider.update(points.map((value, i) => value + (i % 3 === 0 ? 15 : 0)));
  for (let frame = 0; frame < 240; frame++) grains.update(1 / 120, collider);
  assert.equal(grains.activeCount, 0);
  assert.ok(grains.sizes.every(size => size > 0));
});

test('gravity slides grains off an inclined glass surface without an adhesion constraint', () => {
  const grains = createSandGrains(flatSand, { count: 1000, capacity: 1 });
  const { collider } = surface(.8, .35);
  grains.disturb({ x: 0, z: 0, radius: 8, energy: .1 });
  const slot = grains.ids.findIndex(id => id >= 0); grains.flying.set([0, .6, 0], slot * 3);
  let contacts = 0;
  const contact = { resolve(...args) { const hit = collider.resolve(...args); contacts += Number(hit); return hit; } };
  for (let frame = 0; frame < 720; frame++) grains.update(1 / 120, contact);
  assert.ok(contacts > 3); assert.equal(grains.activeCount, 0);
});

test('paused grains reuse GPU attributes; moving grains only upload changing positions', () => {
  const scene = new Scene(); scene.fog = new FogExp2(0xe6d3b4, .019);
  const grains = createSandGrains(flatSand, { count: 1000, capacity: 8 });
  const view = createSandGrainView(scene, grains, new Vector3());
  grains.disturb({ x: 0, z: 0, radius: 8, energy: .1 }); view.update();
  const geometry = scene.children[1].geometry, attributes = geometry.attributes;
  const versions = () => Object.fromEntries(Object.entries(attributes).map(([name, attribute]) => [name, attribute.version]));
  const before = versions(); view.update(); assert.deepEqual(versions(), before);
  grains.update(1 / 120); view.update();
  assert.ok(attributes.position.version > before.position);
  assert.equal(attributes.color.version, before.color); assert.equal(attributes.grainSize.version, before.grainSize);
  const moving = versions(); grains.syncSurface(); view.update(); assert.deepEqual(versions(), moving);
  grains.reset(); view.update(); assert.equal(geometry.drawRange.count, 0);
  grains.disturb({ x: 0, z: 0, radius: 8, energy: .1 }); view.update();
  assert.ok(attributes.color.version > before.color); assert.ok(geometry.drawRange.count > 0);
  view.dispose(); assert.equal(scene.children.length, 0);
});
