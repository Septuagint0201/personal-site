import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import { createDesertReturn, DESERT_RETURN_DELAY, DESERT_RETURN_SPEED } from '../src/desert-return.js';

function setup(width = 1280, height = 720) {
  const camera = new PerspectiveCamera(width < 760 ? 61 : 43, width / height, .1, 190);
  camera.position.set(4.4, .95 + Math.hypot(4.4, 6.92) * Math.tan(Math.PI / 6), 6.92);
  camera.lookAt(0, .95, 0);
  camera.setViewOffset(width, height, width < 760 ? 0 : -width * .105, 0, width, height);
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  const body = { phase: 'released', speed: 0, contacts: 4, positions: new Float64Array(24),
    move(center) {
      for (let i = 0; i < 8; i++) for (let axis = 0; axis < 3; axis++)
        this.positions[i * 3 + axis] = center[axis] + ((i >> axis) & 1 ? .4 : -.4);
    },
    dropFromAbove(y) { this.move([0, y, 0]); this.contacts = 0; return true; },
  };
  const gate = createDesertReturn(camera); body.move([-7, .6, 7]);
  return { body, camera, gate, run(seconds, options, dt = 1 / 60) {
    for (let i = 0; i < Math.round(seconds / dt); i++) gate.update(dt, body, options);
  } };
}

test('an offscreen settled gel returns above the frame once, at desktop and mobile framing', () => {
  for (const size of [[1280, 720], [390, 844]]) {
    const t = setup(...size);
    t.run(1); assert.equal(t.gate.inView, false); assert.equal(t.gate.count, 0); assert.equal(t.gate.pending, true);
    t.run(.3); assert.equal(t.gate.count, 1); assert.equal(t.gate.pending, false);
    assert.equal(t.body.phase, 'released');
    for (let i = 0; i < t.body.positions.length; i += 3) {
      const projected = new Vector3().fromArray(t.body.positions, i).project(t.camera);
      assert.ok(projected.y > 1.05, 'the entire return must begin beyond the top edge');
    }
    t.run(3); assert.equal(t.gate.count, 1, 'a falling gel is not settled');
  }
});

test('visible edges, renewed movement, held input and pause cancel the quiet countdown', () => {
  const t = setup();
  for (const condition of ['visible', 'moving', 'airborne', 'held', 'paused', 'suspended']) {
    t.body.move([-7, .6, 7]); t.body.speed = 0; t.body.contacts = 4; t.body.phase = 'released';
    t.run(.8); assert.equal(t.gate.pending, true);
    const options = {};
    if (condition === 'visible') {
      const ray = new Raycaster(); ray.setFromCamera(new Vector2(1.02, 0), t.camera);
      t.body.move(ray.ray.at(8, new Vector3()).toArray());
    }
    if (condition === 'moving') t.body.speed = DESERT_RETURN_SPEED + .01;
    if (condition === 'airborne') t.body.contacts = 0;
    if (condition === 'held') options.interacting = true;
    if (condition === 'paused') options.paused = true;
    if (condition === 'suspended') t.body.phase = 'suspended';
    t.run(2, options);
    assert.equal(t.gate.count, 0, condition); assert.equal(t.gate.pending, false, condition);
    if (condition === 'visible') assert.equal(t.gate.inView, true, 'the edge is still visible although its centre is outside');
  }
});

test('quiet timing follows active frames and reset removes pending returns', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const t = setup();
    t.run(DESERT_RETURN_DELAY - .1, {}, dt); assert.equal(t.gate.count, 0);
    t.run(.15, {}, dt); assert.equal(t.gate.count, 1);
    t.gate.reset(); assert.equal(t.gate.count, 0); assert.equal(t.gate.pending, false);
  }
  const t = setup();
  t.gate.update(60, t.body); assert.equal(t.gate.count, 0, 'a background wall-clock gap is not quiet simulation time');
  t.gate.reset(); t.run(1); assert.equal(t.gate.count, 0);
});
