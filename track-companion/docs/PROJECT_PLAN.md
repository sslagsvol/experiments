# Track Companion — Project Plan

## What this is

A phone-based companion app for sim racing (ACC on Xbox, starting with the Porsche 992 GT3 R and Ferrari 488 GT3 at Monza) that gives glanceable, spoken turn-by-turn guidance during a session — gear, line, braking, and curb notes — timed to the driver's own target lap time rather than live telemetry.

## Why it exists

ACC on Xbox has no telemetry output to third-party apps — that's a PC-only feature (used by tools like CrewChief). This app works around that constraint entirely: instead of reading the car's real position, it estimates where the driver should be on track based on a target lap time the driver sets themselves, then scales a proportional timing template to match.

## Core mechanic

1. Driver selects **car** and **track**.
2. Driver enters a **target lap time** (e.g. 1:54.0).
3. The app has a pre-built **timing template** per track — each corner or corner group ("complex") expressed as a **percentage of total lap time**, not a fixed second count.
4. On **Start**, the app zeroes a timer and plays each complex's callout (audio + on-screen) at its scaled timestamp.
5. On **Lap** (pressed at start/finish line), the timer re-zeros — so any drift never compounds across a race, it just resets every lap.
6. **Sector sliders** (3 sectors, matching the track's real sector splits) let the driver bias the proportional split if their pace shape doesn't match the template — e.g., relatively stronger in sector 2, nudge that sector's share down.

## Design principles

**Show a window, not a point.**
The interface can never know exactly where the driver is on track — only estimate it. So it always shows current + next + next-after simultaneously. Being a couple seconds off shifts which corner is highlighted, never which information is available.

**Correctable, not precise.**
The app doesn't try to capture perfect data up front. It leans on cheap, fast human correction — sliders, not stopwatches. The driver course-corrects in seconds; the app never demands perfect input to be useful.

**Group by how it's driven, not how it's numbered.**
A chicane is one decision, not two corners. Corners are bundled into "complexes" that match how a driver actually thinks about a section at speed. This also means fewer, chunkier timing targets — more forgiving of drift than many small ones.

**Design for glances, not reading.**
The driver sees the screen for a fraction of a second between inputs. Large text, short phrases. Audio carries the primary communication; the screen is backup, never the reverse.

**Degrade gracefully.**
If the time estimate is off by a few seconds, the app stays useful — just early or late, never actively wrong (it should never say "brake now" for the wrong corner). Proportional scaling (vs. fixed timestamps) is what makes this possible: the whole template stretches or compresses together, so relative order and spacing survive even when the absolute number drifts.

## MVP scope (build now)

- Car select: Porsche 992 GT3 R, Ferrari 488 GT3
- Track select: Monza only
- Lap time input field
- 3 sector sliders (even split by default)
- Monza corner content, grouped into 7 complexes, each with: name, gear, line/apex note, curb note
- Start button (zero timer, begin playback)
- Lap button (re-zero at start/finish)
- Glanceable strip UI: current complex large/centered, next two smaller, scrolling forward
- Spoken audio callout per complex (device text-to-speech) + on-screen text, simultaneously

## Explicitly out of scope for MVP

- Live telemetry / automatic position detection (not possible on Xbox)
- Microphone-based gear-shift detection (considered, deferred — mic-only environment makes accuracy uncertain; revisit if proportional-scaling approach proves insufficient)
- Any track beyond Monza
- Any car beyond the 992 and 488
- The lap time database (see Future Scaffolding below)

## Future scaffolding — lap time database (not built yet)

Goal: track self-reported lap times per car *and per setup*, so setup changes can be compared over time.

**One file per car + setup combination.** e.g. `porsche-992-setup-a.csv`, `ferrari-488-setup-stock.csv`.

Each row = one logged lap:

```
date, track, lap_time, sector1, sector2, sector3, setup_notes, conditions
2026-09-14, monza, 1:54.312, 0:34.100, 0:38.900, 0:41.312, "stock setup", dry
```

- `setup_notes` stays free text for now — no need to formally model setup parameters (camber, ARB, etc.) until the driver is actually tracking specific value changes.
- Sector times, not just total lap time, are logged from day one so this data can eventually feed back into the sector-slider system — real sector splits could suggest slider positions instead of the driver eyeballing them.
- Separate files per setup, not per car, because setup-to-setup comparison is the actual use case ("did this ARB change help?").

Nothing here is built in the MVP. The lap-timing engine (car, track, sector definitions) and the future lap-logging system are being kept in the same vocabulary now so they don't need reconciling later.

## Known limitations, stated plainly

- Proportional scaling assumes the driver's pace *shape* roughly matches the template, just scaled to their lap time. If a specific car spends unusually long in one corner relative to the rest of the lap, sector sliders can approximate a fix but won't correct a single corner precisely — that's a signal for what a future version might need (e.g. per-corner nudging), not a v1 problem to solve now.
- The Monza timing template's percentages are estimates based on typical GT3 pace distribution, not measured data. Expect to tune them after real sessions.
