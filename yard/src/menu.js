import { chapters } from "./chapters.js";
import { createMenuGlass } from "./menu-glass.js";

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
const glass = createMenuGlass({
  background: document.querySelector("#glass-world"),
  surfaces: cards.map((element) => ({
    element,
    canvas: element.querySelector("canvas"),
  })),
  reducedMotion: motion.matches,
});
const keys = ["y", "x", "scale", "rx", "ry", "rz"];
const states = cards.map(() => ({
  value: { y: 0, x: 0, scale: 1, rx: 0, ry: 0, rz: 0 },
  speed: Object.fromEntries(keys.map((k) => [k, 0])),
}));
let selected = 0,
  frame = 0,
  previousTime = 0,
  start = null;
let pointer = { x: 0, y: 0 },
  peek = { top: 0, bottom: 0 },
  focusedSide = 0;
document.querySelector("#page-total").textContent = String(
  chapters.length,
).padStart(2, "0");
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function sideFor(i) {
  if (i === selected) return 0;
  if (i === (selected - 1 + cards.length) % cards.length) return -1;
  if (i === (selected + 1) % cards.length) return 1;
  return null;
}
function targets(i) {
  const side = sideFor(i),
    h = stack.clientHeight;
  const reveal = side < 0 ? peek.top : peek.bottom;
  return side
    ? {
        y: side * h * (0.054 + 0.224 * reveal),
        x: side * 4,
        scale: 0.962,
        rx: -side * (1.2 + reveal * 1.7),
        ry: pointer.x * 1.2,
        rz: side * 0.35,
      }
    : {
        y: pointer.y * 5,
        x: pointer.x * 7,
        scale: 1,
        rx: -pointer.y * 4,
        ry: pointer.x * 5,
        rz: 0,
      };
}
function paint() {
  states.forEach((s, i) => {
    const v = s.value,
      el = cards[i];
    el.style.transform = `translate3d(${v.x}px,${v.y}px,0) rotateX(${v.rx}deg) rotateY(${v.ry}deg) rotateZ(${v.rz}deg) scale(${v.scale})`;
    el.style.setProperty("--rx", v.rx);
    el.style.setProperty("--ry", v.ry);
    el.style.setProperty("--tx", `${v.x}px`);
    el.style.setProperty("--ty", `${v.y}px`);
    el.style.setProperty("--shine-x", `${50 + pointer.x * 30}%`);
    el.style.setProperty("--shine-y", `${50 + pointer.y * 30}%`);
  });
  glass.invalidate();
}
function animate(now) {
  frame = 0;
  if (document.hidden) return;
  const dt = Math.min((now - previousTime) / 1000 || 0.016, 0.032);
  previousTime = now;
  let moving = false;
  states.forEach((s, i) => {
    const desired = targets(i);
    keys.forEach((key) => {
      if (motion.matches) {
        s.value[key] = desired[key];
        s.speed[key] = 0;
        return;
      }
      s.speed[key] +=
        ((desired[key] - s.value[key]) * 190 - s.speed[key] * 23) * dt;
      s.value[key] += s.speed[key] * dt;
      if (
        Math.abs(s.speed[key]) > 0.015 ||
        Math.abs(desired[key] - s.value[key]) > 0.005
      )
        moving = true;
    });
  });
  paint();
  if (moving) frame = requestAnimationFrame(animate);
}
function invalidate() {
  if (!frame && !document.hidden) {
    previousTime = performance.now();
    frame = requestAnimationFrame(animate);
  }
}
function rest() {
  pointer = { x: 0, y: 0 };
  peek = { top: focusedSide < 0 ? 1 : 0, bottom: focusedSide > 0 ? 1 : 0 };
  invalidate();
}
function select(index, announce = true, initial = false) {
  selected = (index + chapters.length) % chapters.length;
  focusedSide = 0;
  pointer = { x: 0, y: 0 };
  peek = { top: 0, bottom: 0 };
  cards.forEach((card, i) => {
    const side = sideFor(i),
      active = side === 0;
    card.hidden = side === null;
    card.classList.toggle("is-active", active);
    card.dataset.side = side < 0 ? "above" : side > 0 ? "below" : "front";
    card.style.zIndex = active ? "3" : "1";
    const details = card.querySelector(".card-details");
    details.inert = !active;
    details.setAttribute("aria-hidden", String(!active));
    const button = card.querySelector(".side-select");
    button.hidden = active;
    button.inert = active;
    button.querySelector(".side-direction").textContent =
      side < 0 ? "↑ PREVIOUS" : "↓ NEXT";
    thumbs[i].setAttribute("aria-current", String(active));
    if (initial) states[i].value = targets(i);
  });
  document.body.dataset.accent = chapters[selected].accent;
  document.querySelector("#page-current").textContent = chapters[selected].id;
  document.querySelector("#page-progress").style.width =
    `${((selected + 1) / chapters.length) * 100}%`;
  if (announce)
    document.querySelector("#slide-status").textContent =
      `Chapter ${chapters[selected].id}: ${chapters[selected].shortTitle}. ${chapters[selected].status}.`;
  invalidate();
}
thumbs.forEach((b, i) => b.addEventListener("click", () => select(i)));
cards.forEach((card, i) => {
  const button = card.querySelector(".side-select");
  button.addEventListener("click", () => {
    select(i);
    stage.focus({ preventScroll: true });
  });
  button.addEventListener("focus", () => {
    focusedSide = sideFor(i);
    peek = { top: focusedSide < 0 ? 1 : 0, bottom: focusedSide > 0 ? 1 : 0 };
    invalidate();
  });
  button.addEventListener("blur", () => {
    focusedSide = 0;
    rest();
  });
});
document
  .querySelector("#previous")
  .addEventListener("click", () => select(selected - 1));
