// Analytic capsule/ellipsoid light transport. Merging pairs alone use a local
// smooth distance field; the rest of the room stays sharp and inexpensive.
export const vertexSource = `#version 300 es
in vec2 position;
void main(){gl_Position=vec4(position,0.,1.);}`;
export const traceSource = `#version 300 es
precision highp float;
precision highp int;
out vec4 outColor;
uniform vec2 resolution,jitter;
uniform vec3 cameraPosition,cameraForward,cameraRight,cameraUp;
uniform vec4 rodsA[32],rodsB[32];
uniform int rodCount,dropCount,lightCount,bounceLimit;
uniform vec4 drops[16],shapes[16],axes[16],velocities[16];
uniform vec4 lightPositions[8],lightNormals[8],lightTangents[8],lightColors[8];
uniform float clock,effectAge;
uniform int effect,selectedDrop;
uniform bool hdr;
const float INF=1000.;
const float EPS=.003;
struct Hit {float t;vec3 p;vec3 n;int kind;int id;};
float sphereCap(vec3 ro,vec3 rd,vec3 center,float radius){
 vec3 oc=ro-center;float b=dot(rd,oc);vec3 closest=oc-rd*b;float h=radius*radius-dot(closest,closest);
 if(h<0.)return INF;
 float t=-b-sqrt(h);if(t>EPS)return t;t=-b+sqrt(h);return t>EPS?t:INF;
}
float capsule(vec3 ro,vec3 rd,vec3 a,vec3 b,float r){
 vec3 ba=b-a,oa=ro-a;float lengthBA=length(ba);vec3 axis=ba/lengthBA;
 float originAxis=dot(oa,axis),rayAxis=dot(rd,axis);
 vec3 perpendicularOrigin=oa-axis*originAxis,perpendicularRay=rd-axis*rayAxis;
 float aa=dot(perpendicularRay,perpendicularRay),bb=dot(perpendicularOrigin,perpendicularRay);
 float nearest=min(sphereCap(ro,rd,a,r),sphereCap(ro,rd,b,r));
 if(aa>.000001){
  float middle=-bb/aa;vec3 closest=perpendicularOrigin+perpendicularRay*middle;
  float h=r*r-dot(closest,closest);
  if(h>=0.){float t=middle-sqrt(h/aa),y=originAxis+t*rayAxis;
   if(t>EPS && y>0. && y<lengthBA)nearest=min(nearest,t);}
 }
 return nearest;
}
vec3 capsuleNormal(vec3 p,vec3 a,vec3 b){vec3 ba=b-a;return normalize(p-a-ba*clamp(dot(p-a,ba)/dot(ba,ba),0.,1.));}
mat3 dropBasis(int i){
 vec3 z=normalize(axes[i].xyz+vec3(0.,0.,.000001));
 vec3 x=normalize(cross(abs(z.y)<.92?vec3(0.,1.,0.):vec3(1.,0.,0.),z));
 return mat3(x,cross(z,x),z);
}
vec3 dropRadii(int i){return max(vec3(.006),drops[i].w*vec3(shapes[i].x,shapes[i].x,shapes[i].y)*(1.+shapes[i].z*.025));}
float ellipsoidHit(vec3 ro,vec3 rd,int i){
 mat3 basis=dropBasis(i);vec3 r=dropRadii(i);
 vec3 o=transpose(basis)*(ro-drops[i].xyz)/r,d=transpose(basis)*rd/r;
 float a=dot(d,d),b=dot(o,d),middle=-b/a;vec3 closest=o+d*middle;float h=1.-dot(closest,closest);
 if(h<0.)return INF;
 float t=middle-sqrt(h/a);if(t>EPS)return t;
 t=middle+sqrt(h/a);return t>EPS?t:INF;
}
vec3 dropNormal(vec3 p,int i){mat3 b=dropBasis(i);vec3 r=dropRadii(i);return normalize(b*(transpose(b)*(p-drops[i].xyz)/(r*r)));}
float dropDistance(vec3 p,int i){vec3 q=transpose(dropBasis(i))*(p-drops[i].xyz),r=dropRadii(i);float k0=length(q/r),k1=length(q/(r*r));return k0*(k0-1.)/max(k1,.0001);}
float pairDistance(vec3 p,int i,int j){
 float a=dropDistance(p,i),b=dropDistance(p,j),k=min(drops[i].w,drops[j].w)*.52;
 float h=clamp(.5+.5*(b-a)/max(k,.001),0.,1.);return mix(b,a,h)-k*h*(1.-h);
}
float pairHit(vec3 ro,vec3 rd,int i,int j,float maximum){
 vec3 center=(drops[i].xyz+drops[j].xyz)*.5;
 float r=length(drops[i].xyz-drops[j].xyz)*.5+max(length(dropRadii(i)),length(dropRadii(j)));
 vec3 o=ro-center;float b=dot(o,rd),c=dot(o,o)-r*r,h=b*b-c;if(h<0.)return INF;
 float near=max(EPS,-b-sqrt(h)),far=min(maximum,-b+sqrt(h));if(far<near)return INF;
 float t=near+.002;
 for(int step=0;step<52;step++){
  float d=pairDistance(ro+rd*t,i,j);
  if(abs(d)<.0012 && t>EPS*1.5)return t;
  t+=max(abs(d)*.72,.001);
  if(t>far)break;
 }
 return INF;
}
vec3 pairNormal(vec3 p,int i,int j){vec2 e=vec2(.0013,0.);return normalize(vec3(pairDistance(p+e.xyy,i,j)-pairDistance(p-e.xyy,i,j),pairDistance(p+e.yxy,i,j)-pairDistance(p-e.yxy,i,j),pairDistance(p+e.yyx,i,j)-pairDistance(p-e.yyx,i,j)));}
Hit intersectScene(vec3 ro,vec3 rd){
 Hit hit;hit.t=INF;hit.kind=0;hit.id=-1;hit.n=vec3(0.,1.,0.);
 vec3 low=vec3(-5.,0.,-6.),high=vec3(5.,5.,6.);
 for(int axis=0;axis<3;axis++){
  if(abs(rd[axis])<.00001)continue;
  float t=((rd[axis]>0.?high[axis]:low[axis])-ro[axis])/rd[axis];
  if(t>EPS && t<hit.t){hit.t=t;hit.n=vec3(0.);hit.n[axis]=rd[axis]>0.?-1.:1.;hit.kind=1;hit.id=axis;}
 }
 for(int i=0;i<32;i++){
  if(i>=rodCount)break;
  float t=capsule(ro,rd,rodsA[i].xyz,rodsB[i].xyz,rodsA[i].w);
  if(t<hit.t){hit.t=t;hit.kind=2;hit.id=i;hit.n=capsuleNormal(ro+rd*t,rodsA[i].xyz,rodsB[i].xyz);}
 }
 for(int i=0;i<16;i++){
  if(i>=dropCount)break;
  int pair=int(shapes[i].w)-1;if(pair>=0 && pair<i)continue;
  float t=pair>=0?pairHit(ro,rd,i,pair,hit.t):ellipsoidHit(ro,rd,i);
  if(t<hit.t){hit.t=t;hit.kind=3;hit.id=i;hit.n=pair>=0?pairNormal(ro+rd*t,i,pair):dropNormal(ro+rd*t,i);}
 }
 if(effect==2 || effect==3){
  for(int i=0;i<16;i++){
   if(i>=dropCount)break;
   vec3 end=effect==2?drops[(i+1)%dropCount].xyz:drops[i].xyz-velocities[i].xyz*2.8;
   if(length(end-drops[i].xyz)<.025)continue;
   float t=capsule(ro,rd,drops[i].xyz,end,effect==2?.006:.012);
   if(t<hit.t){hit.t=t;hit.kind=4;hit.id=i;hit.n=vec3(0.,1.,0.);}
  }
 }
 hit.p=ro+rd*hit.t;return hit;
}
vec3 lightColor(int i){
 vec3 c=lightColors[i].rgb;
 if(effect==1)c=mix(c,.55+.45*cos(vec3(0.,2.,4.)+clock*1.5+float(i)*.7),.58);
 if(effect==3)c=mix(c,vec3(.56,.88,1.),.85);
 return c*lightPositions[i].w;
}
vec3 wallLight(Hit h){
 for(int i=0;i<8;i++){
  if(i>=lightCount)break;
  vec3 q=h.p-lightPositions[i].xyz;
  vec3 tangent=lightTangents[i].xyz,bitangent=cross(lightNormals[i].xyz,tangent);
  if(abs(dot(q,lightNormals[i].xyz))<.035 && abs(dot(q,tangent))<lightNormals[i].w*.5 && abs(dot(q,bitangent))<lightTangents[i].w*.5)return lightColor(i);
 }
 return vec3(0.);
}
vec3 diffuseRoom(Hit h){
 vec3 albedo=h.id==1?vec3(.085,.11,.13):vec3(.043,.067,.084);
 if(h.p.y<.02){
  vec2 q=h.p.xz;float tile=max(1.-smoothstep(.006,.015,abs(fract(q.x*.4)-.5)),1.-smoothstep(.006,.015,abs(fract(q.y*.4)-.5)));
  albedo*=1.-tile*.45;
  albedo+=vec3(.006,.009,.012)*sin(q.x*2.6+sin(q.y*1.7));
 }
 vec3 light=vec3(.024,.039,.061);
 for(int i=0;i<8;i++){
  if(i>=lightCount)break;
  vec3 d=lightPositions[i].xyz-h.p;float distance2=dot(d,d);vec3 direction=normalize(d);
  float area=lightNormals[i].w*lightTangents[i].w;
  float factor=max(0.,dot(h.n,direction))*max(0.,dot(lightNormals[i].xyz,-direction))*area/(distance2+area*1.4);
  light+=lightColor(i)*factor*.72;
 }
 vec3 c=albedo*light;
 // A quiet etched mark becomes a portal only after the visitor approaches it.
 if(h.id==2 && h.p.z< -5.9){
  vec2 q=h.p.xy-vec2(3.85,1.28);
  float line=min(abs(length(q)-.11),min(abs(q.x),abs(q.y))+.014);
  float mark=(1.-smoothstep(.005,.012,line))*step(length(q),.15);
  c+=vec3(.19,.40,.57)*mark*(effect==3?3.5:.30);
 }
 if(effect==2 && h.p.y<.02){
  float rings=pow(max(0.,cos(length(h.p.xz)*6.-clock*.6)),40.);
  c+=vec3(.03,.12,.18)*rings*exp(-length(h.p.xz)*.2);
 }
 return c;
}
vec3 fastReflection(vec3 ro,vec3 rd){
 Hit h=intersectScene(ro,rd);
 if(h.kind==4)return vec3(.26,1.15,2.1);
 if(h.kind==1){vec3 emission=wallLight(h);return max(emission,diffuseRoom(h));}
 if(h.kind==2){
  rd=reflect(rd,h.n);h=intersectScene(h.p+rd*.006,rd);
  if(h.kind==1)return max(wallLight(h),diffuseRoom(h));
 }
 if(h.kind==3){
  vec3 d=refract(rd,dot(rd,h.n)>0.?-h.n:h.n,1./1.48);
  // The reflected branch has a short transport budget; the main path below
  // continues through all glass boundaries and mirror bars.
  vec3 p=h.p+normalize(d)*max(.05,drops[h.id].w*2.1);
  Hit back=intersectScene(p,normalize(d));
  if(back.kind==1)return max(wallLight(back),diffuseRoom(back))*.9;
 }
 return vec3(.035,.057,.080);
}
vec3 transport(vec3 ro,vec3 rd,Hit first,float wavelength){
 vec3 total=vec3(0.),weight=vec3(1.);Hit hit=first;bool inGlass=false;
 float ior=1.47+wavelength*.013;
 for(int bounce=0;bounce<9;bounce++){
  if(bounce>=bounceLimit)break;
  if(inGlass)weight*=exp(-vec3(.09,.026,.017)*min(hit.t,3.));
  if(hit.kind==4){total+=weight*vec3(.26,1.15,2.1);break;}
  if(hit.kind==1){
   vec3 emission=wallLight(hit);
   if(max(emission.r,max(emission.g,emission.b))>.02){total+=weight*emission;break;}
   total+=weight*diffuseRoom(hit);
   if(hit.p.y<.02 && bounce<2){
    total+=weight*.12*fastReflection(hit.p+hit.n*.007,reflect(rd,hit.n));
   }
   break;
  }
  if(hit.kind==2){weight*=vec3(.93,.965,.985);rd=reflect(rd,hit.n);}
  else if(hit.kind==3){
   bool leaving=dot(rd,hit.n)>0.;vec3 normal=leaving?-hit.n:hit.n;
   float f0=pow((ior-1.)/(ior+1.),2.);
   float fresnel=f0+(1.-f0)*pow(1.-clamp(dot(-rd,normal),0.,1.),5.);
   vec3 transmitted=refract(rd,normal,leaving?ior:1./ior);
   if(dot(transmitted,transmitted)<.001){rd=reflect(rd,normal);}
   else{
    total+=weight*fresnel*fastReflection(hit.p+normal*.005,reflect(rd,normal));
    weight*=1.-fresnel;rd=normalize(transmitted);inGlass=!leaving;
   }
   if(selectedDrop>=0 && (hit.id==selectedDrop || int(shapes[hit.id].w)-1==selectedDrop))total+=weight*vec3(.015,.08,.12)*pow(1.-abs(dot(rd,normal)),2.);
   if(effect==2)total+=weight*vec3(.008,.024,.034);
  }
  else break;
  ro=hit.p+rd*.007;hit=intersectScene(ro,rd);
 }
 return total;
}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){
 vec2 p=((gl_FragCoord.xy+jitter)*2.-resolution)/resolution.y;
 vec3 rd=normalize(cameraForward*1.62+cameraRight*p.x+cameraUp*p.y);
 Hit first=intersectScene(cameraPosition,rd);vec3 color;
 if(first.kind==1){color=max(wallLight(first),diffuseRoom(first));}
 else{
  color=vec3(0.);
  for(int channel=0;channel<3;channel++){
   vec3 spectral=transport(cameraPosition,rd,first,float(channel-1));color[channel]=spectral[channel];
  }
 }
 if(effect==3){float g=dot(color,vec3(.2126,.7152,.0722));color=mix(color,vec3(g*.68,g*.9,g*1.25),.65);}
 outColor=vec4(hdr?color:pow(aces(color*.85),vec3(1./2.2)),float(first.kind)*.2);
}`;
export const temporalSource = `#version 300 es
precision highp float;
uniform sampler2D image,previousImage;
uniform vec2 resolution;
uniform float historyWeight;
out vec4 outColor;
void main(){
 vec2 uv=gl_FragCoord.xy/resolution,px=1./resolution;
 vec4 current=texture(image,uv),previous=texture(previousImage,uv);
 vec3 lo=current.rgb,hi=current.rgb;
 for(int i=0;i<4;i++){
  vec2 offset=i==0?vec2(1.,0.):i==1?vec2(-1.,0.):i==2?vec2(0.,1.):vec2(0.,-1.);
  vec3 c=texture(image,uv+offset*px).rgb;lo=min(lo,c);hi=max(hi,c);
 }
 float weight=historyWeight*step(abs(current.a-previous.a),.05);
 // Moving glass uses a short history. Mirror metal integrates the subpixel
 // strip-light highlights; neighbourhood clamping prevents long light ghosts.
 if(current.a>.5)weight*=.25;
 vec3 old=clamp(previous.rgb,lo,hi);
 outColor=vec4(mix(current.rgb,old,weight),current.a);
}`;
export const resolveSource = `#version 300 es
precision highp float;
uniform sampler2D image;
uniform vec2 resolution;
uniform bool hdr;
out vec4 outColor;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
vec3 display(vec3 c){return hdr?pow(aces(max(c,vec3(0.))*.90),vec3(1./2.2)):c;}
void main(){
 vec2 uv=gl_FragCoord.xy/resolution,px=1./resolution;
 vec3 raw=texture(image,uv).rgb,bloom=vec3(0.);
 for(int i=0;i<8;i++){
  float a=float(i)*.78539816;vec2 d=vec2(cos(a),sin(a));
  bloom+=max(vec3(0.),texture(image,uv+d*px*9.).rgb-vec3(1.4))*.016;
  bloom+=max(vec3(0.),texture(image,uv+d*px*23.).rgb-vec3(1.8))*.009;
 }
 vec3 c=display(raw+bloom);
 vec3 a=display(texture(image,uv+vec2(-1.,1.)*px).rgb),b=display(texture(image,uv+px).rgb);
 vec3 d=display(texture(image,uv-px).rgb),e=display(texture(image,uv+vec2(1.,-1.)*px).rgb),luma=vec3(.299,.587,.114);
 float lm=dot(c,luma),la=dot(a,luma),lb=dot(b,luma),ld=dot(d,luma),le=dot(e,luma);
 float lo=min(lm,min(min(la,lb),min(ld,le))),hi=max(lm,max(max(la,lb),max(ld,le)));
 vec2 direction=vec2(-((la+lb)-(ld+le)),(la+ld)-(lb+le));
 direction=clamp(direction/(min(abs(direction.x),abs(direction.y))+max((la+lb+ld+le)*.03125,.0078)),vec2(-7.),vec2(7.))*px;
 vec3 aa=.5*(display(texture(image,uv-direction/6.).rgb)+display(texture(image,uv+direction/6.).rgb));
 vec3 bb=aa*.5+.25*(display(texture(image,uv-direction*.5).rgb)+display(texture(image,uv+direction*.5).rgb));
 float l=dot(bb,luma);vec3 final=hi-lo<.07?c:((l<lo||l>hi)?aa:bb);
 float vignette=1.-.12*pow(length((uv-.5)*vec2(1.,.8)),1.7);
 outColor=vec4(final*vignette,1.);
}`;
