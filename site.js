/* Homepage material approved in septuagint-glass-liquid (1).json. */
"use strict";
(() => {
  const chosenMaterial = Object.freeze({
    ior: 1.7,
    thickness: 60,
    roughness: 1.5,
    dispersion: 0.12,
    tint: 0.15,
  });
  const systemTheme = matchMedia("(prefers-color-scheme: light)");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const themeButton = document.getElementById("themeToggle");
  const scene = document.getElementById("site-scene");
  const card = document.querySelector(".card");
  const name = document.getElementById("typed-name");
  const fullName = name.textContent;
  let typingTimer = 0;
  let readingBounds = null;
  // Approved export: septuagint-depth-strata.json (2026-09-29).
  const chosenBackground = Object.freeze({ mode: 1, tilt: 15, depth: 31, shine: 48 });
  const camera = { x: 0.35, y: -0.18 };
  const cameraTarget = { ...camera };
  let theme = "system";
  let dark = true;
  let renderer = null;
  let particles = [];
  let particleWidth = 0;
  let particleHeight = 0;
  let animationFrame = 0;
  let lastFrame = 0;
  let flowTime = 0;
  const pointer = { x: null, y: null };
  const lens = { x: 0, y: 0, radius: 170, strength: 0 };
  try {
    const saved = localStorage.getItem("theme");
    if (["dark", "light", "system"].includes(saved)) theme = saved;
  } catch {
    /* Theme switching still works when storage is unavailable. */
  }

  function applyTheme(next) {
    theme = next;
    dark = theme === "dark" || (theme === "system" && !systemTheme.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.querySelector('meta[name="theme-color"]').content = dark
      ? "#171d30"
      : "#c6cbd6";
    const nextTheme =
      theme === "dark" ? "浅色" : theme === "light" ? "跟随系统" : "深色";
    const current =
      theme === "system"
        ? `跟随系统（${dark ? "深色" : "浅色"}）`
        : dark
          ? "深色"
          : "浅色";
    themeButton.firstElementChild.textContent =
      theme === "system" ? "◐" : dark ? "☾" : "☀";
    themeButton.title = `${current}；点击切换到${nextTheme}`;
    themeButton.setAttribute(
      "aria-label",
      `当前${current}，切换到${nextTheme}`,
    );
    try {
      localStorage.setItem("theme", theme);
    } catch {}
    renderer?.refreshBackground();
  }
  themeButton.addEventListener("click", () =>
    applyTheme(
      theme === "dark" ? "light" : theme === "light" ? "system" : "dark",
    ),
  );
  systemTheme.addEventListener("change", () => {
    if (theme === "system") applyTheme("system");
  });
  applyTheme(theme);

  // Keep DOM reads outside the particle loop, including on short scrolling screens.
  function updateReadingBounds() {
    const bounds = card.getBoundingClientRect();
    readingBounds = {
      left: bounds.left - 12,
      right: bounds.right + 12,
      top: bounds.top - 12,
      bottom: bounds.bottom + 12,
    };
    renderer?.refreshBackground();
  }
  function particleVisibility(x, y) {
    if (!readingBounds) return 1;
    const dx = Math.max(readingBounds.left - x, 0, x - readingBounds.right);
    const dy = Math.max(readingBounds.top - y, 0, y - readingBounds.bottom);
    const distance = Math.min(1, Math.hypot(dx, dy) / 140);
    return 0.24 + 0.76 * distance * distance * (3 - 2 * distance);
  }
  updateReadingBounds();
  if (window.ResizeObserver) new ResizeObserver(updateReadingBounds).observe(card);

  function prepareParticles(width, height) {
    if (particleWidth === width && particleHeight === height) return;
    particleWidth = width;
    particleHeight = height;
    const count = Math.min(
      48,
      Math.max(18, Math.round((width * height) / 22000)),
    );
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: 18 + Math.random() * 12,
      vy: (Math.random() - 0.5) * 18,
      speed: 0.7 + Math.random() * 0.6,
      trail: [],
      radius: Math.random() * 1.5 + 0.8,
      driftX: 0,
      driftY: 0,
    }));
  }
  const background = window.DepthBackground.createRenderer({
    onChange: () => {
      scene.dataset.depthRenderer = background.failed ? "fallback" : "webgl";
      renderer?.refreshBackground();
    },
  });
  scene.dataset.depthRenderer = background.failed ? "fallback" : "webgl";
  scene.dataset.depthPreset = "strata";
  function paintBackground(ctx, width, height) {
    prepareParticles(width, height);
    background.paint(ctx, width, height, { ...chosenBackground, dark, composition: 1 }, camera);
    const color = dark ? "219,212,249" : "88,79,124";
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      const visibility = particleVisibility(particle.x, particle.y);
      const proximity = pointer.x === null ? 0 : Math.max(0, 1 - Math.hypot(pointer.x - particle.x, pointer.y - particle.y) / 240);
      // Short fading paths reveal the current without smearing the glass background.
      if (!reducedMotion.matches && particle.trail.length > 1) {
        ctx.lineCap = "round";
        ctx.lineWidth = particle.radius * 0.8;
        for (let step = 1; step < particle.trail.length; step++) {
          const from = particle.trail[step - 1], to = particle.trail[step];
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.strokeStyle = `rgba(${color},${(0.12 + proximity * 0.1) * visibility * step / particle.trail.length})`;
          ctx.stroke();
        }
      }
      if (dark || proximity > 0.1) {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius * (3 + proximity * 2), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color},${(0.04 + proximity * 0.06) * visibility})`;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color},${(0.45 + proximity * 0.16) * visibility})`;
      ctx.fill();
      for (let j = i + 1; j < particles.length; j++) {
        const other = particles[j];
        const distance = Math.hypot(particle.x - other.x, particle.y - other.y);
        if (distance >= 155) continue;
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(other.x, other.y);
        const lineVisibility = Math.min(visibility, particleVisibility(other.x, other.y),
          particleVisibility((particle.x + other.x) / 2, (particle.y + other.y) / 2));
        ctx.strokeStyle = `rgba(${color},${(0.13 + proximity * 0.14) * lineVisibility * (1 - distance / 155)})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
    }
  }
  function animate(now) {
    animationFrame = 0;
    // Clear the last lens frame even if a media-change event arrives late.
    if (reducedMotion.matches) {
      lens.strength = 0;
      renderer?.refreshBackground();
      return;
    }
    if (
      document.hidden ||
      !renderer ||
      renderer.failed
    )
      return;
    const seconds = Math.min((now - lastFrame) / 1000, 0.08);
    const targetStrength = pointer.x === null ? 0 : -0.13;
    lens.strength += (targetStrength - lens.strength) * 0.18;
    if (Math.abs(lens.strength) < 0.0001) lens.strength = 0;
    if (pointer.x !== null) {
      lens.x += (pointer.x - lens.x) * 0.3;
      lens.y += (pointer.y - lens.y) * 0.3;
    }
    // Smooth lens motion at display cadence; particle texture stays capped at 30fps.
    if (Math.abs(lens.strength) > 0) renderer.request();
    if (now - lastFrame >= 1000 / 30) {
      const ease = 1 - Math.exp(-seconds / 0.09);
      camera.x += (cameraTarget.x - camera.x) * ease;
      camera.y += (cameraTarget.y - camera.y) * ease;
      if (Math.hypot(cameraTarget.x - camera.x, cameraTarget.y - camera.y) < 0.001) {
        camera.x = cameraTarget.x; camera.y = cameraTarget.y;
      }
      lastFrame = now;
      flowTime += seconds;
      const follow = 1 - Math.exp(-1.5 * seconds);
      for (const p of particles) {
        // A slowly changing vector field forms broad, continuous currents.
        const x = p.x / particleWidth, y = p.y / particleHeight;
        const angle = Math.sin(x * 4.2 + flowTime * 0.22) * 0.8
          + Math.cos(y * 5.1 - flowTime * 0.18) * 0.55;
        const speed = (30 + 8 * Math.sin(y * 3.8 + flowTime * 0.35)) * p.speed;
        p.vx += (Math.cos(angle) * speed - p.vx) * follow;
        p.vy += (Math.sin(angle) * speed - p.vy) * follow;
        if (pointer.x !== null) {
          const dx = pointer.x - p.x, dy = pointer.y - p.y;
          const distance = Math.hypot(dx, dy);
          if (distance > 1 && distance < 240) {
            const force = (1 - distance / 240) * 76;
            // Smooth outward pressure dominates a light tangential drift.
            const push = 0.65 + 1.15 * (1 - distance / 240);
            const swirl = 0.35;
            p.driftX += (-dx / distance * push - dy / distance * swirl) * force * seconds;
            p.driftY += (-dy / distance * push + dx / distance * swirl) * force * seconds;
          }
        }
        p.driftX *= Math.exp(-0.55 * seconds);
        p.driftY *= Math.exp(-0.55 * seconds);
        p.x += (p.vx + p.driftX) * seconds;
        p.y += (p.vy + p.driftY) * seconds;
        // Wrap outside the viewport so no abrupt bounce or cross-screen trail is visible.
        const margin = 32;
        let wrapped = false;
        if (p.x < -margin) { p.x = particleWidth + margin; wrapped = true; }
        else if (p.x > particleWidth + margin) { p.x = -margin; wrapped = true; }
        if (p.y < -margin) { p.y = particleHeight + margin; wrapped = true; }
        else if (p.y > particleHeight + margin) { p.y = -margin; wrapped = true; }
        if (wrapped) p.trail.length = 0;
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 10) p.trail.shift();
      }
      renderer.refreshBackground();
    }
    animationFrame = requestAnimationFrame(animate);
  }
  function startAnimation() {
    if (!animationFrame && !document.hidden && !reducedMotion.matches)
      animationFrame = requestAnimationFrame(animate);
  }
  if (window.LiquidGlass) {
    renderer = new window.LiquidGlass.Renderer(scene, {
      maxDpr: 1.5,
      maxPixels: 1800000,
      paintBackground,
      getSurfaces: () => document.querySelectorAll(".glass-surface"),
      getSurfaceEffects: (surface) => ({
        reflection: surface === themeButton ? 0.28 : 1,
        hover: surface.matches(":hover, :focus-visible") && surface.matches("a, button") ? 1 : 0,
        interactive: true,
      }),
      getState: () => ({
        material: chosenMaterial,
        dark,
        invertedTint: true,
        edgeProfile: "soft",
        refraction: true,
        lens: reducedMotion.matches ? null : lens,
      }),
      onStatus: (instance) => {
        document.body.classList.toggle("glass-active", !instance.failed);
        scene.dataset.renderer = instance.failed ? "fallback" : "webgl";
        if (instance.failed) {
          cancelAnimationFrame(animationFrame);
          animationFrame = 0;
        } else startAnimation();
      },
    });
    renderer.resize();
    startAnimation();
  }
  let lastPointerUpdate = 0;
  window.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType === "touch" || reducedMotion.matches) return;
      if (pointer.x === null) {
        lens.x = event.clientX;
        lens.y = event.clientY;
      }
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      cameraTarget.x = Math.max(-1, Math.min(1, event.clientX / innerWidth * 2 - 1));
      cameraTarget.y = Math.max(-1, Math.min(1, event.clientY / innerHeight * 2 - 1));
      if (renderer && performance.now() - lastPointerUpdate > 33) {
        lastPointerUpdate = performance.now();
        renderer.light = [pointer.x, pointer.y];
        renderer.request();
      }
    },
    { passive: true },
  );
  function clearPointer() {
    pointer.x = pointer.y = null;
    cameraTarget.x = cameraTarget.y = 0;
    if (renderer) {
      renderer.light = [-100, -150];
      renderer.request();
    }
  }
  document.addEventListener("pointerleave", clearPointer);
  window.addEventListener("blur", clearPointer);

  // Track CSS scaling on every transition frame so GPU bounds and DOM stay aligned.
  let interactionFrame = 0;
  let interactionUntil = 0;
  function trackInteraction() {
    if (reducedMotion.matches || document.hidden) return;
    interactionUntil = performance.now() + 280;
    if (interactionFrame) return;
    const update = (now) => {
      interactionFrame = 0;
      if (document.hidden) return;
      renderer?.request();
      if (now < interactionUntil) interactionFrame = requestAnimationFrame(update);
    };
    interactionFrame = requestAnimationFrame(update);
  }
  document.querySelectorAll(".links a, .theme-toggle").forEach((button) => {
    for (const event of ["pointerenter", "pointerleave", "pointerdown", "pointerup", "pointercancel", "focus", "blur", "keydown", "keyup"])
      button.addEventListener(event, trackInteraction);
    button.addEventListener("pointermove", (event) => {
      const bounds = button.getBoundingClientRect();
      button.style.setProperty("--shine-x", `${(event.clientX - bounds.left) / bounds.width * 100}%`);
      button.style.setProperty("--shine-y", `${(event.clientY - bounds.top) / bounds.height * 100}%`);
    });
  });
  window.addEventListener("scroll", updateReadingBounds, {
    passive: true,
  });
  window.addEventListener("resize", () => {
    updateReadingBounds();
    renderer?.resize();
  });
  document.fonts.ready.then(updateReadingBounds);
  window.addEventListener("load", updateReadingBounds);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearPointer();
      lens.strength = 0;
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    } else {
      renderer?.request();
      startAnimation();
    }
  });
  reducedMotion.addEventListener("change", () => {
    finishTyping();
    if (reducedMotion.matches) {
      clearPointer();
      lens.strength = 0;
      cancelAnimationFrame(interactionFrame);
      interactionFrame = 0;
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    } else startAnimation();
    renderer?.refreshBackground();
  });
  document.querySelectorAll(".links a").forEach((link) =>
    link.addEventListener("click", (event) => {
      if (reducedMotion.matches) return;
      const ripple = document.createElement("span");
      const rect = link.getBoundingClientRect();
      ripple.className = "ripple";
      ripple.style.left =
        (event.detail ? event.clientX - rect.left : rect.width / 2) + "px";
      ripple.style.top =
        (event.detail ? event.clientY - rect.top : rect.height / 2) + "px";
      link.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    }),
  );
  function finishTyping() {
    clearTimeout(typingTimer);
    typingTimer = 0;
    name.textContent = fullName;
    delete name.dataset.typing;
  }
  if (!reducedMotion.matches) {
    let index = 0;
    name.dataset.typing = "true";
    name.textContent = "";
    const type = () => {
      if (reducedMotion.matches) {
        finishTyping();
        return;
      }
      name.textContent = fullName.slice(0, ++index);
      if (index < fullName.length) typingTimer = setTimeout(type, 110);
      else finishTyping();
    };
    type();
  } else finishTyping();
  const avatar = document.querySelector(".avatar");
  const avatarFallback = () => {
    avatar.hidden = true;
  };
  avatar.addEventListener("error", avatarFallback);
  if (avatar.complete && !avatar.naturalWidth) avatarFallback();
})();
