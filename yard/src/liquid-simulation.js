import {
  EMITTERS,
  METAL_SEGMENTS,
  ROOM_BOUNDS,
  closestPointOnSegment,
} from "./liquid-room.js";

export const MAX_DROPS = 16;
export const FIXED_STEP = 1 / 120;
const SPHERE_VOLUME = (4 * Math.PI) / 3;
const MAX_CATCHUP = 0.25;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const smooth = (n) => {
  const v = clamp(n, 0, 1);
  return v * v * (3 - 2 * v);
};
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const subtract = (a, b) => a.map((v, i) => v - b[i]);
const norm = (v, fallback = [0, 0, 1]) => {
  const length = Math.hypot(...v);
  return length > 1e-9 ? v.map((n) => n / length) : [...fallback];
};
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const distance = (a, b) => Math.hypot(...subtract(a, b));
const volumeOf = (radius) => SPHERE_VOLUME * radius ** 3;
const radiusOf = (volume) => Math.cbrt(Math.max(0, volume) / SPHERE_VOLUME);

function randomGenerator(seed) {
  let state = (Number(seed) || 1) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic, zero-gravity surface-tension model. A parcel's volume is never
 * destroyed: fluid draining along a rod is held in its condensation reservoir
 * and gradually reappears at another bend. This is an artistic particle model,
 * not a computational-fluid-dynamics solver. All directions are world space.
 *
 * getDrops() exposes live records for allocation-free rendering. deform has
 * determinant one: two transverse scales and one longitudinal scale;
 * orientation is the local-Z world axis. radius therefore remains the exact
 * equivalent-volume radius. initialDrops is useful for repeatable installations.
 */
export function createLiquidSimulation({
  seed = 271828,
  onEvent,
  initialDrops,
} = {}) {
  let random, nextId, accumulator, elapsed, drops, attractor, attractorDuration;
  let gatherAnnounced, counters, initialVolume;

  const randomDirection = () => {
    const z = random() * 2 - 1;
    const phi = random() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    return [r * Math.cos(phi), z, r * Math.sin(phi)];
  };
  const emit = (type, detail = {}) =>
    onEvent?.({ type, time: elapsed, ...detail });

  function makeDrop({
    position,
    radius = 0.23,
    velocity,
    state = "free",
    siteIndex = null,
    age = 0,
    ...overrides
  }) {
    const direction = randomDirection();
    const volume = volumeOf(radius);
    return {
      id: nextId++,
      position: [...position],
      radius,
      volume,
      visibleFraction: 1,
      velocity: velocity
        ? [...velocity]
        : direction.map((value) => value * (0.085 + random() * 0.085)),
      state,
      deform: [1, 1, 1],
      orientation: direction,
      highlight: 0,
      bridgeTo: null,
      siteIndex,
      emitterId: siteIndex === null ? null : EMITTERS[siteIndex].id,
      age,
      phase: random() * Math.PI * 2,
      cooldown: 0,
      splitWait: 5 + random() * 5,
      elongation: 1,
      lifeProgress: 0,
      formationTime: 3.8 + random() * 2.4,
      originSegments:
        siteIndex === null ? [] : [...EMITTERS[siteIndex].segmentIndices],
      splitSibling: null,
      splitBridgeTime: 0,
      ...overrides,
    };
  }

  function setShape(drop, longitudinal, axis = drop.orientation, crossSection = 1) {
    const long = clamp(longitudinal, 0.85, 6);
    const transverse = 1 / Math.sqrt(long);
    drop.deform[0] = transverse * crossSection;
    drop.deform[1] = transverse / crossSection;
    drop.deform[2] = long;
    drop.orientation = norm(axis, drop.orientation);
  }

  function beginFormation(drop, siteIndex, progress = 0) {
    const site = EMITTERS[siteIndex];
    drop.state = "forming";
    drop.siteIndex = siteIndex;
    drop.emitterId = site.id;
    drop.originSegments = [...site.segmentIndices];
    drop.lifeProgress = progress;
    drop.age = 0;
    drop.bridgeTo = null;
    drop.splitSibling = null;
    drop.visibleFraction = smooth(progress / 0.88);
    drop.radius = radiusOf(drop.volume * drop.visibleFraction);
    drop.position = site.position.map(
      (value, axis) =>
        value + site.direction[axis] * (0.08 + drop.radius * 0.94),
    );
    drop.orientation = [...site.direction];
    drop.velocity = [0, 0, 0];
    setShape(drop, 1 + 0.3 * smooth(progress), site.direction);
  }

  function reset() {
    random = randomGenerator(seed);
    nextId = 1;
    accumulator = 0;
    elapsed = 0;
    attractor = null;
    attractorDuration = 0;
    gatherAnnounced = false;
    counters = {
      merges: 0,
      splits: 0,
      returns: 0,
      detachments: 0,
      interactions: 0,
      gatheredCount: 0,
    };
    if (initialDrops) {
      if (initialDrops.length > MAX_DROPS)
        throw new RangeError(
          `At most ${MAX_DROPS} liquid parcels are supported.`,
        );
      drops = initialDrops.map((source) => {
        if (
          source.position?.length !== 3 ||
          !source.position.every(Number.isFinite) ||
          !Number.isFinite(source.radius) ||
          !(source.radius > 0) ||
          (source.velocity &&
            (source.velocity.length !== 3 ||
              !source.velocity.every(Number.isFinite)))
        ) {
          throw new TypeError(
            "Each initial drop needs a finite three-dimensional position, velocity and positive radius.",
          );
        }
        const drop = makeDrop(source);
        if (drop.state === "forming")
          beginFormation(drop, drop.siteIndex ?? 0, source.lifeProgress ?? 0.4);
        return drop;
      });
    } else {
      drops = [
        makeDrop({
          position: [-0.46, 1.92, -1.55],
          radius: 0.282,
          velocity: [0.055, 0.008, -0.018],
          age: 3,
        }),
        makeDrop({
          position: [0.25, 1.91, -1.57],
          radius: 0.274,
          velocity: [-0.05, 0.005, 0.012],
          age: 3,
        }),
        makeDrop({
          position: [1.08, 2.35, -0.6],
          radius: 0.398,
          velocity: [-0.038, -0.026, -0.032],
          age: 3.7,
          splitWait: 7.4,
        }),
        makeDrop({
          position: [-1.35, 2.62, -2.65],
          radius: 0.235,
          velocity: [0.035, 0.025, 0.055],
        }),
        makeDrop({
          position: [0.6, 1.22, -3.2],
          radius: 0.206,
          velocity: [-0.05, 0.052, 0.01],
        }),
        makeDrop({
          position: [-1.68, 1.28, 0.8],
          radius: 0.195,
          velocity: [-0.052, 0.017, 0.025],
        }),
        makeDrop({
          position: [1.8, 2.25, 1.4],
          radius: 0.222,
          velocity: [0.047, 0.032, -0.026],
        }),
        makeDrop({
          position: [-2.0, 3.15, -0.3],
          radius: 0.176,
          velocity: [0.028, -0.045, -0.032],
        }),
        makeDrop({
          position: [0.1, 3.42, 1.85],
          radius: 0.245,
          velocity: [0.017, -0.037, 0.042],
        }),
      ];
      [1, 7, 15].forEach((siteIndex, index) => {
        const drop = makeDrop({
          position: EMITTERS[siteIndex].position,
          radius: [0.23, 0.21, 0.255][index],
          siteIndex,
        });
        beginFormation(drop, siteIndex, [0.25, 0.58, 0.83][index]);
        drops.push(drop);
      });
    }
    initialVolume = drops.reduce((sum, drop) => sum + drop.volume, 0);
    return stats();
  }

  function split(drop, preferredAxis, reason = "surface-tension") {
    if (
      drop.state !== "free" ||
      drops.length >= MAX_DROPS ||
      drop.radius < 0.135
    )
      return null;
    const axis = norm(preferredAxis || randomDirection());
    const fraction = 0.44 + random() * 0.12;
    const originalVolume = drop.volume;
    const originalRadius = drop.radius;
    const originalPosition = [...drop.position];
    const originalVelocity = [...drop.velocity];
    const childVolume = originalVolume * (1 - fraction);
    drop.volume = originalVolume - childVolume;
    drop.radius = radiusOf(drop.volume);
    const child = makeDrop({
      position: originalPosition,
      radius: radiusOf(childVolume),
      velocity: originalVelocity,
    });
    child.volume = childVolume;
    const separation = originalRadius * 0.63;
    for (let i = 0; i < 3; i++) {
      drop.position[i] =
        originalPosition[i] - axis[i] * separation * (1 - fraction);
      child.position[i] = originalPosition[i] + axis[i] * separation * fraction;
      // Equal and opposite impulse, weighted by volume, conserves momentum.
      drop.velocity[i] = originalVelocity[i] - axis[i] * 0.26 * (1 - fraction);
      child.velocity[i] = originalVelocity[i] + axis[i] * 0.26 * fraction;
    }
    [drop, child].forEach((part) => {
      part.cooldown = 5.5;
      part.age = 0;
      part.highlight = Math.max(part.highlight, 0.7);
      part.elongation = 1.5;
      part.splitBridgeTime = 4;
      part.originSegments = [...drop.originSegments];
      setShape(part, 1.5, axis);
    });
    drop.splitSibling = child.id;
    child.splitSibling = drop.id;
    drop.bridgeTo = child.id;
    child.bridgeTo = drop.id;
    drops.push(child);
    counters.splits++;
    emit("split", {
      dropId: drop.id,
      childId: child.id,
      reason,
      volume: originalVolume,
      position: [...originalPosition],
      radius: originalRadius,
    });
    return { type: "split", dropId: drop.id, childId: child.id, reason };
  }

  function merge(a, b) {
    const total = a.volume + b.volume;
    const axis = norm(subtract(b.position, a.position));
    for (let i = 0; i < 3; i++) {
      a.position[i] =
        (a.position[i] * a.volume + b.position[i] * b.volume) / total;
      a.velocity[i] =
        (a.velocity[i] * a.volume + b.velocity[i] * b.volume) / total;
    }
    a.volume = total;
    a.radius = radiusOf(total);
    a.age = 0;
    a.cooldown = 1.7;
    a.elongation = 1.38;
    a.highlight = 0.9;
    a.bridgeTo = null;
    a.splitSibling = null;
    a.originSegments = [...new Set([...a.originSegments, ...b.originSegments])];
    setShape(a, a.elongation, axis);
    drops.splice(drops.indexOf(b), 1);
    for (const drop of drops) if (drop.bridgeTo === b.id) drop.bridgeTo = null;
    counters.merges++;
    emit("merge", {
      dropId: a.id, consumedId: b.id, volume: total,
      position: [...a.position], radius: a.radius,
    });
  }

  function beginDrain(drop, segmentIndex, closest) {
    const segment = METAL_SEGMENTS[segmentIndex];
    drop.state = "draining";
    drop.lifeProgress = 0;
    drop.age = 0;
    drop.drainSegment = segmentIndex;
    drop.drainStart = closest.t;
    drop.drainEnd = closest.t < 0.5 ? 0 : 1;
    drop.drainNormal = norm(subtract(drop.position, closest.point));
    drop.drainStartPosition = [...drop.position];
    drop.drainTime = 2.4 + random() * 1.2;
    drop.siteIndex = EMITTERS.findIndex((site) =>
      site.segmentIndices.includes(segmentIndex),
    );
    drop.emitterId = drop.siteIndex >= 0 ? EMITTERS[drop.siteIndex].id : null;
    drop.bridgeTo = null;
    drop.splitSibling = null;
    drop.velocity = [0, 0, 0];
    drop.highlight = Math.max(drop.highlight, 0.45);
    counters.returns++;
    emit("return", {
      dropId: drop.id, segmentIndex, volume: drop.volume,
      position: [...drop.position], radius: drop.radius,
    });
  }

  function updateFormation(drop, dt) {
    const site = EMITTERS[drop.siteIndex];
    drop.lifeProgress = Math.min(
      1,
      drop.lifeProgress + dt / drop.formationTime,
    );
    const progress = drop.lifeProgress;
    drop.visibleFraction = smooth(progress / 0.88);
    drop.radius = radiusOf(drop.volume * drop.visibleFraction);
    const release = smooth((progress - 0.8) / 0.2);
    const offset = 0.078 + drop.radius * 0.96 + release * 0.15;
    drop.position = site.position.map(
      (v, axis) => v + site.direction[axis] * offset,
    );
    setShape(
      drop,
      1 + 0.36 * Math.sin(progress * Math.PI * 0.8),
      site.direction,
    );
    if (progress >= 1) {
      drop.state = "free";
      drop.age = 0;
      drop.visibleFraction = 1;
      drop.radius = radiusOf(drop.volume);
      drop.cooldown = 2.2;
      drop.elongation = drop.deform[2];
      const independentDrift = randomDirection();
      drop.velocity = site.direction.map(
        (v, axis) => v * 0.12 + independentDrift[axis] * 0.065,
      );
      counters.detachments++;
      emit("detach", {
        dropId: drop.id,
        emitterId: site.id,
        volume: drop.volume,
        position: [...drop.position],
        radius: drop.radius,
      });
    }
  }

  function updateDrain(drop, dt) {
    const segment = METAL_SEGMENTS[drop.drainSegment];
    drop.lifeProgress = Math.min(1, drop.lifeProgress + dt / drop.drainTime);
    const progress = drop.lifeProgress;
    const t =
      drop.drainStart +
      (drop.drainEnd - drop.drainStart) * smooth(progress) * 0.62;
    const along = segment.a.map((v, axis) => v + (segment.b[axis] - v) * t);
    drop.visibleFraction = 1 - smooth(progress);
    drop.radius = radiusOf(drop.volume * drop.visibleFraction);
    const long = 1 + 4.3 * smooth(progress);
    const offset = segment.radius + (drop.radius / Math.sqrt(long)) * 0.34;
    const contact = along.map((v, axis) => v + drop.drainNormal[axis] * offset);
    const settle = smooth(progress / 0.22);
    drop.position = contact.map(
      (v, axis) => drop.drainStartPosition[axis] * (1 - settle) + v * settle,
    );
    setShape(drop, long, subtract(segment.b, segment.a));
    if (progress >= 1) {
      const candidates = EMITTERS.map((_, index) => index).filter(
        (index) =>
          !EMITTERS[index].segmentIndices.includes(drop.drainSegment) &&
          !drops.some(
            (other) =>
              other !== drop &&
              other.state === "forming" &&
              other.siteIndex === index,
          ),
      );
      const site = candidates[Math.floor(random() * candidates.length)] ?? 0;
      beginFormation(drop, site);
    }
  }

  function updateFree(drop, dt) {
    drop.cooldown = Math.max(0, drop.cooldown - dt);
    drop.splitBridgeTime = Math.max(0, drop.splitBridgeTime - dt);
    drop.elongation += (1 - drop.elongation) * (1 - Math.exp(-dt * 1.7));
    const speed = Math.hypot(...drop.velocity);
    // Independent, weak recirculating drift avoids a shared gravitational axis.
    const p = drop.phase;
    const drift = [
      Math.sin(elapsed * 0.23 + p),
      Math.cos(elapsed * 0.19 + p * 1.9),
      Math.sin(elapsed * 0.17 - p * 1.3),
    ];
    let target = null;
    if (attractor) {
      const gap = subtract(attractor, drop.position);
      const length = Math.hypot(...gap);
      if (length < 3.25)
        target = gap.map(
          (v) => (v * Math.min(0.9, length * 0.45)) / (length || 1),
        );
    }
    for (let axis = 0; axis < 3; axis++) {
      drop.velocity[axis] += drift[axis] * 0.0016 * dt;
      if (target)
        drop.velocity[axis] +=
          (target[axis] - drop.velocity[axis]) * (1 - Math.exp(-dt * 1.35));
      else drop.velocity[axis] *= Math.exp(-dt * 0.008);
      drop.position[axis] += drop.velocity[axis] * dt;
      const margin = drop.radius * Math.max(...drop.deform) + 0.045;
      const low = ROOM_BOUNDS.min[axis] + margin;
      const high = ROOM_BOUNDS.max[axis] - margin;
      if (drop.position[axis] < low) {
        drop.position[axis] = low;
        drop.velocity[axis] = Math.abs(drop.velocity[axis]) * 0.92;
      }
      if (drop.position[axis] > high) {
        drop.position[axis] = high;
        drop.velocity[axis] = -Math.abs(drop.velocity[axis]) * 0.92;
      }
    }
    const newSpeed = Math.hypot(...drop.velocity);
    if (newSpeed > 1.1)
      drop.velocity = drop.velocity.map((v) => (v / newSpeed) * 1.1);
    const wobble = Math.sin(elapsed * 2.4 + p) * 0.025 * Math.min(1, speed * 3);
    const long = Math.max(
      drop.elongation,
      1 + Math.min(0.28, speed * 0.22) + wobble,
    );
    const follow = 1 - Math.exp(-dt * 2.2);
    const motionAxis = norm(drop.velocity, drop.orientation);
    const axis = drop.orientation.map(
      (v, i) => v * (1 - follow) + motionAxis[i] * follow,
    );
    // Two capillary modes exchange width without changing volume. Interaction
    // energy briefly strengthens the motion, then relaxes into a quiet drift.
    const amplitude = .018 + Math.min(.11, Math.abs(drop.elongation - 1) * .28);
    const crossSection = Math.exp(Math.sin(elapsed * 3.1 + p) * amplitude);
    setShape(drop, long, axis, crossSection);

    if (drop.age > 1.3) {
      for (
        let segmentIndex = 0;
        segmentIndex < METAL_SEGMENTS.length;
        segmentIndex++
      ) {
        if (drop.originSegments.includes(segmentIndex) && drop.age < 14)
          continue;
        const segment = METAL_SEGMENTS[segmentIndex];
        const closest = closestPointOnSegment(
          drop.position,
          segment.a,
          segment.b,
        );
        if (closest.distance < drop.radius * 0.81 + segment.radius) {
          beginDrain(drop, segmentIndex, closest);
          break;
        }
      }
    }
    if (
      drop.state === "free" &&
      drop.radius > 0.367 &&
      drop.age > drop.splitWait &&
      drop.cooldown === 0
    )
      split(drop);
  }

  function step(dt) {
    elapsed += dt;
    if (attractorDuration > 0) {
      attractorDuration -= dt;
      if (attractorDuration <= 0) setAttractor(null);
    }
    for (const drop of [...drops]) {
      drop.age += dt;
      drop.highlight *= Math.exp(-dt * 2.1);
      drop.bridgeTo = null;
      if (drop.state === "forming") updateFormation(drop, dt);
      else if (drop.state === "draining") updateDrain(drop, dt);
      else updateFree(drop, dt);
    }
    for (let i = 0; i < drops.length; i++) {
      const a = drops[i];
      if (a.state !== "free") continue;
      for (let j = i + 1; j < drops.length; j++) {
        const b = drops[j];
        if (b.state !== "free") continue;
        const gap = subtract(b.position, a.position);
        const length = Math.hypot(...gap);
        const sumRadii = a.radius + b.radius;
        const siblings = a.splitSibling === b.id && a.splitBridgeTime > 0;
        const canMerge = a.cooldown === 0 && b.cooldown === 0;
        if (
          (siblings || canMerge) &&
          length < sumRadii * 1.32 &&
          a.bridgeTo === null &&
          b.bridgeTo === null
        ) {
          a.bridgeTo = b.id;
          b.bridgeTo = a.id;
        }
        if (!canMerge || length >= sumRadii * 2) continue;
        if (length <= sumRadii * 0.73) {
          merge(a, b);
          j--;
          continue;
        }
        const force = Math.max(0, 1 - length / (sumRadii * 2)) ** 2 * 0.11;
        const total = a.volume + b.volume;
        for (let axis = 0; axis < 3; axis++) {
          const impulse = (gap[axis] / (length || 1)) * force * dt;
          a.velocity[axis] += (impulse * b.volume) / total;
          b.velocity[axis] -= (impulse * a.volume) / total;
        }
      }
    }
    counters.gatheredCount = attractor
      ? drops.filter(
          (drop) =>
            drop.state === "free" && distance(drop.position, attractor) < 1.25,
        ).length
      : 0;
    if (counters.gatheredCount >= 3 && !gatherAnnounced) {
      gatherAnnounced = true;
      emit("gather", { count: counters.gatheredCount });
    }
  }

  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    accumulator += Math.min(MAX_CATCHUP, dt);
    while (accumulator + 1e-12 >= FIXED_STEP) {
      step(FIXED_STEP);
      accumulator = Math.max(0, accumulator - FIXED_STEP);
    }
  }

  /** Exact ray/ellipsoid pick, matching the renderer's volume-preserving shape. */
  function pick(origin, direction) {
    if (
      origin?.length !== 3 ||
      direction?.length !== 3 ||
      !origin.every(Number.isFinite) ||
      !direction.every(Number.isFinite) ||
      Math.hypot(...direction) < 1e-9
    )
      return null;
    const ray = norm(direction);
    let nearest = null;
    for (const drop of drops) {
      if (drop.radius < 0.012) continue;
      const z = drop.orientation;
      const x = norm(cross(Math.abs(z[1]) >= 0.92 ? [1, 0, 0] : [0, 1, 0], z));
      const y = cross(z, x);
      const basis = [x, y, z];
      const offset = subtract(origin, drop.position);
      const ro = basis.map(
        (axis, i) => dot(offset, axis) / (drop.radius * drop.deform[i]),
      );
      const rd = basis.map(
        (axis, i) => dot(ray, axis) / (drop.radius * drop.deform[i]),
      );
      const a = dot(rd, rd),
        b = dot(ro, rd),
        c = dot(ro, ro) - 1;
      const discriminant = b * b - a * c;
      if (discriminant < 0) continue;
      const root = Math.sqrt(discriminant);
      let hitDistance = (-b - root) / a;
      if (hitDistance < 0.001) hitDistance = (-b + root) / a;
      if (hitDistance < 0.001 || (nearest && hitDistance >= nearest.distance))
        continue;
      nearest = {
        id: drop.id,
        dropId: drop.id,
        distance: hitDistance,
        point: origin.map((v, i) => v + ray[i] * hitDistance),
        drop,
      };
    }
    return nearest;
  }

  function interact(origin, direction, mode = "push") {
    const hit = pick(origin, direction);
    if (!hit) return null;
    const drop = hit.drop;
    drop.highlight = 1;
    counters.interactions++;
    if (mode === "split") {
      const result = split(
        drop,
        norm(cross(norm(direction), [0, 1, 0]), [1, 0, 0]),
        "interaction",
      );
      if (result) return result;
    } else if (mode === "attract") {
      setAttractor(origin.map((v, i) => v + norm(direction)[i] * 1.7));
      attractorDuration = 3;
    } else if (drop.state === "free") {
      const ray = norm(direction);
      drop.velocity = drop.velocity.map((v, i) => v + ray[i] * 0.52);
      drop.elongation = 1.24;
    }
    emit("interact", { dropId: drop.id, mode, state: drop.state });
    return {
      type: mode === "split" ? "pulse" : mode,
      dropId: drop.id,
      point: hit.point,
      state: drop.state,
    };
  }

  function setAttractor(pointOrNull) {
    if (
      pointOrNull &&
      (!pointOrNull.every(Number.isFinite) || pointOrNull.length !== 3)
    )
      throw new TypeError("The attractor needs a finite world-space point.");
    if (!attractor || !pointOrNull) gatherAnnounced = false;
    attractor = pointOrNull ? [...pointOrNull] : null;
    attractorDuration = 0;
    if (!attractor) counters.gatheredCount = 0;
  }

  function stats() {
    const totalVolume = drops.reduce((sum, drop) => sum + drop.volume, 0);
    const visibleVolume = drops.reduce(
      (sum, drop) => sum + volumeOf(drop.radius),
      0,
    );
    return {
      ...counters,
      elapsed,
      count: drops.length,
      freeCount: drops.filter((drop) => drop.state === "free").length,
      formingCount: drops.filter((drop) => drop.state === "forming").length,
      drainingCount: drops.filter((drop) => drop.state === "draining").length,
      initialVolume,
      totalVolume,
      visibleVolume,
      reservoirVolume: Math.max(0, totalVolume - visibleVolume),
    };
  }

  reset();
  return {
    update,
    getDrops: () => drops,
    pick,
    interact,
    setAttractor,
    stats,
    reset,
  };
}
