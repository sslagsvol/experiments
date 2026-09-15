# Track Companion — Roadmap

Planned expansion beyond the Monza MVP (see `PROJECT_PLAN.md` for the MVP's own rationale,
and the main `README.md` for what's actually built today). Nothing in this document is
built yet — it's a holding pen for what's next, not a spec.

## More tracks

Starting list: **Lime Rock Park, Silverstone, Spa-Francorchamps, Laguna Seca.**

The timing engine itself is already track-agnostic — `recomputeSchedule()` in `app.js`
works off whatever `sectors`/`complexes` data it's given, and Track select on the setup
screen is already a real dropdown (currently a single fixed "Monza" option). Adding a
track means:

1. A new data file shaped like `data/monza-corners.js` — sectors (3, with `range`
   boundaries as fractions of lap time) and complexes (grouped corners, each with
   `position_pct`, `sector`, `gear`, `brake_point_m`, direction (see `TURN_ICONS`), `note`,
   `curb_note`).
2. Populating that data is the actual work — corner-by-corner timing/gear/braking
   estimates, the same kind of hand-estimation Monza's data started from and is still
   being tuned from.
3. Wiring Track select to actually offer more than one option, and loading the right
   data file based on the selection.

## More cars

Starting list: **McLaren 750S, Lamborghini Huracán EVO.**

`data/monza-corners.js` → `cars` already supports more than one entry (Porsche 992 GT3 R,
Ferrari 488 GT3), each with a `display_name`, `layout`, and a handling `note`. Adding a car
is mechanically simple — another entry there.

The open question worth deciding before this list grows: right now `gear` and
`brake_point_m` are per-track-per-corner, implicitly tuned for one car. A Cup car and a
GT3 car brake at meaningfully different points and carry different gears through the same
corner. Either corner data needs to become per-car-per-track (more data entry, more
accurate), or the app keeps one shared estimate per corner regardless of car (what it does
today) and accepts that it's less precise for cars far from what it was tuned against.

## Car setup information area

A dedicated area — separate from the setup screen (car/track/lap-time/sliders) and the
drive screen — for storing and viewing setup details per car: tire pressures, aero,
suspension, gearing, whatever the driver actually tracks between sessions.

Not scoped in detail yet. Worth designing alongside the lap-time database below rather
than separately — `PROJECT_PLAN.md`'s "Future scaffolding" section already anticipates
per-car-*and*-per-setup lap logging (`porsche-992-setup-a.csv` style), and this setup-info
area is the natural place to define what a "setup" actually is (the free-text
`setup_notes` field that scaffolding describes could graduate into structured fields once
this area exists).

## Store all of this in a database

Today, persistence is split across three different mechanisms:

- Track/car/corner data: static `.js` files shipped with the app (`data/monza-corners.js`).
- Recorded laps: `localStorage`, via the pause menu's "Record lap time" — per-browser,
  doesn't sync, doesn't survive clearing site data.
- Design tokens: a JSON file (`data/design-tokens.tokens.json`) hand-transcribed into CSS,
  not loaded by the app at all.

A real database would let recorded laps and setup data sync across devices, be genuinely
queryable/comparable over time (the whole point of the lap-time log), and give the setup
info area above somewhere real to live. No database has been chosen and no schema beyond
the CSV sketch in `PROJECT_PLAN.md` exists yet — this is a placeholder for "we'll need one
once setup storage and lap logging both need to persist beyond a single browser," not a
decided architecture.
