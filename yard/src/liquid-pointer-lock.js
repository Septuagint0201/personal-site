/** Native relative mouse input, separate from touch dragging and UI controls. */
export function createLiquidPointerLock({
  canvas, document: doc = canvas.ownerDocument, canEnter = () => true,
  onChange = () => {}, onLook = () => {}, onAction = () => {}, onExit = () => {}, onError = () => {},
}) {
  let pending = false, cancelled = false, disposed = false, skipUntilUp = false;
  let wasLocked = false;
  const removers = [];
  const locked = () => doc.pointerLockElement === canvas;
  const cleanup = () => removers.splice(0).forEach(remove => remove());
  function listen(node, type, handler) {
    node.addEventListener(type, handler);
    removers.push(() => node.removeEventListener(type, handler));
  }
  function report() { onChange({ locked: locked(), pending, available: typeof canvas.requestPointerLock === 'function' }); }
  function error(reason) {
    if (reason?.name) console.debug('YARD pointer capture:', reason.name, reason.message);
    if (disposed) { cleanup(); return; }
    if (!pending || disposed) return;
    pending = false;
    skipUntilUp = false;
    report();
    onError(reason);
  }
  function request(fromPointerDown = false) {
    if (disposed || pending || locked() || !canEnter()) return false;
    if (typeof canvas.requestPointerLock !== 'function') { onError(); return false; }
    cancelled = false;
    pending = true;
    skipUntilUp = fromPointerDown;
    canvas.focus({ preventScroll: true });
    report();
    try {
      // Called directly inside the user gesture; works with promise and legacy APIs.
      canvas.requestPointerLock()?.then(() => {
        if ((cancelled || disposed) && locked()) doc.exitPointerLock();
      }).catch(error);
    } catch { error(); }
    return true;
  }
  function release() {
    cancelled = true;
    pending = false;
    skipUntilUp = false;
    if (locked()) doc.exitPointerLock();
    report();
  }
  listen(doc, 'pointerlockchange', () => {
    pending = false;
    if (locked() && (cancelled || disposed || !canEnter())) {
      doc.exitPointerLock();
      if (disposed) cleanup();
      return;
    }
    const active = locked();
    if (active) canvas.focus({ preventScroll: true });
    if (!active && wasLocked) { skipUntilUp = false; onExit(); }
    wasLocked = active;
    report();
    if (disposed) cleanup();
  });
  listen(doc, 'pointerlockerror', error);
  listen(doc, 'mousemove', event => {
    if (disposed || !locked() || !canEnter()) return;
    const dx = Number.isFinite(event.movementX) ? event.movementX : 0;
    const dy = Number.isFinite(event.movementY) ? event.movementY : 0;
    if (dx || dy) onLook(dx, dy);
  });
  listen(doc, 'mousedown', event => {
    if (disposed || !locked() || skipUntilUp || !canEnter()) return;
    if (event.button === 0 || event.button === 2) {
      event.preventDefault();
      onAction(event.button === 2 ? 'split' : 'push');
    }
  });
  listen(doc, 'mouseup', () => { skipUntilUp = false; });
  listen(doc, 'contextmenu', event => { if (locked()) event.preventDefault(); });
  listen(doc, 'keydown', event => { if (event.key === 'Escape' && (locked() || pending)) release(); });
  report();
  return {
    get locked() { return locked(); }, get pending() { return pending; }, request, release,
    dispose() {
      const waiting = pending;
      disposed = true;
      release();
      // A legacy request may still acquire after disposal; retain its one final
      // change/error listener long enough to release that late acquisition.
      if (!waiting) cleanup();
    },
  };
}
