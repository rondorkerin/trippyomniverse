# Tripiverse — The Omniverse

## What This Is
An infinite psychedelic hyperspace you fly through. Everything visual lives inside a single R3F Canvas. Space is procedurally generated from 6D noise — every location has unique geometry, color, and sound. The 8 original visual modules are now **biome generators** that populate chunks of space as you fly through them.

## Stack
- Next.js 16 (App Router, pnpm)
- React Three Fiber + drei + postprocessing — all visuals
- Tone.js — spatial generative audio (8-voice polyphonic, position-based)
- Web Audio API (AnalyserNode) — microphone/audio input, FFT analysis
- Zustand — state management
- Tailwind — only for the tiny HTML help overlay
- TypeScript throughout

## Architecture

### Hyperspace Engine
The core innovation: you exist at a 6D position `[x,y,z,w,v,u]`. The 3 extra dimensions mean the same 3D location looks completely different depending on where you are in higher dimensions.

**Navigation**: Mouse steers (look direction = travel direction). Hold pointer = thrust. Mic volume = warp boost. Webcam motion = dimensional drift (slides through w/v/u). Scroll wheel = warp speed multiplier.

### Core Systems (`core/`)
- `core/hyperspace.ts` — 6D position/velocity, heading, thrust, warp factor, navigation physics. `useHyperspaceStore` + `updateHyperspace()` called each frame.
- `core/noise.ts` — 6D value noise with multi-octave FBM. `noise6D()`, `fbm6D()`, `chunkSeed()`, `biomeNoise()`.
- `core/chunks.ts` — Chunk manager. Space divided into 60-unit chunks. `updateChunks()` creates/disposes chunks based on position. `animateChunks()` drives per-frame animation. `getNearestChunks()` for audio.
- `core/biomes.ts` — Biome registry. 8 biome types selected by noise value: void, nebula, fractal, crystal, tesseract, particle-storm, kaleidoscopic, breath. Each is a factory `createBiome(chunk) → BiomeInstance` with `populate()` and `dispose()`.
- `core/cosmos-audio.ts` — Spatial soundscape. 8 Tone.js voice pool, each voice tracks nearest chunk. Distance-based crossfade. Speed affects filter/reverb. `initCosmosAudio()`, `updateCosmosAudio()`.
- `core/store.ts` — Global state: intensity, hueOffset, timeScale, isPaused, colorMode, bloomIntensity, showHelp, renderDistance. Exports `getModulatedHue()`.
- `core/input.ts` — Zustand store for mouse, keyboard, touch.
- `core/mic.ts` — Microphone input + FFT analysis.
- `core/camera.ts` — Webcam input + frame analysis.
- `core/InputListener.tsx` — DOM event capture. Mouse → steering, pointer → thrust, scroll → warp, plus standard keybindings.
- `core/HelpOverlay.tsx` — Tailwind help overlay.
- `core/Universe.tsx` — Root Canvas. `HyperspaceCamera` (follows position, FOV warps with speed), `ChunkRenderer` (drives navigation + chunk lifecycle + audio), fog, bloom.
- `core/types.ts` — Shared TypeScript interfaces.
- `core/audio.ts` — Legacy audio (still importable but cosmos-audio is primary).

### Chunk System
```
CHUNK_SIZE = 60 world units
RENDER_DISTANCE = 2 (5×5×5 = 125 max chunks)
```
Each chunk has: coord, seed (from 6D noise), biome type, density, scale, palette, harmonic, LOD level. Chunks are created/disposed as you move. Each chunk's THREE.Group is positioned at `[cx*60, cy*60, cz*60]` in the scene.

### Biome Types (selected by noise value 0-1)
| Range | Biome | Visual |
|---|---|---|
| 0.0–0.15 | void | Sparse distant particles |
| 0.15–0.30 | nebula | Instanced sphere clusters |
| 0.30–0.45 | fractal | Recursive branching lines |
| 0.45–0.55 | crystal | Torus rings, varied rotation |
| 0.55–0.65 | tesseract | 4D hypercube with trails |
| 0.65–0.80 | particle-storm | Dense breathing particle sphere |
| 0.80–0.90 | kaleidoscopic | Shader plane with folded noise |
| 0.90–1.0 | breath | Wireframe icosahedron clusters |

