# YARD — A collection of small universes

Live: https://yard.septuagint21.org/

This is the `yard/` subproject of the personal-site repository. Run the commands below from this directory. It is deployed at the YARD domain root independently of the Candy homepage; the absolute paths in its pages are not intended for a `/yard/` URL prefix.

A self-hosted chapter collection. The root is a crystal-card directory; Chapter 01 at `/chapters/01/` is a full-screen Three.js optical playground with three works sharing a world-space orbit. Chapter 02 at `/chapters/02/` is The weight of light: a walkable dark chamber of mirrored frames, freely drifting liquid glass and three discoveries. All runtime dependencies are bundled locally. No accounts, analytics, remote textures, or external font requests are required.

## Collection and adding chapters

The directory is a fixed, single-viewport window onto a Y/Z ring with a horizontal axis and diameter at least 1.64 viewport heights. The screen's top and bottom edges clip the neighbouring cards: 66% of each neighbour is inside the viewport at rest, increasing to 90% on the approached side. The cards do not rely on central-card overlap for this exposure. The selected card stays fully inside the viewport and separated from the neighbours throughout pointer preview. Damped angular springs drive navigation. Exposed cards, glass triangles and arrow keys advance one adjacent chapter; thumbnails can select a chapter directly. Wheel/trackpad input continuously moves the orbit and settles on a chapter after release. Mouse and touch can drag horizontally or vertically. Reduced motion snaps between stations. A static first-chapter link remains available without JavaScript.

`src/ring-scroll.js` normalizes pixel, line and page wheel input, including horizontal trackpads. It consumes native momentum without adding another fling, caps the pending angular lead, and snaps after 140 ms of quiet input. Small accidental input returns to the same station; a deliberate short notch advances one card. There is no fixed 650 ms lockout. Drag direction locks after 8 px, takes over the current visible angle and settles on release; a stationary held drag does not keep scheduling card paints. Pinch/Ctrl-wheel zoom remains native. Pointer preview yields during scrolling, while wheel input over the entry link can still move the orbit. Buttons, keyboard, thumbnails, blur and hidden-page events cancel pending input cleanly. Reduced motion advances once per wheel gesture and does not animate a held drag.

Card sub-elements and the untransformed stack bounds are cached. Side captions and side/direction attributes change only when their values change, rather than rebuilding captions on every spring frame. Frames used only to wait for input to end do not repaint unchanged cards. Geometry, glass resolution and material settings are unchanged. Tests cover momentum, reversals, wrapping, device units, huge packets, mid-transition grabbing, interruption and unequal ring stops; browser checks cover actual wheel events over a hovered entry, continuous event sequences, coordinate entry clicks and narrow-view dragging. Narrow-view pointer tests are not physical phone testing.

`src/menu-orbit-geometry.js` measures exposure against actual viewport bounds. Transparent stage/stack containers do not intercept pointer hits from cards behind their 3D planes. The physical spring pauses while the entry link is hovered, and mouse focus on a side card does not trigger a second preview movement. Coordinate-click regression checks must enter the link after a nonzero pointer preview; a semantic click at rest alone cannot detect the browser's old 3D hit-plane problem.

The ring bows toward the other side: its centre is at depth `+R`, the camera is at `+4R`, and the selected station stays at depth zero. The camera remains outside the circle. Radius, camera-to-main-card distance and screen-edge exposure are unchanged when the curvature flips.

Cards have a symmetric horizontal inset inside their original column: 14–32 px per side on desktop and 6 px on mobile. The orbit centre and vertical exposure stay fixed while the arrows and thumbnail rail gain breathing room.

`src/ring-navigation.js` is shared with Chapter 01. It accepts equally or unequally spaced angular stops, keeps rotation continuous across wraparound, and separates pointer preview from selection. Directional inputs always advance exactly one stop, including when the collection grows beyond three items. `src/interaction.css` supplies hover scaling, highlights, and press scaling to DOM controls. `src/glass-arrows.js` renders pure triangular lenses from the live canvas behind each control using the approved Candy glass shoulder/IOR/thickness/dispersion profile.

`src/chapters.js` is the chapter manifest; `src/menu.js`, `src/menu.css`, and `src/menu-glass.js` render the collection. Chapters 01 and 02 are published. Entry 03 remains a clearly labelled placeholder with no destination. Covers are local code-native SVG artwork in `public/covers/`.

