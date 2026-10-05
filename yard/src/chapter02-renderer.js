import {
  vertexSource,
  traceSource,
  roomSource,
  temporalSource,
  bloomSource,
  resolveSource,
} from "./chapter02-shaders.js";
import { createLiquidSimulation, MAX_DROPS } from "./liquid-simulation.js";
import { AREA_LIGHTS, METAL_SEGMENTS } from "./liquid-room.js";
import { moveWalkingCamera } from "./liquid-camera.js";
import { findLiquidTarget } from "./liquid-targeting.js";

const subtract = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const addScaled = (a, b, t) => a.map((x, i) => x + b[i] * t);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
// A centered 16-point Hammersley set covers the whole pixel without the visible
// four-phase grid. The permutation spreads adjacent frames across the footprint.
const SUBPIXEL_SAMPLES = Array.from({ length: 16 }, (_, frame) => {
  const n = (frame * 7) % 16;
  const reversed =
    ((n & 1) << 3) | ((n & 2) << 1) | ((n & 4) >> 1) | ((n & 8) >> 3);
  return [(n + 0.5) / 16 - 0.5, (reversed + 0.5) / 16 - 0.5];
});
function raySphere(origin, direction, center, radius) {
  const o = subtract(origin, center),
    b = dot(o, direction),
    c = dot(o, o) - radius * radius,
    h = b * b - c;
  if (h < 0) return Infinity;
  const t = -b - Math.sqrt(h);
  return t > 0.001 ? t : Infinity;
}
function rayRod(origin, direction, rod) {
  const ba = subtract(rod.b, rod.a),
    oa = subtract(origin, rod.a),
    baba = dot(ba, ba),
    bard = dot(ba, direction),
    baoa = dot(ba, oa),
    rdoa = dot(direction, oa);
  const a = baba - bard * bard,
    b = baba * rdoa - baoa * bard,
    c = baba * dot(oa, oa) - baoa * baoa - rod.radius * rod.radius * baba;
  let nearest = Math.min(
    raySphere(origin, direction, rod.a, rod.radius),
    raySphere(origin, direction, rod.b, rod.radius),
  );
  const h = b * b - a * c;
  if (h >= 0 && a > 1e-8) {
    const t = (-b - Math.sqrt(h)) / a,
      y = baoa + t * bard;
    if (t > 0.001 && y > 0 && y < baba) nearest = Math.min(nearest, t);
  }
  return nearest;
}

