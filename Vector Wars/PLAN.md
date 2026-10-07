# Vector Wars: design and roadmap

A crowd-runner in the style of the "army through gates" mobile ads, redesigned around what those games get wrong: fake choices, hidden numbers, no skill expression, and art that buries the numbers. One thumb, thousands of units, 60fps on a mid-range phone.

- **Play:** `index.html`. URL options: `?debug` (overlay plus the `window.vectorWars` test hook), `?units=N` (starting army), `?seed=N` (a different track).
- **Style guide:** `style-guide.html`, every color, sprite, formation, animation and sound. Visual or animation changes must update it (rule in `CLAUDE.md`).
- **History:** `CHANGELOG.md`, the round-by-round log of playtest feedback and what changed.
- **Leaderboard setup:** `LEADERBOARD.md`.

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
- **Relative drag:** the army follows the finger's movement, not its position (`CFG.DRAG_SPAN`, `STEER_RESPONSE`). Its center stays on the track, but a wide army hugging an edge loses its outer units over the rail.
- **Formations:** sunflower, hex, rings, wedge, diamond and phalanx. Good gates morph to the next one with an outward ripple and a swirl burst; bad gates make it shake.
- **Size:** every dot is one unit. Full spacing up to 1,200, then progressively tighter, reaching the rails at the 5,000 cap (`CFG.CAPACITY`). Overflow and units pushed past a rail fall into the void below the raised track.
- **Losses** fizzle cyan → red → black where they died.

### Fire and gates
- Auto-fire from the army, rate `min(50, 3 + 2√N)`. *(Rework planned: batch B.)*
- **Gate mix** (`CFG.GATE_MIX`): × 8%, + 32%, − 35%, ÷ 25%. A pair never has two bad options.
  - **+ / −** fill a charge bar: 4 hits per step.
  - **×** starts at ×1.0 (no effect) and climbs 0.1 per step to ×3.0, costing more hits as it climbs (`multHitsForStep()`, about 110 hits). Maxing it plays the "data stream" cascade and bursts gold.
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
- **Slow motion:** when incoming strength ≥ 0.8× the army, time eases to 0.3× (steering stays real-time), with a danger vignette and a heartbeat on the count. Also, once per run, for a few seconds as the score closes in on and passes 1st place on the board (no vignette; the 1st badge and data-stream sound land inside it).
- **Sizing:** squads are sized as they emerge from the fog, against the army you'd have from the *best* side of every gate before them, minus what earlier squads will cost, at 0.35–0.85× that strength, by expected damage (not headcount).

