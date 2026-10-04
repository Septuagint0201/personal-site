# YARD — A collection of small universes

Live: https://yard.septuagint21.org/

This is the `yard/` subproject of the personal-site repository. Run the commands below from this directory. It is deployed at the YARD domain root independently of the Candy homepage; the absolute paths in its pages are not intended for a `/yard/` URL prefix.

A self-hosted chapter collection. The root is a crystal-card directory; Chapter 01 at `/chapters/01/` is a full-screen Three.js optical playground with a beveled crystal, a liquid knot, and an orbital lens. Chapter 02 at `/chapters/02/` is a live liquid-glass gallery with three working previews: suspended sculpture, glass passage, and waterfall with a rippling pool. All runtime dependencies are bundled locally. No accounts, analytics, remote textures, or external font requests are required.

## Collection and adding chapters

The directory places previous/next cards above and below the current chapter. Pointer proximity follows a smooth edge curve, opening the nearby card from a thin edge to roughly one-quarter height; clicking its exposed area selects it. Damped springs drive card motion and tilt. Drag/swipe navigation, horizontal trackpad gestures, arrow buttons, keyboard arrows/Home/End, and thumbnails also work. The rail sits beside the main card on desktop and below it on narrow screens. Reduced motion disables tilt and spring animation while preserving selection. A static first-chapter link remains available without JavaScript.

`src/chapters.js` is the chapter manifest; `src/menu.js`, `src/menu.css`, and `src/menu-glass.js` render the collection. Chapters 01 and 02 are published. Entry 03 remains a clearly labelled placeholder with no destination. The three Chapter 02 studies are candidates for later refinement or promotion into a future chapter. Covers are local code-native SVG artwork in `public/covers/`.

To publish another chapter, add its HTML at `chapters/NN/index.html`, add it to the `pages` map in `vite.config.js`, and update its manifest entry with the real title, cover, description and `href`. The build automatically creates a sibling `yard.html` for every HTML entry to match the existing Nginx directory index. Keep an All chapters link in each experience. The collection links to https://candy-spt.com/; the Candy homepage links back to the collection.

## Run and build

Requires Node.js 22.12+ (developed with Node 26). Dependencies are pinned in package-lock.json.

```sh
npm ci
npm run dev
npm run build
```

Development: http://127.0.0.1:5178/. Production output: `dist/`. The build emits both `index.html` and `yard.html` at the root and inside each chapter directory for the existing Nginx configuration.

## Chapter 01 interaction

- Drag to orbit; scroll or pinch to zoom. Moving the pointer moves a local light.
- Choose Prism, Halo, or Orbit; adjust light intensity and optical dispersion.
- Choose Daybreak, Moonlight, or Aurora for different room, glass, rim and floor colors. Show light paths to add an illustrative optical spectrum through the scene.
- Field notes contains material descriptions and prompts for each study, a saved discovery collection with replay buttons, and the gesture/keyboard guide. The footer discovery counter opens the collection directly.
- Tap a glass object or send a pulse for light waves and particles.
- Sound is off on every page load. Enabling it starts quiet synthesized glass chimes; no audio files are fetched.
- Arrow keys orbit, Space pauses, P or Enter sends a pulse, 1–3 selects a study, L changes atmosphere, T toggles light paths, R resets the view, and ? opens the guide. Hold G for the keyboard equivalent of holding the glass.
- Five touches within five seconds reveal Resonance; a 1.3-second hold reveals Zero gravity; three signature clicks within three seconds reveal A little universe. All effects can be repeated. Only the three discovery IDs are saved in localStorage; reset view clears temporary visual effects, not discoveries.

## Chapter 02 interaction

- Select Liquid sculpture, Glass passage, or Waterfall; all three are implemented previews.
- Drag to orbit, scroll/pinch to move closer, and double-click/double-tap for a ripple. The passage allows moving through the glass rings.
- Flow changes fluid motion; Dispersion separates the spectral paths. Pause motion stops the sculpture; Reset view restores the camera.
- Keys 1–3 select a study, arrows orbit, Space pauses, and R resets. Inside the glass explains the renderer and controls.

## Rendering and accessibility

The menu uses a shared procedural architectural background and WebGL screen-space Snell refraction, spectral IOR, thickness absorption and beveled edge highlights. It approximates transparent card optics, not full 3D ray tracing. CSS provides a readable fallback. The directory does not load Three.js.

Chapter 01 uses physically based raster rendering with MeshPhysicalMaterial transmission, thickness, Fresnel reflection, dispersion, an environment map, and real-time lights. Beveled geometry and a bright architectural room provide visible detail through the glass. Ground caustics are an artistic procedural approximation.

Chapter 02 uses a WebGL 2 fragment shader to trace signed-distance surface intersections and RGB-specific entry/exit refraction, thickness absorption, Fresnel reflection, and one internal-reflection bounce through the first glass volume. Outgoing rays sample the procedural gallery; subsequent glass volumes are not recursively traced. This bounded real-time ray-tracing approximation is not hardware ray tracing or a global-illumination path tracer. Floor caustics are artistic. Fluid shapes are procedural animation, not a fluid-physics solver. Shader preparation is asynchronous where the browser supports parallel compilation; the initial drawing buffer is limited to 450,000 pixels and adjusts to observed frame cadence.

Rendering is capped by pixel budget, with adaptive resolution if frame cadence is low. Rendering and audio suspend when the document is hidden. Reduced-motion preference starts in a static scene; manual camera/material changes and static secret effects still work. Native controls and dialog support keyboard use. A renderer failure/context loss shows a recovery view; JavaScript-disabled browsers get a static explanation and a link to the personal site.

## Server deployment

- SSH alias: `septuagint-vm1`
- Existing Nginx root: `/home/septuagintuser/site/septuagint21.org/yard`
- Existing directory index: `yard.html`
- Static-only deployment; no Node.js process or service restart is needed on the server.
- Backups and source archives live outside the public root in sibling `yard-backups` and `yard-sources` directories.
- Upload hashed assets and cover art first, then atomically replace chapter HTML before the root menu after backing up the previous public directory. Deploy both generated HTML names in each directory. Retain older hashed assets so already-open clients can finish loading them.

The original welcome page is preserved in the first deployment backup. Roll back by restoring the corresponding backup's HTML and assets to the same document root; no Nginx configuration change is needed.

## Verification

Production build and JavaScript syntax are checked before deployment. Browser checks cover directory edge reveal/clicks and keyboard navigation, chapter variants and controls, responsive layouts, reduced motion, and graphics recovery. Actual performance depends on GPU/browser and is not a guaranteed frame rate.
