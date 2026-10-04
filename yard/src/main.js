import './style.css';
import './interaction.css';
import { createPlayground } from './scene.js';
import { createDiscoveries } from './discoveries.js';

const $ = selector => document.querySelector(selector);
const stage = $('#stage');
const toastElement = $('#toast');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const unlocked = new Set();
const captions = { prism: '01 — PRISM STUDY', halo: '02 — LIQUID KNOT', orbit: '03 — QUIET ORBITS' };
const studies = {
  prism: { index: '01', title: 'Prism study', form: 'Icosahedron', character: 'Faceted / crystalline', description: 'Twenty faces, one borrowed sky. Each edge divides the room into a different reflection. Drag the crystal itself to bring a new facet into the moonlight.', prompt: 'Turn down the light, then slowly rotate a facet. Watch the edges hold onto the last glimmer. Release the glass and its momentum carries on.' },
  halo: { index: '02', title: 'Liquid knot', form: 'Torus knot', character: 'Continuous / fluid', description: 'A single ribbon returns to itself, slipping over and under its own reflection. Its narrow curves gather light like the lip of a glass.', prompt: 'Drag the knot until its opening becomes a perfect little window. Raise dispersion and follow the split colors around the loop.' },
  orbit: { index: '03', title: 'Quiet orbits', form: 'Sphere + glass ring', character: 'Spherical / weightless', description: 'A lens with a world inside it. The central sphere folds the room into a small, curved image while its companion ring catches a different horizon.', prompt: 'Rotate the glass ring across the sphere. Compare their overlapping refractions, then hold the glass until its small companions drift apart.' },
};
let playground, toastTimer = 0, keyboardHold = 0, pathsVisible = false;

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
    onSceneChange: updateStudy,
    onStatus: text => { $('#quality-label').textContent = text; },
    onError: showError,
  });
  $('#loading').classList.add('is-loaded');
  setTimeout(() => { $('#loading').hidden = true; }, 700);
} catch (error) {
  console.error('YARD could not start:', error);
  showError();
}

function updateStudy(name) {
  if (!captions[name]) return;
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
updateStudy('prism');
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
    toast('Reduced motion is on. You can still look around, rotate the glass, and explore each study.');
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
  button.setAttribute('aria-label', expanded ? 'Hide light and dispersion sliders' : 'Show light and dispersion sliders');
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
  if (help.open || event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  const key = event.key.toLowerCase();
  if (key === 'arrowleft' || key === 'arrowright') {
    event.preventDefault();
    if (!event.repeat) playground?.step(key === 'arrowleft' ? -1 : 1);
    return;
  }
  if (event.target.closest('button, a')) return;
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(key)) event.preventDefault();
  if (key === 'arrowup') playground?.nudge(0, 0.04);
  else if (key === 'arrowdown') playground?.nudge(0, -0.04);
  else if (key === 'a') playground?.nudge(-0.12, 0);
  else if (key === 'd') playground?.nudge(0.12, 0);
  else if (event.repeat) return;
  else if (key === ' ') togglePause();
  else if (key === 'p' || key === 'enter') sendPulse();
  else if (key === 'r') playground?.reset();
  else if (key === '?') openNotes('guide');
  else if (key === 't') togglePaths();
  else if (key === 'g') keyboardHold = setTimeout(() => discoveries.hold(), 1300);
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
