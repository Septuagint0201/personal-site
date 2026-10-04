import test from "node:test";
import assert from "node:assert/strict";
import { createLiquidDiscoveries } from "../src/liquid-discoveries.js";

function setup(saved = "[]") {
  let time = 0,
    value = saved;
  const events = [];
  const discoveries = createLiquidDiscoveries({
    now: () => time,
    storage: {
      getItem: () => value,
      setItem: (_, v) => {
        value = v;
      },
    },
    onDiscover: (e) => events.push(e.id),
  });
  return {
    discoveries,
    events,
    tick: (n) => {
      time += n;
    },
    saved: () => JSON.parse(value),
  };
}
test("resonance needs five different recent targets and is saved once", () => {
  const t = setup();
  for (let i = 0; i < 6; i++) t.discoveries.event({ type: "pulse", dropId: 1 });
  assert.equal(t.discoveries.count(), 0);
  for (let i = 2; i <= 5; i++) {
    t.tick(300);
    t.discoveries.event({ type: "pulse", dropId: i });
  }
  assert.deepEqual(t.events, ["resonance"]);
  assert.deepEqual(t.saved(), ["resonance"]);
  t.discoveries.event({ type: "pulse", dropId: 6 });
  assert.equal(t.events.length, 1);
});
test("old pulses do not count toward the eight-second sequence", () => {
  const t = setup();
  for (let i = 1; i <= 4; i++)
    t.discoveries.event({ type: "pulse", dropId: i });
  t.tick(8001);
  t.discoveries.event({ type: "pulse", dropId: 5 });
  assert.equal(t.discoveries.count(), 0);
});
test("constellation requires a continuous cluster while gathering", () => {
  const t = setup();
  t.discoveries.setGathering(true);
  t.discoveries.update(3);
  t.tick(2900);
  t.discoveries.update(3);
  assert.equal(t.discoveries.count(), 0);
  t.discoveries.update(2);
  t.tick(200);
  t.discoveries.update(3);
  t.tick(3000);
  t.discoveries.update(3);
  assert.deepEqual(t.events, ["constellation"]);
});
test("releasing the control or hiding the document clears held discovery input", () => {
  const t = setup();
  t.discoveries.setGathering(true);
  t.discoveries.update(4);
  t.tick(2500);
  t.discoveries.resetInput();
  t.tick(1000);
  t.discoveries.update(4);
  assert.equal(t.discoveries.count(), 0);
});
test("the wall mark is the third independent secret, with only known IDs persisted", () => {
  const t = setup('["resonance","unknown"]');
  assert.equal(t.discoveries.count(), 1);
  t.discoveries.event({ type: "glyph" });
  assert.deepEqual(t.saved(), ["resonance", "afterimage"]);
  assert.equal(t.discoveries.entries.length, 3);
});
