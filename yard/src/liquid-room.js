/** Shared world geometry for the renderer, fluid simulation and walking camera. */
export const ROOM_BOUNDS = Object.freeze({
  min: Object.freeze([-5, 0, -6]),
  max: Object.freeze([5, 5, 6]),
});

// Each continuous line has genuine shared bends rather than a set of floating bars.
// The centre aisle is open; the higher crossing runs can be walked underneath.
const RUNS = [
  [
    [-3.7, 0.45, -3.7],
    [-3.7, 2.75, -3.7],
    [-1.65, 2.75, -3.7],
    [-1.65, 3.7, -1.25],
    [1.1, 3.7, -1.25],
  ],
  [
    [3.6, 0.5, -4.7],
    [3.6, 2.3, -4.7],
    [1.65, 2.3, -3.3],
    [1.65, 3.45, -0.5],
    [-1.4, 3.45, 1.25],
  ],
  [
    [-4.0, 1.25, 1.8],
    [-2.65, 1.25, 1.8],
    [-2.65, 2.2, -0.9],
    [-3.8, 2.2, -2.1],
    [-3.8, 4.1, -2.1],
  ],
  [
    [4.0, 1.05, 2.5],
    [2.45, 1.05, 2.5],
    [2.45, 2.75, 0.5],
    [3.85, 2.75, -1.2],
    [3.85, 4.25, -1.2],
  ],
  [
    [-3.65, 3.95, 3.6],
    [-1.25, 3.95, 3.6],
    [-1.25, 4.2, 0.4],
    [2.9, 4.2, -2.9],
    [2.9, 3.55, -4.8],
  ],
  [
    [-4.2, 0.75, -5.15],
    [-1.5, 0.75, -5.15],
    [-1.5, 1.6, -4.65],
    [1.15, 1.6, -4.65],
    [1.15, 0.4, -5.3],
  ],
];

const normalise = (v) => {
  const length = Math.hypot(...v) || 1;
  return v.map((value) => value / length);
};

export const METAL_SEGMENTS = Object.freeze(
  RUNS.flatMap((run, runIndex) =>
    run.slice(1).map((b, index) =>
      Object.freeze({
        id: `frame-${runIndex}-${index}`,
        a: Object.freeze(run[index]),
        b: Object.freeze(b),
        radius: [0.076, 0.066, 0.085, 0.072, 0.061, 0.069][runIndex],
      }),
    ),
  ),
);

export const EMITTERS = Object.freeze(
  RUNS.flatMap((run, runIndex) =>
    run.slice(1, -1).map((position, index) => {
      // The free-facing angle bisector points away from both adjoining rods.
      const previous = normalise(
        run[index].map((v, axis) => v - position[axis]),
      );
      const next = normalise(
        run[index + 2].map((v, axis) => v - position[axis]),
      );
      let direction = normalise(previous.map((v, axis) => -(v + next[axis])));
      // Keep the nucleation volume away from the ceiling and outside wall.
      if (position[1] > 3.5 && direction[1] > 0) direction[1] *= -1;
      direction = normalise(direction);
      return Object.freeze({
        id: `bend-${runIndex}-${index}`,
        position: Object.freeze(position),
        direction: Object.freeze(direction),
        segmentIndex: runIndex * 4 + index,
        segmentIndices: Object.freeze([
          runIndex * 4 + index,
          runIndex * 4 + index + 1,
        ]),
      });
    }),
  ),
);

/** size is full width/height; tangent and bitangent span the emitting rectangle. */
export const AREA_LIGHTS = Object.freeze(
  [
    {
      id: "west-low",
      center: [-4.975, 1.55, -1.4],
      normal: [1, 0, 0],
      tangent: [0, 0, 1],
      bitangent: [0, 1, 0],
      size: [7.3, 0.105],
      color: [0.71, 0.86, 1],
      intensity: 7.8,
    },
    {
      id: "west-high",
      center: [-4.975, 3.7, 0.1],
      normal: [1, 0, 0],
      tangent: [0, 0, 1],
      bitangent: [0, 1, 0],
      size: [8.8, 0.085],
      color: [0.94, 0.96, 1],
      intensity: 6.2,
    },
    {
      id: "east-low",
      center: [4.975, 1.1, 0.6],
      normal: [-1, 0, 0],
      tangent: [0, 0, 1],
      bitangent: [0, 1, 0],
      size: [8.4, 0.12],
      color: [1, 0.86, 0.68],
      intensity: 7.2,
    },
    {
      id: "east-high",
      center: [4.975, 3.25, -1.1],
      normal: [-1, 0, 0],
      tangent: [0, 0, 1],
      bitangent: [0, 1, 0],
      size: [7.8, 0.085],
      color: [0.83, 0.91, 1],
      intensity: 7.5,
    },
    {
      id: "north-low",
      center: [-0.7, 1.95, -5.975],
      normal: [0, 0, 1],
      tangent: [1, 0, 0],
      bitangent: [0, 1, 0],
      size: [7.0, 0.1],
      color: [0.79, 0.91, 1],
      intensity: 8.6,
    },
    {
      id: "north-high",
      center: [0.6, 4.15, -5.975],
      normal: [0, 0, 1],
      tangent: [1, 0, 0],
      bitangent: [0, 1, 0],
      size: [7.6, 0.085],
      color: [1, 0.92, 0.8],
      intensity: 7.0,
    },
    {
      id: "south-low",
      center: [0.2, 1.0, 5.975],
      normal: [0, 0, -1],
      tangent: [1, 0, 0],
      bitangent: [0, 1, 0],
      size: [7.5, 0.1],
      color: [0.88, 0.91, 1],
      intensity: 6.6,
    },
    {
      id: "south-high",
      center: [-0.4, 3.6, 5.975],
      normal: [0, 0, -1],
      tangent: [1, 0, 0],
      bitangent: [0, 1, 0],
      size: [8.0, 0.095],
      color: [1, 0.89, 0.78],
      intensity: 6.7,
    },
  ].map((light) => Object.freeze(light)),
);

export function closestPointOnSegment(position, a, b) {
  const delta = b.map((value, axis) => value - a[axis]);
  const lengthSquared = delta.reduce((sum, value) => sum + value * value, 0);
  const t = Math.max(
    0,
    Math.min(
      1,
      position.reduce(
        (sum, value, axis) => sum + (value - a[axis]) * delta[axis],
        0,
      ) / (lengthSquared || 1),
    ),
  );
  const point = a.map((value, axis) => value + delta[axis] * t);
  return {
    point,
    t,
    distance: Math.hypot(...position.map((value, axis) => value - point[axis])),
  };
}

export function distanceToMetal(position) {
  let closest = {
    distance: Infinity,
    segmentIndex: -1,
    point: [0, 0, 0],
    t: 0,
  };
  METAL_SEGMENTS.forEach((segment, segmentIndex) => {
    const candidate = closestPointOnSegment(position, segment.a, segment.b);
    const distance = candidate.distance - segment.radius;
    if (distance < closest.distance)
      closest = { ...candidate, distance, segmentIndex };
  });
  return closest;
}
