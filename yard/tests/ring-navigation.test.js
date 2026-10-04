import test from "node:test";
import assert from "node:assert/strict";
import { createRingNavigator } from "../src/ring-navigation.js";

function settle(ring) {
  for (let i = 0; i < 400; i++) ring.update(1 / 60);
}
test("directional selection advances one item even with more than three exhibits", () => {
  const events = [];
  const ring = createRingNavigator({
    count: 5,
    onChange: (index, direction) => events.push([index, direction]),
  });
  ring.step(1);
  assert.equal(ring.index, 1);
  ring.step(-1);
  assert.equal(ring.index, 0);
  ring.step(-1);
  assert.equal(ring.index, 4);
  assert.deepEqual(events, [
    [1, 1],
    [0, -1],
    [4, -1],
  ]);
});
test("wrapping continues in the requested direction instead of rotating the long way back", () => {
  const ring = createRingNavigator({ count: 4 });
  for (let i = 0; i < 4; i++) ring.step(1);
  assert.equal(ring.index, 0);
  assert.ok(Math.abs(ring.targetRotation - Math.PI * 2) < 1e-10);
  settle(ring);
  assert.ok(Math.abs(ring.angle(0)) < 0.0001);
  ring.step(-1);
  assert.equal(ring.index, 3);
  assert.ok(ring.targetRotation < Math.PI * 2);
});
test("unequal spacing lands each selected object at the same front station", () => {
  const ring = createRingNavigator({ count: 4, stops: [0, 0.7, 2.6, 5.1] });
  for (let i = 1; i <= 4; i++) {
    ring.step(1);
    settle(ring);
    assert.ok(Math.abs(ring.angle(i % 4)) < 0.0001);
  }
});
test("pointer preview moves the track without selecting and returns to the station", () => {
  const ring = createRingNavigator({ count: 3, previewAngle: 0.2 });
  ring.setPreview(1);
  settle(ring);
  assert.equal(ring.index, 0);
  assert.ok(Math.abs(ring.angle(0) + 0.2) < 0.0001);
  ring.setPreview(0);
  settle(ring);
  assert.ok(Math.abs(ring.angle(0)) < 0.0001);
});
test("reduced motion retains one-step selection and snaps without pointer drift", () => {
  const ring = createRingNavigator({ count: 4, reducedMotion: true });
  ring.setPreview(1);
  ring.step(1);
  assert.equal(ring.index, 1);
  assert.equal(ring.update(0.016), false);
  assert.equal(ring.angle(1), 0);
});
test("a rapid change of direction converges without skipping or diverging", () => {
  const ring = createRingNavigator({ count: 7 });
  ring.step(1);
  ring.update(0.05);
  ring.step(1);
  ring.update(0.03);
  ring.step(-1);
  settle(ring);
  assert.equal(ring.index, 1);
  assert.ok(Math.abs(ring.angle(1)) < 0.0001);
});