### Keybindings
| Key | Action |
|-----|--------|
| `Mouse` | Steer direction |
| `Hold Click` | Thrust forward |
| `Scroll` | Warp speed ± |
| `1-9, 0` | Intensity 10%-100% |
| `+/-` | TimeScale ±0.1 |
| `Space` | Pause/resume |
| `M` | Toggle microphone (warp boost) |
| `C` | Toggle webcam (dimension drift) |
| `T` | Cycle color mode |
| `B` | Cycle bloom |
| `Q/E` | Hue rotate ±0.05 |
| `R` | Randomize parameters |
| `F` | Fullscreen |
| `H` | Help overlay |

### Input System
- Mouse: normalized [-1, 1] → steering heading (yaw/pitch)
- Pointer down: thrust (ramps up while held, decays on release)
- Scroll wheel: warp factor multiplier
- Mic volume: temporary warp boost
- Webcam motion: drift in higher dimensions (w/v/u)
- ALL input comes from `useInputStore`. NEVER use raw `window.addEventListener`.

### Audio Systems
**Spatial Soundscape** (`core/cosmos-audio.ts`):
- 8-voice Tone.js pool, each tracking nearest chunk
- Base frequency from biome harmonic + chunk seed variation
- Distance attenuation (closer = louder)
- Speed affects filter cutoff (faster = whoosh) and reverb wet
- Click plays a bell tuned to nearest chunk's harmonic

**Mic Input** (`core/mic.ts`): Unchanged — bass/mid/treble/volume/beat/fft.

**Webcam Input** (`core/camera.ts`): Unchanged — averageColor/brightness/dominantHue/gridBrightness/motion.

### Legacy Module System
The original 8 modules still exist in `modules/` as React components but are **no longer rendered directly**. Their visual logic has been ported into biome generators in `core/biomes.ts`. The module files are kept for reference. `modules/hypercube/math4d.ts` is still imported by the tesseract biome.

## Commands
```bash
pnpm dev          # start dev server
pnpm build        # production build
pnpm lint         # eslint
npx tsc --noEmit  # typecheck without building
```

## Adding a New Biome
1. Add a new biome type to the `BiomeType` union in `core/biomes.ts`
2. Add a `create<Name>Biome(chunk: ChunkData): BiomeInstance` factory function
3. Add the noise range mapping in `selectBiome()`
4. Add harmonic frequency in `BIOME_HARMONICS`
5. Add the case in `createBiome()` switch

## TypeScript Notes
- `bufferAttribute` in R3F requires `args={[array, itemSize]}` syntax
- Use `useMicStore.getState()` and `useInputStore.getState()` inside `useFrame` callbacks
- Biome generators use imperative Three.js (not React components) for chunk lifecycle management

## Testing & Verification
- **Always run `pnpm dev` and verify the page loads** after making changes
- **Always run `npx tsc --noEmit`** to catch type errors
- The SSR bailout error `"Bail out to client-side rendering: next/dynamic"` is expected
- **Test interactively**: hold click to fly, move mouse to steer, scroll to change warp speed
- Clamp all Tone.js values (frequencies to [20, 20000], wet/dry to [0, 1])
- Full permissions are granted in this folder

## Rules for Agents
- NEVER add HTML elements that cover the canvas (except help overlay)
- ALWAYS use `useInputStore` for user input, never raw DOM events
- ALWAYS use `useMicStore` for audio input, never raw `getUserMedia`
- ALWAYS use `useCameraStore` for webcam input
- ALWAYS use `getModulatedHue()` for color palette support
- ALWAYS read `intensity` from store and multiply into luminosity/opacity values
- Biome generators must implement `populate()` and `dispose()` correctly
- Keep biomes independent — no cross-biome state
- Use `@/*` path aliases (configured in tsconfig)
- You have full permissions in this folder — create, modify, delete freely
