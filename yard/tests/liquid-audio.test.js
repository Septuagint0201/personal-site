import test from "node:test";
import assert from "node:assert/strict";
import { createLiquidAudio, createLiquidSoundscape, liquidSoundPosition } from "../src/liquid-audio.js";

function lifecycle({ deferred = false, fail = false } = {}) {
  const page = new EventTarget();
  page.hidden = false;
  const rooms = [], changes = [], resumes = [];
  let creations = 0;
  const context = {
    state: "suspended",
    resume() {
      if (fail) return Promise.reject(new Error("blocked"));
      this.state = "running";
      return deferred ? new Promise(resolve => resumes.push(resolve)) : Promise.resolve();
    },
    suspend() { this.state = "suspended"; return Promise.resolve(); },
    close() { this.state = "closed"; return Promise.resolve(); },
  };
  const audio = createLiquidAudio({
    document: page,
    createContext: () => { creations++; return context; },
    onChange: (...value) => changes.push(value),
    createSoundscape: () => {
      const room = { events: [], gathers: [], disposed: false,
        play(event) { this.events.push(event); return true; },
        setGathering(...args) { this.gathers.push(args); },
        dispose() { this.disposed = true; },
      };
      rooms.push(room);
      return room;
    },
  });
  return { audio, page, rooms, changes, resumes, context, creations: () => creations,
    hide(value) { page.hidden = value; page.dispatchEvent(new Event("visibilitychange")); } };
}

test("Chapter 02 stays silent without constructing an audio context until enabled", async () => {
  const t = lifecycle();
  assert.equal(t.audio.play({ type: "pulse" }), false);
  t.audio.setGathering(true, 4);
  assert.equal(t.creations(), 0);
  await t.audio.toggleAudio();
  assert.equal(t.creations(), 1);
  assert.deepEqual(t.rooms[0].events, [{ type: "arrival" }]);
  assert.deepEqual(t.rooms[0].gathers.at(-1), [true, 4]);
  await t.audio.toggleAudio();
  assert.equal(t.rooms[0].disposed, true);
  assert.equal(t.context.state, "suspended");
  assert.equal(t.audio.play({ type: "pulse" }), false);
  await t.audio.toggleAudio();
  assert.equal(t.rooms.length, 2, "old echo buffers must never be reused");
  assert.equal(t.creations(), 1, "reuse the unlocked context");
  t.audio.dispose();
});

test("a late resume cannot turn sound back on after mute or disposal", async () => {
  for (const dispose of [false, true]) {
    const t = lifecycle({ deferred: true });
    const pending = t.audio.toggleAudio();
    if (dispose) t.audio.dispose();
    else await t.audio.toggleAudio();
    t.resumes.shift()();
    await pending;
    assert.equal(t.rooms.length, 0);
    assert.equal(t.changes.some(([enabled]) => enabled), false);
  }
});

test("rapid on/off/on honours only the latest request", async () => {
  const t = lifecycle({ deferred: true });
  const first = t.audio.toggleAudio();
  await t.audio.toggleAudio();
  const latest = t.audio.toggleAudio();
  t.resumes.shift()();
  await first;
  assert.equal(t.rooms.length, 0);
  t.resumes.shift()();
  await latest;
  assert.equal(t.rooms.length, 1);
  assert.equal(t.changes.at(-1)[0], true);
  t.audio.dispose();
});

test("backgrounding clears held sound and tails; returning restores only the enabled instrument", async () => {
  const t = lifecycle();
  await t.audio.toggleAudio();
  t.audio.setGathering(true, 5);
  t.hide(true);
  assert.equal(t.context.state, "suspended");
  assert.equal(t.rooms[0].disposed, true);
  t.hide(false);
  await Promise.resolve();
  assert.equal(t.rooms.length, 2);
  assert.deepEqual(t.rooms[1].gathers.at(-1), [false, 5]);
  assert.deepEqual(t.rooms[1].events, [], "do not replay arrival on focus");
  await t.audio.toggleAudio();
  t.hide(true);
  t.hide(false);
  await Promise.resolve();
  assert.equal(t.rooms.length, 2, "muted sound must stay muted");
  t.audio.dispose();
  t.hide(true);
  t.hide(false);
  assert.equal(t.context.state, "closed");
});

test("audio resume failures return an actionable message without breaking input", async () => {
  const t = lifecycle({ fail: true });
  await t.audio.toggleAudio();
  assert.equal(t.changes.at(-1)[0], false);
  assert.match(t.changes.at(-1)[1], /try again/);
  assert.equal(t.rooms.length, 0);
  t.audio.dispose();
});

