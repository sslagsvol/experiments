# Vector Wars: design and roadmap

A crowd-runner in the style of the "army through gates" mobile ads, redesigned around what those games get wrong: fake choices, hidden numbers, no skill expression, and art that buries the numbers. One thumb, thousands of units, 60fps on a mid-range phone.

**Live:** https://sslagsvol.github.io/experiments/ · **Version:** v0.13.3 beta (`VERSION` in `src/config.js`, shown on the title and pause screens).

| Document | What's in it |
|---|---|
| `PLAN.md` (this file) | The game as built, what's next, art direction, tech, releases |
| `LEVELS.md` | Level design: World 1 as built, level shapes, what grows per level |
| `CHANGELOG.md` | Round-by-round history: every playtest note and what changed |
| `CLAUDE.md` | Working rules (style guide, testing, versions) |
| `style-guide.html` | Every color, sprite, formation, HUD element, animation and sound, mostly read live from the code |
| `sound-lab.html` | Every sound, with detune and stretch |
| `concepts/` | Early explorations (art directions, gate sounds, style test); not used by the game |

**URL options:** `?debug` (stats line, the debug panel, the `window.vectorWars` test hook; starts muted), `?debug&level=N` (start just before level N's gate), `?units=N` (starting army), `?seed=N` (another track), `?grid=hex` (a grid pattern), `?classic` (preselect Challenge; it stays locked until World 1 is beaten).

**Leaderboard:** one shared top-10 board in Supabase (table `vector_wars_scores`, project `uxwcslorwepzrmpbqmjd`), read and appended with the publishable key, cached locally with an offline queue. Setup SQL: `git show d02685f:"Vector Wars/LEADERBOARD.md"`.

---

## 1. Why the ad games frustrate, and the fix for each

| What frustrates | What we do instead |
|---|---|
| Fake choices ("+5 or ×3") | Gates are shot up or down, split by where the army crosses, and sometimes move. A bad gate can become the best one if you commit fire to it. |
| The ad and the game differ | The ad *is* the game. |
| You lose and don't know why | The death recap breaks losses down (squads, slipped past, gates, fell off). Gains and losses show live beside the army count. |
| No skill | Aim (bullets raise gates and kill enemies), steering (edge spill, dodging moving gates and bullet enemies), gate choice and power-up timing all change the outcome. |
| Waiting around | Restart in under a second. No interruptions. |

## 2. Design pillars

1. **One thumb, always readable.** Anything needing a second gesture or a long read is cut.
2. **Every gate is a real decision.** If playtesters always pick the same side, the gate is a bug.
3. **The crowd is your health bar and your weapon.** More units means more firepower, but a wider body that spills off the edges.
4. **60fps with thousands of units on a mid-range phone.**
5. **Fail fast, understand why, retry instantly.**
6. **Progression over upgrades.** Levels are the progression: fire rate, new enemies, new gate types, new level shapes, two power-ups. No pick-1-of-3 menus.

## 3. The game as built (v0.13)

### Modes
- **Story:** World 1, ten levels with three mini-boss fights, then endless (`LEVELS.md`). One extra life per run.
- **Challenge:** the fast random track with nearly every enemy from the second squad, a speed ramp (×1.25 +0.04 a gate, to ×3) and capped gate values. Every 8 gates is a level, with the same level bonus. Locked until World 1 is beaten in Story (stored per device; always open with `?debug`).

### Army
- **Relative drag:** the army follows the finger's movement, not its position. Its center stays on the track; a wide army hugging an edge loses its outer units over the rail ("Watch the edges!" the first time 10% go over). Keyboard: ← → or A / D (hold to sweep, Shift for fast).
- **Formations:** sunflower, hex, rings, wedge, diamond, phalanx; good gates morph to the next one.
- **Size:** every dot is one unit. Full spacing up to 1,200, then tighter, reaching the rails at the 5,000 cap. Small armies (under 80) draw bigger dots.

### Fire and gates
- **Auto-fire:** `min(50, 3 + 2√N)` shots/s × the level's share (`FIRE_LEVELS`): 30%, 45%, 65%, 78%, 90%, then full from level 6. Challenge fires at full rate.
- **Gate mix:** × 8%, + 32%, − 35%, ÷ 25%; a pair never has two bad sides. + / − take 5 hits a step; × climbs 0.1 a step from ×1.0 to ×3.0 (costlier as it climbs; maxing it plays the data-stream sound); ÷ walks down and flips to × at ÷1.0. Gates get 12% tougher each level past the first, up to 2.2× (`GATE_DURABILITY_*`).
- **Split gates** apply to the units that cross each panel; **moving gates** (15% of spots) sweep side to side; level gates are full-width finish lines that soak up bullets for a crescendo.

### Enemies
Every enemy is a unit in a squad formation (blob, wall, wedge, skirmish, column, waves; shields use a staggered line). Squads are sized as they emerge, against the army you'd have from the best side of every gate before them, at 0.35–0.85× that strength × the level's difficulty (`LEVEL_DIFFICULTY`), by expected damage, not headcount. Grunts are 80–90% of most squads.

| Type | Look | Behavior | Story | Challenge |
|---|---|---|---|---|
| Grunt | Magenta diamond | 1 hp; takes out ~1.5 units on contact; closes ranks as it nears, screening what's behind | Level 1 | Start |
| Drone | Triangle | Strafes side to side | Level 3 | 2nd squad |
| Shield | Steel chevron | 30 hp, guards a squad's specialists (never grunts): rows in front, hovers 1.2 in front of the army blocking shots, charges (2 units each) once its squad is gone; at most 8 a squad | Level 3 | Gate 8 |
| Bomber | Pulsing orange ring | 2 hp; jumps toward the army (untouchable mid-air) until close, then homes in and blasts (up to 45) | Level 5 | 2nd squad |
| Brute | Violet double hexagon | 14 hp; burns nearby units when close until shot to half (outer shell breaks); stomps on contact (up to 30) | Level 7 | 2nd squad |
| Bullet | White-violet streak | Immune; a blinking warning line marks its lane for 0.9s, then it crosses at bullet speed and cuts through up to 22; a dodge scores like a kill | Level 9 | Gate 14 |

- **Set pieces:** level guards (a full-strength squad behind a grunt wall in front of every story level gate, `LEVEL_GUARD_THREAT` 0.8), formation combos (bombers behind shields, brutes behind a grunt wall; 25% of squads from level 7).
- **Battles:** squads charge from 18 units out; the track slows, stops for the clash and surges forward after. Slow motion (×0.4) and a killcam when the army is about to be overwhelmed, and briefly when the score passes 3rd, 2nd and 1st on the board.

### Mini-bosses (story levels 2, 4, 6)
The army condenses into a small strike team ("Army level up", "New enemy:"). The giant drone, bomber or brute arrives behind an escort (shielded until it's gone); then gates ahead shatter, the track stops and it comes in its own way: the drone circles and darts, the bomber hops with landing shockwaves, the brute sways and stomps. It spews small units of its type, burns close units (a fire ring warns you) and **its touch ends the run**. Skinny green reinforcement gates rush in at each 25% of its hp lost and whenever a spew wave is shot down. Wiped team: spend the extra life (the boss keeps its hp, minions clear) or retreat. Kill it and the survivors rejoin your army.

### Power-ups
- **Focus fire** (unlocked after level 2's boss; Challenge from the start): the bottom-right cyan button. Tap (or F): for 2.5s up to 5 red lasers lock onto the nearest enemies, 5 hits/s each. Its ring refills as you shoot enemies down (3 squads' worth).
- **Bomb** (unlocked after level 4's boss; Challenge from the start): the bottom-left orange button. Tap (or B): the army spends 20% of itself; each enemy near the closest ones ahead has a 50% chance to be destroyed; a mini-boss loses 12.5%. Refills over 5 squads' worth.
- Both start full when unlocked; a mini-boss kill refills both.

### HUD, score and screens
- **HUD:** live score top left (doubles with a medal badge while on pace for the top 3), the level tag under it ("Level 6"; Challenge "Level 2 · Gate 12"), "Hi" score, pause and mute top right, the army count bottom center with gains and losses, the power-up buttons bottom left and right.
- **Score** = distance × 10 + each enemy defeated × its hp × 5 + mini-bosses + 5,000 × each level cleared.
- **Screens:** pause (recap so far, the board; Quit asks first), extra life, initials (their own screen when you make the board), game over (recap, tap to retry the same mode, Quit to the title). All scroll on short phones.

### Feel
- **Grid ripples** for every event; losses burn cyan → red → black; new units flash white.
- **Graphics:** bloom tuned in the debug panel (strength 0.7, radius 0.1, threshold 0.15; MSAA available, off by default); for dense phone screens the floor pattern fades with distance, rails taper, far gates fade in, tiny enemies keep a pixel-wide outline; adaptive quality drops MSAA then resolution, never below 1.5× on 2.5×+ screens.
- **Sound:** synthesized WebAudio (no files), pitched down in slow motion; every sound is in the sound lab.

### Tuning tools (`?debug`)
The gear button (or `) opens the debug panel: game speed, slow motion on/off, next level / go to level, +units, low graphics, and sliders (with − / + for single steps) for per-level difficulty and fire rate, pace, enemies, bosses, gates and bloom. Tweaks are saved in that browser only; **Copy values** gives a `config.js` snippet to commit, **Reset tweaks** goes back to the code's values.

## 4. What's next

**Flagged next, in priority order:**
1. **World boss (level 10).** World 1 still ends on a banner. A real finale: a big multi-phase wireframe boss (slams, spawns, a weak point, the shatter), the world-complete moment, and the bridge into endless. Biggest missing piece of the 1.0 list.
2. **Endless pacing (10+).** Squads grow ×1.3 a level (`ENDLESS_GROWTH`) and bots are wiped early in 10–11: gentler growth plus a new mix or shape per level, so endless lasts minutes.
3. **Phone check.** Confirm the v0.13.2 graphics fixes on the Pixel 6 Pro (`Assets/screenshots/`, local only); profile a 5,000-unit battle on a mid-range phone; watch the `pr` value in the debug stats line.
4. **Power-up balance.** Both were halved in v0.13.0–0.13.1; playtest the refill pace (3 / 5 squads' worth), focus fire's 2.5s, the bomb's trade, and how both play in Challenge.
5. **Damage over time on units:** fire that keeps burning after a hit (put out by moving or a good gate). Brutes and bosses burn the army today; this would make it linger.
6. **Batch B: firepower rework.** Volley fire from the front ranks, linear damage with capped visible bullets: keeps big armies fast on phones and damage readable.

**Housekeeping:** release tags are local only (GitHub Desktop doesn't push them); the `concepts/` pages predate the game's current look and could be archived.

**Decided against (so they don't come back by accident):** a level-complete screen (levels flow straight into the next); separate Story / Challenge boards; pick-1-of-3 upgrades; more than one bomb at a time; power-up buttons over the middle of the screen.

**Ideas parked for later:**
- **Track hazards:** saws, rollers, spike strips; narrow bridges and gaps; rail breaks.
- **Gates:** locked gates (N hits to open), order-of-operations runs, gates that flip sign on a timer.
- **Enemies:** squads that shoot back; splitters that break into grunts; an enemy that steals units on contact.
- **Structure:** World 2 (its own grid pattern and lessons); a daily seeded challenge; chunk-based levels in JSON; a headless level validator built on the bot (`?debug` step hook).
- **Meta:** stars per level; settings (drag sensitivity, effects intensity).
- **Platform:** PWA install; Capacitor builds for haptics and the app stores.
- **Monetization (if any):** cosmetics only. Never pay-to-win, never interrupt a run.

## 5. Art direction: "vector arcade"

Chosen from four options (`concepts/art-directions.html`), after Geometry Wars, Defcon and old vector displays.
- **You:** cyan / white points of light. **Enemies:** outlines, never filled: magenta grunts and drones, orange bombers, violet brutes, steel shields, white-violet bullets. Fire is orange (`COLORS.burn`), lasers red (`COLORS.laser`).
- **Gates:** green add, red-pink subtract, deeper red divide, gold multiply, white level gates; labels near-white. **World:** electric blue, always dimmer than anything interactive. **HUD:** lime, Share Tech Mono (titles Audiowide); power-ups orange (bomb) and cyan (focus fire).
- **The grid reacts to events.** Losses burn red; bosses shatter into glowing bursts.

## 6. Tech

**Stack:** plain ES modules plus Three.js r170 from a CDN import map. **No build step**: the folder deploys to GitHub Pages as-is.

| File | Responsibility |
|---|---|
| `src/config.js` | Tunables (`CFG`), animation timings (`ANIM`), `BLOOM`, the HDR palette (`COLORS`), sound volumes (`SFX`), seeded RNG |
| `src/main.js` | Rules, track generation, levels, battles, bosses, power-ups, scoring, the loop, adaptive quality, the debug hook |
| `src/levels.js` | Level 1's beats, the level definitions (`LEVELS`), endless |
| `src/world.js` | Renderer, camera, bloom (MSAA input), the grid shader, rails, void |
| `src/crowd.js` / `formations.js` | The player swarm (one `Points` draw call), formation slots, packing |
| `src/enemies.js` / `enemyFormations.js` | Enemy units (one `Points` draw call, per-unit shape and color), boss moves, shields, bullets; formations, types, unlocks |
| `src/gates.js` | Gate panels (pairs, singles, level gates), labels, pool |
| `src/fx.js` | Bullets, sparks, rings, fizzles, fallers, focus-fire lasers |
| `src/hud.js` / `sprites.js` | DOM HUD, banners, recap, board, initials entry, power-up buttons; 2D enemy sprites |
| `src/debugPanel.js` | The `?debug` panel (sliders, saved tweaks, Copy values) |
| `src/scores.js` | The board: Supabase REST plus a local cache and offline queue |
| `src/audio.js` | Synthesized sound effects |

**Performance:** typed arrays and pooling everywhere; no per-frame allocation in hot loops; DPR capped at 2 with adaptive quality (MSAA first, then resolution, floor 1.5× on dense screens). Still to do: profile a 5,000-unit battle on a real mid-range phone.

## 7. Versions and releases

The game is in **beta**, so versions are **0.MINOR.PATCH**.
- **MINOR** goes up for anything a player would notice (gameplay, visuals, sound, UI).
- **PATCH** goes up for fixes, tuning, docs or tools.
- **1.0.0** leaves beta: World 1 with its world boss, the balance pass, and a real-phone performance check done.

**Making a release** (one per merge to `main`):
1. Branch from `main` with **no upstream**: `git checkout -b vw/vX.Y.Z origin/main --no-track` (a branch tracking `origin/main` publishes straight onto `main` in GitHub Desktop).
2. Bump `VERSION` in `src/config.js`; add the version to the Releases table in `CHANGELOG.md` and head its rounds with it.
3. The user publishes the branch and merges the PR in GitHub Desktop.
4. Claude tags the merge commit `vector-wars-vX.Y.Z` (annotated; local only) and records the release below on the next branch.

**Released so far** (details in `CHANGELOG.md`):

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
| 0.13.2 | 2026-10-12 | PR #23 (`993ecf0`) | Challenge levels every 8 gates with the level bonus; debug panel: − / + on every slider, sticky footer; user tuning; phone graphics: MSAA before bloom, live bloom sliders, no far moiré, tapered rails, crisp far enemies, gentler adaptive quality |
| 0.13.3 | (this branch) | `vw/v0.13.3` | Docs tidy: project documents brought up to date, next steps flagged |
