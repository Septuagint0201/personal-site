// Surface intersections and both glass boundaries are traced in this shader.
// The room is procedural; the animated floor caustics are an artistic light field.
// Light travels through the first glass volume and permits one internal-reflection
// attempt, then samples the procedural room. Other glass volumes are not re-traced.
const vertexSource = `#version 300 es
in vec2 position;
void main(){gl_Position=vec4(position,0.0,1.0);}`;

const fragmentSource = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 resolution;
uniform vec2 orbit;
uniform float distanceToGlass;
uniform float time;
uniform float flow;
uniform float dispersion;
uniform float ripple;
uniform int study;
uniform bool compact;

const float PI=3.14159265359;
const float EPS=.0024;
mat2 rotation(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float box(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);}
float cylinder(vec3 p,vec2 h){vec2 d=abs(vec2(length(p.xz),p.y))-h;return min(max(d.x,d.y),0.)+length(max(d,0.));}

float glass(vec3 p){
  float t=time*(.22+flow*.55);
  if(study==0){
    p.xz=rotation(.2*sin(t*.31))*p.xz;
    float wave=sin(t*.86);
    float d=length(p-vec3(.10,-.40,.02))-.83;
    d=smin(d,length(p-vec3(-.37+.17*sin(t*.7),.52+.24*wave,.06))-.66,.49);
    d=smin(d,length(p-vec3(.37+.24*cos(t*.84),1.01+.26*sin(t*.65),-.13))-.46,.42);
    d=smin(d,length(p-vec3(-.78-.08*cos(t),-.78+.20*sin(t*.93),.13))-.40,.29);
    d=smin(d,length(p-vec3(.90+.10*sin(t*.8),-.38+.40*sin(t*.66),.16))-.30,.24);
    d=min(d,length(p-vec3(-.94,.84+.17*sin(t*.7+1.),.23))-.135);
    d=min(d,length(p-vec3(.82,1.65+.12*sin(t*.82),-.09))-.09);
    d+=.013*(.2+flow)*sin(p.y*10.-t*2.)*sin(p.x*9.+t)*sin(p.z*7.-t);
    return d+ripple*.055*sin(length(p)*15.-time*7.);
  }
  if(study==1){
    vec3 q=p;
    q.xy-=vec2(.10*sin(q.z*.8+t*.55),.07*cos(q.z*.67-t*.6));
    q.xy=rotation(.17*sin(q.z*.42+t*.4))*q.xy;
    float segment=round((q.z+.4)/1.1);
    q.z-=clamp(segment,-5.,2.)*1.1-.4;
    float angle=atan(q.y,q.x);
    float radius=1.28+.12*sin(angle*3.+segment*.7+t*.42);
    float thickness=.17+.04*sin(angle*4.-t+segment);
    float d=length(vec2(length(q.xy)-radius,q.z))-thickness;
    d+=.011*sin(angle*14.+t*1.3+segment*2.);
    return d+ripple*.028*sin(angle*9.-time*6.+segment);
  }
  vec3 q=p;
  q.xz=rotation(-.13)*q.xz;
  float wave=.08*sin(q.x*6.3+t*1.8)+.043*sin(q.y*9.5+t*3.7+q.x*2.);
  q.z-=wave+.12*sin(q.y*1.6+t*.45);
  q.x-=.065*sin(q.y*4.4+t*1.9);
  float sheet=box(q-vec3(0.,.06,0.),vec3(1.15+.07*sin(q.y*5.+t*2.),1.34,.105))-.065;
  vec3 pool=p-vec3(0.,-1.43,.34);
  pool.y-=.033*sin(length(pool.xz)*10.-t*3.)+.012*sin(pool.x*14.+pool.z*7.-t*2.);
  float basin=cylinder(pool,vec2(1.7,.085))-.09;
  float d=smin(sheet,basin,.27);
  d=min(d,length(p-vec3(1.26+.04*sin(t),.78-.30*sin(t*1.4),.11))-.08);
  return d+ripple*.025*sin(length(p.xz)*15.-time*7.);
}

