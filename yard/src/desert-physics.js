const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const TETHER_RADIUS = 1.75;
export const CRYSTAL_RADIUS = 1.32;
export const GEL_ROUNDING = .18;
export const GEL_SOFT_STRETCH = 1.6;

// C2 at the knee, with progressively less travel per extra pointer distance.
// The logarithmic tail still yields; there is no hard reach clamp.
export function gelGrabReach(reach) {
  const knee = CRYSTAL_RADIUS * 1.1, width = CRYSTAL_RADIUS * (GEL_SOFT_STRETCH - 1.1);
  return reach <= knee ? reach : knee + width * Math.asinh((reach - knee) / width);
}

export function gelStretchResponse(ratio, out = [0, 0]) {
  const strain = Math.max(0, (ratio - 1.3) / (GEL_SOFT_STRETCH - 1.3));
  const overrun = Math.max(0, (ratio - GEL_SOFT_STRETCH) / .2);
  const stiffness = 1 + 1.8 * strain ** 3 + .5 * overrun ** 4;
  const derivative = 5.4 * strain * strain / (GEL_SOFT_STRETCH - 1.3) + 2 * overrun ** 3 / .2;
  const root = Math.sqrt(stiffness);
  out[0] = (ratio - 1) * root;
  out[1] = root + (ratio - 1) * derivative / (2 * root);
  return out;
}

export function createTetrahedralLattice(divisions = 5, radius = CRYSTAL_RADIUS) {
  const ring = radius * Math.sqrt(8) / 3;
  const corners = [[0, radius, 0], ...[0, 1, 2].map(i => [
    ring * Math.cos(i * Math.PI * 2 / 3), -radius / 3, ring * Math.sin(i * Math.PI * 2 / 3),
  ])];
  const rest = [], weights = [], ids = new Map(), faces = [], edges = [];
  for (let a = 0; a <= divisions; a++) for (let b = 0; b <= divisions - a; b++)
    for (let c = 0; c <= divisions - a - b; c++) {
      const w = [a, b, c, divisions - a - b - c];
      ids.set(w.join(','), weights.length); weights.push(w);
      for (let axis = 0; axis < 3; axis++) rest.push(w.reduce((sum, n, i) => sum + n * corners[i][axis] / divisions, 0));
    }
  function orient(a, b, c) {
    const ax = rest[a * 3], ay = rest[a * 3 + 1], az = rest[a * 3 + 2];
    const bx = rest[b * 3] - ax, by = rest[b * 3 + 1] - ay, bz = rest[b * 3 + 2] - az;
    const cx = rest[c * 3] - ax, cy = rest[c * 3 + 1] - ay, cz = rest[c * 3 + 2] - az;
    if ((by * cz - bz * cy) * ax + (bz * cx - bx * cz) * ay + (bx * cy - by * cx) * az < 0)
      faces.push(a, c, b);
    else faces.push(a, b, c);
  }
  for (let omitted = 0; omitted < 4; omitted++) {
    const face = [0, 1, 2, 3].filter(i => i !== omitted);
    const id = (x, y) => {
      const w = [0, 0, 0, 0]; w[face[0]] = divisions - x - y; w[face[1]] = x; w[face[2]] = y;
      return ids.get(w.join(','));
    };
    for (let x = 0; x < divisions; x++) for (let y = 0; y < divisions - x; y++) {
      orient(id(x, y), id(x + 1, y), id(x, y + 1));
      if (x + y < divisions - 1) orient(id(x + 1, y), id(x + 1, y + 1), id(x, y + 1));
    }
  }
  weights.forEach((w, i) => {
    for (const span of [1, 2]) for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
      if (a === b || w[a] < span) continue;
      const next = [...w]; next[a] -= span; next[b] += span;
      const j = ids.get(next.join(','));
      if (j <= i) continue;
      const dx = rest[i * 3] - rest[j * 3], dy = rest[i * 3 + 1] - rest[j * 3 + 1], dz = rest[i * 3 + 2] - rest[j * 3 + 2];
      edges.push({ a: i, b: j, length: Math.hypot(dx, dy, dz), compliance: span === 1 ? .00010 : .0006 });
    }
  });
  const cornerCells = corners.map((_, corner) => {
    const w = [0, 0, 0, 0]; w[corner] = divisions;
    const cell = [ids.get(w.join(','))];
    for (let axis = 0; axis < 4; axis++) if (axis !== corner) {
      const next = [...w]; next[corner]--; next[axis]++;
      cell.push(ids.get(next.join(',')));
    }
    return cell;
  });
  return { rest: new Float64Array(rest), faces: new Uint16Array(faces), edges, corners, cornerCells };
}

