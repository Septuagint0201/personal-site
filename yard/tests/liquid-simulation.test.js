import test from "node:test";
import assert from "node:assert/strict";
import {
  createLiquidSimulation,
  MAX_DROPS,
  FIXED_STEP,
} from "../src/liquid-simulation.js";
import {
  AREA_LIGHTS,
  EMITTERS,
  METAL_SEGMENTS,
  ROOM_BOUNDS,
  closestPointOnSegment,
  distanceToMetal,
} from "../src/liquid-room.js";

const close = (actual, expected, tolerance = 1e-10) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} should be within ${tolerance} of ${expected}`,
  );
const advance = (simulation, seconds, dt = 1 / 60) => {
  for (let frame = 0; frame < Math.round(seconds / dt); frame++)
    simulation.update(dt);
};
const drop = (position, radius = 0.24, overrides = {}) => ({
  position,
  radius,
  velocity: [0, 0, 0],
  ...overrides,
});

test("the shared room has connected circular-section frames and strip lights on all four walls", () => {
  assert.equal(METAL_SEGMENTS.length, 24);
  assert.equal(EMITTERS.length, 18);
  assert.equal(AREA_LIGHTS.length, 8);
  assert.deepEqual(
    new Set(AREA_LIGHTS.map((light) => light.normal.join(","))),
    new Set(["1,0,0", "-1,0,0", "0,0,1", "0,0,-1"]),
  );
  for (const emitter of EMITTERS) {
    assert.equal(emitter.segmentIndices.length, 2);
    for (const index of emitter.segmentIndices) {
      const segment = METAL_SEGMENTS[index];
      close(
        closestPointOnSegment(emitter.position, segment.a, segment.b).distance,
        0,
      );
      assert.ok(segment.radius >= 0.06 && segment.radius <= 0.1);
    }
  }
  assert.ok(
    distanceToMetal([0, 1.65, 4.5]).distance > 1.5,
    "the arrival camera has an open walking space",
  );
});

test("the segment distance handles interior points, both ends and zero-length segments", () => {
  assert.deepEqual(closestPointOnSegment([2, 2, 0], [0, 0, 0], [4, 0, 0]), {
    point: [2, 0, 0],
    t: 0.5,
    distance: 2,
  });
  assert.equal(closestPointOnSegment([-2, 0, 0], [0, 0, 0], [4, 0, 0]).t, 0);
  assert.equal(closestPointOnSegment([5, 0, 0], [0, 0, 0], [4, 0, 0]).t, 1);
  assert.deepEqual(closestPointOnSegment([0, 2, 0], [0, 0, 0], [0, 0, 0]), {
    point: [0, 0, 0],
    t: 0,
    distance: 2,
  });
});

test("five minutes of merging, splitting, draining and condensation conserve total glass volume", () => {
  const simulation = createLiquidSimulation({ seed: 271828 });
  const original = simulation.stats().totalVolume;
  let observedReservoir = false;
  for (let frame = 0; frame < 300 * 60; frame++) {
    simulation.update(1 / 60);
    if (frame % 60 !== 0) continue;
    const statistics = simulation.stats();
    close(statistics.totalVolume, original);
    close(statistics.visibleVolume + statistics.reservoirVolume, original);
    observedReservoir ||= statistics.reservoirVolume > 0.001;
    assert.ok(simulation.getDrops().length <= MAX_DROPS);
    for (const part of simulation.getDrops()) {
      assert.ok(Number.isFinite(part.radius) && part.radius >= 0);
      assert.ok(part.position.every(Number.isFinite));
      assert.ok(part.velocity.every(Number.isFinite));
      close(
        part.deform.reduce((product, value) => product * value, 1),
        1,
      );
      close(Math.hypot(...part.orientation), 1);
      if (part.state === "free")
        part.position.forEach((value, axis) => {
          assert.ok(
            value > ROOM_BOUNDS.min[axis] && value < ROOM_BOUNDS.max[axis],
          );
        });
    }
  }
  const statistics = simulation.stats();
  assert.ok(statistics.merges >= 2);
  assert.ok(statistics.splits >= 1);
  assert.ok(statistics.returns >= 4);
  assert.ok(statistics.detachments >= 5);
  assert.ok(observedReservoir);
});

test("fixed time steps give the same motion at 30 and 120 display frames per second", () => {
  const low = createLiquidSimulation({ seed: 518 });
  const high = createLiquidSimulation({ seed: 518 });
  advance(low, 45, 1 / 30);
  advance(high, 45, 1 / 120);
  assert.deepEqual(low.getDrops(), high.getDrops());
  assert.deepEqual(low.stats(), high.stats());
});

test("hidden-tab catch-up is bounded and invalid time values cannot poison the simulation", () => {
  const simulation = createLiquidSimulation();
  [NaN, Infinity, -1, 0].forEach((value) => simulation.update(value));
  assert.equal(simulation.stats().elapsed, 0);
  simulation.update(600);
  close(simulation.stats().elapsed, 0.25);
  simulation.reset();
  assert.equal(simulation.stats().elapsed, 0);
});

test("coalescence removes one parcel and preserves combined volume and centre", () => {
  const events = [];
  const simulation = createLiquidSimulation({
    initialDrops: [drop([-0.17, 2, 0]), drop([0.17, 2, 0])],
    onEvent: (event) => events.push(event),
  });
  const original = simulation.stats().totalVolume;
  simulation.update(FIXED_STEP);
  assert.equal(simulation.getDrops().length, 1);
  assert.equal(simulation.stats().merges, 1);
  close(simulation.stats().totalVolume, original);
  assert.ok(
    Math.hypot(
      ...simulation
        .getDrops()[0]
        .position.map((value, axis) => value - [0, 2, 0][axis]),
    ) < 0.0001,
  );
  assert.equal(events[0].type, "merge");
  assert.ok(simulation.getDrops()[0].radius > 0.3);
});

test("touching droplets publish reciprocal neck links before merging", () => {
  const simulation = createLiquidSimulation({
    initialDrops: [drop([-0.25, 2, 0]), drop([0.25, 2, 0])],
  });
  simulation.update(FIXED_STEP);
  const [left, right] = simulation.getDrops();
  assert.equal(left.bridgeTo, right.id);
  assert.equal(right.bridgeTo, left.id);
  assert.equal(simulation.stats().merges, 0);
});

test("an interaction splits liquid with conserved volume and momentum, then keeps siblings apart", () => {
  const simulation = createLiquidSimulation({
    initialDrops: [drop([0, 2, 0], 0.4, { velocity: [0.08, -0.02, 0.035] })],
  });
  const original = simulation.stats().totalVolume;
  const result = simulation.interact([0, 2, 3], [0, 0, -1], "split");
  assert.equal(result.type, "split");
  assert.equal(simulation.getDrops().length, 2);
  close(simulation.stats().totalVolume, original);
  [0.08, -0.02, 0.035].forEach((velocity, axis) => {
    close(
      simulation
        .getDrops()
        .reduce((sum, part) => sum + part.velocity[axis] * part.volume, 0),
      velocity * original,
    );
  });
  advance(simulation, 4);
  assert.equal(simulation.getDrops().length, 2);
  assert.equal(simulation.stats().merges, 0);
  close(simulation.stats().totalVolume, original);
});

test("the sixteen-parcel GPU limit refuses a split without losing any glass", () => {
  const simulation = createLiquidSimulation({
    initialDrops: Array.from({ length: MAX_DROPS }, (_, index) =>
      drop([index === 0 ? 0 : 3, 2 + (index % 3) * 0.25, -index * 0.1], 0.16),
    ),
  });
  const original = simulation.stats().totalVolume;
  assert.equal(
    simulation.interact([0, 2, 3], [0, 0, -1], "split").type,
    "pulse",
  );
  assert.equal(simulation.getDrops().length, MAX_DROPS);
  close(simulation.stats().totalVolume, original);
});

test("contact flows along a new rod, shrinks into the reservoir and forms at another bend", () => {
  const events = [];
  const simulation = createLiquidSimulation({
    initialDrops: [drop([-3.7, 1.5, -3.55], 0.2, { age: 2 })],
    onEvent: (event) => events.push(event),
  });
  const original = simulation.stats().totalVolume;
  simulation.update(FIXED_STEP);
  const returning = simulation.getDrops()[0];
  assert.equal(returning.state, "draining");
  assert.equal(returning.drainSegment, 0);
  advance(simulation, 1.5);
  assert.ok(simulation.stats().reservoirVolume > original * 0.1);
  assert.ok(returning.deform[2] > 1.5);
  close(simulation.stats().totalVolume, original);
  advance(simulation, 3);
  const forming = simulation.getDrops()[0];
  assert.equal(forming.state, "forming");
  assert.ok(!EMITTERS[forming.siteIndex].segmentIndices.includes(0));
  assert.equal(forming.emitterId, EMITTERS[forming.siteIndex].id);
  advance(simulation, 8);
  assert.ok(events.some((event) => event.type === "detach"));
  close(
    simulation.stats().visibleVolume + simulation.stats().reservoirVolume,
    original,
  );
});

test("ray picking selects the nearest visible liquid and respects its ellipsoid surface", () => {
  const simulation = createLiquidSimulation({
    initialDrops: [drop([0, 2, -2], 0.2), drop([0, 2, 0], 0.3)],
  });
  const nearest = simulation.pick([0, 2, 3], [0, 0, -7]);
  assert.equal(nearest.dropId, simulation.getDrops()[1].id);
  close(nearest.distance, 2.7);
  assert.equal(simulation.pick([0, 2, 3], [0, 1, 0]), null);
  assert.equal(simulation.pick([0, 2, 3], [0, 0, 0]), null);
  const selected = nearest.drop;
  selected.orientation = [0, 0, 1];
  selected.deform = [1 / Math.sqrt(2), 1 / Math.sqrt(2), 2];
  close(simulation.pick([0, 2, 3], [0, 0, -1]).distance, 2.4);
});

test("continuous gathering attracts independently drifting drops and announces one three-drop group per hold", () => {
  const events = [];
  const simulation = createLiquidSimulation({
    initialDrops: [
      drop([-1.5, 2, 0], 0.15),
      drop([1.5, 2, 0], 0.15),
      drop([0, 2, -1.5], 0.15),
    ],
    onEvent: (event) => events.push(event),
  });
  simulation.setAttractor([0, 2, 0]);
  advance(simulation, 2);
  assert.equal(simulation.stats().gatheredCount, 3);
  assert.equal(events.filter((event) => event.type === "gather").length, 1);
  simulation.setAttractor([0.01, 2, 0]);
  advance(simulation, 0.1);
  assert.equal(events.filter((event) => event.type === "gather").length, 1);
  simulation.setAttractor(null);
  assert.equal(simulation.stats().gatheredCount, 0);
  simulation.setAttractor([0, 2, 0]);
  advance(simulation, 0.1);
  assert.equal(events.filter((event) => event.type === "gather").length, 2);
});

test("reset restores the seeded installation exactly after interactions and lifecycle changes", () => {
  const simulation = createLiquidSimulation({ seed: 713 });
  const original = structuredClone(simulation.getDrops());
  simulation.setAttractor([0, 2, 0]);
  advance(simulation, 20);
  simulation.interact([0, 2, 3], [0, 0, -1], "push");
  simulation.reset();
  assert.deepEqual(simulation.getDrops(), original);
  assert.equal(simulation.stats().interactions, 0);
});
