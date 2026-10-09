import { createLiquidRenderer } from "./chapter02-renderer.js";
import { createLiquidAudio } from "./liquid-audio.js";
import { createLiquidDiscoveries } from "./liquid-discoveries.js";
import { createLiquidPointerLock } from "./liquid-pointer-lock.js";

const $ = (selector) => document.querySelector(selector);
const canvas = $("#liquid-canvas"),
  gallery = $("#liquid-gallery");
const loading = $("#render-loading"),
  fallback = $("#render-fallback");
const notes = $("#ray-notes"),
  announcement = $("#gallery-announcement");
const motion = $("#motion-toggle"),
  gather = $("#gather-action");
const stick = $("#move-stick"),
  stickThumb = $("#stick-thumb"),
  quality = $("#quality-select");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const mobile = matchMedia("(max-width: 760px), (pointer: coarse)");
const keys = new Set(),
  gatherSources = new Set();
const readings = Object.fromEntries([
  'target-distance', 'aim-hud', 'gather-count', 'cycle-reading', 'drop-count',
].map(id => [id, document.getElementById(id)]));
function updateReading(id, text) {
  const element = readings[id];
  if (element.textContent !== text) element.textContent = text;
}
let renderer, announceTimeout, loadingTimeout;
let keyboardFrame = 0,
  previousFrame = 0,
  lookPointer = null,
  stickPointer = null;
let stickVector = { x: 0, z: 0 },
  nearbyCount = 0,
  target = null;
let lastMove = { x: NaN, z: NaN },
  disposed = false;
let pointerLock, lockFallback = false, feedbackTimer;

