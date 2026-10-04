const TAU = Math.PI * 2;

/**
 * A vertical Y/Z ring viewed from the viewport centre. Exposure is the fraction
 * of a neighbour inside the viewport, independent of the selected card.
 */
export function createViewportRingGeometry({
  viewportHeight,
  cardHeight,
  count,
}) {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0)
    throw new RangeError("The viewport height must be positive.");
  if (
    !Number.isFinite(cardHeight) ||
    cardHeight <= 0 ||
    cardHeight >= viewportHeight
  )
    throw new RangeError("The card height must fit inside the viewport.");
  if (!Number.isInteger(count) || count < 3)
    throw new RangeError("A viewport ring needs at least three cards.");

  const radius = Math.max(viewportHeight * 0.82, cardHeight * 1.6);
  const perspective = radius * 4;
  const step = TAU / count;

  // Coordinates are relative to the viewport centre. This matches CSS
  // translate3d(0, R sin θ, R(1 − cos θ)) rotateX(−θ) with central perspective.
  function projectEdges(theta) {
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    return [-cardHeight / 2, cardHeight / 2].map(
      (edge) =>
        (perspective * (radius * sin + edge * cos)) /
        (perspective - radius * (1 - cos) + edge * sin),
    );
  }

  function visibleFraction(theta) {
    const [top, bottom] = projectEdges(theta);
    const visible = Math.max(
      0,
      Math.min(bottom, viewportHeight / 2) - Math.max(top, -viewportHeight / 2),
    );
    return visible / (bottom - top);
  }

  // In the front quadrant, increasing the angle moves the card out of view.
  let low = 0;
  let high = Math.PI / 2;
  for (let iteration = 0; iteration < 48; iteration++) {
    const middle = (low + high) / 2;
    if (visibleFraction(middle) > 0.66) low = middle;
    else high = middle;
  }
  const neutralAngle = (low + high) / 2;
  const compression = Math.tan(neutralAngle / 2) / Math.tan(step / 2);

  function angle(logical) {
    return 2 * Math.atan(compression * Math.tan(logical / 2));
  }

  // Positive logical preview brings the upper neighbour toward the centre.
  // The shared navigator subtracts its rotation, so callers invert this sign
  // when setting navigator preview. The lower preview is its mirror image.
  low = 0;
  high = step;
  for (let iteration = 0; iteration < 48; iteration++) {
    const middle = (low + high) / 2;
    if (visibleFraction(angle(-step + middle)) < 0.9) low = middle;
    else high = middle;
  }

  return {
    height: cardHeight,
    radius,
    perspective,
    compression,
    preview: (low + high) / 2,
    angle,
    projectEdges,
  };
}