To publish another chapter, add its HTML at `chapters/NN/index.html`, add it to the `pages` map in `vite.config.js`, and update its manifest entry with the real title, cover, description and `href`. The build automatically creates a sibling `yard.html` for every HTML entry to match the existing Nginx directory index. Keep an All chapters link in each experience. The collection links to https://candy-spt.com/; the Candy homepage links back to the collection.

## Run and build

Requires Node.js 22.12+ (developed with Node 26). Dependencies are pinned in package-lock.json.

```sh
npm ci
npm run dev
npm test
npm run build
```

Development: http://127.0.0.1:5178/. Production output: `dist/`. The build emits both `index.html` and `yard.html` at the root and inside each chapter directory for the existing Nginx configuration.

## Chapter 01 interaction

- All three sculptures coexist on a horizontal circular track. The chosen work is near the arch; the other two wait behind the viewer. A wider field of view and closer home camera preserve the sculpture's apparent size while increasing the track's eccentricity around the viewer.
- Left-drag to orbit the camera around the focused glass; right-drag to look around from the same position. On touch, drag the sculpture to orbit or the empty room to look around. Drag sensitivity follows the visible field of view and viewport dimensions. Pointer movement gently previews a track turn and moves a local light.
- Click a waiting object to move one adjacent station in its circular direction. The direction follows the collection's order and stays consistent when the camera turns or crosses index zero; it never jumps directly to a distant object's index. Left/Right, the wheel, and the two live refracting glass triangles use the same directional step.
- Moonlight is the fixed environment. Light intensity and dispersion remain adjustable. Show light paths adds an illustrative optical spectrum.
- On mobile, Pulse, Pause and Reset always remain visible. The compact switch only folds the Light intensity and Dispersion sliders; opening them does not move the action row.
- Field notes contains material descriptions and prompts for each study, a saved discovery collection with replay buttons, and the gesture/keyboard guide. The footer discovery counter opens the collection directly.
- Tap a glass object or send a pulse for light waves and particles.
- Sound is off on every page load. Enabling it starts quiet synthesized glass chimes; no audio files are fetched.
- Left/Right switch stations; A/D turn the view, Up/Down change its pitch, Space pauses, P or Enter sends a pulse, T toggles light paths, R resets the view, and ? opens the guide. Hold G for the keyboard equivalent of holding the glass.
- Five touches within five seconds reveal Resonance; a 1.3-second hold reveals Zero gravity; three signature clicks within three seconds reveal A little universe. All effects can be repeated. Only the three discovery IDs are saved in localStorage; reset view clears temporary visual effects, not discoveries.

## Chapter 02 interaction

- Click the room or Enter the current to capture the mouse. Relative mouse movement looks around without dragging; Escape releases the cursor and clears held movement/Gather. W/A/S/D walk, and arrow keys remain a keyboard look alternative. The camera collides with a continuous body capsule against the round metal framework and walls. Entrance restores the camera without resetting the glass.
- Capture prefers unadjusted relative mouse input, with a normal-capture fallback when raw input is unsupported. The first mouse sample establishes the locked coordinate anchor; a later change to that anchor is treated as cursor relocation and discarded. Continuous relative movement keeps its full displacement, including fast/coalesced packets, without smoothing or a speed cap. Capture errors and Escape still release pending input.
- Mobile uses a virtual movement joystick on the left and drag-look on the right. Pulse, hold-Gather and Split buttons stay visible. Pointer cancellation, blur, hidden tabs and dialogs release movement and held actions.
- Left click/P/Pulse disturbs the selected drop, hold E/Gather attracts nearby liquid, and right click/F/Split divides a sufficiently large free drop. The first click captures without firing. A small aim-assist cone acquires reachable drops, with a slightly wider retention cone to prevent flicker; exact hits win, metal and nearer glass block selection, and actual interaction uses the selected ray. Aim at the etched mark and Pulse to touch it. Glass and controls respond to hover, pressure and selection.
- While captured, controls recede and Escape restores them. Opening notes, hiding the page, losing focus or the graphics context releases capture and held input. Browsers without pointer lock retain drag-look and buttons. Local surface light echoes follow Pulse/Split, Gather creates a floor glow and live cluster reading, and the room instrument counts joins and returns. These light accents do not change liquid volume or add persistent discoveries.
- Eight long rectangular emitters occupy all four walls. Twenty-four round-section metal segments form six connected, intersecting frames and eighteen condensation bends.
- Drops condense at bends, stretch free, drift in different directions, coalesce, divide when large, and flow along a new rod before returning to the frame. There is no shared gravity or travel direction. Total glass volume is conserved; the number of drops can change. Temporarily absorbed liquid is accounted for in a reservoir and reappears at another bend.
- Ultra is the desktop default; High is the mobile default. Pause stops liquid motion while leaving the viewpoint and controls usable. Sound is off until explicitly enabled.
- Chapter 02 has an independent procedural instrument in `src/liquid-audio.js`: a low pressure pulse, diverging split tones, density-responsive held Gather, and quiet detachment, coalescence and metal-return cues. Event positions and camera orientation set stereo placement and distance attenuation; larger drops have a lower voice. Resonance, Constellation and Afterimage have distinct motifs, including discovery replays. Chapter 01 keeps its own glass chimes.
- Audio uses native Web Audio scheduling, at most 32 sources, throttled ambient events and three finite filtered echo taps. It loads no samples and adds no render pass. Muting or hiding the page disconnects the complete instrument and echo tails before suspension. Releasing Gather, Escape, blur and dialogs release the held tone. A fresh page always starts silent; no sound preference is stored.
- Field notes includes interaction hints and exactly three persistent discoveries. Resonance follows five distinct pulses within eight seconds; Constellation follows three nearby drops held together for three seconds; Afterimage responds to the far-wall mark. Effects can be replayed from the discovered entries. Only the three IDs persist in localStorage.

