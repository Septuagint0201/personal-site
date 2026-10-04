// Each study is compiled separately. Keeping the distance field out of a dynamic
// three-way branch makes the optical path much smaller for ANGLE to compile.
export const vertexSource = `#version 300 es
in vec2 position;
void main(){gl_Position=vec4(position,0.,1.);}`;

const fields = [
  `float glassField(vec3 p){
    float t=time*(.10+flow*.26);
    p.xz=rot(.38*p.y+.16*sin(t)) * p.xz;
    p.x+=.12*sin(p.y*2.1-t);
    // A folded, tapered shell with two carved negative spaces. This is a solid
    // glass wall, not a thin transparent skin.
    float d=ellipsoid(p,vec3(1.10,1.64,.63));
    vec3 hollow=p-vec3(.08,.18,.28);
    hollow.xy=rot(-.30)*hollow.xy;
    d=smax(d,-ellipsoid(hollow,vec3(.64,1.05,.80)),.16);
    vec3 lip=p-vec3(-.58,-.67,-.18);
    lip.xy=rot(.49)*lip.xy;
    d=smin(d,ellipsoid(lip,vec3(.55,.95,.32)),.21);
    vec3 cut=p-vec3(-.55,-.55,.14);
    cut.xy=rot(.48)*cut.xy;
    d=smax(d,-ellipsoid(cut,vec3(.21,.58,.72)),.08);
    vec3 fin=p-vec3(.76,.30,-.15);
    fin.xy=rot(-.45)*fin.xy;
    d=smin(d,ellipsoid(fin,vec3(.26,.94,.26)),.17);
    return (d+ripple*.008*sin(length(p)*12.-time*8.))*.72;
  }`,
  `float glassField(vec3 p){
    float t=time*(.08+flow*.22);
    float segment=clamp(round((p.z+.5)/1.18),-4.,2.);
    vec3 q=p; q.z-=segment*1.18-.5;
    q.xy=rot(.055*sin(segment*.9+t))*q.xy;
    q.x+=.055*sin(q.y*2.+segment*.8+t);
    float y=clamp(q.y,-1.62,2.0);
    float shoulder=pow(max(0.,(2.0-y)/3.62),.57);
    float bow=1.58*shoulder+.12*sin(y*1.7+t+segment*.4);
    float thickness=.145+.045*sin(y*1.4+segment+t);
    float d=length(vec2(abs(q.x)-bow,q.z)) - thickness;
    d=max(d,max(q.y-2.06,-1.66-q.y));
    // Thin glass sails join each pair of ribs at the crown.
    vec3 sail=q-vec3(0.,1.64,0.);
    float crest=ellipsoid(sail,vec3(.60,.50,.11));
    d=smin(d,crest,.11);
    return (d+ripple*.012*sin(q.y*17.-time*7.+segment))*.72;
  }`,
  `float glassField(vec3 p){
    float t=time*(.12+flow*.42);
    p.xz=rot(-.23)*p.xz;
    float layer=clamp(round(p.z/.54),-1.,1.);
    vec3 q=p; q.z-=layer*.54;
    float wave=.105*sin(q.x*4.1+t*1.8+layer)+.04*sin(q.x*10.-t+q.y*.9);
    q.z-=wave+.11*sin(q.y*1.6+t*.8+layer*1.7);
    q.x+=.13*sin(q.y*1.3-t*.45+layer);
    float width=1.20+.20*sin(q.y*1.6+layer*.7+t*.35);
    float top=1.47+.13*sin(q.x*3.2+layer+t*.7);
    float sheet=box(q-vec3(0.,-.03,0.),vec3(width,1.48,.044))-.031;
    sheet=max(sheet,q.y-top);
    // Scalloped, fluid lower edges separate into thick fluted streams.
    float channel=.017*cos(q.x*11.+.6*sin(q.y*2.+t));
    sheet+=channel*clamp((.8-q.y)*.35,0.,.8);
    vec3 pool=p-vec3(0.,-1.64,0.);
    pool.y-=.009*sin(length(pool.xz)*10.-t*3.);
    float basin=ellipsoid(pool,vec3(1.85,.13,1.42));
    float d=smin(sheet,basin,.14);
    return (d+ripple*.008*sin(length(p.xz)*12.-time*8.))*.67;
  }`,
];

