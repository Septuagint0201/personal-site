import { chapters } from "./chapters.js";
import { createMenuGlass } from "./menu-glass.js";
import { createRingNavigator } from "./ring-navigation.js";
import { createGlassArrows } from "./glass-arrows.js";
import { createViewportRingGeometry } from "./menu-orbit-geometry.js";
import "./interaction.css";

const stage = document.querySelector("#card-stage");
const stack = document.querySelector("#cards");
const rail = document.querySelector("#thumbnails");
const motion = matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
stack.innerHTML = chapters
  .map(
    (c, i) => `
  <article class="chapter-card" id="chapter-${c.id}" data-accent="${c.accent}" aria-roledescription="slide" aria-label="${i + 1} of ${chapters.length}: ${escape(c.shortTitle)}">
    <div class="card-surface">
      <canvas class="crystal-surface" aria-hidden="true"></canvas>
      <div class="card-reflection" aria-hidden="true"></div>
      <div class="card-details">
        <div class="card-art" aria-hidden="true"><img src="${c.cover}" alt="" draggable="false"/><span class="art-index">${c.id}</span></div>
        <div class="card-topline"><span>CHAPTER ${c.id}</span><span class="availability ${c.href ? "is-open" : ""}"><i></i>${c.status}</span></div>
        <div class="card-content"><p class="card-eyebrow">${c.subtitle}</p><h2>${c.title.split("\n").map(escape).join("<br/>")}</h2><p class="card-description">${c.description}</p>${c.href ? `<a class="enter-chapter" href="${c.href}">Enter chapter <span aria-hidden="true">↗</span></a>` : '<p class="coming-note">✧ &nbsp; A story yet to unfold</p>'}</div>
        <div class="card-bottomline"><div class="card-tags">${c.tags.map((tag) => `<span>${tag}</span>`).join("")}</div><span class="art-note">${c.note}</span></div>
      </div>
    </div>
    <button class="side-select" type="button" data-index="${i}" aria-label="Preview chapter ${c.id}: ${escape(c.shortTitle)}"><span class="side-caption"><span class="side-direction"></span><span>${c.id} &nbsp; ${escape(c.shortTitle)}</span><span>Explore ↗</span></span></button>
  </article>`,
  )
  .join("");
rail.innerHTML = chapters
  .map(
    (c, i) =>
      `<button class="thumbnail" type="button" data-index="${i}" aria-label="Chapter ${c.id}: ${escape(c.shortTitle)}, ${c.status}" aria-controls="chapter-${c.id}"><span class="thumb-image" data-accent="${c.accent}"><img src="${c.cover}" alt="" draggable="false"/><span>${c.id}</span>${c.href ? '<i class="thumb-live"></i>' : ""}</span><span class="thumb-title">${c.shortTitle}</span></button>`,
  )
  .join("");
const cards = [...stack.children];
const thumbs = [...rail.querySelectorAll("button")];
const glassArrows = createGlassArrows({
  source: () => document.querySelector("#glass-world"),
  onInvalidate: () => glass.invalidate(),
  buttons: [...document.querySelectorAll(".glass-arrow")],
  reducedMotion: motion.matches,
});
const glass = createMenuGlass({
  background: document.querySelector("#glass-world"),
  onRender: () => glassArrows.render(),
  surfaces: cards.map((element) => ({
    element,
    canvas: element.querySelector("canvas"),
  })),
  reducedMotion: motion.matches,
});
// The index and Chapter 01 share the same directional navigation model.
// Compression only changes the spacing: every card still follows one Y/Z circle.
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const pointer = { x: 0, y: 0 };
const tilt = { x: 0, y: 0 };
let frame = 0;
let previousTime = 0;
let start = null;
let focusedSide = 0;
let entryHovered = false;
let geometry;
const navigator = createRingNavigator({
  count: chapters.length,
  initial: 0,
  previewAngle: 0.38,
  stiffness: 92,
  damping: 18.5,
  reducedMotion: motion.matches,
  onChange: () => updateSelection(),
});
document.querySelector("#page-total").textContent = String(
  chapters.length,
).padStart(2, "0");

