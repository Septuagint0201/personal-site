import './style.css';
import { createPlayground } from './scene.js';
import { createDiscoveries } from './discoveries.js';

const $ = selector => document.querySelector(selector);
const stage = $('#stage');
const toastElement = $('#toast');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const unlocked = new Set();
const captions = { prism: '01 — PRISM STUDY', halo: '02 — LIQUID KNOT', orbit: '03 — QUIET ORBITS' };
const studies = {
  prism: { index: '01', title: 'Prism study', form: 'Icosahedron', character: 'Faceted / crystalline', description: 'Twenty faces, one borrowed sky. Each edge divides the room into a different reflection. Move closer to see the filament bend through the glass.', prompt: 'Turn down the light, then move the cursor slowly across a facet. Watch the edges hold onto the last glimmer.' },
  halo: { index: '02', title: 'Liquid knot', form: 'Torus knot', character: 'Continuous / fluid', description: 'A single ribbon returns to itself, slipping over and under its own reflection. Its narrow curves gather light like the lip of a glass.', prompt: 'Try Daybreak and follow the warm reflection around the loop. Orbit slowly until the opening becomes a perfect little window.' },
  orbit: { index: '03', title: 'Quiet orbits', form: 'Sphere + glass ring', character: 'Spherical / weightless', description: 'A lens with a world inside it. The central sphere folds the room into a small, curved image while its companion ring catches a different horizon.', prompt: 'Choose Aurora, then raise dispersion. Look through the center and compare its quiet interior with the bright outer rim.' },
};
const atmosphereOrder = ['daybreak', 'moonlight', 'aurora'];
let playground, toastTimer = 0, keyboardHold = 0, atmosphere = 'moonlight', pathsVisible = false;

function toast(message) {
  clearTimeout(toastTimer);
  toastElement.textContent = message;
  toastElement.classList.add('is-visible');
  toastTimer = setTimeout(() => toastElement.classList.remove('is-visible'), 4200);
}
const discoveries = createDiscoveries({
  onUnlock({ id, title, message, restored, isNew }) {
    unlocked.add(id);
    $('#secret-count').textContent = `${unlocked.size} / 3 discoveries`;
    const card = $(`[data-discovery="${id}"]`);
    if (card) {
      card.classList.add('is-discovered');
      card.querySelector('h3').textContent = title;
      card.querySelector('p').textContent = message;
      card.querySelector('.discovery-state').textContent = 'DISCOVERED';
      card.querySelector('button').hidden = false;
    }
    if (!restored) {
      playground?.secret(id);
      toast(`${isNew ? 'Discovered' : 'Welcome back'} · ${title}. ${message}`);
    }
  },
  onAudioChange(enabled, reason) {
    $('#sound-toggle').textContent = enabled ? 'Sound on' : 'Sound off';
    $('#sound-toggle').setAttribute('aria-pressed', String(enabled));
    if (reason) toast(reason);
  },
});

function showError(message) {
  $('#loading').hidden = true;
  $('#fallback').hidden = false;
  $('.interface').inert = true;
  stage.inert = true;
  if ($('#help-dialog').open) $('#help-dialog').close();
  if (message) $('#fallback > p').textContent = message;
  $('#quality-label').textContent = 'RENDERER UNAVAILABLE';
}
try {
  playground = createPlayground(stage, {
    onHit: () => discoveries.hit(),
    onHold: () => discoveries.hold(),
    onStatus: text => { $('#quality-label').textContent = text; },
    onError: showError,
  });
  $('#loading').classList.add('is-loaded');
  setTimeout(() => { $('#loading').hidden = true; }, 700);
} catch (error) {
  console.error('YARD could not start:', error);
  showError();
}

