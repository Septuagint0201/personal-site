# YARD rendering performance fixtures

## Fixed-viewport glass regression

Open `/tools/glass-scroll-regression.html` on the Vite development server. The static grid isolates geometry scrolling from real scene/particle updates. `?mode=viewport` is Candy's presentation; `?mode=overlay` checks the transparent notes/picker output. `?mode=attached&legacy=1` uses a saved pre-change renderer at `tools/.baseline/viewport-20261025/liquid-glass.js` (extract `9cf4629:liquid-glass.js` from Git to create it).

`window.glassFixture.snapshot()` reports the source version, buffer dimensions, viewport bounds and per-card layer count. `pixels()` flushes and returns RGBA bytes for like-for-like nested-glass comparisons. Scroll both ways and vary viewport/DPR: fixed mode must keep origin `(0,0)`, keep its source version while only geometry changes, and leave no per-card presentation canvases. Source changes on an actual resize are expected. This fixture is excluded from production builds.

For shared-renderer initialization comparisons, preserve `liquid-glass.js` in `tools/.baseline/<name>/` and use `?baseline=<name>&mode=viewport` (or `overlay` / `attached`). Names accept lowercase letters, digits and hyphens. `snapshot().startup.createdMs` measures the synchronous constructor call; `readyMs` includes asynchronous driver preparation. `maxRenderTaskMs` and `maxResizeTaskMs` check whether blocking work moved into a deferred callback. These are different metrics: moving compilation off the main thread need not reduce total compilation time. Wait for `#scene[data-rendered="true"]` before comparing pixels.

The shared renderer exposes `ready` separately from `failed`: pending compilation is neither a failure nor a usable optical layer. With `KHR_parallel_shader_compile`, it polls completion without synchronous shader/link-status queries, then allocates resources for the latest size and uploads the retained background. `onStatus` reports successful readiness or failure. YARD keeps CSS/attached fallback layers until both the background and the appropriate compositor are ready. Hidden documents suspend polling; visibility resumes it even with a paused scene. Context restoration reacquires extensions and prepares a replacement program. A stalled program falls back after 90 seconds, but completion is checked before applying the deadline; disposal cancels work, removes listeners and deletes pending GPU objects. Drivers without the extension retain synchronous setup.

## Steady-state interface work — 2026-10-27

Reference: `38d8e6b`. The three chapter renderers now tell `onFrame(canvas, version, continuous)` whether they will schedule another frame. Only intermediate snapshots are paced at the existing 30Hz UI refresh rate; the last frame, a new source and a resized viewport are copied immediately while the WebGL drawing buffer still exists. Callers without this hint retain the previous behavior. Do not defer the final canvas read to a timer: the browser may already have cleared a non-preserved WebGL buffer. The timer may defer compositing the retained snapshot instead.

Repeated writes of the same `hidden` value previously extended the interface's 350ms interaction loop on every Chapter 03 status update. Status writes now change only when needed, and the shared observer ignores unchanged `open`/`hidden` values. Real changes still animate. Surface rectangles are measured once by the compositor; explicitly approved optical-glass buttons skip size-based material measurement.

Local browser work counts below cover 600 animation callbacks, approximately 2.5 seconds on the 240Hz test display, at 1280 × 720 and DPR 1. Allow loading/interaction transitions to settle before recording. These count JavaScript/graphics API work, not FPS or GPU time; the chapter rendering cadence, buffers, optical quality and simulation are unchanged.

| Work | Reference | Updated |
| --- | ---: | ---: |
| Chapter 03 UI compositor draws | 600 | 75 |
| Chapter 03 total bounding-rectangle reads | 7,800 | 375 |
| Chapter 02 scene-to-UI snapshot copies | 150 | 75 |
| Chapter 02 total bounding-rectangle reads | 2,325 | 825 |
| Chapter 01 canvas-to-canvas copies, excluding arrow/presentation layers | 827 | 300 |
| Directory total bounding-rectangle reads | 1,875 | 975 |
| Homepage size-property reads per UI frame | 17 | 15 |

The static grid comparison is pixel-identical for viewport, attached and overlay presentations. All three paused chapters stopped extra UI draws/copies after settling; paused notes survived a real WebGL context restoration. Regression tests cover 60–240Hz sources, the final paused frame, resize/source replacement, skipped versions, hidden/disposed pages and idempotent attribute mutations. Mobile checks cover all four YARD pages, High defaults, overlays and overflow. These checks supplement the existing simulation/optics tests rather than claiming every interaction or device was measured.

