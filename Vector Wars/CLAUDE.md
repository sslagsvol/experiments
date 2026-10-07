# Vector Wars

Neon crowd-runner prototype. No build step: plain ES modules + Three.js from a CDN import map. See `PLAN.md` (design) and `EDITS.md` (current work).

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
- If the guide can't be updated in the same change, add an item under **Style guide debt** in `EDITS.md` and mention it to the user.

## Testing

- `index.html?debug` shows FPS and unit counts and exposes `window.vectorWars` (`step(frames)`, `steer(x)`, `morph()`, `army`) for driving the sim without `requestAnimationFrame`.
- `?units=N` sets the starting army (capped at `CFG.CAPACITY`); `?seed=N` picks a different track.

## Version history

- One commit per `EDITS.md` batch, with messages prefixed `Vector Wars:`.
- Risky batches go on `vw/*` branches; milestones are tagged `vector-wars-vX.Y`.
