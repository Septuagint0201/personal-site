/** Loop subdivision, baked as weights over the physical nodes.
 * The linear stencil preserves a sharp tetrahedron; the smooth stencil gives
 * the released surface continuous wet highlights without adding physics nodes. */
export function createDesertSkin(model, levels = 2) {
  const used = [...new Set(model.faces)], ids = new Map(used.map((id, i) => [id, i]));
  let linear = used.map(id => new Map([[id, 1]]));
  let smooth = linear.map(w => new Map(w));
  let faces = Array.from(model.faces, id => ids.get(id));
  const mix = (items) => {
    const result = new Map();
    for (const [weights, scale] of items) for (const [i, weight] of weights)
      result.set(i, (result.get(i) || 0) + weight * scale);
    return result;
  };
  for (let level = 0; level < levels; level++) {
    const edges = new Map(), neighbors = linear.map(() => new Set());
    const key = (a, b) => a < b ? `${a},${b}` : `${b},${a}`;
    for (let f = 0; f < faces.length; f += 3) for (let n = 0; n < 3; n++) {
      const a = faces[f + n], b = faces[f + (n + 1) % 3], c = faces[f + (n + 2) % 3];
      neighbors[a].add(b); neighbors[b].add(a);
      const k = key(a, b);
      if (!edges.has(k)) edges.set(k, { a, b, opposite: [] });
      edges.get(k).opposite.push(c);
    }
    const nextLinear = linear.map(w => new Map(w));
    const nextSmooth = smooth.map((w, i) => {
      const n = neighbors[i].size, beta = n === 3 ? 3 / 16 : 3 / (8 * n);
      return mix([[w, 1 - n * beta], ...[...neighbors[i]].map(j => [smooth[j], beta])]);
    });
    for (const edge of edges.values()) {
      edge.id = nextLinear.length;
      nextLinear.push(mix([[linear[edge.a], .5], [linear[edge.b], .5]]));
      nextSmooth.push(mix([[smooth[edge.a], .375], [smooth[edge.b], .375],
        ...edge.opposite.map(i => [smooth[i], .125])]));
    }
    const nextFaces = [];
    for (let f = 0; f < faces.length; f += 3) {
      const [a, b, c] = faces.slice(f, f + 3);
      const ab = edges.get(key(a, b)).id, bc = edges.get(key(b, c)).id, ca = edges.get(key(c, a)).id;
      nextFaces.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    linear = nextLinear; smooth = nextSmooth; faces = nextFaces;
  }
  // Flatten each vertex's sparse stencil once. Blend only when softness
  // changes, then transform xyz together instead of walking six JS iterators.
  const count = linear.length;
  const offsets = new Uint32Array(count + 1), nodes = [], sharp = [], delta = [];
  for (let i = 0; i < count; i++) {
    offsets[i] = nodes.length;
    for (const id of new Set([...linear[i].keys(), ...smooth[i].keys()])) {
      const a = linear[i].get(id) || 0, b = smooth[i].get(id) || 0;
      nodes.push(id * 3); sharp.push(a); delta.push(b - a);
    }
  }
  offsets[count] = nodes.length;
  const nodeOffsets = new Uint16Array(nodes), sharpWeights = new Float64Array(sharp), smoothDelta = new Float64Array(delta);
  const weights = new Float64Array(nodes.length);
  let previousSoftness = NaN;
  return {
    faces: new Uint16Array(faces), count,
    write(target, positions, softness, center, scale = 1) {
      if (softness !== previousSoftness) {
        for (let i = 0; i < weights.length; i++) weights[i] = sharpWeights[i] + smoothDelta[i] * softness;
        previousSoftness = softness;
      }
      for (let i = 0; i < count; i++) {
        let x = 0, y = 0, z = 0;
        for (let j = offsets[i]; j < offsets[i + 1]; j++) {
          const a = nodeOffsets[j], weight = weights[j];
          x += positions[a] * weight; y += positions[a + 1] * weight; z += positions[a + 2] * weight;
        }
        const a = i * 3;
        target[a] = center[0] + (x - center[0]) * scale;
        target[a + 1] = center[1] + (y - center[1]) * scale;
        target[a + 2] = center[2] + (z - center[2]) * scale;
      }
    },
  };
}
