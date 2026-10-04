# YARD — A collection of small universes

Live: https://yard.septuagint21.org/

This is the `yard/` subproject of the personal-site repository. Run the commands below from this directory. It is deployed at the YARD domain root independently of the Candy homepage; the absolute paths in its pages are not intended for a `/yard/` URL prefix.

A self-hosted chapter collection. The root is a crystal-card directory; Chapter 01 at `/chapters/01/` is a full-screen Three.js optical playground with three works sharing a world-space orbit. Chapter 02 at `/chapters/02/` contains three liquid-glass studies: Chrysalis (carved folded crystal), Nave (liquid vaults), and Undertow (falling glass curtains). All runtime dependencies are bundled locally. No accounts, analytics, remote textures, or external font requests are required.

## Collection and adding chapters

The directory moves cards around a horizontal axis in the Y/Z plane, with a ring diameter at least 1.64 viewport heights. Perspective projection is calibrated so adjacent cards expose 66% at rest and the approached card exposes about 90% under pointer preview. The opposite card recedes along the same track. Damped angular springs drive navigation. Exposed cards, the glass triangle controls, wheel, and arrow keys advance one adjacent chapter; the thumbnail rail can select a chapter directly. On short windows, the wheel first brings the main card fully into view before switching it. Touch devices can scroll vertically and swipe horizontally. Reduced motion snaps between stations. A static first-chapter link remains available without JavaScript.

`src/ring-navigation.js` is shared with Chapter 01. It accepts equally or unequally spaced angular stops, keeps rotation continuous across wraparound, and separates pointer preview from selection. Directional inputs always advance exactly one stop, including when the collection grows beyond three items. `src/interaction.css` supplies hover scaling, highlights, and press scaling to DOM controls. `src/glass-arrows.js` renders pure triangular lenses from the live canvas behind each control using the approved Candy glass shoulder/IOR/thickness/dispersion profile.

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

- All three sculptures coexist on a horizontal circular track. The chosen work is near the arch; the other two wait behind the viewer. The camera turns in place, and the arch-side station is closer than the rear stations.
- Drag the empty room to look around; drag the focused glass to turn its facets, then release for inertia. Pointer movement gently previews a track turn and moves a local light.
- Click a waiting object to move one station toward its screen direction, rather than jumping directly to that object's index. Left/Right, the wheel, and the two live refracting glass triangles use the same directional step.
- Moonlight is the fixed environment. Light intensity and dispersion remain adjustable. Show light paths adds an illustrative optical spectrum.
- Field notes contains material descriptions and prompts for each study, a saved discovery collection with replay buttons, and the gesture/keyboard guide. The footer discovery counter opens the collection directly.
- Tap a glass object or send a pulse for light waves and particles.
- Sound is off on every page load. Enabling it starts quiet synthesized glass chimes; no audio files are fetched.
- Left/Right switch stations; A/D turn the view, Up/Down change its pitch, Space pauses, P or Enter sends a pulse, T toggles light paths, R resets the view, and ? opens the guide. Hold G for the keyboard equivalent of holding the glass.
- Five touches within five seconds reveal Resonance; a 1.3-second hold reveals Zero gravity; three signature clicks within three seconds reveal A little universe. All effects can be repeated. Only the three discovery IDs are saved in localStorage; reset view clears temporary visual effects, not discoveries.

## Chapter 02 interaction

- Select Chrysalis, Nave, or Undertow; all three are implemented studies.
- Drag to orbit, scroll/pinch to move closer, and double-click/double-tap for a ripple. Nave allows approaching and moving through the glass vaults.
- Flow changes fluid motion; Dispersion separates the spectral paths. Pause motion stops the sculpture; Reset view restores the camera.
- Keys 1–3 select a study, arrows orbit, Space pauses, and R resets. Inside the glass explains the renderer and controls.
- High is the default quality and keeps its resolution. Ultra increases resolution and optical depth. Adaptive is an explicit option for devices that prefer responsiveness.

## Rendering and accessibility

The menu uses a shared procedural architectural background and WebGL screen-space Snell refraction. Its broad C2 glass shoulder, spectral IOR and softbox reflections follow the approved homepage glass studies. It approximates transparent card optics, not full 3D ray tracing. CSS provides a readable fallback. The directory does not load Three.js.

Chapter 01 uses physically based raster rendering with MeshPhysicalMaterial transmission, thickness, Fresnel reflection, dispersion, an environment map, and real-time lights. Beveled geometry and a bright architectural room provide visible detail through the glass. Ground caustics are an artistic procedural approximation.

Chapter 02 compiles each signed-distance study separately and traces wavelength-dependent light paths across six glass boundaries in High or eight in Ultra, including subsequent volumes, total internal reflection and Beer absorption. Reflection contributions sample the HDR procedural room; this is bounded ray tracing rather than a global-illumination path tracer. Floor caustics and floor reflections are artistic approximations. Fluid shapes are procedural animation, not a fluid-physics solver. Shader preparation is asynchronous where supported. High uses native CSS-pixel resolution up to 2.4 million pixels; Ultra can use up to 6.5 million pixels. A separate FXAA resolve smooths edges. Resolution is automatically reduced only in the user-selected Adaptive mode.

Rendering and audio suspend when the document is hidden. Reduced-motion preference starts in a static scene; manual camera/material changes and selection still work. Native controls and dialog support keyboard use. A renderer failure/context loss shows a recovery view; JavaScript-disabled browsers get a static explanation and a link to the personal site.

## Server deployment

- SSH alias: `septuagint-vm1`
- Existing Nginx root: `/home/septuagintuser/site/septuagint21.org/yard`
- Existing directory index: `yard.html`
- Static-only deployment; no Node.js process or service restart is needed on the server.
- Backups and source archives live outside the public root in sibling `yard-backups` and `yard-sources` directories.
- Upload hashed assets and cover art first, then atomically replace chapter HTML before the root menu after backing up the previous public directory. Deploy both generated HTML names in each directory. Retain older hashed assets so already-open clients can finish loading them.

The original welcome page is preserved in the first deployment backup. Roll back by restoring the corresponding backup's HTML and assets to the same document root; no Nginx configuration change is needed.

## Verification

Run `node --test tests/ring-navigation.test.js` for directional-step, wraparound, uneven-stop, pointer-preview and reduced-motion invariants. Production build and JavaScript syntax are checked before deployment. Browser checks cover actual orbit exposure, directional clicks, view turning, direct sculpture manipulation, chapter variants, controls and responsive layouts. Actual performance depends on GPU/browser and is not a guaranteed frame rate.