export function createLiquidRenderer(
  canvas,
  {
    onQuality,
    onError,
    onReady,
    onPreparing,
    onStatus,
    onEvent,
    onTarget,
  } = {},
) {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("WebGL 2 is unavailable.");
  const maximumTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  let parallel, floatTarget;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = matchMedia("(pointer: coarse)").matches || innerWidth <= 760;
  const state = {
    paused: motion.matches,
    quality: mobile ? "high" : "ultra",
    position: [0, 1.65, 4.5],
    yaw: 0,
    pitch: -0.045,
  };
  let frame = 0,
    previous = 0,
    destroyed = false,
    lost = false,
    failed = false,
    ready = false,
    compilationStarted = 0;
  let trace,
    room,
    temporal,
    bloom,
    resolve,
    buffer,
    texture,
    fbo,
    targetWidth = 0,
    targetHeight = 0;
  let historyTextures = [],
    historyFbos = [],
    historyIndex = 0,
    historyValid = false,
    convergence = 0,
    sampleIndex = 0;
  let bloomTargets = [];
  let roomTexture, roomFbo;
  let clock = 0,
    sceneClock = 0,
    statusClock = -1,
    frames = 0,
    sampleStarted = 0;
  let movement = [0, 0],
    gathering = false,
    target = null,
    effectId = null,
    effectUntil = 0,
    effectStarted = 0,
    heldSeconds = 0;
  let selectedId = null,
    pressedId = null,
    pressTime = -100,
    hoverValue = 0;
  let targetRay = [0, 0, -1], interactionPoint = [0, 0, 0], interactionTime = -100, interactionKind = 0;
  let gatherGlow = 0;
  const forward = [0, 0, -1],
    right = [1, 0, 0],
    up = [0, 1, 0];
  const positions = new Float32Array(MAX_DROPS * 4),
    shapes = new Float32Array(MAX_DROPS * 4),
    axes = new Float32Array(MAX_DROPS * 4),
    velocities = new Float32Array(MAX_DROPS * 4);
  const simulation = createLiquidSimulation({
    onEvent: (event) => {
      onEvent?.(event);
    },
  });
  let initialVolume = simulation.stats().initialVolume;
  const listeners = [];
  function listen(object, event, callback) {
    object.addEventListener(event, callback);
    listeners.push(() => object.removeEventListener(event, callback));
  }
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }
  function makeProgram(fragment) {
    const shaders = [
      compile(gl.VERTEX_SHADER, vertexSource),
      compile(gl.FRAGMENT_SHADER, fragment),
    ];
    const program = gl.createProgram();
    shaders.forEach((s) => gl.attachShader(program, s));
    gl.linkProgram(program);
    return { program, shaders, ready: false, uniforms: null, position: 0 };
  }
  function configure(entry, names) {
    if (entry.ready) return true;
    if (
      parallel &&
      !gl.getProgramParameter(entry.program, parallel.COMPLETION_STATUS_KHR)
    )
      return false;
    if (!gl.getProgramParameter(entry.program, gl.LINK_STATUS))
      throw new Error(
        [
          gl.getProgramInfoLog(entry.program),
          ...entry.shaders.map((s) => gl.getShaderInfoLog(s)),
        ]
          .filter(Boolean)
          .join("\n"),
      );
    entry.shaders.forEach((s) => gl.deleteShader(s));
    entry.shaders = [];
    entry.uniforms = Object.fromEntries(
      names.map((n) => [n, gl.getUniformLocation(entry.program, n)]),
    );
    entry.position = gl.getAttribLocation(entry.program, "position");
    entry.ready = true;
    return true;
  }
  function initialize() {
    // Context restoration disables extensions too. Re-enable them before
    // polling shader completion or allocating floating-point framebuffer targets.
    parallel = gl.getExtension("KHR_parallel_shader_compile");
    floatTarget = !!gl.getExtension("EXT_color_buffer_float");
    ready = false;
    failed = false;
    compilationStarted = performance.now();
    onPreparing?.();
    trace = makeProgram(traceSource);
    room = makeProgram(roomSource);
    temporal = makeProgram(temporalSource);
    bloom = makeProgram(bloomSource);
    resolve = makeProgram(resolveSource);
    gl.flush();
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    historyTextures = [];
    historyFbos = [];
    for (let i = 0; i < 3; i++) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        t,
        0,
      );
      if (i === 2) { roomTexture = t; roomFbo = f; }
      else { historyTextures.push(t); historyFbos.push(f); }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    historyValid = false;
    bloomTargets = Array.from({ length: 4 }, () => {
      const texture = gl.createTexture(), framebuffer = gl.createFramebuffer();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      return { texture, framebuffer, width: 0, height: 0 };
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    convergence = 0;
    targetWidth = targetHeight = 0;
    resize();
  }
  function prepare() {
    if (
      performance.now() - compilationStarted > 90000 &&
      (!trace.ready || !room.ready || !temporal.ready || !bloom.ready || !resolve.ready)
    )
      throw new Error(
        "The graphics driver could not finish preparing this room.",
      );
    const sceneUniforms = [
        "resolution",
        "jitter",
        "cameraPosition",
        "cameraForward",
        "cameraRight",
        "cameraUp",
        "rodsA[0]",
        "rodsB[0]",
        "rodCount",
        "dropCount",
        "lightCount",
        "bounceLimit",
        "edgeSamples",
        "drops[0]",
        "shapes[0]",
        "axes[0]",
        "velocities[0]",
        "lightPositions[0]",
        "lightNormals[0]",
        "lightTangents[0]",
        "lightColors[0]",
        "clock",
        "effect",
        "effectAge",
        "interactionPoint", "interactionAge", "interactionKind", "gatherField",
        "selectedDrop",
        "hdr",
      ];
    if (!configure(trace, sceneUniforms) || !configure(room, [...sceneUniforms, "sceneImage"])) return false;
    if (
      !configure(temporal, [
        "image",
        "previousImage",
        "resolution",
        "historyWeight",
        "sceneMotion",
      ])
    )
      return false;
    if (!configure(bloom, ["image", "resolution", "sourceResolution", "prefilter"])) return false;
    if (!configure(resolve, ["image", "resolution", "hdr", "bloomNear", "bloomMid", "bloomWide"])) return false;
    if (!ready) {
      for (const entry of [trace, room]) {
        const u = entry.uniforms;
        gl.useProgram(entry.program);
        const rodA = new Float32Array(32 * 4),
          rodB = new Float32Array(32 * 4);
        METAL_SEGMENTS.forEach((s, i) => {
          rodA.set([...s.a, s.radius], i * 4);
          rodB.set([...s.b, 0], i * 4);
        });
        gl.uniform4fv(u["rodsA[0]"], rodA);
        gl.uniform4fv(u["rodsB[0]"], rodB);
        gl.uniform1i(u.rodCount, METAL_SEGMENTS.length);
        const lp = new Float32Array(32),
          ln = new Float32Array(32),
          lt = new Float32Array(32),
          lc = new Float32Array(32);
        AREA_LIGHTS.forEach((l, i) => {
          lp.set([...l.center, l.intensity], i * 4);
          ln.set([...l.normal, l.size[0]], i * 4);
          lt.set([...l.tangent, l.size[1]], i * 4);
          lc.set([...l.color, 0], i * 4);
        });
        gl.uniform4fv(u["lightPositions[0]"], lp);
        gl.uniform4fv(u["lightNormals[0]"], ln);
        gl.uniform4fv(u["lightTangents[0]"], lt);
        gl.uniform4fv(u["lightColors[0]"], lc);
        gl.uniform1i(u.lightCount, AREA_LIGHTS.length);
        gl.uniform1i(u.hdr, floatTarget ? 1 : 0);
      }
      ready = true;
      previous = 0;
      sampleStarted = 0;
      frames = 0;
      onReady?.();
    }
    return true;
  }
  function resize() {
    if (destroyed || lost) return;
    const rect = canvas.getBoundingClientRect();
    const ultra = state.quality === "ultra";
    const dpr =
      Math.min(devicePixelRatio || 1, ultra ? 2 : 1.5) * (ultra ? 1.3 : 1);
    const scale = Math.min(
      dpr,
      maximumTextureSize / Math.max(1, rect.width),
      maximumTextureSize / Math.max(1, rect.height),
      Math.sqrt(
        (ultra ? 5800000 : 2400000) / Math.max(1, rect.width * rect.height),
      ),
    );
    const w = Math.max(1, Math.round(rect.width * scale)),
      h = Math.max(1, Math.round(rect.height * scale));
    if (w !== targetWidth || h !== targetHeight) {
      targetWidth = w;
      targetHeight = h;
      canvas.width = w;
      canvas.height = h;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      for (const image of [texture, roomTexture, ...historyTextures]) {
        gl.bindTexture(gl.TEXTURE_2D, image);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          floatTarget ? gl.RGBA16F : gl.RGBA8,
          w,
          h,
          0,
          gl.RGBA,
          floatTarget ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
          null,
        );
      }
      historyValid = false;
      convergence = 0;
      bloomTargets.forEach((target, i) => {
        target.width = Math.max(1, Math.ceil(w / 2 ** (i + 1)));
        target.height = Math.max(1, Math.ceil(h / 2 ** (i + 1)));
        gl.bindTexture(gl.TEXTURE_2D, target.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, floatTarget ? gl.RGBA16F : gl.RGBA8,
          target.width, target.height, 0, gl.RGBA,
          floatTarget ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      });
    }
    invalidate();
  }
  function updateCamera(dt) {
    const cy = Math.cos(state.yaw),
      sy = Math.sin(state.yaw),
      cp = Math.cos(state.pitch),
      sp = Math.sin(state.pitch);
    forward[0] = sy * cp;
    forward[1] = -sp;
    forward[2] = -cy * cp;
    right[0] = cy;
    right[1] = 0;
    right[2] = sy;
    up[0] = sy * sp;
    up[1] = cp;
    up[2] = -cy * sp;
    if (!movement[0] && !movement[1]) return;
    const speed = 2.15 * dt;
    state.position = moveWalkingCamera(state.position, [
      (cy * movement[0] + sy * movement[1]) * speed,
      0,
      (sy * movement[0] - cy * movement[1]) * speed,
    ]);
  }
  function updateTarget() {
    const obstruct = ray => Math.min(...METAL_SEGMENTS.map(s => rayRod(state.position, ray, s)));
    const hit = findLiquidTarget({ origin: state.position, forward,
      drops: simulation.getDrops(), pick: simulation.pick, obstruction: obstruct, previousId: selectedId });
    const glyph = [3.85, 1.28, -5.97],
      toGlyph = subtract(glyph, state.position),
      glyphDistance = Math.hypot(...toGlyph),
      alignment = dot(toGlyph, forward) / Math.max(0.001, glyphDistance);
    if (
      glyphDistance < 2.45 &&
      alignment > 0.982 &&
      obstruct(forward) > glyphDistance - 0.15 &&
      (!hit || hit.distance > glyphDistance)
    ) {
      target = {
        kind: "glyph",
        id: "far-wall",
        label: "An etched circle",
        distance: glyphDistance,
      };
      selectedId = null;
    } else if (hit) {
      target = {
        kind: "drop",
        id: hit.id,
        label:
          hit.drop.state === "forming"
            ? "Condensing glass"
            : hit.drop.state === "draining"
              ? "Glass returning to the frame"
              : "Liquid glass",
        distance: hit.distance,
        assisted: hit.assisted,
      };
      targetRay = hit.ray;
      selectedId = hit.id;
    } else {
      target = {
        kind: null,
        id: null,
        label: "Follow the light",
        distance: Infinity,
      };
      selectedId = null;
    }
    onTarget?.(target);
  }
  function uploadDrops(entry) {
    const list = simulation.getDrops();
    const ids = new Map(list.map((d, i) => [d.id, i]));
    let selected = -1;
    list.forEach((d, i) => {
      const hover = d.id === selectedId ? hoverValue : 0;
      const press =
        d.id === pressedId ? Math.exp(-(clock - pressTime) * 13) : 0;
      positions.set([...d.position, Math.max(0.001, d.radius)], i * 4);
      const partner = ids.get(d.bridgeTo);
      const paired = partner !== undefined && list[partner].bridgeTo === d.id;
      shapes.set(
        [
          d.deform[0],
          d.deform[2],
          hover + (d.highlight || 0) * 0.2 - press * 1.6,
          paired ? partner + 1 : 0,
        ],
        i * 4,
      );
      axes.set([...d.orientation, d.deform[1] / d.deform[0]], i * 4);
      velocities.set([...d.velocity, 0], i * 4);
      if (d.id === selectedId) selected = i;
    });
    const u = entry.uniforms;
    gl.uniform4fv(u["drops[0]"], positions);
    gl.uniform4fv(u["shapes[0]"], shapes);
    gl.uniform4fv(u["axes[0]"], axes);
    gl.uniform4fv(u["velocities[0]"], velocities);
    gl.uniform1i(u.dropCount, list.length);
    gl.uniform1i(u.selectedDrop, selected);
  }
  function uploadScene(entry, jitter) {
    const u = entry.uniforms;
    gl.uniform2f(u.resolution, targetWidth, targetHeight);
    gl.uniform3fv(u.cameraPosition, state.position);
    gl.uniform3fv(u.cameraForward, forward);
    gl.uniform3fv(u.cameraRight, right);
    gl.uniform3fv(u.cameraUp, up);
    gl.uniform2f(u.jitter, jitter[0], jitter[1]);
    gl.uniform1i(u.bounceLimit, state.quality === "ultra" ? 8 : 5);
    gl.uniform1i(u.edgeSamples, state.quality === "ultra" ? 4 : 2);
    gl.uniform1f(u.clock, sceneClock);
    gl.uniform1i(u.effect, { resonance: 1, constellation: 2, afterimage: 3 }[effectId] || 0);
    gl.uniform1f(u.effectAge, clock - effectStarted);
    gl.uniform3fv(u.interactionPoint, interactionPoint);
    gl.uniform1f(u.interactionAge, motion.matches ? 100 : clock - interactionTime);
    gl.uniform1i(u.interactionKind, interactionKind);
    gl.uniform4fv(u.gatherField, [...addScaled(state.position, forward, 1.8), gatherGlow]);
    uploadDrops(entry);
  }
  function pass(entry) {
    gl.useProgram(entry.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(entry.position);
    gl.vertexAttribPointer(entry.position, 2, gl.FLOAT, false, 0, 0);
  }
  function render(now) {
    frame = 0;
    if (destroyed || lost || failed || document.hidden) {
      previous = 0;
      return;
    }
    try {
      if (!prepare()) {
        invalidate();
        return;
      }
    } catch (error) {
      failed = true;
      onError?.(error, false);
      return;
    }
    if (previous && now - previous < 15.4) {
      invalidate();
      return;
    }
    const dt = previous ? Math.min((now - previous) / 1000, 0.065) : 0.016;
    previous = now;
    clock += dt;
    updateCamera(dt);
    if (movement[0] || movement[1]) {
      historyValid = false;
      convergence = 0;
    }
    if (gathering) {
      simulation.setAttractor(addScaled(state.position, forward, 1.8));
      heldSeconds += dt;
    } else heldSeconds = 0;
    gatherGlow += ((gathering ? 1 : 0) - gatherGlow) * Math.min(1, dt * 6);
    if (!state.paused) {
      simulation.update(dt);
      sceneClock += dt;
    }
    updateTarget();
    hoverValue = motion.matches
      ? selectedId !== null
        ? 1
        : 0
      : hoverValue +
        ((selectedId !== null ? 1 : 0) - hoverValue) * Math.min(1, dt * 12);
    if (effectId && clock > effectUntil) {
      effectId = null;
      historyValid = false;
      convergence = 0;
    }
    const jitter = SUBPIXEL_SAMPLES[sampleIndex++ % SUBPIXEL_SAMPLES.length];
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, targetWidth, targetHeight);
    pass(trace);
    uploadScene(trace, jitter);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, roomFbo);
    pass(room);
    uploadScene(room, jitter);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(room.uniforms.sceneImage, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const nextHistory = 1 - historyIndex;
    gl.bindFramebuffer(gl.FRAMEBUFFER, historyFbos[nextHistory]);
    pass(temporal);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, roomTexture);
    gl.uniform1i(temporal.uniforms.image, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, historyTextures[historyIndex]);
    gl.uniform1i(temporal.uniforms.previousImage, 1);
    gl.uniform2f(temporal.uniforms.resolution, targetWidth, targetHeight);
    gl.uniform1f(
      temporal.uniforms.historyWeight,
      historyValid ? Math.min(0.9, convergence / (convergence + 1)) : 0,
    );
    gl.uniform1f(
      temporal.uniforms.sceneMotion,
      !state.paused ||
        gathering ||
        effectId ||
        clock - interactionTime < 1.5 || gatherGlow > 0.005 ||
        Math.abs(hoverValue - (selectedId !== null ? 1 : 0)) > 0.005 ||
        clock - pressTime < 0.6
        ? 1
        : 0,
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    historyIndex = nextHistory;
    historyValid = true;
    convergence++;
    if (floatTarget) {
      pass(bloom);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(bloom.uniforms.image, 0);
      bloomTargets.forEach((target, i) => {
        const source = i ? bloomTargets[i - 1] : { texture: historyTextures[historyIndex], width: targetWidth, height: targetHeight };
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.viewport(0, 0, target.width, target.height);
        gl.bindTexture(gl.TEXTURE_2D, source.texture);
        gl.uniform2f(bloom.uniforms.resolution, target.width, target.height);
        gl.uniform2f(bloom.uniforms.sourceResolution, source.width, source.height);
        gl.uniform1i(bloom.uniforms.prefilter, i === 0 ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      });
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, targetWidth, targetHeight);
    pass(resolve);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, historyTextures[historyIndex]);
    gl.uniform1i(resolve.uniforms.image, 0);
    gl.uniform1i(resolve.uniforms.hdr, floatTarget ? 1 : 0);
    gl.uniform2f(resolve.uniforms.resolution, targetWidth, targetHeight);
    ["bloomNear", "bloomMid", "bloomWide"].forEach((name, i) => {
      gl.activeTexture(gl.TEXTURE2 + i);
      gl.bindTexture(gl.TEXTURE_2D, bloomTargets[i + 1].texture);
      gl.uniform1i(resolve.uniforms[name], 2 + i);
    });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    frames++;
    if (!sampleStarted) sampleStarted = now;
    if (now - sampleStarted > 2500) {
      onQuality?.({
        fps: Math.round((frames * 1000) / (now - sampleStarted)),
        scale: targetWidth / Math.max(1, canvas.clientWidth),
        quality: state.quality,
      });
      frames = 0;
      sampleStarted = now;
    }
    if (clock - statusClock > 0.2) {
      const stats = simulation.stats();
      canvas.dataset.walkPosition = state.position
        .map((v) => v.toFixed(3))
        .join(",");
      canvas.dataset.lookDirection = [state.yaw, state.pitch]
        .map((v) => v.toFixed(3))
        .join(",");
      onStatus?.({
        nearbyCount: stats.gatheredCount,
        dropCount: stats.freeCount,
        volumeRatio: stats.totalVolume / initialVolume,
        volume: stats.totalVolume,
        merges: stats.merges,
        splits: stats.splits,
        returns: stats.returns,
        heldSeconds,
      });
      statusClock = clock;
    }
    if (
      !state.paused ||
      movement[0] ||
      movement[1] ||
      gathering ||
      effectId ||
      convergence < 32 ||
      Math.abs(hoverValue - (selectedId !== null ? 1 : 0)) > 0.005 ||
      clock - pressTime < 0.6
      || clock - interactionTime < 1.5 || gatherGlow > 0.005
    )
      invalidate();
    else previous = 0;
  }
  function invalidate() {
    if (!frame && !destroyed && !lost && !failed && !document.hidden)
      frame = requestAnimationFrame(render);
  }
  function setGathering(value) {
    gathering = Boolean(value);
    if (!gathering) {
      simulation.setAttractor(null);
      heldSeconds = 0;
    }
    invalidate();
  }
  function onVisibility() {
    previous = 0;
    frames = 0;
    sampleStarted = 0;
    if (document.hidden) {
      movement = [0, 0];
      setGathering(false);
      cancelAnimationFrame(frame);
      frame = 0;
    } else invalidate();
  }
  function disposeGpu() {
    for (const entry of [trace, room, temporal, bloom, resolve]) {
      if (entry) {
        entry.shaders.forEach((s) => gl.deleteShader(s));
        gl.deleteProgram(entry.program);
      }
    }
    gl.deleteBuffer(buffer);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(texture);
    gl.deleteTexture(roomTexture);
    gl.deleteFramebuffer(roomFbo);
    historyTextures.forEach((t) => gl.deleteTexture(t));
    historyFbos.forEach((f) => gl.deleteFramebuffer(f));
    bloomTargets.forEach(({ texture, framebuffer }) => {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
    });
  }
  const lostHandler = (event) => {
    event.preventDefault();
    lost = true;
    ready = false;
    cancelAnimationFrame(frame);
    frame = 0;
    onError?.(
      new Error("The graphics context was interrupted. Restoring the room…"),
      true,
    );
  };
  const restored = () => {
    lost = false;
    try {
      initialize();
      invalidate();
    } catch (error) {
      failed = true;
      onError?.(error, false);
    }
  };
  initialize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  listen(document, "visibilitychange", onVisibility);
  listen(canvas, "webglcontextlost", lostHandler);
  listen(canvas, "webglcontextrestored", restored);
  return {
    state,
    move(x, z) {
      const l = Math.max(1, Math.hypot(x, z));
      movement = [x / l, z / l];
      invalidate();
    },
    look(x, y) {
      state.yaw += x;
      state.pitch = clamp(state.pitch + y, -1.25, 1.25);
      historyValid = false;
      convergence = 0;
      invalidate();
    },
    setGathering,
    interact(mode = "push") {
      if (!ready || failed || lost || destroyed) return null;
      updateCamera(0);
      updateTarget();
      if (target.kind === "glyph" && mode === 'push') {
        onEvent?.({ type: "glyph" });
        invalidate();
        return target;
      }
      if (target.kind !== "drop") {
        onEvent?.({ type: "miss" });
        return null;
      }
      const drop = simulation.getDrops().find(item => item.id === target.id);
      if (mode === 'split' && (drop.state !== 'free' || drop.radius < 0.135 || simulation.getDrops().length >= MAX_DROPS)) {
        onEvent?.({ type: 'miss', message: drop.state !== 'free' ? 'Let this drop leave the frame first.' : drop.radius < 0.135 ? 'Gather a little more glass before splitting.' : 'Let two drops join before splitting another.' });
        return null;
      }
      const point = [...drop.position];
      const hit = simulation.interact(
        state.position,
        targetRay,
        mode === "gather" ? "attract" : mode,
      );
      if (hit) {
        pressedId = target.id;
        pressTime = clock;
        interactionPoint = point;
        interactionTime = clock;
        interactionKind = mode === 'split' ? 2 : 1;
        convergence = 0;
        canvas.dataset.lastInteraction = mode;
        onEvent?.({
          type: mode === "split" ? "split-interaction" : "pulse",
          dropId: target.id,
        });
        invalidate();
      }
      return hit;
    },
    setPaused(value) {
      state.paused = Boolean(value);
      convergence = 0;
      previous = 0;
      frames = 0;
      sampleStarted = 0;
      invalidate();
    },
    setQuality(value) {
      if (!["high", "ultra"].includes(value)) return;
      state.quality = value;
      resize();
    },
    setEffect(id, duration = 16000) {
      if (!["resonance", "constellation", "afterimage"].includes(id)) return;
      effectId = id;
      effectStarted = clock;
      effectUntil = clock + duration / 1000;
      onEvent?.({ type: "effect", id });
      invalidate();
    },
    reset() {
      state.position = [0, 1.65, 4.5];
      state.yaw = 0;
      state.pitch = -0.045;
      movement = [0, 0];
      selectedId = null;
      historyValid = false;
      convergence = 0;
      setGathering(false);
      invalidate();
    },
    dispose() {
      destroyed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      listeners.forEach((fn) => fn());
      disposeGpu();
    },
  };
}
