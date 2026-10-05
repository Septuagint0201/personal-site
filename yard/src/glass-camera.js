const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const wrap = angle => ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
const modulo = (value, count) => ((value % count) + count) % count;

// Keep the original sculpture size while bringing the eye toward the arch.
// Both orbit radii fit between the sculpture and the wall at z = -6.
export function glassCameraFraming(portrait = false) {
  return { fov: portrait ? 76 : 57, position: [0, 0.65, portrait ? 5.6 : 5.5] };
}

/** A drag traversing the viewport turns through one visible field of view. */
export function glassDragAngles(dx, dy, width, height, verticalFov) {
  const vertical = verticalFov * Math.PI / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * width / height);
  return [dx / Math.max(1, width) * horizontal, dy / Math.max(1, height) * vertical];
}

/** Ring identity, not projection, determines a clicked work's direction.
 * An opposite work on an even ring consistently chooses the forward arc.
 */
export function glassClickDirection(selected, clicked, count) {
  const forward = modulo(clicked - selected, count);
  if (!forward) return 0;
  return forward <= count / 2 ? 1 : -1;
}

/** Camera-only interaction: orbit follows a focus; free look freezes position. */
export function createGlassCamera({ portrait = false } = {}) {
  let framing = glassCameraFraming(portrait);
  let position = [...framing.position];
  let yaw = 0, pitch = -Math.atan2(position[1], position[2]);
  let targetYaw = yaw, targetPitch = pitch;
  let mode = 'home', azimuth = 0, elevation = -pitch, radius = Math.hypot(...position);
  let targetAzimuth = azimuth, targetElevation = elevation;

  function home() {
    mode = 'home';
    targetYaw = yaw + wrap(-yaw);
    targetPitch = -Math.atan2(framing.position[1], framing.position[2]);
  }
  return {
    get mode() { return mode; },
    get fov() { return framing.fov; },
    get pose() { return { position: [...position], yaw, pitch }; },
    get moving() {
      if (mode === 'orbit') return Math.abs(targetAzimuth - azimuth) + Math.abs(targetElevation - elevation) > 0.0001;
      const travel = mode === 'home' ? Math.hypot(...position.map((value, axis) => framing.position[axis] - value)) : 0;
      return travel + Math.abs(targetYaw - yaw) + Math.abs(targetPitch - pitch) > 0.0001;
    },
    resize(nextPortrait) {
      const next = glassCameraFraming(nextPortrait);
      if (next.fov !== framing.fov) { framing = next; home(); }
    },
    home,
    orbit(horizontal, vertical, focus) {
      if (mode !== 'orbit') {
        const relative = position.map((value, axis) => value - focus[axis]);
        radius = Math.max(0.1, Math.hypot(...relative));
        azimuth = targetAzimuth = Math.atan2(relative[0], relative[2]);
        elevation = targetElevation = Math.asin(clamp(relative[1] / radius, -1, 1));
        mode = 'orbit';
      }
      targetAzimuth -= horizontal;
      targetElevation = clamp(targetElevation + vertical, -0.18, 0.72);
    },
    look(horizontal, vertical) {
      if (mode !== 'look') { targetYaw = yaw; targetPitch = pitch; mode = 'look'; }
      targetYaw -= horizontal;
      targetPitch = clamp(targetPitch + vertical, -0.85, 0.85);
    },
    update(delta, focus, reducedMotion = false) {
      const ease = reducedMotion ? 1 : 1 - Math.exp(-Math.max(0, delta) * 12);
      if (mode === 'orbit') {
        azimuth += (targetAzimuth - azimuth) * ease;
        elevation += (targetElevation - elevation) * ease;
        const horizontal = radius * Math.cos(elevation);
        position = [focus[0] + Math.sin(azimuth) * horizontal, focus[1] + Math.sin(elevation) * radius, focus[2] + Math.cos(azimuth) * horizontal];
        // Interrupted track transitions can start with a distant focus. Keep
        // that temporary orbit in the room as well, without losing its focus.
        position[1] = Math.max(-1.45, position[1]);
        position[2] = Math.max(-5.7, position[2]);
        const dx = focus[0] - position[0], dy = focus[1] - position[1], dz = focus[2] - position[2];
        yaw = Math.atan2(dx, -dz);
        pitch = Math.atan2(dy, Math.hypot(dx, dz));
      } else {
        if (mode === 'home') position = reducedMotion ? [...framing.position] : position.map((value, axis) => value + (framing.position[axis] - value) * ease);
        yaw += (targetYaw - yaw) * ease;
        pitch += (targetPitch - pitch) * ease;
      }
      return this.pose;
    },
  };
}
