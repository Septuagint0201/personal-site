// Shared normalized profile for the editor, solid geometry, optics and export.
export const PROFILE_VERSION = 1;
export const DEFAULT_PROFILE = Object.freeze({
  kind: 'hyperbolic', bias: .438, exponent: 3,
  x1: .12, y1: .78, x2: .42, y2: 1,
  thickness: 60, shoulder: 67.68, edge: .18, front: .5,
  ior: 1.7, dispersion: .12, roughness: .5,
  width: 320, height: 200, radius: 36, shape: 'card',
});
export const LIMITS = Object.freeze({
  bias: [.03, 4], exponent: [1, 6],
  x1: [.02, .88], y1: [0, 1], x2: [.12, .98], y2: [0, 1],
  thickness: [2, 180], shoulder: [2, 140], edge: [0, .8], front: [0, 1],
  ior: [1.05, 4.5], dispersion: [0, 1.2], roughness: [0, 5],
  width: [48, 480], height: [32, 320], radius: [0, 120],
});
const clamp = (value, a, b) => Math.min(b, Math.max(a, value));
export function normalizeProfile(input = {}) {
  const state = { ...DEFAULT_PROFILE };
  for (const [key, [min, max]] of Object.entries(LIMITS))
    if (typeof input[key] === 'number' && Number.isFinite(input[key])) state[key] = clamp(input[key], min, max);
  if (['hyperbolic', 'bezier'].includes(input.kind)) state.kind = input.kind;
  if (['card', 'pill', 'circle', 'triangle'].includes(input.shape)) state.shape = input.shape;
  state.x2 = Math.max(state.x1 + .04, state.x2);
  state.y2 = Math.max(state.y1, state.y2);
  return state;
}
const bezier = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
const derivative = (t, a, b) => 3 * (1 - t) ** 2 * a + 6 * (1 - t) * t * (b - a) + 3 * t * t * (1 - b);
export function curveAt(value, state) {
  const x = clamp(value, 0, 1);
  if (state.kind === 'hyperbolic') {
    const b = state.bias, q = (1 + b) * x / (x + b), tail = Math.max(0, 1 - q);
    return { height: 1 - tail ** state.exponent,
      slope: state.exponent * tail ** (state.exponent - 1) * b * (1 + b) / (x + b) ** 2 };
  }
  let lo = 0, hi = 1;
  for (let i = 0; i < 22; i++) {
    const t = (lo + hi) / 2;
    if (bezier(t, state.x1, state.x2) < x) lo = t; else hi = t;
  }
  const t = x === 0 ? 0 : x === 1 ? 1 : (lo + hi) / 2;
  return { height: bezier(t, state.y1, state.y2),
    slope: derivative(t, state.y1, state.y2) / Math.max(1e-8, derivative(t, state.x1, state.x2)) };
}
export function dimensions(state) {
  const width = state.width, height = state.shape === 'circle' ? width : state.height;
  const halfShort = Math.min(width, height) / 2;
  const radius = state.shape === 'circle' || state.shape === 'pill' ? halfShort
    : Math.min(state.radius, halfShort * (state.shape === 'triangle' ? .44 : 1));
  const w = width - 2 * radius, h = height - 2 * radius;
  const inradius = state.shape === 'triangle'
    ? w * h / (w + 2 * Math.hypot(w / 2, h)) + radius : halfShort;
  return { width, height, radius, inradius, shoulder: Math.min(state.shoulder, inradius * .98) };
}
export function footprintDistance(x, y, state) {
  const d = dimensions(state), hx = d.width / 2, hy = d.height / 2;
  if (state.shape === 'circle') return Math.hypot(x, y) - hx;
  if (state.shape !== 'triangle') {
    const qx = Math.abs(x) - hx + d.radius, qy = Math.abs(y) - hy + d.radius;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - d.radius;
  }
  const w = hx - d.radius, h = hy - d.radius, points = [[-w, -h], [w, -h], [0, h]];
  let gap = Infinity, inside = true;
  for (let i = 0; i < 3; i++) {
    const a = points[i], b = points[(i + 1) % 3], ex = b[0] - a[0], ey = b[1] - a[1], vx = x - a[0], vy = y - a[1];
    const t = clamp((vx * ex + vy * ey) / (ex * ex + ey * ey), 0, 1);
    gap = Math.min(gap, Math.hypot(vx - ex * t, vy - ey * t));
    inside &&= ex * vy - ey * vx >= 0;
  }
  return (inside ? -gap : gap) - d.radius;
}
export function sampleProfile(state, count = 512) {
  const pixels = new Float32Array(count * 4);
  let maxSlope = 0;
  for (let i = 0; i < count; i++) {
    const curve = curveAt(i / (count - 1), state);
    const height = state.edge + (1 - state.edge) * curve.height;
    const slope = (1 - state.edge) * curve.slope;
    pixels.set([height, slope, 0, 1], i * 4); maxSlope = Math.max(maxSlope, slope);
  }
  return { pixels, maxSlope };
}
export function spectrum(state) {
  return [Math.max(1.001, state.ior - state.dispersion), state.ior, state.ior + state.dispersion];
}
export function exportProfile(state) {
  const normalized = normalizeProfile(state);
  return { format: 'septuagint-ui-glass-profile', version: PROFILE_VERSION,
    units: 'CSS px', parameters: normalized,
    definition: 't = clamp(inward edge distance / effective shoulder, 0, 1); thickness = T * (edge + (1-edge) * curve(t)); front = thickness * frontShare; back = -thickness * (1-frontShare)',
    effectiveShoulder: dimensions(normalized).shoulder, effectiveRGB: spectrum(normalized),
    samples: Array.from({ length: 129 }, (_, i) => {
      const t = i / 128, curve = curveAt(t, normalized);
      return [t, normalized.edge + (1 - normalized.edge) * curve.height, (1 - normalized.edge) * curve.slope];
    }) };
}
export function importProfile(value) {
  if (!value || value.format !== 'septuagint-ui-glass-profile' || value.version !== PROFILE_VERSION
    || !value.parameters || typeof value.parameters !== 'object') throw new Error('请选择本 Lab 导出的 v1 参数文件。');
  for (const key of Object.keys(LIMITS))
    if (typeof value.parameters[key] !== 'number' || !Number.isFinite(value.parameters[key])) throw new Error(`参数 ${key} 无效。`);
  if (!['hyperbolic', 'bezier'].includes(value.parameters.kind)
    || !['card', 'pill', 'circle', 'triangle'].includes(value.parameters.shape)) throw new Error('曲线或形状类型无效。');
  return normalizeProfile(value.parameters);
}
