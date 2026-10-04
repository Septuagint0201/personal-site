// Same C2 shoulder, IOR and dispersion as the approved Candy glass preset.
// The texture is the live render immediately behind these DOM controls.
const vertex = `attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}`;
const fragment = `precision highp float;
uniform sampler2D scene;
uniform vec2 resolution, cssSize, direction, light;
uniform vec4 bounds, sourceRect;
uniform float hover, pressed;
float triangle(vec2 p){
  vec2 q=vec2(dot(p,vec2(direction.y,-direction.x)),dot(p,direction));
  float r=min(cssSize.x,cssSize.y)*.325;
  q.x=abs(q.x)-r; q.y+=r/1.7320508;
  if(q.x+1.7320508*q.y>0.)q=vec2(q.x-1.7320508*q.y,-1.7320508*q.x-q.y)*.5;
  q.x-=clamp(q.x,-2.*r,0.);
  return -length(q)*sign(q.y)-2.3;
}
vec3 sampleScene(vec2 p){return texture2D(scene,clamp((p-sourceRect.xy)/sourceRect.zw,vec2(.001),vec2(.999))).rgb;}
vec2 ray(vec3 normal,float ior,float depth){vec3 r=refract(vec3(0.,0.,-1.),normal,1./ior);return r.xy/max(abs(r.z),.15)*depth;}
void main(){
  vec2 uv=gl_FragCoord.xy/resolution;
  vec2 local=(uv-.5)*cssSize;
  float d=triangle(local);
  float coverage=1.-smoothstep(-.65,.65,d);
  if(coverage<.001){gl_FragColor=vec4(0.);return;}
  vec2 gradient=normalize(vec2(triangle(local+vec2(.25,0.))-triangle(local-vec2(.25,0.)),triangle(local+vec2(0.,.25))-triangle(local-vec2(0.,.25)))+vec2(.00001));
  float width=min(cssSize.x,cssSize.y)*.21;
  float t=clamp(-d/width,0.,1.);
  float b=.49;
  float q=(1.+b)*t/(t+b),tail=max(1.-q,0.);
  float height=1.-tail*tail*tail;
  float derivative=3.*tail*tail*b*(1.+b)/((t+b)*(t+b));
  float thickness=60.;
  vec3 n=normalize(vec3(gradient*thickness*.82*derivative/width,1.));
  vec2 p=bounds.xy+vec2(uv.x,1.-uv.y)*bounds.zw;
  float depth=thickness*(.18+.82*height);
  vec2 g=ray(n,1.70,depth)*vec2(1.,-1.);
  vec2 r=ray(n,1.58,depth)*vec2(1.,-1.);
  vec2 bl=ray(n,1.82,depth)*vec2(1.,-1.);
  vec3 color=vec3(sampleScene(p+r).r,sampleScene(p+g).g,sampleScene(p+bl).b);
  color=mix(color,vec3(.045,.062,.086),.15);
  float f0=.0672,fresnel=f0+(1.-f0)*pow(1.-n.z,5.);
  vec2 lightDelta=(light-p)*vec2(1.,-1.);
  vec3 lamp=normalize(vec3(lightDelta*.004,.9));
  float sheen=pow(max(dot(n,normalize(lamp+vec3(0.,0.,1.))),0.),42.);
  float rim=exp(-abs(d+.85)*1.35);
  float directional=.32+.68*max(dot(gradient,normalize(lightDelta+vec2(.01))),0.);
  color+=vec3(.96,.99,1.)*(fresnel*.28+sheen*(.18+hover*.12)+rim*directional*(.40+hover*.2));
  color-=tail*tail*tail*(1.-directional)*.1;
  color+=hover*.04+pressed*.025;
  gl_FragColor=vec4(color,coverage);
}`;