## Rendering and accessibility

The menu uses a shared procedural architectural background and WebGL screen-space Snell refraction. Its broad C2 glass shoulder, spectral IOR and softbox reflections follow the approved homepage glass studies. It approximates transparent card optics, not full 3D ray tracing. CSS provides a readable fallback. The directory does not load Three.js.

Chapter 01 uses physically based raster rendering with MeshPhysicalMaterial transmission, thickness, Fresnel reflection, dispersion, an environment map, and real-time lights. Beveled geometry and a bright architectural room provide visible detail through the glass. Ground caustics are an artistic procedural approximation.

Chapter 02 traces the actual room, mirror capsules and deforming glass ellipsoids. Coalescing/splitting pairs have local smooth-distance necks. Three wavelengths follow refraction, total internal reflection and thickness absorption; mirror reflections can see other frames and drops. The main path uses five interactions in High and eight in Ultra, with shorter secondary reflection branches. Secondary rays start on the correct side of the surface, and reflected glass paths follow both interfaces to avoid unstable coloured specks. Rectangular emitters are visible to the rays; diffuse room lighting uses an analytic area approximation. This is bounded ray tracing, not full global-illumination path tracing. Adaptive edge sampling uses four correlated subpixel rays in Ultra and two in High. A centred 16-phase sequence and coverage-aware temporal clipping integrate glass silhouettes and keep colour history bounded; FXAA and restrained bloom finish the HDR image.

`src/liquid-simulation.js` is a deterministic 120 Hz mass-conserving parcel simulation, not a Navier–Stokes fluid solver. Sphere-equivalent volumes and volume-preserving deformations drive the optical surfaces. `src/liquid-room.js` shares geometry among tracing, simulation and camera collision. `src/liquid-camera.js` uses continuous segment/capsule distances, horizontal sliding and small movement substeps. Up to sixteen simultaneous parcels bound the shader workload; coalescence frees room for later divisions without losing material.

Free droplets have two transverse capillary modes: width trades between the two axes while their scale product remains one. Pulse, coalescence and division briefly amplify the deformation before it relaxes. Picking and tracing use the same asymmetric ellipsoid basis, including the near-vertical orientation threshold.

An independent HDR room pass adds view-dependent traced floor reflections, emitter housings and local contact/corner occlusion. The latter two are surface approximations, not additional geometry or globally traced shadows. Reflections use a bounded three-interface path and a shorter temporal history on the floor while liquid moves. Keeping room finishing outside the spectral transport call graph avoids excessive shader inlining. The LDR fallback retains the original optical path without these HDR accents.

Bloom uses a four-level Gaussian downsample chain with a soft HDR threshold, preserving the light's colour and spreading it continuously rather than sampling separated radial points. FXAA filters radiance before the final bloom composite and tone mapping, so the glow is retained along high-contrast silhouettes. All extra targets resize with the render buffer and are recreated after context restoration and released on disposal. Restoration also re-enables the shader-compilation and floating-point framebuffer extensions before rebuilding the pipeline.

