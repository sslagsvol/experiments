# Vector Wars: design and roadmap

A crowd-runner in the style of the "army through gates" mobile ads, redesigned around what those games get wrong: fake choices, hidden numbers, no skill expression, and art that buries the numbers. One thumb, thousands of units, 60fps on a mid-range phone.

- **Play:** `index.html`. The title screen offers **Story mode** (the levels, `LEVELS.md`) and **Challenge mode** (the classic fast random track with nearly every enemy unlocked, for high-score runs; both share the one leaderboard). Challenge is locked until World 1 is beaten in Story mode (open with `?debug`). URL options: `?debug` (overlay plus the `window.vectorWars` test hook), `?units=N` (starting army), `?seed=N` (a different track), `?grid=hex` (a grid pattern), `?classic` (the old fully random track, no level 1), `?debug&level=N` (start just before level N's gate). With `?debug`, the gear button (or the ` key) opens the **debug panel**: game speed, slow motion on/off, level skip, +units, low graphics, and live sliders for the difficulty values (Copy values gives a config.js snippet).
- **Version:** **v0.13.2 beta** (`VERSION` in `src/config.js`, shown on the title and pause screens). See section 7.
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

**Built so far (v0.7–v0.12):** parallax and grid patterns, keyboard controls, World 1 (levels 1–10: an authored level 1, new-enemy levels with mini-bosses on 2 / 4 / 6, a sprint-into-gauntlet on 5, a sprint on 8), five enemy types plus bullets (grunt, drone, bomber that jumps, burning brute, shield; immune bullets), mini-boss moves, spawning, burning and reinforcement gates, an extra life, the **bomb** (v0.12.0: unlocked after the bomber fight; one at a time, a big bottom-left button whose ring refills as you shoot enemies down; costs 20% of the army, wipes a small area ahead), **focus fire** (v0.13.0: unlocked after level 2's boss; a bottom-right twin; 2.5s of up to 5 red lasers on the nearest enemies), Challenge mode (locked until World 1), the debug panel. Details by level: `LEVELS.md`; by round: `CHANGELOG.md`.

### Next up (prioritized, round 48)
1. **The level 6–7 wall.** *Built in v0.13.0 (below); tune by feel.* Playtesters can't get past level 6 and scores plateau around 200k. Bot findings (v0.11.4 / v0.12.0):
   - **Level 6 strike team** (40 units) reaches the brute boss with about 22: the pre-boss squads carry clusters of 4 burning brutes (14 hp, a stomp that kills up to 60, plus fire), and a team of 40 is one stomp from half dead. Then the boss burns within 6 units and its touch ends the run (no extra life for that).
   - **Level 7** (gauntlet, brutes join every wall and wedge): a 500-unit army fell to about 110.
   - **Levels 7–9:** squads with specialists bring up to 12 shields (2 rows + a middle row, 30 hp each) in front of burning brutes; armies bleed out behind them.
   - **Score** is mostly kills (distance was about 8k of a level-9 run), so stalling at 6–7 caps it, whatever the player does.
   - **Levers, in order:** (a) level 6: team 40 → 55, strike-team brute clusters arrive shell-less (no fire) like the boss's own; (b) brutes in squads: fewer (est 45 → 60) and a smaller stomp (max 60 → 30); (c) shields: at most 8 a squad, the middle row from level 9; (d) a pulsing warning ring while a mini-boss is within burn range, so the touch-is-game-over rule reads; (e) a level-clear bonus (e.g. 5,000 × level) so progress, not just kills, drives the score. Bot-test a full run from level 1 to 10 after each.
2. **Bomb follow-ups** (v0.12.0 shipped the core). Playtest the trade (20% for an area wipe) and the refill pace (5 squads' worth); maybe a world-boss reward (a bigger blast); a "last stand" auto-detonate is still open.
3. **World boss (level 10).** World 1 ends on a banner today. A real finale: a big multi-phase wireframe boss (slams, spawns, a weak point), the world-complete moment, and the bridge into endless.
4. **Endless pacing (10+).** `ENDLESS_GROWTH` 1.3 a level is still a cliff (bots wiped early in 10–11). Gentler growth plus new mixes per level so endless lasts minutes, not seconds.
5. ~~**Level-complete menu and army snapshot**~~ *Dropped (user, round 49): levels keep flowing straight into the next.*
6. ~~**Separate Story and Challenge boards.**~~ *Dropped (user, round 50).*
7. **Damage over time** (the rest of the old burn-enemy idea): units that keep burning after a hit, put out by moving or a good gate. Brutes and bosses burn the army now; this would make fire linger on units.
8. **Batch B: firepower rework.** Volley fire from the front ranks, linear damage with capped visible bullets: keeps big armies fast on phones and makes damage readable.
9. **Phone pass.** Profile a 5,000-unit battle on a mid-range phone; check the HUD, bomb button and gates at phone sizes; haptics.

### The level 6–7 wall (round 50, v0.13.0)
Built (the user skipped the measure / playtest steps: tune by feel with the debug panel):
- **Per-level difficulty for story** (`CFG.LEVEL_DIFFICULTY`, one entry per level, the last carrying on past World 1): squads, grunt screens, clusters and mini-boss hp scale by level instead of one flat `DIFFICULTY` (now Challenge only). Levels 6–9 eased (1.35 / 1.4 / 1.45 / 1.5; levels 2–5: 1.5 / 1.55 / 1.6 / 1.6). The debug panel's **Per level (story)** section has a slider per level for it and for the fire rate (`FIRE_LEVELS`), plus gate durability growth, endless growth and the level bonus; Copy values prints whole arrays.
- **Level 6:** strike team 40 → 55; its brute clusters arrive shell-less (no fire); a pulsing fire ring marks a mini-boss close enough to burn and touch.
- **Brutes:** fewer per squad (`est` 45 → 60), half the stomp (`aoe.max` 60 → 30).
- **Shields:** at most 8 a squad (`SHIELD_MAX`), the middle row from level 9.
- **Level-clear bonus:** 5,000 × the level cleared (`LEVEL_BONUS`), a "Levels cleared" recap row.
- Bot check: from a level-6 start it cleared level 6 without the extra life and reached level 10 (it used to bleed out in 9).

**Dropped (user, round 50):** separate Story / Challenge boards (item 6) and the level-complete screen (item 5).

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
| 0.11.0 | 2026-10-09 | PR #16 (`9582d34`) | Middle-ground difficulty; "Army level up" / "New enemy:" banners; durability by level; mini-boss moves and spawning, reinforcement gates, an extra life; shield and bullet enemies; formation combos; Challenge locked until World 1; debug panel |
| 0.11.1 | 2026-10-09 | PR #17 (`b846af3`) | Gate fixes (pooled gates kept a gift's rush; gift gates never despawned); gates half as tall with smaller numbers |
| 0.11.2 | 2026-10-09 | PR #18 (`f5245f0`) | Burning brutes (shell breaks at half hp), burning mini-bosses whose touch ends the run, shields at level 3 that hover in front, level 5 sprint-into-gauntlet, bullets at level 9, "Watch the edges!" |
| 0.11.3 | 2026-10-09 | direct push to main (`3d3fdcb`) | Jumping bombers (untouchable mid-air); shields guard specialists, never grunts |
| 0.11.4 | 2026-10-09 | PR #19 (`e623e7b`) | Level 5 finale waves about 15% smaller; debug mode starts muted |
| 0.12.0 | 2026-10-11 | PR #20 (`688c9ca`) | The bomb power-up (bottom-left button, ring refills with kills); level tag under the score; legible gate labels; shields hover closer and charge when their squad is gone; the level 6–7 wall analyzed and planned |
| 0.13.0 | 2026-10-11 | PR #21 (`5f1e456`) | Focus fire; initials on their own screen; the level 6–7 wall: per-level story difficulty (debug sliders), level 6 team 55 with shell-less brutes and a boss warning ring, fewer and softer brutes, shields capped at 8, a level-clear bonus |
| 0.13.1 | 2026-10-12 | PR #22 (`3445b62`) | Bullet enemies hit harder; focus fire 2.5s with red lasers |
| 0.13.2 | (this branch) | `vw/v0.13.2` | Debug panel: − / + on every slider for fine tuning |
