/** Unilateral grain contact against a sampled deforming surface. The 16-face
 * groups follow subdivision order and reject most grains before triangle work.
 * Nothing attracts a grain or binds it to an object-space position. */
export function createSandContact(faces) {
  const triangles = faces.length / 3, groupSize = 16, groups = Math.ceil(triangles / groupSize);
  const data = new Float64Array(triangles * 17), bounds = new Float64Array(groups * 6);
  const whole = new Float64Array(6);
  function clearBox(box, offset) {
    box[offset] = box[offset + 1] = box[offset + 2] = Infinity;
    box[offset + 3] = box[offset + 4] = box[offset + 5] = -Infinity;
  }
  function overlaps(box, offset, x0, y0, z0, x1, y1, z1) {
    return x1 >= box[offset] && y1 >= box[offset + 1] && z1 >= box[offset + 2]
      && x0 <= box[offset + 3] && y0 <= box[offset + 4] && z0 <= box[offset + 5];
  }
  clearBox(whole, 0);
  return {
    update(positions) {
      clearBox(whole, 0);
      for (let group = 0; group < groups; group++) clearBox(bounds, group * 6);
      for (let face = 0; face < triangles; face++) {
        const a = faces[face * 3] * 3, b = faces[face * 3 + 1] * 3, c = faces[face * 3 + 2] * 3;
        const t = face * 17, box = Math.floor(face / groupSize) * 6;
        const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
        const ux = positions[b] - ax, uy = positions[b + 1] - ay, uz = positions[b + 2] - az;
        const vx = positions[c] - ax, vy = positions[c + 1] - ay, vz = positions[c + 2] - az;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const area = Math.hypot(nx, ny, nz), uu = ux * ux + uy * uy + uz * uz;
        const uv = ux * vx + uy * vy + uz * vz, vv = vx * vx + vy * vy + vz * vz;
        data[t] = ax; data[t + 1] = ay; data[t + 2] = az;
        data[t + 3] = ux; data[t + 4] = uy; data[t + 5] = uz;
        data[t + 6] = vx; data[t + 7] = vy; data[t + 8] = vz;
        data[t + 9] = area > 1e-10 ? nx / area : 0;
        data[t + 10] = area > 1e-10 ? ny / area : 0;
        data[t + 11] = area > 1e-10 ? nz / area : 0;
        data[t + 12] = area > 1e-10 ? 1 / (uu * vv - uv * uv) : 0;
        data[t + 13] = uu; data[t + 14] = uv; data[t + 15] = vv;
        data[t + 16] = -(ax * data[t + 9] + ay * data[t + 10] + az * data[t + 11]);
        for (let axis = 0; axis < 3; axis++) {
          const low = Math.min(positions[a + axis], positions[b + axis], positions[c + axis]);
          const high = Math.max(positions[a + axis], positions[b + axis], positions[c + axis]);
          bounds[box + axis] = Math.min(bounds[box + axis], low); bounds[box + 3 + axis] = Math.max(bounds[box + 3 + axis], high);
          whole[axis] = Math.min(whole[axis], low); whole[axis + 3] = Math.max(whole[axis + 3], high);
        }
      }
    },
    resolve(positions, velocities, offset, radius, oldX, oldY, oldZ, dt) {
      const x = positions[offset], y = positions[offset + 1], z = positions[offset + 2];
      const x0 = Math.min(x, oldX) - radius, y0 = Math.min(y, oldY) - radius, z0 = Math.min(z, oldZ) - radius;
      const x1 = Math.max(x, oldX) + radius, y1 = Math.max(y, oldY) + radius, z1 = Math.max(z, oldZ) + radius;
      if (!overlaps(whole, 0, x0, y0, z0, x1, y1, z1)) return false;
      let best = Infinity, hit = -1, penetration = 0;
      for (let group = 0; group < groups; group++) {
        if (!overlaps(bounds, group * 6, x0, y0, z0, x1, y1, z1)) continue;
        for (let face = group * groupSize; face < Math.min(triangles, (group + 1) * groupSize); face++) {
          const t = face * 17;
          if (!data[t + 12]) continue;
          const nx = data[t + 9], ny = data[t + 10], nz = data[t + 11], plane = data[t + 16];
          const before = oldX * nx + oldY * ny + oldZ * nz + plane - radius;
          const after = x * nx + y * ny + z * nz + plane - radius;
          // A grain born beneath the body is not teleported onto its exterior.
          if (after >= 0 || before < -.002 || before - after <= 1e-10) continue;
          const time = Math.max(0, before / (before - after));
          if (time >= best) continue;
          const px = oldX + (x - oldX) * time - nx * radius - data[t];
          const py = oldY + (y - oldY) * time - ny * radius - data[t + 1];
          const pz = oldZ + (z - oldZ) * time - nz * radius - data[t + 2];
          const u = px * data[t + 3] + py * data[t + 4] + pz * data[t + 5];
          const v = px * data[t + 6] + py * data[t + 7] + pz * data[t + 8];
          const s = (data[t + 15] * u - data[t + 14] * v) * data[t + 12];
          const q = (data[t + 13] * v - data[t + 14] * u) * data[t + 12];
          if (s < -1e-6 || q < -1e-6 || s + q > 1.000001) continue;
          best = time; hit = t; penetration = -after + 1e-6;
        }
      }
      if (hit < 0) return false;
      const nx = data[hit + 9], ny = data[hit + 10], nz = data[hit + 11];
      positions[offset] += nx * penetration; positions[offset + 1] += ny * penetration; positions[offset + 2] += nz * penetration;
      let inward = velocities[offset] * nx + velocities[offset + 1] * ny + velocities[offset + 2] * nz;
      if (inward < 0) {
        velocities[offset] -= inward * 1.025 * nx; velocities[offset + 1] -= inward * 1.025 * ny; velocities[offset + 2] -= inward * 1.025 * nz;
      }
      inward = velocities[offset] * nx + velocities[offset + 1] * ny + velocities[offset + 2] * nz;
      const friction = Math.exp(-dt * .2);
      velocities[offset] = inward * nx + (velocities[offset] - inward * nx) * friction;
      velocities[offset + 1] = inward * ny + (velocities[offset + 1] - inward * ny) * friction;
      velocities[offset + 2] = inward * nz + (velocities[offset + 2] - inward * nz) * friction;
      return true;
    },
  };
}
