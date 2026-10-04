import { METAL_SEGMENTS, ROOM_BOUNDS } from "./liquid-room.js";

const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const subtract = (a, b) => a.map((value, axis) => value - b[axis]);
const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
const pointAlong = (a, delta, t) =>
  a.map((value, axis) => value + delta[axis] * t);
const SKIN = 0.0015;
const MAX_STEP = 0.08;

/** Exact closest points between two finite segments, including degenerate ones. */
export function closestPointsBetweenSegments(a0, a1, b0, b1) {
  const a = subtract(a1, a0),
    b = subtract(b1, b0),
    between = subtract(a0, b0);
  const aa = dot(a, a),
    bb = dot(b, b),
    ab = dot(a, b);
  const ar = dot(a, between),
    br = dot(b, between);
  let s = 0,
    t = 0;
  if (aa <= 1e-14 && bb <= 1e-14) {
    s = t = 0;
  } else if (aa <= 1e-14) {
    t = clamp(br / bb, 0, 1);
  } else if (bb <= 1e-14) {
    s = clamp(-ar / aa, 0, 1);
  } else {
    const denominator = aa * bb - ab * ab;
    s =
      denominator > 1e-14 ? clamp((ab * br - ar * bb) / denominator, 0, 1) : 0;
    t = (ab * s + br) / bb;
    if (t < 0) {
      t = 0;
      s = clamp(-ar / aa, 0, 1);
    } else if (t > 1) {
      t = 1;
      s = clamp((ab - ar) / aa, 0, 1);
    }
  }
  const pointA = pointAlong(a0, a, s),
    pointB = pointAlong(b0, b, t);
  return {
    pointA,
    pointB,
    s,
    t,
    distance: Math.hypot(...subtract(pointA, pointB)),
  };
}

/**
 * Move a grounded, vertical capsule through the shared chamber geometry.
 * worldDelta is [worldX, ignoredY, worldZ]. The eye stays at eyeHeight.
 * Each small step resolves the entire body spine, so bars between the eyes and
 * feet cannot be passed through. Tangential movement survives the projection.
 */
export function moveWalkingCamera(
  position,
  worldDelta,
  { radius = 0.21, eyeHeight = 1.65 } = {},
) {
  radius = Number.isFinite(radius) && radius > 0 ? Math.min(radius, 1.5) : 0.21;
  eyeHeight = Number.isFinite(eyeHeight)
    ? clamp(eyeHeight, radius + 0.02, ROOM_BOUNDS.max[1] - radius - SKIN)
    : 1.65;
  const lowerHeight = Math.min(
    eyeHeight,
    Math.max(0.22, ROOM_BOUNDS.min[1] + radius + 0.01),
  );
  const minimumX = ROOM_BOUNDS.min[0] + radius + SKIN,
    maximumX = ROOM_BOUNDS.max[0] - radius - SKIN;
  const minimumZ = ROOM_BOUNDS.min[2] + radius + SKIN,
    maximumZ = ROOM_BOUNDS.max[2] - radius - SKIN;
  const result = [
    clamp(Number.isFinite(position?.[0]) ? position[0] : 0, minimumX, maximumX),
    eyeHeight,
    clamp(
      Number.isFinite(position?.[2]) ? position[2] : 4.5,
      minimumZ,
      maximumZ,
    ),
  ];
  let dx = Number.isFinite(worldDelta?.[0]) ? worldDelta[0] : 0;
  let dz = Number.isFinite(worldDelta?.[2]) ? worldDelta[2] : 0;
  // A straight traversal cannot usefully exceed several room diagonals. Bound
  // malformed finite input as well as NaN without an unbounded substep loop.
  const maximumTravel =
    Math.hypot(maximumX - minimumX, maximumZ - minimumZ) * 4;
  const magnitude = Math.hypot(dx, dz);
  if (magnitude > maximumTravel) {
    dx = (dx / magnitude) * maximumTravel;
    dz = (dz / magnitude) * maximumTravel;
  }
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / MAX_STEP));
  const stepX = dx / count,
    stepZ = dz / count;

  function contain() {
    result[0] = clamp(result[0], minimumX, maximumX);
    result[2] = clamp(result[2], minimumZ, maximumZ);
  }

  function resolve(previousX, previousZ) {
    for (let pass = 0; pass < 24; pass++) {
      let maximumCorrection = 0;
      for (const rod of METAL_SEGMENTS) {
        const lower = [result[0], lowerHeight, result[2]],
          upper = [result[0], eyeHeight, result[2]];
        const closest = closestPointsBetweenSegments(
          lower,
          upper,
          rod.a,
          rod.b,
        );
        const safe = radius + rod.radius + SKIN;
        if (closest.distance >= safe - 1e-8) continue;
        const verticalGap = closest.pointA[1] - closest.pointB[1];
        const desiredHorizontal = Math.sqrt(
          Math.max(0, safe * safe - verticalGap * verticalGap),
        );
        let nx = closest.pointA[0] - closest.pointB[0],
          nz = closest.pointA[2] - closest.pointB[2];
        const horizontal = Math.hypot(nx, nz);
        if (horizontal > 1e-9) {
          nx /= horizontal;
          nz /= horizontal;
        } else {
          // A body exactly on a rod needs a stable separating normal. Prefer
          // the side it came from, then the perpendicular to the rod's run.
          nx = previousX - closest.pointB[0];
          nz = previousZ - closest.pointB[2];
          let length = Math.hypot(nx, nz);
          if (length < 1e-9) {
            nx = -(rod.b[2] - rod.a[2]);
            nz = rod.b[0] - rod.a[0];
            length = Math.hypot(nx, nz);
            if (length < 1e-9) {
              nx = -stepX;
              nz = -stepZ;
              length = Math.hypot(nx, nz);
              if (length < 1e-9) {
                nx = 1;
                nz = 0;
                length = 1;
              }
            } else if (nx * stepX + nz * stepZ > 0) {
              nx *= -1;
              nz *= -1;
            }
          }
          nx /= length;
          nz /= length;
        }
        const correction = Math.max(0, desiredHorizontal - horizontal) + 1e-7;
        result[0] += nx * correction;
        result[2] += nz * correction;
        maximumCorrection = Math.max(maximumCorrection, correction);
        contain();
      }
      if (maximumCorrection < 1e-7) break;
    }
  }

  // Repair an initial overlap before movement rather than tunnelling to an
  // arbitrary far side of a frame on the first interactive frame.
  resolve(result[0] - stepX, result[2] - stepZ);
  for (let step = 0; step < count; step++) {
    const previousX = result[0],
      previousZ = result[2];
    result[0] += stepX;
    result[2] += stepZ;
    contain();
    resolve(previousX, previousZ);
  }
  return result;
}