function orbitalAngle(logical) {
  return geometry.angle(logical);
}
function measure() {
  stage.style.setProperty(
    "--card-height",
    `${Math.min(400, innerHeight * 0.37)}px`,
  );
  geometry = createViewportRingGeometry({
    viewportHeight: innerHeight,
    cardHeight: stack.clientHeight,
    count: chapters.length,
  });
  stage.style.perspective = `${geometry.perspective}px`;
  stage.dataset.orbitDiameter = (geometry.radius * 2).toFixed(1);
  stage.dataset.neighbourExposure = "0.66";
  stage.dataset.edgeExposure = "0.90";
  applyPreview();
  invalidate();
}
function applyPreview() {
  if (!geometry) return;
  const y = focusedSide || pointer.y;
  const edge = clamp(Math.abs(y), 0, 1);
  const progressive = edge * edge * (3 - 2 * edge);
  navigator.setPreview(
    motion.matches ? 0 : (Math.sign(y) * progressive * geometry.preview) / 0.38,
  );
}
function updateSelection(announce = true) {
  const selected = navigator.index;
  cards.forEach((card, i) => {
    const active = i === selected;
    card.classList.toggle("is-active", active);
    const details = card.querySelector(".card-details");
    details.inert = !active;
    details.setAttribute("aria-hidden", String(!active));
    const button = card.querySelector(".side-select");
    button.hidden = active;
    button.inert = active;
    thumbs[i].setAttribute("aria-current", String(active));
  });
  document.body.dataset.accent = chapters[selected].accent;
  stage.dataset.selected = String(selected);
  document.querySelector("#page-current").textContent = chapters[selected].id;
  document.querySelector("#page-progress").style.width =
    `${((selected + 1) / chapters.length) * 100}%`;
  if (announce)
    document.querySelector("#slide-status").textContent =
      `Chapter ${chapters[selected].id}: ${chapters[selected].shortTitle}. ${chapters[selected].status}.`;
  invalidate();
}
function paint() {
  if (!geometry) return;
  cards.forEach((card, i) => {
    const logical = navigator.angle(i);
    const angle = orbitalAngle(logical);
    const y = geometry.radius * Math.sin(angle);
    const z = geometry.radius * (Math.cos(angle) - 1);
    const pitch = (angle * 180) / Math.PI;
    const active = i === navigator.index;
    const front = Math.abs(angle) < Math.PI * 0.56;
    const direction = logical < 0 ? -1 : 1;
    card.style.transform = `translate3d(${tilt.x * 3}px,${y}px,${z}px) rotateX(${pitch}deg) rotateY(${tilt.x * 2.2}deg)`;
    card.style.zIndex = String(1000 + Math.round(z));
    card.style.visibility = front ? "visible" : "hidden";
    card.dataset.side = active ? "front" : direction < 0 ? "above" : "below";
    card.dataset.direction = String(direction);
    card.dataset.orbitAngle = angle.toFixed(4);
    card.style.setProperty("--rx", pitch);
    card.style.setProperty("--ry", tilt.x * 2.2);
    card.style.setProperty("--tx", `${tilt.x * 3}px`);
    card.style.setProperty("--ty", `${tilt.y * 3}px`);
    card.style.setProperty("--shine-x", `${50 + pointer.x * 38}%`);
    card.style.setProperty("--shine-y", `${50 + pointer.y * 38}%`);
    card.querySelector(".side-direction").textContent =
      direction < 0 ? "PREVIOUS CHAPTER" : "NEXT CHAPTER";
  });
  glass.invalidate();
}
function animate(now) {
  frame = 0;
  if (document.hidden) return;
  const dt = Math.min((now - previousTime) / 1000 || 0.016, 0.032);
  previousTime = now;
  const moving = !entryHovered && navigator.update(dt);
  const blend = motion.matches ? 1 : 1 - Math.exp(-9 * dt);
  if (!entryHovered) {
    tilt.x += ((motion.matches ? 0 : pointer.x) - tilt.x) * blend;
    tilt.y += ((motion.matches ? 0 : pointer.y) - tilt.y) * blend;
  }
  paint();
  if (
    moving ||
    (!entryHovered &&
      !motion.matches &&
      Math.abs(tilt.x - pointer.x) + Math.abs(tilt.y - pointer.y) > 0.002)
  )
    frame = requestAnimationFrame(animate);
}
function invalidate() {
  if (!frame && !document.hidden) {
    previousTime = performance.now();
    frame = requestAnimationFrame(animate);
  }
}
function rest() {
  entryHovered = false;
  pointer.x = pointer.y = 0;
  applyPreview();
  invalidate();
}
function step(direction) {
  navigator.step(direction);
  applyPreview();
  invalidate();
}
thumbs.forEach((button, i) =>
  button.addEventListener("click", () => {
    navigator.select(i);
    invalidate();
  }),
);
cards.forEach((card) => {
  const button = card.querySelector(".side-select");
  button.addEventListener("click", () => {
    // A visible neighbour is a direction, never an arbitrary destination.
    step(Number(card.dataset.direction));
    stage.focus({ preventScroll: true });
  });
  button.addEventListener("focus", () => {
    if (!button.matches(":focus-visible")) return;
    focusedSide = Number(card.dataset.direction);
    applyPreview();
    invalidate();
  });
  button.addEventListener("blur", () => {
    focusedSide = 0;
    applyPreview();
    invalidate();
  });
});
document.querySelector("#previous").addEventListener("click", () => step(-1));
document.querySelector("#next").addEventListener("click", () => step(1));
window.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const direction = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[
    event.key
  ];
  if (!direction && !["Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const fromThumb = !!document.activeElement?.closest(".thumbnail");
  const fromCard = !!document.activeElement?.closest(".chapter-card");
  if (direction) step(direction);
  else navigator.select(event.key === "Home" ? 0 : chapters.length - 1);
  if (fromThumb) thumbs[navigator.index].focus();
  else if (fromCard) stage.focus({ preventScroll: true });
  invalidate();
});
window.addEventListener("pointermove", (event) => {
  if (
    event.pointerType === "touch" ||
    !finePointer.matches ||
    start ||
    motion.matches
  )
    return;
  entryHovered = !!event.target.closest(".enter-chapter");
  // Stop the physical spring while the live entry target is being clicked.
  if (entryHovered) return;
  if (event.target.closest("a,button") && !event.target.closest(".side-select"))
    return;
  const bounds = stack.getBoundingClientRect();
  pointer.x = clamp(
    (event.clientX - bounds.left - bounds.width / 2) / (bounds.width / 2),
    -1,
    1,
  );
  pointer.y = clamp(
    (event.clientY - innerHeight / 2) / (innerHeight * 0.44),
    -1,
    1,
  );
  applyPreview();
  invalidate();
});
window.addEventListener("pointerleave", rest);
stage.addEventListener("pointerdown", (event) => {
  if (
    event.button !== 0 ||
    !event.isPrimary ||
    event.target.closest("a,button")
  )
    return;
  start = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    type: event.pointerType,
  };
  stage.setPointerCapture(event.pointerId);
});
stage.addEventListener("pointerup", (event) => {
  if (!start || event.pointerId !== start.id) return;
  const dx = event.clientX - start.x,
    dy = event.clientY - start.y,
    type = start.type;
  start = null;
  if (stage.hasPointerCapture(event.pointerId))
    stage.releasePointerCapture(event.pointerId);
  if (type !== "touch" && Math.abs(dy) > 45 && Math.abs(dy) > Math.abs(dx))
    step(dy < 0 ? 1 : -1);
  else if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.25)
    step(dx < 0 ? 1 : -1);
});
stage.addEventListener("pointercancel", () => {
  start = null;
  rest();
});
stage.addEventListener("lostpointercapture", () => {
  start = null;
});
let wheelTotal = 0,
  wheelTime = 0,
  wheelLockedUntil = 0;
