// Chapter 02's own instrument: pressure, surface tension and resonant chrome.
// All synthesis runs on Web Audio's clock; no render-loop work or audio downloads.
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const AMBIENT = new Set(["merge", "detach", "return", "split"]);

export function liquidSoundPosition(position, listener) {
  if (!position || !listener?.position) return { pan: 0, gain: 1 };
  const delta = position.map((value, i) => value - listener.position[i]);
  const distance = Math.hypot(...delta);
  const yaw = listener.yaw || 0;
  return {
    pan: clamp((delta[0] * Math.cos(yaw) + delta[2] * Math.sin(yaw)) / Math.max(1, distance), -0.92, 0.92),
    gain: 1 / (1 + 0.09 * distance * distance),
  };
}

/** Also accepts OfflineAudioContext for auditions using the actual instrument. */
export function createLiquidSoundscape(context, { random = Math.random } = {}) {
  const voices = new Set(), nodes = [], lastEvents = new Map();
  let disposed = false, gatherVoices = [], lastAmbient = -Infinity;
  const node = (value) => { nodes.push(value); return value; };
  const bus = node(context.createGain());
  const master = node(context.createGain());
  master.gain.value = 0.7;
  const limiter = node(context.createDynamicsCompressor());
  limiter.threshold.value = -9;
  limiter.knee.value = 12;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.2;
  bus.connect(master);
  master.connect(limiter).connect(context.destination);
  const shade = node(context.createBiquadFilter());
  shade.type = "lowpass";
  shade.frequency.value = 2100;
  bus.connect(shade);
  // Finite, dark reflections: no feedback loop and no convolution processor.
  for (const [time, level, pan] of [[0.113, 0.22, -0.65], [0.237, 0.14, 0.6], [0.419, 0.08, -0.2]]) {
    const delay = node(context.createDelay(0.5));
    const wet = node(context.createGain());
    const spread = node(context.createStereoPanner());
    delay.delayTime.value = time;
    wet.gain.value = level;
    spread.pan.value = pan;
    shade.connect(delay).connect(wet).connect(spread).connect(master);
  }
  const noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.35), context.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = random() * 2 - 1;

  function voice({ frequency = 220, to = frequency, level = 0.08, duration = 0.6, attack = 0.012,
    pan = 0, panTo = pan, at = context.currentTime, type = "sine", sustained = false }) {
    if (disposed || voices.size >= 32) return null;
    const source = type === "noise" ? context.createBufferSource() : context.createOscillator();
    const envelope = context.createGain(), spread = context.createStereoPanner();
    let filter;
    if (type === "noise") {
      source.buffer = noise;
      filter = context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = frequency;
      filter.Q.value = 0.8;
      source.connect(filter).connect(envelope);
    } else {
      source.type = type;
      source.frequency.setValueAtTime(frequency, at);
      if (!sustained) source.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + duration * 0.8);
      source.connect(envelope);
    }
    envelope.connect(spread).connect(bus);
    spread.pan.setValueAtTime(pan, at);
    spread.pan.linearRampToValueAtTime(panTo, at + duration);
    envelope.gain.setValueAtTime(0, at);
    if (!sustained) {
      envelope.gain.linearRampToValueAtTime(level, at + attack);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      envelope.gain.linearRampToValueAtTime(0, at + duration + 0.02);
    }
    const entry = { source, envelope, spread, filter };
    voices.add(entry);
    source.onended = () => {
      voices.delete(entry);
      for (const part of [source, envelope, spread, filter]) part?.disconnect();
    };
    source.start(at);
    if (!sustained) source.stop(at + duration + 0.03);
    return entry;
  }

  function play(event, listener, at = context.currentTime) {
    if (disposed || !event) return false;
    const kind = event.type;
    // The simulation's split event supplies both manual and automatic division.
    // Ignore split-interaction and generic interact to avoid doubling the sound.
    const ambient = AMBIENT.has(kind) && !(kind === "split" && event.reason === "interaction");
    if (!["arrival", "pulse", "effect", ...AMBIENT].includes(kind)) return false;
    const key = kind === "effect" ? `effect:${event.id}` : kind;
    if (at - (lastEvents.get(key) ?? -Infinity) < (ambient ? 0.45 : kind === "effect" ? 0.8 : 0.065)) return false;
    if (ambient && (at - lastAmbient < 0.18 || voices.size > 16)) return false;
    const spatial = liquidSoundPosition(event.position, listener);
    if (ambient && spatial.gain < 0.06) return false;
    lastEvents.set(key, at);
    if (ambient) lastAmbient = at;
    const gain = spatial.gain * (ambient ? 0.42 : 1);
    const size = clamp(event.radius || 0.3, 0.12, 0.7);
    const pitch = clamp(Math.sqrt(0.3 / size), 0.72, 1.5);
    const pan = spatial.pan;
    const tone = (frequency, to, level, duration, offset = 0, options = {}) => voice({
      frequency: frequency * pitch, to: to * pitch, level: level * gain,
      duration, at: at + offset, pan, ...options,
    });
    if (kind === "pulse") {
      tone(125, 62, 0.2, 0.55);
      tone(610, 195, 0.12, 0.3, 0.008);
      tone(367, 360, 0.055, 1.05, 0.015);
      tone(823, 790, 0.02, 0.65, 0.025);
    } else if (kind === "split") {
      tone(290, 490, 0.095, 0.75, 0, { panTo: clamp(pan - 0.5, -1, 1) });
      tone(285, 148, 0.1, 0.9, 0.035, { panTo: clamp(pan + 0.5, -1, 1) });
      tone(1450, 1450, 0.045, 0.17, 0, { type: "noise", attack: 0.02 });
    } else if (kind === "merge") {
      tone(350, 120, 0.12, 0.52);
      tone(175, 164, 0.08, 1.15, 0.04);
    } else if (kind === "detach") {
      tone(470, 790, 0.065, 0.28);
      tone(235, 220, 0.045, 0.65, 0.04);
    } else if (kind === "return") {
      tone(720, 105, 0.08, 0.8);
      tone(1100, 1100, 0.055, 0.3, 0, { type: "noise", attack: 0.055 });
      tone(330, 328, 0.05, 1.4, 0.09);
    } else if (kind === "arrival") {
      tone(146.83, 146.83, 0.07, 1.5, 0, { attack: 0.18 });
      tone(220, 220, 0.045, 1.8, 0.15, { pan: -0.35, attack: 0.25 });
      tone(293.66, 293.66, 0.03, 1.8, 0.3, { pan: 0.35, attack: 0.25 });
    } else if (event.id === "resonance") {
      for (const [i, frequency] of [110, 220, 329.63, 554.37, 880].entries())
        tone(frequency, frequency * 1.004, 0.075 / (1 + i * 0.3), 3.1 - i * 0.18, i * 0.14,
          { pan: i % 2 ? -0.55 : 0.55, panTo: 0, attack: 0.3 });
    } else if (event.id === "constellation") {
      for (const [i, frequency] of [293.66, 440, 659.25, 587.33, 880, 440].entries())
        tone(frequency, frequency * 0.998, 0.075, 1.9, i * 0.26,
          { pan: [-0.65, 0, 0.65][i % 3], attack: 0.035 });
    } else if (event.id === "afterimage") {
      tone(440, 110, 0.13, 3.4, 0, { pan: -0.6, panTo: 0.6, attack: 0.8 });
      tone(660, 164.81, 0.065, 3, 0.2, { pan: 0.6, panTo: -0.6, attack: 0.9 });
      tone(1800, 1800, 0.045, 0.32, 1.1, { type: "noise", attack: 0.22 });
    }
    return true;
  }

  function setGathering(active, count = 0, at = context.currentTime) {
    if (disposed) return;
    if (!active) {
      for (const entry of gatherVoices) {
        entry.envelope.gain.cancelAndHoldAtTime(at);
        entry.envelope.gain.linearRampToValueAtTime(0, at + 0.3);
        entry.source.stop(at + 0.32);
      }
      gatherVoices = [];
      return;
    }
    if (!gatherVoices.length) {
      gatherVoices = [110, 165.2].map((frequency, i) => voice({ frequency, level: 0.018,
        sustained: true, attack: 0.25, at, pan: i ? 0.35 : -0.35 })).filter(Boolean);
    }
    const density = clamp(count / 6, 0, 1);
    gatherVoices.forEach((entry, i) => {
      entry.envelope.gain.setTargetAtTime(0.018 + density * 0.025, at, 0.22);
      entry.source.frequency.setTargetAtTime((i ? 165.2 : 110) * (1 + density * 0.025), at, 0.3);
    });
  }

  return {
    play, setGathering,
    dispose() {
      if (disposed) return;
      disposed = true;
      // Disconnect the complete room, including delay tails, before suspension.
      for (const entry of voices) {
        entry.source.stop();
        entry.source.onended = null;
        for (const part of [entry.source, entry.envelope, entry.spread, entry.filter]) part?.disconnect();
      }
      voices.clear();
      gatherVoices = [];
      for (const part of nodes) part.disconnect();
    },
  };
}