vec3 normalAt(vec3 p){
  vec2 e=vec2(EPS,0.);
  return normalize(vec3(glass(p+e.xyy)-glass(p-e.xyy),glass(p+e.yxy)-glass(p-e.yxy),glass(p+e.yyx)-glass(p-e.yyx)));
}

float rect(vec2 p,vec2 halfSize,float softness){vec2 d=abs(p)-halfSize;return 1.-smoothstep(-softness,softness,max(d.x,d.y));}
vec3 gallery(vec3 ro,vec3 rd){
  vec3 c=mix(vec3(.40,.62,.70),vec3(.84,.90,.83),smoothstep(-.3,.8,rd.y));
  float nearest=100.;
  if(rd.z<-.001){
    float t=(-8.5-ro.z)/rd.z;
    if(t>0. && t<nearest){
      nearest=t;vec3 p=ro+rd*t;
      c=vec3(.78,.80,.71);
      float arch=length(vec2(p.x*.38,max(p.y-.25,0.)*.4));
      float recess=(1.-smoothstep(.95,1.,arch))*step(-1.9,p.y);
      c=mix(c,vec3(.13,.36,.43),recess*.92);
      float flutes=pow(.5+.5*cos(p.x*10.5),18.);
      c*=1.-flutes*.065;
      c=mix(c,vec3(.73,.90,.88),rect(p.xy-vec2(-2.45,.5),vec2(.63,3.6),.025));
      c=mix(c,vec3(1.00,.47,.23),rect(p.xy-vec2(2.35,.6),vec2(.45,3.6),.035));
      c=mix(c,vec3(.37,.57,.73),rect(p.xy-vec2(3.60,.6),vec2(.075,3.6),.018));
      c=mix(c,vec3(.94,.95,.77)*1.9,rect(p.xy-vec2(-.75,.4),vec2(.055,3.6),.012));
      c=mix(c,vec3(.07,.14,.20),rect(p.xy-vec2(1.30,.6),vec2(.06,3.6),.015));
      float slat=1.-smoothstep(.0,.032,abs(fract((p.y+p.x*.12)*.73)-.5));
      c*=1.-slat*.18;
      c+=vec3(.23,.34,.30)*smoothstep(-1.,4.,p.y);
    }
  }
  if(abs(rd.x)>.001){
    float side=rd.x>0.?5.2:-5.2;float t=(side-ro.x)/rd.x;
    if(t>0. && t<nearest){
      nearest=t;vec3 p=ro+rd*t;
      c=side>0.?vec3(.85,.50,.32):vec3(.35,.68,.78);
      float window=rect(p.zy-vec2(-1.0,1.5),vec2(3.3,1.8),.02);
      float frame=step(.95,fract((p.z+4.3)*.53))+step(.94,fract(p.y*.5));
      c=mix(c,vec3(1.25,1.36,1.21),window*(1.-clamp(frame,0.,1.)));
      c=mix(c,vec3(.055,.11,.16),window*clamp(frame,0.,1.)*.9);
    }
  }
  if(rd.y>.001){
    float t=(4.8-ro.y)/rd.y;
    if(t>0. && t<nearest){
      nearest=t;vec3 p=ro+rd*t;c=vec3(.83,.87,.82);
      float light=rect(p.xz-vec2(-1.,-.2),vec2(.42,4.5),.03);
      light+=rect(p.xz-vec2(2.2,-1.),vec2(.20,3.5),.03);
      c+=vec3(2.5,2.8,2.6)*light;
    }
  }
  if(rd.y<-.001){
    float t=(-1.86-ro.y)/rd.y;
    if(t>0. && t<nearest){
      vec3 p=ro+rd*t;nearest=t;
      c=mix(vec3(.66,.78,.73),vec3(.86,.85,.70),smoothstep(-3.,3.,p.x));
      vec2 tile=abs(fract(p.xz*.38+.5)-.5);
      float grout=1.-smoothstep(.008,.016,min(tile.x,tile.y));
      c*=1.-grout*.17;
      float shadow=exp(-dot(p.xz-vec2(.2,.1),p.xz-vec2(.2,.1))*.39);
      c*=1.-shadow*.24;
      float pattern=sin(p.x*5.+sin(p.z*3.+time*.13))*cos(p.z*5.4+sin(p.x*3.1-time*.13));
      float caustic=pow(max(0.,1.-abs(pattern)*4.5),12.)*exp(-length(p.xz)*.26);
      c+=vec3(.12,.27,.23)*caustic;
      c+=vec3(.045,.085,.12)*sin(p.z*.7+p.x*.5);
    }
  }
  float softbox=pow(max(0.,dot(rd,normalize(vec3(-.55,.75,1.)))),90.);
  c+=vec3(2.,2.1,1.85)*softbox;
  return max(c,vec3(.01));
}

