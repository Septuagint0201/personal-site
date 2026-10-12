import test from 'node:test';
import assert from 'node:assert/strict';
import { createSandField } from '../src/sand-field.js';

const volume = sand => sand.displacement.reduce((sum, value) => sum + value, 0) * sand.spacing ** 2;
const settle = sand => { for (let i = 0; i < 600 && sand.active; i++) { sand.relax(1 / 60); sand.consumeDirty(); } };

test('a stroke can deepen a previous groove without depending on pointer packet count', () => {
  const sand = createSandField();
  const stroke = sand.displacement.slice();
  sand.stamp(0, 0, .42, .23, 1, 0, 1, stroke);
  const once = sand.displacement.slice();
  for (let i = 0; i < 100; i++) sand.stamp(0, 0, .42, .23, 1, 0, 1, stroke);
  assert.deepEqual(sand.displacement, once);
  settle(sand);
  const firstDepth = sand.sample(0, 0);
  sand.stamp(0, 0, .42, .23, 1, 0, 1, sand.displacement.slice());
  settle(sand);
  assert.ok(sand.sample(0, 0) < firstDepth - .025, 'a new pass cuts into the next layer');
  assert.ok(Math.abs(volume(sand)) < 1e-6);
});

test('deep layered excavation stays finite, conserves material and comes to rest', () => {
  const sand = createSandField();
  for (let stroke = 0; stroke < 16; stroke++) {
    const reference = sand.displacement.slice();
    for (let i = 0; i < 25; i++) sand.stamp(-.9 + i * .075, .15, .42, .23, 1, 0, .8, reference);
    settle(sand);
    assert.ok(Math.abs(volume(sand)) < 1e-5);
    assert.ok(sand.displacement.every(Number.isFinite));
  }
  assert.ok(Math.min(...sand.displacement) < -.3, 'successive passes leave a substantial trench');
  assert.ok(Math.min(...sand.displacement) >= -.821, 'deepest cuts remain bounded');
  settle(sand);
  assert.equal(sand.active, false);
  sand.clear();
  assert.ok(sand.displacement.every(value => value === 0));
  assert.ok(sand.compaction.every(value => value === 0));
});
