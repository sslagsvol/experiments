# Synthlab: change log

Round-by-round history. The design and roadmap live in `PLAN.md`.

## Round 1 (2026-10-07): keyboard, samples, Tweaks panel
- **Keyboard:** 12–18 piano keys (default 18, C4–F5). One row when white keys stay at least 44px wide, otherwise stacked octave rows with the higher octave on top. Multi-touch, glissando, optional velocity by tap position, and the QWERTY piano row (A W S E D F T G Y H U J K O L P ; ').
- **Samples:** a sample is a mono buffer rendered at C4 and played back at a pitch set by the key. Sources: six synth presets (Zap, Pluck, Pad, Chime, Thump, Static), your own saved synth samples, and the eleven Vector Wars sounds rendered offline through the game's own recipes. Every render is trimmed and normalized so switching samples doesn't jump in volume.
- **Tweaks panel:** one array of entries drives all the controls. Tabs: Keys, Sound (one-shot / gate / loop, attack, release, loop slice, volume, voices, echo), Sample (picker, waveform, game-sound tune / stretch / gain, re-roll), Build (the full synth builder, Randomize, Mutate, Save as new, Reset to preset, Delete), and Lab (Reverse, Humanize). Copy settings and Reset tweaks sit at the bottom. Everything persists in `localStorage`, guarded so the app works with storage blocked.
- **Shortcuts:** ← / → switch sample, Z / X shift the octave.
- **Outside this folder:** `Vector Wars/src/audio.js` gained `Sfx.attach(ctx, dest)` (logged in Vector Wars `CHANGELOG.md`, Round 24). `.claude/launch.json` gained a `synthlab` preview config.
- **Verified in the browser pane:** every sample renders non-silent and normalized; pitch ratios (C5 = 2×, G4 ≈ 1.498×); polyphony cap and release cleanup; layout at 375×812, 812×375, 768×1024 and desktop for 12–18 keys (no horizontal scroll, no clipped keys, white keys 47px or wider on a phone); two-finger play, glissando, black-key hit-testing, QWERTY, reload persistence; Vector Wars game and sound lab still play. **Not verified:** real-device multi-touch, latency and the iPhone silent switch.