/** Gesture-gated lifecycle; sound preference is deliberately never persisted. */
export function createLiquidAudio({ onChange = () => {}, document: page = globalThis.document,
  createContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)(),
  createSoundscape = createLiquidSoundscape } = {}) {
  let context, room, requested = false, disposed = false, revision = 0;
  let gathering = false, nearby = 0;
  function silence() {
    room?.dispose();
    room = null;
    if (context && context.state !== "closed") context.suspend().catch(() => {});
  }
  async function activate(arrival) {
    const version = ++revision;
    try {
      context ??= createContext();
      await context.resume();
      if (disposed || version !== revision || !requested || page?.hidden) return;
      if (context.state !== "running") throw new Error("Audio did not start");
      room ??= createSoundscape(context);
      room.setGathering(gathering, nearby);
      if (arrival) room.play({ type: "arrival" });
      onChange(true);
    } catch {
      if (disposed || version !== revision) return;
      requested = false;
      silence();
      onChange(false, "Sound could not start. Tap Sound to try again.");
    }
  }
  function visibility() {
    if (disposed) return;
    if (page.hidden) {
      revision++;
      gathering = false;
      silence();
    } else if (requested) void activate(false);
  }
  page?.addEventListener("visibilitychange", visibility);
  onChange(false);
  return {
    async toggleAudio() {
      if (disposed) return;
      requested = !requested;
      if (requested && !page?.hidden) await activate(true);
      else {
        revision++;
        silence();
        onChange(false);
      }
    },
    play(event, listener) { return room?.play(event, listener) ?? false; },
    setGathering(active, count = 0) {
      gathering = Boolean(active) && !page?.hidden;
      nearby = count;
      room?.setGathering(gathering, nearby);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      requested = false;
      revision++;
      page?.removeEventListener("visibilitychange", visibility);
      room?.dispose();
      room = null;
      context?.close().catch(() => {});
    },
  };
}