## Chapter 03 CPU comparison

From `yard/`, run `node tools/benchmark-desert.mjs`. To compare a preserved source copy, use `node tools/benchmark-desert.mjs --baseline=tools/.baseline/desert-sand-20261012`. The optional reference directory must contain `desert-skin.js` and `sand-field.js`; keep reference copies in the ignored `.baseline/` directory before modifying them.

The fixture measures seven warmed batches of skin interpolation and height sampling. It compares all output vertices across sixteen deformed poses, five softness values and a hover scale, retaining the same 1,600/6,400 triangle densities. These are CPU kernel timings, not whole-frame or GPU/FPS results.

On the local 2026-10-12 comparison, the 6,400-triangle interpolation went from about 0.33–0.43 ms to 0.058–0.068 ms per call (about 82–84% less CPU time); sampled Float32 vertex positions and height samples matched exactly. Absolute times depend on the host. Resolution, MSAA, transmission resolution, dispersion, physical lattice and particle budgets were retained. Static sand detail now uses 1,024px albedo/normal maps, and changed terrain normals use direct grid reads. Paused/settled bodies skip geometry rebuilding; live grain buffers upload only their used prefix.

The contact/corner follow-up can be compared with `node tools/benchmark-desert.mjs --baseline=tools/.baseline/desert-contact-20261012 --surface`. It retains the prior skin optimization. Reusing row/column trigonometry reduced the local 1,024px texture bake from approximately 126 ms to 96 ms, with identical texture bytes. Direct scalar volume gradients reduced that kernel from approximately 1.92 µs to 0.84 µs, with identical scalar/gradient outputs. These kernel savings do not measure the cost of the new surface-contact queries. Contact groups are refreshed only while grains are active; paused particle attributes no longer upload, and live particle color/size buffers change only with pool membership.

## Chapter 02 GPU fixture

Run `npm run dev` from `yard/`, then open `/tools/render-benchmark.html`. This fixture is excluded from the explicit Vite production page list. It uses the actual renderer and `EXT_disjoint_timer_query_webgl2` to measure its eight HDR passes. Allow shader preparation to finish before judging performance.

`benchResult.startup` records elapsed time from the beginning of the fixture (including dynamic module loading): `rendererCreatedMs` ends at constructor return, `preparedMs` at the ready callback, and `firstFrameMs` at the first complete frame's draw submission. The last value is not a GPU completion or screen-presentation timestamp. Compare repeated runs at the same viewport and distinguish warmed driver caches from a first visit; cache hits cannot establish cold-compilation speed.

Chapter 02 keeps adaptive sampling in a uniform loop with one spectral transport call site. Derivatives must remain outside the per-fragment sampling branch, and the loop must not exit early per fragment: either change can silently disable edge sampling on real drivers. Compare the captured `benchImage` at entrance/close/side views, both quality presets and discovery effects after editing this path. Startup lifecycle tests also cover deferred HDR allocation, completed background compilations, a genuinely stalled program, non-parallel drivers and context restoration.

The scene is paused for repeatability. Each view has 16 warmup frames and 96 measured frames. The reported total is the median of complete per-frame GPU sums, not the sum of stage medians. If GPU timers are unavailable, `gpuTimer` is false and the value includes JavaScript submission and GPU synchronization; do not compare that fallback with GPU-only results. Use an HDR-capable WebGL2 browser for this fixture.

Choose Entrance, Close glass or Side wall. Query options:

- `?baseline` loads the ignored `tools/.baseline/` source copy.
- `?quality=high` selects High; the default is Ultra.
- `?time=1` advances the deterministic scene for 60 frames before freezing it.
- `?view=close` or `?view=side` starts directly at that view.
- `?effect=resonance`, `?effect=constellation` or `?effect=afterimage` exercises a discovery's optical path without modifying saved discoveries.
- `?flow` keeps the simulation running throughout measurement, retaining temporal history instead of invalidating it on every frame. Compare this mode only with the same mode and pre-roll in the reference version.
- Combine options with `&`, for example `?baseline&quality=high`.

Create the reference copy before changing production code, or extract a known revision. For the latest comparison, run this PowerShell from `yard/`:

