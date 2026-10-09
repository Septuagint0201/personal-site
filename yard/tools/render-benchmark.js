// Development-only: Vite's production page list excludes this harness.
// ?baseline loads a local .baseline copy; ?quality=high exercises that preset.
const params = new URLSearchParams(location.search);
const { createLiquidRenderer } = await import(/* @vite-ignore */ params.has('baseline')
  ? './.baseline/chapter02-renderer.js' : '../src/chapter02-renderer.js');
const canvas = document.querySelector('canvas');
const result = document.querySelector('#result');
const originalGetContext = canvas.getContext.bind(canvas);
let renderer, gl, timer, pending = [], samples = [], cpu = [], submission = [], frameIndex = 0;
let drawIndex = 0, running = false, firstDraw = 0, boundFramebuffer = null;
let preroll = Math.max(0, Math.min(600, Math.round(Number(params.get('time') || 0)*60)));
const nativeRaf = requestAnimationFrame;
const flowing = params.has('flow');
let fixedTime = performance.now();
window.requestAnimationFrame = callback => nativeRaf(() => {
  const before = frameIndex, started = performance.now();
  callback(fixedTime += 1000 / 60);
  if (frameIndex > before && before >= 16) submission.push(performance.now() - started);
});
const stages = ['trace', 'room', 'temporal', 'bloom 1', 'bloom 2', 'bloom 3', 'bloom 4', 'resolve'];
const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const presets = { entrance: [[0,1.65,4.5],0,-.045], close: [[.3,1.65,.8],0,-.15], side: [[0,1.65,2],1.1,-.05] };
const initialPreset = Object.hasOwn(presets, params.get('view')) ? params.get('view') : 'entrance';
const activeEffect = ['resonance', 'constellation', 'afterimage'].includes(params.get('effect')) ? params.get('effect') : null;
let preset = 'entrance';
function collect() {
  const disjoint = timer && gl.getParameter(timer.GPU_DISJOINT_EXT);
  pending = pending.filter(item => {
    if (!gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE)) return true;
    if (!disjoint && item.frame >= 16) samples.push({ frame: item.frame, stage: item.stage, ms: gl.getQueryParameter(item.query, gl.QUERY_RESULT)/1e6 });
    gl.deleteQuery(item.query);
    return false;
  });
}
function finish() {
  collect();
  if (pending.length) { requestAnimationFrame(finish); return; }
  const byFrame = new Map();
  samples.forEach(item => {const group=byFrame.get(item.frame)||[];group.push(item.ms);byFrame.set(item.frame,group);});
  const complete = [...byFrame.values()].filter(group=>group.length===stages.length).map(group=>group.reduce((a,b)=>a+b,0));
  window.benchResult = {
    version: params.has('baseline') ? 'baseline' : 'current', preset,
    effect: activeEffect, simulationTime: Number(params.get('time') || 0),
    flowing, submissionMs: median(submission),
    quality: renderer.state.quality, resolution: [canvas.width,canvas.height],
    gpuTimer: Boolean(timer), frames: timer ? complete.length : cpu.length,
    frameMs: median(timer ? complete : cpu),
    stages: Object.fromEntries(stages.map(stage => [stage, median(samples.filter(s=>s.stage===stage).map(s=>s.ms))])),
  };
  result.textContent = JSON.stringify(window.benchResult,null,2);
  document.body.dataset.status = 'done';
}
canvas.getContext = (...args) => {
  gl = originalGetContext(...args);
  timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const draw = gl.drawArrays.bind(gl);
  const bind = gl.bindFramebuffer.bind(gl);
  gl.bindFramebuffer = (target, framebuffer) => { if(target===gl.FRAMEBUFFER)boundFramebuffer=framebuffer;bind(target,framebuffer); };
  gl.drawArrays = (...drawArgs) => {
    if (!running) {
      draw(...drawArgs);
      if(preroll>0 && boundFramebuffer===null && --preroll===0){renderer.setPaused(!flowing);requestAnimationFrame(()=>run(initialPreset));}
      return;
    }
    const stage = drawIndex++ % stages.length;
    if (stage === 0) { collect(); if(!timer)gl.finish(); firstDraw=performance.now(); }
    const query = timer ? gl.createQuery() : null;
    if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT,query);
    draw(...drawArgs);
    if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); pending.push({query,stage:stages[stage],frame:frameIndex}); }
    if (stage === stages.length-1) {
      if (!timer) gl.finish();
      if (frameIndex>=16) cpu.push(performance.now()-firstDraw);
      frameIndex++;
      if(frameIndex%16===0)document.body.dataset.frames=String(frameIndex);
      if (frameIndex < 112) { if (!flowing) renderer.look(0,0); }
      else {
        running=false;
        window.benchImage = canvas.toDataURL('image/png');
        requestAnimationFrame(finish);
      }
    }
  };
  return gl;
};
function run(name) {
  if(running)return;
  preset=name;
  const [position,yaw,pitch]=presets[name];
  renderer.state.position=[...position]; renderer.state.yaw=yaw; renderer.state.pitch=pitch;
  pending.forEach(p=>gl.deleteQuery(p.query)); pending=[]; samples=[]; cpu=[]; submission=[];
  frameIndex=0;drawIndex=0;running=true;
  document.body.dataset.frames='0';
  document.body.dataset.status='running';result.textContent='Measuring '+name+'…';
  renderer.look(0,0);
}
renderer=createLiquidRenderer(canvas,{
  onReady(){renderer.setPaused(preroll===0 && !flowing);renderer.setQuality(params.get('quality')==='high'?'high':'ultra');if(activeEffect)renderer.setEffect(activeEffect,1e9);if(!preroll)requestAnimationFrame(()=>run(initialPreset));},
  onError(error){result.textContent=String(error);document.body.dataset.status='failed';},
});
Object.keys(presets).forEach(name=>document.getElementById(name).onclick=()=>run(name));