export function fragmentSource(study) {
  return `#version 300 es
precision highp float;
#define STUDY ${study}
out vec4 outColor;
uniform vec2 resolution,orbit;
uniform float distanceToGlass,time,flow,dispersion,ripple,hover,press;
uniform int boundaryLimit;
uniform bool compact;
const float EPS=.0011;
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float smax(float a,float b,float k){return -smin(-a,-b,k);}
float box(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);}
float ellipsoid(vec3 p,vec3 r){float k0=length(p/r),k1=length(p/(r*r));return k0*(k0-1.)/max(k1,.001);}
${fields[study]}
float glass(vec3 p){return glassField(p/(1.+hover*.018-press*.025));}
vec3 normalAt(vec3 p){
  vec2 e=vec2(1.,-1.)*.0012;
  return normalize(e.xyy*glass(p+e.xyy)+e.yyx*glass(p+e.yyx)+e.yxy*glass(p+e.yxy)+e.xxx*glass(p+e.xxx));
}
float rect(vec2 p,vec2 b,float s){vec2 d=abs(p)-b;return 1.-smoothstep(-s,s,max(d.x,d.y));}
float line(float p,float spacing,float width){return 1.-smoothstep(width,width+.006,abs(mod(p+spacing*.5,spacing)-spacing*.5));}
vec3 sky(vec3 rd){
  vec3 c=mix(vec3(.025,.037,.085),vec3(.29,.49,.72),smoothstep(-.05,.75,rd.y));
  float strip=pow(max(0.,dot(rd,normalize(vec3(-.6,.7,.6)))),140.);
  c+=vec3(11.,12.,13.)*strip;
  c+=vec3(4.8,1.8,.50)*pow(max(0.,dot(rd,normalize(vec3(.7,.4,.1)))),95.);
  return c;
}
// A room with real intersection positions gives transmitted rays parallax and
// sharp architectural detail. HDR panels make the polished surfaces legible.
vec3 room(vec3 ro,vec3 rd){
  float nearest=100.; vec3 c=sky(rd); vec3 p;
  if(rd.z<-.001){
    float t=(-9.-ro.z)/rd.z;
    if(t>0. && t<nearest){
      nearest=t;p=ro+rd*t;
      c=mix(vec3(.015,.035,.07),vec3(.10,.19,.32),smoothstep(-2.,4.,p.y));
      float arch=length(vec2(p.x*.29,max(p.y-.15,0.)*.31));
      float opening=(1.-smoothstep(.91,.94,arch))*step(-1.9,p.y);
      c=mix(c,vec3(.13,.36,.55),opening);
      float distant=rect(p.xy-vec2(0.,.6),vec2(1.18,3.2),.018);
      c=mix(c,vec3(.024,.052,.092),distant);
      float inner=rect(p.xy-vec2(.05,.9),vec2(.36,2.65),.012);
      c=mix(c,vec3(2.5,1.55,.63),inner);
      float ribs=line(p.x,.48,.019)*(1.-opening);
      c*=1.-ribs*.6;
      float led=line(p.y,1.18,.01)*rect(p.xy-vec2(0.,1.),vec2(6.,3.),.02);
      c+=vec3(.17,.31,.39)*led;
      c+=vec3(4.2,2.15,.78)*rect(p.xy-vec2(3.30,.8),vec2(.045,3.9),.011);
      c+=vec3(.50,2.1,3.8)*rect(p.xy-vec2(-3.30,.8),vec2(.06,3.9),.011);
    }
  }
  if(abs(rd.x)>.001){
    float side=rd.x>0.?5.4:-5.4;float t=(side-ro.x)/rd.x;
    if(t>0. && t<nearest){
      nearest=t;p=ro+rd*t;
      c=side>0.?vec3(.19,.069,.026):vec3(.022,.087,.18);
      float window=rect(p.zy-vec2(-1.2,1.4),vec2(4.3,2.15),.02);
      float mullion=max(line(p.z,.96,.035),line(p.y,1.5,.025));
      vec3 light=side>0.?vec3(4.8,1.9,.55):vec3(.85,3.1,5.8);
#if STUDY == 1
      light=side>0.?vec3(5.2,1.30,.25):vec3(2.3,3.4,3.9);
#elif STUDY == 2
      light=side>0.?vec3(2.9,1.2,4.9):vec3(.60,3.9,3.1);
#endif
      light*=.22+.78*pow(smoothstep(-.7,3.2,p.y),1.3);
      c=mix(c,light,window*(1.-mullion));
      c=mix(c,vec3(.022,.035,.053),window*mullion);
      c+=vec3(.11,.12,.14)*line(p.y,.23,.01)*(1.-window);
    }
  }
  if(rd.z>.001){
    float t=(9.-ro.z)/rd.z;
    if(t>0. && t<nearest){
      nearest=t;p=ro+rd*t;c=vec3(.07,.11,.18);
      c+=vec3(4.8,5.8,6.9)*rect(p.xy-vec2(-1.6,1.8),vec2(.95,1.65),.03);
      c+=vec3(3.8,2.2,1.)*rect(p.xy-vec2(2.2,1.1),vec2(.28,2.6),.02);
    }
  }
  if(rd.y>.001){
    float t=(4.6-ro.y)/rd.y;
    if(t>0. && t<nearest){
      nearest=t;p=ro+rd*t;c=vec3(.10,.16,.23);
      float panel=rect(p.xz-vec2(-.7,-1.3),vec2(1.1,6.8),.02);
      float beams=line(p.z,1.6,.045);
      c=mix(c,vec3(3.3,4.1,4.9),panel*(1.-beams));
      c+=vec3(5.,3.15,1.15)*rect(p.xz-vec2(2.7,-1.5),vec2(.035,6.8),.014);
    }
  }
  if(rd.y<-.001){
    float t=(-1.96-ro.y)/rd.y;
    if(t>0. && t<nearest){
      p=ro+rd*t;
      c=vec3(.028,.05,.075);
      float vein=pow(.5+.5*sin(p.x*3.+p.z*.8+sin(p.z*1.7)*1.6),24.);
      c+=vec3(.027,.045,.06)*vein;
      float tiles=max(line(p.x,2.2,.009),line(p.z,2.2,.009));c*=1.-tiles*.6;
      float shadow=exp(-dot(p.xz,p.xz)*.26); c*=1.-shadow*.4;
      float bands=pow(max(0.,1.-abs(sin(p.x*3.8+sin(p.z*3.-time*.12)))*3.5),6.);
      c+=vec3(.15,.38,.48)*bands*exp(-length(p.xz)*.28);
      // Polished stone catches the opposing window stripes.
      float reflected=line(p.z/(1.+abs(p.x)*.15),.95,.11);
      c+=mix(vec3(.14,.36,.55),vec3(.44,.22,.075),smoothstep(-3.,3.,p.x))*reflected*.6;
      c+=vec3(.29,.22,.12)*exp(-abs(p.x)*1.7)*exp(-abs(p.z+5.)*.17);
    }
  }
  return max(c,vec3(.001));
}
bool march(vec3 ro,vec3 rd,bool inside,out vec3 p,out float distanceTravelled){
  float t=.006;
  for(int i=0;i<110;i++){
    p=ro+rd*t;
    float d=glass(p)*(inside?-1.:1.);
    if(d<EPS){distanceTravelled=t;return true;}
    t+=max(d,.0015);
    if(t>(inside?5.5:23.))break;
  }
  distanceTravelled=t;return false;
}
vec3 absorption(){
#if STUDY == 0
  return vec3(.27,.065,.035);
#elif STUDY == 1
  return vec3(.09,.16,.29);
#else
  return vec3(.16,.047,.09);
#endif
}
vec3 opticalPath(vec3 start,vec3 direction,vec3 firstNormal,float ior,bool startsInside){
  vec3 result=vec3(0.),weight=vec3(1.);
  vec3 p=start,n=firstNormal,rd=direction;
  bool inside=startsInside;
  for(int bounce=0;bounce<8;bounce++){
    if(bounce>=boundaryLimit)break;
    vec3 facing=inside?-n:n;
    float cosine=clamp(dot(-rd,facing),0.,1.);
    float r0=(ior-1.)/(ior+1.);r0*=r0;
    float fresnel=r0+(1.-r0)*pow(1.-cosine,5.);
    vec3 transmitted=refract(rd,facing,inside?ior:1./ior);
    if(dot(transmitted,transmitted)<.001){
      rd=reflect(rd,facing);
    }else{
      result+=weight*fresnel*room(p,reflect(rd,facing));
      weight*=1.-fresnel;
      rd=normalize(transmitted);inside=!inside;
    }
    vec3 hit;float travelled;
    // Offset along the geometric normal as well as the ray. A ray-only offset
    // self-intersects at grazing angles and produces bright pinprick artifacts.
    vec3 origin=p+(inside?-n:n)*.006+rd*.001;
    if(!march(origin,rd,inside,hit,travelled)){
      result+=weight*room(origin,rd);return result;
    }
    if(inside)weight*=exp(-absorption()*travelled);
    p=hit;n=normalAt(p);
  }
  return result+weight*room(p,rd)*.65;
}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){
  vec2 uv=(gl_FragCoord.xy*2.-resolution)/resolution.y;
  uv.x-=resolution.x/resolution.y*(compact?.01:.29);
  uv.y+=compact?.14:-.17;
  vec3 target=vec3(0.,.0,0.);
#if STUDY == 1
  target=vec3(0.,.05,-1.2);
#endif
  float yaw=orbit.x,pitch=orbit.y;
  vec3 ro=target+distanceToGlass*vec3(sin(yaw)*cos(pitch),sin(pitch),cos(yaw)*cos(pitch));
  vec3 forward=normalize(target-ro),right=normalize(cross(forward,vec3(0.,1.,0.))),up=cross(right,forward);
  vec3 rd=normalize(right*uv.x+up*uv.y+forward*(compact?1.65:2.12));
  vec3 color=room(ro,rd),hit;float travelled;
  bool startsInside=glass(ro)<0.;
  if(march(ro,rd,startsInside,hit,travelled)){
    vec3 n=normalAt(hit);
    float spread=.001+dispersion*.007;
    // The same iterative optical path is evaluated at three wavelengths. It can
    // enter subsequent volumes, and total internal reflection keeps its ray.
    for(int channel=0;channel<3;channel++){
      float ior=1.51+float(channel-1)*spread;
      vec3 spectral=opticalPath(hit,rd,n,ior,startsInside);
      if(startsInside)spectral*=exp(-absorption()*travelled);
      color[channel]=spectral[channel];
    }
    color+=vec3(.08,.17,.22)*hover*pow(1.-abs(dot(n,rd)),2.);
  }
  color=pow(aces(color*.88),vec3(1./2.2));
  float dither=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5;
  outColor=vec4(clamp(color+dither/255.,0.,1.),1.);
}`;
}
