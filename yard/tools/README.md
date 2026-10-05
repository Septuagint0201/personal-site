# Chapter 02 GPU comparison

Run `npm run dev` from `yard/`, then open `/tools/render-benchmark.html`. This fixture is excluded from the explicit Vite production page list. It uses the actual renderer and `EXT_disjoint_timer_query_webgl2` to measure its eight HDR passes. Allow shader preparation to finish before judging performance.

The scene is paused for repeatability. Each view has 16 warmup frames and 96 measured frames. The reported total is the median of complete per-frame GPU sums, not the sum of stage medians. If GPU timers are unavailable, `gpuTimer` is false and the value includes JavaScript submission and GPU synchronization; do not compare that fallback with GPU-only results. Use an HDR-capable WebGL2 browser for this fixture.

Choose Entrance, Close glass or Side wall. Query options:

- `?baseline` loads the ignored `tools/.baseline/` source copy.
- `?quality=high` selects High; the default is Ultra.
- `?time=1` advances the deterministic scene for 60 frames before freezing it.
- Combine options with `&`, for example `?baseline&quality=high`.

Create the reference copy before changing production code, or extract a known revision. For the comparison below, run this PowerShell from `yard/`:

```powershell
New-Item -ItemType Directory -Force tools/.baseline
$referenceArchive = Join-Path ([IO.Path]::GetTempPath()) ('yard-reference-' + [guid]::NewGuid() + '.tar')
git archive --format=tar "--output=$referenceArchive" dc95d00e1c5b25a5b2496321ef1fc87d5d690a2e:yard/src
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
