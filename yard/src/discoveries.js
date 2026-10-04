const STORAGE_KEY = 'yard-discoveries-v1';

const SECRETS = Object.freeze({
  resonance: {
    title: 'Resonance',
    message: 'Five touches. One shared frequency.',
  },
  gravity: {
    title: 'Zero gravity',
    message: 'Hold a moment. Let everything else go.',
  },
  constellation: {
    title: 'A little universe',
    message: 'Some worlds only appear when you look twice. Or three times.',
  },
});

/** A quiet, gesture-enabled synthesizer. Nothing plays until toggleAudio(). */
export function createGlassAudio(onAudioChange = () => {}) {
  let context = null;
  let master = null;
  let enabled = false;
  let requestedEnabled = false;
  let disposed = false;
  let revision = 0;
  let noteIndex = 0;
  const voices = new Set();
  const doc = typeof document === 'undefined' ? null : document;

  function report(value, reason) {
    if (!disposed) onAudioChange(value, reason);
  }

  function stopVoices() {
    for (const voice of voices) {
      try { voice.oscillator.stop(); } catch { /* Already stopped. */ }
      voice.cleanup();
    }
  }

  async function suspend() {
    stopVoices();
    if (context && context.state === 'running') {
      try { await context.suspend(); } catch { /* Backgrounding is best effort. */ }
    }
  }

  function ensureContext() {
    if (context) return context;
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Audio is not available in this browser.');
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = 0.42;
    master.connect(context.destination);
    return context;
  }

  async function toggleAudio() {
    if (disposed) return false;
    requestedEnabled = !requestedEnabled;
    const currentRevision = ++revision;
    if (!requestedEnabled) {
      enabled = false;
      report(false);
      await suspend();
      return false;
    }

    try {
      const ctx = ensureContext();
      await ctx.resume();
      if (disposed || currentRevision !== revision || !requestedEnabled) {
        if (!requestedEnabled) await suspend();
        return enabled;
      }
      if (ctx.state !== 'running') throw new Error('Tap sound again to allow audio.');
      enabled = true;
      report(true);
      if (doc?.hidden) await suspend();
      else playChime('welcome');
      return true;
    } catch (error) {
      if (currentRevision !== revision || disposed) return enabled;
      enabled = false;
      requestedEnabled = false;
      report(false, error?.message || 'Audio could not start. Try sound again.');
      return false;
    }
  }

  function tone(frequency, offset, pan, duration = 1.05) {
    if (!context || !master || voices.size > 42) return;
    const start = context.currentTime + offset;
    const panner = context.createStereoPanner?.() || context.createGain();
    if (panner.pan) panner.pan.value = pan;
    panner.connect(master);
    let remaining = 3;

    // Slightly inharmonic upper partials give the notes a glass-like shimmer.
    for (const [multiple, level] of [[1, 0.09], [2.003, 0.032], [4.011, 0.008]]) {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency * multiple;
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(level, start + 0.009);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration / Math.sqrt(multiple));
      oscillator.connect(envelope);
      envelope.connect(panner);
      let cleaned = false;
      const voice = {
        oscillator,
        cleanup() {
          if (cleaned) return;
          cleaned = true;
          oscillator.disconnect();
          envelope.disconnect();
          voices.delete(voice);
          remaining -= 1;
          if (!remaining) panner.disconnect();
        },
      };
      voices.add(voice);
      oscillator.onended = voice.cleanup;
      oscillator.start(start);
      oscillator.stop(start + duration + 0.03);
    }
  }

  function playChime(kind = 'hit') {
    if (disposed || !enabled || !requestedEnabled || doc?.hidden || context?.state !== 'running') return;
    const scale = [523.25, 659.25, 783.99, 987.77, 1046.5];
    if (kind === 'hit') {
      const index = noteIndex++ % scale.length;
      tone(scale[index], 0, (index - 2) * 0.17, 0.85);
    } else if (kind === 'gravity') {
      [783.99, 659.25, 523.25, 392].forEach((frequency, index) => {
        tone(frequency, index * 0.1, 0.4 - index * 0.26, 1.35);
      });
    } else {
      const notes = kind === 'welcome' ? [659.25, 987.77] : scale;
      notes.forEach((frequency, index) => {
        tone(frequency, index * 0.085, -0.4 + index * 0.2, 1.1);
      });
    }
  }

  async function onVisibilityChange() {
    if (disposed || !context) return;
    if (doc?.hidden) {
      await suspend();
      return;
    }
    if (!requestedEnabled || !enabled) return;
    const currentRevision = revision;
    try {
      await context.resume();
      if (disposed || currentRevision !== revision) return;
      if (context.state !== 'running') throw new Error('Tap sound again to resume audio.');
    } catch {
      if (disposed || currentRevision !== revision) return;
      enabled = false;
      requestedEnabled = false;
      report(false, 'Tap sound again to resume audio.');
    }
  }

  doc?.addEventListener('visibilitychange', onVisibilityChange);

  return {
    toggleAudio,
    isAudioEnabled: () => enabled,
    playChime,
    resetAudio() {
      revision += 1;
      requestedEnabled = false;
      enabled = false;
      report(false);
      return suspend();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      revision += 1;
      enabled = false;
      requestedEnabled = false;
      doc?.removeEventListener('visibilitychange', onVisibilityChange);
      stopVoices();
      master?.disconnect();
      if (context && context.state !== 'closed') context.close().catch(() => {});
    },
  };
}

/** Gestures unlock visual effects on every trigger, but discovery is stored once. */
export function createDiscoveries({ onUnlock = () => {}, onAudioChange = () => {} } = {}) {
  const discovered = new Set();
  const audio = createGlassAudio(onAudioChange);
  let hits = [];
  let signatures = [];
  let disposed = false;

  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) {
      for (const id of saved) {
        if (typeof id === 'string' && Object.hasOwn(SECRETS, id)) discovered.add(id);
      }
    }
  } catch { /* Private browsing or stale storage should never block the scene. */ }

  const restored = [...discovered];
  queueMicrotask(() => {
    if (disposed) return;
    for (const id of restored) {
      if (disposed) break;
      onUnlock({ id, ...SECRETS[id], isNew: false, restored: true });
    }
  });

  function unlock(id) {
    if (disposed) return;
    const isNew = !discovered.has(id);
    if (isNew) {
      discovered.add(id);
      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...discovered]));
      } catch { /* Discovery still works without persistent storage. */ }
    }
    audio.playChime(id);
    onUnlock({ id, ...SECRETS[id], isNew, restored: false });
  }

  return {
    hit() {
      if (disposed) return;
      audio.playChime('hit');
      const now = performance.now();
      hits = hits.filter((time) => now - time <= 5000);
      hits.push(now);
      if (hits.length >= 5) {
        hits = [];
        unlock('resonance');
      }
    },
    hold() {
      unlock('gravity');
    },
    signature() {
      if (disposed) return;
      const now = performance.now();
      signatures = signatures.filter((time) => now - time <= 3000);
      signatures.push(now);
      if (signatures.length >= 3) {
        signatures = [];
        unlock('constellation');
      }
    },
    replay(id) {
      if (discovered.has(id)) unlock(id);
    },
    toggleAudio: audio.toggleAudio,
    isAudioEnabled: audio.isAudioEnabled,
    resetAudio: audio.resetAudio,
    dispose() {
      if (disposed) return;
      disposed = true;
      hits = [];
      signatures = [];
      audio.dispose();
    },
  };
}
