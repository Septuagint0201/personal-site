/* Shared screen-space glass renderer for the homepage and material lab. */
"use strict";
(() => {
  const softCurve = {
    referenceWidthScale: 1.75,
    widthScale: 2.4,
    referenceBias: 0.85,
    edgeSlopeGain: 1.1,
  };
  const vertexSource = `
    attribute vec2 a_position;
    void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
  `;
  const fragmentSource = `
    precision highp float;
    uniform sampler2D u_texture;
    uniform vec2 u_resolution;
    uniform float u_dpr;
    uniform vec4 u_rect;
    uniform float u_radius;
    uniform vec4 u_material; // IOR, thickness, roughness, dispersion
    uniform float u_tint;
    uniform float u_dark;
    uniform float u_invert;
    uniform float u_profile;
    uniform float u_enabled;
    uniform vec2 u_light;

    vec3 sampleScene(vec2 p) {
      vec2 uv = vec2(p.x / u_resolution.x, 1.0 - p.y / u_resolution.y);
      return texture2D(u_texture, clamp(uv, vec2(0.001), vec2(0.999))).rgb;
    }
    float roundedBox(vec2 p, vec2 halfSize, float radius) {
      vec2 q = abs(p) - halfSize + radius;
      return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    }
    vec3 softened(vec2 p, float spread) {
      if (spread < 0.05) return sampleScene(p);
      vec3 c = sampleScene(p) * 0.2;
      c += sampleScene(p + vec2(1.0, 0.0) * spread) * 0.1;
      c += sampleScene(p + vec2(-1.0, 0.0) * spread) * 0.1;
      c += sampleScene(p + vec2(0.0, 1.0) * spread) * 0.1;
      c += sampleScene(p + vec2(0.0, -1.0) * spread) * 0.1;
      c += sampleScene(p + vec2(0.707, 0.707) * spread) * 0.1;
      c += sampleScene(p + vec2(-0.707, 0.707) * spread) * 0.1;
      c += sampleScene(p + vec2(0.707, -0.707) * spread) * 0.1;
      c += sampleScene(p + vec2(-0.707, -0.707) * spread) * 0.1;
      return c;
    }
    vec2 rayOffset(vec3 normal, float ior, float depth) {
      // Snell's law: air -> curved glass. Project the transmitted ray to the scene plane.
      vec3 ray = refract(vec3(0.0, 0.0, -1.0), normal, 1.0 / max(ior, 1.0));
      return ray.xy / max(abs(ray.z), 0.15) * depth;
    }
    void main() {
      vec2 p = vec2(gl_FragCoord.x / u_dpr, u_resolution.y - gl_FragCoord.y / u_dpr);
      vec3 original = sampleScene(p);
      if (u_rect.z <= 0.0) { gl_FragColor = vec4(original, 1.0); return; }
      vec2 halfSize = u_rect.zw * 0.5;
      vec2 local = p - u_rect.xy - halfSize;
      float radius = min(u_radius, min(halfSize.x, halfSize.y));
      float dist = roundedBox(local, halfSize, radius);
      if (dist > 1.0) { gl_FragColor = vec4(original, 1.0); return; }
      vec2 gradient = vec2(
        roundedBox(local + vec2(0.5, 0.0), halfSize, radius) - roundedBox(local - vec2(0.5, 0.0), halfSize, radius),
        roundedBox(local + vec2(0.0, 0.5), halfSize, radius) - roundedBox(local - vec2(0.0, 0.5), halfSize, radius)
      );
      vec2 outward = gradient / max(length(gradient), 0.0001);
      float bevel = min(9.0 + u_material.y * 0.32, min(halfSize.x, halfSize.y) * 0.7);
      float edge = 1.0 - clamp(-dist / max(bevel, 1.0), 0.0, 1.0);
      float slope = pow(edge, 1.7) * 2.8;
      float localThickness = 1.0;
      if (u_profile > 1.5) {
        // Hyperbolic easing, with an exact C2 join to the flat interior:
        // q(t) = (1+b)t/(t+b), h(t) = 1 - (1-q)^3.
        // Both h'(1) and h''(1) are zero. A wider shoulder avoids the
        // curvature step of a circular arc meeting a plane.
        float referenceWidth = min(bevel * ${softCurve.referenceWidthScale}, min(halfSize.x, halfSize.y) * 0.92);
        float width = min(bevel * ${softCurve.widthScale}, min(halfSize.x, halfSize.y) * 0.97);
        float t = clamp(-dist / max(width, 1.0), 0.0, 1.0);
        // Compensate for the wider shoulder while raising the outer-edge slope
        // by only 10%, including on short buttons whose width is size-limited.
        float widthRatio = width / max(referenceWidth, 0.001);
        float b = 1.0 / (${softCurve.edgeSlopeGain} * widthRatio * (1.0 + 1.0 / ${softCurve.referenceBias}) - 1.0);
        float q = (1.0 + b) * t / (t + b);
        float tail = max(1.0 - q, 0.0);
        float height = 1.0 - tail * tail * tail;
        float derivative = 3.0 * tail * tail * b * (1.0 + b) / ((t + b) * (t + b));
        slope = u_material.y * 0.82 * derivative / max(width, 1.0);
        localThickness = 0.18 + 0.82 * height;
        // Edge shading must decay with the same profile, or it creates a false seam.
        edge = tail * tail * tail;
      } else if (u_profile > 0.5) {
        // Rounded cross-section: h = sqrt(1 - edge^2). Its derivative supplies
        // the optical surface normal; the curved cap also changes ray travel depth.
        float arcHeight = sqrt(max(1.0 - edge * edge, 0.0));
        slope = (u_material.y * 0.82 / max(bevel, 1.0)) * edge / max(arcHeight, 0.045);
        localThickness = 0.18 + 0.82 * arcHeight;
      }
      vec2 crown = u_profile > 1.5 ? vec2(0.0) : local / halfSize * 0.045;
      vec3 normal = normalize(vec3(outward * slope + crown, 1.0));
      float depth = u_material.y * localThickness * u_enabled;
      vec2 offset = rayOffset(normal, u_material.x, depth);
      vec3 transmitted = softened(p + offset, u_material.z);
      if (u_material.w > 0.0 && u_enabled > 0.0) {
        // Wavelength-dependent IOR, not a colored CSS outline.
        vec2 redOffset = rayOffset(normal, u_material.x - u_material.w, depth);
        vec2 blueOffset = rayOffset(normal, u_material.x + u_material.w, depth);
        transmitted.r = softened(p + redOffset, u_material.z).r;
        transmitted.b = softened(p + blueOffset, u_material.z).b;
      }
      float darkTint = mix(u_dark, 1.0 - u_dark, u_invert);
      vec3 tint = mix(vec3(0.99, 0.99, 0.97), vec3(0.055, 0.065, 0.1), darkTint);
      vec3 color = mix(transmitted, tint, u_tint);
      float f0 = pow((u_material.x - 1.0) / (u_material.x + 1.0), 2.0);
      float fresnel = f0 + (1.0 - f0) * pow(1.0 - normal.z, 5.0);
      vec3 light = normalize(vec3((u_light - p) / u_resolution, 0.65));
      float sheen = pow(max(dot(normal, normalize(light + vec3(0.0, 0.0, 1.0))), 0.0), 40.0);
      float rim = exp(-abs(dist + 0.8) * 1.5);
      float directional = 0.4 + 0.6 * max(dot(outward, normalize(vec2(-0.65, -0.8))), 0.0);
      color += vec3(1.0, 0.98, 0.95) * (fresnel * 0.22 + sheen * 0.12 + rim * directional * 0.24);
      color -= edge * (1.0 - directional) * 0.065;
      float coverage = 1.0 - smoothstep(-0.7, 0.7, dist);
      gl_FragColor = vec4(mix(original, color, coverage), 1.0);
    }
  `;

  class GlassRenderer {
    constructor(element, options) {
      this.element = element;
      this.options = options;
      this.canvas = options.canvas || element.querySelector("canvas");
      this.background = document.createElement("canvas");
      this.ctx = this.background.getContext("2d");
      this.width = 0;
      this.height = 0;
      this.frame = 0;
      this.failed = false;
      this.light = [-100, -150];
      this.canvas.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        this.failed = true;
        this.element.classList.add("no-webgl");
        this.refreshBackground();
        this.options.onStatus?.(this);
      });
      this.canvas.addEventListener("webglcontextrestored", () => {
        this.width = 0;
        this.initialize();
        this.resize();
      });
      this.initialize();
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(element);
    }
    initialize() {
      try {
        const gl = this.canvas.getContext("webgl", {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          preserveDrawingBuffer: false,
        });
        if (!gl) throw new Error("WebGL unavailable");
        this.gl = gl;
        const compile = (type, source) => {
          const shader = gl.createShader(type);
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(message);
          }
          return shader;
        };
        const vertex = compile(gl.VERTEX_SHADER, vertexSource),
          fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
        const program = gl.createProgram();
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
          throw new Error(gl.getProgramInfoLog(program));
        this.program = program;
        gl.useProgram(program);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
          gl.STATIC_DRAW,
        );
        const position = gl.getAttribLocation(program, "a_position");
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        this.uniforms = {};
        for (const name of [
          "texture",
          "resolution",
          "dpr",
          "rect",
          "radius",
          "material",
          "tint",
          "dark",
          "invert",
          "profile",
          "enabled",
          "light",
        ])
          this.uniforms[name] = gl.getUniformLocation(program, `u_${name}`);
        const texture = () => {
          const result = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, result);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          return result;
        };
        this.sourceTexture = texture();
        this.targets = [0, 1].map(() => ({
          texture: texture(),
          framebuffer: gl.createFramebuffer(),
        }));
        this.failed = false;
        this.element.classList.remove("no-webgl");
      } catch (error) {
        this.failed = true;
        this.element.classList.add("no-webgl");
        console.warn("Glass preview unavailable:", error.message);
      }
      this.options.onStatus?.(this);
    }
    resize() {
      const width = Math.round(this.element.clientWidth),
        height = Math.round(this.element.clientHeight);
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        this.options.maxDpr || 1.5,
        Math.sqrt((this.options.maxPixels || 2400000) / (width * height)),
      );
      if (!width || !height) return;
      if (width === this.width && height === this.height && dpr === this.dpr) {
        this.request();
        return;
      }
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      this.background.width = this.canvas.width;
      this.background.height = this.canvas.height;
      if (!this.failed) {
        const gl = this.gl;
        for (const target of this.targets) {
          gl.bindTexture(gl.TEXTURE_2D, target.texture);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            this.canvas.width,
            this.canvas.height,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null,
          );
          gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
          gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            target.texture,
            0,
          );
          if (
            gl.checkFramebufferStatus(gl.FRAMEBUFFER) !==
            gl.FRAMEBUFFER_COMPLETE
          ) {
            this.failed = true;
            this.element.classList.add("no-webgl");
            this.options.onStatus?.(this);
            break;
          }
        }
      }
      this.refreshBackground();
    }
    refreshBackground() {
      if (!this.width) return;
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.options.paintBackground(ctx, this.width, this.height);
      if (this.failed) {
        this.element.style.backgroundImage = `url(${this.background.toDataURL()})`;
        this.element.style.backgroundSize = "100% 100%";
        return;
      }
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.background,
      );
      this.request();
    }
    request() {
      if (this.frame || this.failed || document.hidden) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.render();
      });
    }
    render() {
      if (this.failed || !this.width) return;
      const gl = this.gl,
        u = this.uniforms,
        state = this.options.getState(),
        m = state.material;
      gl.useProgram(this.program);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(u.texture, 0);
      // Use exact buffer/CSS scaling to keep sampling aligned at fractional DPRs.
      gl.uniform2f(
        u.resolution,
        this.canvas.width / this.dpr,
        this.canvas.height / this.dpr,
      );
      gl.uniform1f(u.dpr, this.dpr);
      gl.uniform1f(u.dark, state.dark ? 1 : 0);
      gl.uniform1f(u.invert, state.invertedTint ? 1 : 0);
      gl.uniform1f(
        u.profile,
        { bevel: 0, rounded: 1, soft: 2 }[state.edgeProfile] ?? 2,
      );
      gl.uniform1f(u.enabled, state.refraction === false ? 0 : 1);
      gl.uniform2f(u.light, ...this.light);
      let input = this.sourceTexture;
      const bounds = this.element.getBoundingClientRect();
      const surfaces = [
        ...(this.options.getSurfaces?.() ||
          this.element.querySelectorAll(".glass-surface")),
      ];
      // Ping-pong buffers ensure each button refracts the already-rendered parent glass.
      surfaces.forEach((surface, index) => {
        const rect = surface.getBoundingClientRect(),
          nested =
            !!surface.parentElement.closest(".glass-surface") ||
            surface.hasAttribute("data-glass-compact");
        const target = this.targets[index % 2];
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.bindTexture(gl.TEXTURE_2D, input);
        gl.uniform4f(
          u.rect,
          rect.left - bounds.left,
          rect.top - bounds.top,
          rect.width,
          rect.height,
        );
        gl.uniform1f(u.radius, +surface.dataset.radius || 14);
        gl.uniform4f(
          u.material,
          m.ior,
          m.thickness * (nested ? 0.42 : 1),
          m.roughness * (nested ? 0.45 : 1),
          m.dispersion,
        );
        gl.uniform1f(u.tint, m.tint * (nested ? 0.65 : 1));
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        input = target.texture;
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, input);
      gl.uniform4f(u.rect, 0, 0, -1, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      this.element.dataset.rendered = "true";
    }
  }

  window.LiquidGlass = Object.freeze({
    Renderer: GlassRenderer,
    softCurve: Object.freeze(softCurve),
  });
})();