### Pacing, HUD and score
- Track spacing: 18 units after a gate, 28 after a squad.
- **HUD:** live score (top left; while it's on pace for 1st–3rd on the board it doubles in size with a gold / pink / lime medal badge, and moving up a place plays the max-multiplier sound), "Hi" score, pause and mute (top right), army count at the bottom center with gains (green, left) and losses (red, right) as running totals. The camera is lens-shifted up for thumb room.
- **Score** = distance × 10 + each enemy defeated × its hp × 5.
- **Recap:** a big count-up score, each enemy type's idle sprite with kills and points, then distance, peak army and losses.
- **Pause:** the pause button, Esc / P, or leaving the tab mid-run. A big "Paused" over the recap so far ("Score so far") and the board with where this run would place (tabs on phones, side by side on wide screens). Continue is the main button; Restart starts a fresh run at once.
- **High scores:** an 80s top-10 board with initials entry (▲▼ or typing, specials allowed), and a title attract mode. Global via Supabase (project `uxwcslorwepzrmpbqmjd`), cached locally with an offline queue.

### Feel
- **Grid ripples:** battle won 2.2, gate 1.6, wipe 1.5, blast 1.6, stomp 2.0, army lost 2.4.
- **Bloom** is tuned so numbers stay readable.
- **Sound:** synthesized WebAudio, rate-limited and pitched down in slow motion. Sounds: death fizzle, hit tick, pop, good gate (whoomp and sparkle), bad gate, gate tick, max multiplier (data stream), blast, stomp, battle won (blast plus an echoing crackle), army lost.

## 4. Roadmap

### Next up
1. **Batch D: mini-boss plus the bomb it awards.**
   - **Mini-boss:** a large wireframe shape with a health bar, about one every 8 segments from the second loop on. The track stops when it's in range. It advances slowly and **slams** every few seconds: a telegraphed pulsing ring, then a radius kill with a grid shockwave. Spread out or dodge. If it reaches the army it eats units each second. On death it shatters into tumbling segments (voxel-style).
   - **Bomb ("Overload"):** the mini-boss's reward. One charge at a time (an inventory may come later). Shown as a top-right icon (excluded from drag input).
     - **Tap:** lose half the army, destroy every enemy in sight. "In sight" = every squad that exists, since squads only spawn at the fog line (38 units); queued squads are untouched. Gates are untouched; a mini-boss takes heavy damage instead.
     - **Last stand:** holding a charge and dropping below 100 in a battle auto-detonates it, still costing half the army.
     - **Feel:** freeze-frame, white flash, a fast shockwave ring (about 30 u/s) shattering enemies as it reaches them, the outer half of the army popping, 0.5s of slow motion, shake and a big ripple. Sample sparks (about 1 per 8 kills) and process kills per frame as the ring passes.
2. **Batch B: firepower rework.** Volley fire from front-rank positions; linear DPS (N × damage per unit) with a capped number of visible bullets and damage aggregated per bullet; bullets brighter and thicker as damage per bullet rises; gate "toughness" so big armies don't raise gates instantly.
3. **Batch E: balance pass.** Tune the par curve, threat range, capacity, gate toughness, area damage and boss hp. Test on a real phone after D.

### Proposed next (playtest round 18, not yet prioritized)
These come from the user; the order among them and against D / B / E is still to decide.

4. **Batch F: levels.**
   - **Level gates:** a full-width gate across the track ("LEVEL 2", "LEVEL 3"…) that ends a level. It can't be shot or dodged; it's a finish line with a big ripple and a sound.
   - **Shape:** the first levels are short (about 45–60s) and about building the army: generous gates, few, small squads. Levels lengthen and harden after that (the sawtooth idea under *Structure* below). Score and army carry over between levels.
   - **End-of-level menu:** a version of the pause menu. "Level 1 complete" in place of "Paused", the level's recap and the board. The main button is **"Go to Level 2"**; Restart stays secondary. Ties into level progress in the score and possibly a per-level best.
   - **Army snapshot** (pause menu and end-of-level menu): the army as it is at that moment, in its current formation and size, shown at the top of the menu. Idle animation for interest: slow rotation, a gentle breathing scale, a twinkle on the dots.
     - Suggested build: copy the army's dot positions and colors into a small 2D canvas when the menu opens (5,000 dots is cheap) and animate that, rather than a second WebGL view. It then also works in the style guide.
5. **Fire enemy (new type).**
   - On contact or death it sets the army on fire in a radius. Units caught in it **keep burning for a duration** (about 2–3s): they flicker orange-red and each has a chance to die every tick, so the damage keeps coming after the hit.
   - Open questions: does fire spread to neighbors (risky with tight formations, dramatic with big ones)? Can moving or a good gate put it out? A flame shape and its own color; it unlocks after the bomber.
   - Builds on the area-damage code (`killArea`). Needs a per-unit burn timer in `crowd.js`, the burning look in the point shader, its sprite in `sprites.js`, a sound, and the style guide.
6. **Stronger parallax** between the road and the background.
   - Today the void grid sits at y = −4 below the track. Options: drop it much deeper, scroll it slower than the track, and/or add a far layer (stars or a horizon skyline) moving slower still. Keep the background dimmer than anything interactive.
   - Check on a phone that it reads as depth, not motion sickness.

### Ideas parked for later
- **Track hazards:** saws, rollers, spike strips; narrow bridges and gaps; rail breaks.
- **Gates:** locked gates (N hits to open), order-of-operations runs, gates that flip sign on a timer.
- **Enemies:** (fire enemy promoted to item 5 above) squads that shoot back; shielded units (immune from the front); splitters that break into grunts; an enemy that steals units on contact.
- **Run upgrades:** crates and barrels to shoot for spread, pierce or fire rate.
- **Structure:** (level gates promoted to item 4 above) worlds of levels that each teach one idea (sawtooth difficulty); a boss every 10 levels; a daily seeded challenge with its own board; chunk-based levels in JSON; a headless level validator that plays every level with bot strategies (the `?debug` step hook is the start).
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
