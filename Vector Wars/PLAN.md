# Vector Wars: design and roadmap

A crowd-runner in the style of the "army through gates" mobile ads, redesigned around what those games get wrong: fake choices, hidden numbers, no skill expression, and art that buries the numbers. One thumb, thousands of units, 60fps on a mid-range phone.

- **Play:** `index.html`. The title screen offers **Story mode** (the levels, `LEVELS.md`) and **Challenge mode** (the classic fast random track with nearly every enemy unlocked, for high-score runs; both share the one leaderboard). URL options: `?debug` (overlay plus the `window.vectorWars` test hook), `?units=N` (starting army), `?seed=N` (a different track), `?grid=hex` (a grid pattern), `?classic` (the old fully random track, no level 1), `?debug&level=N` (start just before level N's gate). With `?debug`, the gear button (or the ` key) opens the **debug panel**: game speed, slow motion on/off, level skip, +units, low graphics, and live sliders for the difficulty values (Copy values gives a config.js snippet).
- **Version:** **v0.11.0 beta** (`VERSION` in `src/config.js`, shown on the title and pause screens). See section 7.
- **Style guide:** `style-guide.html`, every color, sprite, formation, animation and sound. Visual or animation changes must update it (rule in `CLAUDE.md`).
- **Sound lab:** `sound-lab.html`, every sound with detune (lower, same speed) and stretch (longer, same pitch), globally or per sound (`SFX.tune` / `SFX.stretch`).
- **History:** `CHANGELOG.md`, the round-by-round log of playtest feedback and what changed.
- **Levels:** `LEVELS.md`, the level progression plan.
- **Leaderboard:** Supabase table `vector_wars_scores`, already set up. The setup notes and SQL were removed in v0.6.1; they're in git history (`git show d02685f:"Vector Wars/LEADERBOARD.md"`).

---

## 1. Why the ad games frustrate, and the fix for each

| What frustrates | What we do instead |
|---|---|
| Fake choices ("+5 or ×3") | Gates are shot up or down, split by where the army crosses, and sometimes move. A bad gate can become the best one if you commit fire to it. |
| The ad and the game differ | The ad *is* the game. |
| You lose and don't know why | The death recap breaks losses down (squads, slipped past, gates, fell off). Gains and losses show live beside the army count. |
| No skill | Aim (bullets raise gates and kill enemies), steering (edge spill, dodging moving gates), and gate choice all change the outcome. |
| Waiting around | Restart in under a second. No interruptions. |

## 2. Design pillars

1. **One thumb, always readable.** Anything needing a second gesture or a long read is cut.
2. **Every gate is a real decision.** If playtesters always pick the same side, the gate is a bug.
3. **The crowd is your health bar and your weapon.** More units means more firepower, but a wider body that spills off the edges.
4. **60fps with thousands of units on a mid-range phone.**
5. **Fail fast, understand why, retry instantly.**

## 3. The game as built

### Army
- **Relative drag:** the army follows the finger's movement, not its position (`CFG.DRAG_SPAN`, `STEER_RESPONSE`). Its center stays on the track, but a wide army hugging an edge loses its outer units over the rail. On a keyboard, ← → or A / D steer (hold to sweep, Shift for fast).
- **Formations:** sunflower, hex, rings, wedge, diamond and phalanx. Good gates morph to the next one with an outward ripple and a swirl burst; bad gates make it shake.
- **Size:** every dot is one unit. Full spacing up to 1,200, then progressively tighter, reaching the rails at the 5,000 cap (`CFG.CAPACITY`). Overflow and units pushed past a rail fall into the void below the raised track.
- **Losses** fizzle cyan → red → black where they died.

### Fire and gates
- Auto-fire from the army, rate `min(50, 3 + 2√N)` × the level's share (`CFG.FIRE_LEVELS`): **25% in level 1**, then 40%, 55%, 70%, 85% and full from level 6. Faster fire is a reward of progression. *(Rework planned: batch B.)*
- **Gate mix** (`CFG.GATE_MIX`): × 8%, + 32%, − 35%, ÷ 25%. A pair never has two bad options.
  - Every gate is `CFG.GATE_DURABILITY` (1.25×) tougher than its base hit counts.
  - **+ / −** fill a charge bar: 5 hits per step (4 × 1.25).
  - **×** starts at ×1.0 (no effect) and climbs 0.1 per step to ×3.0, costing more hits as it climbs (`multHitsForStep()` × durability, about 140 hits). Maxing it plays the "data stream" cascade and bursts gold.
  - **÷** starts at ÷2–÷3 and shooting walks it down; at ÷1.0 it flips into a ×1.0 gate and keeps climbing.
- **Split gates:** each panel applies only to the units that cross it (× multiplies them; + / − scale by their share). The primary panel (where the army's center goes) shatters.
- **Moving gates** (15% of gate spots): a single 1.5-wide panel sweeping side to side. Mostly good; only the units that pass through it are affected.

### Enemies
- **Every enemy is a unit** in a squad formation: blob, wall, wedge, skirmish, column or waves. All stay 0.45 in from the rails.
- **Types** (`ENEMY_TYPES`), with grunts 80–90% of every squad:

| Type | Look | Behavior |
|---|---|---|
| Grunt | Diamond | 1 hp, kills ~1.5 nearest units on contact |
| Drone | Triangle | Strafes side to side; from the 3rd squad |
| Bomber | Pulsing orange ring | 2 hp, homes on the center; **area blast** r 0.7, 95% at center, max 45; from the 4th squad |
| Brute | Big hexagon | 8 hp, at the *back* of walls and wedges; **area stomp** r 1.2, 50% at center, max 60; from the 5th squad |

- **Battles:** squads charge from 18 units out at 2.2 u/s. The track rolls in at half speed, stops dead for the clash, then surges forward with a big grid ripple and the battle-won sound. Enemies level with the army turn in on its flanks; ones that slip past hit the rear.
- **Slow motion:** when incoming strength ≥ 0.8× the army, time eases to 0.3× (steering stays real-time), with a danger vignette and a heartbeat on the count. Also for a few seconds as the score closes in on and passes each of 3rd, 2nd and 1st place on the board, once each per run (no vignette; the medal badge and data-stream sound land inside it). Getting all three in one run is rare by design.
- **Sizing:** squads are sized as they emerge from the fog, against the army you'd have from the *best* side of every gate before them, minus what earlier squads will cost, at 0.35–0.85× that strength, by expected damage (not headcount).

### Pacing, HUD and score
- Track spacing: 18 units after a gate, 28 after a squad.
- **HUD:** live score (top left; while it's on pace for 1st–3rd on the board it doubles in size with a gold / pink / lime medal badge, and moving up a place plays the max-multiplier sound), "Hi" score, pause and mute (top right), army count at the bottom center with gains (green, left) and losses (red, right) as running totals. The camera is lens-shifted up for thumb room.
- **Score** = distance × 10 + each enemy defeated × its hp × 5.
- **Recap:** a big count-up score, each enemy type's idle sprite with kills and points, then distance, peak army and losses.
- **Pause:** the pause button, Esc / P, or leaving the tab mid-run. A big "Paused" over the recap so far ("Score so far") and the board with where this run would place (tabs on phones, side by side on wide screens). Continue is the main button; Quit goes back to the title screen.
- **High scores:** an 80s top-10 board with initials entry (▲▼ or typing, specials allowed), and a title attract mode. Global via Supabase (project `uxwcslorwepzrmpbqmjd`), cached locally with an offline queue.

### Feel
- **Grid ripples:** battle won 2.2, gate 1.6, wipe 1.5, blast 1.6, stomp 2.0, army lost 2.4.
- **Bloom** is tuned so numbers stay readable.
- **Sound:** synthesized WebAudio, rate-limited and pitched down in slow motion. Sounds: death fizzle, hit tick, pop, good gate (whoomp and sparkle), bad gate, gate tick, max multiplier (data stream), blast, stomp, battle won (blast plus an echoing crackle), army lost.

## 4. Roadmap

### Next up
1. **Stronger parallax and grid patterns.** *First pass shipped in v0.7.0.*
   - **Built:** the background grid dropped from 4 to 9 below the track, scrolls at 0.45× the track's speed and follows the camera sideways (0.6), so the road reads as raised (`CFG.VOID_*`). Six grid patterns on the track and background: grid, hexagons, oblique grid, triangles, dot grid, outlined polka dots (`GRID_PATTERNS`, one shader). Beta toggles on the pause menu (Grid, Parallax deep / classic), the G key and `?grid=`; remembered per device.
   - **Still to do:** play it on a phone (depth, not motion sickness); pick the patterns to keep and tune their spacing and brightness; give each level its own pattern once levels exist (item 6); maybe a far layer (stars or a horizon skyline) moving slower still. Keep the background dimmer than anything interactive.
2. **Keyboard controls.** *Shipped in v0.7.0.*
   - ← → or A / D steer (a tap nudges, a hold ramps to a sweep in 0.25s; Shift is ×1.8), feeding the same target as the drag (`G.tx`). Space / Enter start, continue and retry; Q quits from pause (back to the title); M mutes; G cycles the grid; Esc / P pause. Hints appear on the title and pause screens only after a key press. Settings `CFG.KEY_STEER_*`.
   - **Still to do:** tune the sweep speed after playing.
3. **Batch D: mini-boss plus the bomb it awards.**
   - **Mini-boss:** a large wireframe shape with a health bar, about one every 8 segments from the second loop on. The track stops when it's in range. It advances slowly and **slams** every few seconds: a telegraphed pulsing ring, then a radius kill with a grid shockwave. Spread out or dodge. If it reaches the army it eats units each second. On death it shatters into tumbling segments (voxel-style).
   - **Bomb ("Overload"):** the mini-boss's reward. One charge at a time (an inventory may come later). Shown as a top-right icon (excluded from drag input).
     - **Tap:** lose half the army, destroy every enemy in sight. "In sight" = every squad that exists, since squads only spawn at the fog line (38 units); queued squads are untouched. Gates are untouched; a mini-boss takes heavy damage instead.
     - **Last stand:** holding a charge and dropping below 100 in a battle auto-detonates it, still costing half the army.
     - **Feel:** freeze-frame, white flash, a fast shockwave ring (about 30 u/s) shattering enemies as it reaches them, the outer half of the army popping, 0.5s of slow motion, shake and a big ripple. Sample sparks (about 1 per 8 kills) and process kills per frame as the ring passes.
4. **Batch B: firepower rework.** Volley fire from front-rank positions; linear DPS (N × damage per unit) with a capped number of visible bullets and damage aggregated per bullet; bullets brighter and thicker as damage per bullet rises; gate "toughness" so big armies don't raise gates instantly.
5. **Batch E: balance pass.** Tune the par curve, threat range, capacity, gate toughness, area damage and boss hp. Test on a real phone after D.

### Proposed next (not yet prioritized)
These come from playtests; the order among them and against D / B / E is still to decide.

6. **Batch F: levels.** *In progress: level 1 playtest build in v0.8.0. Full plan in `LEVELS.md`.*
   - Lessons (mechanics) vs levels (what players see): early levels pack several lessons. Army carries over between main levels.
   - **Bonus levels** every couple of main levels: a forced small strike team (the micro-battles), ending in a **mini-boss** that is a giant version of the next enemy type. Beating it **unleashes** that type into main levels, worth more points; survivors rejoin the main army through a capped bonus × gate.
   - Each world ends with the **world boss** (Batch D, item 3), which earns the bomb.
   - Built so far: v0.8.0 level 1 playtest; v0.9.0 World 1 (levels 2–10: bonus levels with mini-bosses that unleash drones, bombers and brutes; gauntlet, sprint and finale shapes; ÷, moving and split gates by level), fire-rate progression, tougher gates, level-gate crescendo, killcam. Upgrades parked; a continue only once damage over time (the burn enemy) arrives. See `LEVELS.md` sections 6–7. Next: the level-complete menu and army snapshot, then bonus levels and mini-bosses, then the world boss and bomb.

7. **Skill-gate bosses, shields, bullets, combos.** *Built in v0.11.0* (`LEVELS.md` section 9). Next: playtest and tune; then the burn enemy.
8. **Fire / burn enemy (new type).** *Look and continue rule decided: see `LEVELS.md` section 7.*
   - On contact or death it sets the army on fire in a radius. Units caught in it **keep burning for a duration** (about 2–3s): they flicker orange-red and each has a chance to die every tick, so the damage keeps coming after the hit.
   - Open questions: does fire spread to neighbors (risky with tight formations, dramatic with big ones)? Can moving or a good gate put it out? A flame shape and its own color; it unlocks after the bomber.
   - Builds on the area-damage code (`killArea`). Needs a per-unit burn timer in `crowd.js`, the burning look in the point shader, its sprite in `sprites.js`, a sound, and the style guide.
### Ideas parked for later
- **Track hazards:** saws, rollers, spike strips; narrow bridges and gaps; rail breaks.
- **Gates:** locked gates (N hits to open), order-of-operations runs, gates that flip sign on a timer.
- **Enemies:** (fire enemy promoted to item 7 above) squads that shoot back; shielded units (immune from the front); splitters that break into grunts; an enemy that steals units on contact.
- **Run upgrades:** crates and barrels to shoot for spread, pierce or fire rate.
- **Structure:** (level gates promoted to item 6 above) worlds of levels that each teach one idea (sawtooth difficulty); a boss every 10 levels; a daily seeded challenge with its own board; chunk-based levels in JSON; a headless level validator that plays every level with bot strategies (the `?debug` step hook is the start).
- **Meta:** coins for small permanent upgrades (diminishing returns; every level beatable without them); stars; settings (drag sensitivity, effects intensity).
- **Platform:** PWA install; Capacitor builds for iOS haptics and the app stores.
- **Monetization (if any):** cosmetics only. Never pay-to-win, never interrupt a run.

## 5. Art direction: "vector arcade"

Chosen from four options (`concepts/art-directions.html`), inspired by Geometry Wars, Defcon, neon arcades and old vector displays.
- **You:** cyan / white points of light. **Enemies:** outlined shapes, never filled, in magenta (bombers orange, brutes violet).
- **Gates:** green add, red-pink subtract, deeper red divide, gold multiply. **World:** electric blue, always dimmer than anything interactive. **HUD:** lime, in Share Tech Mono (titles in Audiowide).
- **The grid reacts to events.** Losses burn red. Big objects (planned: mini-boss, barricades) shatter into glowing segments.

## 6. Tech

**Stack:** plain ES modules plus Three.js r170 from a CDN import map. **No build step**: the folder deploys to GitHub Pages as-is.

| File | Responsibility |
|---|---|
| `src/config.js` | Tunables (`CFG`), animation timings (`ANIM`), bloom, the HDR palette, sound volumes (`SFX`), seeded RNG |
| `src/main.js` | Rules, track generation, battles, scoring, loop, adaptive quality, debug hook |
| `src/world.js` | Renderer, lens-shifted camera, bloom, the warping grid shader, rails, void |
| `src/crowd.js` / `formations.js` | Player swarm (one `Points` draw call), formation slots, packing |
| `src/enemies.js` / `enemyFormations.js` | Enemy units (one `Points` draw call, per-unit shape and color); formations, types, squad mixes |
| `src/gates.js` | Gate panels (pairs or moving singles), labels, pool |
| `src/fx.js` | Bullets, sparks, spark rings, fizzles, fallers |
| `src/hud.js` / `sprites.js` | DOM HUD, recap, board and initials entry; 2D enemy sprites |
| `src/scores.js` | High score board: Supabase REST plus a local cache and offline queue |
| `src/audio.js` | Synthesized sound effects |

**Performance:** typed arrays and pooling everywhere; no per-frame allocation in hot loops; DPR capped at 2 with an adaptive resolution drop. Measured on desktop: 1,200 units at about 1.5ms/frame. Still to do: profile a full battle at 5,000 units on a real mid-range phone.

## 7. Versions and releases

The game is in **beta**, so versions are **0.MINOR.PATCH**.
- **MINOR** goes up for a release with anything a player would notice (gameplay, visuals, sound, UI).
- **PATCH** goes up for a release that only fixes bugs, docs or tools (style guide, sound lab).
- **1.0.0** leaves beta: levels, the mini-boss and bomb, the balance pass, and a real-phone performance check all done.

**Where it lives:** `VERSION` in `src/config.js`. The title and pause screens show it small along the bottom ("v0.7.0 beta"), and the style guide reads it too.

**Making a release** (one per merge to `main`):
1. Work on a branch named for the version: `vw/v0.8.0`.
2. Bump `VERSION` in `src/config.js` at the start of the branch.
3. In `CHANGELOG.md`, add the version to the **Releases** table and head its rounds with it.
4. The user publishes the branch and merges it in GitHub Desktop.
5. After the merge, Claude tags the merge commit `vector-wars-vX.Y.Z` (annotated). Tags are local for now: GitHub Desktop hasn't pushed them, so `CHANGELOG.md` is the record of truth. To jump back to a version locally: `git checkout vector-wars-v0.5.0`.

**Released so far** (assigned after the fact; details in `CHANGELOG.md`):

| Version | Date | Merge | What |
|---|---|---|---|
| 0.1.0 | 2026-10-07 | direct to main (`1a6a312`) | The prototype: crowd, gates, bullets, enemies, neon look |
| 0.2.0 | 2026-10-07 | PR #3 (`612b4ae`) | Formations, 5,000-unit capacity, falling off; the live style guide |
| 0.3.0 | 2026-10-07 | PR #4 (`3bda6b7`) | Battles and enemy formations, enemy types, split and moving gates, slow motion, HUD and score, sound, high scores |
| 0.3.1 | 2026-10-07 | PR #5 (`52724d2`) | Docs tidy, style guide fixes |
| 0.4.0 | 2026-10-07 | PR #6 (`36e4170`) | Global leaderboard live |
| 0.5.0 | 2026-10-07 | PR #7 (`26736dd`) | Pause menu, live score with top-3 badge |
| 0.6.0 | 2026-10-07 | PR #8 (`10993c3`) | New gate sounds, slow motion for breaking top-3 scores |
| 0.6.1 | 2026-10-07 | PR #9 (`803dd97`) | Sound lab (detune and stretch) |
| 0.7.0 | 2026-10-07 | PR #10 (`ca4c1a7`) | Version numbers, stronger parallax, grid patterns, keyboard controls |
| 0.8.0 | 2026-10-08 | PR #11 (`f236537`) | Level plan; level 1 playtest: authored opening, level gate, banner, linear ramp after |
| 0.9.0 | 2026-10-08 | PR #12 (`1743790`) | Slower fire that grows per level, tougher gates, killcam, level-gate crescendo; World 1 levels 2–10 with bonus levels and mini-bosses |
| 0.10.0 | 2026-10-08 | PR #13 (`2d8827c`) | Faster and harder: shorter levels, level-gate guards, grunts close ranks, boss gate shatter, unit flash, Challenge-mode caps |
| 0.11.0 | (this branch) | `vw/v0.11.0` | Middle-ground difficulty; "Army level up" / "New enemy:" banners; durability by level; mini-boss moves and spawning; shield and bullet enemies; formation combos |
