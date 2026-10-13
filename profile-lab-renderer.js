import { dimensions, sampleProfile } from './glass-profile.js';

const vertex = `#version 300 es
in vec2 position;void main(){gl_Position=vec4(position,0.,1.);}`;
const fragment = `#version 300 es
precision highp float;
uniform vec2 resolution;
uniform sampler2D profileMap,sceneMap;
uniform vec4 bodies[2],shapes[2],optics[2];
uniform float slopeBounds[2];
uniform mat3 rotation;
uniform int compareMode,solidMode;
out vec4 color;
int item;
float cross2(vec2 a,vec2 b){return a.x*b.y-a.y*b.x;}
float triangle(vec2 p,vec2 size){
  vec2 a=vec2(-size.x,-size.y),b=vec2(size.x,-size.y),c=vec2(0.,size.y);
  vec2 e0=b-a,e1=c-b,e2=a-c,v0=p-a,v1=p-b,v2=p-c;
  vec2 q0=v0-e0*clamp(dot(v0,e0)/dot(e0,e0),0.,1.);
  vec2 q1=v1-e1*clamp(dot(v1,e1)/dot(e1,e1),0.,1.);
  vec2 q2=v2-e2*clamp(dot(v2,e2)/dot(e2,e2),0.,1.);
  float d=sqrt(min(dot(q0,q0),min(dot(q1,q1),dot(q2,q2))));
  return (cross2(e0,v0)>=0.&&cross2(e1,v1)>=0.&&cross2(e2,v2)>=0.)?-d:d;
}
float distance2(vec2 p){
  vec4 s=shapes[item];vec2 h=s.xy*.5;
  if(s.w>1.5)return triangle(p,max(h-vec2(s.z),vec2(.001)))-s.z;
  if(s.w>.5)return length(p)-h.x;
  vec2 q=abs(p)-h+s.z;
  return length(max(q,0.))+min(max(q.x,q.y),0.)-s.z;
}
float profile(float t){
  float x=clamp(t,0.,1.)*511.;int i=int(floor(x));
  return mix(texelFetch(profileMap,ivec2(i,item),0).r,texelFetch(profileMap,ivec2(min(i+1,511),item),0).r,fract(x));
}
vec3 boundaries(vec3 p){
  float d=distance2(p.xy),height=bodies[item].x*profile(-d/bodies[item].y);
  return vec3(d,p.z-height*bodies[item].w,-height*(1.-bodies[item].w)-p.z);
}
float field(vec3 p){vec3 b=boundaries(p);return max(b.x,max(b.y,b.z));}
float safeField(vec3 p){vec3 b=boundaries(p);b.yz/=slopeBounds[item];return max(b.x,max(b.y,b.z));}
vec3 normalAt(vec3 p){vec2 e=vec2(.0005,0.);return normalize(vec3(field(p+e.xyy)-field(p-e.xyy),field(p+e.yxy)-field(p-e.yxy),field(p+e.yyx)-field(p-e.yyx)));}
bool hit(vec3 origin,vec3 direction,bool exiting,out vec3 point){
  vec3 lower=vec3(-shapes[item].xy*.5-.002,-bodies[item].x*(1.-bodies[item].w)-.002);
  vec3 upper=vec3(shapes[item].xy*.5+.002,bodies[item].x*bodies[item].w+.002);
  vec3 safeDir=mix(vec3(.000001),direction,greaterThan(abs(direction),vec3(.000001)));
  vec3 a=(lower-origin)/safeDir,b=(upper-origin)/safeDir;
  vec3 near=min(a,b),far=max(a,b);
  float t=max(0.,max(near.x,max(near.y,near.z))),end=min(far.x,min(far.y,far.z));
  if(end<t)return false;
  float minimumStep=max(.0005,(end-t)/170.);
  float previous=t;
  for(int i=0;i<192;i++){
    point=origin+direction*t;float d=field(point);
    if((exiting?d>=0.:d<=0.)||abs(d)<.00025){
      float lo=previous,hi=t;
      for(int j=0;j<9;j++){float mid=(lo+hi)*.5;float v=field(origin+direction*mid);if(exiting?v<0.:v>0.)lo=mid;else hi=mid;}
      point=origin+direction*((lo+hi)*.5);return true;
    }
    previous=t;t+=max(minimumStep,min(abs(safeField(point))*.85,.20));
    if(t>end+.001)return false;
  }
  return false;
}
vec3 backdrop(vec3 origin,vec3 ray){
  if(ray.z>=-.015){
    float strip=pow(max(0.,dot(ray,normalize(vec3(-.3,.65,1.)))),18.);
    return mix(vec3(.31,.48,.49),vec3(.95,.97,.89),clamp(ray.y*.5+.5,0.,1.))+strip*.65;
  }
  vec3 p=origin+ray*max(0.,(-2.4-origin.z)/ray.z);
  vec2 uv=clamp(p.xy*.16+.5,.001,.999);
  vec3 c=texture(sceneMap,uv).rgb;
  float blur=optics[item].z*.00065;
  if(blur>0.){c*=.5;c+=(texture(sceneMap,uv+vec2(blur,0)).rgb+texture(sceneMap,uv-vec2(blur,0)).rgb+texture(sceneMap,uv+vec2(0,blur)).rgb+texture(sceneMap,uv-vec2(0,blur)).rgb)*.125;}
  return c;
}
vec3 transmit(vec3 entry,vec3 incoming,vec3 normal,float index){
  vec3 ray=refract(incoming,normal,1./index),origin=entry+ray*.0018;
  for(int bounce=0;bounce<3;bounce++){
    vec3 exitPoint;if(!hit(origin,ray,true,exitPoint))break;
    vec3 n=normalAt(exitPoint),outgoing=refract(ray,-n,index);
    if(dot(outgoing,outgoing)>.001)return backdrop(rotation*exitPoint,rotation*outgoing);
    ray=reflect(ray,n);origin=exitPoint+ray*.0018;
  }
  return backdrop(rotation*origin,rotation*ray);
}
void main(){
  vec2 uv=gl_FragCoord.xy/resolution;
  item=compareMode==1&&uv.x<.5?1:0;
  if(compareMode==1)uv.x=fract(uv.x*2.);
  float aspect=resolution.x/resolution.y/(compareMode==1?2.:1.);
  float span=max(shapes[0].y,shapes[0].x/aspect)*1.25+bodies[0].x*.75;
  if(compareMode==1)span=max(span,max(shapes[1].y,shapes[1].x/aspect)*1.25+bodies[1].x*.75);
  vec3 camera=vec3((uv-.5)*vec2(aspect,1.)*span,4.);
  vec3 origin=transpose(rotation)*camera,ray=transpose(rotation)*vec3(0.,0.,-1.);
  vec3 base=backdrop(camera,vec3(0.,0.,-1.)),entry;
  if(!hit(origin,ray,false,entry)){color=vec4(base,1.);return;}
  vec3 normal=normalAt(entry),n=rotation*normal;
  vec3 light=normalize(vec3(-.45,.75,1.));
  if(solidMode==1){
    vec3 c=vec3(.32,.61,.60)*(.30+.7*max(0.,dot(n,light)));
    c+=pow(max(0.,dot(n,normalize(light+vec3(0.,0.,1.)))),38.)*.4;
    c+=vec3(.20,.12,.045)*max(0.,-n.z);color=vec4(c,1.);return;
  }
  float ior=optics[item].x,dispersion=optics[item].y;
  vec3 red=transmit(entry,ray,normal,max(1.001,ior-dispersion));
  vec3 green=transmit(entry,ray,normal,ior);
  vec3 blue=transmit(entry,ray,normal,ior+dispersion);
  vec3 transmission=vec3(red.r,green.g,blue.b);
  float f0=pow((ior-1.)/(ior+1.),2.),fresnel=f0+(1.-f0)*pow(1.-max(0.,dot(-ray,normal)),5.);
  vec3 reflection=backdrop(rotation*entry,rotation*reflect(ray,normal));
  vec3 c=mix(transmission,reflection,fresnel);
  c+=pow(max(0.,dot(n,normalize(light+vec3(0.,0.,1.)))),100.)*.22;
  color=vec4(c,1.);
}`;

