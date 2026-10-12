const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function duneHeight(x, z) {
  const distance = Math.hypot(x, z);
  const amplitude = .45 + Math.min(2.5, distance * .06);
  const rearDune = 1.2 * Math.exp(-Math.pow((x + 4.8) / 4.6, 2) - Math.pow((z + 8) / 3.1, 2));
  const farDune = 1.7 * Math.exp(-Math.pow((x - 8) / 6, 2) - Math.pow((z + 14) / 4.3, 2));
  return amplitude * (Math.sin(x * .19 + z * .12) * .28
    + Math.sin(z * .27 - x * .08) * .17 + Math.cos(x * .11 - z * .17) * .15) - .0675 + rearDune + farDune;
}

/** Bulk sand is a plastic heightfield with volume-preserving rims and repose
 * settling. Displacement events drive the separate, bounded loose-grain layer. */
export function createSandField({ size = 20, resolution = 160, onDisplace = () => {} } = {}) {
  const stride = resolution + 1, spacing = size / resolution;
  const base = new Float32Array(stride * stride), displacement = new Float32Array(base.length);
  const compaction = new Float32Array(base.length);
  const rimIds = new Uint32Array(base.length), rimWeights = new Float64Array(base.length);
  const neighbors = [[1, 0, 1], [0, 1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2]];
  let dirty = null, pending = null, revision = 0, relaxationClock = 0, sweep = 0;
  const union = (a, b) => a ? { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1),
    z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1) } : { ...b };
  for (let z = 0; z <= resolution; z++) for (let x = 0; x <= resolution; x++)
    base[z * stride + x] = duneHeight(x * spacing - size / 2, z * spacing - size / 2);
  function sample(x, z) {
    if (Math.abs(x) > size / 2 || Math.abs(z) > size / 2) return duneHeight(x, z);
    const gx = clamp((x + size / 2) / spacing, 0, resolution - .00001);
    const gz = clamp((z + size / 2) / spacing, 0, resolution - .00001);
    const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
    const a = iz * stride + ix;
    return ((base[a] + displacement[a]) * (1 - fx) + (base[a + 1] + displacement[a + 1]) * fx) * (1 - fz)
      + ((base[a + stride] + displacement[a + stride]) * (1 - fx) + (base[a + stride + 1] + displacement[a + stride + 1]) * fx) * fz;
  }
  function stamp(cx, cz, radius = .3, depth = .12, flowX = 0, flowZ = 0, energy = 1, stroke = null) {
    if (![cx, cz, radius, depth].every(Number.isFinite) || radius <= 0 || depth <= 0) return false;
    radius = Math.max(radius, spacing * 1.5);
    const layered = stroke?.length === displacement.length;
    if (layered) {
      const center = clamp(Math.round((cz + size / 2) / spacing), 0, resolution) * stride
        + clamp(Math.round((cx + size / 2) / spacing), 0, resolution);
      radius += Math.max(0, -stroke[center]) * .55;
    }
    if (Math.max(Math.abs(cx), Math.abs(cz)) + radius * 1.95 >= size / 2) return false;
    depth = Math.min(depth, .48);
    const x0 = Math.max(0, Math.floor((cx - radius * 1.95 + size / 2) / spacing));
    const x1 = Math.min(resolution, Math.ceil((cx + radius * 1.95 + size / 2) / spacing));
    const z0 = Math.max(0, Math.floor((cz - radius * 1.95 + size / 2) / spacing));
    const z1 = Math.min(resolution, Math.ceil((cz + radius * 1.95 + size / 2) / spacing));
    let removed = 0, rimWeight = 0, rimCount = 0;
    flowX = Number.isFinite(flowX) ? flowX : 0; flowZ = Number.isFinite(flowZ) ? flowZ : 0;
    const flowLength = Math.hypot(flowX, flowZ), flowScale = flowLength > 1e-8 ? .42 / flowLength : 0;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const dx = x * spacing - size / 2 - cx, dz = z * spacing - size / 2 - cz;
      const r = Math.hypot(dx, dz) / radius;
      const i = z * stride + x;
      if (r < .95) {
        // A deeper core and a broad shoulder leave multiple relief scales.
        const taper = clamp((.95 - r) / .2, 0, 1);
        const footprint = (.66 * Math.exp(-r * r / .15) + .34 * Math.exp(-r * r / .5)) * taper * taper * (3 - 2 * taper);
        // One stroke has a fixed reference surface: event density cannot make
        // it dig infinitely. A fresh pass can excavate the next layer.
        const reference = layered ? Math.min(0, stroke[i]) : 0;
        const wanted = Math.max(-.82, reference - depth * (1 - compaction[i] * .12) * footprint);
        if (displacement[i] > wanted) {
          removed += displacement[i] - wanted;
          displacement[i] = wanted;
          compaction[i] = Math.max(compaction[i], Math.min(.96, -wanted * 3.5) * footprint);
        }
      } else if (r < 1.95) {
        const weight = (.78 * Math.exp(-(((r - 1.12) / .20) ** 2)) + .22 * Math.exp(-(((r - 1.57) / .24) ** 2)))
          * (1 + flowScale * (dx * flowX + dz * flowZ) / (radius * r));
        rimIds[rimCount] = i; rimWeights[rimCount++] = weight; rimWeight += weight;
      }
    }
    if (removed < 1e-7) return false;
    for (let i = 0; i < rimCount; i++) displacement[rimIds[i]] += removed * rimWeights[i] / rimWeight;
    const bounds = { x0, x1, z0, z1 };
    dirty = union(dirty, bounds); pending = union(pending, bounds);
    revision++;
    if (energy > .08 && removed * spacing * spacing > .000015)
      onDisplace({ x: cx, z: cz, radius, volume: removed * spacing * spacing, flowX, flowZ, energy });
    return true;
  }
  return {
    size, resolution, stride, spacing, base, displacement, compaction, sample, stamp,
    get revision() { return revision; },
    get active() { return pending !== null; },
    relax(delta = 1 / 60) {
      if (!pending) { relaxationClock = 0; return; }
      relaxationClock += Math.min(Math.max(delta, 0), .05);
      while (pending && relaxationClock + 1e-9 >= 1 / 60) {
        relaxationClock -= 1 / 60;
        const bounds = { x0: Math.max(0, pending.x0 - 1), x1: Math.min(resolution, pending.x1 + 1),
          z0: Math.max(0, pending.z0 - 1), z1: Math.min(resolution, pending.z1 + 1) };
        let changedX0 = Infinity, changedX1 = -Infinity, changedZ0 = Infinity, changedZ1 = -Infinity;
        // Alternate sweep order and include diagonals, avoiding a grid-shaped
        // ridge. Simulation work survives consumption of the GPU dirty region.
        const reverse = sweep++ % 2;
        for (let iz = bounds.z0; iz < bounds.z1; iz++) for (let ix = bounds.x0; ix < bounds.x1; ix++) {
          const z = reverse ? bounds.z1 - 1 - iz + bounds.z0 : iz;
          const x = reverse ? bounds.x1 - 1 - ix + bounds.x0 : ix;
          const a = z * stride + x;
          for (const [dx, dz, length] of neighbors) {
            if (x + dx < 0) continue;
            const b = a + dz * stride + dx;
            const difference = base[a] + displacement[a] - base[b] - displacement[b];
            const repose = .60 + (compaction[a] + compaction[b]) * .07;
            const excess = Math.abs(difference) - spacing * length * repose;
            if (excess <= .0005) continue;
            const move = Math.sign(difference) * excess * .18;
            displacement[a] -= move; displacement[b] += move;
            changedX0 = Math.min(changedX0, x, x + dx); changedX1 = Math.max(changedX1, x, x + dx);
            changedZ0 = Math.min(changedZ0, z); changedZ1 = Math.max(changedZ1, z + dz);
          }
        }
        const changed = changedX0 === Infinity ? null : { x0: changedX0, x1: changedX1, z0: changedZ0, z1: changedZ1 };
        pending = changed;
        if (changed) { dirty = union(dirty, changed); revision++; }
      }
    },
    consumeDirty() { const value = dirty; dirty = null; return value; },
    clear() {
      displacement.fill(0); compaction.fill(0); pending = null; relaxationClock = 0; revision++;
      dirty = { x0: 0, z0: 0, x1: resolution, z1: resolution };
    },
  };
}
