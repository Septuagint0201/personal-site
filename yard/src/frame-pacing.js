/** Carry the deadline across refreshes instead of resetting it after each draw. */
export function createFramePacer(rate) {
  const interval = 1000 / rate;
  let next = null;
  return {
    ready(now, force = false) {
      if (!force && next !== null && now + 0.25 < next) return false;
      // Long stalls/hidden tabs start fresh rather than creating catch-up bursts.
      next = force || next === null || now - next > interval * 3
        ? now + interval
        : next + interval;
      return true;
    },
    reset() { next = null; },
  };
}
