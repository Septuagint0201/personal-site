/* Shared ray/plane glass background for the homepage and Depth Lab. */
"use strict";
(() => {
  const vertex = `attribute vec2 a_position; varying vec2 v_uv; void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`;
  const fragment = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_art;
    uniform vec2 u_resolution, u_camera, u_viewport;
    uniform vec4 u_focus;
    uniform float u_mode, u_depth, u_shine, u_dark, u_image, u_composition, u_portrait;
    uniform float u_profileEnabled;
    uniform float u_profileRadius;
    uniform vec4 u_curve; // Shoulder in world units, edge fraction, bias, exponent.
    uniform vec4 u_section; // Total thickness, front share, IOR, dispersion.
    mat3 rotY(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}
    mat3 rotX(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0.,0.,c,s,0.,-s,c);}
    float box(vec2 p,vec2 h,float r){vec2 q=abs(p)-h+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
    vec2 boxNormal(vec2 p,vec2 h,float r){
      vec2 q=abs(p)-h+r,c=max(q,0.);float lengthC=length(c);
      return lengthC>.000001?sign(p)*c/lengthC:(q.x>q.y?vec2(sign(p.x),0.):vec2(0.,sign(p.y)));
    }
    vec2 profileCurve(float d,float width){
      if(-d>=width)return vec2(1.,0.);
      float t=clamp(-d/width,0.,1.),b=u_curve.z,q=(1.+b)*t/(t+b),tail=max(0.,1.-q);
      float h=1.-pow(tail,u_curve.w);
      float derivative=u_curve.w*pow(tail,u_curve.w-1.)*b*(1.+b)/((t+b)*(t+b));
      return vec2(u_curve.y+(1.-u_curve.y)*h,(1.-u_curve.y)*derivative/width);
    }
    vec3 profileBounds(vec3 p,vec2 halfSize,float radius,float width){
      float d=box(p.xy,halfSize,radius),h=u_section.x*profileCurve(d,width).x;
      return vec3(d,p.z-h*u_section.y,-h*(1.-u_section.y)-p.z);
    }
    vec3 profileNormal(vec3 p,vec2 halfSize,float radius,float width){
      vec3 bounds=profileBounds(p,halfSize,radius,width);vec2 outward=boxNormal(p.xy,halfSize,radius);
      if(bounds.x>=max(bounds.y,bounds.z))return vec3(outward,0.);
      float slope=u_section.x*profileCurve(bounds.x,width).y;
      return bounds.y>bounds.z?normalize(vec3(outward*slope*u_section.y,1.))
        :normalize(vec3(outward*slope*(1.-u_section.y),-1.));
    }
    vec2 profileInterval(vec3 origin,vec3 ray,vec2 halfSize){
      vec3 low=vec3(-halfSize-.0001,-u_section.x*(1.-u_section.y)-.0001);
      vec3 high=vec3(halfSize+.0001,u_section.x*u_section.y+.0001);
      vec3 inverse=vec3(1.)/mix(vec3(.0000001),ray,step(vec3(.0000001),abs(ray)));
      vec3 a=(low-origin)*inverse,b=(high-origin)*inverse,near=min(a,b),far=max(a,b);
      return vec2(max(0.,max(near.x,max(near.y,near.z))),min(far.x,min(far.y,far.z)));
    }
    bool profileEntry(vec3 origin,vec3 ray,vec2 halfSize,float radius,float width,out vec3 point){
      vec2 range=profileInterval(origin,ray,halfSize);if(range.y<range.x)return false;
      float slope=u_section.x*(1.-u_curve.y)*u_curve.w*(1.+u_curve.z)/u_curve.z/width*max(u_section.y,1.-u_section.y);
      float bound=sqrt(1.+slope*slope),t=range.x,previous=t;
      float minimumStep=max(.00002,(range.y-range.x)/64.);
      for(int march=0;march<72;march++){
        point=origin+ray*t;vec3 bounds=profileBounds(point,halfSize,radius,width);
        float value=max(bounds.x,max(bounds.y,bounds.z));
        if(value<=.00002){
          float lo=previous,hi=t;
          for(int refine=0;refine<8;refine++){
            float mid=(lo+hi)*.5;vec3 v=profileBounds(origin+ray*mid,halfSize,radius,width);
            if(max(v.x,max(v.y,v.z))>0.)lo=mid;else hi=mid;
          }
          point=origin+ray*((lo+hi)*.5);return true;
        }
        previous=t;
        t+=max(minimumStep,max(bounds.x,max(bounds.y,bounds.z)/bound)*.85);
        if(t>range.y+.0001)return false;
      }
      return false;
    }
    vec3 profileExit(vec3 origin,vec3 ray,vec2 halfSize,float radius,float width){
      // Flat interiors have an exact plane exit, avoiding iterative work there.
      if(abs(ray.z)>.00001){
        float plane=ray.z<0.?-u_section.x*(1.-u_section.y):u_section.x*u_section.y;
        float t=(plane-origin.z)/ray.z;vec3 point=origin+ray*t;
        if(t>=0.&&box(point.xy,halfSize,radius)<=-width)return point;
      }
      float lo=0.,hi=max(.0002,profileInterval(origin,ray,halfSize).y+.0001);
      for(int step=0;step<12;step++){
        float mid=(lo+hi)*.5;vec3 bounds=profileBounds(origin+ray*mid,halfSize,radius,width);
        if(max(bounds.x,max(bounds.y,bounds.z))<=0.)lo=mid;else hi=mid;
      }
      return origin+ray*((lo+hi)*.5);
    }
    vec2 profileSample(vec3 entry,vec3 incoming,vec3 normal,vec2 halfSize,float radius,float width,float ior){
      vec3 ray=refract(incoming,normal,1./max(1.001,ior)),origin=entry+ray*.0002;
      // The artwork remains on its original plane behind each leaf. Subtract
      // the unbent ray so orbiting retains the existing composition and crop.
      float imageZ=-u_section.x*(1.-u_section.y);
      vec2 unbent=entry.xy+incoming.xy*((imageZ-entry.z)/incoming.z);
      for(int bounce=0;bounce<3;bounce++){
        vec3 exitPoint=profileExit(origin,ray,halfSize,radius,width);
        vec3 n=profileNormal(exitPoint,halfSize,radius,width),outgoing=refract(ray,-n,max(1.001,ior));
        if(dot(outgoing,outgoing)>.000001){
          if(outgoing.z>=-.02)return entry.xy;
          float travel=max(0.,(imageZ-exitPoint.z)/outgoing.z);
          return entry.xy+exitPoint.xy+outgoing.xy*travel-unbent;
        }
        ray=reflect(ray,n);origin=exitPoint+ray*.0002;
      }
      return entry.xy;
    }
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    vec3 environment(vec2 uv){
      vec3 color=mix(vec3(.70,.74,.82),vec3(.055,.072,.12),u_dark);
      float glow=exp(-length((uv-vec2(.44,.6))*vec2(1.,.85))*2.6);
      color+=mix(vec3(.13,.12,.13),vec3(.09,.075,.15),u_dark)*glow;
      if(u_composition>.5){
        // Soft, asymmetric illumination gives the approved strata a quieter
        // setting. Only the homepage opts in; the material studies stay fixed.
        vec2 cool=(uv-vec2(.18,.78))*vec2(1.,1.3);
        vec2 warm=(uv-vec2(.85,.22))*vec2(1.2,1.);
        color+=mix(vec3(.018,.035,.040),vec3(.016,.039,.068),u_dark)*exp(-dot(cool,cool)*6.);
        color+=mix(vec3(.044,.020,.027),vec3(.045,.018,.056),u_dark)*exp(-dot(warm,warm)*7.);
      }
      vec2 cells=uv*vec2(45.,32.);vec2 id=floor(cells),f=fract(cells)-.5;
      float stars=(1.-smoothstep(.015,.045,length(f)))*step(.91,hash(id));
      color+=mix(vec3(-.16),vec3(.33,.35,.45),u_dark)*stars;
      return color;
    }
    vec3 art(vec2 uv){
      // Homepage portrait leaves keep the illustration's proportions by cropping it.
      uv.x=(uv.x-.5)*mix(.86,.26,u_portrait)+.5;
      vec3 c=texture2D(u_art,clamp(uv,.002,.998)).rgb;
      c=mix(vec3(.55,.6,.74),c,u_image);
      c=mix(c,vec3(.12,.16,.25),mix(.2,.52,u_dark));
      return c;
    }
    void main(){
      vec2 screen=(v_uv*2.-1.)*vec2(u_resolution.x/u_resolution.y,1.);
      mat3 orbit=rotY(u_camera.x)*rotX(u_camera.y);
      float distance=6.5*max(1.,1.4*u_resolution.y/u_resolution.x);
      distance=mix(distance,7.2,u_portrait);
      vec3 ro=orbit*vec3(0.,0.,distance);
      vec3 rd=orbit*normalize(vec3(screen,-2.05));
      vec3 color=environment(v_uv);
      // A plane of fine orbit lines behind the objects gives a stable depth reference.
      float floorT=(-1.5-ro.z)/rd.z;
      vec2 floorP=(ro+rd*floorT).xy;
      float ring=abs(length(floorP*vec2(.72,1.))-2.5);
      float ring2=abs(length((floorP+vec2(.3,.1))*vec2(.6,1.))-3.2);
      float orbital=exp(-ring*140.)*.10+exp(-ring2*120.)*.05;
      color+=mix(vec3(-1.),vec3(1.),u_dark)*orbital*mix(1.,.55,u_composition);
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
          if(u_composition>.5){
            opacity=i==0?1.:.09;
            center.xy=mix(center.xy,vec2((fi-1.)*.11,(fi-1.)*.16+.04),u_portrait);
            halfSize=mix(halfSize,vec2(1.78-fi*.045,3.12-fi*.08),u_portrait);
          }
        }
        if(u_mode>1.5 && u_mode<2.5){halfSize=vec2(3.75,2.08);roundness=.9;yaw=0.;pitch=.02;}
        if(u_mode>2.5){
          center=vec3((fi-1.)*2.45,0.,fi == 1.0 ? 0.25 : -0.12);
          halfSize=vec2(1.18,2.10);yaw=(fi-1.)*-.28;pitch=.015;roundness=.18;
        }
        if(u_profileEnabled>.5&&u_profileRadius>=0.)roundness=min(u_profileRadius,min(halfSize.x,halfSize.y));
        mat3 inverseRotation=rotX(-pitch)*rotY(-yaw);
        vec3 localRo=inverseRotation*(ro-center), localRd=inverseRotation*rd;
        if(localRd.z>=-.02)continue;
        float t=-localRo.z/localRd.z;
        vec3 hit=localRo+localRd*t;
        float d=box(hit.xy,halfSize,roundness);
        float aa=distance/(u_resolution.y*2.05);
        float shadow=exp(-max(d,0.)*11.)*.14;
        float profileWidth=min(u_curve.x,min(halfSize.x,halfSize.y)*.98);
        if(u_profileEnabled>.5){
          if(!profileEntry(localRo,localRd,halfSize,roundness,profileWidth,hit)){color*=1.-shadow;continue;}
          d=box(hit.xy,halfSize,roundness);
        }else if(d>aa){color*=1.-shadow;continue;}
        vec3 previous=color;
        float bevel=1.-smoothstep(0.,.22,-d);
        vec2 gradient=vec2(box(hit.xy+vec2(.001,0.),halfSize,roundness)-box(hit.xy-vec2(.001,0.),halfSize,roundness),box(hit.xy+vec2(0.,.001),halfSize,roundness)-box(hit.xy-vec2(0.,.001),halfSize,roundness));
        vec2 edge=gradient/max(length(gradient),.00001);
        vec2 curvature=vec2(0.);
        if(u_mode>1.5 && u_mode<2.5)curvature=hit.xy/halfSize*.38;
        vec3 normal=normalize(vec3(edge*bevel*1.5+curvature,1.));
        float thickness=.055+u_depth*.006;
        float ior=u_mode>2.5?1.65:1.48;
        if(u_profileEnabled>.5){
          vec2 profile=profileCurve(d,profileWidth);
          normal=profileNormal(hit,halfSize,roundness,profileWidth);
          thickness=u_section.x*profile.x;bevel=(1.-profile.x)/max(.001,1.-u_curve.y);ior=u_section.z;
        }
        vec3 ray=refract(localRd,normal,1./ior);
        vec2 offset=(ray.xy/max(-ray.z,.15)-localRd.xy/max(-localRd.z,.15))*thickness;
        vec2 uv=(hit.xy+offset)/(halfSize*2.)+.5;
        if(u_profileEnabled>.5)uv=profileSample(hit,localRd,normal,halfSize,roundness,profileWidth,ior)/(halfSize*2.)+.5;
        if(u_mode>2.5)uv.x=(fi+uv.x)/3.;
        vec2 redUv=uv,blueUv=uv;
        if(u_profileEnabled>.5&&u_section.w>0.){
          redUv=profileSample(hit,localRd,normal,halfSize,roundness,profileWidth,ior-u_section.w)/(halfSize*2.)+.5;
          blueUv=profileSample(hit,localRd,normal,halfSize,roundness,profileWidth,ior+u_section.w)/(halfSize*2.)+.5;
          if(u_mode>2.5){redUv.x=(fi+redUv.x)/3.;blueUv.x=(fi+blueUv.x)/3.;}
        }
        vec3 transmission=art(uv);
        if(u_profileEnabled>.5){transmission.r=art(redUv).r;transmission.b=art(blueUv).b;}
        if(u_composition>.5){
          // Small, cached texture softening separates the rear leaves from the profile.
          float recession=1.-fi*.32;
          vec2 soft=vec2(.0035,.006)*recession;
          vec3 diffuse=(art(uv+soft)+art(uv-soft)+art(uv+vec2(soft.x,-soft.y))+art(uv+vec2(-soft.x,soft.y)))*.25;
          if(u_profileEnabled>.5){
            diffuse.r=(art(redUv+soft).r+art(redUv-soft).r+art(redUv+vec2(soft.x,-soft.y)).r+art(redUv+vec2(-soft.x,soft.y)).r)*.25;
            diffuse.b=(art(blueUv+soft).b+art(blueUv-soft).b+art(blueUv+vec2(soft.x,-soft.y)).b+art(blueUv+vec2(-soft.x,soft.y)).b)*.25;
          }
          transmission=mix(transmission,diffuse,.52*recession);
          float luminance=dot(transmission,vec3(.2126,.7152,.0722));
          transmission=mix(transmission,vec3(luminance),.045*recession);
        }
        if(u_mode>2.5&&u_profileEnabled<.5){
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
        lighting*=mix(1.,.4+fi*.15,u_composition);
        color=mix(color,transmission,opacity);
        color=mix(color,mix(vec3(.78,.83,.9),vec3(.3,.34,.45),u_dark),.025+fresnel*.08);
        color+=lighting;
        float coverage=1.-smoothstep(-aa,aa,d);
        if(u_profileEnabled>.5){
          // A forward probe softens tangent silhouette hits while opaque
          // interiors and exposed side faces keep their full coverage.
          float advance=aa*2./max(.05,abs(dot(localRd,normal)));
          vec3 probe=profileBounds(hit+localRd*advance,halfSize,roundness,profileWidth);
          coverage=1.-smoothstep(0.,aa,max(probe.x,max(probe.y,probe.z)));
        }
        color=mix(previous,color,coverage);
      }
      if(u_composition>.5){
        // Keep the central reading area calm without covering the illustration in white.
        vec2 focus=(v_uv-vec2(.5,.51))*vec2(u_resolution.x/u_resolution.y*1.8,1.55);
        float calm=exp(-dot(focus,focus)*3.2);
        vec2 reading=(v_uv-vec2(.5,.51))*u_viewport/vec2(min(230.,u_viewport.x*.46),min(325.,u_viewport.y*.46));
        if(u_focus.z>0.)reading=(vec2(v_uv.x,1.-v_uv.y)*u_viewport-u_focus.xy)/u_focus.zw;
        float readingEdge=pow(pow(abs(reading.x),4.)+pow(abs(reading.y),4.),.25);
        float darkCalm=1.-smoothstep(.85,1.7,readingEdge);
        vec3 tone=mix(vec3(.43,.48,.59),vec3(.075,.105,.18),u_dark);
        color=mix(color,tone,mix(calm*.09,darkCalm*.50,u_dark));
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
        uniforms = Object.fromEntries(["art","resolution","camera","viewport","focus","mode","depth","shine","dark","image","composition","portrait","profileEnabled","profileRadius","curve","section"].map(name => [name,gl.getUniformLocation(program,`u_${name}`)]));
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
      const composition = state.composition === 1 ? 1 : 0;
      const portrait = composition && width < 700 && height > width ? 1 : 0;
      const focus = state.focus;
      const profile = state.profile?.kind === 'hyperbolic' ? state.profile : null;
      const material = state.material;
      if (backgroundReady && !backgroundFailed && !contextLost) {
        const key = [width,height,window.devicePixelRatio,state.maxDpr,state.mode,state.tilt,state.depth,state.shine,state.dark,composition,portrait,camera.x,camera.y,imageReady,focus?.left,focus?.top,focus?.right,focus?.bottom,
          profile?.kind,profile?.shoulder,profile?.edge,profile?.bias,profile?.exponent,profile?.front,profile?.radius,material?.thickness,material?.ior,material?.dispersion].join('/');
        if (key === sceneKey) { ctx.drawImage(backgroundCanvas,0,0,width,height); return; }
        sceneKey = key;
        const ratio = Math.min(state.maxDpr || 1.4, window.devicePixelRatio || 1, Math.sqrt(1200000/(width*height)));
        const w=Math.round(width*ratio),h=Math.round(height*ratio);
        if(backgroundCanvas.width!==w||backgroundCanvas.height!==h){backgroundCanvas.width=w;backgroundCanvas.height=h;}
        gl.viewport(0,0,w,h); gl.useProgram(program); gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.uniform1i(uniforms.art,0);gl.uniform2f(uniforms.resolution,w,h);
        gl.uniform2f(uniforms.viewport,width,height);
        gl.uniform4f(uniforms.focus, focus ? (focus.left+focus.right)*.5 : 0, focus ? (focus.top+focus.bottom)*.5 : 0,
          focus ? Math.max(1,(focus.right-focus.left)*.5) : 0, focus ? Math.max(1,(focus.bottom-focus.top)*.5) : 0);
        const radians=state.tilt*Math.PI/180;
        gl.uniform2f(uniforms.camera,camera.x*radians,camera.y*radians);
        gl.uniform1f(uniforms.mode,state.mode);gl.uniform1f(uniforms.depth,state.depth);
        gl.uniform1f(uniforms.shine,state.shine/100);gl.uniform1f(uniforms.dark,state.dark?1:0);gl.uniform1f(uniforms.image,imageReady?1:0);
        gl.uniform1f(uniforms.composition,composition);gl.uniform1f(uniforms.portrait,portrait);
        // The 3D study and these world-space leaves use 160 CSS px per unit.
        gl.uniform1f(uniforms.profileEnabled,profile&&material?1:0);
        gl.uniform1f(uniforms.profileRadius,Number.isFinite(profile?.radius)?Math.max(0,profile.radius)/160:-1);
        gl.uniform4f(uniforms.curve,(profile?.shoulder??67.68)/160,profile?.edge??.18,profile?.bias??.438,profile?.exponent??3);
        gl.uniform4f(uniforms.section,(material?.thickness??60)/160,profile?.front??.5,material?.ior??1.7,material?.dispersion??.12);
        gl.drawArrays(gl.TRIANGLES,0,6);
        ctx.drawImage(backgroundCanvas,0,0,width,height);
      } else {
        ctx.fillStyle=state.dark?"#242a40":"#bec5d4";ctx.fillRect(0,0,width,height);
        if(imageReady){const scale=Math.max(width/image.width,height/image.height);ctx.globalAlpha=.5;ctx.drawImage(image,(width-image.width*scale)/2,(height-image.height*scale)/2,image.width*scale,image.height*scale);ctx.globalAlpha=1;}
        if(composition){
          const veil=ctx.createRadialGradient(width*.5,height*.51,0,width*.5,height*.51,Math.max(width*.42,height*.58));
          veil.addColorStop(0,state.dark?"rgba(19,27,46,.42)":"rgba(110,122,150,.12)");
          if(state.dark)veil.addColorStop(.3,"rgba(19,27,46,.42)");
          veil.addColorStop(1,state.dark?"rgba(19,27,46,0)":"rgba(110,122,150,0)");
          ctx.fillStyle=veil;ctx.fillRect(0,0,width,height);
        }
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
