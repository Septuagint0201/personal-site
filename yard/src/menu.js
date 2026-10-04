import { chapters } from "./chapters.js";
const stage = document.querySelector("#card-stage"),
  stack = document.querySelector("#cards"),
  rail = document.querySelector("#thumbnails");
const motion = matchMedia("(prefers-reduced-motion: reduce)"),
  finePointer = matchMedia("(hover: hover) and (pointer: fine)");
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
stack.innerHTML = chapters
  .map(
    (c, i) =>
      `<article class="chapter-card" id="chapter-${c.id}" data-accent="${c.accent}" aria-roledescription="slide" aria-label="${i + 1} of ${chapters.length}: ${escape(c.shortTitle)}"><div class="card-surface"><div class="card-art" aria-hidden="true"><img src="${c.cover}" alt="" draggable="false" /><span class="art-index">${c.id}</span></div><div class="card-reflection" aria-hidden="true"></div><div class="card-topline"><span>CHAPTER ${c.id}</span><span class="availability ${c.href ? "is-open" : ""}"><i></i>${c.status}</span></div><div class="card-content"><p class="card-eyebrow">${c.subtitle}</p><h2>${c.title.split("\n").map(escape).join("<br />")}</h2><p class="card-description">${c.description}</p>${c.href ? `<a class="enter-chapter" href="${c.href}">Enter chapter <span aria-hidden="true">↗</span></a>` : '<p class="coming-note"><span aria-hidden="true">✧</span> A story yet to unfold</p>'}</div><div class="card-bottomline"><div class="card-tags">${c.tags.map((tag) => `<span>${tag}</span>`).join("")}</div><span class="art-note">${c.note}</span></div></div></article>`,
  )
  .join("");
rail.innerHTML = chapters
  .map(
    (c, i) =>
      `<button class="thumbnail" type="button" data-index="${i}" aria-label="Chapter ${c.id}: ${c.shortTitle}, ${c.status}" aria-controls="chapter-${c.id}"><span class="thumb-image" data-accent="${c.accent}"><img src="${c.cover}" alt="" draggable="false" /><span>${c.id}</span>${c.href ? '<i class="thumb-live"></i>' : ""}</span><span class="thumb-title">${c.shortTitle}</span></button>`,
  )
  .join("");
const cards = [...stack.children],
  thumbs = [...rail.querySelectorAll("button")];
let selected = 0,
  start = null,
  frame = 0,
  current = { x: 0, y: 0 },
  target = { x: 0, y: 0 };
let entrance;
document.querySelector("#page-total").textContent = String(
  chapters.length,
).padStart(2, "0");
function applyTilt() {
  stack.style.setProperty("--rx", `${-current.y * 5}deg`);
  stack.style.setProperty("--ry", `${current.x * 6}deg`);
  stack.style.setProperty("--tx", `${current.x * 7}px`);
  stack.style.setProperty("--ty", `${current.y * 5}px`);
  stack.style.setProperty("--shine-x", `${50 + current.x * 35}%`);
  stack.style.setProperty("--shine-y", `${50 + current.y * 35}%`);
}
function animateTilt() {
  if (frame || document.hidden) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    current.x += (target.x - current.x) * 0.12;
    current.y += (target.y - current.y) * 0.12;
    applyTilt();
    if (Math.abs(target.x - current.x) + Math.abs(target.y - current.y) > 0.002)
      animateTilt();
  });
}
function neutralize() {
  target = { x: 0, y: 0 };
  if (motion.matches || document.hidden) {
    cancelAnimationFrame(frame);
    frame = 0;
    current = { x: 0, y: 0 };
    applyTilt();
  } else animateTilt();
}
function select(index, announce = true) {
  const direction = index < selected ? -1 : 1,
    next = (index + chapters.length) % chapters.length,
    changed = next !== selected;
  selected = next;
  neutralize();
  entrance?.cancel();
  cards.forEach((card, i) => {
    const offset = (i - selected + chapters.length) % chapters.length;
    card.style.setProperty("--depth", offset);
    card.style.zIndex = String(chapters.length - offset);
    card.classList.toggle("is-active", i === selected);
    card.inert = i !== selected;
    card.setAttribute("aria-hidden", String(i !== selected));
    thumbs[i].setAttribute("aria-current", i === selected ? "true" : "false");
  });
  if (changed && !motion.matches)
    entrance = cards[selected].animate(
      [
        {
          opacity: 0.2,
          transform: `translate3d(${direction * 55}px,0,30px) rotateY(${-direction * 4}deg)`,
        },
        { opacity: 1, transform: "translate3d(0,0,0) rotateY(0deg)" },
      ],
      { duration: 650, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
  document.body.dataset.accent = chapters[selected].accent;
  document.querySelector("#page-current").textContent = chapters[selected].id;
  document.querySelector("#page-progress").style.width =
    `${((selected + 1) / chapters.length) * 100}%`;
  if (announce)
    document.querySelector("#slide-status").textContent =
      `Chapter ${chapters[selected].id}: ${chapters[selected].shortTitle}. ${chapters[selected].status}.`;
}
thumbs.forEach((thumb, i) => thumb.addEventListener("click", () => select(i)));
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
  const active = document.activeElement,
    fromThumb = !!active?.closest(".thumbnail"),
    fromCard = !!active?.closest(".chapter-card");
  select(indices[event.key]);
  if (fromThumb) thumbs[selected].focus();
  else if (fromCard) stage.focus({ preventScroll: true });
});
stage.addEventListener("pointermove", (event) => {
  // Keep the entry button steady while it is being targeted.
  if (event.target.closest("a,button")) {
    target = { ...current };
    cancelAnimationFrame(frame);
    frame = 0;
    return;
  }
  if (
    event.pointerType === "touch" ||
    !finePointer.matches ||
    motion.matches ||
    start
  )
    return;
  const r = stage.getBoundingClientRect();
  target = {
    x: Math.max(-1, Math.min(1, ((event.clientX - r.left) / r.width) * 2 - 1)),
    y: Math.max(-1, Math.min(1, ((event.clientY - r.top) / r.height) * 2 - 1)),
  };
  animateTilt();
});
stage.addEventListener("pointerleave", neutralize);
stage.addEventListener("pointerdown", (event) => {
  if (
    event.button !== 0 ||
    !event.isPrimary ||
    event.target.closest("a,button")
  )
    return;
  start = { id: event.pointerId, x: event.clientX, y: event.clientY };
  stage.setPointerCapture(event.pointerId);
  neutralize();
});
stage.addEventListener("pointerup", (event) => {
  if (!start || event.pointerId !== start.id) return;
  const dx = event.clientX - start.x,
    dy = event.clientY - start.y;
  start = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.25)
    select(selected + (dx < 0 ? 1 : -1));
});
stage.addEventListener("pointercancel", () => {
  start = null;
  neutralize();
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
document.addEventListener("visibilitychange", neutralize);
window.addEventListener("blur", () => {
  start = null;
  neutralize();
});
motion.addEventListener("change", () => {
  entrance?.cancel();
  neutralize();
});
select(0, false);
