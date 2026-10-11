let nextId = 0;

/** Progressive enhancement: the native select remains the value/change source.
 * Focus stays on the combobox; the active option is committed with Enter/Tab. */
export function createGlassSelect(select, { theme = 'sand', onOpen = () => {} } = {}) {
  const doc = select.ownerDocument, win = doc.defaultView;
  const id = select.id || `glass-select-${++nextId}`;
  const labels = Array.from(select.labels || [], label => [label, label.htmlFor]);
  const previousHidden = select.hidden;
  const root = doc.createElement('span'), trigger = doc.createElement('button');
  root.className = 'glass-select'; root.dataset.theme = theme;
  trigger.type = 'button'; trigger.id = `${id}-trigger`; trigger.className = 'glass-select-trigger';
  trigger.setAttribute('role', 'combobox'); trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', `${id}-options`);
  trigger.setAttribute('aria-label', select.getAttribute('aria-label') || 'Quality');
  const value = doc.createElement('span'), chevron = doc.createElement('span');
  chevron.className = 'glass-select-chevron'; chevron.setAttribute('aria-hidden', 'true');
  trigger.append(value, chevron); root.append(trigger);
  const menu = doc.createElement('div'), scrim = doc.createElement('div');
  menu.id = `${id}-options`; menu.className = 'glass-select-menu'; menu.dataset.theme = theme;
  menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', trigger.getAttribute('aria-label'));
  scrim.className = 'glass-select-scrim'; scrim.setAttribute('aria-hidden', 'true');
  menu.hidden = scrim.hidden = true;
  const choices = Array.from(select.options, (option, index) => {
    const row = doc.createElement('div'), text = doc.createElement('span'), check = doc.createElement('span');
    row.id = `${id}-option-${index}`; row.className = 'glass-select-option'; row.setAttribute('role', 'option');
    text.textContent = option.label; check.textContent = '✓'; check.className = 'glass-select-check';
    check.setAttribute('aria-hidden', 'true'); row.append(text, check); menu.append(row);
    return { option, row };
  });
  let opened = false, active = select.selectedIndex, typed = '', typedAt = 0;
  const removers = [];
  function listen(node, type, handler, options) {
    node.addEventListener(type, handler, options);
    removers.push(() => node.removeEventListener(type, handler, options));
  }
  function enabled(index) { return index >= 0 && index < choices.length && !choices[index].option.disabled; }
  function activate(index) {
    if (!enabled(index)) return;
    active = index;
    for (let i = 0; i < choices.length; i++) choices[i].row.classList.toggle('is-active', opened && i === active);
    if (opened) {
      trigger.setAttribute('aria-activedescendant', choices[active].row.id);
      choices[active].row.scrollIntoView({ block: 'nearest' });
    }
  }
  function sync() {
    value.textContent = select.selectedOptions[0]?.label || '';
    trigger.disabled = select.disabled;
    choices.forEach(({ option, row }) => {
      row.setAttribute('aria-selected', String(option.selected));
      row.setAttribute('aria-disabled', String(option.disabled));
    });
    if (!opened) active = select.selectedIndex;
  }
  function position() {
    if (!opened) return;
    const rect = trigger.getBoundingClientRect(), gap = 9, margin = 12;
    const width = Math.min(Math.max(148, rect.width), win.innerWidth - margin * 2);
    menu.style.width = `${width}px`; menu.style.maxHeight = '240px';
    const naturalHeight = menu.scrollHeight + 2;
    const above = rect.top - gap - margin, below = win.innerHeight - rect.bottom - gap - margin;
    const onTop = above >= naturalHeight || above > below;
    const height = Math.min(naturalHeight, Math.max(48, onTop ? above : below), 240);
    menu.style.maxHeight = `${height}px`;
    menu.style.left = `${Math.max(margin, Math.min(rect.right - width, win.innerWidth - width - margin))}px`;
    menu.style.top = `${Math.max(margin, Math.min(onTop ? rect.top - gap - height : rect.bottom + gap, win.innerHeight - height - margin))}px`;
    menu.dataset.side = onTop ? 'above' : 'below';
  }
  function close(restoreFocus = false) {
    if (!opened) return;
    opened = false; menu.hidden = scrim.hidden = true;
    trigger.setAttribute('aria-expanded', 'false'); trigger.removeAttribute('aria-activedescendant');
    root.classList.remove('is-open'); typed = ''; sync();
    choices.forEach(({ row }) => row.classList.remove('is-active'));
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }
  function open() {
    if (opened || select.disabled || trigger.closest('[inert]')) return;
    onOpen(); sync(); opened = true; menu.hidden = scrim.hidden = false;
    root.classList.add('is-open'); trigger.setAttribute('aria-expanded', 'true');
    position(); activate(enabled(select.selectedIndex) ? select.selectedIndex : choices.findIndex((_, i) => enabled(i)));
    trigger.focus({ preventScroll: true });
  }
  function commit(index, restoreFocus = true) {
    if (!enabled(index)) { close(restoreFocus); return; }
    const changed = select.selectedIndex !== index;
    select.selectedIndex = index; sync(); close(restoreFocus);
    if (changed) select.dispatchEvent(new win.Event('change', { bubbles: true }));
  }
  function move(direction) {
    for (let i = active + direction; i >= 0 && i < choices.length; i += direction) {
      if (enabled(i)) { activate(i); break; }
    }
  }
  listen(trigger, 'click', () => opened ? close(true) : open());
  listen(trigger, 'keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Tab') {
      if (opened) commit(active, false);
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Escape') { close(true); return; }
      if (event.key === 'Enter' || event.key === ' ') { if (opened) commit(active); else open(); return; }
      const wasOpen = opened; open();
      if (event.key === 'Home') activate(choices.findIndex((_, i) => enabled(i)));
      else if (event.key === 'End') {
        for (let i = choices.length - 1; i >= 0; i--) if (enabled(i)) { activate(i); break; }
      } else if (wasOpen) move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key.length === 1) {
      event.preventDefault(); event.stopPropagation(); open();
      const now = Date.now(); typed = (now - typedAt < 700 ? typed : '') + event.key.toLowerCase(); typedAt = now;
      const found = choices.findIndex(({ option }, i) => enabled(i) && option.label.toLowerCase().startsWith(typed));
      if (found >= 0) activate(found);
    }
  });
  listen(trigger, 'keyup', event => {
    if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); }
  });
  choices.forEach(({ row }, index) => {
    listen(row, 'pointerdown', event => event.preventDefault());
    listen(row, 'pointermove', event => { if (event.pointerType === 'mouse') activate(index); });
    listen(row, 'click', () => commit(index));
  });
  // The transparent scrim consumes the dismissal gesture before the canvas
  // can capture the mouse, turn the camera, or push the sculpture underneath.
  listen(scrim, 'pointerdown', event => event.preventDefault());
  listen(scrim, 'click', () => close(true));
  listen(select, 'change', sync);
  listen(doc, 'focusin', event => { if (opened && !root.contains(event.target) && !menu.contains(event.target)) close(); });
  listen(doc, 'pointerlockchange', () => close());
  listen(doc, 'visibilitychange', () => { if (doc.hidden) close(); });
  listen(win, 'blur', () => close());
  listen(win, 'pagehide', () => close());
  listen(win, 'resize', position);
  listen(win, 'scroll', position, true);
  select.after(root); doc.body.append(scrim, menu); select.hidden = true;
  labels.forEach(([label]) => { label.htmlFor = trigger.id; }); sync();
  return { close, sync,
    dispose() {
      close(); removers.splice(0).forEach(remove => remove()); root.remove(); menu.remove(); scrim.remove();
      select.hidden = previousHidden; labels.forEach(([label, target]) => { label.htmlFor = target; });
    },
  };
}
