import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlassCamera, glassCameraFraming, glassClickDirection, glassDragAngles } from '../src/glass-camera.js';
import { createRingNavigator } from '../src/ring-navigation.js';

const close = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const distance = (a, b) => Math.hypot(...a.map((value, axis) => value - b[axis]));
function settle(camera, focus = [0, 0, 0]) {
  for (let frame = 0; frame < 120; frame++) camera.update(1 / 60, focus);
  return camera.pose;
}
function assertFocus(pose, focus) {
  const forward = [Math.sin(pose.yaw) * Math.cos(pose.pitch), Math.sin(pose.pitch), -Math.cos(pose.yaw) * Math.cos(pose.pitch)];
  const length = distance(focus, pose.position);
  focus.forEach((value, axis) => close(forward[axis], (value - pose.position[axis]) / length));
}

test('wider framing moves the camera toward the arch while retaining sculpture scale', () => {
  for (const portrait of [false, true]) {
    const framing = glassCameraFraming(portrait);
    const oldDistance = portrait ? 10.5 : 8.4, oldFov = portrait ? 45 : 39;
    const oldHeight = 2 * oldDistance * Math.tan(oldFov * Math.PI / 360);
    const height = 2 * framing.position[2] * Math.tan(framing.fov * Math.PI / 360);
    assert.ok(Math.abs(height / oldHeight - 1) < 0.015);
    assert.ok((12 - framing.position[2]) / 12 > 0.53);
    assert.ok(framing.fov > oldFov);
    assert.ok(Math.hypot(...framing.position) < 5.7);
  }
});

test('drag sensitivity tracks visible FOV across viewport sizes instead of fixed pixels', () => {
  for (const [width, height, fov] of [[1280, 720, 57], [2560, 1440, 57], [390, 844, 76]]) {
    const [horizontal, vertical] = glassDragAngles(width / 3, height / 3, width, height, fov);
    const expectedHorizontal = 2 * Math.atan(Math.tan(fov * Math.PI / 360) * width / height) / 3;
    close(horizontal, expectedHorizontal);
    close(vertical, fov * Math.PI / 540);
    assert.ok(horizontal < Math.PI / 3, 'one-third of the viewport cannot turn the view 180 degrees');
  }
  assert.deepEqual(glassDragAngles(1280 / 3, 240, 1280, 720, 57), glassDragAngles(2560 / 3, 480, 2560, 1440, 57));
});

test('left orbit moves the eye on a complete circle and always aims at the current focus', () => {
  const camera = createGlassCamera();
  const start = camera.pose.position;
  const focus = [0, 0, 0];
  const radius = distance(start, focus);
  for (let index = 0; index < 72; index++) {
    camera.orbit(Math.PI / 36, 0, focus);
    const pose = camera.update(1 / 60, focus, true);
    close(distance(pose.position, focus), radius);
    assertFocus(pose, focus);
    assert.ok(pose.position[2] > -5.7);
  }
  assert.ok(distance(camera.pose.position, start) < 1e-7);
});

test('orbit tracks a moving sculpture and limits pitch above the floor', () => {
  for (const vertical of [-100, 100]) {
    const camera = createGlassCamera();
    camera.orbit(0.7, vertical, [0, 0, 0]);
    const focus = [0.25, 0.085, 0.05];
    const pose = settle(camera, focus);
    assertFocus(pose, focus);
    assert.ok(pose.position[1] > -1.45);
    assert.ok(Math.abs(pose.pitch) <= 0.72 + 1e-7);
  }
});

test('right free look freezes camera position, including interrupted orbit easing', () => {
  const camera = createGlassCamera();
  camera.orbit(0.8, 0.3, [0, 0, 0]);
  camera.update(1 / 60, [0, 0, 0]);
  const start = camera.pose;
  camera.look(0.5, -0.2);
  const pose = settle(camera, [3, 0.1, 6]);
  assert.deepEqual(pose.position, start.position);
  close(pose.yaw, start.yaw - 0.5);
  close(pose.pitch, start.pitch - 0.2);
  assert.equal(camera.mode, 'look');
});

test('left drag after free look reacquires the selected sculpture without moving its geometry', () => {
  const camera = createGlassCamera();
  const focus = [0, 0.03, 0];
  const original = [...focus];
  camera.look(2.4, 0.4);
  settle(camera, focus);
  camera.orbit(0.3, -0.1, focus);
  assertFocus(settle(camera, focus), focus);
  assert.deepEqual(focus, original);
});

test('selection or reset returns an orbited camera to the arch home pose', () => {
  const camera = createGlassCamera();
  camera.orbit(2.8, 0.4, [0, 0, 0]);
  settle(camera);
  camera.look(-6.5, 0.2);
  settle(camera);
  camera.home();
  const pose = settle(camera, [7, 0, 10]);
  glassCameraFraming().position.forEach((value, axis) => close(pose.position[axis], value));
  close(Math.sin(pose.yaw), 0);
  close(Math.cos(pose.yaw), 1);
  close(pose.pitch, -Math.atan2(0.65, 5.5));
});

test('camera easing stays active until its target settles when ambient motion is paused', () => {
  const camera = createGlassCamera();
  camera.look(2.4, 0.5);
  assert.equal(camera.moving, true);
  let frames = 0;
  while (camera.moving && frames < 180) { camera.update(1 / 60, [0, 0, 0]); frames++; }
  assert.ok(frames > 1 && frames < 180);
  close(camera.pose.yaw, -2.4, 0.0001);
  camera.home();
  assert.equal(camera.moving, true);
  settle(camera);
  assert.equal(camera.moving, false);
});

test('an orbit started during a collection transition stays inside the front wall and floor', () => {
  const camera = createGlassCamera();
  camera.orbit(Math.PI, -0.8, [10, 0, 18]);
  const pose = camera.update(1, [0, 0, 0], true);
  assert.ok(pose.position[2] >= -5.7);
  assert.ok(pose.position[1] >= -1.45);
  assertFocus(pose, [0, 0, 0]);
});

test('paused reduced-motion interaction snaps the camera while retaining orbit and free-look semantics', () => {
  const camera = createGlassCamera({ portrait: true });
  camera.orbit(0.5, 0.2, [0, 0, 0]);
  const orbit = camera.update(0, [0, 0, 0], true);
  assertFocus(orbit, [0, 0, 0]);
  camera.look(0.3, 0);
  const look = camera.update(0, [0, 0, 0], true);
  assert.deepEqual(look.position, orbit.position);
  close(look.yaw, orbit.yaw - 0.3);
  camera.home();
  assert.deepEqual(camera.update(0, [0, 0, 0], true).position, glassCameraFraming(true).position);
});

test('click direction is stable across circular wrap and always advances only one adjacent study', () => {
  for (const count of [3, 5, 6, 9]) {
    for (let selected = 0; selected < count; selected++) {
      for (let clicked = 0; clicked < count; clicked++) {
        const ring = createRingNavigator({ count, initial: selected, reducedMotion: true });
        const direction = glassClickDirection(selected, clicked, count);
        ring.step(direction);
        const forward = (clicked - selected + count) % count;
        const expected = !forward ? 0 : forward <= count / 2 ? 1 : -1;
        assert.equal(direction, expected);
        assert.equal(ring.index, (selected + direction + count) % count);
      }
    }
  }
  assert.equal(glassClickDirection(2, 0, 3), 1);
  assert.equal(glassClickDirection(0, 2, 3), -1);
  assert.equal(glassClickDirection(5, 0, 6), 1);
  assert.equal(glassClickDirection(0, 3, 6), 1);
});
