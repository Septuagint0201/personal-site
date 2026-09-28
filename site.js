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
  const sourceImage = new Image();
  const staticScene = document.createElement("canvas");
  const staticContext = staticScene.getContext("2d");
  let sourceReady = false;
  let sceneKey = "";
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
    sceneKey = "";
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
  // Paint into the background texture so the orbits bend through the glass too.
  // Static ornaments share the cached image; animation only redraws particles.
  function paintOrnaments(ctx, width, height) {
    const ink = dark ? "225,217,251" : "76,67,106";
    const compact = width <= 1000;
    const cx = width * 0.5;
    const cy = height * 0.51;
    const rx = Math.min(width * 0.39, 550);
    const ry = Math.min(height * 0.29, 260);
    ctx.save();
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = `rgba(${ink},${compact ? 0.15 : 0.25})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, -0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(${ink},.12)`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 1.13, ry * 1.2, 0.32, -0.7, Math.PI * 1.2);
    ctx.stroke();
    ctx.setLineDash([2, 8]);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 1.18, ry * 1.34, -0.4, 3.4, 5.3);
    ctx.stroke();
    ctx.setLineDash([]);

    // Sparse fixed stars anchor the composition without adding more motion.
    const stars = compact
      ? [[0.12, 0.2, 5], [0.88, 0.78, 5]]
      : [[0.16, 0.2, 7], [0.81, 0.27, 9], [0.28, 0.76, 5], [0.9, 0.62, 4]];
    ctx.fillStyle = `rgba(${ink},.55)`;
    for (const [x, y, radius] of stars) {
      const px = width * x;
      const py = height * y;
      ctx.beginPath();
      ctx.moveTo(px, py - radius);
      ctx.quadraticCurveTo(px + radius * 0.12, py - radius * 0.12, px + radius, py);
      ctx.quadraticCurveTo(px + radius * 0.12, py + radius * 0.12, px, py + radius);
      ctx.quadraticCurveTo(px - radius * 0.12, py + radius * 0.12, px - radius, py);
      ctx.quadraticCurveTo(px - radius * 0.12, py - radius * 0.12, px, py - radius);
      ctx.fill();
    }
    if (!compact) {
      const angle = 3.8;
      const x = rx * Math.cos(angle);
      const y = ry * Math.sin(angle);
      const px = cx + x * Math.cos(-0.4) - y * Math.sin(-0.4);
      const py = cy + x * Math.sin(-0.4) + y * Math.cos(-0.4);
      ctx.strokeStyle = `rgba(${ink},.4)`;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fill();
      // Open corner marks leave the illustration itself unframed.
      ctx.strokeStyle = `rgba(${ink},.2)`;
      for (const [fx, fy, dx, dy] of [[30, 98, 1, 1], [width - 30, height - 74, -1, -1]]) {
        ctx.beginPath();
        ctx.moveTo(fx, fy + 18 * dy);
        ctx.lineTo(fx, fy);
        ctx.lineTo(fx + 18 * dx, fy);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  function paintBackground(ctx, width, height) {
    prepareParticles(width, height);
    const dpr = ctx.getTransform().a;
    const key = [width, height, dpr, dark, sourceReady].join("/");
    if (sceneKey !== key) {
      sceneKey = key;
      staticScene.width = Math.round(width * dpr);
      staticScene.height = Math.round(height * dpr);
      staticContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      const base = dark ? "#171d30" : "#c6cbd6";
      staticContext.fillStyle = base;
      staticContext.fillRect(0, 0, width, height);
      const glow = staticContext.createRadialGradient(width * 0.52, height * 0.42, 0, width * 0.52, height * 0.42, width * 0.65);
      glow.addColorStop(0, dark ? "#363750" : "#dce0e7");
      glow.addColorStop(1, base);
      staticContext.fillStyle = glow;
      staticContext.fillRect(0, 0, width, height);
      if (sourceReady) {
        const compact = width <= 1000;
        const artWidth = compact ? width - 32 : Math.min(width * 0.74, 1160);
        const artHeight = Math.min(height * 0.76, 760);
        const artX = compact ? 16 : width * 0.56 - artWidth / 2;
        const artY = (height - artHeight) / 2;
        const scale = Math.max(
          artWidth / sourceImage.width,
          artHeight / sourceImage.height,
        );
        staticContext.save();
        staticContext.beginPath();
        staticContext.roundRect(artX, artY, artWidth, artHeight, compact ? 40 : 80);
        staticContext.clip();
        staticContext.drawImage(
          sourceImage,
          artX + (artWidth - sourceImage.width * scale) / 2,
          artY + (artHeight - sourceImage.height * scale) / 2,
          sourceImage.width * scale,
          sourceImage.height * scale,
        );
        staticContext.fillStyle = dark
          ? "rgba(17,22,43,.62)"
          : "rgba(41,49,70,.26)";
        staticContext.fillRect(artX, artY, artWidth, artHeight);
        const fade = staticContext.createLinearGradient(artX, 0, artX + artWidth, 0);
        fade.addColorStop(0, base);
        fade.addColorStop(0.22, dark ? "#171d3000" : "#c6cbd600");
        fade.addColorStop(0.7, dark ? "#171d3000" : "#c6cbd600");
        fade.addColorStop(1, base);
        staticContext.fillStyle = fade;
        staticContext.fillRect(artX, artY, artWidth, artHeight);
        staticContext.restore();
      }
      paintOrnaments(staticContext, width, height);
    }
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(staticScene, 0, 0, width, height);
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
  if (window.LiquidGlass && staticContext) {
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
  sourceImage.onload = () => {
    sourceReady = true;
    sceneKey = "";
    renderer?.refreshBackground();
  };
  sourceImage.onerror = () => {
    sourceReady = false;
    sceneKey = "";
    renderer?.refreshBackground();
  };
  sourceImage.src = "bg.jpg";

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
