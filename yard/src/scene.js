import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const palettes = {
  prism: { glass: 0xe1f4ff, light: 0x83e8f5, rim: 0xb692fa },
  halo: { glass: 0xffedd8, light: 0xffc780, rim: 0xec8cba },
  orbit: { glass: 0xd8ffef, light: 0x83edcc, rim: 0x8ab7ff },
};

const atmospheres = {
  moonlight: { tint: 0x406185, base: 0x080d18, key: 0xa1dfff, rim: 0xb692fa, ambient: 0xc8d8ff, exposure: 1, glow: 0.21 },
  daybreak: { tint: 0xb77c67, base: 0x1b1010, key: 0xffcc94, rim: 0xed9bbd, ambient: 0xffd8b0, exposure: 1.1, glow: 0.3 },
  aurora: { tint: 0x348d83, base: 0x051716, key: 0x8affc7, rim: 0x9a88ff, ambient: 0x9fffe3, exposure: 0.95, glow: 0.34 },
};

export function createPlayground(stage, { onHit, onHold, onStatus, onError }) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x080c14);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.transmissionResolutionScale = 0.75;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  stage.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 80);
  camera.position.set(0, 0.65, 8.4);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !motion.matches;
  controls.dampingFactor = 0.065;
  controls.enablePan = false;
  controls.minDistance = 4.8;
  controls.maxDistance = 13;
  controls.minPolarAngle = 0.5;
  controls.maxPolarAngle = 1.9;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.7;
  controls.target.set(0, 0, 0);

  const studio = new THREE.Scene();
  studio.background = new THREE.Color(0x34445e);
  const panelGeometry = new THREE.PlaneGeometry(1, 1);
  const panels = [];
  for (const [position, size, color, intensity] of [
    [[-4, 2, 3], [1.5, 9], 0x6ad7ff, 3],
    [[4, 1, -1], [2, 8], 0xcc91ff, 3],
    [[0, 5, 0], [7, 2], 0xeef9ff, 5],
    [[1, 1, 5], [0.5, 6], 0xffffff, 4],
  ]) {
    const panel = new THREE.Mesh(panelGeometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    panel.material.color.multiplyScalar(intensity);
    panel.position.fromArray(position);
    panel.scale.set(...size, 1);
    panel.lookAt(0, 0, 0);
    studio.add(panel);
    panels.push(panel);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(studio, 0.035);
  scene.environment = environment.texture;
  for (const panel of panels) panel.material.dispose();
  panelGeometry.dispose();
  pmrem.dispose();

  const sky = new THREE.Mesh(new THREE.SphereGeometry(32, 32, 20), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { tint: { value: new THREE.Color(0x406185) }, base: { value: new THREE.Color(0x080d18) }, glowStrength: { value: 0.21 } },
    vertexShader: 'varying vec3 vDirection; void main(){vDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 vDirection; uniform vec3 tint,base; uniform float glowStrength;
      void main(){
        vec3 d=normalize(vDirection);
        float glow=pow(max(dot(d,normalize(vec3(.25,.1,-1.))),0.),6.);
        float band=exp(-pow((d.y+.04)*13.,2.))*max(0.,-d.z);
        vec3 c=base+tint*(glow*glowStrength+band*.065);
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  scene.add(sky);
  const ambient = new THREE.AmbientLight(0xc8d8ff, 0.3);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xcdf7ff, 4.5);
  const keyRestColor = new THREE.Color(0xcdf7ff);
  key.position.set(-3, 5, 5);
  const rim = new THREE.DirectionalLight(0xae8aff, 5);
  rim.position.set(4, 1, -3);
  const cursorLight = new THREE.PointLight(0xafffff, 12, 12, 2);
  cursorLight.position.set(1.5, 1.5, 3);
  scene.add(key, rim, cursorLight);

  const materials = [];
  function glass(thickness = 1.6) {
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xe1f4ff, roughness: 0.035, metalness: 0,
      transmission: 1, thickness, ior: 1.5, dispersion: 0.6,
      attenuationColor: new THREE.Color(0xb6dcff), attenuationDistance: 8,
      clearcoat: 0.25, clearcoatRoughness: 0.055, envMapIntensity: 0.8, specularIntensity: 0.7,
      iridescence: 0.22, iridescenceIOR: 1.3, iridescenceThicknessRange: [100, 350],
    });
    materials.push(material);
    return material;
  }
  const assembly = new THREE.Group();
  scene.add(assembly);
  const exhibits = {};
  function exhibit(name, geometry, thickness) {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, glass(thickness));
    mesh.userData.touchable = true;
    group.add(mesh);
    assembly.add(group);
    exhibits[name] = { group, mesh };
    return group;
  }
  exhibit('prism', new THREE.IcosahedronGeometry(1.46, 0), 2.7);
  exhibits.prism.mesh.rotation.set(0.25, 0.3, 0.1);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(exhibits.prism.mesh.geometry), new THREE.LineBasicMaterial({ color: 0xcef3ff, transparent: true, opacity: 0.18 }));
  exhibits.prism.mesh.add(edge);
  exhibit('halo', new THREE.TorusKnotGeometry(0.88, 0.28, 160, 24, 2, 3), 1.15);
  exhibit('orbit', new THREE.SphereGeometry(1.12, 64, 48), 2.3);
  const orbitRing = new THREE.Mesh(new THREE.TorusGeometry(1.68, 0.12, 16, 128), glass(0.7));
  orbitRing.rotation.x = 1.1;
  orbitRing.rotation.y = 0.3;
  orbitRing.userData.touchable = true;
  exhibits.orbit.group.add(orbitRing);

  // A luminous filament behind the glass makes refraction visible as the view changes.
  const filament = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.012, 8, 96), new THREE.MeshBasicMaterial({ color: 0x80dbf4 }));
  filament.rotation.set(0.6, 0.25, 0.3);
  filament.position.z = -0.9;
  scene.add(filament);

  // Drawn light paths make each material study legible; these are an optical
  // illustration, not a ray-traced solution. Their colors follow the lighting.
  const lightPaths = new THREE.Group();
  const pathMaterials = [];
  for (let i = 0; i < 7; i++) {
    const spread = (i - 3) / 3;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.9, 2.3 + spread * 0.1, -1.4),
      new THREE.Vector3(-0.85, 0.38 + spread * 0.08, -0.3),
      new THREE.Vector3(0.7, -0.1 + spread * 0.15, -0.7),
      new THREE.Vector3(3.7, -1.05 + spread * 0.7, -1.8),
    ]);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(0.49 + i * 0.045, 0.7, 0.65), transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 52, i === 3 ? 0.01 : 0.005, 4, false), material);
    lightPaths.add(line);
    pathMaterials.push(material);
  }
  lightPaths.visible = false;
  scene.add(lightPaths);

  const satellites = [];
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(i % 2 ? new THREE.OctahedronGeometry(0.25 + i * 0.022) : new THREE.SphereGeometry(0.19 + i * 0.04, 24, 20), glass(0.6));
    mesh.userData.touchable = true;
    scene.add(mesh);
    satellites.push(mesh);
  }
  const orbitGuide = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.005, 6, 160), new THREE.MeshBasicMaterial({ color: 0x8bacc8, transparent: true, opacity: 0.18 }));
  orbitGuide.rotation.set(1.07, 0.18, -0.2);
  scene.add(orbitGuide);

  const floorUniforms = { time: { value: 0 }, clock: { value: 0 }, pulse: { value: -100 }, tint: { value: new THREE.Color(0x60d8ee) }, energy: { value: 0.65 } };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: floorUniforms,
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv; uniform float time,clock,pulse,energy; uniform vec3 tint;
      void main(){
        vec2 p=(vUv-.5)*28.; float r=length(p); float a=atan(p.y,p.x);
        float w=sin(a*5.+time*.23)*.12+sin(a*9.-time*.17)*.055;
        float ring=exp(-pow((r-1.18-w)*13.,2.))*.25;
        ring+=exp(-pow((r-1.6+w)*18.,2.))*.15;
        float folds=pow(.5+.5*sin(a*12.+r*5.+time*.3),10.)*exp(-pow((r-1.38)*2.5,2.))*.25;
        float age=clock-pulse;
        float wave=exp(-pow((r-age*2.6)*10.,2.))*exp(-age*1.4)*step(0.,age);
        float glow=exp(-r*r*.8)*.08;
        vec3 rainbow=.6+.4*cos(a+vec3(0.,2.,4.));
        vec3 c=mix(tint,rainbow,.28)*(ring+folds+glow+wave*.7)*(.35+energy);
        gl_FragColor=vec4(c,clamp(exp(-r*.12),0.,1.));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.8;
  scene.add(floor);

  // Point sprites have a soft circular falloff, rather than square pixels.
  const dustPositions = new Float32Array(210 * 3);
  for (let i = 0; i < dustPositions.length; i += 3) {
    dustPositions[i] = (Math.random() - 0.5) * 18;
    dustPositions[i + 1] = (Math.random() - 0.5) * 10;
    dustPositions[i + 2] = -3 - Math.random() * 12;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { tint: { value: new THREE.Color(0x84a4c7) } },
    vertexShader: 'void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(18./-p.z,1.,3.);gl_Position=projectionMatrix*p;}',
    fragmentShader: 'uniform vec3 tint; void main(){float a=1.-smoothstep(.1,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(tint,a*.55);}',
  }));
  scene.add(dust);

  const sparkCount = 90;
  const sparkPositions = new Float32Array(sparkCount * 3);
  const sparkVelocities = new Float32Array(sparkCount * 3);
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
  const sparkMaterial = new THREE.PointsMaterial({ color: 0xcdf6ff, size: 0.028, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
  sparks.frustumCulled = false;
  scene.add(sparks);

  const constellation = new THREE.Group();
  const constellationPositions = [];
  for (let i = 0; i < 24; i++) {
    const t = i / 23 * Math.PI * 2.5;
    constellationPositions.push(Math.sin(t) * 2.5, Math.cos(t * 0.8) * 1.5, -0.6 + Math.sin(t * 0.45));
  }
  const constellationGeometry = new THREE.BufferGeometry();
  constellationGeometry.setAttribute('position', new THREE.Float32BufferAttribute(constellationPositions, 3));
  constellation.add(new THREE.Points(constellationGeometry, new THREE.PointsMaterial({ color: 0xffe1a0, size: 0.065, transparent: true, blending: THREE.AdditiveBlending })));
  constellation.add(new THREE.Line(constellationGeometry, new THREE.LineBasicMaterial({ color: 0xffd098, transparent: true, opacity: 0.35 })));
  constellation.visible = false;
  scene.add(constellation);

  let mode = 'prism', atmosphere = 'moonlight', paused = motion.matches, failed = false, disposed = false, rendering = false;
  let time = 0, motionTime = 0, previousTime = 0, raf = 0, activityUntil = 0, sparkAge = 9;
  let gravityUntil = 0, resonanceUntil = 0, constellationUntil = 0;
  let baseDispersion = 0.66, lightValue = 0.65, qualityScale = 1;
  let frameSamples = 0, frameElapsed = 0, adaptationDone = false;
  const impulse = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const lightTarget = new THREE.Vector3(1.5, 1.5, 3);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const removeListeners = [];
  function listen(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    removeListeners.push(() => target.removeEventListener(event, handler, options));
  }
  function invalidate(duration = 500) {
    activityUntil = Math.max(activityUntil, performance.now() + (motion.matches ? 0 : duration));
    if (!raf && !rendering && !document.hidden && !disposed && !failed) raf = requestAnimationFrame(render);
  }
  function resize() {
    const width = stage.clientWidth, height = stage.clientHeight;
    const mobile = width < 900 && height > width;
    const ratio = Math.min(devicePixelRatio || 1, mobile ? 1.45 : 1.7, Math.sqrt(1800000 / (width * height))) * qualityScale;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.setViewOffset(width, height, mobile ? 0 : -width * 0.14, mobile ? -height * 0.08 : 0, width, height);
    camera.updateProjectionMatrix();
    if (!controls._yardInteracted) {
      camera.position.set(0, 0.65, mobile ? 12.2 : 8.4);
      controls.update();
    }
    invalidate();
  }
  function updatePalette() {
    const palette = palettes[mode];
    const lighting = atmospheres[atmosphere];
    for (const material of materials) {
      material.color.setHex(palette.glass);
      material.attenuationColor.setHex(lighting.key).lerp(new THREE.Color(palette.light), 0.25).lerp(new THREE.Color(0xffffff), 0.62);
    }
    key.color.setHex(lighting.key).lerp(new THREE.Color(palette.light), 0.2);
    keyRestColor.copy(key.color);
    rim.color.setHex(lighting.rim).lerp(new THREE.Color(palette.rim), 0.15);
    cursorLight.color.copy(key.color);
    floorUniforms.tint.value.copy(key.color);
    sparkMaterial.color.copy(key.color);
    filament.material.color.copy(key.color);
    dust.material.uniforms.tint.value.setHex(lighting.rim);
    ambient.color.setHex(lighting.ambient);
    sky.material.uniforms.tint.value.setHex(lighting.tint);
    sky.material.uniforms.base.value.setHex(lighting.base);
    sky.material.uniforms.glowStrength.value = lighting.glow;
    setLight(lightValue);
  }
  function setScene(next) {
    if (!exhibits[next]) return;
    mode = next;
    for (const [name, exhibit] of Object.entries(exhibits)) exhibit.group.visible = name === mode;
    updatePalette();
    stage.dataset.scene = mode;
    invalidate();
  }
  function setAtmosphere(next) {
    if (!atmospheres[next]) return;
    atmosphere = next;
    updatePalette();
    stage.dataset.atmosphere = next;
    invalidate();
  }
  function setLightPaths(value) {
    lightPaths.visible = Boolean(value);
    stage.dataset.lightPaths = String(lightPaths.visible);
    invalidate();
  }
  function pulse() {
    floorUniforms.pulse.value = time;
    sparkAge = 0;
    impulse.set((Math.random() - 0.5) * 0.6, 0.6, 0.1);
    for (let i = 0; i < sparkCount; i++) {
      const direction = new THREE.Vector3().randomDirection();
      const r = 1.3 + Math.random() * 0.4;
      sparkPositions.set([direction.x * r, direction.y * r, direction.z * r], i * 3);
      sparkVelocities.set([direction.x * 1.3, direction.y * 1.3, direction.z * 1.3], i * 3);
    }
    sparkGeometry.attributes.position.needsUpdate = true;
    if (motion.matches) { sparkAge = 0.7; sparkMaterial.opacity = 0.7; }
    invalidate(2600);
  }
  function secret(id) {
    if (id === 'gravity') gravityUntil = time + 10;
    if (id === 'resonance') resonanceUntil = time + 8;
    if (id === 'constellation') constellationUntil = time + 14;
    stage.dataset.lastDiscovery = id;
    pulse();
    invalidate(15000);
  }
  function setPaused(value) {
    paused = Boolean(value);
    stage.dataset.paused = String(paused);
    previousTime = 0;
    invalidate(100);
  }
  function setLight(value) {
    lightValue = Math.min(1, Math.max(0, value));
    key.intensity = 1.5 + lightValue * 5;
    rim.intensity = 2 + lightValue * 5;
    cursorLight.intensity = 3 + lightValue * 17;
    renderer.toneMappingExposure = (0.9 + lightValue * 0.45) * atmospheres[atmosphere].exposure;
    floorUniforms.energy.value = lightValue;
    invalidate();
  }
  function setDispersion(value) {
    baseDispersion = Math.max(0.001, value * 1.2);
    for (const material of materials) material.dispersion = baseDispersion;
    invalidate();
  }
  function reset() {
    camera.position.set(0, 0.65, stage.clientWidth < 900 && stage.clientHeight > stage.clientWidth ? 12.2 : 8.4);
    controls.target.set(0, 0, 0);
    controls._yardInteracted = false;
    offset.set(0, 0, 0);
    impulse.set(0, 0, 0);
    gravityUntil = resonanceUntil = constellationUntil = 0;
    sparkAge = 9; sparkMaterial.opacity = 0; floorUniforms.pulse.value = -100;
    controls.update();
    invalidate();
  }
  function pick(event) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects([exhibits[mode].group, ...satellites], true).find(hit => hit.object.userData.touchable);
  }
  let press = null, holdTimer = 0;
  function cancelHold() { clearTimeout(holdTimer); holdTimer = 0; }
  listen(renderer.domElement, 'pointerdown', event => {
    if (event.button !== 0) return;
    if (!event.isPrimary) { cancelHold(); press = null; return; }
    controls._yardInteracted = true;
    press = { x: event.clientX, y: event.clientY, hit: !!pick(event), held: false, moved: false };
    if (press.hit) holdTimer = setTimeout(() => {
      if (press) { press.held = true; onHold?.(); }
    }, 1300);
    invalidate(1500);
  });
  listen(renderer.domElement, 'pointermove', event => {
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) { press.moved = true; cancelHold(); }
    const bounds = renderer.domElement.getBoundingClientRect();
    lightTarget.set((event.clientX / bounds.width - 0.5) * 7, (0.5 - event.clientY / bounds.height) * 5 + 1.5, 3);
    if (event.pointerType !== 'touch') renderer.domElement.style.cursor = pick(event) ? 'pointer' : 'grab';
    invalidate();
  }, { passive: true });
  listen(renderer.domElement, 'pointerup', event => {
    cancelHold();
    if (press && press.hit && !press.held && !press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 8 && pick(event)) {
      pulse(); onHit?.();
    }
    press = null;
  });
  listen(renderer.domElement, 'pointercancel', () => { cancelHold(); press = null; });
  listen(renderer.domElement, 'pointerleave', () => { cancelHold(); lightTarget.set(1.5, 1.5, 3); invalidate(); });
  listen(controls, 'change', () => invalidate());
  listen(controls, 'start', () => { controls._yardInteracted = true; invalidate(1200); });
  listen(window, 'resize', resize);
  listen(document, 'visibilitychange', () => {
    cancelHold(); press = null;
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else { previousTime = 0; invalidate(); }
  });
  listen(motion, 'change', () => {
    controls.enableDamping = !motion.matches;
    if (motion.matches) setPaused(true);
    invalidate();
  });
  listen(renderer.domElement, 'webglcontextlost', event => {
    event.preventDefault(); failed = true;
    cancelAnimationFrame(raf); raf = 0;
    onError?.('The graphics connection was interrupted. Reload to return to the gallery.');
  });

  function render(now) {
    raf = 0;
    if (disposed || failed || document.hidden) return;
    rendering = true;
    const delta = previousTime ? Math.min((now - previousTime) / 1000, 0.06) : 0;
    previousTime = now;
    const moving = !paused && !motion.matches;
    const interactive = now < activityUntil;
    if (moving || (interactive && !motion.matches)) time += delta;
    if (moving) motionTime += delta;
    controls.update(delta);
    cursorLight.position.lerp(lightTarget, motion.matches ? 1 : 0.12);
    const gravity = time < gravityUntil ? 1 : 0;
    const resonating = time < resonanceUntil;
    {
      if (!motion.matches && (moving || interactive)) {
        impulse.addScaledVector(offset, -delta * 12);
        impulse.multiplyScalar(Math.exp(-delta * 4));
        offset.addScaledVector(impulse, delta);
      }
      assembly.position.copy(offset);
      if (!motion.matches) {
        assembly.position.y += Math.sin(motionTime * 0.65) * 0.085;
        assembly.rotation.y = motionTime * 0.09;
        assembly.rotation.z = Math.sin(motionTime * 0.27) * 0.065;
      }
      const spread = gravity ? 1.6 : 1;
      satellites.forEach((mesh, i) => {
        const a = i * Math.PI * 0.5 + motionTime * (0.12 + i * 0.016);
        mesh.position.set(Math.cos(a) * (2.05 + i * 0.065) * spread, Math.sin(a * 1.6 + i) * (0.7 + gravity * 0.7), Math.sin(a) * 1.25);
        mesh.rotation.set(motionTime * 0.11 + i, motionTime * 0.19, i * 0.3);
      });
      floorUniforms.time.value = motionTime;
      floorUniforms.clock.value = time;
      dust.rotation.y = motionTime * 0.009;
      constellation.visible = time < constellationUntil;
      constellation.rotation.y = motionTime * 0.12;
      if (resonating) {
        key.color.setHSL((time * 0.1) % 1, 0.65, 0.7);
        for (const material of materials) material.dispersion = baseDispersion + 0.6;
      } else {
        key.color.copy(keyRestColor);
        for (const material of materials) material.dispersion = baseDispersion;
      }
      if (lightPaths.visible) {
        lightPaths.rotation.y = Math.sin(motionTime * 0.15) * 0.1;
        pathMaterials.forEach((material, i) => { material.opacity = (0.21 + lightValue * 0.19) * (0.8 + Math.sin(motionTime * 0.6 + i * 0.45) * 0.2); });
      }
      if (sparkAge < 3 && !motion.matches) {
        sparkAge += delta;
        for (let i = 0; i < sparkPositions.length; i++) sparkPositions[i] += sparkVelocities[i] * delta;
        sparkGeometry.attributes.position.needsUpdate = true;
        sparkMaterial.opacity = Math.max(0, 1 - sparkAge / 2.5);
      }
    }
    renderer.render(scene, camera);
    stage.dataset.ready = 'true';
    // Sample actual frames once, and only trade resolution for latency when needed.
    if (!adaptationDone && moving && delta > 0 && time > 2) {
      frameSamples++; frameElapsed += delta;
      if (frameSamples >= 90) {
        adaptationDone = true;
        if (frameSamples / frameElapsed < 34) { qualityScale = 0.72; renderer.transmissionResolutionScale = 0.6; resize(); onStatus?.('LIVE · ADAPTIVE'); }
      }
    }
    rendering = false;
    if (moving || now < activityUntil) raf = requestAnimationFrame(render);
  }
  resize(); setScene('prism'); setAtmosphere('moonlight'); setLight(0.65); setDispersion(0.55); setPaused(paused);
  cancelAnimationFrame(raf); raf = 0;
  render(performance.now());
  return {
    setScene, setAtmosphere, setLightPaths, setLight, setDispersion, setPaused, pulse, secret, reset,
    isPaused: () => paused,
    nudge(x, y) { controls._yardInteracted = true; controls.rotateLeft(x); controls.rotateUp(y); controls.update(); invalidate(); },
    dispose() {
      disposed = true; cancelAnimationFrame(raf); cancelHold();
      removeListeners.forEach(remove => remove());
      controls.dispose();
      const geometries = new Set(), allMaterials = new Set();
      scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) allMaterials.add(object.material); });
      geometries.forEach(g => g.dispose()); allMaterials.forEach(m => m.dispose());
      environment.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
