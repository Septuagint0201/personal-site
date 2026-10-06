# Chapter 02 GPU comparison

Run `npm run dev` from `yard/`, then open `/tools/render-benchmark.html`. This fixture is excluded from the explicit Vite production page list. It uses the actual renderer and `EXT_disjoint_timer_query_webgl2` to measure its eight HDR passes. Allow shader preparation to finish before judging performance.

The scene is paused for repeatability. Each view has 16 warmup frames and 96 measured frames. The reported total is the median of complete per-frame GPU sums, not the sum of stage medians. If GPU timers are unavailable, `gpuTimer` is false and the value includes JavaScript submission and GPU synchronization; do not compare that fallback with GPU-only results. Use an HDR-capable WebGL2 browser for this fixture.

Choose Entrance, Close glass or Side wall. Query options:

- `?baseline` loads the ignored `tools/.baseline/` source copy.
- `?quality=high` selects High; the default is Ultra.
- `?time=1` advances the deterministic scene for 60 frames before freezing it.
- `?view=close` or `?view=side` starts directly at that view.
- `?effect=resonance`, `?effect=constellation` or `?effect=afterimage` exercises a discovery's optical path without modifying saved discoveries.
- Combine options with `&`, for example `?baseline&quality=high`.

Create the reference copy before changing production code, or extract a known revision. For the latest comparison, run this PowerShell from `yard/`:

```powershell
New-Item -ItemType Directory -Force tools/.baseline
$referenceArchive = Join-Path ([IO.Path]::GetTempPath()) ('yard-reference-' + [guid]::NewGuid() + '.tar')
git archive --format=tar "--output=$referenceArchive" 683246ab0519a1c14a5e01d897fc7b427db3f76b:yard/src
tar -xf $referenceArchive -C tools/.baseline
Remove-Item -LiteralPath $referenceArchive
```

Run both versions with the same fixture, viewport, quality and simulation time, sequentially in one browser/GPU session. Synthetic 60 Hz animation timestamps make simulation pre-roll deterministic. Each measured frame invalidates temporal history with a zero-angle look update, so this measures active tracing rather than paused convergence or display frame rate. It also means the exported image is a single jittered frame with spatial AA, not a fully accumulated still. For pixel comparisons, use the same navigation sequence and sample phase for both versions.

After `body.dataset.status` becomes `done`, `window.benchResult` contains the timings and `window.benchImage` contains the native render-buffer PNG captured after the final resolve. These are development fixture exports only; the public page exposes neither. Disjoint GPU measurements are discarded; inspect the reported complete-frame count before comparing. Do not run another GPU workload in parallel.

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
