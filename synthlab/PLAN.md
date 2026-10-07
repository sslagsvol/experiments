# Synthlab: a sample-based keyboard with a Tweaks panel

## Context

You want a sound synthesizer where you design a custom sample, then play it across a keyboard. The functionality is still being figured out, so the first build is a **playable, mobile-first piano keyboard (12–18 keys), a way to switch the active sample, and an always-available Tweaks panel** where every uncertain behavior is a knob rather than a hard-coded decision.

Decisions already made:
- Everything lives in a new top-level folder, **`synthlab/`** (like `solscape/`, `typelab/`, `Vector Wars/`).
- Samples come from two sources in v1: a **synth builder** and the **Vector Wars game sounds as starters**.
- The keys are **piano keys** (white and black), 12–18 notes. Narrow phones auto-split into stacked rows.

Repo conventions I'm following (from `Vector Wars/CLAUDE.md` and memory): no build step, plain ES modules, CSS variables, `?debug` hook for driving the app without a browser pane that throttles rAF, one commit per round, work on a branch, you push via GitHub Desktop.

## Status (2026-10-07)

All steps below are built, including step 6 (the home-page card: an animated keyboard vignette, `.vignette-synth` in the root `index.html`). See `CHANGELOG.md` for the round-by-round history.

**Testing.** No build step and `file://` won't work (ES modules), so serve the repo root, e.g. `python3 -m http.server 8000`, and open `/synthlab/index.html`. The page imports `../Vector Wars/src/audio.js`, so keep both folders together. If the game folder is missing, the lab still works without the game-sound starters. `?debug` exposes `window.synthlab` (`engine`, `keyboard`, `lib`, `cfg`, `synth`, `panel`, `select(id)`, `audition()`, `current`) for driving it from the console. In the Claude browser pane, mirror the repo into the session scratchpad first (the preview server can't read `~/Documents`).