function chooseScene(name) {
  if (!captions[name]) return;
  playground?.setScene(name);
  document.querySelectorAll('[data-scene]').forEach(button => {
    if (!(button instanceof HTMLButtonElement)) return;
    const selected = button.dataset.scene === name;
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('is-active', selected);
  });
  $('#scene-caption').textContent = captions[name];
  const study = studies[name];
  $('#study-index').textContent = `STUDY ${study.index} / 03`;
  $('#study-name').textContent = study.title;
  $('#study-form').textContent = study.form;
  $('#study-character').textContent = study.character;
  $('#study-description').textContent = study.description;
  $('#study-prompt').textContent = study.prompt;
  document.body.dataset.study = name;
}
document.querySelectorAll('button[data-scene]').forEach(button => button.addEventListener('click', () => chooseScene(button.dataset.scene)));
function chooseAtmosphere(name) {
  if (!atmosphereOrder.includes(name)) return;
  atmosphere = name;
  playground?.setAtmosphere(name);
  document.body.dataset.atmosphere = name;
  document.querySelectorAll('[data-atmosphere]').forEach(button => {
    if (button instanceof HTMLButtonElement) button.setAttribute('aria-pressed', String(button.dataset.atmosphere === name));
  });
}
document.querySelectorAll('button[data-atmosphere]').forEach(button => button.addEventListener('click', () => chooseAtmosphere(button.dataset.atmosphere)));
function togglePaths() {
  pathsVisible = !pathsVisible;
  playground?.setLightPaths(pathsVisible);
  $('#paths-toggle').setAttribute('aria-pressed', String(pathsVisible));
  $('#paths-toggle span:last-child').textContent = pathsVisible ? 'Hide light paths' : 'Show light paths';
}
$('#paths-toggle').addEventListener('click', togglePaths);
function syncPause() {
  const paused = playground?.isPaused() ?? true;
  $('#pause').setAttribute('aria-pressed', String(paused));
  $('#pause').textContent = paused ? 'Resume motion' : 'Pause motion';
}
function togglePause() {
  if (motion.matches && playground?.isPaused()) {
    toast('Reduced motion is on. You can still orbit, change the light, and touch the glass.');
    return;
  }
  playground?.setPaused(!playground.isPaused());
  syncPause();
}
function sendPulse() { playground?.pulse(); discoveries.hit(); }
$('#pulse').addEventListener('click', sendPulse);
$('#pause').addEventListener('click', togglePause);
$('#reset').addEventListener('click', () => { playground?.reset(); toast('Back to the beginning. Keep exploring.'); });
$('#sigil').addEventListener('click', () => discoveries.signature());
$('#sound-toggle').addEventListener('click', () => { discoveries.toggleAudio(); });
for (const name of ['light', 'dispersion']) {
  const input = $(`#${name}`);
  input.addEventListener('input', () => {
    $(`#${name}-value`).value = `${input.value}%`;
    if (name === 'light') playground?.setLight(Number(input.value) / 100);
    else playground?.setDispersion(Number(input.value) / 100);
  });
}
$('#controls-toggle').addEventListener('click', () => {
  const button = $('#controls-toggle');
  const expanded = button.getAttribute('aria-expanded') !== 'true';
  button.setAttribute('aria-expanded', String(expanded));
  button.setAttribute('aria-label', expanded ? 'Collapse light controls' : 'Expand light controls');
});
const help = $('#help-dialog');
function chooseNotesTab(name, focus = false) {
  document.querySelectorAll('[data-notes-tab]').forEach(button => {
    const active = button.dataset.notesTab === name;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    $(`#${button.getAttribute('aria-controls')}`).hidden = !active;
    if (active && focus) button.focus();
  });
  help.scrollTop = 0;
}
function openNotes(name = 'studies') { chooseNotesTab(name); help.showModal(); help.scrollTop = 0; }
$('#help-toggle').addEventListener('click', () => openNotes());
$('#collection-toggle').addEventListener('click', () => openNotes('discoveries'));
const tabs = [...document.querySelectorAll('[data-notes-tab]')];
tabs.forEach((button, index) => {
  button.addEventListener('click', () => chooseNotesTab(button.dataset.notesTab));
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    chooseNotesTab(tabs[next].dataset.notesTab, true);
  });
});
document.querySelectorAll('[data-replay]').forEach(button => button.addEventListener('click', () => {
  if (!unlocked.has(button.dataset.replay)) return;
  help.close();
  discoveries.replay(button.dataset.replay);
}));
$('#help-close').addEventListener('click', () => help.close());
help.addEventListener('click', event => {
  const rect = help.getBoundingClientRect();
  if (event.target === help && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) help.close();
});
window.addEventListener('keydown', event => {
  if (help.open || event.target.closest('input, button, a, textarea, select, [contenteditable="true"]')) return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  const key = event.key.toLowerCase();
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(key)) event.preventDefault();
  if (key === 'arrowleft') playground?.nudge(0.06, 0);
  else if (key === 'arrowright') playground?.nudge(-0.06, 0);
  else if (key === 'arrowup') playground?.nudge(0, 0.04);
  else if (key === 'arrowdown') playground?.nudge(0, -0.04);
  else if (event.repeat) return;
  else if (key === ' ') togglePause();
  else if (key === 'p' || key === 'enter') sendPulse();
  else if (key === 'r') playground?.reset();
  else if (key === '?') openNotes('guide');
  else if (key === 'l') chooseAtmosphere(atmosphereOrder[(atmosphereOrder.indexOf(atmosphere) + 1) % atmosphereOrder.length]);
  else if (key === 't') togglePaths();
  else if (key === 'g') keyboardHold = setTimeout(() => discoveries.hold(), 1300);
  else if (['1', '2', '3'].includes(key)) chooseScene(['prism', 'halo', 'orbit'][Number(key) - 1]);
});
window.addEventListener('keyup', event => { if (event.key.toLowerCase() === 'g') clearTimeout(keyboardHold); });
window.addEventListener('blur', () => clearTimeout(keyboardHold));
motion.addEventListener('change', syncPause);
window.addEventListener('pagehide', () => {
  clearTimeout(toastTimer); clearTimeout(keyboardHold);
  discoveries.dispose(); playground?.dispose();
}, { once: true });
// A restored back/forward-cache document needs a fresh graphics and audio lifecycle.
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
syncPause();
