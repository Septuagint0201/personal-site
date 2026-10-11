const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** A finite set of real, individually integrated surface grains. A grain is
 * either in its surface bucket or in one airborne slot, never both. The bulk
 * remains the heightfield; this is not a complete granular-material solver. */
export function createSandGrains(sand, { count = 7200, capacity = 512, seed = 731 } = {}) {
  const positions = new Float32Array(count * 3), sizes = new Float32Array(count);
  const original = new Float32Array(count * 2), radii = new Float32Array(count), tones = new Float32Array(count);
  const ids = new Int32Array(capacity).fill(-1), flying = new Float64Array(capacity * 3), velocity = new Float64Array(capacity * 3);
  const ages = new Float32Array(capacity), restTime = new Float32Array(capacity);
  const half = sand.size / 2 - 1.7, cellSize = .55, side = Math.ceil(half * 2 / cellSize);
  const buckets = Array.from({ length: side * side }, () => new Set());
  const cell = (x, z) => clamp(Math.floor((z + half) / cellSize), 0, side - 1) * side
    + clamp(Math.floor((x + half) / cellSize), 0, side - 1);
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const free = Array.from({ length: capacity }, (_, i) => capacity - i - 1);
  let active = 0, visible = count, limit = capacity, budget = 40, surfaceDirty = true, accumulator = 0;
  let layoutRevision = 0, motionRevision = 0;
  for (let i = 0; i < count; i++) {
    const x = Math.fround((random() * 2 - 1) * half), z = Math.fround((random() * 2 - 1) * half);
    original.set([x, z], i * 2);
    radii[i] = sizes[i] = .008 + random() ** 2 * .018;
    tones[i] = random();
    positions.set([x, sand.sample(x, z) + radii[i] * .32, z], i * 3);
    buckets[cell(x, z)].add(i);
  }
  function nearby(x0, z0, x1, z1, visit) {
    const low = cell(x0, z0), high = cell(x1, z1);
    for (let z = Math.floor(low / side); z <= Math.floor(high / side); z++)
      for (let x = low % side; x <= high % side; x++) visit(buckets[z * side + x]);
  }
  function settle(slot) {
    const id = ids[slot], a = slot * 3;
    const x = clamp(flying[a], -half, half), z = clamp(flying[a + 2], -half, half);
    positions.set([x, sand.sample(x, z) + radii[id] * .32, z], id * 3);
    sizes[id] = radii[id]; buckets[cell(x, z)].add(id);
    ids[slot] = -1; free.push(slot); active--; surfaceDirty = true;
    layoutRevision++; motionRevision++;
  }
  function disturb(event) {
    if (budget <= 0 || active >= limit) return;
    const reach = event.radius * 1.5, energy = clamp(event.energy, .1, 3);
    const flowLength = Math.max(1, Math.hypot(event.flowX || 0, event.flowZ || 0));
    nearby(event.x - reach, event.z - reach, event.x + reach, event.z + reach, bucket => {
      for (const id of bucket) {
        if (id >= visible || budget <= 0 || active >= limit) continue;
        const a = id * 3, dx = positions[a] - event.x, dz = positions[a + 2] - event.z;
        if (dx * dx + dz * dz > reach * reach) continue;
        const slot = free.pop(), p = slot * 3, angle = Math.atan2(dz, dx) + (random() - .5) * .7;
        const spread = (.22 + random() * .45) * Math.sqrt(energy);
        ids[slot] = id; ages[slot] = restTime[slot] = 0;
        flying.set([positions[a], Math.max(positions[a + 1], sand.sample(positions[a], positions[a + 2]) + .02), positions[a + 2]], p);
        velocity.set([Math.cos(angle) * spread + (event.flowX || 0) / flowLength * .3,
          .45 + random() * .8 + Math.sqrt(energy) * .5,
          Math.sin(angle) * spread + (event.flowZ || 0) / flowLength * .3], p);
        sizes[id] = 0; bucket.delete(id); active++; budget--; surfaceDirty = true;
        layoutRevision++; motionRevision++;
      }
    });
  }
  function substep(dt, body) {
    for (let slot = 0; slot < capacity; slot++) {
      const id = ids[slot]; if (id < 0) continue;
      const a = slot * 3;
      const oldX = flying[a], oldY = flying[a + 1], oldZ = flying[a + 2];
      ages[slot] += dt; velocity[a + 1] -= 9.81 * dt;
      // Gentle crosswind affects loose airborne grains, not the whole dune.
      velocity[a] += (-.12 - velocity[a]) * dt * .35;
      velocity[a + 2] += (.04 - velocity[a + 2]) * dt * .35;
      for (let axis = 0; axis < 3; axis++) flying[a + axis] += velocity[a + axis] * dt;
      body?.resolve(flying, velocity, a, radii[id] * .45, oldX, oldY, oldZ, dt);
      const ground = sand.sample(flying[a], flying[a + 2]) + radii[id] * .32;
      const onGround = flying[a + 1] <= ground;
      if (onGround) {
        flying[a + 1] = ground;
        const d = sand.spacing;
        const nx = sand.sample(flying[a] - d, flying[a + 2]) - sand.sample(flying[a] + d, flying[a + 2]);
        const nz = sand.sample(flying[a], flying[a + 2] - d) - sand.sample(flying[a], flying[a + 2] + d);
        const ny = d * 2, length = Math.hypot(nx, ny, nz), x = nx / length, y = ny / length, z = nz / length;
        const v = velocity[a] * x + velocity[a + 1] * y + velocity[a + 2] * z;
        if (v < 0) { velocity[a] -= v * 1.24 * x; velocity[a + 1] -= v * 1.24 * y; velocity[a + 2] -= v * 1.24 * z; }
        velocity[a] *= .78; velocity[a + 2] *= .78;
        restTime[slot] += dt;
      } else restTime[slot] = 0;
      if (onGround && (ages[slot] > 3 || (restTime[slot] > .1 && Math.hypot(velocity[a], velocity[a + 1], velocity[a + 2]) < .12))) settle(slot);
    }
  }
  return {
    positions, sizes, tones, radii, ids, flying, capacity, count, disturb,
    get activeCount() { return active; }, get visibleCount() { return visible; },
    get layoutRevision() { return layoutRevision; }, get motionRevision() { return motionRevision; },
    update(delta, body = null) {
      budget = limit === capacity ? 40 : 24;
      if (!active) { accumulator = 0; return; }
      accumulator += clamp(delta, 0, .05);
      let moved = false;
      while (accumulator + 1e-9 >= 1 / 120) { substep(1 / 120, body); accumulator -= 1 / 120; moved = true; }
      if (moved) motionRevision++;
    },
    syncSurface(bounds = null) {
      const x0 = bounds ? bounds.x0 * sand.spacing - sand.size / 2 : -half;
      const x1 = bounds ? bounds.x1 * sand.spacing - sand.size / 2 : half;
      const z0 = bounds ? bounds.z0 * sand.spacing - sand.size / 2 : -half;
      const z1 = bounds ? bounds.z1 * sand.spacing - sand.size / 2 : half;
      nearby(x0, z0, x1, z1, bucket => { for (const id of bucket) {
        const a = id * 3;
        positions[a + 1] = sand.sample(positions[a], positions[a + 2]) + radii[id] * .32;
      } });
      surfaceDirty = true;
    },
    consumeSurfaceDirty() { const changed = surfaceDirty; surfaceDirty = false; return changed; },
    setQuality(high) { visible = high ? Math.ceil(count * .53) : count; limit = high ? Math.ceil(capacity / 2) : capacity; },
    reset() {
      for (const bucket of buckets) bucket.clear();
      ids.fill(-1); free.length = 0; active = accumulator = 0; budget = 40;
      for (let slot = capacity - 1; slot >= 0; slot--) free.push(slot);
      for (let id = 0; id < count; id++) {
        const x = original[id * 2], z = original[id * 2 + 1];
        positions.set([x, sand.sample(x, z) + radii[id] * .32, z], id * 3); sizes[id] = radii[id];
        buckets[cell(x, z)].add(id);
      }
      surfaceDirty = true;
      layoutRevision++; motionRevision++;
    },
  };
}
