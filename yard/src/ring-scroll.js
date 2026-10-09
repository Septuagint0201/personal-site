const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Wheel pixels move the same angular spring as buttons. Browser-generated
 * trackpad momentum is consumed directly, without adding a second fling. */
export function createRingScroll({ navigator, count, viewportHeight = () => 720,
  reducedMotion = false, idleMs = 140 } = {}) {
  const step = Math.PI * 2 / count;
  let active = false, dragging = false, lastTime = 0, origin = 0, dragOrigin = 0, total = 0, stepped = false;
  let still = Boolean(reducedMotion);
  function finish() {
    if (!active) return;
    if (still && dragging && Math.abs(total) >= 40) navigator.step(Math.sign(total));
    if (!still) {
      const travel = (navigator.targetRotation - origin) / step;
      // A deliberate short wheel notch should advance, while tiny accidental
      // touchpad movement returns to the same card. Longer gestures snap nearest.
      if (Math.abs(travel) >= 0.2 && Math.abs(travel) < 0.5)
        navigator.seek(origin + Math.sign(travel) * step);
      navigator.snap();
    }
    active = false;
    dragging = false;
  }
  return {
    get active() { return active; },
    get waiting() { return active && !dragging; },
    wheel(event, now) {
      if (dragging || event.ctrlKey || event.metaKey || event.defaultPrevented) return false;
      const x = event.deltaX || 0, y = event.deltaY || 0;
      const raw = Math.abs(y) >= Math.abs(x) ? y : x;
      if (!Number.isFinite(raw) || Math.abs(raw) < 0.01) return false;
      if (active && now - lastTime >= idleMs) finish();
      if (!active) {
        navigator.snap();
        origin = navigator.targetRotation;
        total = 0;
        stepped = false;
      }
      active = true;
      lastTime = now;
      const height = viewportHeight();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
      const pixelsPerCard = clamp(height * 0.32, 180, 300);
      const delta = clamp(raw * unit, -pixelsPerCard * 0.8, pixelsPerCard * 0.8);
      total += delta;
      if (still) {
        if (!stepped && Math.abs(total) >= 40) {
          navigator.step(Math.sign(total));
          stepped = true;
        }
      } else {
        const target = navigator.targetRotation;
        navigator.seek(clamp(target + delta / pixelsPerCard * step,
          Math.min(target, navigator.rotation - step * 1.2),
          Math.max(target, navigator.rotation + step * 1.2)));
      }
      return true;
    },
    update(now) {
      if (active && !dragging && now - lastTime >= idleMs) finish();
      return active;
    },
    beginDrag() {
      // Grabbing a moving card takes over its visible position, not the old
      // wheel destination. This avoids a jump when changing input methods.
      dragOrigin = navigator.rotation;
      navigator.seek(dragOrigin);
      navigator.snap();
      origin = navigator.targetRotation;
      navigator.seek(dragOrigin);
      total = 0;
      active = dragging = true;
    },
    drag(distance, pixelsPerCard = clamp(viewportHeight() * .32, 180, 300)) {
      if (!dragging || !Number.isFinite(distance)) return false;
      total = distance;
      if (!still) navigator.seek(dragOrigin + clamp(distance / Math.max(1, pixelsPerCard), -1.2, 1.2) * step);
      return true;
    },
    endDrag: finish,
    cancel() { active = dragging = false; total = 0; },
    setReducedMotion(value) { finish(); still = Boolean(value); },
  };
}