function announce(message, duration = 3200) {
  clearTimeout(announceTimeout);
  announcement.textContent = message;
  announcement.classList.add("is-visible");
  announceTimeout = setTimeout(
    () => announcement.classList.remove("is-visible"),
    duration,
  );
}
const audio = createLiquidAudio({
  onChange(enabled, reason) {
    $("#sound-toggle").setAttribute("aria-pressed", String(enabled));
    $("#sound-label").textContent = enabled ? "Sound on" : "Sound off";
    $("#sound-toggle").setAttribute(
      "aria-label",
      enabled ? "Turn sound off" : "Turn sound on",
    );
    if (reason) announce(reason);
  },
});
const discoveries = createLiquidDiscoveries({
  onDiscover(entry, count) {
    renderer?.setEffect(entry.id, entry.duration);
    renderDiscoveries();
    announce(`Discovery ${count} / 3 — ${entry.name}. ${entry.message}`, 5500);
    gallery.dataset.lastDiscovery = entry.id;
  },
  onProgress(value) {
    $("#gather-progress").style.transform = `scaleX(${value.toFixed(3)})`;
  },
});
function renderDiscoveries() {
  const count = discoveries.count();
  $("#discovery-count").textContent = `${count} / 3`;
  $("#notes-discovery-count").textContent = `${count} / 3`;
  $("#discoveries-open").setAttribute(
    "aria-label",
    `Discoveries, ${count} of three found`,
  );
  gallery.dataset.discoveries = String(count);
  $("#discovery-list").replaceChildren(
    ...discoveries.entries.map((entry, index) => {
      const found = discoveries.has(entry.id),
        item = document.createElement("article");
      item.className = `discovery-card${found ? " is-found" : ""}`;
      const number = document.createElement("span");
      number.className = "discovery-number";
      number.textContent = String(index + 1).padStart(2, "0");
      const content = document.createElement("div"),
        heading = document.createElement("h3"),
        description = document.createElement("p");
      heading.textContent = found ? entry.name : "Still hidden";
      description.textContent = found ? entry.description : entry.hint;
      content.append(heading, description);
      item.append(number, content);
      if (found) {
        const replay = document.createElement("button");
        replay.type = "button";
        replay.textContent = "↻";
        replay.setAttribute("aria-label", `Replay ${entry.name}`);
        replay.addEventListener("click", () => {
          notes.close();
          renderer?.setEffect(entry.id, entry.duration);
          announce(entry.message, 4200);
        });
        item.append(replay);
      } else {
        const mark = document.createElement("span");
        mark.className = "locked-mark";
        mark.textContent = "·";
        mark.setAttribute("aria-hidden", "true");
        item.append(mark);
      }
      return item;
    }),
  );
}
function syncMotion() {
  const paused = Boolean(renderer?.state.paused);
  motion.setAttribute("aria-pressed", String(paused));
  motion.setAttribute("aria-label", paused ? "Resume flow" : "Pause flow");
  $("#motion-icon").textContent = paused ? "▷" : "Ⅱ";
  $("#motion-label").textContent = paused ? "Resume" : "Pause";
  gallery.dataset.paused = String(paused);
  $("#render-status").textContent = paused
    ? "STILL / LIGHT TRACED LIVE"
    : "LIVE / TRACED LIGHT";
}
function hasExplored() {
  gallery.classList.add("has-explored");
}
let lastTargetMobile = mobile.matches;
function setTarget(next) {
  const distance = Number.isFinite(next?.distance) ? `${next.distance.toFixed(1)} m` : '';
  const reading = next?.kind ? `${next.assisted ? 'LINKED' : 'IN REACH'} / ${distance}` : '';
  updateReading('target-distance', reading);
  if (Boolean(next?.assisted) !== Boolean(target?.assisted))
    readings['aim-hud'].classList.toggle("is-assisted", Boolean(next?.assisted));
  const key = next?.kind ? `${next.kind}:${next.id}` : null;
  const previousKey = target?.kind ? `${target.kind}:${target.id}` : null;
  const unchanged =
    key === previousKey &&
    next?.label === target?.label &&
    lastTargetMobile === mobile.matches;
  target = next;
  if (unchanged) return;
  lastTargetMobile = mobile.matches;
  gallery.dataset.target = next?.kind || "none";
  $("#aim-hud").classList.toggle("has-target", Boolean(next?.kind));
  $("#target-label").textContent = next?.kind
    ? next.label || (next.kind === "glyph" ? "A quiet mark" : "Liquid glass")
    : "Aim at a drop";
  $("#target-action").textContent =
    next?.kind === "glyph"
      ? mobile.matches
        ? "Touch the mark"
        : "Left click / Touch the mark"
      : next?.kind === "drop"
        ? mobile.matches
          ? "Pulse · Hold Gather · Split"
          : "Left / Pulse · Hold E / Gather · Right / Split"
        : "";
  $("#pulse-label").textContent = next?.kind === "glyph" ? "Touch" : "Pulse";
  $("#pulse-action").setAttribute(
    "aria-label",
    next?.kind === "glyph" ? "Touch the mark, left click or P" : "Pulse a drop, left click or P",
  );
  if (key !== previousKey)
    $("#target-announcement").textContent = next?.kind
      ? `${next.label || next.kind}. ${next.kind === "glyph" ? "Left click or press P to touch." : "Left click or P to pulse, hold E to gather, right click or F to split."}`
      : "";
}
function handleEvent(event) {
  discoveries.event(event);
  audio.play(event, renderer?.state);
  if (event?.type === "pulse") actionFeedback("pulse");
  else if (event?.type === "split-interaction") actionFeedback("split");
  else if (event?.type === "miss")
    announce(event.message || "Move closer and aim at a drop", 1700);
}
function actionFeedback(kind) {
  clearTimeout(feedbackTimer);
  gallery.dataset.feedback = kind;
  $("#action-echo").textContent = kind === 'split' ? 'SURFACE TENSION / RELEASED' : 'IMPULSE / SENT';
  feedbackTimer = setTimeout(() => { delete gallery.dataset.feedback; }, 850);
}
function initialize() {
  renderer?.dispose();
  disposed = false;
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
        if (Number.isFinite(scale))
          gallery.dataset.renderScale = scale.toFixed(2);
        if (Number.isFinite(fps)) gallery.dataset.fps = String(Math.round(fps));
      },
      onStatus({ nearbyCount: nearby = 0, dropCount, volumeRatio, merges = 0, returns = 0 } = {}) {
        nearbyCount = nearby;
        discoveries.update(nearbyCount);
        audio.setGathering(gatherSources.size > 0, nearbyCount);
        updateReading('gather-count', nearby ? `${nearby} drops in the current` : 'Draw the glass closer');
        updateReading('cycle-reading', `${merges} joined · ${returns} returned`);
        if (Number.isFinite(dropCount))
          updateReading('drop-count', String(dropCount));
        if (Number.isFinite(volumeRatio) && gallery.dataset.volumeRatio !== volumeRatio.toFixed(6))
          gallery.dataset.volumeRatio = volumeRatio.toFixed(6);
      },
      onTarget: setTarget,
      onEvent: handleEvent,
      onError(error, restoring) {
        pointerLock?.release();
        resetInput();
        gallery.dataset.renderer = restoring ? "restoring" : "failed";
        loading.hidden = true;
        fallback.hidden = false;
        $("#fallback-message").textContent = restoring
          ? error.message
          : "This device could not start the chamber. Try a browser with WebGL 2 and graphics acceleration enabled.";
        console.error("YARD liquid chamber:", error);
      },
    });
    renderer.setQuality(quality.value);
    renderer.setPaused(reducedMotion.matches);
    syncMotion();
    lastMove = { x: NaN, z: NaN };
    updateMovement();
  } catch (error) {
    gallery.dataset.renderer = "failed";
    loading.hidden = true;
    fallback.hidden = false;
    console.error("YARD liquid chamber:", error);
  }
}
quality.value = mobile.matches ? "high" : "ultra";
gallery.dataset.quality = quality.value;
quality.addEventListener("change", () => {
  renderer?.setQuality(quality.value);
  gallery.dataset.quality = quality.value;
  announce(`${quality.value === "ultra" ? "Ultra" : "High"} optical quality`);
});
motion.addEventListener("click", () => {
  if (!renderer) return;
  renderer.setPaused(!renderer.state.paused);
  syncMotion();
});
$("#view-reset").addEventListener("click", () => {
  resetInput();
  renderer?.reset();
  gallery.classList.remove("has-explored");
  announce("Back at the entrance");
});
$("#render-retry").addEventListener("click", () => window.location.reload());
$("#sound-toggle").addEventListener("click", () => audio.toggleAudio());
function setNotesTab(id) {
  for (const name of ["about", "discoveries"]) {
    const active = id === name;
    $(`#${name}-tab`).setAttribute("aria-selected", String(active));
    $(`#${name}-tab`).tabIndex = active ? 0 : -1;
    $(`#${name}-panel`).hidden = !active;
  }
}
function openNotes(tab = "about") {
  pointerLock?.release();
  resetInput();
  setNotesTab(tab);
  if (!notes.open) notes.showModal();
}
$("#notes-open").addEventListener("click", () => openNotes());
$("#discoveries-open").addEventListener("click", () =>
  openNotes("discoveries"),
);
for (const name of ["about", "discoveries"]) {
  $(`#${name}-tab`).addEventListener("click", () => setNotesTab(name));
  $(`#${name}-tab`).addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? "about"
        : event.key === "End"
          ? "discoveries"
          : name === "about"
            ? "discoveries"
            : "about";
    setNotesTab(next);
    $(`#${next}-tab`).focus();
  });
}
notes.addEventListener("click", (event) => {
  if (event.target !== notes) return;
  const rect = notes.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    notes.close();
});
notes.addEventListener("close", resetInput);
function interaction(mode) {
  if (!renderer || gallery.dataset.renderer !== 'ready' || notes.open || document.hidden) return;
  hasExplored();
  renderer.interact(mode);
}
pointerLock = createLiquidPointerLock({
  canvas,
  canEnter: () => gallery.dataset.renderer === 'ready' && !notes.open && !document.hidden,
  onChange({ locked, pending }) {
    gallery.dataset.pointerLock = locked ? 'locked' : pending ? 'pending' : 'free';
    $("#enter-chamber").disabled = pending;
    $("#capture-label").textContent = pending ? 'Entering…' : 'Enter the current';
    for (const element of document.querySelectorAll('.gallery-header,.chamber-settings,.interaction-dock')) element.inert = locked;
    if (locked) { resetInput(); hasExplored(); }
  },
  onLook(dx, dy) { renderer?.look(dx * 0.0018, dy * 0.0018); hasExplored(); },
  onAction: interaction,
  onExit: resetInput,
  onError() {
    lockFallback = true;
    announce('Mouse capture is unavailable here. Drag to look, or try Enter again.');
  },
});
$("#enter-chamber").addEventListener('click', () => { lockFallback = false; pointerLock.request(); });
$("#pulse-action").addEventListener("click", () => interaction("push"));
$("#split-action").addEventListener("click", () => interaction("split"));
function setGather(source, value) {
  if (value && !notes.open && !document.hidden) gatherSources.add(source);
  else gatherSources.delete(source);
  const active = gatherSources.size > 0;
  renderer?.setGathering(active);
  audio.setGathering(active, nearbyCount);
  discoveries.setGathering(active);
  gather.setAttribute("aria-pressed", String(active));
  gallery.dataset.gathering = String(active);
  $("#aim-hud").classList.toggle("is-gathering", active);
  if (active) hasExplored();
}
gather.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  gather.setPointerCapture(event.pointerId);
  setGather(`pointer-${event.pointerId}`, true);
});
function releaseGather(event) {
  setGather(`pointer-${event.pointerId}`, false);
  if (gather.hasPointerCapture(event.pointerId))
    gather.releasePointerCapture(event.pointerId);
}
gather.addEventListener("pointerup", releaseGather);
gather.addEventListener("pointercancel", releaseGather);
gather.addEventListener("lostpointercapture", releaseGather);
gather.addEventListener("keydown", (event) => {
  if (event.code !== "Space" && event.code !== "Enter") return;
  event.preventDefault();
  setGather("button-key", true);
});
gather.addEventListener("keyup", (event) => {
  if (event.code !== "Space" && event.code !== "Enter") return;
  event.preventDefault();
  setGather("button-key", false);
});
gather.addEventListener("blur", () => setGather("button-key", false));
gather.addEventListener("contextmenu", (event) => event.preventDefault());
function updateMovement() {
  let x = Number(keys.has("d")) - Number(keys.has("a")) + stickVector.x;
  let z = Number(keys.has("w")) - Number(keys.has("s")) + stickVector.z;
  const length = Math.hypot(x, z);
  if (length > 1) {
    x /= length;
    z /= length;
  }
  if (notes.open || document.hidden) x = z = 0;
  if (x === lastMove.x && z === lastMove.z) return;
  lastMove = { x, z };
  renderer?.move(x, z);
  gallery.dataset.moving = String(Math.hypot(x, z) > 0);
  if (x || z) hasExplored();
}
function updateStick(event) {
  const rect = stick.getBoundingClientRect(),
    radius = rect.width * 0.32;
  let x = (event.clientX - rect.left - rect.width / 2) / radius,
    y = (event.clientY - rect.top - rect.height / 2) / radius;
  const length = Math.hypot(x, y);
  if (length > 1) {
    x /= length;
    y /= length;
  }
  const gain = length < 0.09 ? 0 : Math.min(1, (length - 0.09) / 0.91),
    normalized = Math.hypot(x, y) || 1;
  stickVector = { x: (x / normalized) * gain, z: (-y / normalized) * gain };
  stickThumb.style.transform = `translate(${(x * radius).toFixed(1)}px, ${(y * radius).toFixed(1)}px)`;
  stick.classList.toggle("is-moving", gain > 0);
  updateMovement();
}
stick.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || stickPointer !== null) return;
  event.preventDefault();
  stickPointer = event.pointerId;
  stick.setPointerCapture(event.pointerId);
  updateStick(event);
});
stick.addEventListener("pointermove", (event) => {
  if (event.pointerId === stickPointer) {
    event.preventDefault();
    updateStick(event);
  }
});
function releaseStick(event) {
  if (event && event.pointerId !== stickPointer) return;
  const oldPointer = stickPointer;
  stickPointer = null;
  stickVector = { x: 0, z: 0 };
  stickThumb.style.transform = "translate(0, 0)";
  stick.classList.remove("is-moving");
  if (oldPointer !== null && stick.hasPointerCapture(oldPointer))
    stick.releasePointerCapture(oldPointer);
  updateMovement();
}
stick.addEventListener("pointerup", releaseStick);
stick.addEventListener("pointercancel", releaseStick);
stick.addEventListener("lostpointercapture", releaseStick);
stick.addEventListener("contextmenu", (event) => event.preventDefault());
document.querySelectorAll("[data-walk]").forEach((button) => {
  const vector = {
    forward: [0, 1],
    back: [0, -1],
    left: [-1, 0],
    right: [1, 0],
  }[button.dataset.walk];
  button.addEventListener("keydown", (event) => {
    if (!["Space", "Enter"].includes(event.code)) return;
    event.preventDefault();
    stickVector = { x: vector[0], z: vector[1] };
    updateMovement();
  });
  button.addEventListener("keyup", (event) => {
    if (!["Space", "Enter"].includes(event.code)) return;
    event.preventDefault();
    releaseStick();
  });
  button.addEventListener("blur", () => {
    if (stickPointer === null) releaseStick();
  });
});
canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType === 'mouse') {
    if (pointerLock.locked || pointerLock.pending) return;
    if (event.button === 2) { interaction('split'); return; }
    if (event.button === 0 && !lockFallback) { pointerLock.request(true); return; }
  }
  if (event.button !== 0 || lookPointer || notes.open) return;
  canvas.focus({ preventScroll: true });
  canvas.setPointerCapture(event.pointerId);
  lookPointer = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    distance: 0,
  };
  canvas.classList.add("is-looking");
});
canvas.addEventListener("pointermove", (event) => {
  if (pointerLock.locked) return;
  if (!lookPointer || lookPointer.id !== event.pointerId) return;
  const dx = event.clientX - lookPointer.x,
    dy = event.clientY - lookPointer.y;
  lookPointer.distance += Math.hypot(dx, dy);
  lookPointer.x = event.clientX;
  lookPointer.y = event.clientY;
  renderer?.look(dx * 0.0024, dy * 0.0024);
  hasExplored();
});
function releaseLook(event) {
  if (!lookPointer || lookPointer.id !== event.pointerId) return;
  const click = lookPointer.distance < 7 && event.type === "pointerup";
  lookPointer = null;
  canvas.classList.remove("is-looking");
  if (canvas.hasPointerCapture(event.pointerId))
    canvas.releasePointerCapture(event.pointerId);
  if (click) interaction("push");
}
canvas.addEventListener("pointerup", releaseLook);
canvas.addEventListener("pointercancel", releaseLook);
canvas.addEventListener("lostpointercapture", releaseLook);
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
function keyboardLook(time) {
  keyboardFrame = 0;
  if (disposed || notes.open || document.hidden) return;
  const dt = Math.min(0.05, (time - (previousFrame || time)) / 1000);
  previousFrame = time;
  const dx = Number(keys.has("arrowright")) - Number(keys.has("arrowleft")),
    dy = Number(keys.has("arrowdown")) - Number(keys.has("arrowup"));
  if (dx || dy) {
    renderer?.look(dx * dt * 1.25, dy * dt * 1.05);
    hasExplored();
    keyboardFrame = requestAnimationFrame(keyboardLook);
  }
}
function startKeyboardLook() {
  if (!keyboardFrame) {
    previousFrame = 0;
    keyboardFrame = requestAnimationFrame(keyboardLook);
  }
}
function keyboardIsEditing(event) {
  return (
    event.target instanceof Element &&
    (event.target.closest("input,select,textarea,[contenteditable=true]") ||
      ((event.code === "Space" || event.code === "Enter") &&
        event.target.closest("button,a")))
  );
}
document.addEventListener("keydown", (event) => {
  if (event.key === 'Escape') resetInput();
  if (event.key === 'Tab' && pointerLock.locked) pointerLock.release();
  if (
    !renderer ||
    notes.open ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    keyboardIsEditing(event)
  )
    return;
  const key = event.key.toLowerCase();
  if (["w", "a", "s", "d"].includes(key)) {
    keys.add(key);
    updateMovement();
  } else if (key.startsWith("arrow")) {
    keys.add(key);
    if (!event.repeat) {
      renderer.look(
        (Number(key === "arrowright") - Number(key === "arrowleft")) * 0.035,
        (Number(key === "arrowdown") - Number(key === "arrowup")) * 0.03,
      );
      hasExplored();
    }
    startKeyboardLook();
  } else if (key === "e") setGather("keyboard", true);
  else if (key === "p" && !event.repeat) interaction("push");
  else if (key === "f" && !event.repeat) interaction("split");
  else if (key === " " && !event.repeat) {
    renderer.setPaused(!renderer.state.paused);
    syncMotion();
  } else if (key === "r" && !event.repeat) {
    resetInput();
    renderer.reset();
    announce("Back at the entrance");
  } else if (key === "?" && !event.repeat) openNotes();
  else return;
  event.preventDefault();
});
document.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  if (keys.delete(key)) updateMovement();
  if (key === "e") setGather("keyboard", false);
});
function resetInput() {
  keys.clear();
  gatherSources.clear();
  renderer?.setGathering(false);
  audio.setGathering(false);
  discoveries.resetInput();
  gather.setAttribute("aria-pressed", "false");
  gallery.dataset.gathering = 'false';
  $("#aim-hud").classList.remove("is-gathering");
  releaseStick();
  if (lookPointer) {
    const id = lookPointer.id;
    lookPointer = null;
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  canvas.classList.remove("is-looking");
  cancelAnimationFrame(keyboardFrame);
  keyboardFrame = 0;
  previousFrame = 0;
  updateMovement();
}
window.addEventListener("blur", () => { pointerLock.release(); resetInput(); });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { pointerLock.release(); resetInput(); }
});
reducedMotion.addEventListener("change", (event) => {
  if (event.matches && renderer) {
    renderer.setPaused(true);
    syncMotion();
  }
});
window.addEventListener("pagehide", (event) => {
  pointerLock.release();
  resetInput();
  clearTimeout(announceTimeout);
  clearTimeout(loadingTimeout);
  clearTimeout(feedbackTimer);
  if (!event.persisted) {
    disposed = true;
    pointerLock.dispose();
    renderer?.dispose();
    audio.dispose();
  }
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    resetInput();
    syncMotion();
  }
});
renderDiscoveries();
initialize();