export function bodyVolume(positions, faces, gradients) {
  gradients?.fill(0);
  let volume = 0;
  for (let f = 0; f < faces.length; f += 3) {
    const a = faces[f] * 3, b = faces[f + 1] * 3, c = faces[f + 2] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
    const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
    const x = by * cz - bz * cy, y = bz * cx - bx * cz, z = bx * cy - by * cx;
    volume += (ax * x + ay * y + az * z) / 6;
    if (gradients) {
      gradients[a] += x / 6; gradients[a + 1] += y / 6; gradients[a + 2] += z / 6;
      gradients[b] += (cy * az - cz * ay) / 6;
      gradients[b + 1] += (cz * ax - cx * az) / 6;
      gradients[b + 2] += (cx * ay - cy * ax) / 6;
      gradients[c] += (ay * bz - az * by) / 6;
      gradients[c + 1] += (az * bx - ax * bz) / 6;
      gradients[c + 2] += (ax * by - ay * bx) / 6;
    }
  }
  return volume;
}

export function cornerVolume(positions, cell, gradients) {
  const a = cell[0] * 3, b = cell[1] * 3, c = cell[2] * 3, d = cell[3] * 3;
  const ax = positions[a] - positions[d], ay = positions[a + 1] - positions[d + 1], az = positions[a + 2] - positions[d + 2];
  const bx = positions[b] - positions[d], by = positions[b + 1] - positions[d + 1], bz = positions[b + 2] - positions[d + 2];
  const cx = positions[c] - positions[d], cy = positions[c + 1] - positions[d + 1], cz = positions[c + 2] - positions[d + 2];
  const x = (by * cz - bz * cy) / 6, y = (bz * cx - bx * cz) / 6, z = (bx * cy - by * cx) / 6;
  if (gradients) {
    gradients[0] = x; gradients[1] = y; gradients[2] = z;
    gradients[3] = (cy * az - cz * ay) / 6; gradients[4] = (cz * ax - cx * az) / 6; gradients[5] = (cx * ay - cy * ax) / 6;
    gradients[6] = (ay * bz - az * by) / 6; gradients[7] = (az * bx - ax * bz) / 6; gradients[8] = (ax * by - ay * bx) / 6;
    for (let axis = 0; axis < 3; axis++) gradients[9 + axis] = -gradients[axis] - gradients[3 + axis] - gradients[6 + axis];
  }
  return ax * x + ay * y + az * z;
}

