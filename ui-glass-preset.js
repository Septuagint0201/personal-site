/* Approved B material. Shared by Candy and every YARD interface renderer. */
"use strict";
(() => {
  const material = Object.freeze({ ior: 1.45, thickness: 6, roughness: 1.5, dispersion: 0.10, tint: 0.15 });
  const profile = Object.freeze({ kind: 'hyperbolic', shoulder: 67.68, edge: 0.18,
    bias: 0.438, exponent: 3, front: 1, radius: 70, sceneDistance: 384 });
  window.SiteGlassPreset = Object.freeze({ revision: 'b-single-2026-10-13', material, profile,
    compactRoughness: 0.45, compactTint: 0.65 });
})();
