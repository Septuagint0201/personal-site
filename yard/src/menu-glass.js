/*
 * A shared procedural gallery viewed through thick, bevelled crystal cards.
 * The cards use screen-space Snell refraction, spectral IOR and Beer absorption;
 * this is a material study, not the path tracer used by the next chapter.
 */

const VERTEX = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = position * .5 + .5;
  gl_Position = vec4(position, 0., 1.);
}`;

const FRAGMENT = `
precision highp float;
varying vec2 uv;
uniform vec2 viewport;
uniform vec2 size;
uniform vec4 bounds;
uniform vec2 tilt;
uniform vec2 light;
uniform float time;
uniform float radius;
uniform float surface;
uniform float accent;

float squared(float v) { return v * v; }
float line(float d, float width) { return 1. - smoothstep(width, width + 1.25, abs(d)); }
float ellipse(vec2 p, vec2 s) { return length(p / s); }
vec3 spectrum(float n) {
  return .58 + .42 * cos(6.28318 * (n + vec3(0., .33, .67)));
}

// Coordinates are CSS pixels, so the card and background share one scene.
vec3 gallery(vec2 pixel) {
  vec2 p = pixel / viewport;
  float aspect = viewport.x / viewport.y;
  vec2 q = vec2(p.x * aspect, p.y);
  float drift = sin(time * .08) * .008;
  vec3 ice = vec3(.64, .78, .85);
  vec3 ivory = vec3(.94, .9, .83);
  vec3 rose = vec3(.84, .69, .72);
  vec3 c = mix(ice, ivory, smoothstep(.02, 1.2, p.x + p.y * .18));
  c = mix(c, rose, .22 * exp(-length((p - vec2(.77, .16)) * vec2(2., 4.))));
  c += vec3(.085, .08, .07) * exp(-length((p - vec2(.46, .1)) * vec2(1.2, 3.)));

  // Receding wall fins, with broad shadows and sharp metal-like light seams.
  float fin = p.x + p.y * .13;
  float f = fract(fin * 8.);
  float wall = 1. - smoothstep(.69, .88, p.y);
  c *= 1. - .055 * (1. - smoothstep(0., .29, f)) * wall;
  c += vec3(.16, .18, .18) * line((f - .01) * viewport.x / 8., .55) * wall;
  c -= vec3(.05, .06, .07) * line((f - .024) * viewport.x / 8., .6) * wall;

  // A large suspended annulus. Its coloured, crisp contours make refraction legible.
  vec2 centre = vec2(.77 * aspect, .42 + drift);
  vec2 orb = q - centre;
  orb = mat2(.94, -.34, .34, .94) * orb;
  float orbit = ellipse(orb, vec2(.48, .27));
  float ring = exp(-squared((orbit - 1.) * 26.));
  float ring2 = exp(-squared((orbit - 1.11) * 53.));
  float ringShadow = exp(-squared((ellipse(orb + vec2(.006, -.02), vec2(.48, .27)) - 1.) * 15.));
  float angle = atan(orb.y, orb.x) / 6.28318;
  c -= vec3(.075, .065, .055) * ringShadow;
  c = mix(c, mix(vec3(.27, .46, .61), spectrum(angle + .16) * .64 + .3, .72), ring * .55);
  c += spectrum(angle + time * .006) * ring2 * .21;
  c += vec3(.24, .25, .21) * exp(-squared((orbit - .992) * 130.));

  // An illuminated arch behind the left side of the collection.
  vec2 archP = vec2((p.x - .07) * aspect, p.y - .72);
  float arch = ellipse(archP, vec2(.24, .62));
  float archMask = 1. - smoothstep(.73, .84, p.y);
  c = mix(c, vec3(.42, .66, .71), .1 * (1. - smoothstep(.86, .94, arch)) * archMask);
  c += vec3(.16, .2, .2) * exp(-squared((arch - 1.) * 40.)) * archMask;
  c -= vec3(.06, .055, .035) * exp(-squared((arch - 1.04) * 32.)) * archMask;

  // Polished gallery floor and perspective expansion joints.
  float floorY = .73;
  float floorMask = smoothstep(floorY - .015, floorY + .035, p.y);
  vec3 floorColour = mix(vec3(.72, .79, .79), vec3(.9, .87, .8), p.x);
  float dy = max(p.y - floorY, .018);
  float perspective = (p.x - .58) / (dy * 2. + .15);
  float floorLine = abs(fract(perspective * 3. + .5) - .5);
  float rows = abs(fract(.13 / (dy + .09)) - .5);
  floorColour -= .055 * (1. - smoothstep(.0015, .007, floorLine));
  floorColour -= .04 * (1. - smoothstep(.003, .009, rows));
  floorColour += vec3(.05, .06, .065) * pow(max(0., sin(p.x * 20. + p.y * 9.)), 18.);
  c = mix(c, floorColour, floorMask * .72);

  // Gentle prismatic pools and caustic filaments, never a blank dark field.
  vec2 causticP = q - vec2(.94 * aspect, .9);
  float pool = exp(-dot(causticP * vec2(1.4, 4.), causticP * vec2(1.4, 4.)));
  float caustic = sin(q.x * 10. + sin(q.y * 16. + time * .04) * 1.3) + sin(q.y * 17. - q.x * 6.);
  float causticLine = exp(-squared(caustic * 9.));
  c += spectrum(p.x * .7 + p.y * .4 + .3) * causticLine * pool * .095;
  float peach = exp(-length((p - vec2(.2, .93)) * vec2(2.5, 4.5)));
  c = mix(c, vec3(.98, .78, .67), peach * .16);
  c += .009 * sin(pixel.x * .61 + pixel.y * .43) * sin(pixel.y * .72 - pixel.x * .13);
  return clamp(c, 0., 1.);
}

