import * as THREE from 'three';

const vertexShader = `
  attribute float grainSize;
  uniform float pointScale;
  varying vec3 vGrainColor,vWorld;
  varying float vDepth,vCoverage;
  varying vec3 vGrainProfile;
  void main(){
    vec4 view=modelViewMatrix*vec4(position,1.);
    vGrainColor=color;vDepth=-view.z;vWorld=(modelMatrix*vec4(position,1.)).xyz;
    float variation=fract(dot(color,vec3(31.7,73.1,19.3)));
    float angle=variation*6.2831853;
    vGrainProfile=vec3(cos(angle),sin(angle),.62+fract(variation*17.3)*.34);
    if(grainSize<=0.){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=1.;return;}
    gl_Position=projectionMatrix*view;
    float pixelSize=grainSize*pointScale/max(.2,-view.z);
    vCoverage=pow(min(1.,pixelSize/.8),2.);
    gl_PointSize=clamp(pixelSize,.8,4.5);
  }`;
const fragmentShader = `
  uniform vec3 sandBody,fogColor;
  uniform float fogDensity;
  varying vec3 vGrainColor,vWorld;
  varying float vDepth,vCoverage;
  varying vec3 vGrainProfile;
  void main(){
    vec2 p=gl_PointCoord*2.-1.;
    p=vec2(dot(p,vGrainProfile.xy),dot(p,vec2(-vGrainProfile.y,vGrainProfile.x))/vGrainProfile.z);
    float radius=length(p)+p.x*p.y*.08;
    float alpha=(1.-smoothstep(.68,1.,radius))*vCoverage;
    if(alpha<.03)discard;
    vec3 normal=normalize(vec3(p,sqrt(max(.02,1.-dot(p,p)))));
    float light=.78+.48*max(0.,dot(normal,normalize(vec3(-.45,.6,.66))));
    vec2 q=(vWorld.xz-sandBody.xz-vec2(.25,.15)*sandBody.y)/(.82+sandBody.y*.12);
    light*=1.-exp(-dot(q,q)*1.6)*(.33/(1.+sandBody.y*.25));
    vec3 color=vGrainColor*light;
    float fog=1.-exp(-fogDensity*fogDensity*vDepth*vDepth);
    gl_FragColor=vec4(mix(color,fogColor,fog),alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** Two point meshes: settled individual grains and a compact live-grain pool.
 * Opaque alpha-to-coverage keeps grains in the glass transmission buffer. */
export function createSandGrainView(scene, model, bodyCenter) {
  const colors = new Float32Array(model.count * 3), c = new THREE.Color();
  for (let i = 0; i < model.count; i++) {
    const tone = model.tones[i];
    c.setHex(tone < .09 ? 0x876841 : tone > .978 ? 0xefddc0 : 0xcdb180);
    c.multiplyScalar(.88 + tone * .16).toArray(colors, i * 3);
  }
  const surface = new THREE.BufferGeometry();
  surface.setAttribute('position', new THREE.BufferAttribute(model.positions, 3).setUsage(THREE.DynamicDrawUsage));
  surface.setAttribute('grainSize', new THREE.BufferAttribute(model.sizes, 1).setUsage(THREE.DynamicDrawUsage));
  surface.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const airborne = new THREE.BufferGeometry();
  const airPositions = new Float32Array(model.capacity * 3), airSizes = new Float32Array(model.capacity), airColors = new Float32Array(model.capacity * 3);
  airborne.setAttribute('position', new THREE.BufferAttribute(airPositions, 3).setUsage(THREE.DynamicDrawUsage));
  airborne.setAttribute('grainSize', new THREE.BufferAttribute(airSizes, 1).setUsage(THREE.DynamicDrawUsage));
  airborne.setAttribute('color', new THREE.BufferAttribute(airColors, 3).setUsage(THREE.DynamicDrawUsage));
  airborne.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, vertexColors: true,
    alphaToCoverage: true, uniforms: {
      pointScale: { value: 1000 }, sandBody: { value: bodyCenter }, fogColor: { value: scene.fog.color }, fogDensity: { value: scene.fog.density },
    } });
  const groundPoints = new THREE.Points(surface, material), airPoints = new THREE.Points(airborne, material);
  groundPoints.frustumCulled = airPoints.frustumCulled = false;
  scene.add(groundPoints, airPoints);
  let lastLayout = -1, lastMotion = -1;
  return {
    update() {
      surface.setDrawRange(0, model.visibleCount);
      if (model.consumeSurfaceDirty()) { surface.attributes.position.needsUpdate = true; surface.attributes.grainSize.needsUpdate = true; }
      const layoutChanged = lastLayout !== model.layoutRevision;
      if (!layoutChanged && lastMotion === model.motionRevision) return;
      let n = 0;
      for (let slot = 0; slot < model.capacity; slot++) {
        const id = model.ids[slot]; if (id < 0) continue;
        for (let a = 0; a < 3; a++) {
          airPositions[n * 3 + a] = model.flying[slot * 3 + a];
          if (layoutChanged) airColors[n * 3 + a] = colors[id * 3 + a];
        }
        if (layoutChanged) airSizes[n] = model.radii[id];
        n++;
      }
      airborne.setDrawRange(0, n);
      if (n) for (const attribute of Object.values(airborne.attributes)) {
        if (!layoutChanged && attribute !== airborne.attributes.position) continue;
        attribute.clearUpdateRanges(); attribute.addUpdateRange(0, n * attribute.itemSize); attribute.needsUpdate = true;
      }
      lastLayout = model.layoutRevision; lastMotion = model.motionRevision;
    },
    resize(height, fov) { material.uniforms.pointScale.value = height / (2 * Math.tan(fov * Math.PI / 360)); },
    restore() { model.syncSurface(); material.needsUpdate = true; lastLayout = lastMotion = -1; },
    dispose() { groundPoints.removeFromParent(); airPoints.removeFromParent(); surface.dispose(); airborne.dispose(); material.dispose(); },
  };
}
