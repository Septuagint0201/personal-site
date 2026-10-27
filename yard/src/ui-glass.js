import '../../ui-glass-preset.js';
import '../../liquid-glass.js';
import '../../ui-surface-buttons.js';
import './ui-glass.css';
import './capsule-controls.css';
import './notes-layout.css';
import '../../ui-surface-buttons.css';
import { createFramePacer } from './frame-pacing.js';

export const UI_GLASS = window.SiteGlassPreset;

// One compositor per page, fed immediately after the scene's final draw.
// A retained snapshot supports paused scenes, dialogs and transient picker UI.
export function createUIGlass({ dark = false, maxFps = 0 } = {}) {
  const surfaceButtons = window.SiteSurfaceButtons;
  surfaceButtons.applyTheme(document.documentElement, dark);
  document.documentElement.style.setProperty('--ui-glass-radius', `${UI_GLASS.profile.radius}px`);
  const stage = document.createElement('div'), buffer = document.createElement('canvas');
  stage.className = 'ui-glass-stage'; stage.setAttribute('aria-hidden', 'true');
  stage.append(buffer); document.body.append(stage);
  const snapshot = document.createElement('canvas'), context = snapshot.getContext('2d', { alpha: false });
  let ready = false, disposed = false, lastCapture = -Infinity, pending = 0, until = 0, captureTimer = 0;
  let capturedCanvas = null, capturedVersion;
  let overlayHost = null, overlayStage = null, overlayRenderer = null;
  const pacer = maxFps > 0 ? createFramePacer(maxFps) : null;
  const overlayActive = () => ready && overlayHost && overlayRenderer?.ready && !overlayRenderer.failed;
  const surfaces = (scope = null, omitted = null) => {
    const nodes = [...document.querySelectorAll('button, a, dialog, .notes-card, .controls, .study-controls, .interaction-dock, .glass-select-menu, .move-stick, .stick-thumb, .toast, .announcement, .gallery-announcement')]
      .filter(node => !node.matches('.glass-arrow, .side-select, .stick-direction, .notes-shell')
        && !node.closest('.noscript, noscript, .loading, .render-loading, .fallback, .render-fallback'));
    for (const node of nodes) if (!node.classList.contains('ui-glass-surface')) {
      node.classList.add('ui-glass-surface', 'glass-surface');
      const radius = node.matches('.glass-select-menu') ? 28 : UI_GLASS.profile.radius;
      node.dataset.radius = String(radius);
      if (node.matches('.notes-card')) {
        node.dataset.radii = `${radius},176,${radius},${radius}`;
        node.style.borderRadius = `${radius}px 176px ${radius}px ${radius}px`;
      } else node.style.borderRadius = `${radius}px`;
      if (node.matches('button, a, [role="option"]')
        && !node.matches('.thumbnail, .dialog-close, .notes-close, .close-notes, .controls-toggle')
        && /[\p{L}\p{N}]/u.test(node.textContent)) node.classList.add('capsule-control');
      if (node.matches('button, a, [role="option"], .stick-thumb')) node.setAttribute('data-glass-compact', '');
      if (getComputedStyle(node).position === 'static') node.style.position = 'relative';
    }
    return surfaceButtons.classify(nodes).filter(node => (!scope || node === scope || scope.contains(node))
      && (!omitted || (node !== omitted && !omitted.contains(node)))
      && (node.checkVisibility ? node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : node.getClientRects().length > 0)
      && node.getBoundingClientRect().width > 1 && node.getBoundingClientRect().height > 1);
  };
  const renderer = new window.LiquidGlass.Renderer(stage, {
    canvas: buffer, attachSurfaces: true, hideBackdrop: true, scissorSurfaces: true,
    maxDpr: 2, maxPixels: 1600000,
    getSurfaces: () => surfaces(null, overlayActive() ? overlayHost : null),
    getState: () => ({ material: UI_GLASS.material, profile: UI_GLASS.profile, dark, invertedTint: true, refraction: true }),
    getSurfaceEffects: node => ({ reflection: node.matches('button, a') ? .7 : 1,
      hover: node.matches(':hover, :focus-visible') ? 1 : 0, interactive: node.matches('button, a, [role="option"]') }),
    paintBackground(ctx, width, height) { if (ready) ctx.drawImage(snapshot, 0, 0, width, height); },
    onStatus(instance) { document.body.classList.toggle('ui-glass-ready', ready && instance.ready && !instance.failed); },
  });
  function syncOverlay() {
    const host = document.querySelector('dialog[open]') || document.querySelector('.glass-select-menu:not([hidden])');
    if (host === overlayHost) return false;
    overlayHost = host;
    if (!host) { overlayStage?.remove(); return true; }
    // Native scrolling exists inside notes and pickers. Give these a viewport
    // canvas in their own DOM/top-layer context, behind their text. Stationary
    // HUD and transformed 3D menu cards keep their existing stacking/composition.
    if (!overlayStage) {
      overlayStage = document.createElement('div');
      overlayStage.className = 'ui-glass-viewport'; overlayStage.setAttribute('aria-hidden', 'true');
      overlayStage.append(document.createElement('canvas'));
    }
    host.prepend(overlayStage);
    if (!overlayRenderer) overlayRenderer = new window.LiquidGlass.Renderer(overlayStage, {
      attachSurfaces: false, overlay: true, scissorSurfaces: true,
      maxDpr: 2, maxPixels: 1600000,
      getSurfaces: () => overlayHost ? surfaces(overlayHost) : [],
      getSurfaceClip(node) {
        const scroller = node.parentElement?.closest('.notes-scroll, .glass-select-menu');
        return scroller?.getBoundingClientRect();
      },
      getState: () => ({ material: UI_GLASS.material, profile: UI_GLASS.profile, dark, invertedTint: true, refraction: true }),
      getSurfaceEffects: node => ({ reflection: node.matches('button, a') ? .7 : 1,
        hover: node.matches(':hover, :focus-visible') ? 1 : 0, interactive: node.matches('button, a, [role="option"]') }),
      paintBackground(ctx, width, height) { if (ready) ctx.drawImage(snapshot, 0, 0, width, height); },
      // Reconcile fallback per-surface layers both when this context is lost
      // and when the fixed viewport context returns.
      onStatus() { renderer.request(); invalidate(); },
    });
    overlayRenderer.light = [...renderer.light];
    overlayRenderer.resize();
    if (ready) overlayRenderer.refreshBackground();
    return true;
  }
  document.body.dataset.uiGlass = UI_GLASS.revision;
  surfaces(); // Establish the same hierarchy while the scene/GL is preparing.
  function update(now) {
    pending = 0;
    if (disposed || document.hidden) return;
    if (!ready || renderer.failed) { surfaces(); return; }
    if (syncOverlay()) renderer.renderNow();
    if (!pacer || pacer.ready(now)) (overlayActive() ? overlayRenderer : renderer).request();
    if (now < until) pending = requestAnimationFrame(update);
  }
  function invalidate() {
    if (disposed) return;
    until = performance.now() + 350;
    if (!pending) pending = requestAnimationFrame(update);
  }
  function pointer(event) {
    renderer.light = [event.clientX, event.clientY];
    if (overlayRenderer) overlayRenderer.light = [...renderer.light];
    if (event.target.closest?.('.ui-glass-surface')) invalidate();
  }
  const events = ['click', 'input', 'change', 'focusin', 'focusout', 'pointerdown', 'pointerup', 'keydown', 'keyup', 'toggle', 'close'];
  for (const event of events) document.addEventListener(event, invalidate, true);
  function resize() { surfaces(); renderer.resize(); overlayRenderer?.resize(); invalidate(); }
  function scroll() {
    if (disposed || !ready || document.hidden) return;
    if (syncOverlay()) renderer.renderNow();
    (overlayActive() ? overlayRenderer : renderer).renderNow();
  }
  const overlayObserver = new MutationObserver(invalidate);
  overlayObserver.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open', 'hidden'] });
  window.addEventListener('resize', resize);
  document.addEventListener('scroll', scroll, true);
  document.addEventListener('pointermove', pointer, { passive: true });
  function capture(canvas, version) {
    if (disposed || renderer.failed || document.hidden || !canvas?.width || !canvas?.height) return;
    if (version !== undefined && canvas === capturedCanvas && version === capturedVersion) return;
    capturedCanvas = canvas; capturedVersion = version;
    const now = performance.now();
    const ratio = Math.min(2, devicePixelRatio || 1, Math.sqrt(1600000 / (innerWidth * innerHeight)));
    const width = Math.round(innerWidth * ratio), height = Math.round(innerHeight * ratio);
    if (snapshot.width !== width) snapshot.width = width;
    if (snapshot.height !== height) snapshot.height = height;
    context.drawImage(canvas, 0, 0, width, height);
    ready = true;
    document.body.classList.toggle('ui-glass-ready', renderer.ready && !renderer.failed);
    // Always retain the final frame, even when motion stops between UI ticks.
    const flush = () => {
      captureTimer = 0;
      if (!disposed && !document.hidden) {
        lastCapture = performance.now(); pacer?.ready(lastCapture, true);
        syncOverlay(); renderer.refreshBackground();
        if (overlayActive()) overlayRenderer.refreshBackground();
      }
    };
    if (now - lastCapture >= 1000 / 30 - .5) { clearTimeout(captureTimer); flush(); }
    else if (!captureTimer) captureTimer = setTimeout(flush, 1000 / 30 - (now - lastCapture));
  }
  function dispose() {
    if (disposed) return;
    disposed = true; cancelAnimationFrame(pending); clearTimeout(captureTimer); overlayObserver.disconnect();
    renderer.dispose(); stage.remove(); overlayRenderer?.dispose(); overlayStage?.remove();
    for (const event of events) document.removeEventListener(event, invalidate, true);
    window.removeEventListener('resize', resize); document.removeEventListener('scroll', scroll, true);
    document.removeEventListener('pointermove', pointer);
    document.body.classList.remove('ui-glass-ready');
  }
  window.addEventListener('pagehide', event => { if (!event.persisted) dispose(); });
  return { capture, invalidate, dispose };
}