```powershell
New-Item -ItemType Directory -Force tools/.baseline
$referenceArchive = Join-Path ([IO.Path]::GetTempPath()) ('yard-reference-' + [guid]::NewGuid() + '.tar')
git archive --format=tar "--output=$referenceArchive" c1e86101aa3304f9c55cc2c413d92ab8c20072da:yard/src
tar -xf $referenceArchive -C tools/.baseline
Remove-Item -LiteralPath $referenceArchive
```

Run both versions with the same fixture, viewport, quality and simulation time, sequentially in one browser/GPU session. Synthetic 60 Hz animation timestamps make simulation pre-roll deterministic. Each measured frame invalidates temporal history with a zero-angle look update, so this measures active tracing rather than paused convergence or display frame rate. It also means the exported image is a single jittered frame with spatial AA, not a fully accumulated still. For pixel comparisons, use the same navigation sequence and sample phase for both versions.

After `body.dataset.status` becomes `done`, `window.benchResult` contains the timings and `window.benchImage` contains the native render-buffer PNG captured after the final resolve. These are development fixture exports only; the public page exposes neither. Disjoint GPU measurements are discarded; inspect the reported complete-frame count before comparing. Do not run another GPU workload in parallel.

`submissionMs` is the median JavaScript duration of the complete renderer callback. With GPU timers it measures CPU submission, not GPU completion. In the no-timer fallback it also includes the explicit synchronization, so the two modes are not comparable.

## Recorded comparison

Reference: `dc95d00` before ellipsoid precomputation and intersection early-outs. ANGLE / NVIDIA RTX 4080 Laptop GPU / Direct3D11, 96 frames per view. Desktop viewport 1280 × 720 with DPR 1.25; Ultra render buffer 2080 × 1170. Quality settings are identical.

| Scene | Reference GPU ms | Optimized GPU ms | Reduction |
| --- | ---: | ---: | ---: |
| Entrance | 19.87 | 14.25 | 28.3% |
| Close glass | 28.11 | 22.55 | 19.8% |
| Side wall | 16.14 | 13.08 | 19.0% |
| Entrance after 1 s of simulation | 23.34 | 17.68 | 24.2% |
| High, 390 × 844 render buffer | 3.22 | 2.66 | 17.3% |

The narrow High run uses the same desktop GPU; it is not a phone GPU measurement. These times do not predict end-to-end FPS or guarantee gains on other hardware.

Matching RGB8 buffer comparisons across these five views had mean absolute channel error of 0.00043–0.00352 on a 0–255 scale and PSNR of 54.1–66.9 dB. The 99th percentile channel error was zero in every view; sparse differences occur at glass/grazing boundaries due to floating-point rounding. No optical effect, model, sample count or quality setting was removed. These snapshots supplement interaction and context-restoration checks; they do not exhaust all camera angles or liquid states.

## Spatial bounds and shared first reflection — 2026-10-07

Reference: `5233cc2`, the previous deployed optimization. Same RTX 4080 Laptop / ANGLE Direct3D11 setup, 96 measured frames per view, Ultra buffer 2080 × 1170. Each final comparison navigates directly to its preset with the same fixture and sampling sequence; the optical quality settings are unchanged. GPU time is the entire eight-pass pipeline.

| Scene | Reference GPU ms | Optimized GPU ms | Reduction |
| --- | ---: | ---: | ---: |
| Entrance | 13.18 | 12.83 | 2.6% |
| Close glass | 22.88 | 15.58 | 31.9% |
| Side wall | 13.03 | 9.70 | 25.5% |
| Entrance after 1 s of simulation | 17.54 | 15.43 | 12.0% |
| Close glass / Resonance | 22.70 | 15.75 | 30.6% |
| Close glass / Constellation | 36.58 | 27.10 | 25.9% |
| Close glass / Afterimage | 29.75 | 22.27 | 25.1% |
| High, 390 × 844 render buffer | 2.42 | 1.84 | 23.7% |

Entrance remains essentially unchanged within small timing variations. The largest gains occur on paths with repeated geometry intersections and glass reflections. The High run uses a narrow viewport on the same desktop GPU, not a physical phone. Results are GPU workload measurements, not guaranteed display FPS.

Five of the eight RGB8 comparisons were pixel-identical: entrance, close glass, flowing snapshot, Afterimage and High. The other comparisons changed 532–962 of 2,433,600 pixels (at least 99.96% unchanged), with mean absolute channel error of 0.00073–0.00146 on the 0–255 scale. These sparse boundary differences remain within the previous floating-point comparison scale. All three discovery render paths, production quality defaults and graphics-context restoration were checked. No resolution, material, geometry, spectral channel, ray-depth or anti-aliasing setting was reduced.