test("spatial placement follows yaw and attenuates distance without a near-field singularity", () => {
  const listener = { position: [0, 0, 0], yaw: 0 };
  assert.ok(liquidSoundPosition([2, 0, 0], listener).pan > 0);
  assert.ok(liquidSoundPosition([-2, 0, 0], listener).pan < 0);
  assert.ok(liquidSoundPosition([2, 0, 0], { ...listener, yaw: Math.PI }).pan < 0);
  assert.ok(liquidSoundPosition([0, 0, -2], listener).gain > liquidSoundPosition([0, 0, -8], listener).gain);
  assert.deepEqual(liquidSoundPosition([0, 0, 0], listener), { pan: 0, gain: 1 });
});

// Lifecycle model of the Web Audio nodes; browser OfflineAudioContext checks the
// actual waveforms. Keep sources alive until their scheduled stop to test caps.
function audioContext() {
  const nodes = [], sources = [];
  const parameter = () => ({ value: 0,
    setValueAtTime(value) { this.value = value; },
    linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
    setTargetAtTime() { this.targets = (this.targets || 0) + 1; }, cancelAndHoldAtTime() {},
  });
  const node = () => {
    const value = { connections: [], connect(other) { this.connections.push(other); return other; },
      disconnect() { this.connections = []; } };
    for (const name of ["gain", "pan", "frequency", "Q", "threshold", "knee", "ratio", "attack", "release", "delayTime"])
      value[name] = parameter();
    nodes.push(value);
    return value;
  };
  const source = () => {
    const value = node();
    value.start = () => { value.started = true; };
    value.stop = (time = 0) => { value.stopTime = time; };
    sources.push(value);
    return value;
  };
  const context = { currentTime: 0, sampleRate: 8000, destination: node(),
    createGain: node, createDynamicsCompressor: node, createBiquadFilter: node,
    createDelay: node, createStereoPanner: node,
    createOscillator: source, createBufferSource: source,
    createBuffer: (_, length) => ({ getChannelData: () => new Float32Array(length) }),
  };
  return { context, nodes, sources, tick(time) {
    context.currentTime = time;
    for (const value of sources) if (value.stopTime <= time && !value.ended) {
      value.ended = true;
      value.onended?.();
    }
  } };
}

test("ambient bursts are bounded while a manual division still gets one distinct cue", () => {
  const t = audioContext(), room = createLiquidSoundscape(t.context);
  assert.equal(room.play({ type: "merge" }), true);
  const before = t.sources.length;
  for (let i = 0; i < 100; i++) room.play({ type: "merge" });
  assert.equal(t.sources.length, before);
  assert.equal(room.play({ type: "split", reason: "interaction" }), true);
  const after = t.sources.length;
  assert.equal(room.play({ type: "split-interaction" }), false);
  assert.equal(room.play({ type: "interact" }), false);
  assert.equal(t.sources.length, after);
  for (let i = 1; i < 50; i++) room.play({ type: "pulse" }, undefined, i * 0.1);
  assert.ok(t.sources.length <= 32);
  t.tick(10);
  const expired = t.sources.length;
  assert.equal(room.play({ type: "pulse" }), true);
  assert.ok(t.sources.length > expired, "ended voices free capacity");
  room.dispose();
  assert.ok(t.nodes.every(value => value.connections.length === 0));
});

test("Gather density updates do not allocate more sources and release finishes all held voices", () => {
  const t = audioContext(), room = createLiquidSoundscape(t.context);
  for (let i = 0; i < 1000; i++) room.setGathering(true, i % 7);
  assert.equal(t.sources.length, 2);
  assert.ok(t.sources.every(source => source.stopTime === undefined));
  room.setGathering(false);
  t.tick(0.4);
  assert.ok(t.sources.every(source => source.ended));
  room.setGathering(true, 3);
  room.dispose();
  room.dispose();
  assert.ok(t.sources.every(source => Number.isFinite(source.stopTime)));
  assert.equal(room.play({ type: "pulse" }), false);
});

test("an unchanged Gather density does not accumulate audio automation events", () => {
  const t = audioContext(), room = createLiquidSoundscape(t.context);
  for (let i = 0; i < 1000; i++) room.setGathering(true, 3);
  assert.ok(t.sources.every(source => source.frequency.targets === 1));
  room.setGathering(true, 6);
  assert.ok(t.sources.every(source => source.frequency.targets === 2));
  room.setGathering(false);
  t.tick(1);
  room.setGathering(true, 6);
  assert.ok(t.sources.slice(-2).every(source => source.frequency.targets === 1));
  room.dispose();
});
