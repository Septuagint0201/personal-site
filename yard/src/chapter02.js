import { createLiquidRenderer } from "./chapter02-renderer.js";

const canvas = document.querySelector("#liquid-canvas");
const gallery = document.querySelector("#liquid-gallery");
const loading = document.querySelector("#render-loading");
const fallback = document.querySelector("#render-fallback");
const motion = document.querySelector("#motion-toggle");
const status = document.querySelector("#render-status");
const announcement = document.querySelector("#gallery-announcement");
const studies = {
  sculpture: {
    index: 0,
    description:
      "A folded crystal, carved by a current.<br />An open heart. An impossible surface.",
    caption: "01 — CHRYSALIS / A FOLD IN CLEAR MATTER",
    title: "Chrysalis",
  },
  passage: {
    index: 1,
    description:
      "A procession of liquid vaults.<br />A thousand thresholds inside one beam.",
    caption: "02 — NAVE / A PROCESSION OF LIQUID VAULTS",
    title: "Nave",
  },
  waterfall: {
    index: 2,
    description:
      "Three curtains, caught in the fall.<br />A field of light beneath the surface.",
    caption: "03 — UNDERTOW / CURTAINS OF FALLING LIGHT",
    title: "Undertow",
  },
};
let renderer;
let announceTimeout;
let loadingTimeout;
let pointer;
const touches = new Map();
let pinchDistance = 0;
let lastTap = 0;
let dragDistance = 0;

function announce(message) {
  clearTimeout(announceTimeout);
  announcement.textContent = message;
  announcement.classList.add("is-visible");
  announceTimeout = setTimeout(
    () => announcement.classList.remove("is-visible"),
    2300,
  );
}
function syncMotion() {
  const paused = renderer.state.paused;
  motion.setAttribute("aria-pressed", String(paused));
  motion.innerHTML = paused
    ? 'Resume motion <span aria-hidden="true">▷</span>'
    : 'Pause motion <span aria-hidden="true">Ⅱ</span>';
  gallery.dataset.paused = String(paused);
  status.textContent = paused
    ? "STILL / LIGHT TRACED LIVE"
    : "LIVE / TRACED LIGHT";
}
function selectStudy(key, notify = true) {
  const study = studies[key];
  if (!study || !renderer) return;
  renderer.select(study.index);
  gallery.dataset.study = key;
  document
    .querySelectorAll("[data-study].study-tab")
    .forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.study === key)),
    );
  document.querySelector("#study-description").innerHTML = study.description;
  document.querySelector("#study-number").textContent = String(
    study.index + 1,
  ).padStart(2, "0");
  document.querySelector("#study-caption").textContent = study.caption;
  if (notify) announce(study.title);
}
function initialize() {
  renderer?.dispose();
  fallback.hidden = true;
  loading.hidden = false;
  loading.classList.remove("is-ready");
  try {
    renderer = createLiquidRenderer(canvas, {
      onPreparing() {
        clearTimeout(loadingTimeout);
        gallery.dataset.renderer = "preparing";
        loading.hidden = false;
        loading.classList.remove("is-ready");
      },
      onReady() {
        fallback.hidden = true;
        gallery.dataset.renderer = "ready";
        loading.classList.add("is-ready");
        clearTimeout(loadingTimeout);
        loadingTimeout = setTimeout(() => {
          loading.hidden = true;
        }, 750);
      },
      onQuality({ fps, scale }) {
        gallery.dataset.renderScale = scale.toFixed(2);
        gallery.dataset.fps = String(fps);
      },
      onError(error, restoring) {
        gallery.dataset.renderer = restoring ? "restoring" : "failed";
        loading.hidden = true;
        fallback.hidden = false;
        document.querySelector("#fallback-message").textContent = restoring
          ? error.message
          : "This device could not start the glass renderer. Try a browser with WebGL 2 and graphics acceleration enabled.";
        console.error("YARD glass renderer:", error);
      },
    });
    renderer.setFlow(Number(document.querySelector("#flow-range").value) / 100);
    renderer.setDispersion(
      Number(document.querySelector("#spectrum-range").value) / 100,
    );
    renderer.setQuality(document.querySelector("#quality-select").value);
    syncMotion();
    selectStudy(gallery.dataset.study, false);
  } catch (error) {
    gallery.dataset.renderer = "failed";
    loading.hidden = true;
    fallback.hidden = false;
    console.error("YARD glass renderer:", error);
  }
}

document
  .querySelectorAll(".study-tab")
  .forEach((button) =>
    button.addEventListener("click", () => selectStudy(button.dataset.study)),
  );
