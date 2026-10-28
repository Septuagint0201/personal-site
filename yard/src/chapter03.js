import './chapter03.css';
import './interaction.css';
import './glass-select.css';
import { createGlassSelect } from './glass-select.js';
import { createDesertScene } from './chapter03-scene.js';
import { createUIGlass } from './ui-glass.js';
import { placeNoticeAbovePanel } from './notice-placement.js';
const uiGlass = createUIGlass();
const $ = selector => document.querySelector(selector);
const stage = $('#desert-stage'), study = $('#desert-study'), notes = $('#notes');
const positionAnnouncement = placeNoticeAbovePanel($('#announcement'), $('.study-controls'));
let scene, paused = false, announcementTimer, readyTimer, lastPhase;
function announce(text) {
  clearTimeout(announcementTimer); $('#announcement').textContent = text;
  $('#announcement').classList.add('is-visible');
  positionAnnouncement();
  announcementTimer = setTimeout(() => $('#announcement').classList.remove('is-visible'), 4200);
}
function showPause(value) {
  paused = value;
  const button = $('#pause');
  if (button.getAttribute('aria-pressed') === String(value)) return;
  button.setAttribute('aria-pressed', String(value));
  button.textContent = value ? 'Resume' : 'Pause';
}
function status(state) {
  if (!$('#fallback').hidden) $('#fallback').hidden = true;
  if (!$('#loading').classList.contains('is-ready')) {
    $('#loading').classList.add('is-ready');
    readyTimer = setTimeout(() => { $('#loading').hidden = true; }, 650);
  }
  showPause(state.paused);
  $('#tether-fill').style.transform = `scaleX(${Math.max(0, 1 - state.distance / 1.75)})`;
  if (lastPhase === state.phase) return;
  lastPhase = state.phase; study.dataset.phase = state.phase;
  const free = state.phase === 'released';
  $('#phase-name').textContent = free ? 'RELEASED / SOFT GLASS' : 'SUSPENDED';
  $('#state-hint').textContent = free ? 'No tether. Just touch, weight, and a little memory.' : 'A gentle push returns. A little further, and it lets go.';
  $('#gesture-hint').textContent = free ? 'Drag to stretch · Press into the sand · Right-drag or hold Squeeze' : 'Drag the crystal beyond its halo · Trace the sand';
  $('#squeeze').disabled = !free;
}
try {
  scene = createDesertScene(stage, {
    onFrame: uiGlass.capture,
    onStatus: status,
    onDetach: () => announce('It lets go. Drag to stretch the glass; hold Squeeze to press it flat.'),
    onReturn: () => announce('The desert gives it back.'),
    onError: message => { $('#fallback-message').textContent = message; $('#fallback').hidden = false; },
  });
} catch (error) {
  console.error('YARD desert:', error);
  $('#loading').hidden = true; $('#fallback').hidden = false;
}
$('#quality').value = matchMedia('(max-width: 760px), (pointer: coarse)').matches ? 'high' : 'ultra';
$('#quality').addEventListener('change', event => scene?.setQuality(event.target.value));
const qualityMenu = createGlassSelect($('#quality'), { theme: 'sand' });
$('#push').addEventListener('click', () => scene?.push());
$('#smooth').addEventListener('click', () => { scene?.smoothSand(); announce('The sand is still again.'); });
$('#restart').addEventListener('click', () => { releaseSqueeze(); scene?.reset(); announce('A new beginning.'); });
$('#pause').addEventListener('click', () => { showPause(!paused); scene?.setPaused(paused); });
$('#retry').addEventListener('click', () => location.reload());
let pausedBeforeNotes = false;
$('#notes-open').addEventListener('click', () => {
  pausedBeforeNotes = paused; releaseSqueeze(); scene?.releaseInput();
  scene?.setPaused(true); notes.showModal();
});
notes.addEventListener('close', () => { releaseSqueeze(); scene?.setPaused(pausedBeforeNotes); });
const squeezeSources = new Set();
function squeeze(source, value) {
  if (value && !$('#squeeze').disabled && !document.hidden && !notes.open) squeezeSources.add(source);
  else squeezeSources.delete(source);
  const active = squeezeSources.size > 0;
  $('#squeeze').setAttribute('aria-pressed', String(active)); scene?.squeeze(active);
}
function releaseSqueeze() { squeezeSources.clear(); squeeze('reset', false); }
$('#squeeze').addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); squeeze(`pointer-${event.pointerId}`, true);
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) $('#squeeze').addEventListener(name, event => squeeze(`pointer-${event.pointerId}`, false));
$('#squeeze').addEventListener('keydown', event => {
  if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); squeeze('key', true); }
});
$('#squeeze').addEventListener('keyup', event => {
  if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); squeeze('key', false); }
});
$('#squeeze').addEventListener('blur', releaseSqueeze);
window.addEventListener('blur', releaseSqueeze);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseSqueeze(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { releaseSqueeze(); scene?.releaseInput(); }
  if (notes.open || event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.target.closest?.('button,a,select,input')) return;
  if (event.key.toLowerCase() === 'p') scene?.push();
  if (event.key.toLowerCase() === 'r') { releaseSqueeze(); scene?.reset(); }
  if (event.code === 'Space') { event.preventDefault(); showPause(!paused); scene?.setPaused(paused); }
});
window.addEventListener('pagehide', event => {
  releaseSqueeze(); scene?.releaseInput();
  if (!event.persisted) { clearTimeout(announcementTimer); clearTimeout(readyTimer); qualityMenu.dispose(); scene?.dispose(); }
});
