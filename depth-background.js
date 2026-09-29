/* Shared ray/plane glass background for the homepage and Depth Lab. */
"use strict";
(() => {
  const vertex = `attribute vec2 a_position; varying vec2 v_uv; void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`;
  const fragment = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_art;
    uniform vec2 u_resolution, u_camera;
    uniform float u_mode, u_depth, u_shine, u_dark, u_image;
    mat3 rotY(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}
    mat3 rotX(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0.,0.,c,s,0.,-s,c);}
    float box(vec2 p,vec2 h,float r){vec2 q=abs(p)-h+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    vec3 environment(vec2 uv){
      vec3 color=mix(vec3(.70,.74,.82),vec3(.055,.072,.12),u_dark);
      float glow=exp(-length((uv-vec2(.44,.6))*vec2(1.,.85))*2.6);
      color+=mix(vec3(.13,.12,.13),vec3(.09,.075,.15),u_dark)*glow;
      vec2 cells=uv*vec2(45.,32.);vec2 id=floor(cells),f=fract(cells)-.5;
      float stars=(1.-smoothstep(.015,.045,length(f)))*step(.91,hash(id));
      color+=mix(vec3(-.16),vec3(.33,.35,.45),u_dark)*stars;
      return color;
    }
    vec3 art(vec2 uv){
      // Cover-crop the original 2.22:1 illustration into a 1.9:1 slab.
      uv.x=(uv.x-.5)*.86+.5;
      vec3 c=texture2D(u_art,clamp(uv,.002,.998)).rgb;
      c=mix(vec3(.55,.6,.74),c,u_image);
      c=mix(c,vec3(.12,.16,.25),mix(.2,.52,u_dark));
      return c;
    }
    void main(){
      vec2 screen=(v_uv*2.-1.)*vec2(u_resolution.x/u_resolution.y,1.);
      mat3 orbit=rotY(u_camera.x)*rotX(u_camera.y);
      float distance=6.5*max(1.,1.4*u_resolution.y/u_resolution.x);
      vec3 ro=orbit*vec3(0.,0.,distance);
      vec3 rd=orbit*normalize(vec3(screen,-2.05));
      vec3 color=environment(v_uv);
      // A plane of fine orbit lines behind the objects gives a stable depth reference.
      float floorT=(-1.5-ro.z)/rd.z;
      vec2 floorP=(ro+rd*floorT).xy;
      float ring=abs(length(floorP*vec2(.72,1.))-2.5);
      float ring2=abs(length((floorP+vec2(.3,.1))*vec2(.6,1.))-3.2);
      float orbital=exp(-ring*140.)*.10+exp(-ring2*120.)*.05;
      color+=mix(vec3(-1.),vec3(1.),u_dark)*orbital;
      for(int i=0;i<3;i++){
        float fi=float(i);
        // Draw the two outer leaves before the closer middle leaf.
        if(u_mode>2.5)fi=i==0?0.:(i==1?2.:1.);
        if(u_mode<.5 && i>0)continue;
        if(u_mode>1.5 && u_mode<2.5 && i>0)continue;
        vec3 center=vec3(0.,0.,0.);
        vec2 halfSize=vec2(3.85,2.02);
        float yaw=-.08,pitch=.035,roundness=.25,opacity=1.;
        if(u_mode>.5 && u_mode<1.5){
          center=vec3((fi-1.)*.34,(fi-1.)*.20,(fi-1.)*.56);
          halfSize=vec2(3.75-fi*.18,1.97-fi*.07);
          yaw=(fi-1.)*.075;pitch=(fi-1.)*-.04;
          opacity=i==0?1.:.13;
        }
        if(u_mode>1.5 && u_mode<2.5){halfSize=vec2(3.75,2.08);roundness=.9;yaw=0.;pitch=.02;}
        if(u_mode>2.5){
          center=vec3((fi-1.)*2.45,0.,fi == 1.0 ? 0.25 : -0.12);
          halfSize=vec2(1.18,2.10);yaw=(fi-1.)*-.28;pitch=.015;roundness=.18;
        }
        mat3 inverseRotation=rotX(-pitch)*rotY(-yaw);
        vec3 localRo=inverseRotation*(ro-center), localRd=inverseRotation*rd;
        if(localRd.z>=-.02)continue;
        float t=-localRo.z/localRd.z;
        vec3 hit=localRo+localRd*t;
        float d=box(hit.xy,halfSize,roundness);
        float aa=distance/(u_resolution.y*2.05);
        float shadow=exp(-max(d,0.)*11.)*.14;
        if(d>aa){color*=1.-shadow;continue;}
        vec3 previous=color;
        float bevel=1.-smoothstep(0.,.22,-d);
        vec2 gradient=vec2(box(hit.xy+vec2(.001,0.),halfSize,roundness)-box(hit.xy-vec2(.001,0.),halfSize,roundness),box(hit.xy+vec2(0.,.001),halfSize,roundness)-box(hit.xy-vec2(0.,.001),halfSize,roundness));
        vec2 edge=gradient/max(length(gradient),.00001);
        vec2 curvature=vec2(0.);
        if(u_mode>1.5 && u_mode<2.5)curvature=hit.xy/halfSize*.38;
        vec3 normal=normalize(vec3(edge*bevel*1.5+curvature,1.));
        float thickness=.055+u_depth*.006;
        float ior=u_mode>2.5?1.65:1.48;
        vec3 ray=refract(localRd,normal,1./ior);
        vec2 offset=(ray.xy/max(-ray.z,.15)-localRd.xy/max(-localRd.z,.15))*thickness;
        vec2 uv=(hit.xy+offset)/(halfSize*2.)+.5;
        if(u_mode>2.5)uv.x=(fi+uv.x)/3.;
        vec3 transmission=art(uv);
        if(u_mode>2.5){
          vec3 redRay=refract(localRd,normal,1./(ior-.07));
          vec3 blueRay=refract(localRd,normal,1./(ior+.07));
          vec2 redShift=(redRay.xy/max(-redRay.z,.15)-ray.xy/max(-ray.z,.15))*thickness/(halfSize*2.);
          vec2 blueShift=(blueRay.xy/max(-blueRay.z,.15)-ray.xy/max(-ray.z,.15))*thickness/(halfSize*2.);
          transmission.r=art(uv+redShift).r;transmission.b=art(uv+blueShift).b;
        }
        vec3 reflected=reflect(localRd,normal);
        float softbox=exp(-pow((reflected.x+reflected.y*.65-.35)*3.4,2.));
        float strip=exp(-pow((reflected.x-reflected.y*.3+.55)*15.,2.));
        float fresnel=.04+.96*pow(1.-max(dot(-localRd,normal),0.),5.);
        float rim=exp(-abs(d)*110.);
        vec3 lighting=vec3(.82,.88,1.)*(softbox*.19+strip*.13+fresnel*.4+rim*.35)*u_shine;
        if(u_mode>2.5)lighting+=vec3(.18,.07,.25)*bevel*u_shine*.35;
        color=mix(color,transmission,opacity);
        color=mix(color,mix(vec3(.78,.83,.9),vec3(.3,.34,.45),u_dark),.025+fresnel*.08);
        color+=lighting;
        color=mix(previous,color,1.-smoothstep(-aa,aa,d));
      }
      float vignette=smoothstep(.3,1.35,length(v_uv-.5));
      gl_FragColor=vec4(color*(1.-vignette*.16),1.);
    }
  `;

  function createRenderer({ onChange = () => {}, onImageError = () => {} } = {}) {
    const image = new Image();
    const backgroundCanvas = document.createElement("canvas");
    let gl, program, uniforms, texture, backgroundReady = false;
    let backgroundFailed = false, imageReady = false, contextLost = false;
    let state, camera, sceneKey = "";
    function failBackground() { backgroundFailed = true; sceneKey = ""; }
    function initializeBackground() {
      try {
        gl = backgroundCanvas.getContext("webgl", { alpha: false, antialias: false, preserveDrawingBuffer: true });
        if (!gl) throw new Error("WebGL unavailable");
        const compile = (type, source) => {
          const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
          return shader;
        };
        const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
        program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
        gl.deleteShader(vs); gl.deleteShader(fs);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
        gl.useProgram(program);
        const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, "a_position"); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        uniforms = Object.fromEntries(["art","resolution","camera","mode","depth","shine","dark","image"].map(name => [name,gl.getUniformLocation(program,`u_${name}`)]));
        texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([130,145,175,255]));
        if (imageReady) uploadImage();
        backgroundReady = true; backgroundFailed = false;
      } catch (error) {
        console.warn("Depth background unavailable:", error.message);
        failBackground();
      }
    }
    function uploadImage() { gl.bindTexture(gl.TEXTURE_2D,texture); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image); }
    function paintBackground(ctx, width, height) {
      if (backgroundReady && !backgroundFailed && !contextLost) {
        const key = [width,height,window.devicePixelRatio,state.mode,state.tilt,state.depth,state.shine,state.dark,camera.x,camera.y,imageReady].join('/');
        if (key === sceneKey) { ctx.drawImage(backgroundCanvas,0,0,width,height); return; }
        sceneKey = key;
        const ratio = Math.min(1.4, window.devicePixelRatio || 1, Math.sqrt(1200000/(width*height)));
        const w=Math.round(width*ratio),h=Math.round(height*ratio);
        if(backgroundCanvas.width!==w||backgroundCanvas.height!==h){backgroundCanvas.width=w;backgroundCanvas.height=h;}
        gl.viewport(0,0,w,h); gl.useProgram(program); gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.uniform1i(uniforms.art,0);gl.uniform2f(uniforms.resolution,w,h);
        const radians=state.tilt*Math.PI/180;
        gl.uniform2f(uniforms.camera,camera.x*radians,camera.y*radians);
        gl.uniform1f(uniforms.mode,state.mode);gl.uniform1f(uniforms.depth,state.depth);
        gl.uniform1f(uniforms.shine,state.shine/100);gl.uniform1f(uniforms.dark,state.dark?1:0);gl.uniform1f(uniforms.image,imageReady?1:0);
        gl.drawArrays(gl.TRIANGLES,0,6);
        ctx.drawImage(backgroundCanvas,0,0,width,height);
      } else {
        ctx.fillStyle=state.dark?"#242a40":"#bec5d4";ctx.fillRect(0,0,width,height);
        if(imageReady){const scale=Math.max(width/image.width,height/image.height);ctx.globalAlpha=.5;ctx.drawImage(image,(width-image.width*scale)/2,(height-image.height*scale)/2,image.width*scale,image.height*scale);ctx.globalAlpha=1;}
      }
    }
    initializeBackground();
    image.onload = () => {
      imageReady = true;
      if (backgroundReady && !contextLost && !backgroundFailed) {
        try { uploadImage(); } catch { failBackground(); }
      }
      sceneKey = "";
      onChange();
    };
    image.onerror = () => { onImageError(); onChange(); };
    image.src = "bg.jpg";
    backgroundCanvas.addEventListener("webglcontextlost", event => {
      event.preventDefault(); contextLost = true; failBackground(); onChange();
    });
    backgroundCanvas.addEventListener("webglcontextrestored", () => {
      contextLost = false; sceneKey = ""; initializeBackground(); onChange();
    });
    return {
      get failed() { return backgroundFailed; },
      paint(ctx, width, height, settings, view) {
        state = settings; camera = view; paintBackground(ctx, width, height);
      },
    };
  }
  window.DepthBackground = { createRenderer };
})();
