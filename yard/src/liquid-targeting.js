const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);

/** A small, sticky aim cone. Exact hits win; assisted rays must be unobstructed. */
export function findLiquidTarget({ origin, forward, drops, pick, obstruction, previousId = null, reach = 5 }) {
  const visible = (hit, ray) => hit && hit.distance <= reach && obstruction(ray) >= hit.distance - 0.01;
  const exact = pick(origin, forward);
  if (visible(exact, forward)) return { ...exact, ray: [...forward], assisted: false };
  let best = null;
  for (const drop of drops) {
    if (drop.radius < 0.025) continue;
    const offset = drop.position.map((v, i) => v - origin[i]);
    const distance = Math.hypot(...offset);
    if (distance < 0.001 || dot(offset, forward) <= 0) continue;
    const ray = offset.map(v => v / distance);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot(ray, forward))));
    // Deliberately bounded by the centre angle, even for a large nearby drop.
    const sticky = drop.id === previousId;
    if (angle > (sticky ? 0.065 : 0.042)) continue;
    const hit = pick(origin, ray);
    if (hit?.id !== drop.id || !visible(hit, ray)) continue;
    const score = angle - (sticky ? 0.022 : 0);
    if (!best || score < best.score) best = { ...hit, ray, assisted: true, score };
  }
  return best;
}
