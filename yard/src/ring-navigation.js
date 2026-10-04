const TAU = Math.PI * 2;
const wrap = (angle) => ((((angle + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const modulo = (value, length) => ((value % length) + length) % length;

/** Shared angular spring. Directional selection always advances exactly one stop. */
export function createRingNavigator({
  count,
  stops,
  initial = 0,
  onChange,
  previewAngle = 0.16,
  stiffness = 120,
  damping = 22,
  reducedMotion = false,
} = {}) {
  if (!Number.isInteger(count) || count < 2)
    throw new RangeError("A ring needs at least two stops.");
  const positions = stops
    ? [...stops]
    : Array.from({ length: count }, (_, i) => (i * TAU) / count);
  if (
    positions.length !== count ||
    positions.some(
      (v, i) =>
        !Number.isFinite(v) ||
        v < 0 ||
        v >= TAU ||
        (i && v <= positions[i - 1]),
    )
  )
    throw new RangeError("Ring stops must be increasing angles in [0, 2π).");
  let index = modulo(initial, count),
    target = positions[index],
    rotation = target,
    velocity = 0,
    preview = 0;
  let still = Boolean(reducedMotion);
  function changed(next, direction, distance) {
    index = next;
    target += distance;
    preview = 0;
    if (still) {
      rotation = target;
      velocity = 0;
    }
    onChange?.(index, direction);
    return index;
  }
  return {
    get index() {
      return index;
    },
    get rotation() {
      return rotation;
    },
    get targetRotation() {
      return target;
    },
    angle(i) {
      return wrap(positions[modulo(i, count)] - rotation);
    },
    step(direction) {
      const sign = Math.sign(direction);
      if (!sign) return index;
      const next = modulo(index + sign, count);
      let distance = positions[next] - positions[index];
      if (sign > 0 && distance <= 0) distance += TAU;
      if (sign < 0 && distance >= 0) distance -= TAU;
      return changed(next, sign, distance);
    },
    select(next) {
      next = modulo(Math.round(next), count);
      if (next === index) return index;
      const distance = wrap(positions[next] - positions[index]);
      return changed(next, Math.sign(distance), distance);
    },
    setPreview(value) {
      preview = still ? 0 : Math.max(-1, Math.min(1, value)) * previewAngle;
    },
    setReducedMotion(value) {
      still = Boolean(value);
      if (still) {
        preview = 0;
        rotation = target;
        velocity = 0;
      }
    },
    update(delta) {
      const desired = target + preview;
      if (still) {
        rotation = target;
        velocity = 0;
        return false;
      }
      let remaining = Math.max(0, Math.min(delta || 0, 0.08));
      while (remaining > 0) {
        const dt = Math.min(remaining, 1 / 120);
        velocity +=
          ((desired - rotation) * stiffness - velocity * damping) * dt;
        rotation += velocity * dt;
        remaining -= dt;
      }
      const moving = Math.abs(desired - rotation) + Math.abs(velocity) > 0.0001;
      if (!moving) {
        rotation = desired;
        velocity = 0;
      }
      return moving;
    },
    reset(next = 0) {
      index = modulo(next, count);
      target = rotation = positions[index];
      velocity = preview = 0;
      onChange?.(index, 0);
    },
  };
}