float roundedBox(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r;
}

vec2 refraction(vec3 normal, float ior, float depth) {
  vec3 incident = normalize(vec3(tilt * .045, -1.));
  vec3 ray = refract(incident, normal, 1. / ior);
  return ray.xy / max(abs(ray.z), .18) * depth;
}

void main() {
  vec2 localUV = vec2(uv.x, 1. - uv.y);
  vec2 pixel = bounds.xy + localUV * bounds.zw;
  if (surface < .5) {
    gl_FragColor = vec4(gallery(pixel), 1.);
    return;
  }

  vec2 local = localUV * size;
  vec2 p = local - size * .5;
  float r = min(radius, min(size.x, size.y) * .25);
  float d = roundedBox(p, size * .5 - 1., r);
  float alpha = 1. - smoothstep(-.6, .9, d);
  if (alpha < .005) { gl_FragColor = vec4(0.); return; }
  vec2 gradient = normalize(vec2(
    roundedBox(p + vec2(.6, 0.), size * .5 - 1., r) - roundedBox(p - vec2(.6, 0.), size * .5 - 1., r),
    roundedBox(p + vec2(0., .6), size * .5 - 1., r) - roundedBox(p - vec2(0., .6), size * .5 - 1., r)
  ) + vec2(.00001));

  float inward = max(-d, 0.);
  float bevelWidth = min(23., min(size.x, size.y) * .085);
  float bevel = 1. - smoothstep(1., bevelWidth, inward);
  float internalRim = exp(-squared((inward - bevelWidth * .61) / 2.4));
  vec2 bowed = p / max(size.x, size.y);
  vec3 normal = normalize(vec3(gradient * bevel * 1.85 + bowed * .18 + tilt * .025, 1.));
  float thickness = 42. + 26. * (1. - bevel);

  vec2 red = refraction(normal, 1.478, thickness);
  vec2 green = refraction(normal, 1.51, thickness);
  vec2 blue = refraction(normal, 1.556, thickness);
  // Reversing a narrow inner bevel yields the second highlight of a solid slab.
  float innerLens = exp(-squared((inward - bevelWidth * 1.03) / 5.));
  vec2 correction = gradient * innerLens * 4.;
  red += correction;
  green += correction;
  blue += correction;
  vec3 transmitted = vec3(gallery(pixel + red).r, gallery(pixel + green).g, gallery(pixel + blue).b);

  vec3 glassTint = mix(vec3(.93, .986, 1.), vec3(1., .957, .942), accent);
  transmitted *= pow(glassTint, vec3(.55 + bevel * 1.2));
  float fresnel = .045 + .4 * pow(1. - normal.z, 2.5);
  vec2 reflectedPixel = pixel + normal.xy * viewport * .3 + vec2(0., -viewport.y * .15);
  vec3 reflection = gallery(reflectedPixel);
  vec3 colour = mix(transmitted, reflection, fresnel);

  // Broad upper softbox and a travelling razor of light on the polished cut edge.
  vec3 lamp = normalize(vec3((light - .5) * vec2(1.4, -1.4), 1.5));
  vec3 halfVector = normalize(lamp + vec3(0., 0., 1.));
  float specular = pow(max(0., dot(normal, halfVector)), 85.);
  float edgeLight = max(0., dot(gradient, normalize(vec2(-.5, -.86))));
  float outerRim = exp(-squared((inward - 1.4) / 1.3));
  float spectralRim = internalRim * (.16 + .35 * bevel);
  vec3 spectral = spectrum(atan(gradient.y, gradient.x) / 6.28318 + localUV.x * .15 + time * .006);
  colour += vec3(.15, .16, .16) * specular * (.15 + bevel * .85);
  colour += vec3(.44, .47, .45) * outerRim * (.2 + edgeLight * .8);
  colour += spectral * spectralRim * .35;
  colour -= vec3(.09, .08, .055) * internalRim * (1. - edgeLight) * .6;
  colour += vec3(.02, .027, .029) * pow(1. - localUV.y, 5.);
  gl_FragColor = vec4(clamp(colour, 0., 1.), alpha);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message || "Crystal shader compilation failed");
  }
  return shader;
}

