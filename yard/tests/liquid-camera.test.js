import test from "node:test";
import assert from "node:assert/strict";
import {
  closestPointsBetweenSegments,
  moveWalkingCamera,
} from "../src/liquid-camera.js";
import { METAL_SEGMENTS, ROOM_BOUNDS } from "../src/liquid-room.js";

const close = (actual, expected, tolerance = 1e-7) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} should be within ${tolerance} of ${expected}`,
  );
const distance = (a, b) =>
  Math.hypot(...a.map((value, axis) => value - b[axis]));
function clearance(position, radius = 0.21, eyeHeight = 1.65) {
  return Math.min(
    ...METAL_SEGMENTS.map(
      (rod) =>
        closestPointsBetweenSegments(
          [
            position[0],
            Math.min(eyeHeight, Math.max(0.22, radius + 0.01)),
            position[2],
          ],
          [position[0], eyeHeight, position[2]],
          rod.a,
          rod.b,
        ).distance -
        radius -
        rod.radius,
    ),
  );
}
function verify(position) {
  assert.ok(position.every(Number.isFinite));
  close(position[1], 1.65);
  assert.ok(position[0] >= ROOM_BOUNDS.min[0] + 0.21);
  assert.ok(position[0] <= ROOM_BOUNDS.max[0] - 0.21);
  assert.ok(position[2] >= ROOM_BOUNDS.min[2] + 0.21);
  assert.ok(position[2] <= ROOM_BOUNDS.max[2] - 0.21);
  assert.ok(
    clearance(position) >= -1e-6,
    `body penetrated a rod by ${-clearance(position)}`,
  );
}

test("closest segment points handle crossing, skew, parallel and point-like segments", () => {
  const crossing = closestPointsBetweenSegments(
    [-1, 0, 0],
    [1, 0, 0],
    [0, -1, 0],
    [0, 1, 0],
  );
  close(crossing.distance, 0);
  close(crossing.s, 0.5);
  close(crossing.t, 0.5);
  const skew = closestPointsBetweenSegments(
    [-1, 0, 0],
    [1, 0, 0],
    [0, -1, 2],
    [0, 1, 2],
  );
  close(skew.distance, 2);
  const parallel = closestPointsBetweenSegments(
    [0, 0, 0],
    [0, 3, 0],
    [2, 1, 0],
    [2, 4, 0],
  );
  close(parallel.distance, 2);
  const points = closestPointsBetweenSegments(
    [0, 0, 0],
    [0, 0, 0],
    [0, 3, 4],
    [0, 3, 4],
  );
  close(points.distance, 5);
  const pointAndSegment = closestPointsBetweenSegments(
    [0, 0, 0],
    [0, 0, 0],
    [-1, 2, 0],
    [1, 2, 0],
  );
  close(pointAndSegment.distance, 2);
});

test("walking remains on the floor and never mutates its input vectors", () => {
  const position = [0, 1.65, 4.5],
    delta = [0.3, 99, -0.6];
  const originalPosition = [...position],
    originalDelta = [...delta];
  const next = moveWalkingCamera(position, delta);
  close(next[0], 0.3);
  close(next[2], 3.9);
  verify(next);
  assert.deepEqual(position, originalPosition);
  assert.deepEqual(delta, originalDelta);
});

test("all four walls stop the capsule, including a large fast-frame displacement", () => {
  for (const delta of [
    [100, 0, 0],
    [-100, 0, 0],
    [0, 0, 100],
    [0, 0, -100],
  ]) {
    const start = delta[0] ? [0, 1.65, 4.5] : [4.55, 1.65, 0];
    const next = moveWalkingCamera(start, delta);
    verify(next);
    if (delta[0]) close(Math.abs(next[0]), 5 - 0.21 - 0.0015);
    else close(Math.abs(next[2]), 6 - 0.21 - 0.0015);
  }
});

test("a vertical frame cannot be tunnelled through by a long forward step", () => {
  const start = [-3.7, 1.65, -2.4];
  const next = moveWalkingCamera(start, [0, 0, -2.6]);
  assert.ok(next[2] >= -3.7 + 0.21 + METAL_SEGMENTS[0].radius);
  verify(next);
});

test("the continuous body catches a horizontal bar between the old height samples", () => {
  // Segment 8 is at y=1.25; no discrete camera-height test is necessary.
  const next = moveWalkingCamera([-3.25, 1.65, 2.9], [0, 0, -2.2]);
  assert.ok(next[2] >= 1.8 + 0.21 + METAL_SEGMENTS[8].radius);
  verify(next);
});

test("slanted rods block the capsule at every height and retain tangential sliding", () => {
  // Segment 9 climbs from y=1.25 to 2.2 while travelling along z.
  let position = [-1.65, 1.65, 1.3];
  for (let frame = 0; frame < 50; frame++) {
    position = moveWalkingCamera(position, [-0.035, 0, -0.02]);
    verify(position);
  }
  assert.ok(
    position[0] > -2.65 + 0.21,
    "the body remains on its original side",
  );
  assert.ok(position[2] < 0.6, "movement along the frame remains available");
});

test("one large move and equivalent small moves stop at the same frame", () => {
  const start = [-3.7, 1.65, -2.4],
    delta = [0, 0, -2.4];
  const large = moveWalkingCamera(start, delta);
  let small = [...start];
  for (let index = 0; index < 120; index++)
    small = moveWalkingCamera(
      small,
      delta.map((value) => value / 120),
    );
  verify(large);
  verify(small);
  assert.ok(distance(large, small) < 0.002);
});

test("a long diagonal move follows nearly the same sliding path as display-frame steps", () => {
  const start = [-2.05, 1.65, 1.3],
    delta = [-1.2, 0, -0.8];
  const large = moveWalkingCamera(start, delta);
  let small = [...start];
  for (let index = 0; index < 80; index++)
    small = moveWalkingCamera(
      small,
      delta.map((value) => value / 80),
    );
  verify(large);
  verify(small);
  assert.ok(
    distance(large, small) < 0.055,
    `sliding paths differ by ${distance(large, small)}`,
  );
});

test("a body initially on a rod resolves deterministically to a finite safe position", () => {
  const input = [-3.7, 1.65, -3.7];
  const first = moveWalkingCamera(input, [0, 0, 0]);
  const second = moveWalkingCamera(input, [0, 0, 0]);
  assert.deepEqual(first, second);
  verify(first);
});

test("walking beneath overhead framework does not create an invisible barrier", () => {
  const position = moveWalkingCamera([0, 1.65, 2.3], [0, 0, -3.0]);
  close(position[0], 0);
  close(position[2], -0.7);
  verify(position);
});

test("finite fallback values and bounded substeps handle malformed movement safely", () => {
  for (const [position, delta] of [
    [
      [NaN, Infinity, NaN],
      [Infinity, 0, NaN],
    ],
    [
      [0, 1.65, 4.5],
      [1e300, 0, -1e300],
    ],
    [undefined, undefined],
  ])
    verify(moveWalkingCamera(position, delta));
});

test("long deterministic walks never leave any part of the body inside a frame", () => {
  let position = [0, 1.65, 4.5];
  for (let frame = 0; frame < 2500; frame++) {
    position = moveWalkingCamera(position, [
      Math.sin(frame * 0.027) * 0.061,
      0,
      Math.cos(frame * 0.019) * 0.061,
    ]);
    verify(position);
  }
});
