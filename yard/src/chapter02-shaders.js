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
uniform int rodCount,dropCount,lightCount,bounceLimit,edgeSamples;
uniform vec4 drops[16],shapes[16],axes[16],velocities[16];
uniform vec4 lightPositions[8],lightNormals[8],lightTangents[8],lightColors[8];
uniform float clock,effectAge;
uniform vec3 interactionPoint;
uniform float interactionAge;
uniform int interactionKind;
uniform vec4 gatherField;
uniform int effect,selectedDrop;
uniform bool hdr;
const float INF=1000.;
const float EPS=.0002;
struct Hit {float t;vec3 p;vec3 n;int kind;int id;};
// A direction-only offset collapses at glancing angles and can re-hit the same
// surface. Offset to the outgoing side of the geometric normal instead.
vec3 rayOrigin(Hit h,vec3 direction){
 float bias=h.kind==3 && shapes[h.id].w>0.?.0018:.00045;
 return h.p+h.n*(dot(direction,h.n)>=0.?bias:-bias)+direction*EPS;
}
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
 vec3 z=normalize(axes[i].xyz);
 vec3 x=normalize(cross(abs(z.y)<.92?vec3(0.,1.,0.):vec3(1.,0.,0.),z));
 return mat3(x,cross(z,x),z);
}
vec3 dropRadii(int i){return max(vec3(.006),drops[i].w*vec3(shapes[i].x,shapes[i].x*axes[i].w,shapes[i].y)*(1.+shapes[i].z*.025));}
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
 float t=near+EPS;
 for(int step=0;step<52;step++){
  float d=pairDistance(ro+rd*t,i,j);
  if(abs(d)<.00045 && t>EPS)return t;
  t+=max(abs(d)*.72,.0003);
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
float intervalCoverage(float center,float halfSize,float halfFootprint){
 float width=max(halfFootprint,.00001);
 return max(0.,min(center+width,halfSize)-max(center-width,-halfSize))/(2.*width);
}
vec3 filteredWallLight(Hit h,vec3 dx,vec3 dy){
 vec3 emission=vec3(0.);
 for(int i=0;i<8;i++){
  if(i>=lightCount)break;
  vec3 q=h.p-lightPositions[i].xyz,normal=lightNormals[i].xyz;
  if(abs(dot(q,normal))>=.035)continue;
  vec3 tangent=lightTangents[i].xyz,bitangent=cross(normal,tangent);
  vec2 footprint=.5*vec2(abs(dot(dx,tangent))+abs(dot(dy,tangent)),abs(dot(dx,bitangent))+abs(dot(dy,bitangent)));
  float coverage=intervalCoverage(dot(q,tangent),lightNormals[i].w*.5,footprint.x)*intervalCoverage(dot(q,bitangent),lightTangents[i].w*.5,footprint.y);
  emission+=lightColor(i)*coverage;
 }
 return emission;
}
vec3 metalNormalDifferential(Hit h,vec3 dp){
 vec3 segment=rodsB[h.id].xyz-rodsA[h.id].xyz,axis=normalize(segment);
 float along=dot(h.p-rodsA[h.id].xyz,axis);
 if(along>0. && along<length(segment))dp-=axis*dot(dp,axis);
 return (dp-h.n*dot(h.n,dp))/rodsA[h.id].w;
}
void metalRayDifferential(Hit h,vec3 rd,vec3 rayDelta,out vec3 originDelta,out vec3 directionDelta){
 float facing=dot(rd,h.n);
 float denominator=(facing<0.?-1.:1.)*max(abs(facing),.08);
 originDelta=h.t*(rayDelta-rd*dot(rayDelta,h.n)/denominator);
 vec3 normalDelta=metalNormalDifferential(h,originDelta);
 directionDelta=reflect(rayDelta,h.n)-2.*(dot(rd,normalDelta)*h.n+facing*normalDelta);
}
vec3 wallDifferential(Hit h,vec3 rd,vec3 originDelta,vec3 directionDelta){
 vec3 delta=originDelta+h.t*directionDelta;
 float facing=dot(rd,h.n);
 return delta-rd*dot(delta,h.n)/((facing<0.?-1.:1.)*max(abs(facing),.04));
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
 vec3 weight=vec3(1.);
 // Follow both glass interfaces. Jumping an estimated diameter misses the exit
 // normal, so tiny entry changes used to create unrelated bright colour dots.
 for(int bounce=0;bounce<3;bounce++){
  Hit h=intersectScene(ro,rd);
  if(h.kind==4)return weight*vec3(.26,1.15,2.1);
  if(h.kind==1)return weight*max(wallLight(h),diffuseRoom(h));
  if(h.kind==2){rd=reflect(rd,h.n);weight*=vec3(.93,.965,.985);}
  else if(h.kind==3){
   bool leaving=dot(rd,h.n)>0.;vec3 normal=leaving?-h.n:h.n;
   vec3 transmitted=refract(rd,normal,leaving?1.48:1./1.48);
   if(dot(transmitted,transmitted)<.0001)rd=reflect(rd,normal);
   else{rd=normalize(transmitted);weight*=.96;}
  }
  else break;
  ro=rayOrigin(h,rd);
 }
 return weight*vec3(.035,.057,.080);
}
vec3 transport(vec3 ro,vec3 rd,Hit first,float wavelength,out bool touchedGlass){
 vec3 total=vec3(0.),weight=vec3(1.);Hit hit=first;bool inGlass=false;
 touchedGlass=false;
 vec3 originDx=vec3(0.),originDy=vec3(0.),directionDx=vec3(0.),directionDy=vec3(0.);
 if(first.kind==2){
  // Project one pixel through the curved mirror onto its reflected light.
  // This integrates unresolved strip coverage instead of blurring the image.
  float angular=2.*dot(rd,cameraForward)/(1.62*resolution.y);
  metalRayDifferential(first,rd,(cameraRight-rd*dot(rd,cameraRight))*angular,originDx,directionDx);
  metalRayDifferential(first,rd,(cameraUp-rd*dot(rd,cameraUp))*angular,originDy,directionDy);
 }
 float ior=1.47+wavelength*.013;
 for(int bounce=0;bounce<9;bounce++){
  if(bounce>=bounceLimit)break;
  if(inGlass)weight*=exp(-vec3(.09,.026,.017)*min(hit.t,3.));
  if(hit.kind==4){total+=weight*vec3(.26,1.15,2.1);break;}
  if(hit.kind==1){
   vec3 emission;
   if(first.kind==2 && bounce==1)emission=filteredWallLight(hit,wallDifferential(hit,rd,originDx,directionDx),wallDifferential(hit,rd,originDy,directionDy));
   else emission=wallLight(hit);
   if(max(emission.r,max(emission.g,emission.b))>.02){total+=weight*emission;break;}
   total+=weight*diffuseRoom(hit);
   if(hit.p.y<.02 && bounce<2){
    vec3 reflected=reflect(rd,hit.n);
    total+=weight*.12*fastReflection(rayOrigin(hit,reflected),reflected);
   }
   break;
  }
  if(hit.kind==2){weight*=vec3(.93,.965,.985);rd=reflect(rd,hit.n);}
  else if(hit.kind==3){
   touchedGlass=true;
   bool leaving=dot(rd,hit.n)>0.;vec3 normal=leaving?-hit.n:hit.n;
   float f0=pow((ior-1.)/(ior+1.),2.);
   float fresnel=f0+(1.-f0)*pow(1.-clamp(dot(-rd,normal),0.,1.),5.);
   vec3 transmitted=refract(rd,normal,leaving?ior:1./ior);
   if(dot(transmitted,transmitted)<.001){rd=reflect(rd,normal);}
   else{
    vec3 reflected=reflect(rd,normal);
    total+=weight*fresnel*fastReflection(rayOrigin(hit,reflected),reflected);
    weight*=1.-fresnel;rd=normalize(transmitted);inGlass=!leaving;
   }
   if(selectedDrop>=0 && (hit.id==selectedDrop || int(shapes[hit.id].w)-1==selectedDrop))total+=weight*vec3(.015,.08,.12)*pow(1.-abs(dot(rd,normal)),2.);
   if(effect==2)total+=weight*vec3(.008,.024,.034);
  }
  else break;
  ro=rayOrigin(hit,rd);hit=intersectScene(ro,rd);
 }
 return total;
}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
vec3 shadeSample(vec3 rd,Hit first){
 vec3 color;
 if(first.kind==1){color=max(wallLight(first),diffuseRoom(first));}
 else{
  bool touchedGlass=true;color=vec3(0.);
  // Metal-only paths are achromatic. Only trace the remaining wavelengths when
  // the primary path actually encounters glass; reflections stay full RGB.
  for(int channel=0;channel<3;channel++){
   if(channel>0 && !touchedGlass)break;
   bool encountered;
   float wavelength=channel==0?0.:channel==1?-1.:1.;
   vec3 spectral=transport(cameraPosition,rd,first,wavelength,encountered);
   if(channel==0){color=spectral;touchedGlass=encountered;}
   else if(channel==1)color.r=spectral.r;
   else color.b=spectral.b;
  }
 }
 if(effect==3){float g=dot(color,vec3(.2126,.7152,.0722));color=mix(color,vec3(g*.68,g*.9,g*1.25),.65);}
 return color;
}
vec3 cameraRay(vec2 offset){
 vec2 p=((gl_FragCoord.xy+offset)*2.-resolution)/resolution.y;
 return normalize(cameraForward*1.62+cameraRight*p.x+cameraUp*p.y);
}
void main(){
 vec3 rd=cameraRay(jitter);Hit first=intersectScene(cameraPosition,rd);
 vec3 color=shadeSample(rd,first);float material=float(first.kind)*.2;
 // Detect edges in display-referred radiance, including equal-luminance RGB
 // dispersion. Derivatives run before divergent sampling. Smooth interiors and
 // walls retain one ray; all wavelengths share each added subpixel location.
 vec3 visible=aces(color*.9);
 vec3 change=fwidth(visible);
 float contrast=max(change.r,max(change.g,change.b));
 float silhouette=fwidth(material);
 float curvature=length(fwidth(first.n));
 bool edge=contrast>.055 || silhouette>.01 || (first.kind>1 && curvature>.13);
 if(edge){
  for(int sampleIndex=1;sampleIndex<4;sampleIndex++){
   if(sampleIndex>=edgeSamples)break;
   vec2 shift=edgeSamples==2?vec2(.5):sampleIndex==1?vec2(.5,0.):sampleIndex==2?vec2(0.,.5):vec2(.5);
   vec3 ray=cameraRay(fract(jitter+.5+shift)-.5);
   Hit h=intersectScene(cameraPosition,ray);
   color+=shadeSample(ray,h);material+=float(h.kind)*.2;
  }
  color/=float(edgeSamples);material/=float(edgeSamples);
 }
 // Primary-surface accents run once after transport. Keeping this artistic
 // layer outside the recursive optical branches bounds driver compilation.
 if(first.kind==1){
  if(first.id!=1){
   float horizontal=first.id==0?first.p.z:first.p.x;
   float seam=1.-smoothstep(.008,.022,abs(fract(horizontal*.4)-.5));
   float dado=1.-smoothstep(.009,.025,abs(first.p.y-.34));
   color*=1.-seam*.3-dado*.24;
  }
  if(interactionAge<1.5){
   float d=length(first.p-interactionPoint),front=interactionAge*4.2;
   float wave=exp(-pow((d-front)*9.,2.))*pow(max(0.,1.-interactionAge/1.5),2.);
   color+=(interactionKind==2?vec3(.14,.065,.035):vec3(.045,.14,.19))*wave;
  }
  if(first.p.y<.02 && gatherField.w>.001){
   float radius=length(first.p.xz-gatherField.xz);
   float ring=exp(-pow((radius-1.05)*9.,2.))*.022;
   color+=vec3(.2,.72,.9)*(ring+.018*exp(-radius*radius*1.8))*gatherField.w;
  }
 }
 outColor=vec4(hdr?color:pow(aces(color*.85),vec3(1./2.2)),material);
}`;

// Room finishing has its own bounded program, avoiding multiplication of surface
// details through the spectral transport and adaptive sampling call graph.
export const roomSource = traceSource.slice(0, traceSource.indexOf("vec3 transport(")) + `
uniform sampler2D sceneImage;
void main(){
 vec2 uv=gl_FragCoord.xy/resolution;
 vec4 original=texture(sceneImage,uv);
 if(original.a>.205){outColor=original;return;}
 vec2 screen=((gl_FragCoord.xy+jitter)*2.-resolution)/resolution.y;
 vec3 rd=normalize(cameraForward*1.62+cameraRight*screen.x+cameraUp*screen.y);
 Hit first;first.t=INF;first.id=-1;first.kind=1;first.n=vec3(0.);
 for(int axis=0;axis<3;axis++){
  if(abs(rd[axis])<.00001)continue;
  vec3 low=vec3(-5.,0.,-6.),high=vec3(5.,5.,6.);
  float t=((rd[axis]>0.?high[axis]:low[axis])-cameraPosition[axis])/rd[axis];
  if(t>EPS && t<first.t){first.t=t;first.id=axis;first.n=vec3(0.);first.n[axis]=rd[axis]>0.?-1.:1.;}
 }
 first.p=cameraPosition+rd*first.t;
 vec3 color=original.rgb;
 // Room accents operate on HDR radiance; the LDR fallback keeps the traced base.
 if(!hdr){outColor=original;return;}
 if(first.p.y<.02){
  vec3 reflection=reflect(rd,first.n);
  float fresnel=.065+.22*pow(1.-abs(dot(rd,first.n)),5.);
  color+=fresnel*fastReflection(rayOrigin(first,reflection),reflection);
 }
  // Housings are a surface accent; keep their loop out of recursive lighting.
  for(int i=0;i<8;i++){
   if(i>=lightCount)break;
   vec3 q=first.p-lightPositions[i].xyz;
   if(abs(dot(q,lightNormals[i].xyz))>.035)continue;
   vec2 d=abs(vec2(dot(q,lightTangents[i].xyz),dot(q,cross(lightNormals[i].xyz,lightTangents[i].xyz))))-vec2(lightNormals[i].w,lightTangents[i].w)*.5;
   float border=max(d.x,d.y);
   if(border>0.){
    color*=mix(.30,1.,smoothstep(.028,.055,border));
    color+=vec3(.004,.005,.006)*exp(-pow((border-.043)*200.,2.));
   }
  }
  // Local geometric occlusion anchors the framework at its wall/floor contacts.
  // It is intentionally evaluated only on the visible room, outside transport.
  float occlusion=0.;
  for(int i=0;i<32;i++){
   if(i>=rodCount)break;
   vec3 ab=rodsB[i].xyz-rodsA[i].xyz;
   vec3 closest=rodsA[i].xyz+ab*clamp(dot(first.p-rodsA[i].xyz,ab)/dot(ab,ab),0.,1.);
   float distanceToRod=max(0.,length(first.p-closest)-rodsA[i].w);
   occlusion=max(occlusion,exp(-distanceToRod*7.)*.48);
  }
  float corner=first.id==1?min(5.-abs(first.p.x),6.-abs(first.p.z)):min(first.p.y,5.-first.p.y);
  color*=1.-max(occlusion,.26*exp(-max(0.,corner)*3.));

 // Mark the reflective floor separately so moving reflections use short history.
 outColor=vec4(color,first.p.y<.02?.5:original.a);
}`;
export const temporalSource = `#version 300 es
precision highp float;
uniform sampler2D image,previousImage;
uniform vec2 resolution;
uniform float historyWeight,sceneMotion;
out vec4 outColor;
vec3 toYCoCg(vec3 c){return vec3(dot(c,vec3(.25,.5,.25)),c.r*.5-c.b*.5,c.g*.5-(c.r+c.b)*.25);}
vec3 fromYCoCg(vec3 c){return vec3(c.x+c.y-c.z,c.x+c.z,c.x-c.y-c.z);}
void main(){
 vec2 uv=gl_FragCoord.xy/resolution,px=1./resolution;
 vec4 current=texture(image,uv),previous=texture(previousImage,uv);
 vec3 lo=toYCoCg(current.rgb),hi=lo,mean=vec3(0.),moment=vec3(0.);
 float loMaterial=current.a,hiMaterial=current.a;
 for(int y=-1;y<=1;y++){
  for(int x=-1;x<=1;x++){
   vec4 neighbour=texture(image,uv+vec2(float(x),float(y))*px);
   vec3 c=toYCoCg(neighbour.rgb);
   lo=min(lo,c);hi=max(hi,c);mean+=c;moment+=c*c;
   loMaterial=min(loMaterial,neighbour.a);hiMaterial=max(hiMaterial,neighbour.a);
  }
 }
 mean/=9.;vec3 sigma=sqrt(max(vec3(0.),moment/9.-mean*mean));
 // Preserve jittered silhouette coverage when either material remains in the
 // footprint. Exact material equality discarded the very samples AA needs.
 float mismatch=max(loMaterial-previous.a,previous.a-hiMaterial);
 float weight=historyWeight*(1.-smoothstep(.025,.13,mismatch));
 // Static glass can converge fully; moving glass gets a short history because
 // this renderer has no motion-vector reprojection.
 weight*=mix(1.,.58,sceneMotion*smoothstep(.40,.56,hiMaterial));
 // Clip chroma separately from luminance. Independent RGB bounds can retain
 // unrelated saturated histories at refractive highlights.
 vec3 lower=max(lo,mean-sigma*vec3(2.5,1.5,1.5));
 vec3 upper=min(hi,mean+sigma*vec3(2.5,1.5,1.5));
 vec3 old=max(vec3(0.),fromYCoCg(clamp(toYCoCg(previous.rgb),lower,upper)));
 outColor=vec4(mix(current.rgb,old,weight),current.a);
}`;
// A Gaussian downsample chain spreads neighbouring HDR energy continuously.
// Unlike isolated radial taps, it cannot draw a halo of disconnected bright dots.
export const bloomSource = `#version 300 es
precision highp float;
uniform sampler2D image;
uniform vec2 resolution,sourceResolution;
uniform bool prefilter;
out vec4 outColor;
vec3 sampleLight(vec2 uv){
 vec3 c=texture(image,uv).rgb;
 if(prefilter){
  float brightness=max(c.r,max(c.g,c.b));
  float knee=clamp(brightness-.65,0.,1.);
  float contribution=max(brightness-1.15,knee*knee*.5);
  c*=max(0.,contribution)/max(brightness,.0001);
 }
 return c;
}
void main(){
 vec2 uv=gl_FragCoord.xy/resolution,px=1./sourceResolution;
 vec3 c=vec3(0.);
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  float w=(x==0?2.:1.)*(y==0?2.:1.);
  c+=sampleLight(uv+vec2(float(x),float(y))*px)*w;
 }
 outColor=vec4(c/16.,1.);
}`;
export const resolveSource = `#version 300 es
precision highp float;
uniform sampler2D image;
uniform sampler2D bloomNear,bloomMid,bloomWide;
uniform vec2 resolution;
uniform bool hdr;
out vec4 outColor;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
vec3 display(vec3 c){return hdr?pow(aces(max(c,vec3(0.))*.90),vec3(1./2.2)):c;}
void main(){
 vec2 uv=gl_FragCoord.xy/resolution,px=1./resolution;
 vec3 raw=texture(image,uv).rgb;
 vec3 bloom=hdr?(texture(bloomNear,uv).rgb*.075+texture(bloomMid,uv).rgb*.065+texture(bloomWide,uv).rgb*.05):vec3(0.);
 vec3 c=display(raw);
 vec3 a=display(texture(image,uv+vec2(-1.,1.)*px).rgb),b=display(texture(image,uv+px).rgb);
 vec3 d=display(texture(image,uv-px).rgb),e=display(texture(image,uv+vec2(1.,-1.)*px).rgb),luma=vec3(.299,.587,.114);
 float lm=dot(c,luma),la=dot(a,luma),lb=dot(b,luma),ld=dot(d,luma),le=dot(e,luma);
 float lo=min(lm,min(min(la,lb),min(ld,le))),hi=max(lm,max(max(la,lb),max(ld,le)));
 vec2 direction=vec2(-((la+lb)-(ld+le)),(la+ld)-(lb+le));
 direction=clamp(direction/(min(abs(direction.x),abs(direction.y))+max((la+lb+ld+le)*.03125,.0078)),vec2(-7.),vec2(7.))*px;
 vec3 aa=.5*(texture(image,uv-direction/6.).rgb+texture(image,uv+direction/6.).rgb);
 vec3 bb=aa*.5+.25*(texture(image,uv-direction*.5).rgb+texture(image,uv+direction*.5).rgb);
 float l=dot(display(bb),luma);vec3 filtered=hi-lo<.07?raw:((l<lo||l>hi)?aa:bb);
 vec3 final=display(filtered+bloom);
 float vignette=1.-.12*pow(length((uv-.5)*vec2(1.,.8)),1.7);
 outColor=vec4(final*vignette,1.);
}`;
