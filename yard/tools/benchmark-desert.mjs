import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { createDesertSkin } from '../src/desert-skin.js';
import { createTetrahedralLattice, bodyVolume } from '../src/desert-physics.js';
import { createSandField } from '../src/sand-field.js';
import { createSandTextures } from '../src/sand-surface.js';

// CPU kernels only: this does not measure GPU time or promise an FPS gain.
const baselineArg = process.argv.find(arg => arg.startsWith('--baseline='))?.slice(11);
const reference = baselineArg ? await import(pathToFileURL(resolve(baselineArg, 'desert-skin.js')).href) : null;
const referenceSand = baselineArg ? await import(pathToFileURL(resolve(baselineArg, 'sand-field.js')).href) : null;
const referencePhysics = baselineArg ? await import(pathToFileURL(resolve(baselineArg, 'desert-physics.js')).href) : null;
function measure(run, count) {
  for (let i = 0; i < 64; i++) run(i);
  const batches = [];
  for (let batch = 0; batch < 7; batch++) {
    const start = performance.now();
    for (let i = 0; i < count; i++) run(i);
    batches.push((performance.now() - start) / count);
  }
  batches.sort((a, b) => a - b);
  return { medianMs: batches[3], slowestBatchMs: batches[6] };
}
const model = createTetrahedralLattice();
const poses = Array.from({ length: 16 }, (_, frame) => model.rest.map((value, i) =>
  value + Math.sin(i * .73 + frame * .13) * .08 + [2, .8, -1][i % 3]));
const report = { note: 'CPU kernel time per call; geometry density and input poses are identical.', skins: [] };
for (const level of [2, 3]) {
  const skin = createDesertSkin(model, level), output = new Float32Array(skin.count * 3);
  const softness = level === 3 ? .5 : 0;
  const row = { triangles: skin.faces.length / 3,
    current: measure(i => skin.write(output, poses[i % poses.length], softness, [2, .8, -1]), 256) };
  if (reference) {
    const old = reference.createDesertSkin(model, level), before = new Float32Array(output.length);
    let maxDifference = 0;
    for (const pose of poses) for (const blend of [0, .17, .5, .91, 1]) {
      old.write(before, pose, blend, [2, .8, -1], 1.017);
      skin.write(output, pose, blend, [2, .8, -1], 1.017);
      for (let i = 0; i < output.length; i++) maxDifference = Math.max(maxDifference, Math.abs(before[i] - output[i]));
    }
    row.reference = measure(i => old.write(before, poses[i % poses.length], softness, [2, .8, -1]), 256);
    row.maxPositionDifference = maxDifference;
    row.reductionPercent = 100 * (1 - row.current.medianMs / row.reference.medianMs);
    if (maxDifference > 1e-6) throw new Error(`Skin equivalence failed: ${maxDifference}`);
  }
  report.skins.push(row);
}
const sand = createSandField(), coordinates = new Float64Array(2048);
for (let i = 0; i < coordinates.length; i++) coordinates[i] = Math.sin(i * 7.13) * 10.1;
let checksum = 0;
const sampling = field => () => { for (let i = 0; i < coordinates.length; i += 2) checksum += field.sample(coordinates[i], coordinates[i + 1]); };
report.sampling = { samplesPerCall: coordinates.length / 2, current: measure(sampling(sand), 256) };
if (referenceSand) {
  const old = referenceSand.createSandField();
  report.sampling.reference = measure(sampling(old), 256);
  report.sampling.maxHeightDifference = 0;
  for (let i = 0; i < coordinates.length; i += 2) report.sampling.maxHeightDifference = Math.max(report.sampling.maxHeightDifference,
    Math.abs(old.sample(coordinates[i], coordinates[i + 1]) - sand.sample(coordinates[i], coordinates[i + 1])));
}
if (!Number.isFinite(checksum)) throw new Error('Invalid sample output');
const gradients = new Float64Array(model.rest.length);
report.volume = { current: measure(i => bodyVolume(poses[i % poses.length], model.faces, gradients), 2048) };
if (referencePhysics) {
  const oldGradients = new Float64Array(gradients.length);
  let difference = 0;
  for (const pose of poses) {
    difference = Math.max(difference, Math.abs(bodyVolume(pose, model.faces, gradients) - referencePhysics.bodyVolume(pose, model.faces, oldGradients)));
    for (let i = 0; i < gradients.length; i++) difference = Math.max(difference, Math.abs(gradients[i] - oldGradients[i]));
  }
  report.volume.reference = measure(i => referencePhysics.bodyVolume(poses[i % poses.length], model.faces, oldGradients), 2048);
  report.volume.maxValueOrGradientDifference = difference;
}
if (process.argv.includes('--surface')) {
  const referencePath = baselineArg && resolve(baselineArg, 'sand-surface.js');
  const oldSurface = referencePath && existsSync(referencePath) ? await import(pathToFileURL(referencePath).href) : null;
  const currentTimes = [], beforeTimes = [];
  let maxByteDifference = 0;
  for (let i = 0; i < 6; i++) {
    let start = performance.now(); const current = createSandTextures();
    if (i) currentTimes.push(performance.now() - start);
    if (oldSurface) {
      start = performance.now(); const before = oldSurface.createSandTextures();
      if (i) beforeTimes.push(performance.now() - start);
      if (!i) for (const map of ['color', 'normal']) {
        const a = current[map].image.data, b = before[map].image.data;
        for (let p = 0; p < a.length; p++) maxByteDifference = Math.max(maxByteDifference, Math.abs(a[p] - b[p]));
      }
      before.dispose();
    }
    current.dispose();
  }
  currentTimes.sort((a, b) => a - b); beforeTimes.sort((a, b) => a - b);
  report.textureBake = { size: 1024, currentMs: currentTimes[2], referenceMs: beforeTimes[2] ?? null, maxByteDifference };
}
console.log(JSON.stringify(report, null, 2));