For the first mirror reflection, ray differentials estimate the pixel's footprint on the rectangular emitter. Integrating the strip's coverage removes dotted subpixel highlights without softening the whole room. Paths that never encounter glass share one RGB transport; spectral paths stay in a single wavelength loop to avoid excessive shader inlining during driver compilation.

Ellipsoid inverse transforms are packed once per frame and reused by the spectral and room passes. Conservative enclosing spheres reject impossible unpaired-drop hits before the exact intersection. Capsule tracing rejects infinite-cylinder misses before testing end caps, and surface normals are evaluated only for the closest hit. These reduce repeated arithmetic without changing resolution, ray counts, geometry, bloom or temporal settings. The development-only [GPU benchmark](tools/README.md) compares fixed views and matching pixel samples against a local reference renderer.

Adjacent metal segments share conservative axis-aligned bounds, padded before Float32 upload. Rays that miss a group skip its exact capsule tests; segment order stays unchanged at shared bends. The bounds use finite reciprocals for parallel rays and are rebuilt with the other static uniforms after context restoration. The first glass-interface reflection is cached on demand across wavelengths, while later refracted paths stay separate. Tracing also stops before computing the unused next hit after the configured final interaction. Uniform arrays follow the shared room's actual segment count; no geometry is removed.

Constellation links and Afterimage trails also use padded capsule bounds before their exact solve. The first glass-interface reflection is shared even when the incident ray first reflects off metal: before reaching glass, all wavelengths follow the same path. Room contact occlusion finds the nearest frame before evaluating its monotonic exponential falloff once, preserving the previous maximum-occlusion result. These changes retain all optical and sampling settings.

Shader preparation is asynchronous where supported. High uses up to 1.5 device pixels per CSS pixel and a 2.4 million-pixel budget. Ultra uses a larger supersampled buffer, capped at 5.8 million pixels. Neither setting silently reduces resolution according to frame rate. Temporal history resets when the camera moves or resolution changes; paused frames settle over 32 samples, then stop drawing. Moving glass uses a shorter history to limit trails.

Rendering and audio suspend when the document is hidden. Reduced-motion preference starts in a static scene; manual camera/material changes and selection still work. Native controls and dialog support keyboard use. A renderer failure/context loss shows a recovery view; JavaScript-disabled browsers get a static explanation and a link to the personal site.

Frame scheduling carries a 60 Hz deadline for Chapter 02 and a 30 Hz deadline for the menu background across display refreshes. This avoids accidentally reducing the draw budget to 48 Hz on a 144 Hz display; it does not guarantee 60 fps on a GPU-bound device. User-driven menu updates still draw immediately, and paused/hidden views reset their deadline. Glass-card dimensions and corner radii are cached until resize; live bounds and inline tilt still follow the orbit on every draw. Chapter 01 diagnostics update at 5 Hz, and Chapter 02 readings only change their text when values change. Repeated Gather density readings do not schedule duplicate audio automation.

The optical transport remains unchanged. Temporal resolve bypasses neighbourhood filtering only when history has already been discarded, and FXAA fetches its four directional samples only above the existing contrast threshold. Spectral channels, ray depth, geometry, target resolution, AA thresholds and bloom settings are retained. See [measured scope and limitations](tools/README.md#frame-scheduling-and-interface-overhead--2026-10-09).

## Server deployment

- SSH alias: `septuagint-vm1`
- Existing Nginx root: `/home/septuagintuser/site/septuagint21.org/yard`
- Existing directory index: `yard.html`
- Static-only deployment; no Node.js process or service restart is needed on the server.
- Backups and source archives live outside the public root in sibling `yard-backups` and `yard-sources` directories.
- Upload hashed assets and cover art first, then atomically replace chapter HTML before the root menu after backing up the previous public directory. Deploy both generated HTML names in each directory. Retain older hashed assets so already-open clients can finish loading them.

The original welcome page is preserved in the first deployment backup. Roll back by restoring the corresponding backup's HTML and assets to the same document root; no Nginx configuration change is needed.

## Verification

Run `npm test` (or `npm test --prefix yard` from the repository root) for orbit/clipping, body collision, liquid lifecycle, deterministic frame-rate independence, five-minute volume conservation and discovery timing. Production build and JavaScript syntax are checked before deployment. Browser checks cover coordinate clicks after preview, room walking, Gather/release, the far-wall interaction, mobile controls, quality defaults and responsive layouts. Actual performance depends on GPU/browser and is not a guaranteed frame rate.