document.querySelector("#flow-range").addEventListener("input", (event) => {
  document.querySelector("#flow-output").textContent = `${event.target.value}%`;
  renderer?.setFlow(Number(event.target.value) / 100);
});
document.querySelector("#spectrum-range").addEventListener("input", (event) => {
  document.querySelector("#spectrum-output").textContent =
    `${event.target.value}%`;
  renderer?.setDispersion(Number(event.target.value) / 100);
});
document
  .querySelector("#quality-select")
  .addEventListener("change", (event) => {
    renderer?.setQuality(event.target.value);
    gallery.dataset.quality = event.target.value;
    announce(`${event.target.selectedOptions[0].textContent} optical quality`);
  });
motion.addEventListener("click", () => {
  if (renderer) {
    renderer.setPaused(!renderer.state.paused);
    syncMotion();
  }
});
document.querySelector("#view-reset").addEventListener("click", () => {
  renderer?.reset();
  announce("A fresh point of view");
});
document
  .querySelector("#render-retry")
  .addEventListener("click", () => window.location.reload());
const notes = document.querySelector("#ray-notes");
document
  .querySelector("#notes-open")
  .addEventListener("click", () => notes.showModal());
notes.addEventListener("click", (event) => {
  if (event.target === notes) {
    const rect = notes.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      notes.close();
  }
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  renderer?.press();
  canvas.setPointerCapture(event.pointerId);
  touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (touches.size > 1) {
    const [a, b] = [...touches.values()];
    pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
    pointer = null;
    dragDistance = 100;
    return;
  }
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  dragDistance = 0;
});
canvas.addEventListener("pointerenter", () => renderer?.setHover(1));
canvas.addEventListener("pointerleave", () => renderer?.setHover(0));
canvas.addEventListener("pointermove", (event) => {
  if (touches.has(event.pointerId))
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (touches.size > 1) {
    const [a, b] = [...touches.values()];
    const nextDistance = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDistance) renderer?.zoom((pinchDistance - nextDistance) * 0.016);
    pinchDistance = nextDistance;
    return;
  }
  if (!pointer || event.pointerId !== pointer.id) return;
  const dx = event.clientX - pointer.x,
    dy = event.clientY - pointer.y;
  dragDistance += Math.abs(dx) + Math.abs(dy);
  renderer?.orbit(-dx * 0.0032, dy * 0.0027);
  pointer.x = event.clientX;
  pointer.y = event.clientY;
});
function releasePointer(event) {
  touches.delete(event.pointerId);
  pinchDistance = 0;
  if (canvas.hasPointerCapture(event.pointerId))
    canvas.releasePointerCapture(event.pointerId);
  if (!pointer || event.pointerId !== pointer.id) return;
  if (event.type !== "pointercancel" && dragDistance < 8) {
    const now = performance.now();
    if (now - lastTap < 330) {
      renderer?.pulse();
      announce("A small disturbance");
      lastTap = 0;
    } else lastTap = now;
  }
  pointer = null;
}
canvas.addEventListener("pointerup", releasePointer);
canvas.addEventListener("pointercancel", releasePointer);
canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    renderer?.zoom(Math.max(-1, Math.min(1, event.deltaY * 0.002)) * 0.6);
  },
  { passive: false },
);
document.addEventListener("keydown", (event) => {
  if (
    !renderer ||
    notes.open ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.target.matches("input,button,a,select,textarea")
  )
    return;
  const key = event.key.toLowerCase();
  if (key >= "1" && key <= "3")
    selectStudy(Object.keys(studies)[Number(key) - 1]);
  else if (key === " ") {
    renderer.setPaused(!renderer.state.paused);
    syncMotion();
  } else if (key === "r") {
    renderer.reset();
    announce("A fresh point of view");
  } else if (key === "arrowleft") renderer.orbit(-0.07, 0);
  else if (key === "arrowright") renderer.orbit(0.07, 0);
  else if (key === "arrowup") renderer.orbit(0, -0.05);
  else if (key === "arrowdown") renderer.orbit(0, 0.05);
  else return;
  event.preventDefault();
});
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
reducedMotion.addEventListener("change", (event) => {
  if (event.matches && renderer) {
    renderer.setPaused(true);
    syncMotion();
  }
});
window.addEventListener("pagehide", () => {
  renderer?.dispose();
  clearTimeout(announceTimeout);
  clearTimeout(loadingTimeout);
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) initialize();
});
initialize();
