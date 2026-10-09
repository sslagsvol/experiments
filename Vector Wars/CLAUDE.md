# Vector Wars

Neon crowd-runner prototype. No build step: plain ES modules + Three.js from a CDN import map. See `PLAN.md` (design as built + roadmap), `LEVELS.md` (level progression plan), `CHANGELOG.md` (round-by-round history), and `style-guide.html`.

## Style guide rule

`style-guide.html` is the visual reference for the game. **Any change to a visual value or animation must update it in the same change.** That includes:

- colors (`COLORS`), bloom (`BLOOM`), animation timings (`ANIM`) or formation settings in `src/config.js`
- formation patterns in `src/formations.js`
- HUD styles, CSS variables or keyframes in `styles.css`
- shader looks (`world.js`, `crowd.js`, `gates.js`, `fx.js`) or effect behavior

How to update:
- Sections badged **live** read values from the code. Reload the page and check they still render correctly; add a card or label for any new value.
- Sections badged **manual** are hand-drawn approximations of shaders and effects. Edit their drawing code to match.
- Put new animation timings in `ANIM` in `config.js` (not inline literals) so the guide picks them up.
- If the guide can't be updated in the same change, add an item under **Style guide debt** in `CHANGELOG.md` and mention it to the user.

## Testing

- `index.html?debug` shows FPS and unit counts and exposes `window.vectorWars` (`step(frames)`, `steer(x)`, `morph()`, `army`) for driving the sim without `requestAnimationFrame`.
- With `?debug`, the gear button (or `) opens the debug panel (`src/debugPanel.js`): game speed, level skip, low graphics, +units, difficulty sliders saved in localStorage. `?debug&level=N` starts at level N.
- `?units=N` sets the starting army (capped at `CFG.CAPACITY`); `?seed=N` picks a different track.

## Version history

- One commit per round of changes, with messages prefixed `Vector Wars:`; log each round in `CHANGELOG.md` and keep the roadmap in `PLAN.md` current.
- Versions are 0.MINOR.PATCH while in beta (`VERSION` in `src/config.js`). Each release is a branch `vw/vX.Y.Z`: bump `VERSION` first and add it to the Releases table in `CHANGELOG.md`. After the user merges, tag the merge commit `vector-wars-vX.Y.Z` (annotated). Full steps: `PLAN.md` section 7.
- Stage only the files you changed (not `git add -A`): other sessions may be editing the repo at the same time.