window.addEventListener(
  "wheel",
  (event) => {
    if (
      event.ctrlKey ||
      Math.max(Math.abs(event.deltaY), Math.abs(event.deltaX)) < 1
    )
      return;
    event.preventDefault();
    const now = performance.now();
    if (now < wheelLockedUntil) return;
    if (now - wheelTime > 180) wheelTotal = 0;
    wheelTime = now;
    const unit =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
    wheelTotal +=
      (Math.abs(event.deltaY) >= Math.abs(event.deltaX)
        ? event.deltaY
        : event.deltaX) * unit;
    if (Math.abs(wheelTotal) > 42) {
      step(wheelTotal > 0 ? 1 : -1);
      wheelTotal = 0;
      wheelLockedUntil = now + 650;
    }
  },
  { passive: false },
);
document.addEventListener("visibilitychange", () => {
  cancelAnimationFrame(frame);
  frame = 0;
  rest();
});
window.addEventListener("blur", () => {
  start = null;
  rest();
});
window.addEventListener("resize", measure, { passive: true });
motion.addEventListener("change", () => {
  navigator.setReducedMotion(motion.matches);
  glass.setReducedMotion(motion.matches);
  glassArrows.setReducedMotion(motion.matches);
  rest();
});
measure();
updateSelection(false);
