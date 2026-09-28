/* Screen-space glass study. No runtime dependencies. See glass-lab.html for limitations. */
"use strict";

(() => {
  const presets = {
    crystal: {
      name: "清透水晶",
      number: "01",
      description: "轻盈、通透，让背景自然流入界面。",
      note: "最轻盈的玻璃，适合保留原站插画的细节。",
      ior: 1.45,
      thickness: 28,
      roughness: 0.8,
      dispersion: 0.02,
      tint: 0.08,
    },
    silk: {
      name: "柔雾丝绒",
      number: "02",
      description: "把光线揉软，留给内容更多呼吸。",
      note: "更柔和的散射和染色，适合复杂背景与长时间阅读。",
      ior: 1.36,
      thickness: 22,
      roughness: 6.2,
      dispersion: 0.005,
      tint: 0.26,
    },
    liquid: {
      name: "厚液态",
      number: "03",
      description: "像一滴凝住的水，边缘包裹着光。",
      note: "厚曲面带来明显的边缘弯折，最接近饱满的液滴质感。",
      ior: 1.68,
      thickness: 62,
      roughness: 1.2,
      dispersion: 0.025,
      tint: 0.1,
    },
    prism: {
      name: "光谱棱镜",
      number: "04",
      description: "把一道光，拆成细微的彩色边缘。",
      note: "用更强的色散分离光谱，适合喜欢鲜明视觉效果的你。",
      ior: 1.82,
      thickness: 72,
      roughness: 0.4,
      dispersion: 0.115,
      tint: 0.05,
    },
  };
  const fields = ["ior", "thickness", "roughness", "dispersion", "tint"];
  const softCurve = window.LiquidGlass.softCurve;
  const storageKey = "septuagint-glass-lab-choice-v1";
  // Imported from the user's septuagint-glass-liquid.json. A new baseline revision
  // prevents an older local preview from silently replacing the explicitly supplied file.
  const baselineRevision = "liquid-1.70-60-1.5-0.12-0.15-soft";
  const customBaseline = {
    ior: 1.7,
    thickness: 60,
    roughness: 1.5,
    dispersion: 0.12,
    tint: 0.15,
  };
  let selected = "liquid";
  let material = { ...presets[selected], ...customBaseline };
  let invertedTint = true;
  let edgeProfile = "soft";
  let sceneMode = "aurora";
  let dark = false;
  let refraction = true;
  let savedChoice = null;
  const renderers = [];
  const sourceImage = new Image();
  let sourceReady = false;
  let sourceFailed = false;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const $ = (id) => document.getElementById(id);

  // Values restored from storage are treated as untrusted, versioned input.
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (
      saved &&
      [1, 2, 3, 4].includes(saved.version) &&
      saved.baselineRevision === baselineRevision &&
      Object.hasOwn(presets, saved.preset)
    ) {
      savedChoice = saved;
      selected = saved.preset;
      if (["bevel", "rounded", "soft"].includes(saved.edgeProfile)) {
        edgeProfile = saved.edgeProfile;
      }
      if (saved.tintMode === "follow-theme" || saved.tintMode === "inverted") {
        invertedTint = saved.tintMode === "inverted";
      }
      material = { ...presets[selected] };
      for (const key of fields) {
        const input = $(key);
        if (
          typeof saved.parameters?.[key] === "number" &&
          Number.isFinite(saved.parameters[key])
        ) {
          material[key] = Math.min(
            +input.max,
            Math.max(+input.min, saved.parameters[key]),
          );
        }
      }
    }
  } catch {
    /* Private browsing or damaged storage must not prevent previewing. */
  }

  function paintBackground(ctx, w, h, small) {
    ctx.clearRect(0, 0, w, h);
    if (sceneMode === "original" && sourceReady) {
      const scale = Math.max(w / sourceImage.width, h / sourceImage.height);
      ctx.drawImage(
        sourceImage,
        (w - sourceImage.width * scale) / 2,
        (h - sourceImage.height * scale) / 2,
        sourceImage.width * scale,
        sourceImage.height * scale,
      );
      ctx.fillStyle = dark ? "rgba(17,22,43,.65)" : "rgba(247,246,243,.09)";
      ctx.fillRect(0, 0, w, h);
      return;
    }
    const base = ctx.createLinearGradient(0, 0, w, h);
    if (dark) {
      base.addColorStop(0, "#172538");
      base.addColorStop(0.5, "#3d3b5c");
      base.addColorStop(1, "#766175");
    } else {
      base.addColorStop(0, "#e9e8d9");
      base.addColorStop(0.5, "#cccedf");
      base.addColorStop(1, "#eacbb5");
    }
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    if (sceneMode === "grid") {
      ctx.fillStyle = dark ? "#273448" : "#e9e8df";
      ctx.fillRect(0, 0, w, h);
      const step = small ? 17 : 28;
      ctx.strokeStyle = dark ? "#b8cbdc66" : "#67736170";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= w; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y <= h; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
      ctx.lineWidth = small ? 4 : 8;
      ctx.strokeStyle = dark ? "#ddaf92" : "#bc7960";
      ctx.beginPath();
      ctx.moveTo(0, h * 0.8);
      ctx.lineTo(w, h * 0.25);
      ctx.stroke();
      ctx.strokeStyle = dark ? "#b3b1eb" : "#8991b5";
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.5, Math.min(w, h) * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = dark ? "#e2e4e9" : "#58664b";
      ctx.font = `${small ? 18 : 40}px Georgia`;
      ctx.fillText("01 / REFRACTION", w * 0.08, h * 0.3);
      return;
    }
    // Smooth fields plus detailed ribbons give the glass something visible to bend.
    const blobs = dark
      ? [
          [0.18, 0.28, "#254b5faa"],
          [0.72, 0.43, "#9380aa99"],
          [0.25, 0.96, "#344c76bb"],
        ]
      : [
          [0.13, 0.2, "#ebf0cfee"],
          [0.72, 0.34, "#b3a6daee"],
          [0.95, 0.9, "#ffd6adee"],
          [0.22, 0.98, "#abb2dfee"],
        ];
    for (const [x, y, color] of blobs) {
      const gradient = ctx.createRadialGradient(
        w * x,
        h * y,
        0,
        w * x,
        h * y,
        w * 0.65,
      );
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, "transparent");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.save();
    ctx.translate(w * 0.51, h * 0.54);
    ctx.rotate(-0.49);
    for (let i = 0; i < 4; i++) {
      const y = (i - 1.7) * h * 0.15;
      const gradient = ctx.createLinearGradient(
        0,
        y - h * 0.085,
        0,
        y + h * 0.085,
      );
      gradient.addColorStop(0, "transparent");
      gradient.addColorStop(0.43, dark ? "#b6b1e622" : "#ffffff44");
      gradient.addColorStop(0.5, dark ? "#cec5ed88" : "#ffffffa0");
      gradient.addColorStop(0.53, dark ? "#141b3633" : "#8883b126");
      gradient.addColorStop(1, "transparent");
      ctx.fillStyle = gradient;
      ctx.fillRect(-w * 1.5, y - h * 0.085, w * 3, h * 0.17);
    }
    ctx.restore();
    ctx.fillStyle = dark ? "#eeedf342" : "#ffffff88";
    ctx.font = `italic ${small ? 105 : Math.min(w * 0.245, 190)}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Glass", w * 0.5, h * 0.51);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    if (!small) {
      ctx.fillStyle = dark ? "#ffffff35" : "#39335035";
      ctx.font = "9px monospace";
      ctx.fillText("LIGHT / FORM / FEELING", w * 0.065, h * 0.79);
      ctx.beginPath();
      ctx.strokeStyle = dark ? "#ffffff35" : "#6b657636";
      ctx.lineWidth = 1;
      ctx.arc(w * 0.85, h * 0.24, 24, 0, Math.PI * 2);
      ctx.moveTo(w * 0.85 - 35, h * 0.24);
      ctx.lineTo(w * 0.85 + 35, h * 0.24);
      ctx.moveTo(w * 0.85, h * 0.24 - 35);
      ctx.lineTo(w * 0.85, h * 0.24 + 35);
      ctx.stroke();
    }
  }

  class GlassRenderer extends window.LiquidGlass.Renderer {
    constructor(element, preset = null) {
      super(element, {
        maxDpr: preset ? 1.25 : 1.5,
        paintBackground: (ctx, width, height) =>
          paintBackground(ctx, width, height, !!preset),
        getState: () => ({
          material: preset ? presets[preset] : material,
          dark,
          invertedTint,
          edgeProfile,
          refraction: !!preset || refraction,
        }),
        onStatus: updateRenderStatus,
      });
      this.preset = preset;
    }
  }

  function updateRenderStatus() {
    const failed = renderers.some((renderer) => renderer.failed);
    $("render-status").classList.toggle("fallback", failed);
    $("render-status-text").textContent = failed
      ? "部分预览使用磨砂降级 · 无真实折射"
      : "WebGL · 实时光学折射";
    $("refraction-toggle").disabled = !!renderers[0]?.failed;
  }
  function isModified() {
    return fields.some(
      (key) => Math.abs(material[key] - presets[selected][key]) > 0.00001,
    );
  }
  function syncControls() {
    $("preset-select").value = selected;
    $("tint-mode").value = invertedTint ? "inverted" : "follow-theme";
    $("edge-profile").value = edgeProfile;
    $("edge-profile-note").textContent =
      edgeProfile === "soft"
        ? "双曲缓入：外缘略陡，向内延伸更宽，尾段柔和收平。"
        : edgeProfile === "rounded"
          ? "圆弧截面：厚度与法线连续变化，像圆润的玻璃边缘。"
          : "原版倒角：保留之前的边缘折射过渡，方便对照。";
    $("edge-curve").setAttribute(
      "d",
      edgeProfile === "soft"
        ? softProfilePath()
        : edgeProfile === "rounded"
          ? "M 10 35 A 27 27 0 0 1 37 8 H 220 V 35 Z"
          : "M 10 35 L 37 8 H 220 V 35 Z",
    );
    syncTintPresentation();
    for (const key of fields) {
      const input = $(key);
      input.value = material[key];
      input.style.setProperty(
        "--range-progress",
        `${((material[key] - input.min) / (input.max - input.min)) * 100}%`,
      );
      $(key + "-value").textContent =
        key === "tint"
          ? `${Math.round(material[key] * 100)}%`
          : key === "thickness"
            ? `${material[key]} px`
            : key === "roughness"
              ? `${material[key].toFixed(1)} px`
              : key === "dispersion"
                ? material[key].toFixed(3).replace(/0$/, "")
                : material[key].toFixed(2);
    }
    $("modified-label").textContent = isModified() ? "已自定义" : "原始参数";
    $("preview-name").textContent =
      `${presets[selected].number} / ${presets[selected].name}${isModified() ? " · 自定义" : ""}`;
    $("preview-description").textContent = presets[selected].description;
    $("preset-note").textContent = presets[selected].note;
    document
      .querySelectorAll("[data-preset]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.preset === selected),
        ),
      );
    const matches =
      savedChoice?.preset === selected &&
      (savedChoice.edgeProfile ?? "bevel") === edgeProfile &&
      (savedChoice.tintMode ?? "follow-theme") ===
        (invertedTint ? "inverted" : "follow-theme") &&
      fields.every((key) => savedChoice.parameters?.[key] === material[key]);
    $("choose").innerHTML = matches
      ? "已选用这组参数 <span>✓</span>"
      : "选择这组预设 <span>↗</span>";
    $("choice-status").textContent = savedChoice
      ? `已保存：${presets[savedChoice.preset].name}。${matches ? "刷新页面可恢复这组参数。" : "当前调整尚未保存。"}`
      : "已载入你的 JSON 参数。当前调整尚未保存。";
  }
  function softProfilePath() {
    // Draw the actual normalized shader profile, including its longer shoulder.
    const widthRatio = softCurve.widthScale / softCurve.referenceWidthScale;
    const b =
      1 /
      (softCurve.edgeSlopeGain *
        widthRatio *
        (1 + 1 / softCurve.referenceBias) -
        1);
    const points = Array.from({ length: 49 }, (_, i) => {
      const t = i / 48;
      const q = ((1 + b) * t) / (t + b);
      const h = 1 - Math.pow(1 - q, 3);
      return `${i ? "L" : "M"} ${(10 + 27 * softCurve.widthScale * t).toFixed(2)} ${(35 - 27 * h).toFixed(2)}`;
    });
    return points.join(" ") + " H 220 V 35 Z";
  }
  function choosePreset(id) {
    if (!Object.hasOwn(presets, id)) return;
    selected = id;
    material = { ...presets[id] };
    syncControls();
    renderers[0].request();
  }
  function refreshScenes() {
    document.body.classList.toggle("dark-scene", dark);
    syncTintPresentation();
    for (const renderer of renderers) renderer.refreshBackground();
  }
  function syncTintPresentation() {
    const darkTint = invertedTint ? !dark : dark;
    $("tint-color").textContent =
      `${dark ? "深色模式" : "浅色模式"} · ${darkTint ? "深色" : "白色"}遮罩`;
    $("tint-hint").textContent =
      material.tint === 0
        ? "当前为 0%，底色完全透明。试用 20% 即可观察互换效果。"
        : "切换场景明暗，或切换遮罩配色，对比相同强度下的效果。";
    for (const renderer of renderers) {
      const opacity = renderer.preset
        ? presets[renderer.preset].tint
        : material.tint;
      renderer.element.style.setProperty(
        "--glass-tint",
        `rgba(${darkTint ? "14, 17, 26" : "252, 252, 247"}, ${opacity})`,
      );
    }
  }

  renderers.push(new GlassRenderer($("main-scene")));
  document
    .querySelectorAll(".swatch-scene")
    .forEach((element) =>
      renderers.push(new GlassRenderer(element, element.dataset.material)),
    );
  updateRenderStatus();
  syncControls();
  sourceImage.onload = () => {
    sourceReady = true;
    if (sceneMode === "original") refreshScenes();
  };
  sourceImage.onerror = () => {
    sourceFailed = true;
    const button = document.querySelector('[data-scene="original"]');
    button.disabled = true;
    button.title = "原站背景加载失败";
    if (sceneMode === "original") {
      sceneMode = "aurora";
      document
        .querySelectorAll("[data-scene]")
        .forEach((item) =>
          item.setAttribute(
            "aria-pressed",
            String(item.dataset.scene === sceneMode),
          ),
        );
      refreshScenes();
    }
  };
  sourceImage.src = "bg.jpg";

  fields.forEach((key) =>
    $(key).addEventListener("input", (event) => {
      material[key] = +event.target.value;
      syncControls();
      renderers[0].request();
    }),
  );
  $("preset-select").addEventListener("change", (event) =>
    choosePreset(event.target.value),
  );
  document
    .querySelectorAll("[data-preset]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        choosePreset(button.dataset.preset),
      ),
    );
  document.querySelectorAll("[data-scene]").forEach((button) =>
    button.addEventListener("click", () => {
      if (button.dataset.scene === "original" && sourceFailed) return;
      sceneMode = button.dataset.scene;
      document
        .querySelectorAll("[data-scene]")
        .forEach((item) =>
          item.setAttribute("aria-pressed", String(item === button)),
        );
      refreshScenes();
    }),
  );
  $("theme-toggle").addEventListener("click", () => {
    dark = !dark;
    $("theme-toggle").setAttribute(
      "aria-label",
      dark ? "切换至明亮场景" : "切换至暗色场景",
    );
    refreshScenes();
  });
  $("reset").addEventListener("click", () => choosePreset(selected));
  $("restore-custom").addEventListener("click", () => {
    selected = "liquid";
    material = { ...presets.liquid, ...customBaseline };
    invertedTint = true;
    syncControls();
    renderers.forEach((renderer) => renderer.request());
  });
  $("tint-mode").addEventListener("change", (event) => {
    invertedTint = event.target.value === "inverted";
    syncControls();
    renderers.forEach((renderer) => renderer.request());
  });
  $("edge-profile").addEventListener("change", (event) => {
    edgeProfile = event.target.value;
    syncControls();
    renderers.forEach((renderer) => renderer.request());
  });
  document.querySelectorAll("[data-tint-level]").forEach((button) => {
    button.addEventListener("click", () => {
      material.tint = Number(button.dataset.tintLevel);
      syncControls();
      renderers[0].request();
    });
  });
  $("refraction-toggle").addEventListener("click", () => {
    refraction = !refraction;
    $("refraction-toggle").setAttribute("aria-pressed", String(refraction));
    $("refraction-toggle").innerHTML =
      `<span class="toggle-track"></span>折射${refraction ? "开启" : "关闭"}`;
    renderers[0].request();
  });
  const makeChoice = () => ({
    version: 4,
    baselineRevision,
    preset: selected,
    name: presets[selected].name,
    customized: isModified(),
    tintMode: invertedTint ? "inverted" : "follow-theme",
    edgeProfile,
    parameters: Object.fromEntries(fields.map((key) => [key, material[key]])),
  });
  $("choose").addEventListener("click", () => {
    try {
      const choice = makeChoice();
      localStorage.setItem(storageKey, JSON.stringify(choice));
      savedChoice = choice;
      syncControls();
    } catch {
      $("choice-status").textContent =
        "浏览器不允许保存；请用「导出参数」保留你的选择。";
    }
  });
  $("export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(makeChoice(), null, 2) + "\n"], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `septuagint-glass-${selected}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  const mainScene = $("main-scene"),
    card = $("profile-card"),
    handle = $("drag-handle");
  let drag = null,
    lastLightUpdate = 0;
  const moveCard = (left, top) => {
    const x = Math.max(
      8,
      Math.min(mainScene.clientWidth - card.offsetWidth - 8, left),
    );
    const y = Math.max(
      42,
      Math.min(mainScene.clientHeight - card.offsetHeight - 40, top),
    );
    card.style.left = x + "px";
    card.style.top = y + "px";
    card.style.transform = "none";
    renderers[0].request();
  };
  handle.addEventListener("keydown", (event) => {
    if (event.key === "Home") {
      event.preventDefault();
      recenter();
      renderers[0].request();
      return;
    }
    const directions = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (!Object.hasOwn(directions, event.key)) return;
    event.preventDefault();
    const parent = mainScene.getBoundingClientRect(),
      rect = card.getBoundingClientRect();
    const [x, y] = directions[event.key],
      step = event.shiftKey ? 24 : 8;
    moveCard(
      rect.left - parent.left + x * step,
      rect.top - parent.top + y * step,
    );
  });
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const parent = mainScene.getBoundingClientRect(),
      rect = card.getBoundingClientRect();
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: rect.left - parent.left,
      top: rect.top - parent.top,
    };
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    moveCard(
      drag.left + event.clientX - drag.x,
      drag.top + event.clientY - drag.y,
    );
  });
  const stopDrag = () => {
    drag = null;
  };
  handle.addEventListener("pointerup", stopDrag);
  handle.addEventListener("pointercancel", stopDrag);
  handle.addEventListener("lostpointercapture", stopDrag);
  mainScene.addEventListener("pointermove", (event) => {
    if (reducedMotion.matches || performance.now() - lastLightUpdate < 33)
      return;
    lastLightUpdate = performance.now();
    const rect = mainScene.getBoundingClientRect();
    renderers[0].light = [event.clientX - rect.left, event.clientY - rect.top];
    renderers[0].request();
  });
  mainScene.addEventListener("pointerleave", () => {
    renderers[0].light = [-100, -150];
    renderers[0].request();
  });
  const recenter = () => {
    card.style.left = "50%";
    card.style.top = "50%";
    card.style.transform = "translate(-50%, -50%)";
  };
  window.addEventListener("resize", () => {
    recenter();
    renderers.forEach((renderer) => renderer.resize());
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) renderers.forEach((renderer) => renderer.request());
  });
  document.fonts.ready.then(() =>
    renderers.forEach((renderer) => renderer.request()),
  );
})();
