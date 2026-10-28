import * as THREE from 'three';
import { createSandField, duneHeight } from './sand-field.js';
import { createDesertPhysics, TETHER_RADIUS } from './desert-physics.js';
import { createDesertSkin } from './desert-skin.js';
import { createDesertReturn } from './desert-return.js';
import { createSandGrains } from './sand-grains.js';
import { createSandGrainView } from './sand-grain-view.js';
import { createSandTextures } from './sand-surface.js';
import { createSandContact } from './sand-contact.js';
import { createFramePacer } from './frame-pacing.js';

const clamp = THREE.MathUtils.clamp;
export const DESERT_CAMERA_PITCH = 30;

export function createDesertScene(stage, { onStatus = () => {}, onDetach = () => {}, onReturn = () => {}, onError = () => {}, onFrame } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .95;
  renderer.transmissionResolutionScale = 1;
  renderer.domElement.id = 'desert-canvas';
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'Fixed desert view. Drag the crystal to release it, then stretch the soft glass. Drag the sand to leave a trail.');
  stage.append(renderer.domElement);
  const canvas = renderer.domElement;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe6d3b4);
  scene.fog = new THREE.FogExp2(0xe6d3b4, .019);
  const camera = new THREE.PerspectiveCamera(43, 1, .1, 190);
  const target = new THREE.Vector3(0, .95, 0);
  camera.position.set(4.4, .95 + Math.hypot(4.4, 6.92) * Math.tan(Math.PI / 6), 6.92);
  camera.lookAt(target);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let quality = matchMedia('(max-width: 760px), (pointer: coarse)').matches ? 'high' : 'ultra', paused = false, destroyed = false, lost = false;
  let frame = 0, previous = 0, time = 0, statusAt = 0, hover = 0, pressed = 0;
  let bodyDirty = true, lastBodyScale = NaN, lastSoftness = NaN;
  let press = null, pointerPending = false, pointerInside = false, hoveredBody = false, activeUntil = 0, squeezeHeld = false;
  const pointer = new THREE.Vector2(2, 2), raycaster = new THREE.Raycaster();
  const pointerPlane = new THREE.Plane(), cameraDirection = new THREE.Vector3(), scratch = new THREE.Vector3();
  const pacer = createFramePacer(60), cleanups = [];
  const listen = (object, event, handler, options) => {
    object.addEventListener(event, handler, options);
    cleanups.push(() => object.removeEventListener(event, handler, options));
  };
  let grains;
  const sand = createSandField({ onDisplace: event => grains?.disturb(event) });
  grains = createSandGrains(sand);
  grains.setQuality(quality === 'high');
  const physics = createDesertPhysics(sand, { onDetach: () => { activeUntil = time + 8; onDetach(); } });
  const returnToView = createDesertReturn(camera);
  const crystalSkin = createDesertSkin(physics.model, 2), gelSkin = createDesertSkin(physics.model, 3);
  const bodyCenter = new THREE.Vector3(...physics.center);
  const grainView = createSandGrainView(scene, grains, bodyCenter);
  // Loop subdivision preserves the vertex prefix. These 1,600 faces sample
  // the rendered 6,400-face gel instead of surrounding it with an ellipsoid.
  const grainCollider = createSandContact(crystalSkin.faces);
  let grainColliderDirty = true;
  const groundUniforms = {
    sandBody: { value: bodyCenter }, sandHover: { value: new THREE.Vector4(0, 0, .32, 0) },
    sandField: { value: 1 }, sandClock: { value: 0 },
  };
  const sandTextures = createSandTextures(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  const sandMaterial = new THREE.MeshStandardMaterial({ color: 0xcda979, roughness: .95,
    map: sandTextures.color, normalMap: sandTextures.normal, normalScale: new THREE.Vector2(.88, .88) });
  sandMaterial.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, groundUniforms);
    shader.vertexShader = 'varying vec3 vSandWorld;\nattribute float sandCompression,sandDisplacement;\nvarying float vSandCompression,vSandDisplacement;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSandWorld=(modelMatrix*vec4(position,1.)).xyz;vSandCompression=sandCompression;vSandDisplacement=sandDisplacement;');
    shader.fragmentShader = 'varying vec3 vSandWorld;\nvarying float vSandCompression,vSandDisplacement;\nuniform vec3 sandBody;\nuniform vec4 sandHover;\nuniform float sandField,sandClock;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb*=1.-vSandCompression*.105;
      if(vSandDisplacement<-.025){
        float cut=smoothstep(.025,.48,-vSandDisplacement);
        float strata=.5+.5*sin(vSandDisplacement*48.+vSandWorld.x*.7+vSandWorld.z*.4);
        diffuseColor.rgb*=1.-cut*(.10+strata*.035);
      }
      diffuseColor.rgb+=vec3(.025,.019,.009)*smoothstep(.015,.15,vSandDisplacement);
      vec2 shadowOffset=(vSandWorld.xz-sandBody.xz-vec2(.25,.15)*sandBody.y)/(.82+sandBody.y*.12);
      float shadow=exp(-dot(shadowOffset,shadowOffset)*1.6)*(.33/(1.+sandBody.y*.25));
      diffuseColor.rgb*=1.-shadow;
      if(sandHover.w>0.){
        float brush=abs(length(vSandWorld.xz-sandHover.xy)-sandHover.z);
        diffuseColor.rgb+=vec3(.07,.16,.17)*(1.-smoothstep(.008,.032,brush))*sandHover.w;
      }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if(sandField>0.){
        vec2 q=vSandWorld.xz;float r=length(q);
        float caustic=exp(-pow((r-.67-.04*sin(atan(q.y,q.x)*3.+sandClock*.35))*18.,2.));
        totalEmissiveRadiance+=vec3(.035,.14,.20)*caustic*sandField;
      }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.82,vSandCompression*.55);');
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>',
      THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * (1. - vSandCompression * .78);'));
  };
  const groundGeometry = new THREE.BufferGeometry();
  const groundPositions = new Float32Array(sand.base.length * 3), groundNormals = new Float32Array(groundPositions.length);
  const uv = new Float32Array(sand.base.length * 2), indices = [];
  for (let z = 0; z <= sand.resolution; z++) for (let x = 0; x <= sand.resolution; x++) {
    const i = z * sand.stride + x, wx = x * sand.spacing - sand.size / 2, wz = z * sand.spacing - sand.size / 2;
    groundPositions.set([wx, sand.base[i], wz], i * 3); uv.set([wx * sandTextures.uvScale, wz * sandTextures.uvScale], i * 2);
    if (x < sand.resolution && z < sand.resolution) {
      const a = i, b = i + 1, c = i + sand.stride, d = c + 1; indices.push(a, c, b, b, c, d);
    }
  }
  groundGeometry.setAttribute('position', new THREE.BufferAttribute(groundPositions, 3).setUsage(THREE.DynamicDrawUsage));
  groundGeometry.setAttribute('normal', new THREE.BufferAttribute(groundNormals, 3).setUsage(THREE.DynamicDrawUsage));
  groundGeometry.setAttribute('sandCompression', new THREE.BufferAttribute(sand.compaction, 1).setUsage(THREE.DynamicDrawUsage));
  groundGeometry.setAttribute('sandDisplacement', new THREE.BufferAttribute(sand.displacement, 1).setUsage(THREE.DynamicDrawUsage));
  groundGeometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); groundGeometry.setIndex(indices);
  const terrain = new THREE.Mesh(groundGeometry, sandMaterial); scene.add(terrain);
  const farGeometry = new THREE.PlaneGeometry(160, 160, 256, 256); farGeometry.rotateX(-Math.PI / 2);
  const farPosition = farGeometry.attributes.position, farUv = farGeometry.attributes.uv, farIndices = [];
  farGeometry.setAttribute('sandCompression', new THREE.BufferAttribute(new Float32Array(farPosition.count), 1));
  farGeometry.setAttribute('sandDisplacement', new THREE.BufferAttribute(new Float32Array(farPosition.count), 1));
  for (let i = 0; i < farPosition.count; i++) {
    const x = farPosition.getX(i), z = farPosition.getZ(i);
    farPosition.setY(i, duneHeight(x, z)); farUv.setXY(i, x * sandTextures.uvScale, z * sandTextures.uvScale);
  }
  for (let f = 0; f < farGeometry.index.count; f += 3) {
    const tri = [0, 1, 2].map(a => farGeometry.index.getX(f + a));
    const x = tri.reduce((sum, i) => sum + farPosition.getX(i), 0) / 3;
    const z = tri.reduce((sum, i) => sum + farPosition.getZ(i), 0) / 3;
    if (Math.abs(x) >= 10 || Math.abs(z) >= 10) farIndices.push(...tri);
  }
  farGeometry.setIndex(farIndices); farGeometry.computeVertexNormals();
  scene.add(new THREE.Mesh(farGeometry, sandMaterial));
  groundGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.SQRT2 * sand.size / 2);
  let groundHeightExtent = 0;
  const fieldHeight = index => sand.base[index] + sand.displacement[index];
  function updateGround(full = false) {
    const dirty = sand.consumeDirty();
    if (!full && !dirty) return;
    const area = full ? { x0: 0, z0: 0, x1: sand.resolution, z1: sand.resolution } : dirty;
    const x0 = Math.max(0, area.x0 - 1), x1 = Math.min(sand.resolution, area.x1 + 1);
    const z0 = Math.max(0, area.z0 - 1), z1 = Math.min(sand.resolution, area.z1 + 1);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const i = z * sand.stride + x, wx = groundPositions[i * 3], wz = groundPositions[i * 3 + 2];
      groundPositions[i * 3 + 1] = sand.base[i] + sand.displacement[i];
      groundHeightExtent = Math.max(groundHeightExtent, Math.abs(groundPositions[i * 3 + 1]));
      const nx = (x > 0 ? fieldHeight(i - 1) : sand.sample(wx - sand.spacing, wz))
        - (x < sand.resolution ? fieldHeight(i + 1) : sand.sample(wx + sand.spacing, wz));
      const nz = (z > 0 ? fieldHeight(i - sand.stride) : sand.sample(wx, wz - sand.spacing))
        - (z < sand.resolution ? fieldHeight(i + sand.stride) : sand.sample(wx, wz + sand.spacing));
      const ny = sand.spacing * 2, length = Math.hypot(nx, ny, nz);
      groundNormals.set([nx / length, ny / length, nz / length], i * 3);
    }
    for (const name of ['position', 'normal']) {
      const attribute = groundGeometry.attributes[name]; attribute.clearUpdateRanges();
      attribute.addUpdateRange((z0 * sand.stride + x0) * 3, ((z1 - z0) * sand.stride + x1 - x0 + 1) * 3);
      attribute.needsUpdate = true;
    }
    for (const name of ['sandCompression', 'sandDisplacement']) {
      const attribute = groundGeometry.attributes[name];
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(z0 * sand.stride + x0, (z1 - z0) * sand.stride + x1 - x0 + 1);
      attribute.needsUpdate = true;
    }
    grains.syncSurface(full ? null : { x0, x1, z0, z1 });
    groundGeometry.boundingSphere.radius = Math.sqrt(sand.size * sand.size / 2 + groundHeightExtent * groundHeightExtent);
  }
  updateGround(true);
  scene.add(new THREE.HemisphereLight(0xd8e9f6, 0xb7834b, 1.05));
  const sun = new THREE.DirectionalLight(0xffe0a5, 2.65); sun.position.set(-7, 4.5, 3); scene.add(sun);
  function makeEnvironment() {
    const sky = new THREE.Scene();
    const skyMaterial = new THREE.ShaderMaterial({ side: THREE.BackSide,
      vertexShader: 'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec3 vDirection;void main(){vec3 d=normalize(vDirection);
        vec3 color=mix(vec3(.15,.095,.055),vec3(.32,.57,.80),smoothstep(-.2,.9,d.y));
        color=mix(color,vec3(1.,.87,.68),exp(-abs(d.y)*8.)*.7);
        color+=vec3(7.,5.8,3.7)*pow(max(0.,dot(d,normalize(vec3(-4.,8.,5.)))),900.);
        color+=vec3(.15,.28,.38)*pow(max(0.,dot(d,normalize(vec3(4.,3.,-5.)))),12.);
        gl_FragColor=vec4(color,1.);}`,
    });
    const skyGeometry = new THREE.SphereGeometry(50, 32, 16); sky.add(new THREE.Mesh(skyGeometry, skyMaterial));
    const pmrem = new THREE.PMREMGenerator(renderer), map = pmrem.fromScene(sky, .02);
    pmrem.dispose(); skyGeometry.dispose(); skyMaterial.dispose();
    return map;
  }
  let environment = makeEnvironment();
  scene.environment = environment.texture;
  const crystalMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, thickness: 1.8,
    ior: 1.47, roughness: .025, metalness: 0, clearcoat: 1, clearcoatRoughness: .025,
    attenuationColor: 0xffffff, attenuationDistance: Infinity, dispersion: .34, envMapIntensity: 1.6,
    emissive: 0x000000, emissiveIntensity: 0, flatShading: true });
  const gelMaterial = crystalMaterial.clone(); gelMaterial.flatShading = false; gelMaterial.roughness = .075;
  gelMaterial.clearcoatRoughness = .045; gelMaterial.thickness = 1.6;
  function makeBodyGeometry(skin) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(skin.count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setIndex(new THREE.BufferAttribute(skin.faces, 1));
    return geometry;
  }
  const crystalGeometry = makeBodyGeometry(crystalSkin), gelGeometry = makeBodyGeometry(gelSkin);
  const body = new THREE.Mesh(crystalGeometry, crystalMaterial); scene.add(body);
  const cornerIds = physics.model.corners.map(corner => {
    let nearest = 0, gap = Infinity;
    for (let i = 0; i < physics.model.rest.length / 3; i++) {
      const distance = Math.hypot(...corner.map((p, axis) => physics.model.rest[i * 3 + axis] - p));
      if (distance < gap) { gap = distance; nearest = i; }
    }
    return nearest;
  });
  const edgePositions = new Float32Array(36), edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .28, depthTest: false, depthWrite: false });
  const crystalEdges = new THREE.LineSegments(edgeGeometry, edgeMaterial); scene.add(crystalEdges);
  const halo = new THREE.Mesh(new THREE.RingGeometry(.91, .92, 96), new THREE.MeshBasicMaterial({
    color: 0x8ce5ff, transparent: true, opacity: .35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.rotation.x = -Math.PI / 2; halo.position.set(...physics.anchor); halo.position.y -= .65; scene.add(halo);
  // Draw with the opaque scene so transmission can refract the source inside
  // the crystal. Explicit alpha blending keeps a blue core over warm sand.
  const beamHeight = 7;
  const beamMaterial = new THREE.ShaderMaterial({
    depthWrite: false, blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { strength: { value: 1 } },
    vertexShader: `varying vec3 beamNormal,beamView;varying float beamY;
      void main(){vec4 world=modelMatrix*vec4(position,1.);beamNormal=mat3(modelMatrix)*normal;
      beamView=cameraPosition-world.xyz;beamView.y=0.;beamY=uv.y;gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader: `varying vec3 beamNormal,beamView;varying float beamY;uniform float strength;
      float layer(float radius,float edge,float aa,float jump,float slope){
        float t=clamp(1.-radius/edge,0.,1.);
        float curve=t*t*(3.-2.*t);
        return (1.-smoothstep(edge-aa,edge+aa,radius))*(jump+slope*curve);
      }
      void main(){float facing=max(0.,dot(normalize(beamNormal),normalize(beamView)));
      float radius2=max(0.,1.-facing*facing),radius=sqrt(radius2);
      float aa=max(.007,fwidth(radius)*1.2);
      float profile=layer(radius,.95,aa,.015,.075)
        +layer(radius,.64,aa,.04,.14)+layer(radius,.30,aa,.06,.19);
      float fade=smoothstep(0.,.004,beamY)*(1.-smoothstep(.65,1.,beamY));
      gl_FragColor=vec4(.16,.55,1.25,profile*fade*strength);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.38, .38, beamHeight, 64, 1, true), beamMaterial);
  beam.renderOrder = 1; scene.add(beam);
  function updateBody() {
    const released = physics.phase === 'released';
    body.material = released ? gelMaterial : crystalMaterial;
    const skin = released ? gelSkin : crystalSkin, bodyGeometry = released ? gelGeometry : crystalGeometry;
    body.geometry = bodyGeometry;
    const scale = 1 + hover * .018 - pressed * .025;
    const softness = released ? Math.min(1, physics.freeAge * 2.4) * .5 : 0;
    const poseChanged = bodyDirty || scale !== lastBodyScale || softness !== lastSoftness;
    crystalEdges.visible = !released;
    if (!released && poseChanged) {
      let offset = 0;
      for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) for (const id of [cornerIds[a], cornerIds[b]])
        for (let axis = 0; axis < 3; axis++) edgePositions[offset++] = physics.center[axis]
          + (physics.positions[id * 3 + axis] - physics.center[axis]) * (1 + hover * .018 - pressed * .025);
      edgeGeometry.attributes.position.needsUpdate = true; edgeGeometry.computeBoundingSphere();
    }
    if (poseChanged) {
      skin.write(bodyGeometry.attributes.position.array, physics.positions, softness, physics.center, scale);
      bodyGeometry.attributes.position.needsUpdate = true;
      bodyGeometry.computeVertexNormals(); bodyGeometry.computeBoundingSphere();
      lastBodyScale = scale; lastSoftness = softness; bodyDirty = false; grainColliderDirty = true;
    }
    bodyCenter.fromArray(physics.center);
    body.material.envMapIntensity = 1.6 + hover * .18 + pressed * .1;
    beam.visible = !released;
    beam.position.set(physics.anchor[0], sand.sample(physics.anchor[0], physics.anchor[2]) + .008 + beamHeight / 2, physics.anchor[2]);
    beamMaterial.uniforms.strength.value = .92 + hover * .15;
    halo.visible = !released;
    halo.material.opacity = Math.max(0, 1 - physics.distance / TETHER_RADIUS) * .36;
    groundUniforms.sandField.value = released ? 0 : Math.max(0, 1 - physics.distance / TETHER_RADIUS);
    return poseChanged;
  }
  updateBody();
  function resize() {
    const width = stage.clientWidth, height = stage.clientHeight;
    const high = quality === 'high';
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, high ? 1.35 : 2,
      Math.sqrt((high ? 1800000 : 3400000) / Math.max(1, width * height))));
    renderer.setSize(width, height);
    camera.aspect = width / height; camera.fov = width < 760 ? 61 : 43;
    camera.setViewOffset(width, height, width < 760 ? 0 : -width * .105, 0, width, height);
    camera.updateProjectionMatrix(); invalidate();
    grainView.resize(canvas.height, camera.fov);
  }
  function setPointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    pointerInside = Math.abs(pointer.x) <= 1 && Math.abs(pointer.y) <= 1;
    raycaster.setFromCamera(pointer, camera);
  }
  function sandPoint() {
    const { origin, direction } = raycaster.ray;
    if (direction.y > -.025) return null;
    let t = -origin.y / direction.y;
    for (let i = 0; i < 6; i++) {
      const p = raycaster.ray.at(t, scratch);
      t += (sand.sample(p.x, p.z) - p.y) / direction.y;
    }
    const point = raycaster.ray.at(t, new THREE.Vector3());
    return Math.max(Math.abs(point.x), Math.abs(point.z)) < 7.5 ? point : null;
  }
  let lastSand = null;
  function mark(point) {
    if (!point) { lastSand = null; return; }
    const distance = lastSand ? lastSand.distanceTo(point) : 0;
    const flowX = lastSand ? (point.x - lastSand.x) / Math.max(.001, distance) : 0;
    const flowZ = lastSand ? (point.z - lastSand.z) / Math.max(.001, distance) : 0;
    const steps = Math.max(1, Math.ceil(distance / .09));
    for (let i = 1; i <= steps; i++) {
      const p = lastSand ? scratch.copy(lastSand).lerp(point, i / steps) : point;
      sand.stamp(p.x, p.z, .42, .23, flowX, flowZ, .7 + Math.min(1.2, distance), press?.sandLayer);
    }
    lastSand = point.clone();
  }
  function wake() { paused = false; statusAt = -Infinity; activeUntil = time + 6; invalidate(); }
  function releaseInput() {
    const id = press?.id; press = null; lastSand = null; physics.release();
    canvas.classList.remove('is-dragging');
    if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    invalidate();
  }
  listen(canvas, 'contextmenu', event => event.preventDefault());
  listen(canvas, 'pointerdown', event => {
    if (!event.isPrimary || (event.button !== 0 && event.button !== 2)) return;
    setPointer(event); scene.updateMatrixWorld(true);
    const hit = raycaster.intersectObject(body)[0];
    const ground = !hit ? sandPoint() : null;
    if (!hit && !ground) return;
    wake();
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false,
      kind: hit ? (event.button === 2 && physics.phase === 'released' ? 'squeeze' : 'body') : 'sand',
      sandLayer: ground ? sand.displacement.slice() : null };
    canvas.setPointerCapture(event.pointerId); canvas.classList.add('is-dragging');
    if (hit) {
      camera.getWorldDirection(cameraDirection); pointerPlane.setFromNormalAndCoplanarPoint(cameraDirection, hit.point);
      if (press.kind === 'body') physics.grab(hit.point.toArray());
      else physics.squeeze(.25);
      pressed = 1;
    } else mark(ground);
  });
  listen(canvas, 'pointermove', event => {
    if (press && press.id !== event.pointerId) return;
    setPointer(event); pointerPending = true;
    if (press) {
      press.moved ||= Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5;
      if (press.kind === 'body') {
        const point = raycaster.ray.intersectPlane(pointerPlane, scratch);
        if (point) physics.moveGrab(point.toArray());
      } else if (press.kind === 'squeeze') physics.squeeze(clamp(.25 + (event.clientY - press.y) / 130, .05, .9));
      else mark(sandPoint());
      activeUntil = time + 4;
    }
    invalidate();
  });
  listen(canvas, 'pointerup', event => {
    if (!press || press.id !== event.pointerId) return;
    if (press.kind === 'body' && !press.moved) physics.push(raycaster.ray.direction.toArray(), 2.7);
    releaseInput();
  });
  listen(canvas, 'pointercancel', releaseInput);
  listen(canvas, 'lostpointercapture', () => { if (press) releaseInput(); });
  listen(canvas, 'pointerleave', () => { if (!press) { pointerInside = false; hoveredBody = false; groundUniforms.sandHover.value.w = 0; invalidate(); } });
  listen(window, 'blur', releaseInput);
  listen(document, 'visibilitychange', () => {
    previous = 0; pacer.reset();
    if (document.hidden) { releaseInput(); cancelAnimationFrame(frame); frame = 0; }
    else invalidate();
  });
  listen(canvas, 'webglcontextlost', event => { event.preventDefault(); lost = true; releaseInput(); onError('Graphics interrupted. Restoring the desert…'); });
  listen(canvas, 'webglcontextrestored', () => {
    environment.dispose(); environment = makeEnvironment(); scene.environment = environment.texture;
    sandTextures.restore(); grainView.restore(); bodyDirty = true; lost = false; previous = 0; statusAt = -Infinity; pacer.reset();
    updateGround(true); resize();
  });
  function render(now) {
    frame = 0;
    if (destroyed || lost || document.hidden) return;
    if (!previous) pacer.reset();
    if (!pacer.ready(now)) { invalidate(); return; }
    const dt = previous ? Math.min((now - previous) / 1000, .05) : 1 / 60;
    previous = now; time += dt;
    const moving = physics.phase === 'suspended' || physics.contacts === 0 || physics.speed > .025 || press || time < activeUntil;
    if (!paused && moving && (!reduced.matches || time < activeUntil || press || !returnToView.inView))
      bodyDirty = physics.update(dt, { rotate: !reduced.matches }) || bodyDirty;
    if (returnToView.update(dt, physics, { paused, interacting: Boolean(press) || squeezeHeld })) {
      bodyDirty = true; activeUntil = time + 8; statusAt = -Infinity; pointerPending = true; onReturn();
    }
    hover += ((hoveredBody ? 1 : 0) - hover) * Math.min(1, dt * 12);
    pressed *= Math.exp(-dt * 11);
    if (!paused && (!reduced.matches || time < activeUntil || press || sand.active || grains.activeCount)) sand.relax(dt);
    updateGround(); const poseChanged = updateBody();
    if (!paused && (!reduced.matches || time < activeUntil || press || grains.activeCount)) {
      if (grains.activeCount && grainColliderDirty) {
        grainCollider.update(body.geometry.attributes.position.array); grainColliderDirty = false;
      }
      grains.update(dt, grainCollider);
    }
    grainView.update();
    if (pointerInside && !press && (pointerPending || poseChanged)) {
      scene.updateMatrixWorld(true);
      hoveredBody = raycaster.intersectObject(body).length > 0;
      const p = !hoveredBody ? sandPoint() : null;
      if (p) groundUniforms.sandHover.value.set(p.x, p.z, .32, 1);
      else groundUniforms.sandHover.value.w = 0;
      canvas.style.cursor = hoveredBody ? 'grab' : 'crosshair'; pointerPending = false;
    }
    groundUniforms.sandClock.value = time;
    renderer.render(scene, camera);
    const continuous = Boolean((!paused && ((!reduced.matches && moving) || (!returnToView.inView && moving) || returnToView.pending || sand.active || grains.activeCount > 0)) || press || time < activeUntil || Math.abs(hover - Number(hoveredBody)) > .001 || pressed > .001);
    onFrame?.(renderer.domElement, undefined, continuous);
    if (now - statusAt > 160) {
      onStatus({ phase: physics.phase, distance: physics.distance, volumeRatio: physics.volumeRatio,
        contacts: physics.contacts, marks: sand.revision, paused, quality });
      stage.dataset.phase = physics.phase; stage.dataset.sandRevision = String(sand.revision);
      stage.dataset.volumeRatio = physics.volumeRatio.toFixed(4); stage.dataset.cameraPitch = String(DESERT_CAMERA_PITCH);
      stage.dataset.airborneGrains = String(grains.activeCount); stage.dataset.surfaceGrains = String(grains.visibleCount - grains.activeCount);
      stage.dataset.sandSettling = String(sand.active);
      stage.dataset.returnCount = String(returnToView.count); stage.dataset.bodyInView = String(returnToView.inView);
      stage.dataset.surfaceTriangles = String(body.geometry.index.count / 3);
      stage.dataset.ready = 'true'; statusAt = now;
    }
    if (continuous) invalidate();
    else previous = 0;
  }
  function invalidate() { if (!frame && !destroyed && !lost && !document.hidden) frame = requestAnimationFrame(render); }
  const observer = new ResizeObserver(resize); observer.observe(stage);
  listen(reduced, 'change', () => { releaseInput(); activeUntil = time; invalidate(); });
  resize();
  return {
    get phase() { return physics.phase; },
    releaseInput,
    push() { wake(); physics.push([.8, -.1, -.35], 2.7); pressed = 1; },
    squeeze(value) {
      if (physics.phase !== 'released') return;
      physics.squeeze(value ? .8 : 0);
      if (value) wake();
      else if (squeezeHeld) { activeUntil = paused ? time : time + 4; invalidate(); }
      squeezeHeld = Boolean(value);
    },
    setPaused(value) { paused = Boolean(value); statusAt = -Infinity; activeUntil = time; invalidate(); },
    setQuality(value) { if (value === 'high' || value === 'ultra') { quality = value; statusAt = -Infinity; grains.setQuality(value === 'high'); resize(); } },
    smoothSand() { sand.clear(); grains.reset(); wake(); },
    reset() { releaseInput(); sand.clear(); grains.reset(); physics.reset(); returnToView.reset(); bodyDirty = true; paused = false; statusAt = -Infinity; activeUntil = time; invalidate(); },
    dispose() {
      destroyed = true; cancelAnimationFrame(frame); observer.disconnect(); cleanups.forEach(fn => fn());
      grainView.dispose(); scene.traverse(object => { if (object !== body) object.geometry?.dispose(); });
      crystalGeometry.dispose(); gelGeometry.dispose();
      for (const material of [sandMaterial, crystalMaterial, gelMaterial, halo.material, edgeMaterial, beamMaterial]) material.dispose();
      sandTextures.dispose(); environment.dispose(); renderer.dispose(); canvas.remove();
    },
  };
}