export function createDesertPhysics(sand, { onDetach = () => {} } = {}) {
  const model = createTetrahedralLattice();
  const positions = new Float64Array(model.rest.length), previous = new Float64Array(positions.length);
  const velocities = new Float64Array(positions.length), gradients = new Float64Array(positions.length);
  const edgeLambda = new Float64Array(model.edges.length);
  const elasticResponse = new Float64Array(2);
  const count = positions.length / 3, anchor = [0, sand.sample(0, 0) + 2.3, 0];
  const center = [...anchor], drift = [0, 0, 0];
  const restVolume = bodyVolume(model.rest, model.faces);
  // Surface tension changes the released rest shape into a rounded tetrahedron.
  // Interior nodes keep their radial fraction, avoiding a hollow shell; rescale
  // the new rest shape to the original volume before deriving spring lengths.
  const softRest = new Float64Array(model.rest.length);
  const sphereRadius = Math.cbrt(restVolume * 3 / (4 * Math.PI));
  for (let i = 0; i < count; i++) {
    const p = Array.from(model.rest.slice(i * 3, i * 3 + 3)), length = Math.hypot(...p);
    const fraction = Math.max(...model.corners.map(c => -p.reduce((sum, value, axis) => sum + value * c[axis], 0) / (CRYSTAL_RADIUS * CRYSTAL_RADIUS / 3)));
    for (let axis = 0; axis < 3; axis++) softRest[i * 3 + axis] = p[axis] * (1 - GEL_ROUNDING + GEL_ROUNDING * sphereRadius * fraction / Math.max(length, 1e-8));
  }
  const softScale = Math.cbrt(restVolume / bodyVolume(softRest, model.faces));
  for (let i = 0; i < softRest.length; i++) softRest[i] *= softScale;
  model.softRest = softRest;
  const cornerTargets = model.cornerCells.map(cell => cornerVolume(softRest, cell));
  const cornerGradients = new Float64Array(12);
  for (const edge of model.edges) edge.softLength = Math.hypot(...[0, 1, 2].map(axis => softRest[edge.a * 3 + axis] - softRest[edge.b * 3 + axis]));
  let phase = 'suspended', time = 0, freeAge = 0, accumulator = 0, yaw = 0, grabbed = null, squeeze = 0;
  let contactCount = 0, imprintTick = 0, complianceScale = 2, stretchLoad = 0, grabInfluence = 0, shapeInfluence = 0;
  const grabGoal = [0, 0, 0];
  const orientation = [0, 0, 0, 1], covariance = new Float64Array(9), basis = new Float64Array(9);
  const shapeGoal = new Float64Array(positions.length);
  function rotationBasis() {
    const [x, y, z, w] = orientation;
    basis.set([1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w),
      2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w),
      2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)]);
  }
  function updateShapeGoal() {
    covariance.fill(0);
    for (let i = 0; i < count; i++) for (let column = 0; column < 3; column++) for (let axis = 0; axis < 3; axis++)
      covariance[column * 3 + axis] += (positions[i * 3 + axis] - center[axis]) * softRest[i * 3 + column];
    // Fit a proper rotation to the rest shape; never pin it to the original
    // world orientation or flatten the reference after a long squeeze.
    for (let iteration = 0; iteration < 6; iteration++) {
      rotationBasis();
      let x = 0, y = 0, z = 0, alignment = 0;
      for (let c = 0; c < 9; c += 3) {
        x += basis[c + 1] * covariance[c + 2] - basis[c + 2] * covariance[c + 1];
        y += basis[c + 2] * covariance[c] - basis[c] * covariance[c + 2];
        z += basis[c] * covariance[c + 1] - basis[c + 1] * covariance[c];
        for (let a = 0; a < 3; a++) alignment += basis[c + a] * covariance[c + a];
      }
      const length = Math.hypot(x, y, z);
      if (length < 1e-9) break;
      const angle = Math.min(.35, length / (Math.abs(alignment) + 1e-9));
      const s = Math.sin(angle / 2) / length, w = Math.cos(angle / 2);
      x *= s; y *= s; z *= s;
      const [qx, qy, qz, qw] = orientation;
      orientation[0] = w * qx + x * qw + y * qz - z * qy;
      orientation[1] = w * qy + y * qw + z * qx - x * qz;
      orientation[2] = w * qz + z * qw + x * qy - y * qx;
      orientation[3] = w * qw - x * qx - y * qy - z * qz;
      const norm = Math.hypot(...orientation);
      for (let a = 0; a < 4; a++) orientation[a] /= norm;
    }
    rotationBasis();
    for (let i = 0; i < count; i++) for (let axis = 0; axis < 3; axis++)
      shapeGoal[i * 3 + axis] = center[axis] + basis[axis] * softRest[i * 3]
        + basis[3 + axis] * softRest[i * 3 + 1] + basis[6 + axis] * softRest[i * 3 + 2];
  }
  function placeCrystal() {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let i = 0; i < count; i++) {
      const a = i * 3, x = model.rest[a], y = model.rest[a + 1], z = model.rest[a + 2];
      positions[a] = center[0] + x * c + z * s;
      positions[a + 1] = center[1] + y;
      positions[a + 2] = center[2] - x * s + z * c;
    }
  }
  function detach() {
    if (phase !== 'suspended') return;
    phase = 'released'; freeAge = 0;
    orientation.splice(0, 4, 0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2));
    for (let i = 0; i < count; i++) for (let a = 0; a < 3; a++) velocities[i * 3 + a] = clamp(drift[a], -3, 3);
    onDetach();
  }
  function updateCenter() {
    center.fill(0);
    for (let i = 0; i < count; i++) for (let a = 0; a < 3; a++) center[a] += positions[i * 3 + a] / count;
  }
  function groundContact() {
    for (let i = 0; i < count; i++) {
      const a = i * 3;
      positions[a] = clamp(positions[a], -7.2, 7.2);
      positions[a + 2] = clamp(positions[a + 2], -7.2, 7.2);
      positions[a + 1] = Math.max(positions[a + 1], sand.sample(positions[a], positions[a + 2]) + .025);
    }
  }
  function substep(dt, rotate) {
    time += dt;
    if (phase === 'suspended') {
      if (rotate && !grabbed) yaw += dt * .22;
      for (let a = 0; a < 3; a++) {
        const home = anchor[a] + (a === 1 && rotate ? Math.sin(time * 1.15) * .045 : 0);
        drift[a] += ((home - center[a]) * 6.5 - drift[a] * 1.7) * dt;
        if (grabbed) drift[a] += ((grabbed.target[a] - grabbed.offset[a] - center[a]) * 58 - drift[a] * 7) * dt;
        center[a] += drift[a] * dt;
      }
      placeCrystal();
      if (Math.hypot(...center.map((x, i) => x - anchor[i])) > TETHER_RADIUS) detach();
      return;
    }
    freeAge += dt;
    let peakStretch = 1, deformation = 0;
    for (const edge of model.edges) {
      const a = edge.a * 3, b = edge.b * 3;
      const length = Math.hypot(positions[a] - positions[b], positions[a + 1] - positions[b + 1], positions[a + 2] - positions[b + 2]);
      peakStretch = Math.max(peakStretch, length / Math.max(edge.length, edge.softLength));
      deformation += (length / edge.softLength - 1) ** 2;
    }
    const edgeLoad = clamp((peakStretch - 1.48) / .17, 0, 1);
    const bodyLoad = clamp((Math.sqrt(deformation / model.edges.length) - .26) / .08, 0, 1);
    const load = Math.max(edgeLoad * edgeLoad * (3 - 2 * edgeLoad), bodyLoad * bodyLoad * (3 - 2 * bodyLoad));
    stretchLoad += (load - stretchLoad) * (1 - Math.exp(-dt / .12));
    const blend = 1 - Math.exp(-dt / .055);
    grabInfluence += (Number(Boolean(grabbed)) - grabInfluence) * blend;
    shapeInfluence += (Number(Boolean(grabbed || squeeze)) - shapeInfluence) * blend;
    // Yield under a held patch, then recover stiffness gradually instead of
    // switching to a hard spring. Only highly stretched material recovers
    // slightly faster; the smoothed load makes that extra speed fade out.
    const complianceGoal = grabbed ? 220 : 2 + squeeze * 35;
    const recoveryTime = .7 / (1 + .75 * stretchLoad);
    complianceScale += (complianceGoal - complianceScale) * (1 - Math.exp(-dt / (complianceGoal > complianceScale ? .07 : recoveryTime)));
    previous.set(positions);
    edgeLambda.fill(0);
    updateCenter();
    updateShapeGoal();
    // Damp only changes in edge length. Translation and rigid rotation have
    // no axial relative velocity, so carrying and tumbling remain free.
    const damping = 1 - Math.exp(-dt * (14 - 11 * grabInfluence));
    for (const edge of model.edges) {
      const a = edge.a * 3, b = edge.b * 3;
      const x = positions[a] - positions[b], y = positions[a + 1] - positions[b + 1], z = positions[a + 2] - positions[b + 2];
      const length2 = x * x + y * y + z * z;
      if (length2 < 1e-12) continue;
      const impulse = ((velocities[a] - velocities[b]) * x + (velocities[a + 1] - velocities[b + 1]) * y
        + (velocities[a + 2] - velocities[b + 2]) * z) / length2 * damping * .5;
      velocities[a] -= x * impulse; velocities[b] += x * impulse;
      velocities[a + 1] -= y * impulse; velocities[b + 1] += y * impulse;
      velocities[a + 2] -= z * impulse; velocities[b + 2] += z * impulse;
    }
    if (grabbed) {
      const reach = Math.hypot(...grabbed.target.map((p, a) => p - center[a]));
      const scale = gelGrabReach(reach) / Math.max(reach, 1e-8);
      for (let a = 0; a < 3; a++) grabGoal[a] = center[a] + (grabbed.target[a] - center[a]) * scale;
    }
    for (let i = 0; i < count; i++) {
      const a = i * 3;
      velocities[a + 1] -= 7.8 * dt;
      velocities[a + 1] -= (positions[a + 1] - center[1]) * squeeze * 95 * dt;
      for (let axis = 0; axis < 3; axis++) {
        velocities[a + axis] += (shapeGoal[a + axis] - positions[a + axis]) * (12 - 10 * shapeInfluence) * dt;
        velocities[a + axis] *= Math.exp(-dt * .8);
        positions[a + axis] += clamp(velocities[a + axis], -12, 12) * dt;
      }
    }
    let volumeLambda = 0;
    contactCount = 0;
    for (let iteration = 0; iteration < 7; iteration++) {
      if (grabbed) for (const node of grabbed.nodes) {
        const a = node.id * 3, strength = .27 * node.weight;
        for (let axis = 0; axis < 3; axis++) {
          const goal = grabGoal[axis] + node.offset[axis];
          positions[a + axis] += .25 * Math.tanh((goal - positions[a + axis]) / .25) * strength;
        }
      }
      model.edges.forEach((edge, index) => {
        const a = edge.a * 3, b = edge.b * 3;
        const x = positions[a] - positions[b], y = positions[a + 1] - positions[b + 1], z = positions[a + 2] - positions[b + 2];
        const length = Math.hypot(x, y, z);
        if (length < 1e-8) return;
        const restLength = edge.length + (edge.softLength - edge.length) * Math.min(1, freeAge * 1.8);
        // A continuous strain-dependent spring replaces the hard projection.
        // It keeps yielding beyond the nominal boundary, with growing resistance.
        // Solve the nonlinear constraint with its actual gradient. Changing
        // compliance inside the iteration would recycle an incompatible lambda
        // and can kick the surface when it crosses the soft boundary.
        gelStretchResponse(length / restLength, elasticResponse);
        const constraint = restLength * elasticResponse[0], gradient = elasticResponse[1];
        const alpha = edge.compliance * complianceScale / (dt * dt);
        const correction = (-constraint - alpha * edgeLambda[index]) / (2 * gradient * gradient + alpha);
        edgeLambda[index] += correction;
        const scale = correction * gradient / length;
        positions[a] += x * scale; positions[b] -= x * scale;
        positions[a + 1] += y * scale; positions[b + 1] -= y * scale;
        positions[a + 2] += z * scale; positions[b + 2] -= z * scale;
      });
      const volume = bodyVolume(positions, model.faces, gradients);
      let weight = .000004 / (dt * dt);
      for (const value of gradients) weight += value * value;
      const correction = clamp((restVolume - volume - .000004 / (dt * dt) * volumeLambda) / weight, -.3, .3);
      volumeLambda += correction;
      for (let i = 0; i < positions.length; i++) positions[i] += gradients[i] * correction;
      // Edge lengths cannot distinguish a tip from its mirror image through
      // the three neighbouring nodes. Only the four tip cells need this small
      // orientation barrier; ordinary stretch/recoil constraints stay intact.
      for (let corner = 0; corner < model.cornerCells.length; corner++) {
        const cell = model.cornerCells[corner], sign = Math.sign(cornerTargets[corner]);
        const signedVolume = cornerVolume(positions, cell) * sign;
        const minimum = Math.abs(cornerTargets[corner]) * .06;
        if (signedVolume >= minimum) continue;
        cornerVolume(positions, cell, cornerGradients);
        let weight = 1e-8 / (dt * dt);
        for (const value of cornerGradients) weight += value * value;
        const correction = (minimum - signedVolume) * sign / weight;
        for (let node = 0; node < 4; node++) for (let axis = 0; axis < 3; axis++)
          positions[cell[node] * 3 + axis] += cornerGradients[node * 3 + axis] * correction;
      }
      groundContact();
    }
    for (let i = 0; i < count; i++) {
      const a = i * 3;
      for (let axis = 0; axis < 3; axis++) velocities[a + axis] = clamp((positions[a + axis] - previous[a + axis]) / dt, -12, 12);
      const ground = sand.sample(positions[a], positions[a + 2]);
      if (positions[a + 1] < ground + .045) {
        contactCount++;
        velocities[a] *= .86; velocities[a + 2] *= .86;
        velocities[a + 1] = Math.max(0, velocities[a + 1]) * .18;
        const impact = Math.max(0, previous[a + 1] - positions[a + 1]) / dt;
        const shear = Math.hypot(velocities[a], velocities[a + 2]);
        if ((i + imprintTick) % 4 === 0) sand.stamp(positions[a], positions[a + 2], .34,
          Math.min(.38, .105 + impact * .06), velocities[a], velocities[a + 2], impact * .55 + shear * .3);
      }
    }
    imprintTick++;
    updateCenter();
  }
  placeCrystal();
  return {
    model, positions, center, anchor, restVolume,
    get phase() { return phase; },
    get freeAge() { return freeAge; },
    get distance() { return Math.hypot(...center.map((x, i) => x - anchor[i])); },
    get contacts() { return contactCount; },
    get speed() {
      let energy = 0;
      for (const value of velocities) energy += value * value;
      return Math.sqrt(energy / count);
    },
    get volumeRatio() { return bodyVolume(positions, model.faces) / restVolume; },
    update(delta, { rotate = true } = {}) {
      accumulator += Math.min(Math.max(delta, 0), .05);
      let advanced = false;
      while (accumulator >= 1 / 120) { substep(1 / 120, rotate); accumulator -= 1 / 120; advanced = true; }
      return advanced;
    },
    push(direction = [0, -.15, -1], strength = 2.5) {
      if (phase === 'suspended') for (let a = 0; a < 3; a++) drift[a] += direction[a] * strength;
      else for (let i = 0; i < count; i++) for (let a = 0; a < 3; a++) velocities[i * 3 + a] += direction[a] * strength;
    },
    grab(point) {
      const nodes = [];
      for (let i = 0; i < count; i++) {
        const offset = [0, 1, 2].map(a => positions[i * 3 + a] - point[a]);
        const distance = Math.hypot(...offset);
        if (distance < .48) nodes.push({ id: i, offset, weight: Math.exp(-distance * distance / .075) });
      }
      if (!nodes.length) {
        let nearest = 0, distance = Infinity;
        for (let i = 0; i < count; i++) {
          const d = Math.hypot(...point.map((p, a) => positions[i * 3 + a] - p));
          if (d < distance) { distance = d; nearest = i; }
        }
        nodes.push({ id: nearest, offset: [0, 0, 0], weight: 1 });
      }
      grabbed = { target: [...point], offset: point.map((p, a) => p - center[a]), nodes };
    },
    moveGrab(point) { if (grabbed) grabbed.target = point.map((p, a) => clamp(p, a === 1 ? -.6 : -6, 6)); },
    release() { grabbed = null; squeeze = 0; },
    squeeze(value) { squeeze = clamp(value, 0, 1); },
    dropFromAbove(height) {
      if (phase !== 'released' || grabbed || squeeze || !Number.isFinite(height)) return false;
      // Translate the settled gel intact, retaining its volume, orientation,
      // deformation and released state. There is no new levitation tether.
      const destination = [anchor[0], Math.max(anchor[1] + 4, height), anchor[2]];
      for (let i = 0; i < positions.length; i++) positions[i] += destination[i % 3] - center[i % 3];
      center.splice(0, 3, ...destination); previous.set(positions); velocities.fill(0);
      for (let i = 1; i < velocities.length; i += 3) velocities[i] = -.35;
      contactCount = 0; accumulator = 0;
      return true;
    },
    reset() {
      phase = 'suspended'; time = freeAge = accumulator = yaw = contactCount = 0;
      center.splice(0, 3, ...anchor); drift.fill(0); velocities.fill(0); grabbed = null; squeeze = 0; complianceScale = 2;
      stretchLoad = grabInfluence = shapeInfluence = 0;
      placeCrystal();
    },
  };
}
