import { Box3, Frustum, Matrix4, Vector3 } from 'three';

export const DESERT_RETURN_DELAY = 1.25;
export const DESERT_RETURN_SPEED = .06;

export function createDesertReturn(camera) {
  const frustum = new Frustum(), matrix = new Matrix4(), bounds = new Box3(), point = new Vector3();
  let quietTime = 0, inView = true, count = 0;
  function intersectsView(positions) {
    camera.updateMatrixWorld(true);
    frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    bounds.makeEmpty();
    for (let i = 0; i < positions.length; i += 3) bounds.expandByPoint(point.fromArray(positions, i));
    // Include the skin's hover expansion and a small edge margin: a visible
    // corner must never disappear because its centre crossed the viewport.
    return frustum.intersectsBox(bounds.expandByScalar(.06));
  }
  return {
    get pending() { return quietTime > 0; },
    get inView() { return inView; },
    get count() { return count; },
    update(delta, body, { paused = false, interacting = false } = {}) {
      inView = body.phase !== 'released' || intersectsView(body.positions);
      if (inView || paused || interacting || body.contacts === 0 || body.speed > DESERT_RETURN_SPEED) {
        quietTime = 0; return false;
      }
      // Count rendered simulation time, never hidden-tab or paused wall time.
      quietTime += Math.max(0, Math.min(delta, .05));
      if (quietTime + 1e-9 < DESERT_RETURN_DELAY) return false;
      quietTime = 0;
      if (!body.dropFromAbove(camera.position.y + 4)) return false;
      count++; inView = intersectsView(body.positions);
      return true;
    },
    reset() { quietTime = count = 0; inView = true; },
  };
}