**Needs a real device** (the browser pane can't judge these): multi-touch feel, latency, and the iPhone silent switch (`navigator.audioSession.type = 'playback'` is set where supported).

**Ideas parked for later:** keep-length mode (pitch without changing duration), mic recording and file upload as sample sources, loop points set automatically from the sustain stage, a velocity curve, and an LFO / vibrato in the builder.

## Core idea: a "sample" is an audio buffer rendered at a root note

```
Sample { id, name, kind: 'synth' | 'vw', patch, buffer: AudioBuffer, root: 60 (C4) }
```

- **Synth builder** turns a small `patch` (JSON) into a buffer by rendering it in an `OfflineAudioContext`. Only the patch is saved; buffers are re-rendered on load.
- **Vector Wars starters** render the game's own recipe (`pop`, `blast`, `gateUp`, `maxMult`, …) into a buffer the same way. They are fixed recipes, so they get tune / stretch / volume tweaks only, as in `Vector Wars/sound-lab.html`.
- **Keys** play any buffer with `playbackRate = 2^((note − root + transpose + fine/100) / 12)`. One engine path serves every sample source, and adding mic/upload later is only a new buffer source.
- Like a real sampler, higher notes play faster and shorter. This is intentional and shown in the Tweaks panel. A "keep length" mode is a possible later addition.
- Every render is trimmed of trailing silence and peak-normalized to about −3 dBFS, so switching samples doesn't jump in volume. Vector Wars sounds use `Math.random()`, so the Sample tab gets a **Re-roll** button.

## Files (all new, all inside `synthlab/`)

| File | Job |
|---|---|
| `index.html` | Shell, viewport meta (`viewport-fit=cover`), GA4 snippet (same as `Vector Wars/index.html`), inline favicon |
| `styles.css` | CSS variables, layout, keyboard, panel. Dark theme, `--bg/--panel/--accent` tokens so the look is one edit |
| `src/engine.js` | `AudioContext` unlock on first pointerdown (`latencyHint: 'interactive'`), master gain → compressor, `noteOn(note, vel)` / `noteOff(note)`, polyphony cap of 12 (steal oldest), 5 ms release fade to avoid clicks. Copies the unlock/compressor/noise-buffer pattern from `Vector Wars/src/audio.js:23` |
| `src/synth.js` | `renderPatch(patch) → AudioBuffer` via `OfflineAudioContext`; the tone/hiss/echo building blocks (same shape as `audio.js:67-102`); `randomPatch()` / `mutate()` |
| `src/samples.js` | Library: built-in presets, VW starters, user patches (localStorage), current sample, render cache, trim + normalize |
| `src/keyboard.js` | Key model, DOM render, pointer handling, QWERTY map, responsive row split |
| `src/tweaks.js` | Schema-driven panel renderer (see below) |
| `src/main.js` | Wires everything, owns state, persistence, `?debug` hook |
| `PLAN.md` | This plan, kept current as the roadmap (like `Vector Wars/PLAN.md`) |

**One edit outside the folder:** add a small `attach(ctx, dest)` method to `Sfx` in `Vector Wars/src/audio.js`. `unlock()` is refactored to call it, so game behavior is unchanged. Offline rendering then reuses `Sfx.play()` and `RECIPES` instead of copying them. `audio.js` imports only `config.js`, which has no imports, so `synthlab` can load it directly via `../Vector%20Wars/src/audio.js`. This gets a `CHANGELOG.md` entry under the Vector Wars rule. (Fallback if you'd rather not touch the game: set `sfx.ctx/master/noise` from outside, which is more fragile.)

## The keyboard

- **Key set:** N keys from a start note (default C4 = MIDI 60), N from 12 to 18. 18 keys is C4–F5: 11 white and 7 black. A black key is placed straddling the boundary between its neighboring whites. If the last note is black, the container gets half a key of end padding so it doesn't clip.
- **Responsive layout** (a `ResizeObserver` picks the row count, no media-query guesswork):
  ```
  wide / landscape phone          portrait phone (white key < 44px)
  ┌─────────────────────────┐     ┌───────────────────┐
  │ one row, all N keys     │     │ row 2: high notes │
  │ height clamp(160px,     │     │ row 1: C → B      │
  │ 38dvh, 320px)           │     │ (≤ 7 whites each) │
  └─────────────────────────┘     └───────────────────┘
  ```
  Portrait splits into rows of at most one octave, with the higher octave on top. Each white key is then at least 44px (375px / 7 ≈ 53px). `100dvh` and `env(safe-area-inset-*)` handle the notch and landscape.
- **Page layout:** the keyboard is sticky at the top. Under 900px the Tweaks panel flows below it, so you can tweak while still playing. At 900px and up, the panel is a right-hand column.
- **Touch input:** Pointer Events, tracked per `pointerId` for true multi-touch. `touch-action: none` and `user-select: none` on the keyboard, and `contextmenu` suppressed. A finger sliding across keys retriggers per key (glissando; a Tweaks toggle). The pressed state is a class toggled directly on the key, with no re-render on every note. Note-on fires in the same gesture that unlocks audio.
- **Desktop input:** the QWERTY "piano row" `A W S E D F T G Y H U J K O L P ; '` maps to C4…F5 (18 keys exactly). `Z`/`X` shift the octave and `←`/`→` switch sample. Key labels can show note names, computer keys, or nothing (a tweak).
- **A11y:** keys are `role="button"` with `aria-label="C4"`, focusable, and respect `prefers-reduced-motion`. Pinch-zoom is not disabled on the page, only touch handling on the keys.

## Changing the sample

A horizontally scrolling **sample strip** sits above the keyboard (scroll-snap chips): `[Zap] [Pluck] [Pad] … [Vector Wars ▾] [+ New]`. Tapping a chip swaps the active buffer instantly, with notes already sounding left to finish. `+ New` duplicates the current patch as a user sample. User samples (patches only) persist in `localStorage` inside try/catch, like `sound-lab.html:276`.

## Tweaks panel

Schema-driven: one array of entries `{ id, group, label, type: 'range' | 'select' | 'toggle' | 'segmented', min, max, step, default }`. The renderer builds the controls, writes `localStorage`, and fires an `onChange`. **Adding an experiment later is one array entry.** Groups are tabs:

| Tab | Controls |
|---|---|
| **Keys** | Key count (12–18), start octave / transpose, fine tune (cents), key labels, glissando on/off, touch velocity (fixed / by tap position) |
| **Sound** | Volume, play mode (**one-shot** / **gate** with release fade / **loop** with start–end), attack, release, echo send, max polyphony |
| **Sample** | Sample picker; for VW starters: tune, stretch, gain, re-roll |
| **Build** | Synth builder (below), waveform preview, name, save / duplicate / delete, **Randomize** and **Mutate** |
| **Lab** | The parking spot for experimental knobs while the functionality is still being figured out. Starts with **Reverse** and **Humanize** (random cents of detune per note) |

Plus **Copy settings** (JSON of changed values, like the "Settings to keep" box in `sound-lab.html:122`) and **Reset**. The panel can be toggled off for a clean keyboard-only view.

**Synth builder patch (v1):** two oscillators (wave, level, B detune in cents), a noise layer (level, filter type, cutoff), a pitch sweep (start→end in octaves, time), a filter (type, cutoff, Q, cutoff-sweep amount), an amp ADSR, an echo (time, feedback), and length. Edits re-render with a ~60 ms debounce and audition on release. The waveform preview is a small canvas. Oscillators base on C4 (261.63 Hz), so `root` stays 60 and the keys land in tune.

## Build order (each step is a testable commit)

0. Create branch `synthlab/keyboard` and the `synthlab/` folder, and save this plan as `synthlab/PLAN.md`.
1. **Keyboard + engine + one hard-coded synth sample.** Responsive layout, multi-touch, QWERTY, `?debug` hook.
2. **Sample library + sample strip.** `Sfx.attach` refactor, VW starters, normalize/trim.
3. **Tweaks panel renderer** with the Keys / Sound / Sample tabs and persistence.
4. **Synth builder tab:** patch → buffer, waveform, save / duplicate / randomize.
5. Polish: iOS silent-switch handling, Copy settings / Reset, a11y pass, `synthlab/CHANGELOG.md`.
6. *(Optional, separate commit)* a "Synthlab" card with a tiny keyboard vignette on the root `index.html`. I'd hold this until you like the instrument, since it publishes to the front page.

## Verification

Per `local-preview-setup` memory, the preview server can't read `~/Documents`, so:
1. Mirror the repo root (`synthlab/` **and** `Vector Wars/`, since it's imported) into the scratchpad and serve it with a no-store Python server on `127.0.0.1:8750`. I'll recreate `serve.py` and update `.claude/launch.json`.
2. **Audio (no ears in the pane):** `synthlab/index.html?debug` exposes `window.synthlab` (`noteOn(n)`, `engine.ctx.state`, `renderPatch()`, the active voices). Via `javascript_tool` I'll assert: each rendered buffer has a non-zero peak and sane duration; note 72 plays at playbackRate 2.0 vs note 60; polyphony cap and release cleanup hold; a VW starter renders non-silent via the offline path; `ctx.state === 'running'` after the first synthetic pointerdown.
3. **Layout:** `resize_window` to 375×812, 812×375 (landscape), 768×1024, desktop. For N = 12, 13, 17, 18 check there's no horizontal scroll (`scrollWidth <= innerWidth`), every white key is ≥ 44px wide, and the black keys don't clip. Screenshots of each.
4. **Input:** dispatch synthetic `PointerEvent`s to confirm pressed state, multi-touch (two `pointerId`s), glissando across keys, and release; dispatch QWERTY `keydown/keyup`.
5. **Resilience:** console clean; page works with `localStorage` throwing; Tweaks changes persist across a reload.
6. **Regression:** `Vector Wars/index.html?debug` and `sound-lab.html` still play (the `attach` refactor), with no console errors.
7. **Only you can verify:** real multi-touch feel, latency, and the iPhone silent-switch behavior on a device. Once pushed, open the live site on your phone. I'll say so rather than claim it's verified.

## Assumptions to redirect if wrong

- Dark, instrument-style UI using the same Audiowide / Share Tech Mono fonts as your other audio tool, driven by CSS variables.
- Default is 18 keys from C4. Default play mode is **one-shot**, since the Vector Wars starters are percussive. Gate and loop are one toggle away.
- Branch `synthlab/keyboard`, commits prefixed `Synthlab:`, and I commit only. You push and merge in GitHub Desktop.
