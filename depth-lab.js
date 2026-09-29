/* Background preset playground; shares rendering with the homepage. */
"use strict";
(() => {
  const presets = {
    levitate: { name: "悬浮晶板", tag: "01 / LEVITATE", mode: 0, tilt: 10, depth: 35, shine: 45, description: "一整块通透玻璃托住插画，边缘随视角折光，克制而清晰。" },
    strata: { name: "错层叠影", tag: "02 / STRATA", mode: 1, tilt: 15, depth: 46, shine: 48, description: "插画前后悬起三层玻璃，远近错位让光标运动产生更明显的空间视差。" },
    lens: { name: "弧光透镜", tag: "03 / CONVEX", mode: 2, tilt: 12, depth: 70, shine: 64, description: "圆润弧面把插画轻轻放大，柔和的反光沿曲面游走，像悬浮的光学镜片。" },
    prism: { name: "折光屏风", tag: "04 / PRISM", mode: 3, tilt: 18, depth: 52, shine: 72, description: "三片独立转折的玻璃拼接同一幅画，接缝、折面与微弱色散带来更鲜明的节奏。" },
  };
  const scene = document.getElementById("depth-scene");
  const profile = scene.querySelector(".profile");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const status = document.getElementById("render-status");
  const inputs = Object.fromEntries(["tilt", "depth", "shine"].map(id => [id, document.getElementById(id)]));
  const state = { preset: "levitate", tilt: 10, depth: 35, shine: 45, dark: true, frozen: false, card: !matchMedia("(max-width: 720px)").matches };
  const target = { x: 0.35, y: -0.18 };
  const camera = { ...target };
  let glass, frame = 0, lastFrame = 0;
  const background = window.DepthBackground.createRenderer({
    onChange: () => { updateStatus(); refresh(); if (!background.failed) start(); },
    onImageError: () => { document.getElementById("choice-status").textContent = "插画未加载，当前显示材质底色。"; },
  });
  function paintBackground(ctx, width, height) {
    background.paint(ctx, width, height, { ...state, mode: presets[state.preset].mode }, camera);
    document.getElementById("angle-readout").textContent = `X ${(-camera.y*state.tilt).toFixed(1)}° / Y ${(camera.x*state.tilt).toFixed(1)}°`;
  }
  function refresh(){glass?.refreshBackground();}
  function animate(now){
    frame=0;
    if(document.hidden||state.frozen||reduced.matches||background.failed||glass?.failed)return;
    const delta=Math.hypot(target.x-camera.x,target.y-camera.y);
    if(now-lastFrame>=1000/30){
      const ease=1-Math.exp(-Math.min(now-lastFrame,80)/90);lastFrame=now;
      camera.x+=(target.x-camera.x)*ease;camera.y+=(target.y-camera.y)*ease;refresh();
    }
    if(delta>.001) frame=requestAnimationFrame(animate);
    else {camera.x=target.x;camera.y=target.y;refresh();}
  }
  function start(){if(!frame&&!state.frozen&&!reduced.matches&&!document.hidden&&!background.failed){lastFrame=performance.now()-34;frame=requestAnimationFrame(animate);}}
  function updateStatus(){
    document.querySelector(".fallback").hidden = !background.failed;
    if(background.failed){status.textContent="静态降级 · 3D 不可用";return;}
    status.textContent=glass?.failed?"前景玻璃降级":reduced.matches?"减少动态效果 · 方向键调整":state.frozen?"视角已冻结":"实时 3D · 移动光标探索";
  }
  function updateControls(){
    const preset=presets[state.preset];
    document.documentElement.dataset.theme=state.dark?"dark":"light";
    document.getElementById("theme").textContent=state.dark?"切换浅色":"切换深色";
    document.getElementById("freeze").setAttribute("aria-pressed",String(state.frozen));
    document.getElementById("freeze").textContent=state.frozen?"继续跟随":"冻结视角";
    document.getElementById("profile-toggle").setAttribute("aria-pressed",String(!state.card));
    document.getElementById("profile-toggle").textContent=state.card?"隐藏卡片":"显示卡片";
    profile.hidden=!state.card;
    document.querySelector(".scene-caption span").textContent=preset.tag;
    document.getElementById("preset-tag").textContent=preset.tag;
    document.getElementById("preset-title").textContent=preset.name;
    document.getElementById("preset-description").textContent=preset.description;
    document.querySelectorAll("[data-preset]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.preset===state.preset)));
    for(const id of Object.keys(inputs)){inputs[id].value=state[id];document.getElementById(`${id}-value`).textContent=state[id]+(id==="tilt"?"°":id==="shine"?"%":"");}
    updateStatus();refresh();
  }
  function selectPreset(id){
    const p=presets[id];state.preset=id;state.tilt=p.tilt;state.depth=p.depth;state.shine=p.shine;
    document.getElementById("choice-status").textContent="当前方案尚未保存；可微调后选择或导出。";
    updateControls();
  }
  function exportState(){return {version:1,type:"septuagint-depth-background",preset:state.preset,name:presets[state.preset].name,parameters:{tilt:state.tilt,depth:state.depth,shine:state.shine},theme:state.dark?"dark":"light"};}
  try{
    const saved=JSON.parse(localStorage.getItem("septuagint-depth-choice")||"null");
    if(saved?.version===1&&presets[saved.preset]){
      state.preset=saved.preset;
      for(const id of Object.keys(inputs)){const value=Number(saved.parameters?.[id]);state[id]=Number.isFinite(value)?Math.max(+inputs[id].min,Math.min(+inputs[id].max,value)):presets[saved.preset][id];}
      state.dark=saved.theme!=="light";document.getElementById("choice-status").textContent="已恢复上次选择的背景参数。";
    }
  }catch{}
  if(window.LiquidGlass){
    glass=new window.LiquidGlass.Renderer(scene,{
      maxDpr:1.4,maxPixels:1200000,paintBackground,
      getSurfaces:()=>state.card?scene.querySelectorAll(".glass-surface"):[],
      getState:()=>({material:{ior:1.7,thickness:60,roughness:1.5,dispersion:.12,tint:.15},dark:state.dark,invertedTint:true,edgeProfile:"soft",refraction:true}),
      onStatus:instance=>{document.body.classList.toggle("glass-active",!instance.failed);updateStatus();},
    });glass.resize();
  }else status.textContent="前景渲染器未加载";
  scene.addEventListener("pointermove",event=>{
    if(event.pointerType==="touch"||state.frozen||reduced.matches)return;
    const box=scene.getBoundingClientRect();target.x=Math.max(-1,Math.min(1,(event.clientX-box.left)/box.width*2-1));target.y=Math.max(-1,Math.min(1,(event.clientY-box.top)/box.height*2-1));
    if(glass)glass.light=[event.clientX-box.left,event.clientY-box.top];start();
  },{passive:true});
  scene.addEventListener("pointerleave",()=>{if(state.frozen)return;target.x=target.y=0;start();});
  scene.addEventListener("keydown",event=>{
    if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home"].includes(event.key))return;event.preventDefault();
    if(event.key==="Home")target.x=target.y=0;
    else{const axis=event.key==="ArrowLeft"||event.key==="ArrowRight"?"x":"y";target[axis]=Math.max(-1,Math.min(1,target[axis]+(["ArrowLeft","ArrowUp"].includes(event.key)?-.15:.15)));}
    if(reduced.matches||state.frozen){camera.x=target.x;camera.y=target.y;refresh();}else start();
  });
  document.querySelectorAll("[data-preset]").forEach(b=>b.addEventListener("click",()=>selectPreset(b.dataset.preset)));
  for(const [id,input] of Object.entries(inputs))input.addEventListener("input",()=>{state[id]=+input.value;document.getElementById(`${id}-value`).textContent=state[id]+(id==="tilt"?"°":id==="shine"?"%":"");document.getElementById("choice-status").textContent="参数已调整，尚未保存。";refresh();});
  document.getElementById("theme").addEventListener("click",()=>{state.dark=!state.dark;updateControls();});
  document.getElementById("freeze").addEventListener("click",()=>{state.frozen=!state.frozen;if(state.frozen){cancelAnimationFrame(frame);frame=0;}else start();updateControls();});
  document.getElementById("profile-toggle").addEventListener("click",()=>{state.card=!state.card;updateControls();});
  document.getElementById("reset").addEventListener("click",()=>selectPreset(state.preset));
  document.getElementById("choose").addEventListener("click",()=>{
    try{localStorage.setItem("septuagint-depth-choice",JSON.stringify(exportState()));document.getElementById("choice-status").textContent=`已选择「${presets[state.preset].name}」。参数仅保存于此浏览器，尚未应用到主页。`;}
    catch{document.getElementById("choice-status").textContent="浏览器无法保存，请使用导出参数。";}
  });
  document.getElementById("export").addEventListener("click",()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(exportState(),null,2)],{type:"application/json"}));const link=document.createElement("a");link.href=url;link.download=`septuagint-depth-${state.preset}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  reduced.addEventListener("change",()=>{cancelAnimationFrame(frame);frame=0;updateStatus();if(!reduced.matches)start();});
  document.addEventListener("visibilitychange",()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else{refresh();start();}});
  window.addEventListener("resize",()=>glass?.resize());
  document.fonts.ready.then(refresh);updateControls();
})();
