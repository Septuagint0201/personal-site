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
      : "#eef0f5";
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
      42,
      Math.max(18, Math.round((width * height) / 24000)),
    );
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 11,
      vy: (Math.random() - 0.5) * 11,
      radius: Math.random() * 1.2 + 0.5,
    }));
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
      staticContext.fillStyle = dark ? "#171d30" : "#eef0f5";
      staticContext.fillRect(0, 0, width, height);
      if (sourceReady) {
        const scale = Math.max(
          width / sourceImage.width,
          height / sourceImage.height,
        );
        staticContext.drawImage(
          sourceImage,
          (width - sourceImage.width * scale) / 2,
          (height - sourceImage.height * scale) / 2,
          sourceImage.width * scale,
          sourceImage.height * scale,
        );
        staticContext.fillStyle = dark
          ? "rgba(17,22,43,.65)"
          : "rgba(247,246,243,.09)";
        staticContext.fillRect(0, 0, width, height);
      }
    }
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(staticScene, 0, 0, width, height);
    const color = dark ? "219,212,249" : "88,79,124";
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color},.38)`;
      ctx.fill();
      for (let j = i + 1; j < particles.length; j++) {
        const other = particles[j];
        const distance = Math.hypot(particle.x - other.x, particle.y - other.y);
        if (distance >= 130) continue;
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(other.x, other.y);
        ctx.strokeStyle = `rgba(${color},${0.13 * (1 - distance / 130)})`;
        ctx.lineWidth = 0.6;
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
    if (now - lastFrame >= 1000 / 24) {
      const seconds = Math.min((now - lastFrame) / 1000, 0.08);
      lastFrame = now;
      for (const p of particles) {
        if (
          pointer.x !== null &&
          Math.hypot(pointer.x - p.x, pointer.y - p.y) < 110
        ) {
          p.x -= (pointer.x - p.x) * seconds * 0.22;
          p.y -= (pointer.y - p.y) * seconds * 0.22;
        }
        p.x += p.vx * seconds;
        p.y += p.vy * seconds;
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
      getState: () => ({
        material: chosenMaterial,
        dark,
        invertedTint: true,
        edgeProfile: "soft",
        refraction: true,
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
  document.addEventListener("pointerleave", () => {
    pointer.x = pointer.y = null;
    if (renderer) {
      renderer.light = [-100, -150];
      renderer.request();
    }
  });
  window.addEventListener("scroll", () => renderer?.request(), {
    passive: true,
  });
  window.addEventListener("resize", () => renderer?.resize());
  document.fonts.ready.then(() => renderer?.request());
  window.addEventListener("load", () => renderer?.request());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    } else {
      renderer?.request();
      startAnimation();
    }
  });
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) {
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