export function createProfileRenderer(canvas, { onReady, onError } = {}) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) throw new Error('WebGL 2 unavailable');
  let program, uniforms, profileTexture, sceneTexture, buffer, vao, frame = 0, disposed = false, lost = false;
  let current, reference, options = {}, yaw = -.34, pitch = .28, profileKey = '', backgroundKey = '';
  const image = new Image(); let photoReady = false;
  const source = document.createElement('canvas'); source.width = source.height = 1024;
  const ctx = source.getContext('2d', { alpha: false });
  function initialize() {
    const compile = (type, text) => { const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s; };
    const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
    program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    vao=gl.createVertexArray();gl.bindVertexArray(vao);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    uniforms=Object.fromEntries(['resolution','profileMap','sceneMap','bodies[0]','shapes[0]','optics[0]','slopeBounds[0]','rotation','compareMode','solidMode'].map(name=>[name,gl.getUniformLocation(program,name)]));
    const texture=filter=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;};
    profileTexture=texture(gl.NEAREST);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,512,2,0,gl.RGBA,gl.FLOAT,null);
    sceneTexture=texture(gl.LINEAR);profileKey=backgroundKey='';lost=false;request();
  }
  function paintScene(mode) {
    const gradient=ctx.createLinearGradient(0,0,1024,1024);gradient.addColorStop(0,'#d5e7e3');gradient.addColorStop(.5,'#f0e9da');gradient.addColorStop(1,'#c4cbdc');ctx.fillStyle=gradient;ctx.fillRect(0,0,1024,1024);
    if(mode==='photo'&&photoReady){const scale=Math.max(1024/image.width,1024/image.height);ctx.drawImage(image,(1024-image.width*scale)/2,(1024-image.height*scale)/2,image.width*scale,image.height*scale);}
    else if(mode==='light'){
      for(let i=0;i<8;i++){ctx.save();ctx.translate(512,512);ctx.rotate(-.45);ctx.fillStyle=['#f6b783','#db788a','#82c4d1','#f8f3d0'][i%4];ctx.shadowBlur=28;ctx.shadowColor=ctx.fillStyle;ctx.fillRect(-800,-580+i*160,1600,22);ctx.restore();}
    }else{
      ctx.lineWidth=1.5;ctx.strokeStyle='#4c696c42';ctx.beginPath();for(let i=0;i<=1024;i+=32){ctx.moveTo(i,0);ctx.lineTo(i,1024);ctx.moveTo(0,i);ctx.lineTo(1024,i);}ctx.stroke();
      ctx.fillStyle='#2e515e';ctx.fillRect(220,0,22,1024);ctx.fillStyle='#efad69';ctx.fillRect(0,635,1024,30);ctx.fillStyle='#e584a0';ctx.beginPath();ctx.arc(680,390,120,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#78b8be';ctx.lineWidth=20;ctx.beginPath();ctx.arc(430,600,150,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='#315662';ctx.font='52px Georgia';ctx.fillText('0123456789',265,520);ctx.font='15px sans-serif';ctx.fillText('SHAPE / MATERIAL / LIGHT',280,555);
    }
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,sceneTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  }
  function render() {
    frame=0;if(disposed||lost||document.hidden||!current)return;
    const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const dpr=Math.min(devicePixelRatio||1,2,Math.sqrt(1200000/(rect.width*rect.height)));
    const width=Math.max(1,Math.round(rect.width*dpr)),height=Math.max(1,Math.round(rect.height*dpr));
    if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
    gl.useProgram(program);gl.bindVertexArray(vao);gl.viewport(0,0,width,height);
    const states=[current,reference],key=JSON.stringify(states);
    if(key!==profileKey){
      const data=new Float32Array(512*2*4),bounds=[];
      states.forEach((state,i)=>{const sampled=sampleProfile(state),d=dimensions(state);data.set(sampled.pixels,i*512*4);bounds.push(Math.sqrt(1+(sampled.maxSlope*state.thickness/d.shoulder*Math.max(state.front,1-state.front))**2));});
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,profileTexture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,512,2,gl.RGBA,gl.FLOAT,data);
      gl.uniform1fv(uniforms['slopeBounds[0]'],bounds);profileKey=key;
    }
    const sceneKey=`${options.background}/${photoReady}`;if(sceneKey!==backgroundKey){paintScene(options.background);backgroundKey=sceneKey;}
    const bodies=[],shapes=[],optics=[];
    for(const state of states){const d=dimensions(state);bodies.push(state.thickness/160,d.shoulder/160,state.edge,state.front);shapes.push(d.width/160,d.height/160,d.radius/160,state.shape==='circle'?1:state.shape==='triangle'?2:0);optics.push(state.ior,state.dispersion,state.roughness,0);}
    const cx=Math.cos(pitch),sx=Math.sin(pitch),cy=Math.cos(yaw),sy=Math.sin(yaw);
    gl.uniformMatrix3fv(uniforms.rotation,false,[cy,0,-sy,sy*sx,cx,cy*sx,sy*cx,-sx,cy*cx]);
    gl.uniform2f(uniforms.resolution,width,height);gl.uniform4fv(uniforms['bodies[0]'],bodies);gl.uniform4fv(uniforms['shapes[0]'],shapes);gl.uniform4fv(uniforms['optics[0]'],optics);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,profileTexture);gl.uniform1i(uniforms.profileMap,0);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,sceneTexture);gl.uniform1i(uniforms.sceneMap,1);
    gl.uniform1i(uniforms.compareMode,options.compare?1:0);gl.uniform1i(uniforms.solidMode,options.view==='solid'?1:0);
    gl.drawArrays(gl.TRIANGLES,0,3);if(canvas.dataset.ready!=='true'){canvas.dataset.ready='true';onReady?.();}
  }
  function request(){if(!frame&&!disposed&&!lost&&!document.hidden)frame=requestAnimationFrame(render);}
  const observer=new ResizeObserver(request);observer.observe(canvas);
  const loss=e=>{e.preventDefault();lost=true;delete canvas.dataset.ready;cancelAnimationFrame(frame);frame=0;onError?.('图形上下文暂时不可用，曲线编辑仍可继续。');};
  const restore=()=>{try{initialize();}catch(error){onError?.(error.message);}};
  const visibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else request();};
  canvas.addEventListener('webglcontextlost',loss);canvas.addEventListener('webglcontextrestored',restore);document.addEventListener('visibilitychange',visibility);
  image.onload=()=>{photoReady=true;request();};image.src='bg.jpg';initialize();
  return { update(state,saved,settings){current=state;reference=saved;options=settings;request();},
    rotate(y,p){yaw=((y+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;pitch=Math.max(-1.45,Math.min(1.45,p));request();},
    get rotation(){return[yaw,pitch];},
    dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();canvas.removeEventListener('webglcontextlost',loss);canvas.removeEventListener('webglcontextrestored',restore);document.removeEventListener('visibilitychange',visibility);image.onload=null;gl.deleteTexture(profileTexture);gl.deleteTexture(sceneTexture);gl.deleteBuffer(buffer);gl.deleteVertexArray(vao);gl.deleteProgram(program);},
  };
}
