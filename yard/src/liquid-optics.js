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
