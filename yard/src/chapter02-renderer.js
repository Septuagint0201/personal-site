import { vertexSource, fragmentSource } from "./chapter02-shaders.js";
const resolveSource = `#version 300 es
precision highp float;
uniform sampler2D image;
uniform vec2 resolution;
out vec4 outColor;
void main(){
 vec2 uv=gl_FragCoord.xy/resolution,px=1./resolution;
 vec3 c=texture(image,uv).rgb,nw=texture(image,uv+vec2(-1.,1.)*px).rgb;
 vec3 ne=texture(image,uv+px).rgb,sw=texture(image,uv-px).rgb,se=texture(image,uv+vec2(1.,-1.)*px).rgb;
 vec3 luma=vec3(.299,.587,.114);
 float m=dot(c,luma),a=dot(nw,luma),b=dot(ne,luma),d=dot(sw,luma),e=dot(se,luma);
 float lo=min(m,min(min(a,b),min(d,e))),hi=max(m,max(max(a,b),max(d,e)));
 vec2 dir=vec2(-((a+b)-(d+e)),(a+d)-(b+e));
 float reduce=max((a+b+d+e)*.03125,.0078125);
 dir=clamp(dir/(min(abs(dir.x),abs(dir.y))+reduce),vec2(-6.),vec2(6.))*px;
 vec3 first=.5*(texture(image,uv+dir*(-1./6.)).rgb+texture(image,uv+dir*(1./6.)).rgb);
 vec3 second=first*.5+.25*(texture(image,uv-dir*.5).rgb+texture(image,uv+dir*.5).rgb);
 float l=dot(second,luma);
 outColor=vec4((hi-lo<.045)?c:((l<lo||l>hi)?first:second),1.);
}`;
export function createLiquidRenderer(
  canvas,
  { onQuality, onError, onReady, onPreparing } = {},
) {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("WebGL 2 is unavailable.");
  const parallel = gl.getExtension("KHR_parallel_shader_compile");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const programs = new Map();
  let active,
    buffer,
    framebuffer,
    texture,
    resolveProgram,
    resolveShaders,
    resolveReady = false,
    resolveUniforms;
  let frame = 0,
    destroyed = false,
    lost = false,
    failed = false;
  let previous = 0,
    time = 1.7,
    ripple = 0,
    hover = 0,
    hoverTarget = 0,
    press = 0;
  let frames = 0,
    sampleTime = 0,
    lastInteraction = 0,
    scale = 1,
    pixelLimit = 2400000;
  const state = {
    study: 0,
    flow: 0.55,
    dispersion: 0.65,
    paused: matchMedia("(prefers-reduced-motion: reduce)").matches,
    yaw: -0.38,
    pitch: 0.1,
    distance: 6.1,
    quality: "high",
  };
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }
  function prepare(study) {
    failed = false;
    frames = 0;
    sampleTime = 0;
    previous = 0;
    if (!programs.has(study)) {
      const shaders = [
        compile(gl.VERTEX_SHADER, vertexSource),
        compile(gl.FRAGMENT_SHADER, fragmentSource(study)),
      ];
      const program = gl.createProgram();
      shaders.forEach((shader) => gl.attachShader(program, shader));
      gl.linkProgram(program);
      programs.set(study, {
        program,
        shaders,
        ready: false,
        started: performance.now(),
      });
      gl.flush();
      onPreparing?.();
    }
    active = programs.get(study);
    active.announced = false;
  }
  function initialize() {
    programs.clear();
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
    framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    resolveShaders = [
      compile(gl.VERTEX_SHADER, vertexSource),
      compile(gl.FRAGMENT_SHADER, resolveSource),
    ];
    resolveProgram = gl.createProgram();
    resolveShaders.forEach((shader) => gl.attachShader(resolveProgram, shader));
    gl.linkProgram(resolveProgram);
    resolveReady = false;
    prepare(state.study);
    resize();
  }
  function finishProgram() {
    if (!resolveReady) {
      if (
        parallel &&
        !gl.getProgramParameter(resolveProgram, parallel.COMPLETION_STATUS_KHR)
      )
        return false;
      if (!gl.getProgramParameter(resolveProgram, gl.LINK_STATUS))
        throw new Error(
          gl.getProgramInfoLog(resolveProgram) ||
            "The antialiasing resolve could not be linked.",
        );
      resolveShaders.forEach((shader) => gl.deleteShader(shader));
      resolveShaders = [];
      resolveUniforms = {
        resolution: gl.getUniformLocation(resolveProgram, "resolution"),
        image: gl.getUniformLocation(resolveProgram, "image"),
        position: gl.getAttribLocation(resolveProgram, "position"),
      };
      resolveReady = true;
    }
    if (active.ready) return true;
    if (
      parallel &&
      !gl.getProgramParameter(active.program, parallel.COMPLETION_STATUS_KHR)
    ) {
      if (performance.now() - active.started > 90000)
        throw new Error(
          "The graphics driver took too long to prepare this study.",
        );
      return false;
    }
    if (!gl.getProgramParameter(active.program, gl.LINK_STATUS))
      throw new Error(
        gl.getProgramInfoLog(active.program) ||
          active.shaders
            .map((shader) => gl.getShaderInfoLog(shader))
            .filter(Boolean)
            .join("\n") ||
          "The glass shader could not be linked.",
      );
    active.shaders.forEach((shader) => gl.deleteShader(shader));
    active.shaders = [];
    active.uniforms = Object.fromEntries(
      [
        "resolution",
        "orbit",
        "distanceToGlass",
        "time",
        "flow",
        "dispersion",
        "ripple",
        "compact",
        "boundaryLimit",
        "hover",
        "press",
      ].map((name) => [name, gl.getUniformLocation(active.program, name)]),
    );
    active.position = gl.getAttribLocation(active.program, "position");
    active.ready = true;
    return true;
  }
  function invalidate() {
    if (!frame && !destroyed && !lost && !failed && !document.hidden)
      frame = requestAnimationFrame(draw);
  }
  function resize() {
    if (destroyed || lost) return;
    const rect = canvas.getBoundingClientRect(),
      bounded = Math.min(
        scale,
        Math.sqrt(pixelLimit / Math.max(1, rect.width * rect.height)),
      );
    const width = Math.max(1, Math.round(rect.width * bounded)),
      height = Math.max(1, Math.round(rect.height * bounded));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    invalidate();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
  }
  function draw(now) {
    frame = 0;
    if (destroyed || lost || document.hidden) {
      previous = 0;
      return;
    }
    try {
      if (!finishProgram()) {
        invalidate();
        return;
      }
    } catch (error) {
      failed = true;
      onError?.(error, false);
      return;
    }
    if (previous && now - previous < 15.7) {
      invalidate();
      return;
    }
    const dt = previous ? Math.min((now - previous) / 1000, 0.07) : 0.016;
    previous = now;
    if (!state.paused) time += dt;
    if (!state.paused) ripple *= Math.exp(-dt * 1.1);
    hover = reducedMotion.matches
      ? hoverTarget
      : hover + (hoverTarget - hover) * Math.min(1, dt * 9);
    press = reducedMotion.matches ? 0 : press * Math.exp(-dt * 13);
    const u = active.uniforms;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.useProgram(active.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(active.position);
    gl.vertexAttribPointer(active.position, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u.resolution, canvas.width, canvas.height);
    gl.uniform2f(u.orbit, state.yaw, state.pitch);
    gl.uniform1f(u.distanceToGlass, state.distance);
    gl.uniform1f(u.time, time);
    gl.uniform1f(u.flow, state.flow);
    gl.uniform1f(u.dispersion, state.dispersion);
    gl.uniform1f(u.ripple, ripple);
    gl.uniform1f(u.hover, hover);
    gl.uniform1f(u.press, press);
    gl.uniform1i(u.boundaryLimit, state.quality === "ultra" ? 8 : 6);
    gl.uniform1i(u.compact, canvas.clientWidth < 601 ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(resolveProgram);
    gl.enableVertexAttribArray(resolveUniforms.position);
    gl.vertexAttribPointer(resolveUniforms.position, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(resolveUniforms.image, 0);
    gl.uniform2f(resolveUniforms.resolution, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!active.announced) {
      active.announced = true;
      onReady?.();
    }
    frames++;
    if (!sampleTime) sampleTime = now;
    if (now - sampleTime > 2400 && frames > 3) {
      const fps = (frames * 1000) / (now - sampleTime);
      if (state.quality === "adaptive") {
        let next = scale;
        if (fps < 28) next = Math.max(0.65, scale * 0.88);
        else if (fps > 52 && now - lastInteraction > 3000)
          next = Math.min(1.25, scale + 0.08);
        if (Math.abs(next - scale) > 0.02) {
          scale = next;
          resize();
        }
      }
      onQuality?.({
        fps: Math.round(fps),
        scale: canvas.width / Math.max(1, canvas.clientWidth),
        study: state.study,
        quality: state.quality,
      });
      frames = 0;
      sampleTime = now;
    }
    if (!state.paused || Math.abs(hover - hoverTarget) > 0.002 || press > 0.001)
      invalidate();
    else previous = 0;
  }
  function resetCamera() {
    state.yaw = state.study === 1 ? 0.035 : state.study === 2 ? -0.2 : -0.38;
    state.pitch = state.study === 1 ? 0.025 : 0.1;
    state.distance = state.study === 1 ? 6.4 : state.study === 2 ? 6.8 : 6.1;
    invalidate();
  }
  function floorLimit() {
    state.pitch = Math.max(
      Math.max(-0.4, Math.asin(Math.max(-1, -1.75 / state.distance))),
      state.pitch,
    );
  }
  function visibility() {
    previous = 0;
    frames = 0;
    sampleTime = 0;
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else invalidate();
  }
  function contextLost(event) {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
    onError?.(
      new Error("The graphics context was interrupted. Restoring the gallery…"),
      true,
    );
  }
  function restored() {
    lost = false;
    try {
      initialize();
      invalidate();
    } catch (error) {
      onError?.(error, false);
    }
  }
  initialize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  document.addEventListener("visibilitychange", visibility);
  canvas.addEventListener("webglcontextlost", contextLost);
  canvas.addEventListener("webglcontextrestored", restored);
  invalidate();
  return {
    state,
    select(study) {
      if (study !== state.study) {
        state.study = study;
        prepare(study);
      }
      resetCamera();
      ripple = 0;
      lastInteraction = performance.now();
      invalidate();
    },
    setQuality(mode) {
      if (!["high", "ultra", "adaptive"].includes(mode)) return;
      state.quality = mode;
      scale =
        mode === "ultra"
          ? Math.min(window.devicePixelRatio || 1, 2) * 1.35
          : mode === "high"
            ? 1
            : 0.85;
      pixelLimit = mode === "ultra" ? 6500000 : 2400000;
      resize();
    },
    setHover(value) {
      hoverTarget = value;
      invalidate();
    },
    press() {
      press = 1;
      invalidate();
    },
    setFlow(value) {
      state.flow = value;
      invalidate();
    },
    setDispersion(value) {
      state.dispersion = value;
      invalidate();
    },
    setPaused(value) {
      state.paused = value;
      previous = 0;
      frames = 0;
      sampleTime = 0;
      invalidate();
    },
    orbit(x, y) {
      state.yaw = Math.max(-1.15, Math.min(1.15, state.yaw + x));
      state.pitch = Math.min(0.55, state.pitch + y);
      floorLimit();
      lastInteraction = performance.now();
      invalidate();
    },
    zoom(delta) {
      state.distance = Math.max(
        state.study === 1 ? 0.85 : 4.8,
        Math.min(9.5, state.distance + delta),
      );
      floorLimit();
      lastInteraction = performance.now();
      invalidate();
    },
    pulse() {
      ripple = 1;
      press = 1;
      invalidate();
    },
    reset: resetCamera,
    dispose() {
      destroyed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.removeEventListener("webglcontextrestored", restored);
      gl.deleteBuffer(buffer);
      programs.forEach((entry) => {
        entry.shaders.forEach((shader) => gl.deleteShader(shader));
        gl.deleteProgram(entry.program);
      });
      programs.clear();
      resolveShaders.forEach((shader) => gl.deleteShader(shader));
      gl.deleteProgram(resolveProgram);
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
    },
  };
}
