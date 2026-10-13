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
    uniform vec4 u_curve; // Explicit shoulder width, edge fraction, bias, exponent.
    uniform vec2 u_section; // Front share, scene distance behind the slab midplane.
    uniform float u_enabled;
    uniform vec2 u_light;
    uniform vec4 u_lens; // Optional scene-only cursor lens: center, radius, strength.
    uniform vec3 u_surface; // Reflection gain, hover amount, interactive lighting.

    vec3 sampleScene(vec2 p) {
      vec2 uv = vec2(p.x / u_resolution.x, 1.0 - p.y / u_resolution.y);
      vec2 halfTexel = 0.5 / (u_resolution * u_dpr);
      return texture2D(u_texture, clamp(uv, halfTexel, 1.0 - halfTexel)).rgb;
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
    vec2 boxNormal(vec2 p, vec2 halfSize, float radius) {
      vec2 q = abs(p) - halfSize + radius, corner = max(q, 0.0);
      float lengthCorner = length(corner);
      return lengthCorner > 0.0001 ? sign(p) * corner / lengthCorner
        : (q.x > q.y ? vec2(sign(p.x), 0.0) : vec2(0.0, sign(p.y)));
    }
    vec2 sectionCurve(float distance, float width) {
      float t = clamp(-distance / width, 0.0, 1.0), b = u_curve.z;
      float q = (1.0 + b) * t / (t + b), tail = max(0.0, 1.0 - q);
      float h = 1.0 - pow(tail, u_curve.w);
      float derivative = u_curve.w * pow(tail, u_curve.w - 1.0)
        * b * (1.0 + b) / ((t + b) * (t + b));
      return vec2(u_curve.y + (1.0 - u_curve.y) * h,
        (1.0 - u_curve.y) * derivative / width);
    }
    vec3 sectionBounds(vec3 point, vec2 halfSize, float radius, float width) {
      float d = roundedBox(point.xy, halfSize, radius);
      float height = u_material.y * sectionCurve(d, width).x;
      return vec3(d, point.z - height * u_section.x,
        -height * (1.0 - u_section.x) - point.z);
    }
    vec3 sectionNormal(vec3 point, vec2 halfSize, float radius, float width) {
      vec3 bounds = sectionBounds(point, halfSize, radius, width);
      vec2 outward = boxNormal(point.xy, halfSize, radius);
      if (bounds.x >= max(bounds.y, bounds.z)) return vec3(outward, 0.0);
      float slope = u_material.y * sectionCurve(bounds.x, width).y;
      return bounds.y > bounds.z ? normalize(vec3(outward * slope * u_section.x, 1.0))
        : normalize(vec3(outward * slope * (1.0 - u_section.x), -1.0));
    }
    vec3 sectionExit(vec3 origin, vec3 ray, vec2 halfSize, float radius, float width) {
      vec3 lower = vec3(-halfSize, -u_material.y * (1.0 - u_section.x));
      vec3 upper = vec3(halfSize, u_material.y * u_section.x);
      vec3 end = vec3(100000.0);
      if (abs(ray.x) > 0.00001) end.x = ((ray.x > 0.0 ? upper.x : lower.x) - origin.x) / ray.x;
      if (abs(ray.y) > 0.00001) end.y = ((ray.y > 0.0 ? upper.y : lower.y) - origin.y) / ray.y;
      if (abs(ray.z) > 0.00001) end.z = ((ray.z > 0.0 ? upper.z : lower.z) - origin.z) / ray.z;
      float lo = 0.0, hi = max(0.02, min(end.x, min(end.y, end.z)) + 0.02);
      // The accepted concave hyperbola produces a convex closed slab, so a
      // ray starting inside has one exit. Bisection also catches rounded sides.
      for (int step = 0; step < 12; step++) {
        float mid = (lo + hi) * 0.5;
        vec3 bounds = sectionBounds(origin + ray * mid, halfSize, radius, width);
        if (max(bounds.x, max(bounds.y, bounds.z)) <= 0.0) lo = mid; else hi = mid;
      }
      return origin + ray * ((lo + hi) * 0.5);
    }
    vec3 sectionTransmission(vec2 p, vec2 local, vec2 halfSize, float radius,
      float width, vec3 normal, float ior) {
      if (u_enabled < 0.5) return softened(p, u_material.z);
      ior = max(1.001, ior);
      float d = roundedBox(local, halfSize, radius);
      vec2 entry = local - boxNormal(local, halfSize, radius) * max(d + 0.01, 0.0);
      float front = u_material.y * u_section.x * sectionCurve(roundedBox(entry, halfSize, radius), width).x;
      vec3 ray = refract(vec3(0.0, 0.0, -1.0), normal, 1.0 / ior);
      vec3 origin = vec3(entry, front) + ray * 0.02;
      for (int bounce = 0; bounce < 3; bounce++) {
        vec3 exitPoint = sectionExit(origin, ray, halfSize, radius, width);
        vec3 exitNormal = sectionNormal(exitPoint, halfSize, radius, width);
        vec3 outgoing = refract(ray, -exitNormal, ior);
        if (dot(outgoing, outgoing) > 0.00001) {
          // Only the scene behind the UI is available to this compositor.
          if (outgoing.z >= -0.02) return softened(p, u_material.z);
          float distance = max(0.0, (-u_section.y - exitPoint.z) / outgoing.z);
          return softened(u_rect.xy + halfSize + exitPoint.xy + outgoing.xy * distance, u_material.z);
        }
        ray = reflect(ray, exitNormal); origin = exitPoint + ray * 0.02;
      }
      return softened(p, u_material.z);
    }
    void main() {
      vec2 p = vec2(gl_FragCoord.x / u_dpr, u_resolution.y - gl_FragCoord.y / u_dpr);
      vec3 original = sampleScene(p);
      if (u_rect.z <= 0.0) {
        vec2 delta = p - u_lens.xy;
        float r = length(delta) / max(u_lens.z, 1.0);
        float falloff = pow(max(1.0 - r * r, 0.0), 3.0);
        // Signed radial lens: positive magnifies, negative compresses; smooth boundary.
        gl_FragColor = vec4(sampleScene(p - delta * falloff * u_lens.w), 1.0);
        return;
      }
      vec2 halfSize = u_rect.zw * 0.5;
      vec2 local = p - u_rect.xy - halfSize;
      float radius = min(u_radius, min(halfSize.x, halfSize.y));
      float dist = roundedBox(local, halfSize, radius);
      if (dist > 1.0 / u_dpr) { gl_FragColor = vec4(original, 1.0); return; }
      // Exact rounded-box gradient avoids finite-difference corner shimmer.
      vec2 q = abs(local) - halfSize + radius;
      vec2 corner = max(q, 0.0);
      float cornerLength = length(corner);
      vec2 outward = cornerLength > 0.0001
        ? sign(local) * corner / cornerLength
        : (q.x > q.y ? vec2(sign(local.x), 0.0) : vec2(0.0, sign(local.y)));
      float bevel = min(9.0 + u_material.y * 0.32, min(halfSize.x, halfSize.y) * 0.7);
      float edge = 1.0 - clamp(-dist / max(bevel, 1.0), 0.0, 1.0);
      float slope = pow(edge, 1.7) * 2.8;
      float localThickness = 1.0;
      float sectionWidth = max(0.5, min(u_curve.x, min(halfSize.x, halfSize.y) * 0.98));
      if (u_profile > 2.5) {
        vec2 profile = sectionCurve(dist, sectionWidth);
        slope = u_material.y * u_section.x * profile.y;
        localThickness = profile.x;
        edge = (1.0 - profile.x) / max(0.001, 1.0 - u_curve.y);
      } else if (u_profile > 1.5) {
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
      vec3 transmitted;
      if (u_profile > 2.5) {
        transmitted = sectionTransmission(p, local, halfSize, radius, sectionWidth, normal, u_material.x);
        if (u_material.w > 0.0 && u_enabled > 0.0) {
          transmitted.r = sectionTransmission(p, local, halfSize, radius, sectionWidth, normal, u_material.x - u_material.w).r;
          transmitted.b = sectionTransmission(p, local, halfSize, radius, sectionWidth, normal, u_material.x + u_material.w).b;
        }
      } else {
        vec2 offset = rayOffset(normal, u_material.x, depth);
        transmitted = softened(p + offset, u_material.z);
        if (u_material.w > 0.0 && u_enabled > 0.0) {
          // Wavelength-dependent IOR, not a colored CSS outline.
          vec2 redOffset = rayOffset(normal, u_material.x - u_material.w, depth);
          vec2 blueOffset = rayOffset(normal, u_material.x + u_material.w, depth);
          transmitted.r = softened(p + redOffset, u_material.z).r;
          transmitted.b = softened(p + blueOffset, u_material.z).b;
        }
      }
      float darkTint = mix(u_dark, 1.0 - u_dark, u_invert);
      vec3 tint = mix(vec3(0.99, 0.99, 0.97), vec3(0.055, 0.065, 0.1), darkTint);
      vec3 color = mix(transmitted, tint, u_tint);
      float f0 = pow((u_material.x - 1.0) / (u_material.x + 1.0), 2.0);
      float fresnel = f0 + (1.0 - f0) * pow(1.0 - normal.z, 5.0);
      vec3 light = normalize(vec3((u_light - p) / u_resolution, 0.65));
      float sheen = pow(max(dot(normal, normalize(light + vec3(0.0, 0.0, 1.0))), 0.0), 40.0);
      float rim = exp(-abs(dist + 0.8) * 1.5);
      vec2 lightDirection = mix(vec2(-0.65, -0.8), (u_light - p) / max(length(u_light - p), 0.001), u_surface.z);
      float directional = 0.4 + 0.6 * max(dot(outward, lightDirection / max(length(lightDirection), 0.001)), 0.0);
      float hotspot = exp(-dot(u_light - p, u_light - p) / 9500.0) * u_surface.y;
      color += vec3(1.0, 0.98, 0.95) * ((fresnel * 0.22 + sheen * 0.12 + rim * directional * 0.24) * u_surface.x + hotspot * (0.075 + rim * 0.18));
      color -= edge * (1.0 - directional) * 0.065;
      float aa = 0.75 / u_dpr;
      float coverage = 1.0 - smoothstep(-aa, aa, dist);
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
      this.layers = new Map();
      if (options.attachSurfaces) {
        this.backdrop = document.createElement("canvas");
        this.backdrop.className = "glass-backdrop";
        this.backdrop.setAttribute("aria-hidden", "true");
        element.append(this.backdrop);
        this.backdropContext = this.backdrop.getContext("2d", { alpha: false });
        this.extended = document.createElement("canvas");
        this.extendedContext = this.extended.getContext("2d", { alpha: false });
        this.canvas.hidden = true;
      }
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
        this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        this.textureWidth = this.textureHeight = 0;
        this.backdropKey = null;
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
        const buffer = this.vertexBuffer = gl.createBuffer();
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
          "curve",
          "section",
          "enabled",
          "light",
          "lens",
          "surface",
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
      if (this.backdrop) {
        this.backdrop.width = this.background.width;
        this.backdrop.height = this.background.height;
      }
      this.targetWidth = this.targetHeight = 0;
      this.attachedWidth = this.attachedHeight = 0;
      if (!this.backdrop) this.allocateTargets();
      this.refreshBackground();
    }
    allocateTargets() {
      if (this.targetWidth === this.canvas.width && this.targetHeight === this.canvas.height) return;
      this.targetWidth = this.canvas.width;
      this.targetHeight = this.canvas.height;
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
      this.sourceDirty = true;
      if (this.backdrop) { this.request(); return; }
      this.uploadBackground(this.background);
      this.request();
    }
    uploadBackground(source) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      if (this.textureWidth === source.width && this.textureHeight === source.height) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        this.textureWidth = source.width; this.textureHeight = source.height;
      }
      this.sourceVersion = (this.sourceVersion || 0) + 1;
      this.sourceDirty = false;
    }
    prepareAttachedFrame(bounds, surfaces, material) {
      const roots = surfaces.filter(item => !surfaces.some(parent => parent !== item && parent.surface.contains(item.surface)));
      const margin = Math.ceil(material.thickness * 1.2 + material.roughness * 2 + 4);
      const left = Math.floor(Math.min(0, ...roots.map(item => item.rect.left - bounds.left - margin)));
      const top = Math.floor(Math.min(0, ...roots.map(item => item.rect.top - bounds.top - margin)));
      const neededRight = Math.ceil(Math.max(this.width, ...roots.map(item => item.rect.right - bounds.left + margin)));
      const neededBottom = Math.ceil(Math.max(this.height, ...roots.map(item => item.rect.bottom - bounds.top + margin)));
      // Keep capacity through a scroll gesture. Only origin changes as the
      // card crosses the viewport; no render-target allocation every frame.
      const width = this.attachedWidth = Math.max(this.attachedWidth || 0, neededRight - left);
      const height = this.attachedHeight = Math.max(this.attachedHeight || 0, neededBottom - top);
      const right = left + width, bottom = top + height;
      const limit = this.maxTextureSize;
      const dpr = Math.min(window.devicePixelRatio || 1, this.options.maxDpr || 1.5,
        Math.sqrt((this.options.maxPixels || 2400000) / (width * height)), limit / width, limit / height);
      const pixelWidth = Math.max(1, Math.round(width * dpr)), pixelHeight = Math.max(1, Math.round(height * dpr));
      const key = `${left}/${top}/${pixelWidth}/${pixelHeight}/${dpr}`;
      if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
      if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight;
      this.allocateTargets();
      if (this.sourceDirty || key !== this.sourceKey) {
        if (this.extended.width !== pixelWidth) this.extended.width = pixelWidth;
        if (this.extended.height !== pixelHeight) this.extended.height = pixelHeight;
        const ctx = this.extendedContext, source = this.background;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Clamp-extend the scene beyond the viewport. Full root surfaces stay
        // painted while native scrolling temporarily outruns JavaScript.
        const columns = [[0, 1, 0, -left], [0, source.width, -left, this.width],
          [source.width - 1, 1, this.width - left, right - this.width]];
        const rows = [[0, 1, 0, -top], [0, source.height, -top, this.height],
          [source.height - 1, 1, this.height - top, bottom - this.height]];
        for (const [sx, sw, dx, dw] of columns) for (const [sy, sh, dy, dh] of rows)
          if (dw > 0 && dh > 0) ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
        this.uploadBackground(this.extended);
        this.sourceKey = key;
      }
      return { left: bounds.left + left, top: bounds.top + top, width, height, dpr, roots, sceneBounds: bounds };
    }
    presentAttachedFrame(view, sceneOnly = false) {
      if (sceneOnly) {
        const bounds = view.sceneBounds;
        this.backdropContext.drawImage(this.canvas, (bounds.left - view.left) * view.dpr,
          (bounds.top - view.top) * view.dpr, this.width * view.dpr, this.height * view.dpr,
          0, 0, this.backdrop.width, this.backdrop.height);
        return;
      }
      for (const { surface, rect } of view.roots) {
        let layer = this.layers.get(surface);
        if (!layer) {
          const canvas = document.createElement('canvas');
          canvas.className = 'glass-presentation'; canvas.setAttribute('aria-hidden', 'true');
          surface.append(canvas);
          layer = { canvas, ctx: canvas.getContext('2d') }; this.layers.set(surface, layer);
        }
        const width = Math.max(1, Math.round(rect.width * view.dpr)), height = Math.max(1, Math.round(rect.height * view.dpr));
        if (layer.canvas.width !== width) layer.canvas.width = width;
        if (layer.canvas.height !== height) layer.canvas.height = height;
        layer.ctx.clearRect(0, 0, width, height);
        layer.ctx.drawImage(this.canvas, (rect.left - view.left) * view.dpr, (rect.top - view.top) * view.dpr,
          rect.width * view.dpr, rect.height * view.dpr, 0, 0, width, height);
      }
      for (const [surface, layer] of this.layers) if (!view.roots.some(item => item.surface === surface)) {
        layer.canvas.remove(); this.layers.delete(surface);
      }
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
      const profile = state.profile?.kind === "hyperbolic" ? state.profile : null;
      const bounds = this.element.getBoundingClientRect();
      const surfaces = [...(this.options.getSurfaces?.() || this.element.querySelectorAll('.glass-surface'))]
        .map(surface => ({ surface, rect: surface.getBoundingClientRect() }));
      const view = this.backdrop ? this.prepareAttachedFrame(bounds, surfaces, m)
        : { left: bounds.left, top: bounds.top, dpr: this.dpr };
      if (this.failed) return;
      gl.useProgram(this.program);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(u.texture, 0);
      // Use exact buffer/CSS scaling to keep sampling aligned at fractional DPRs.
      gl.uniform2f(
        u.resolution,
        this.canvas.width / view.dpr,
        this.canvas.height / view.dpr,
      );
      gl.uniform1f(u.dpr, view.dpr);
      gl.uniform1f(u.dark, state.dark ? 1 : 0);
      gl.uniform1f(u.invert, state.invertedTint ? 1 : 0);
      gl.uniform1f(
        u.profile,
        profile ? 3 : ({ bevel: 0, rounded: 1, soft: 2 }[state.edgeProfile] ?? 2),
      );
      gl.uniform4f(u.curve, profile?.shoulder ?? 1, profile?.edge ?? 0.18,
        profile?.bias ?? 0.438, profile?.exponent ?? 3);
      gl.uniform2f(u.section, profile?.front ?? 0.5, profile?.sceneDistance ?? 384);
      gl.uniform1f(u.enabled, state.refraction === false ? 0 : 1);
      gl.uniform2f(u.light, this.light[0] + bounds.left - view.left, this.light[1] + bounds.top - view.top);
      const lens = state.lens;
      gl.uniform4f(u.lens, 0, 0, 1, 0);
      let input = this.sourceTexture;
      let passOffset = 0;
      // Warp the scene once before compositing glass, never the DOM or hit targets.
      if (lens && Math.abs(lens.strength) > 0) {
        const target = this.targets[0];
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.bindTexture(gl.TEXTURE_2D, input);
        gl.uniform4f(u.rect, 0, 0, -1, 0);
        gl.uniform4f(u.lens, lens.x + bounds.left - view.left, lens.y + bounds.top - view.top, lens.radius, lens.strength);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        input = target.texture;
        passOffset = 1;
        gl.uniform4f(u.lens, 0, 0, 1, 0);
      }
      const backdropKey = `${this.sourceVersion}/${lens?.x}/${lens?.y}/${lens?.radius}/${lens?.strength}`;
      if (this.backdrop && !this.options.hideBackdrop && this.backdropKey !== backdropKey) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, input);
        gl.uniform4f(u.rect, 0, 0, -1, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.presentAttachedFrame(view, true);
        this.backdropKey = backdropKey;
      }
      // Ping-pong buffers ensure each button refracts the already-rendered parent glass.
      // Seed both targets once. After each draw they differ only in that draw's
      // rectangle, so copying that rectangle synchronizes the next destination.
      const partial = this.options.scissorSurfaces && !passOffset;
      const clip = rect => {
        const x = Math.max(0, Math.floor((rect.left - view.left - 3) * view.dpr));
        const y = Math.max(0, this.canvas.height - Math.ceil((rect.bottom - view.top + 3) * view.dpr));
        const right = Math.min(this.canvas.width, Math.ceil((rect.right - view.left + 3) * view.dpr));
        const top = Math.min(this.canvas.height, this.canvas.height - Math.floor((rect.top - view.top - 3) * view.dpr));
        gl.scissor(x, y, Math.max(0, right - x), Math.max(0, top - y));
      };
      if (partial) {
        gl.disable(gl.SCISSOR_TEST);
        gl.bindTexture(gl.TEXTURE_2D, input);
        gl.uniform4f(u.rect, 0, 0, -1, 0);
        for (const target of this.targets) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
        gl.enable(gl.SCISSOR_TEST);
      }
      surfaces.forEach(({ surface, rect }, index) => {
        const nested =
            !!surface.parentElement.closest(".glass-surface") ||
            surface.hasAttribute("data-glass-compact");
        const target = this.targets[(index + passOffset) % 2];
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.bindTexture(gl.TEXTURE_2D, input);
        if (partial) {
          if (index) {
            clip(surfaces[index - 1].rect);
            gl.uniform4f(u.rect, 0, 0, -1, 0);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
          }
          clip(rect);
        }
        gl.uniform4f(
          u.rect,
          rect.left - view.left,
          rect.top - view.top,
          rect.width,
          rect.height,
        );
        const scale = rect.width / (surface.offsetWidth || rect.width);
        gl.uniform1f(u.radius, (+surface.dataset.radius || 14) * scale);
        const effects = this.options.getSurfaceEffects?.(surface) || {};
        gl.uniform3f(u.surface, effects.reflection ?? 1, effects.hover ?? 0, effects.interactive ? 1 : 0);
        gl.uniform4f(
          u.material,
          m.ior,
          m.thickness * (profile ? 1 : nested ? 0.42 : 1),
          m.roughness * (nested ? 0.45 : 1),
          m.dispersion,
        );
        gl.uniform1f(u.tint, m.tint * (nested ? 0.65 : 1));
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        input = target.texture;
      });
      if (partial) gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, input);
      gl.uniform4f(u.rect, 0, 0, -1, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (this.backdrop) this.presentAttachedFrame(view);
      this.element.dataset.rendered = "true";
    }
    dispose() {
      cancelAnimationFrame(this.frame);
      this.observer?.disconnect();
      this.failed = true;
      for (const layer of this.layers.values()) layer.canvas.remove();
      this.layers.clear();
      if (!this.gl) return;
      for (const target of this.targets || []) {
        this.gl.deleteTexture(target.texture); this.gl.deleteFramebuffer(target.framebuffer);
      }
      this.gl.deleteTexture(this.sourceTexture); this.gl.deleteBuffer(this.vertexBuffer);
      this.gl.deleteProgram(this.program);
    }
  }

  window.LiquidGlass = Object.freeze({
    Renderer: GlassRenderer,
    softCurve: Object.freeze(softCurve),
  });
})();
