import test from 'node:test';
import assert from 'node:assert/strict';
import { createFramePacer } from '../src/frame-pacing.js';

test('60 Hz and 30 Hz budgets stay stable across common display refresh rates', () => {
  for (const budget of [30, 60]) for (const refresh of [60, 90, 120, 144, 165, 240]) {
    const pacer = createFramePacer(budget);
    let draws = 0;
    for (let frame = 0; frame < refresh * 10; frame++) {
      if (pacer.ready(frame * 1000 / refresh)) draws++;
    }
    assert.ok(Math.abs(draws - budget * 10) <= 1, `${budget} on ${refresh}: ${draws}`);
  }
});

test('slow devices render every available frame without replaying missed frames', () => {
  const pacer = createFramePacer(60);
  for (let frame = 0; frame < 100; frame++) assert.equal(pacer.ready(frame * 40), true);
  assert.equal(pacer.ready(10000), true);
  assert.equal(pacer.ready(10001), false);
  assert.equal(pacer.ready(10017), true);
});

test('interaction invalidation is immediate and a resumed view gets a fresh deadline', () => {
  const pacer = createFramePacer(30);
  assert.equal(pacer.ready(100), true);
  assert.equal(pacer.ready(105), false);
  assert.equal(pacer.ready(105, true), true);
  assert.equal(pacer.ready(110), false);
  pacer.reset();
  assert.equal(pacer.ready(111), true);
});