export function createGlassArrows({
  source,
  buttons = [],
  reducedMotion = false,
  onInvalidate,
} = {}) {
  const bufferCanvas = document.createElement("canvas");
  const gl = bufferCanvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false,
  });
  const entries = buttons
    .map((element) => ({
      element,
      canvas: element.querySelector(".arrow-glass"),
      hover: 0,
      pressed: 0,
    }))
    .filter((e) => e.canvas);
  const noop = { render() {}, setReducedMotion() {}, dispose() {} };
  if (!gl || !entries.length) return noop;
  let program,
    buffer,
    texture,
    uniforms,
    disposed = false,
    failed = false;
  const pointer = { x: innerWidth * 0.25, y: 0 };
  const cleanups = [];
  function listen(target, type, callback) {
    const handler = (event) => {
      callback(event);
      onInvalidate?.();
    };
    target.addEventListener(type, handler, { passive: true });
    cleanups.push(() => target.removeEventListener(type, handler));
  }
  function initialize() {
    const compile = (type, text) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, vertex),
      fs = compile(gl.FRAGMENT_SHADER, fragment);
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    uniforms = Object.fromEntries(
      [
        "scene",
        "resolution",
        "cssSize",
        "direction",
        "light",
        "bounds",
        "sourceRect",
        "hover",
        "pressed",
      ].map((k) => [k, gl.getUniformLocation(program, k)]),
    );
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(uniforms.scene, 0);
    entries.forEach((e) => {
      e.context = e.canvas.getContext("2d");
      e.element.classList.add("has-refracted-glass");
    });
    failed = false;
  }
  try {
    initialize();
  } catch (error) {
    console.warn("YARD triangle glass fallback:", error.message);
    return noop;
  }
  entries.forEach((e) => {
    listen(e.element, "pointerenter", () => {
      e.hover = 1;
    });
    listen(e.element, "pointerleave", () => {
      e.hover = e.pressed = 0;
    });
    listen(e.element, "pointerdown", () => {
      e.pressed = 1;
    });
    listen(e.element, "pointerup", () => {
      e.pressed = 0;
    });
    listen(e.element, "pointercancel", () => {
      e.pressed = 0;
    });
    listen(e.element, "focus", () => {
      e.hover = 1;
    });
    listen(e.element, "blur", () => {
      e.hover = e.pressed = 0;
    });
  });
  listen(window, "pointermove", (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  });
  function fallback() {
    failed = true;
    entries.forEach((e) => e.element.classList.remove("has-refracted-glass"));
  }
  const lost = (event) => {
    event.preventDefault();
    fallback();
  };
  bufferCanvas.addEventListener("webglcontextlost", lost);
  const restored = () => {
    try {
      initialize();
    } catch {
      fallback();
    }
  };
  bufferCanvas.addEventListener("webglcontextrestored", restored);
  return {
    render() {
      if (disposed || failed || document.hidden) return;
      const value = typeof source === "function" ? source() : source;
      const canvas = value?.canvas || value;
      if (!canvas?.width || !canvas?.height) return;
      const rect = value?.rect || canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      try {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // Texture row 0 is the DOM image's top row; source sampling uses CSS Y-down.
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          canvas,
        );
        gl.useProgram(program);
        gl.uniform4f(
          uniforms.sourceRect,
          rect.left,
          rect.top,
          rect.width,
          rect.height,
        );
        gl.uniform2f(uniforms.light, pointer.x, pointer.y);
        for (const e of entries) {
          const b = e.element.getBoundingClientRect();
          if (!b.width || !b.height || !e.context) continue;
          const ratio = Math.min(devicePixelRatio || 1, 2),
            w = Math.round(b.width * ratio),
            h = Math.round(b.height * ratio);
          if (bufferCanvas.width !== w || bufferCanvas.height !== h) {
            bufferCanvas.width = w;
            bufferCanvas.height = h;
          }
          if (e.canvas.width !== w || e.canvas.height !== h) {
            e.canvas.width = w;
            e.canvas.height = h;
          }
          gl.viewport(0, 0, w, h);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.uniform2f(uniforms.resolution, w, h);
          gl.uniform2f(uniforms.cssSize, b.width, b.height);
          gl.uniform4f(uniforms.bounds, b.left, b.top, b.width, b.height);
          const d = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] }[
            e.element.dataset.direction
          ] || [0, 1];
          gl.uniform2f(uniforms.direction, ...d);
          gl.uniform1f(uniforms.hover, e.hover);
          gl.uniform1f(uniforms.pressed, e.pressed);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          e.context.clearRect(0, 0, w, h);
          e.context.drawImage(bufferCanvas, 0, 0, w, h);
        }
      } catch (error) {
        fallback();
        console.warn("YARD triangle glass fallback:", error.message);
      }
    },
    setReducedMotion(value) {
      reducedMotion = Boolean(value);
    },
    dispose() {
      disposed = true;
      cleanups.forEach((fn) => fn());
      bufferCanvas.removeEventListener("webglcontextlost", lost);
      bufferCanvas.removeEventListener("webglcontextrestored", restored);
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
      gl.deleteTexture(texture);
      entries.forEach((e) => e.element.classList.remove("has-refracted-glass"));
    },
  };
}