## Discovery bounds and reflected-interface reuse — 2026-10-07

Reference: `683246a`, including the previous optimization and pointer-lock fix. Sequential comparisons in the same browser/GPU session, with 96 complete measured frames for each view. Ultra remains 2080 × 1170. Compare within this table: GPU timings vary between sessions.

| Scene | Reference GPU ms | Optimized GPU ms | Reduction |
| --- | ---: | ---: | ---: |
| Entrance | 11.16 | 10.69 | 4.3% |
| Close glass | 13.39 | 13.06 | 2.5% |
| Side wall | 8.55 | 8.40 | 1.8% |
| Entrance after 1 s of simulation | 13.74 | 13.37 | 2.7% |
| Close glass / Resonance | 13.40 | 13.24 | 1.2% |
| Close glass / Constellation | 22.57 | 20.29 | 10.1% |
| Close glass / Afterimage | 18.42 | 16.66 | 9.6% |
| High, 390 × 844 render buffer | 1.84 | 1.75 | 4.8% |

Repeat comparisons retained 9.5% for Constellation and 8.8% for Afterimage, including reversed run order for the latter. Smaller gains are close to timing variation; the discovery paths are the clearest improvement. The narrow High run uses the desktop GPU and does not measure phone hardware or end-to-end FPS.

All six non-trail snapshots were pixel-identical. Constellation changed 850 pixels and Afterimage 501 of 2,433,600, leaving at least 99.965% unchanged; mean absolute channel error was 0.00096 and 0.00090 on the 0–255 scale. These snapshots are limited coverage, not a proof for every view. Resolution, spectral transport, ray depth, AA, bloom, materials and geometry remain unchanged. A separate static-frame uniform-buffer experiment was discarded because its roughly 1% gain did not justify the additional buffer and lifecycle code.

## Frame scheduling and interface overhead — 2026-10-09

Reference: `c1e8610`. Sequential comparisons use the same browser/GPU session, 96 complete GPU frames per view, Ultra at 2080 × 1170 and a narrow High check at 390 × 844. The retained changes target scheduling and redundant work; they do not reduce optical quality.

| Check | Reference | Updated | Scope |
| --- | ---: | ---: | --- |
| 60 Hz draw budget on simulated 144 Hz callbacks | 48 draws/s | 60 draws/s | Scheduler test; actual GPU-limited FPS can be lower |
| Menu card computed-style queries over 120 animation callbacks | 48 | 0 | Settled desktop view; resize remeasures the cards |
| Chapter 01 stage attribute mutations over 120 callbacks | 960 | 15 | Diagnostics are sampled at 5 Hz; selection and view mode remain immediate |
| Ultra final resolve pass | 0.083 ms | 0.070 ms | Repeated across entrance, side, close and discovery views |
| High temporal pass with discarded history | 0.010 ms | 0.006 ms | Same desktop GPU with a narrow viewport, not a phone measurement |

The complete optical pipeline remained within session variation, so these results do **not** establish an overall GPU FPS gain. Representative paired totals were 11.28/11.29 ms at the entrance, 15.15/15.17 ms at close glass, and 20.72/20.68 ms with moving glass and active temporal history. Afterimage varied between runs; reversing the order gave 19.63/19.31 ms. Broader metal groups and precomputed light/trail values were tested and discarded because whole-frame gains were not stable.

Five of eight final RGB8 comparisons were pixel-identical: entrance, side wall, Constellation, Afterimage and High. Close glass changed 691 pixels, Resonance 532, and the flowing snapshot three of 2,433,600 pixels; mean absolute channel error was at most 0.00078 on a 0–255 scale. The moving snapshot differed by at most one level. Sparse boundary differences in the other two views remain within the previous compiler/rounding comparison scale. No transport code, scene geometry, optical depth, quality preset or sampling threshold changed.

Browser checks also cover card resizing from 390 to 1280 CSS pixels, coordinate navigation after pointer preview, Chapter 01 selection/Pulse/Pause and visible mobile actions, Chapter 02 mobile Gather/release and sound toggle, and WebGL context loss/restoration. Public assets already use gzip and cache headers; no server configuration change was needed.