bool enterGlass(vec3 ro,vec3 rd,out vec3 hit){
  float travel=.04;
  for(int i=0;i<88;i++){
    vec3 p=ro+rd*travel;float d=glass(p);
    if(d<EPS){hit=p;return true;}
    travel+=max(d*.75,.004);
    if(travel>19.)break;
  }
  return false;
}

bool leaveGlass(vec3 ro,vec3 rd,out vec3 hit,out float thickness){
  float travel=.013;
  for(int i=0;i<44;i++){
    vec3 p=ro+rd*travel;float d=-glass(p);
    if(d<EPS){hit=p;thickness=travel;return true;}
    travel+=max(d*.74,.005);
    if(travel>7.)break;
  }
  hit=ro+rd*travel;thickness=travel;return false;
}

vec3 throughGlass(vec3 p,vec3 incident,vec3 surfaceNormal,float ior){
  vec3 inside=refract(incident,surfaceNormal,1./ior);
  vec3 exitPoint;float thickness;
  if(!leaveGlass(p+inside*.014,inside,exitPoint,thickness))return gallery(p,reflect(incident,surfaceNormal))*.65;
  vec3 exitNormal=normalAt(exitPoint);
  vec3 outgoing=refract(inside,-exitNormal,ior);
  if(dot(outgoing,outgoing)<.01){
    vec3 bounced=reflect(inside,exitNormal);vec3 second;float extra;
    if(leaveGlass(exitPoint+bounced*.014,bounced,second,extra)){
      outgoing=refract(bounced,-normalAt(second),ior);
      exitPoint=second;thickness+=extra;
      if(dot(outgoing,outgoing)<.01)outgoing=reflect(bounced,normalAt(second));
    }else outgoing=bounced;
  }
  vec3 transmission=exp(-vec3(.095,.028,.016)*thickness);
  return gallery(exitPoint+outgoing*.025,normalize(outgoing))*transmission;
}

