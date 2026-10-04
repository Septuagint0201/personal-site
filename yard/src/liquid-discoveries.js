const STORAGE_KEY = "yard-liquid-discoveries-v1";
export const LIQUID_DISCOVERIES = Object.freeze([
  {
    id: "resonance",
    name: "Resonance",
    hint: "Five different drops. One fleeting frequency.",
    description: "Five pulses awaken a wave that passes through every wall.",
    message: "Five touches. The whole room answers.",
    duration: 14000,
  },
  {
    id: "constellation",
    name: "Constellation",
    hint: "Step between the frames. Bring a few wanderers close and hold them a moment.",
    description:
      "Three drifting drops become a small constellation, joined by luminous filaments.",
    message: "A little universe, held in the air.",
    duration: 20000,
  },
  {
    id: "afterimage",
    name: "Afterimage",
    hint: "There is a small mark on the far wall. Go closer.",
    description:
      "A quiet mark drains the colour. Drifting drops leave long traces of light.",
    message: "Turn back. The room remembers the path of light.",
    duration: 20000,
  },
]);

/** Only discovery IDs persist. Simulation state and movement never leave this page. */
export function createLiquidDiscoveries({
  onDiscover,
  onProgress = () => {},
  storage,
  now = () => performance.now(),
} = {}) {
  let saved;
  try {
    storage ??= globalThis.localStorage;
    saved = JSON.parse(storage?.getItem(STORAGE_KEY) || "[]");
  } catch {
    saved = [];
  }
  const known = new Set(LIQUID_DISCOVERIES.map((entry) => entry.id));
  const found = new Set(
    Array.isArray(saved) ? saved.filter((id) => known.has(id)) : [],
  );
  let pulses = [],
    gathering = false,
    clusterStart = null,
    gatherArmed = true;
  function unlock(id) {
    if (found.has(id)) return false;
    const entry = LIQUID_DISCOVERIES.find((item) => item.id === id);
    if (!entry) return false;
    found.add(id);
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify([...found]));
    } catch {
      /* Private browsing retains discoveries for this visit. */
    }
    onDiscover?.(entry, found.size);
    return true;
  }
  return {
    entries: LIQUID_DISCOVERIES,
    has: (id) => found.has(id),
    count: () => found.size,
    event(event) {
      if (!event) return;
      if (event.type === "glyph") unlock("afterimage");
      if (event.type !== "pulse" || event.dropId == null) return;
      const time = now();
      pulses = pulses.filter(
        (item) => time - item.time <= 8000 && item.id !== event.dropId,
      );
      pulses.push({ id: event.dropId, time });
      if (pulses.length >= 5) unlock("resonance");
    },
    setGathering(value) {
      gathering = Boolean(value);
      if (!gathering) {
        clusterStart = null;
        gatherArmed = true;
        onProgress(0);
      }
    },
    update(nearbyCount) {
      if (!gathering || nearbyCount < 3) {
        clusterStart = null;
        onProgress(0);
        return;
      }
      const time = now();
      clusterStart ??= time;
      const progress = Math.min(1, (time - clusterStart) / 3000);
      onProgress(progress);
      if (progress >= 1 && gatherArmed) {
        gatherArmed = false;
        unlock("constellation");
      }
    },
    resetInput() {
      gathering = false;
      clusterStart = null;
      gatherArmed = true;
      pulses = [];
      onProgress(0);
    },
  };
}
