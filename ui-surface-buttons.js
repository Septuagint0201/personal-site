/* Shared surface buttons: approved Surface Buttons Lab values, 2026-10-25. */
"use strict";
(() => {
  const parameters = Object.freeze({ blur: 10, opacity: .15, saturation: .8,
    darkTone: 86.7, lightTone: 170.85, ink: 'theme', referenceDiameter: 120,
    // Layout short side, not area/width or the temporary hover scale.
    largeShortSide: 96 });
  const interactive = 'button,a,[role="button"],[role="tab"],.stick-thumb';
  const parentSelector = '.glass-surface,.ui-glass-surface,.chapter-card,.card-surface,.optical-glass';

  function isFrosted({ interactive: eligible, nested, width, height, forceGlass = false }) {
    return !!eligible && !!nested && !forceGlass && width > 0 && height > 0
      && Math.min(width, height) < parameters.largeShortSide;
  }
  function classify(nodes) {
    const glass = [];
    for (const node of nodes) {
      const eligible = node.matches(interactive);
      const nested = eligible && !!node.parentElement?.closest(parentSelector);
      const frosted = isFrosted({ interactive: eligible, nested,
        width: nested ? node.offsetWidth : 0, height: nested ? node.offsetHeight : 0,
        forceGlass: node.dataset.surfaceTreatment === 'glass' });
      if (node.classList.contains('surface-button-frost') !== frosted) node.classList.toggle('surface-button-frost', frosted);
      if (!frosted) glass.push(node);
    }
    return glass;
  }
  function applyTheme(root, dark) {
    root.style.setProperty('--surface-button-blur', `${parameters.blur}px`);
    root.style.setProperty('--surface-button-opacity', String(parameters.opacity));
    root.style.setProperty('--surface-button-saturation', String(parameters.saturation));
    root.style.setProperty('--surface-button-tone', String(dark ? parameters.darkTone : parameters.lightTone));
  }
  window.SiteSurfaceButtons = Object.freeze({ revision: 'hybrid-surface-2026-10-25', parameters, classify, isFrosted, applyTheme });
})();
