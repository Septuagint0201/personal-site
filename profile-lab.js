import { DEFAULT_PROFILE, LIMITS, normalizeProfile, curveAt, dimensions, footprintDistance, spectrum, exportProfile, importProfile } from './glass-profile.js';
import { createProfileRenderer } from './profile-lab-renderer.js';

const $ = id => document.getElementById(id), storageKey = 'septuagint-thickness-lab-v1';
let state = { ...DEFAULT_PROFILE }, reference = { ...DEFAULT_PROFILE }, settings = { view: 'glass', background: 'chart', compare: false };
let renderer, frame = 0, drag = null, objectDrag = null;
try { const saved=localStorage.getItem(storageKey); if(saved)state=importProfile(JSON.parse(saved)); } catch { /* Invalid older choices do not replace the baseline. */ }
const specs = [
  ['geometry-controls','width','宽度','px',1,1],['geometry-controls','height','高度','px',1,1],['geometry-controls','radius','圆角半径','px',1,1],
  ['profile-controls','thickness','中央总厚度','px',1,1],['profile-controls','shoulder','肩部过渡宽度','px',.1,1],
  ['profile-controls','edge','外缘保留厚度','%',1,100],['profile-controls','front','正面厚度占比','%',1,100],
  ['hyperbolic-controls','bias','双曲偏置','',.01,1],['hyperbolic-controls','exponent','收平阶数','',.1,1],
  ['bezier-controls','x1','控制点 1 · 水平位置','',.01,1],['bezier-controls','y1','控制点 1 · 高度','',.01,1],
  ['bezier-controls','x2','控制点 2 · 水平位置','',.01,1],['bezier-controls','y2','控制点 2 · 高度','',.01,1],
  ['optical-controls','ior','折射率 n','',.01,1],['optical-controls','dispersion','色散 Δn','',.01,1],['optical-controls','roughness','光学雾度','px',.1,1],
];
const inputs = new Map();
for(const [parent,key,label,unit,step,multiplier] of specs){
  const [min,max]=LIMITS[key].map(v=>v*multiplier),row=document.createElement('div');row.className='control';
  row.innerHTML=`<div class="control-top"><label for="${key}">${label}${unit?` <small>/ ${unit}</small>`:''}</label><input type="number" id="${key}-value" aria-label="${label}数值" min="${min}" max="${max}" step="${step}"></div><input id="${key}" type="range" min="${min}" max="${max}" step="${step}"/><div class="limits"><span>${min}${unit}</span><span>${max}${unit}</span></div>`;
  $(parent).append(row);const range=$(key),number=$(`${key}-value`);inputs.set(key,{range,number,multiplier,row});
  const update=event=>{if(event.target.value===''){sync();return;}const value=Number(event.target.value)/multiplier;if(!Number.isFinite(value))return;if(state[key]===value){sync();return;}state=normalizeProfile({...state,[key]:value});if(key==='y2'&&value<1)$('flat-join').checked=false;changed();};
  range.addEventListener('input',update);number.addEventListener('change',update);number.addEventListener('blur',update);
  number.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();update(event);}});
}
function announce(message){$('status').textContent=message;}
function changed(){ $('preset').value='custom';sync();request(); }
function sync(){
  for(const [key,{range,number,multiplier,row}] of inputs){
    const value=Number((state[key]*multiplier).toFixed(3));range.value=number.value=String(value);
    const disabled=(key==='height'&&state.shape==='circle')||(key==='radius'&&['circle','pill'].includes(state.shape))||(key==='y2'&&$('flat-join').checked);
    range.disabled=number.disabled=disabled;row.style.opacity=disabled?'.45':'1';
  }
  $('hyperbolic-controls').hidden=state.kind!=='hyperbolic';$('bezier-controls').hidden=state.kind!=='bezier';
  $('bezier-handles').setAttribute('visibility',state.kind==='bezier'?'visible':'hidden');$('bezier-handles').removeAttribute('hidden');
  $('edit-bezier').textContent=state.kind==='bezier'?'使用双曲曲线':'切换 Bézier 编辑';
  $('flat-join').disabled=state.kind!=='bezier';
  $('curve-hint').textContent=state.kind==='bezier'?'拖动两个圆点调节；方向键微调，Shift 加快。虚线为固定参考。':'从玻璃外缘到内部平面。调节偏置与收平阶数，或切换 Bézier 直接拖点。';
  for(const button of document.querySelectorAll('[data-shape]'))button.setAttribute('aria-pressed',String(button.dataset.shape===state.shape));
  const d=dimensions(state),rgb=spectrum(state);
  $('dimension-reading').textContent=`${d.width.toFixed(0)} × ${d.height.toFixed(0)} × ${state.thickness.toFixed(1)} px`;
  $('edge-reading').textContent=`${(state.edge*state.thickness).toFixed(1)} px / ${(state.edge*100).toFixed(0)}%`;
  $('center-reading').textContent=`${state.thickness.toFixed(1)} px`;
  $('shoulder-reading').textContent=`${d.shoulder.toFixed(1)} px${d.shoulder<state.shoulder-.01?' · 按形状缩短':''}`;
  $('spectrum-reading').textContent=`有效 RGB 折射率：${rgb.map(v=>v.toFixed(3)).join(' / ')}`;
}
const plot={x:48,y:24,w:564,h:186};
function curvePath(profile){
  return Array.from({length:193},(_,i)=>{const t=i/192,h=profile.edge+(1-profile.edge)*curveAt(t,profile).height;return `${i?'L':'M'}${(plot.x+t*plot.w).toFixed(2)},${(plot.y+(1-h)*plot.h).toFixed(2)}`;}).join(' ');
}
function sectionPath(profile,scale){
  const d=dimensions(profile),cutY=profile.shape==='triangle'?-d.height/2+d.inradius:0,upper=[],lower=[];
  for(let i=0;i<=384;i++){
    const x=(i/384-.5)*d.width,inward=-footprintDistance(x,cutY,profile);if(inward<-.001)continue;
    const h=profile.thickness*(profile.edge+(1-profile.edge)*curveAt(inward/d.shoulder,profile).height);
    upper.push(`${(320+x*scale).toFixed(2)},${(110-h*profile.front*scale).toFixed(2)}`);
    lower.push(`${(320+x*scale).toFixed(2)},${(110+h*(1-profile.front)*scale).toFixed(2)}`);
  }
  return upper.length?`M${upper.join(' L')} L${lower.reverse().join(' L')} Z`:'';
}
function draw(){
  frame=0;const line=curvePath(state);$('curve-line').setAttribute('d',line);$('curve-fill').setAttribute('d',`${line} L612,210 L48,210 Z`);$('curve-reference').setAttribute('d',curvePath(reference));
  const handles=[[state.x1,state.y1],[state.x2,state.y2]].map(([x,y])=>[plot.x+x*plot.w,plot.y+(1-state.edge-(1-state.edge)*y)*plot.h]);
  handles.forEach(([x,y],i)=>{const circle=$(`handle-${i+1}`),target=$(`grab-${i+1}`);for(const node of [circle,target]){node.setAttribute('cx',x);node.setAttribute('cy',y);}circle.setAttribute('aria-valuenow',state[`y${i+1}`]);circle.setAttribute('aria-valuetext',`水平 ${state[`x${i+1}`].toFixed(2)}，高度 ${state[`y${i+1}`].toFixed(2)}`);});
  $('handle-lines').setAttribute('d',`M48,${plot.y+(1-state.edge)*plot.h} L${handles[0]} M${handles[1]} L612,24`);
  const width=Math.max(dimensions(state).width,dimensions(reference).width),thickness=Math.max(state.thickness,reference.thickness);
  const scale=Math.min(560/width,86/(thickness*Math.max(state.front,1-state.front,reference.front,1-reference.front)));
  $('section-solid').setAttribute('d',sectionPath(state,scale));$('section-reference').setAttribute('d',sectionPath(reference,scale));
  $('section-midline').setAttribute('d','M28,110H612');$('section-scale').textContent=`1 px → ${scale.toFixed(2)} 图示单位`;
  const x=320+dimensions(state).width/2*scale+15,top=110-state.thickness*state.front*scale,bottom=110+state.thickness*(1-state.front)*scale;
  $('section-dimensions').innerHTML=`<path d="M${x-4},${top}h8 M${x},${top}V${bottom} M${x-4},${bottom}h8"/><text x="${Math.min(570,x+9)}" y="${(top+bottom)/2+3}">${state.thickness.toFixed(0)} px</text>`;
  renderer?.update(state,reference,settings);
}
function request(){if(!frame)frame=requestAnimationFrame(draw);}
function setHandle(index,x,y){
  x=Math.max(index===1 ? .02 : state.x1+.04,Math.min(index===1 ? state.x2-.04 : .98,x));
  y=Math.max(index===1?0:state.y1,Math.min(index===1?state.y2:1,y));
  if(index===2&&$('flat-join').checked)y=1;
  state=normalizeProfile({...state,[`x${index}`]:x,[`y${index}`]:y});changed();
}
for(let index=1;index<=2;index++){
  const handle=$(`handle-${index}`);
  const beginDrag=event=>{if(event.button!==0)return;event.preventDefault();drag={index,id:event.pointerId};handle.focus({preventScroll:true});handle.setPointerCapture(event.pointerId);};
  handle.addEventListener('pointerdown',beginDrag);$(`grab-${index}`).addEventListener('pointerdown',beginDrag);
  handle.addEventListener('pointermove',event=>{if(drag?.id!==event.pointerId)return;const matrix=$('curve-editor').getScreenCTM();if(!matrix)return;const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());setHandle(index,(p.x-plot.x)/plot.w,((1-(p.y-plot.y)/plot.h)-state.edge)/(1-state.edge));});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(type,event=>{if(drag?.id===event.pointerId)drag=null;});
  handle.addEventListener('keydown',event=>{const changes={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[event.key];if(!changes)return;event.preventDefault();const step=event.shiftKey ? .05 : .01;setHandle(index,state[`x${index}`]+changes[0]*step,state[`y${index}`]+changes[1]*step);});
}
$('edit-bezier').addEventListener('click',()=>{state.kind=state.kind==='bezier'?'hyperbolic':'bezier';if(state.kind==='bezier'&&$('flat-join').checked)state.y2=1;changed();});
$('flat-join').addEventListener('change',()=>{if($('flat-join').checked)state.y2=1;changed();});
const presets={current:{...DEFAULT_PROFILE},crystal:{...DEFAULT_PROFILE,kind:'bezier',x1:.08,y1:.65,x2:.42,y2:1,thickness:72,shoulder:52,edge:.12,ior:1.9,dispersion:.22},lens:{...DEFAULT_PROFILE,kind:'bezier',x1:.25,y1:.2,x2:.65,y2:1,thickness:48,shoulder:80,edge:.04,ior:1.65,dispersion:.06},prism:{...DEFAULT_PROFILE,kind:'bezier',x1:.03,y1:.88,x2:.18,y2:1,thickness:90,shoulder:32,edge:.32,ior:2.3,dispersion:.35}};
$('preset').addEventListener('change',event=>{if(!presets[event.target.value])return;state={...presets[event.target.value]};$('flat-join').checked=state.y2===1;sync();request();});
for(const button of document.querySelectorAll('[data-shape]'))button.addEventListener('click',()=>{
  const shape=button.dataset.shape,measure={card:[320,200,36],pill:[180,56,28],circle:[160,160,80],triangle:[180,156,10]}[shape];
  state=normalizeProfile({...state,shape,width:measure[0],height:measure[1],radius:measure[2]});changed();
});
for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>{settings.view=button.dataset.view;for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b===button));request();});
for(const button of document.querySelectorAll('[data-background]'))button.addEventListener('click',()=>{settings.background=button.dataset.background;for(const b of document.querySelectorAll('[data-background]'))b.setAttribute('aria-pressed',String(b===button));request();});
function compare(){ $('compare').setAttribute('aria-pressed',String(settings.compare));$('viewport').classList.toggle('comparing',settings.compare);document.querySelector('.reference-label').hidden=!settings.compare;request(); }
$('compare').addEventListener('click',()=>{settings.compare=!settings.compare;compare();});
$('pin-reference').addEventListener('click',()=>{reference={...state};settings.compare=true;compare();announce('已固定当前曲线与形体。右侧继续调整，左侧保持参考。');});
$('reset').addEventListener('click',()=>{state={...DEFAULT_PROFILE};$('flat-join').checked=true;$('preset').value='current';sync();request();announce('已恢复主页参数起点，本机保存的选择仍保留。');});
$('save-local').addEventListener('click',()=>{try{localStorage.setItem(storageKey,JSON.stringify(exportProfile(state)));announce('已保存到本机，仅供这个 Lab 下次恢复。');}catch{announce('浏览器无法保存本机设置，请使用导出参数。');}});
$('export').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(exportProfile(state),null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='septuagint-ui-glass-profile.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);announce('已导出统一参数，包含形状、厚度曲线、RGB 折射率和采样表。');});
$('import').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{if(file.size>131072)throw new Error('文件过大，请选择这个 Lab 导出的参数 JSON。');state=importProfile(JSON.parse(await file.text()));$('flat-join').checked=state.y2===1;changed();announce(`已载入 ${file.name}，尚未覆盖本机保存。`);}catch(error){announce(error.message);}});
const canvas=$('glass-view');
try{renderer=createProfileRenderer(canvas,{onReady:()=>{$('render-status').textContent='● 同曲线 · 实体界面折射';$('render-fallback').hidden=true;},onError:message=>{$('render-status').textContent='曲线编辑可用';$('render-fallback').hidden=false;$('render-fallback').textContent=message;}});}catch(error){$('render-status').textContent='曲线编辑可用';$('render-fallback').hidden=false;console.warn('Thickness Lab:',error.message);}
canvas.addEventListener('pointerdown',event=>{if(event.button!==0||!event.isPrimary||!renderer)return;event.preventDefault();objectDrag={id:event.pointerId,x:event.clientX,y:event.clientY,rotation:renderer.rotation};canvas.setPointerCapture(event.pointerId);});
canvas.addEventListener('pointermove',event=>{if(objectDrag?.id!==event.pointerId)return;renderer.rotate(objectDrag.rotation[0]+(event.clientX-objectDrag.x)*.006,objectDrag.rotation[1]+(event.clientY-objectDrag.y)*.006);});
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,event=>{if(objectDrag?.id===event.pointerId)objectDrag=null;});
canvas.addEventListener('keydown',event=>{if(!renderer)return;const [y,p]=renderer.rotation,delta={ArrowLeft:[-.04,0],ArrowRight:[.04,0],ArrowUp:[0,-.04],ArrowDown:[0,.04]}[event.key];if(event.key==='Home'){event.preventDefault();renderer.rotate(0,0);}else if(delta){event.preventDefault();renderer.rotate(y+delta[0],p+delta[1]);}});
$('front-view').addEventListener('click',()=>renderer?.rotate(0,0));$('perspective-view').addEventListener('click',()=>renderer?.rotate(-.34,.28));
window.addEventListener('blur',()=>{drag=objectDrag=null;});
window.addEventListener('pagehide',event=>{if(!event.persisted){cancelAnimationFrame(frame);renderer?.dispose();}});
$('flat-join').checked=state.y2===1;if(JSON.stringify(state)!==JSON.stringify(DEFAULT_PROFILE))$('preset').value='custom';sync();request();