void main(){
  vec2 uv=(gl_FragCoord.xy*2.-resolution)/resolution.y;
  uv.x-=(resolution.x/resolution.y)*(compact?.015:.29);
  uv.y+=compact?.12:-.03;
  float yaw=orbit.x;float pitch=orbit.y;
  vec3 target=study==1?vec3(0.,0.,-1.1):vec3(0.,0.,0.);
  vec3 ro=target+distanceToGlass*vec3(sin(yaw)*cos(pitch),sin(pitch),cos(yaw)*cos(pitch));
  if(study==1)ro.z+=.3;
  vec3 forward=normalize(target-ro),right=normalize(cross(forward,vec3(0.,1.,0.))),up=cross(right,forward);
  vec3 rd=normalize(right*uv.x+up*uv.y+forward*(compact?1.55:1.95));
  vec3 color=gallery(ro,rd);
  vec3 p;
  if(enterGlass(ro,rd,p)){
    vec3 n=normalAt(p);
    float fresnel=.038+.962*pow(1.-max(0.,dot(-rd,n)),5.);
    vec3 reflection=gallery(p+n*.02,reflect(rd,n));
    float spread=.003+dispersion*.055;
    vec3 red=throughGlass(p,rd,n,1.50-spread);
    vec3 green=throughGlass(p,rd,n,1.50);
    vec3 blue=throughGlass(p,rd,n,1.50+spread);
    vec3 transmitted=vec3(red.r,green.g,blue.b);
    color=mix(transmitted,reflection,fresnel);
    vec3 light=normalize(vec3(-3.,5.,4.));
    float glint=pow(max(0.,dot(reflect(-light,n),-rd)),200.);
    color+=vec3(1.5,1.65,1.7)*glint;
    color+=vec3(.015,.025,.025)*pow(1.-max(0.,dot(-rd,n)),3.);
  }
  color=pow(1.-exp(-color*1.16),vec3(.454545));
  // Deterministic sub-LSB dither avoids banding without temporal flicker.
  float dither=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5;
  outColor=vec4(clamp(color+dither/255.,0.,1.),1.);
}`;

export function createLiquidRenderer(
  canvas,
  { onQuality, onError, onReady } = {},
) {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("WebGL 2 is unavailable.");
  const parallelCompile = gl.getExtension("KHR_parallel_shader_compile");
  let program, buffer, uniforms;
  let shaders = [];
  let programReady = false;
  let compileFailed = false;
  let compileStarted = 0;
  let destroyed = false;
  let ready = false;
  let frame = 0;
  let previous = 0;
  let totalTime = 1.7;
  let lastInteraction = 0;
  let frames = 0;
  let sampleTime = 0;
  let scale = Math.min(window.devicePixelRatio || 1, 0.75);
  let pixelLimit = 450000;
  let ripple = 0;
  let lost = false;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const state = {
    study: 0,
    flow: 0.55,
    dispersion: 0.65,
    paused: reducedMotion.matches,
    yaw: -0.13,
    pitch: 0.06,
    distance: 6.5,
  };

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    // Compile/link status queries can synchronously wait on the driver. Keep them
    // out of startup so the page and its loading UI can paint immediately.
    return shader;
  }
  function initialize() {
    programReady = false;
    compileFailed = false;
    compileStarted = performance.now();
    const vs = compile(gl.VERTEX_SHADER, vertexSource);
    const fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
    shaders = [vs, fs];
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.flush();
    resize();
  }
  function finishProgram() {
    if (
      parallelCompile &&
      !gl.getProgramParameter(program, parallelCompile.COMPLETION_STATUS_KHR)
    ) {
      if (performance.now() - compileStarted > 45000)
        throw new Error(
          "The graphics driver took too long to prepare the glass shader.",
        );
      return false;
    }
    // Without KHR_parallel_shader_compile, validation happens on the first frame,
    // after page startup; supported drivers only reach this after async completion.
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(
        gl.getProgramInfoLog(program) ||
          shaders
            .map((shader) => gl.getShaderInfoLog(shader))
            .filter(Boolean)
            .join("\n") ||
          "The glass shader could not be linked.",
      );
    shaders.forEach((shader) => gl.deleteShader(shader));
    shaders = [];
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
        "resolution",
        "orbit",
        "distanceToGlass",
        "time",
        "flow",
        "dispersion",
        "ripple",
        "study",
        "compact",
      ].map((name) => [name, gl.getUniformLocation(program, name)]),
    );
    gl.disable(gl.DEPTH_TEST);
    gl.viewport(0, 0, canvas.width, canvas.height);
    programReady = true;
    return true;
  }
  function resize() {
    if (destroyed || lost) return;
    const rect = canvas.getBoundingClientRect();
    const bounded = Math.min(
      scale,
      Math.sqrt(pixelLimit / Math.max(1, rect.width * rect.height)),
    );
    const width = Math.max(1, Math.round(rect.width * bounded));
    const height = Math.max(1, Math.round(rect.height * bounded));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    if (programReady) gl.viewport(0, 0, width, height);
    invalidate();
  }
  function draw(now) {
    frame = 0;
    if (destroyed || lost || document.hidden) {
      previous = 0;
      return;
    }
    if (!programReady) {
      try {
        if (!finishProgram()) {
          invalidate();
          return;
        }
      } catch (error) {
        compileFailed = true;
        onError?.(error, false);
        return;
      }
    }
    // Avoid spending extra battery on displays refreshing above 60 Hz.
    if (previous && now - previous < 15.7) {
      invalidate();
      return;
    }
    const dt = previous ? Math.min((now - previous) / 1000, 0.06) : 0;
    previous = now;
    if (!state.paused) {
      totalTime += dt;
      ripple *= Math.exp(-dt * 1.1);
    }
    gl.useProgram(program);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.orbit, state.yaw, state.pitch);
    gl.uniform1f(uniforms.distanceToGlass, state.distance);
    gl.uniform1f(uniforms.time, totalTime);
    gl.uniform1f(uniforms.flow, state.flow);
    gl.uniform1f(uniforms.dispersion, state.dispersion);
    gl.uniform1f(uniforms.ripple, ripple);
    gl.uniform1i(uniforms.study, state.study);
    gl.uniform1i(uniforms.compact, canvas.clientWidth < 601 ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!ready) {
      ready = true;
      onReady?.();
    }
    if (!state.paused) {
      frames++;
      if (!sampleTime) sampleTime = now;
      if (now - sampleTime > 2400 && frames > 8) {
        const fps = (frames * 1000) / (now - sampleTime);
        let next = scale;
        if (fps < 29) next = Math.max(0.42, scale * 0.82);
        else if (fps > 52 && now - lastInteraction > 3000) {
          next = Math.min(1.15, scale + 0.08);
          pixelLimit = Math.min(800000, pixelLimit + 100000);
        }
        if (Math.abs(next - scale) > 0.02) {
          scale = next;
          resize();
        }
        onQuality?.({ fps: Math.round(fps), scale, study: state.study });
        frames = 0;
        sampleTime = now;
      }
    } else {
      frames = 0;
      sampleTime = 0;
    }
    if (!state.paused) invalidate();
    else previous = 0;
  }
  function invalidate() {
    if (!frame && !destroyed && !lost && !compileFailed && !document.hidden)
      frame = requestAnimationFrame(draw);
  }
  function resetCamera() {
    state.yaw = state.study === 1 ? 0.02 : -0.13;
    state.pitch = state.study === 1 ? 0.025 : 0.06;
    state.distance = state.study === 1 ? 6.4 : 6.5;
    invalidate();
  }
  function onVisibility() {
    frames = 0;
    sampleTime = 0;
    previous = 0;
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
    } else invalidate();
  }
  function onLost(event) {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
    frames = 0;
    sampleTime = 0;
    onError?.(
      new Error("The graphics context was interrupted. Restoring the gallery…"),
      true,
    );
  }
  function onRestored() {
    lost = false;
    ready = false;
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
  document.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  invalidate();
  return {
    state,
    select(study) {
      state.study = study;
      resetCamera();
      ripple = 0.0;
      lastInteraction = performance.now();
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
    setPaused(paused) {
      state.paused = paused;
      previous = 0;
      frames = 0;
      sampleTime = 0;
      invalidate();
    },
    orbit(x, y) {
      state.yaw = Math.max(-1.15, Math.min(1.15, state.yaw + x));
      // Keep the camera at least 15 cm above the gallery floor (-1.86).
      const minimumPitch = Math.max(
        -0.4,
        Math.asin(Math.max(-1, -1.71 / state.distance)),
      );
      state.pitch = Math.max(minimumPitch, Math.min(0.55, state.pitch + y));
      lastInteraction = performance.now();
      invalidate();
    },
    zoom(delta) {
      state.distance = Math.max(
        state.study === 1 ? 0.85 : 4.8,
        Math.min(9.5, state.distance + delta),
      );
      const minimumPitch = Math.max(
        -0.4,
        Math.asin(Math.max(-1, -1.71 / state.distance)),
      );
      state.pitch = Math.max(minimumPitch, state.pitch);
      lastInteraction = performance.now();
      invalidate();
    },
    pulse() {
      ripple = 1;
      invalidate();
    },
    reset: resetCamera,
    dispose() {
      destroyed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      gl.deleteBuffer(buffer);
      shaders.forEach((shader) => gl.deleteShader(shader));
      gl.deleteProgram(program);
    },
  };
}
