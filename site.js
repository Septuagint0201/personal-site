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

  function prepareParticles(width, height) {
    if (particleWidth === width && particleHeight === height) return;
    particleWidth = width;
    particleHeight = height;
    const count = Math.min(
      72,
      Math.max(28, Math.round((width * height) / 14500)),
    );
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 11,
      vy: (Math.random() - 0.5) * 11,
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
    background.paint(ctx, width, height, { ...chosenBackground, dark }, camera);
    const color = dark ? "219,212,249" : "88,79,124";
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      const proximity = pointer.x === null ? 0 : Math.max(0, 1 - Math.hypot(pointer.x - particle.x, pointer.y - particle.y) / 180);
      if (dark || proximity > 0.1) {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius * (3 + proximity * 2), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color},${0.07 + proximity * 0.12})`;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color},${0.65 + proximity * 0.3})`;
      ctx.fill();
      for (let j = i + 1; j < particles.length; j++) {
        const other = particles[j];
        const distance = Math.hypot(particle.x - other.x, particle.y - other.y);
        if (distance >= 155) continue;
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(other.x, other.y);
        ctx.strokeStyle = `rgba(${color},${(0.24 + proximity * 0.28) * (1 - distance / 155)})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
    }
  }
  function animate(now) {
    animationFrame = 0;
    if (
      document.hidden ||
      reducedMotion.matches ||
      !renderer ||
      renderer.failed
    )
      return;
    const seconds = Math.min((now - lastFrame) / 1000, 0.08);
    const targetStrength = pointer.x === null ? 0 : 0.13;
    lens.strength += (targetStrength - lens.strength) * 0.18;
    if (lens.strength < 0.0001) lens.strength = 0;
    if (pointer.x !== null) {
      lens.x += (pointer.x - lens.x) * 0.3;
      lens.y += (pointer.y - lens.y) * 0.3;
    }
    // Smooth lens motion at display cadence; particle texture stays capped at 30fps.
    if (lens.strength > 0) renderer.request();
    if (now - lastFrame >= 1000 / 30) {
      const ease = 1 - Math.exp(-seconds / 0.09);
      camera.x += (cameraTarget.x - camera.x) * ease;
      camera.y += (cameraTarget.y - camera.y) * ease;
      if (Math.hypot(cameraTarget.x - camera.x, cameraTarget.y - camera.y) < 0.001) {
        camera.x = cameraTarget.x; camera.y = cameraTarget.y;
      }
      lastFrame = now;
      for (const p of particles) {
        if (pointer.x !== null) {
          const dx = pointer.x - p.x, dy = pointer.y - p.y;
          const distance = Math.hypot(dx, dy);
          if (distance > 1 && distance < 190) {
            const force = (1 - distance / 190) * 38;
            // Gentle attraction plus a tangential drift; soft core avoids a pile-up.
            const pull = distance < 30 ? -0.7 : 1;
            p.driftX += (dx / distance * pull - dy / distance * 0.55) * force * seconds;
            p.driftY += (dy / distance * pull + dx / distance * 0.55) * force * seconds;
          }
        }
        p.driftX *= Math.exp(-1.4 * seconds);
        p.driftY *= Math.exp(-1.4 * seconds);
        p.x += (p.vx + p.driftX) * seconds;
        p.y += (p.vy + p.driftY) * seconds;
        if (p.x < 0 || p.x > particleWidth) {
          p.vx *= -1;
          p.x = Math.max(0, Math.min(particleWidth, p.x));
        }
        if (p.y < 0 || p.y > particleHeight) {
          p.vy *= -1;
          p.y = Math.max(0, Math.min(particleHeight, p.y));
        }
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
  window.addEventListener("scroll", () => renderer?.request(), {
    passive: true,
  });
  window.addEventListener("resize", () => renderer?.resize());
  document.fonts.ready.then(() => renderer?.request());
  window.addEventListener("load", () => renderer?.request());
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
  const name = document.getElementById("typed-name");
  if (!reducedMotion.matches) {
    const text = name.textContent;
    let index = 0;
    name.textContent = "";
    const type = () => {
      name.textContent = text.slice(0, ++index);
      if (index < text.length) setTimeout(type, 110);
    };
    type();
  }
  const avatar = document.querySelector(".avatar");
  const avatarFallback = () => {
    avatar.hidden = true;
  };
  avatar.addEventListener("error", avatarFallback);
  if (avatar.complete && !avatar.naturalWidth) avatarFallback();
})();
