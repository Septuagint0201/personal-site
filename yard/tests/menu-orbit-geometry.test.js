import test from "node:test";
import assert from "node:assert/strict";
import { createViewportRingGeometry } from "../src/menu-orbit-geometry.js";

const tolerance = 1e-8;

function visibleFraction(edges, viewportHeight) {
  const [top, bottom] = edges.map((edge) => edge + viewportHeight / 2);
  return (
    Math.max(0, Math.min(viewportHeight, bottom) - Math.max(0, top)) /
    (bottom - top)
  );
}

for (const viewportHeight of [568, 720, 844, 900, 1440]) {
  for (const count of [3, 4, 5]) {
    test(`${viewportHeight}px viewport with ${count} cards clips neighbours at screen edges`, () => {
      const cardHeight = Math.min(400, viewportHeight * 0.37);
      const ring = createViewportRingGeometry({
        viewportHeight,
        cardHeight,
        count,
      });
      const step = (Math.PI * 2) / count;
      const edges = (logical) => ring.projectEdges(ring.angle(logical));

      assert.ok(ring.radius * 2 > viewportHeight * 1.5);
      assert.equal(ring.perspective, ring.radius * 4);
      assert.ok(ring.preview > 0 && ring.preview < step / 2);
      assert.deepEqual(edges(0), [-cardHeight / 2, cardHeight / 2]);

      for (const direction of [-1, 1]) {
        const neighbour = edges(direction * step);
        assert.ok(
          Math.abs(visibleFraction(neighbour, viewportHeight) - 0.66) <
            tolerance,
          "neutral exposure measures the viewport, not overlap with the front card",
        );
        assert.ok(
          direction < 0
            ? neighbour[0] < -viewportHeight / 2
            : neighbour[1] > viewportHeight / 2,
          "the viewport edge must cut through the neighbour",
        );

        const offset = -direction * ring.preview;
        const approached = edges(direction * step + offset);
        const receding = edges(-direction * step + offset);
        assert.ok(
          Math.abs(visibleFraction(approached, viewportHeight) - 0.9) <
            tolerance,
          "the approached card exposes 90 percent within the viewport",
        );
        assert.ok(visibleFraction(receding, viewportHeight) < 0.66);
      }

      // Also sample between the centre and either pointer extreme: no preview
      // state can obscure the main card's content or its entry link.
      for (let sample = -20; sample <= 20; sample++) {
        const offset = (sample / 20) * ring.preview;
        const front = edges(offset);
        const upper = edges(-step + offset);
        const lower = edges(step + offset);
        assert.ok(
          Math.abs(visibleFraction(front, viewportHeight) - 1) < tolerance,
        );
        assert.ok(
          upper[1] < front[0],
          "upper card stays clear of the selected card",
        );
        assert.ok(
          front[1] < lower[0],
          "lower card stays clear of the selected card",
        );
      }
    });
  }
}

test("ring geometry rejects impossible dimensions", () => {
  assert.throws(
    () =>
      createViewportRingGeometry({
        viewportHeight: 0,
        cardHeight: 100,
        count: 3,
      }),
    RangeError,
  );
  assert.throws(
    () =>
      createViewportRingGeometry({
        viewportHeight: 720,
        cardHeight: 720,
        count: 3,
      }),
    RangeError,
  );
  assert.throws(
    () =>
      createViewportRingGeometry({
        viewportHeight: 720,
        cardHeight: 260,
        count: 2,
      }),
    RangeError,
  );
});


test("the ring bows toward an outside camera without moving its main stop", () => {
  const viewportHeight = 900;
  const cardHeight = viewportHeight * 0.37;
  const ring = createViewportRingGeometry({ viewportHeight, cardHeight, count: 3 });
  const theta = 0.4;
  const radius = viewportHeight * 0.82;
  const perspective = radius * 4;
  const centerZ = radius * (1 - Math.cos(theta));
  assert.equal(ring.radius, radius);
  assert.equal(ring.perspective, perspective);
  assert.ok(centerZ > 0, "neighbours bend toward the camera");
  assert.ok(perspective > radius * 2, "the camera is outside the ring");
  assert.deepEqual(ring.projectEdges(0), [-cardHeight / 2, cardHeight / 2]);
  const expected = [-cardHeight / 2, cardHeight / 2].map(edge =>
    perspective * (radius * Math.sin(theta) + edge * Math.cos(theta)) /
      (perspective - centerZ + edge * Math.sin(theta)));
  ring.projectEdges(theta).forEach((edge, i) => assert.ok(Math.abs(edge - expected[i]) < tolerance));
});
