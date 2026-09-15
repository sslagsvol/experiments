# Track Companion

A phone-based companion app for sim racing (ACC on Xbox), giving glanceable turn-by-turn
guidance during a session — timed to a driver-entered target lap time, since Xbox exposes
no live telemetry to third-party apps.

Full background, design principles, and rationale: see `docs/PROJECT_PLAN.md` — read this
first, it has the "why" behind every decision below. For what's planned beyond the current
MVP (more tracks, more cars, setup storage, a database), see `docs/ROADMAP.md`.

## Status

Working MVP, live at https://sslagsvol.github.io/experiments/track-companion/ — Monza only,
Porsche 992 GT3 R / Ferrari 488 GT3 only, screen-only (no audio). Being actively tested and
tuned. `wireframes/wireframe-v1.html` and `wireframes/design.png` are the original static
mockups the build started from; `wireframes/Card/{Full,Mini}.png` are the later reference
mockups the turn-card layout was matched against.

## MVP (built)

1. **Car select** — Porsche 992 GT3 R, Ferrari 488 GT3 (`data/monza-corners.js` → `cars`)
2. **Track select** — Monza only for now
3. **Lap time selector** (default 1:55.00) — every digit (minutes, then each digit of
   seconds, then each digit of hundredths) has its own independent up/down stepper, not a
   free-text field
4. **3 sector sliders**, even split by default, biasing the proportional timing split
   within each sector's corners (sector ranges are in `data/monza-corners.js` → `sectors`)
5. **Start button** — zeroes a timer, begins scaled playback of each complex at its
   `position_pct * target_lap_time`
6. **Auto-looping lap timer** — re-zeros at the start/finish line automatically and keeps
   cycling lap after lap with no button press, until paused or exited. A synthetic
   finish-line card leads off each lap (shown as current for the first ~2s) before handing
   off to the first real corner. The pause menu also offers a manual "Reset lap" (re-zero
   without counting a new lap) and "Adjust lap time" (change the target mid-session), plus
   "Record lap time" to log the current lap to a small `localStorage`-backed history.
7. **Drive screen UI** — scrolling card stack showing every complex for the lap: current
   and next are "maximized" (large gear number + turn label, direction icon(s), estimated
   braking distance, name, notes), every other complex is "minimized" (same elements,
   smaller, no notes). Tapping any card jumps the lap clock straight to that complex's
   timestamp. Sector strip shows each sector's target time and a progress bar that fills
   as elapsed time moves through that sector's fixed window.
8. **Turn-direction icons** — one or two icons per complex from `design/svg/arrows/`
   (two for a chicane's direction change, one for a single corner), hand-mapped per
   complex id in `TURN_ICONS` (`app.js`) since direction isn't derivable from the corner
   data itself. Anything unmapped, including the synthetic finish-line card, falls back
   to the Straight/Continue icon.
9. **Estimated braking distances** — `brake_point_m` per corner in `data/monza-corners.js`,
   shown as the "190M"-style chip next to the direction icon(s).
10. ~~Spoken audio callouts~~ — removed; the app is screen-only.

## Data files

- `data/monza-corners.js` — the 7 Monza "complexes" (grouped corners — chicanes are one
  unit, not split into individual turns), each with position %, sector, gear, braking
  point (`brake_point_m`), and notes. Position percentages are estimates based on typical
  GT3 pace distribution, and braking points are estimates centered on 150-200m (most
  Monza corners) with lighter/heavier corners adjusted accordingly — neither is measured
  data, and both vary a lot by track conditions. Expect to tune both after real sessions.
- `data/design-tokens.tokens.json` — the Figma "Racing" design-system export (colors,
  spacing, radius, typography). Hand-transcribed into `styles.css`'s `:root` block and
  `.type-*` classes since the project has no build step to generate that automatically —
  if the token file changes, the CSS needs updating by hand to match.
- `data/lap-log-template.csv` — column schema for the future lap-time database (see
  `docs/PROJECT_PLAN.md`'s "Future scaffolding" section). Not wired into the app yet;
  recorded laps currently live in `localStorage` via the pause menu's "Record lap time".
- `design/svg/arrows/` — the turn-direction icon set (Left/Right × 90°/Sharp/Slight/Uturn,
  plus Straight/Continue), referenced by `TURN_ICONS` in `app.js`.
- `wireframes/Card/{Full,Mini}.png` — reference mockups for the maximized/minimized
  turn-card layouts.

## Outstanding / known issues

- **Turn-icon directions are hand-guessed**, not verified against real Monza footage or
  telemetry — based on well-known characteristics of the real circuit (e.g. Rettifilo is
  right-then-left, Ascari is left-right-left), but worth double-checking once real laps
  are driven.
- **`border/subtle` and `border/strong` both alias `neutral/0` (white)** in
  `data/design-tokens.tokens.json` — applied literally in `styles.css` rather than
  "corrected," since it's unclear whether that's intentional. Worth checking the source
  Figma file.
- **Design-token audit still pending** — `styles.css` has been checked against the token
  file piecemeal (sector strip, cards) as specific mismatches came up, but there's been no
  single pass confirming every token is wired up and nothing's stale.
- **No git remote push access in this environment** — commits have been made locally but
  need to be pushed manually from a machine with working GitHub credentials for the live
  site to update.

## Explicitly out of scope for now

- Live telemetry / automatic on-track position detection (not possible on Xbox)
- Microphone-based gear-shift detection (considered and deferred — see PROJECT_PLAN.md
  "Known limitations" for why)
- Any track beyond Monza, any car beyond the 992/488 — see `docs/ROADMAP.md` for what's
  planned
- The lap time database itself (schema exists, UI/storage does not) — see
  `docs/ROADMAP.md`

## Design principles (see PROJECT_PLAN.md for full detail)

1. Show a window, not a point — current + next always shown in full, everything else
   visible in compact form rather than hidden
2. Correctable, not precise — sliders (and tap-to-jump) beat stopwatches
3. Group by how it's driven — chicanes are one complex, not two corners
4. Design for glances — large text, short phrases, screen-only
5. Degrade gracefully — a few seconds of drift should never actively mislead
