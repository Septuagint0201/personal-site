import * as THREE from 'three';

/** Bake the static wind field and mineral grain normals once. A shared normal
 * map replaces per-fragment trigonometry and three bump-height lookups. */
export function createSandTextures(anisotropy = 8, size = 1024) {
  const height = new Float32Array(size * size), albedo = new Uint8Array(size * size * 4), normals = new Uint8Array(albedo.length);
  const patchSize = 8, tau = Math.PI * 2;
  const angle = new Float64Array(size), sin = new Float64Array(size), cos = new Float64Array(size);
  const sin2 = new Float64Array(size), cos2 = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    angle[i] = i / size * tau; sin[i] = Math.sin(angle[i]); cos[i] = Math.cos(angle[i]);
    sin2[i] = Math.sin(angle[i] * 2); cos2[i] = Math.cos(angle[i] * 2);
  }
  let seed = 51;
  for (let y = 0; y < size; y++) {
    const shiftSin = Math.sin(sin[y] * 1.2), shiftCos = Math.cos(sin[y] * 1.2);
    for (let x = 0; x < size; x++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const mineral = seed / 4294967296;
      const drift = (sin2[x] * cos[y] + cos2[x] * sin[y]) * 2.8 + (sin[x] * cos2[y] - cos[x] * sin2[y]) * .85;
      const patch = .5 + .5 * (sin[x] * shiftCos + cos[x] * shiftSin);
      const phase = angle[x] * 24 + angle[y] * 8 + drift;
      const primary = Math.sin(phase) + Math.sin(phase * 2 + .7) * .26;
      const crossing = Math.sin(angle[x] * 25 + angle[y] * 7 + drift * .8 + 2);
      const ripple = primary * (.48 + patch * .42) + crossing * patch * .34;
      const grain = (mineral - .5) * .0018 + (mineral > .94 ? .0007 : mineral < .055 ? -.0006 : 0);
      const i = y * size + x, a = i * 4;
      height[i] = ripple * .0095 + grain;
      const tone = mineral < .028 ? .66 : mineral > .985 ? 1 : .85 + mineral * .115;
      const shade = tone * (.985 + patch * .022 + ripple * .018);
      albedo[a] = Math.min(255, 255 * shade);
      albedo[a + 1] = Math.min(255, (mineral < .12 ? 239 : 248) * shade);
      albedo[a + 2] = Math.min(255, (mineral < .12 ? 212 : 230) * shade);
      albedo[a + 3] = 255;
    }
  }
  const spacing = patchSize / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const left = y * size + (x + size - 1) % size, right = y * size + (x + 1) % size;
    const down = ((y + size - 1) % size) * size + x, up = ((y + 1) % size) * size + x;
    const nx = -(height[right] - height[left]) / (2 * spacing), ny = -(height[up] - height[down]) / (2 * spacing);
    const inverse = 1 / Math.hypot(nx, ny, 1), a = (y * size + x) * 4;
    normals[a] = Math.round((nx * inverse * .5 + .5) * 255);
    normals[a + 1] = Math.round((ny * inverse * .5 + .5) * 255);
    normals[a + 2] = Math.round((inverse * .5 + .5) * 255); normals[a + 3] = 255;
  }
  function texture(pixels) {
    const map = new THREE.DataTexture(pixels, size, size);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.anisotropy = anisotropy; map.needsUpdate = true;
    return map;
  }
  const color = texture(albedo), normal = texture(normals);
  return { color, normal, uvScale: 1 / patchSize,
    restore() { color.needsUpdate = normal.needsUpdate = true; },
    dispose() { color.dispose(); normal.dispose(); },
  };
}
