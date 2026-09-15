# Track Companion

A phone-based companion app for sim racing (ACC on Xbox), giving glanceable, spoken
turn-by-turn guidance during a session — timed to a driver-entered target lap time,
since Xbox exposes no live telemetry to third-party apps.

Full background, design principles, and rationale: see `docs/PROJECT_PLAN.md` — read this
first, it has the "why" behind every decision below.

## Status

Wireframe stage. `wireframes/wireframe-v1.html` is a static, click-through mockup —
two screens, no real logic, no audio, no data persistence. Reviewed and approved as a
starting layout. Next step is a working build.

## What to build next (MVP)

1. **Car select:** Porsche 992 GT3 R, Ferrari 488 GT3 (see `data/monza-corners.js` → `cars`)
2. **Track select:** Monza only for now
3. **Lap time input** (default 1:54.0, freely editable)
4. **3 sector sliders**, even split by default, biasing the proportional timing split within
   each sector's corners (sector ranges are in `data/monza-corners.js` → `sectors`)
5. **Start button** — zeroes a timer, begins scaled playback of each complex at its
   `position_pct * target_lap_time`
6. ~~Lap button~~ — removed; the timer auto-resets at the start/finish line every lap
   (prevents drift from compounding across a race) and keeps looping lap after lap with
   no input needed, until paused or exited
7. **Drive screen UI** — scrolling card stack: current and next complex shown full-size
   with notes, every other complex (plus a synthetic finish-line card) shown as a compact
   one-line entry so as many turns as possible are visible at once (see wireframe for the
   earlier, since-superseded 3-card layout reference)
8. ~~Audio callout per complex via device text-to-speech~~ — removed; the app is
   currently screen-only

## Data files

- `data/monza-corners.js` — the 7 Monza "complexes" (grouped corners — chicanes are one
  unit, not split into individual turns), each with position %, sector, gear, and notes.
  Position percentages are estimates based on typical GT3 pace distribution, not measured
  data — expect to tune after real sessions.
- `data/lap-log-template.csv` — column schema for the future lap-time database (see below).
  Not wired into the app yet.

## Explicitly out of scope for now

- Live telemetry / automatic on-track position detection (not possible on Xbox)
- Microphone-based gear-shift detection (considered and deferred — see PROJECT_PLAN.md
  "Known limitations" for why)
- Any track beyond Monza, any car beyond the 992/488
- The lap time database itself (schema exists, UI/storage does not)

## Future direction (don't build yet, but don't design against it)

A self-reported lap time log, one CSV per car+setup combination (e.g.
`porsche-992-setup-a.csv`), so setup changes can be compared over time. Schema is in
`data/lap-log-template.csv`. Sector times are logged (not just total lap time) so this can
eventually feed back into suggesting sector-slider positions from real data instead of the
driver eyeballing them.

## Design principles (see PROJECT_PLAN.md for full detail)

1. Show a window, not a point — current + next always shown in full, everything else
   visible in compact form rather than hidden
2. Correctable, not precise — sliders beat stopwatches
3. Group by how it's driven — chicanes are one complex, not two corners
4. Design for glances — audio primary, screen backup
5. Degrade gracefully — a few seconds of drift should never actively mislead