function createPass(canvas, isSurface) {
  const gl = canvas.getContext("webgl", {
    alpha: isSurface,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;
  let vertex, fragment, program, buffer;
  try {
    vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(
        gl.getProgramInfoLog(program) || "Crystal program linking failed",
      );
    }
    gl.useProgram(program);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const uniforms = Object.fromEntries(
      [
        "viewport",
        "size",
        "bounds",
        "tilt",
        "light",
        "time",
        "radius",
        "surface",
        "accent",
      ].map((name) => [name, gl.getUniformLocation(program, name)]),
    );
    gl.uniform1f(uniforms.surface, isSurface ? 1 : 0);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return { gl, program, buffer, uniforms, canvas, lost: false };
  } catch (error) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    if (program) gl.deleteProgram(program);
    if (buffer) gl.deleteBuffer(buffer);
    console.warn(
      "YARD crystal material is using its CSS fallback.",
      error.message,
    );
    return null;
  }
}

/**
 * The background should fill the fixed viewport. Each surface canvas fills its
 * transformed card; text and artwork stay in ordinary, accessible DOM above it.
 */
export function createMenuGlass({
  background,
  surfaces = [],
  reducedMotion = false,
} = {}) {
  let disposed = false;
  let frame = 0;
  let lastDraw = -Infinity;
  let forced = true;
  let staticMotion = reducedMotion;
  let quality = 1;
  let slowFrames = 0;
  let timeOrigin = performance.now();
  let hiddenAt = document.hidden ? timeOrigin : 0;
  const entries = [];
  const cleanups = [];
  const pointer = { x: 0.25, y: 0.22 };

  function add(canvas, element, isSurface) {
    if (!canvas) return;
    const pass = createPass(canvas, isSurface);
    if (!pass) {
      canvas.hidden = true;
      return;
    }
    const entry = { ...pass, element, isSurface };
    entries.push(entry);
    canvas.dataset.crystalReady = "true";
    const lost = (event) => {
      event.preventDefault();
      entry.lost = true;
      canvas.hidden = true;
      if (entries.every((item) => item.lost)) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };
    const restored = () => {
      const fresh = createPass(canvas, isSurface);
      if (!fresh) return;
      Object.assign(entry, fresh);
      canvas.hidden = false;
      invalidate();
    };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    cleanups.push(() => {
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
    });
  }

  add(background, background, false);
  for (const item of surfaces)
    add(item.canvas, item.element || item.canvas, true);

  function draw(entry, now) {
    if (entry.lost) return;
    const { canvas, gl, uniforms, element, isSurface } = entry;
    const rect = element.getBoundingClientRect();
    const width = isSurface ? element.clientWidth : innerWidth;
    const height = isSurface ? element.clientHeight : innerHeight;
    if (width < 2 || height < 2 || rect.bottom < 0 || rect.top > innerHeight)
      return;
    const ratio =
      Math.min(devicePixelRatio || 1, isSurface ? 1.3 : 1.1) * quality;
    const areaScale = Math.min(
      1,
      Math.sqrt(
        (isSurface ? 720000 : 1450000) / (width * height * ratio * ratio),
      ),
    );
    const pixelWidth = Math.max(1, Math.round(width * ratio * areaScale));
    const pixelHeight = Math.max(1, Math.round(height * ratio * areaScale));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const styles = isSurface ? getComputedStyle(element) : null;
    const tx = styles ? parseFloat(styles.getPropertyValue("--ry")) || 0 : 0;
    const ty = styles ? parseFloat(styles.getPropertyValue("--rx")) || 0 : 0;
    const borderRadius = styles
      ? parseFloat(styles.borderTopLeftRadius) || 28
      : 0;
    const warm =
      element.dataset?.accent === "rose" || element.dataset?.accent === "amber"
        ? 1
        : 0.1;
    gl.viewport(0, 0, pixelWidth, pixelHeight);
    gl.uniform2f(uniforms.viewport, innerWidth, innerHeight);
    gl.uniform2f(uniforms.size, width, height);
    gl.uniform4f(
      uniforms.bounds,
      isSurface ? rect.left : 0,
      isSurface ? rect.top : 0,
      isSurface ? rect.width : innerWidth,
      isSurface ? rect.height : innerHeight,
    );
    gl.uniform2f(uniforms.tilt, tx / 6, -ty / 5);
    gl.uniform2f(uniforms.light, pointer.x, pointer.y);
    gl.uniform1f(uniforms.time, staticMotion ? 0 : (now - timeOrigin) / 1000);
    gl.uniform1f(uniforms.radius, borderRadius);
    gl.uniform1f(uniforms.accent, warm);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function render(now) {
    frame = 0;
    if (disposed || document.hidden) return;
    const elapsed = now - lastDraw;
    if (forced || elapsed >= 1000 / 30) {
      forced = false;
      const started = performance.now();
      for (const entry of entries) draw(entry, now);
      const spent = performance.now() - started;
      // Adapt after sustained pressure; avoid changing resolution on every frame.
      slowFrames =
        spent > 19 || (Number.isFinite(elapsed) && elapsed > 72)
          ? slowFrames + 1
          : Math.max(0, slowFrames - 1);
      if (slowFrames > 18 && quality > 0.65) {
        quality = Math.max(0.65, quality - 0.12);
        slowFrames = 0;
      }
      lastDraw = now;
    }
    if (!staticMotion && entries.some((entry) => !entry.lost))
      frame = requestAnimationFrame(render);
  }

  function invalidate() {
    if (disposed || document.hidden || !entries.length) return;
    forced = true;
    if (!frame) frame = requestAnimationFrame(render);
  }

  function move(event) {
    if (staticMotion) return;
    pointer.x = event.clientX / innerWidth;
    pointer.y = event.clientY / innerHeight;
  }

  function visibility() {
    if (document.hidden) {
      hiddenAt = performance.now();
      cancelAnimationFrame(frame);
      frame = 0;
    } else {
      if (hiddenAt) timeOrigin += performance.now() - hiddenAt;
      hiddenAt = 0;
      invalidate();
    }
  }

  const observer =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(invalidate)
      : null;
  if (observer) for (const entry of entries) observer.observe(entry.element);
  addEventListener("resize", invalidate, { passive: true });
  addEventListener("scroll", invalidate, { passive: true });
  addEventListener("pointermove", move, { passive: true });
  document.addEventListener("visibilitychange", visibility);
  invalidate();

  return {
    supported: entries.length > 0,
    invalidate,
    setReducedMotion(value) {
      staticMotion = Boolean(value);
      if (staticMotion) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      invalidate();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      removeEventListener("resize", invalidate);
      removeEventListener("scroll", invalidate);
      removeEventListener("pointermove", move);
      document.removeEventListener("visibilitychange", visibility);
      for (const cleanup of cleanups) cleanup();
      for (const entry of entries) {
        entry.gl.deleteProgram(entry.program);
        entry.gl.deleteBuffer(entry.buffer);
      }
    },
  };
}