document
  .querySelector("#next")
  .addEventListener("click", () => select(selected + 1));
document.querySelector(".collection").addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const indices = {
    ArrowLeft: selected - 1,
    ArrowRight: selected + 1,
    ArrowUp: selected - 1,
    ArrowDown: selected + 1,
    Home: 0,
    End: chapters.length - 1,
  };
  if (!(event.key in indices)) return;
  event.preventDefault();
  const fromThumb = !!document.activeElement?.closest(".thumbnail");
  const fromCard = !!document.activeElement?.closest(".chapter-card");
  select(indices[event.key]);
  if (fromThumb) thumbs[selected].focus();
  else if (fromCard) stage.focus({ preventScroll: true });
});
stage.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch" || !finePointer.matches || start) return;
  const r = stack.getBoundingClientRect();
  const y = (event.clientY - r.top - r.height / 2) / (r.height / 2);
  const t = clamp((Math.abs(y) - 0.28) / 0.73, 0, 1),
    curve = t * t * (3 - 2 * t);
  peek = { top: y < 0 ? curve : 0, bottom: y > 0 ? curve : 0 };
  // Keep entry targets still while hovered; side cards can continue expanding.
  if (!motion.matches && !event.target.closest("a,button"))
    pointer = {
      x: clamp((event.clientX - r.left - r.width / 2) / (r.width / 2), -1, 1),
      y: clamp(y, -1, 1),
    };
  invalidate();
});
stage.addEventListener("pointerleave", rest);
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
  rest();
});
stage.addEventListener("pointerup", (event) => {
  if (!start || event.pointerId !== start.id) return;
  const dx = event.clientX - start.x,
    dy = event.clientY - start.y,
    type = start.type;
  start = null;
  if (type !== "touch" && Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx))
    select(selected + (dy < 0 ? 1 : -1));
  else if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.25)
    select(selected + (dx < 0 ? 1 : -1));
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
stage.addEventListener(
  "wheel",
  (event) => {
    if (
      Math.abs(event.deltaX) <= Math.abs(event.deltaY) ||
      Math.abs(event.deltaX) < 2
    )
      return;
    event.preventDefault();
    const now = performance.now();
    if (now < wheelLockedUntil) return;
    if (now - wheelTime > 220) wheelTotal = 0;
    wheelTime = now;
    wheelTotal += event.deltaX;
    if (Math.abs(wheelTotal) > 60) {
      select(selected + (wheelTotal > 0 ? 1 : -1));
      wheelTotal = 0;
      wheelLockedUntil = now + 600;
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
window.addEventListener("resize", invalidate, { passive: true });
motion.addEventListener("change", () => {
  glass.setReducedMotion(motion.matches);
  rest();
});
select(0, false, true);
