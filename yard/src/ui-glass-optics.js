import '../../ui-glass-preset.js';
const { material: m, profile: p, compactRoughness, compactTint } = window.SiteGlassPreset;
const f = value => Number(value).toFixed(8);

// Callers supply their footprint SDF and scene sampler. The closed slab and
// three bounded interface exits match Candy, including a truly planar back.
export const UI_GLASS_GLSL = `
const float uiThickness=${f(m.thickness)},uiIOR=${f(m.ior)},uiDispersion=${f(m.dispersion)};
const float uiShoulder=${f(p.shoulder)},uiEdge=${f(p.edge)},uiBias=${f(p.bias)},uiExponent=${f(p.exponent)};
const float uiFront=${f(p.front)},uiSceneDistance=${f(p.sceneDistance)},uiRadius=${f(p.radius)};
const float uiRoughness=${f(m.roughness)},uiTint=${f(m.tint)};
vec2 uiCurve(float d,float width){
 float t=clamp(-d/width,0.,1.),q=(1.+uiBias)*t/(t+uiBias),tail=max(0.,1.-q);
 return vec2(uiEdge+(1.-uiEdge)*(1.-pow(tail,uiExponent)),
  (1.-uiEdge)*uiExponent*pow(tail,uiExponent-1.)*uiBias*(1.+uiBias)/((t+uiBias)*(t+uiBias))/width);
}
vec2 uiGradient(vec2 p){return normalize(vec2(uiDistance(p+vec2(.03,0.))-uiDistance(p-vec2(.03,0.)),uiDistance(p+vec2(0.,.03))-uiDistance(p-vec2(0.,.03)))+vec2(.0000001));}
vec3 uiBounds(vec3 p,float width){float d=uiDistance(p.xy),h=uiThickness*uiCurve(d,width).x;return vec3(d,p.z-h*uiFront,-h*(1.-uiFront)-p.z);}
vec3 uiNormal(vec3 p,float width){
 vec3 b=uiBounds(p,width);vec2 g=uiGradient(p.xy);
 if(b.x>=max(b.y,b.z))return vec3(g,0.);
 float slope=uiThickness*uiCurve(b.x,width).y;
 return b.y>b.z?normalize(vec3(g*slope*uiFront,1.)):normalize(vec3(g*slope*(1.-uiFront),-1.));
}
vec3 uiExit(vec3 origin,vec3 ray,vec2 halfSize,float width){
 // A convex B slab exits through its planar rear when that hit is inside
 // the footprint. Only edge exits and internal reflections need bisection.
 if(uiFront> .99999&&ray.z<-.00001){
  float t=-origin.z/ray.z;vec3 point=origin+ray*t;
  if(t>=0.&&uiDistance(point.xy)<-.001)return point;
 }
 vec3 lower=vec3(-halfSize,-uiThickness*(1.-uiFront)),upper=vec3(halfSize,uiThickness*uiFront),end=vec3(100000.);
 if(abs(ray.x)>.00001)end.x=((ray.x>0.?upper.x:lower.x)-origin.x)/ray.x;
 if(abs(ray.y)>.00001)end.y=((ray.y>0.?upper.y:lower.y)-origin.y)/ray.y;
 if(abs(ray.z)>.00001)end.z=((ray.z>0.?upper.z:lower.z)-origin.z)/ray.z;
 float lo=0.,hi=max(.02,min(end.x,min(end.y,end.z))+.02);
 for(int i=0;i<12;i++){float mid=(lo+hi)*.5;vec3 b=uiBounds(origin+ray*mid,width);if(max(b.x,max(b.y,b.z))<=0.)lo=mid;else hi=mid;}
 return origin+ray*((lo+hi)*.5);
}
vec2 uiOffset(vec2 local,vec2 halfSize,float width,float ior){
 float d=uiDistance(local);vec2 entry=local-uiGradient(local)*max(d+.01,0.);
 float front=uiThickness*uiFront*uiCurve(uiDistance(entry),width).x;
 vec3 normal=normalize(vec3(uiGradient(local)*uiThickness*uiFront*uiCurve(d,width).y,1.));
 vec3 ray=refract(vec3(0.,0.,-1.),normal,1./ior),origin=vec3(entry,front)+ray*.02;
 for(int i=0;i<3;i++){
  vec3 point=uiExit(origin,ray,halfSize,width),n=uiNormal(point,width),outgoing=refract(ray,-n,ior);
  if(dot(outgoing,outgoing)>.00001){if(outgoing.z>=-.02)return vec2(0.);return point.xy+outgoing.xy*max(0.,(-uiSceneDistance-point.z)/outgoing.z)-local;}
  ray=reflect(ray,n);origin=point+ray*.02;
 }
 return vec2(0.);
}
vec3 uiSoftened(vec2 p,float spread){
 vec3 c=uiSampleScene(p)*.2;
 c+=(uiSampleScene(p+vec2(spread,0.))+uiSampleScene(p-vec2(spread,0.))+uiSampleScene(p+vec2(0.,spread))+uiSampleScene(p-vec2(0.,spread)))*.1;
 c+=(uiSampleScene(p+vec2(.707,.707)*spread)+uiSampleScene(p-vec2(.707,.707)*spread)+uiSampleScene(p+vec2(.707,-.707)*spread)+uiSampleScene(p-vec2(.707,-.707)*spread))*.1;
 return c;
}
vec3 uiTransmission(vec2 pixel,vec2 local,vec2 halfSize,float width,vec2 screenScale,float compact){
 float roughness=uiRoughness*mix(1.,${f(compactRoughness)},compact);
 // Parallel flat interfaces have zero offset at every wavelength.
 if(uiDistance(local)<=-width)return uiSoftened(pixel,roughness);
 vec2 r=uiOffset(local,halfSize,width,uiIOR-uiDispersion)*screenScale;
 vec2 g=uiOffset(local,halfSize,width,uiIOR)*screenScale;
 vec2 b=uiOffset(local,halfSize,width,uiIOR+uiDispersion)*screenScale;
 return vec3(uiSoftened(pixel+r,roughness).r,uiSoftened(pixel+g,roughness).g,uiSoftened(pixel+b,roughness).b);
}
float uiTintAmount(float compact){return uiTint*mix(1.,${f(compactTint)},compact);}
`;
