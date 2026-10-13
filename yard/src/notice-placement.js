import './notice-placement.css';

// Notifications follow the real panel bounds, including expanded sliders.
// Only resize/text changes do layout work; there is no per-frame measurement.
export function placeNoticeAbovePanel(notice, panel) {
  let frame = 0;
  const set = (name, value) => { if (notice.style.getPropertyValue(name) !== value) notice.style.setProperty(name, value); };
  function update() {
    frame = 0;
    const bounds = panel.getBoundingClientRect(), gap = 18;
    const height = notice.offsetHeight;
    const side = bounds.top - height - gap < 12 && bounds.left >= 212;
    set('--notice-left', side ? `${bounds.left / 2}px` : '50%');
    set('--notice-width', side ? `${Math.min(360, bounds.left - 32)}px` : '560px');
    set('--notice-min', side ? '180px' : '220px');
    set('--notice-bottom', side ? `${Math.max(16, (innerHeight - height) / 2)}px` : `${innerHeight - bounds.top + gap}px`);
    notice.dataset.placement = side ? 'beside-panel' : 'above-panel';
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  const observer = new ResizeObserver(schedule);
  observer.observe(panel); observer.observe(notice);
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('pagehide', event => {
    if (!event.persisted) { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', schedule); }
  });
  update();
  return update;
}
