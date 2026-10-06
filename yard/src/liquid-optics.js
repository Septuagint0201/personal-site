import { METAL_SEGMENTS } from './liquid-room.js';

export const METAL_GROUP_SIZE = 2;
export const METAL_SEGMENT_CAPACITY = METAL_SEGMENTS.length;
export const MAX_METAL_GROUPS = Math.ceil(METAL_SEGMENT_CAPACITY / METAL_GROUP_SIZE);

/** Conservative bounds preserve segment order, including ties at shared bends. */
export function packCapsuleGroups(segments) {
  if (segments.length > METAL_SEGMENT_CAPACITY)
    throw new RangeError('Too many metal segments for the optical pipeline.');
  const low = new Float32Array(MAX_METAL_GROUPS * 4);
  const high = new Float32Array(MAX_METAL_GROUPS * 4);
  for (let start = 0; start < segments.length; start += METAL_GROUP_SIZE) {
    const group = segments.slice(start, start + METAL_GROUP_SIZE);
    const offset = start / METAL_GROUP_SIZE * 4;
    for (let axis = 0; axis < 3; axis++) {
      low[offset + axis] = Math.min(...group.map(s => Math.min(s.a[axis], s.b[axis]) - s.radius)) - .0002;
      high[offset + axis] = Math.max(...group.map(s => Math.max(s.a[axis], s.b[axis]) + s.radius)) + .0002;
    }
  }
  return { low, high };
}

/** Write the inverse ellipsoid transform once per drop, shared by all its rays.
 * XYZ stores a basis vector divided by its radius; W retains the world radius.
 * The pole convention matches liquid-simulation's exact picking transform.
 */
export function writeEllipsoidTransform(xRow, yRow, zRow, offset, drop, scale = 1) {
  const length = Math.hypot(...drop.orientation);
  const [zx, zy, zz] = drop.orientation.map(value => value / length);
  let xx, xy, xz;
  if (Math.abs(zy) < .92) { xx = zz; xy = 0; xz = -zx; }
  else { xx = 0; xy = -zz; xz = zy; }
  const transverse = Math.hypot(xx, xy, xz);
  xx /= transverse; xy /= transverse; xz /= transverse;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  const radius = Math.max(.001, drop.radius);
  const rx = Math.max(.006, radius * drop.deform[0] * scale);
  const ry = Math.max(.006, radius * drop.deform[1] * scale);
  const rz = Math.max(.006, radius * drop.deform[2] * scale);
  xRow[offset] = xx / rx; xRow[offset + 1] = xy / rx; xRow[offset + 2] = xz / rx; xRow[offset + 3] = rx;
  yRow[offset] = yx / ry; yRow[offset + 1] = yy / ry; yRow[offset + 2] = yz / ry; yRow[offset + 3] = ry;
  zRow[offset] = zx / rz; zRow[offset + 1] = zy / rz; zRow[offset + 2] = zz / rz; zRow[offset + 3] = rz;
}
