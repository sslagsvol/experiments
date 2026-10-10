# Vector Wars: change log

Round-by-round history of playtest feedback and what changed, grouped by release. Forward-looking plans and the roadmap live in `PLAN.md`; the version scheme is in its section 7.

## Releases
| Version | Rounds | Merge |
|---|---|---|
| 0.1.0 | prototype, round 1 plan | direct to main |
| 0.2.0 | round 1 (batch A), style guide | PR #3 |
| 0.3.0 | rounds 2–14 (batch C onward) | PR #4 |
| 0.3.1 | round 15 | PR #5 |
| 0.4.0 | round 16 | PR #6 |
| 0.5.0 | round 17 | PR #7 |
| 0.6.0 | rounds 18–21 | PR #8 |
| 0.6.1 | rounds 22–23 | PR #9 |
| 0.7.0 | round 24 | PR #10 |
| 0.8.0 | rounds 25–26 | PR #11 |
| 0.9.0 | rounds 27–35 | PR #12 |
| 0.10.0 | round 36 | PR #13 |
| 0.11.0 | rounds 37–43 | PR #16 |
| 0.11.1 | round 44 | PR #17 |
| 0.11.2 | round 45 | PR #18 |
| 0.11.3 | round 46 | direct push to main (`3d3fdcb`, no PR) |
| 0.11.4 | round 47 | `vw/v0.11.4` |

## Style guide debt
Visual or animation changes that haven't been reflected in `style-guide.html` yet. See the rule in `CLAUDE.md`.
- *(none)*

---

## Round 1 (2026-10-07): first playtest

Feedback from the first playtests (2026-10-07). It plays smoothly on desktop **and mobile**, and the animation and pacing feel great.

**What's working (protect these):** smoothness, the scrolling animation, the overall flow of a run, and the geometric look of the crowd.

---

### The feedback, diagnosed

### 1. Bullets feel weak and sporadic, so aiming is hard
**What's happening now:** fire rate is `min(50, 3 + 2·√N)` shots/s, and each bullet spawns at a *random* x somewhere inside the crowd (`main.js`, fire loop). A 30-unit army fires about 14 shots/s scattered across its width, so it reads as noise, not a stream you're pointing at something.

**Change:**
- **Volleys, not a random trickle.** The army fires in synchronized volleys (about 6/s). Every unit in the front rank fires straight ahead from its own position, so the bullets form tight, readable lanes that line up with your crowd. Moving your thumb visibly sweeps the lanes across a gate.
- **Firepower scales linearly with crowd size**, as requested: DPS = N × `DAMAGE_PER_UNIT`.
- **Performance guard:** the number of *visible* bullets stays capped (about 150 live). When the crowd is bigger than that, each bullet carries more damage (damage = total volley damage ÷ visible bullets). Twice the crowd means twice the damage, without twice the draw cost on a phone.
- Bullets get slightly brighter and thicker as damage per bullet goes up, so big armies *look* stronger.

**Knock-on effect:** linear damage makes gates rise much faster for big crowds. Gates gain value per point of damage, divided by a **gate toughness** that rises with gate number. Tuned in the balance pass (E3).

### 2. Crowd formations: tighter, more deliberate, and changing with power-ups
**What's happening now:** units spring toward a jittered sunflower spiral. Spacing shrinks as the crowd grows so it always fits the track (`crowd.js`, `CFG.UNIT_SPACING`).

**Change:**
- **Tighter, fixed spacing** (about 0.05 vs 0.075 now). A small or medium army fits comfortably inside *one* gate panel, so choosing a side is a clear commitment, not a straddle.
- **A formation library**, with slots generated per pattern: sunflower, hex lattice, concentric rings, wedge/arrow, diamond, square phalanx.
- **Patterns morph on each power-up.** Passing a positive gate advances to the next pattern. Units already spring to their slots, so the morph animates for free, and staggering the spring speed makes it ripple outward.
- **Slow swirl:** the whole pattern rotates gently (sunflower and rings especially), faster for a moment right after a power-up.
- Patterns are cosmetic in this round. Possible later: wedge = narrower and faster, phalanx = tougher in battles.

### 3. Enemies feel 100% inconsequential
**What's happening now:**
- Bullets usually kill most of a squad before contact.
- Contact trades units 1:1 at a high rate while the track only slows to 30%, so the army "pushes through."
- Enemy counts follow a fixed curve that doesn't keep up with a gate-boosted army.
- Squads are small blobs you can often steer around.

**Change:**
- **The track stops for battles.** On contact, scrolling stops completely. The squad charges into your front line and the fight resolves on the spot. Then the track speeds back up with a short "breakthrough" surge.
- **Readable battle line:** units trade at the contact edge with sparks and grid ripples, at a rate set by the size of each side's *front*, not a flat rate. A wide enemy line chews through you faster.
- **Enemies are worth more than one of yours:** each enemy unit has a strength value (start around 1.5). A squad of 100 can kill about 150 of your units.
- **New enemy formations:**
  - **Wall:** spans the full track, so you can't dodge it. Shoot it down or pay in units.
  - **Blob:** today's squad, which you can dodge.
  - **Column:** narrow and deep, protecting a gate.
- **Counts follow the player's expected crowd size** (a "par" curve built from the gates already passed), not a fixed exponential. Squads stay a real threat after a good ×3.

### 4. New enemy type: mini-boss
- **Look:** a large wireframe shape, different from the diamond grunts (a hexagon or star), about 1 to 1.5 units across. A health bar sits above it with a number on it, keeping the numbers honest.
- **Behavior:** the track stops when it comes into range. It advances slowly while you pour fire into it. Every few seconds it **slams**, sending out a magenta shockwave on the grid that kills every unit within a radius. Telegraph the slam with a pulsing ring so you can react by spreading out or dodging sideways.
- **If it reaches you,** it eats units each second until it's dead.
- **When it dies,** it shatters into tumbling glowing line segments (the voxel-destruction idea from the plan), with a big ripple and a reward: a free gate or a strong multiplier.
- **Placement:** one every N segments, with a warning on the track ahead.

### 5. Falling off the track
**What's happening now:** the crowd is squeezed to always fit, and above 4,000 units each dot stands in for several units.

**Change:**
- **Units outside the rails fall:** they drop with gravity, flicker and die, counted as "fell off" in the death recap.
- **This creates a natural cap.** With fixed spacing, the track only holds about 1,000 to 1,500 units (tunable). When a ×3 overfills the track, the overflow spills off the edges. Multipliers get *less* attractive when you're already huge, which is exactly the kind of real decision pillar 2 asks for.
- **Every dot is one unit again.** This removes the "each dot stands in for several" compromise, which fits the honest-numbers pillar.
- **Steering risk:** the army's center stays clamped inside the rails, but a wide crowd hugging an edge loses its outer units. Dodging becomes a trade-off, not a free action.
- **Track hazards it makes possible later:** narrow bridges, gaps and rail breaks.

### 6. Multipliers break the game at large numbers
**What happened:** on mobile, the army reached about **400,000** units while enemy squads were still around 200 to 300.

**Why:**
- ×-gates multiply an already-huge count.
- Shooting a multiplier keeps charging it (×2 → ×3 → ×4…) with no limit.
- Nothing caps the army (`UNIT_CAP` is 999,999).
- Enemy counts follow a fixed curve (`12 · 1.27^k`) that ignores the player's size.
- Only about a third of gates are negative, and there's no ÷.

**Change:**
- **The track-capacity cap from #5 is the main fix.** At about 1,200 units, overflow falls off, so a ×3 at the cap is mostly wasted.
- **Cap multiplier charging at ×3**, and make each step need more hits than the last.
- **More bad gates:** add **÷2 / ÷3** gates and raise the share of − gates. The mix gets harsher as the army grows: a big crowd sees more ÷ and −, a small one sees more + and ×.
- **Enemy counts follow the par curve** (#3), so squads keep pace with what a good player should have by that point.
- **Pair rule:** a ÷ gate is never paired with another ÷. There's always a way out, but it may cost you.

---

### What was built
- **Batch A (branch `vw/formations`):** six formations normalized to the same width, so capacity is identical whichever is active (full army = 80% of track width, `CFG.FORMATION_FILL`). Track capacity is 1,200 (`CFG.CAPACITY`). The track is now a raised strip over a void grid, so falling reads visually. A negative gate shakes the formation. 1,200 units cost about 1.5ms/frame on desktop.
- **Batch B deferred** (2026-10-07): with formations and the cap in place, projectiles feel OK for now. The focus moved to enemies.
- **Batch C (branch `vw/battles`):**
  - Enemies are individual units in six formations (blob, wall, wedge, skirmish, column, waves).
  - Squads hold formation, charge when 9 units away, and turn in on the flanks once level with the army. Each contact takes out about 1.5 of the *nearest* units.
  - The track rolls in at half speed, stops dead within 3 units, and surges after a win. The camera pushes in.
  - **Slow motion:** when incoming strength ≥ 0.8× the army, time eases to 0.3× (steering stays real-time), with a pink vignette and a heartbeat on the count.
  - Squads are sized when they come out of the fog, against the army you'd have from the *best* side of each gate before them, minus what earlier squads will cost. Taking the weak gate makes the next fight harder.
  - Strength/threat values in `CFG.ENEMY_*`, pacing in `ANIM`.
- **E1c was pulled forward:** testing showed a 1,000-unit army charging a ×2 gate to ×6 in about two seconds.

## Round 2 (2026-10-07, after playing batch C)

### Feedback and what changed (branch `vw/battles`)
| Feedback | Change |
|---|---|
| 1,200 cap is too low; falling off the edges already limits size | Hard cap raised to **5,000** (`CFG.CAPACITY`). Up to 1,200 the crowd keeps full spacing; above that it packs progressively tighter and dims slightly, reaching the rails at 5,000. Steering near an edge with a big army still spills. |
| Enemies that sneak past should hurt | Enemies that get behind the army hit the rear (`CFG.ENEMY_LEAK_MARGIN`): same damage as a frontal hit, a pink vignette pulse, and a "Slipped past" line in the recap. |
| Don't show enemy counts | Squad count labels removed. Formation size and unit types show strength. |
| Should enemies move? Tougher, harder-hitting ones? | Four unit types (`ENEMY_TYPES`): **grunt** (diamond, 1 hp), **drone** (triangle, strafes side to side), **bomber** (pulsing ring, homes on the center, blast kills everything nearby), **brute** (big hexagon, 8 hp, crushes 8). Drones from the 3rd squad, bombers from the 4th, brutes from the 5th. Bullets now chip at hp, with hit flashes. Squads are sized by expected damage, not headcount. |
| Gates count up too fast | + / − gates fill a charge bar like × gates: **3 hits per +1** (`CFG.ADD_HITS_PER_STEP`). |
| Split gates (mid-batch request) | Each panel applies only to the units that went through it: × multiplies them; + / − is scaled by their share of the army (−30 clipped by 30% of the army costs 9, from that side only). The **primary** panel (where the army's center went) shatters into sparks; the secondary flashes. A wide army gets both gates. |

### Tuning notes
- Squad strength is now 0.35–0.85× the projected army (`ENEMY_THREAT_MIN/MAX`). Anything above 1.0 was a guaranteed loss because enemies home in.
- Enemies are drawn at 55% brightness so dense formations show their shapes instead of blooming into a solid bar.
- Bot run (sweeping side to side, no real gate choices): 12 battles, peak 1,719, died at distance 286.

### Fixed along the way
- Recycled enemy slots could be claimed by two squads, leaving a squad "alive" with no units and the track stuck. Each slot now records its owning squad.

## Round 3 (2026-10-07)
| Feedback | Change |
|---|---|
| No downtime between gates and enemies | Track elements spaced by type: 18 units after a gate (`CFG.SEG_GATE`), 28 after a squad (`CFG.SEG_ENEMY`), first element at 22. A sweeping bot now gets 4–10s of calm between battles. |
| Enemies clumped too tight | `ENEMY_SPACING` 0.17 → 0.27, looser rows, wave gaps 3.2 → 4.5, skirmishers spread up to 9 deep. Formations deeper than `ENEMY_MAX_DEPTH` (9) compress, so a huge squad reads as a dense mob instead of stretching down the track. |
| Drones stray far off the track | Bug: waiting drones swayed around the squad's live centroid, which included their own sway, so the squad drifted. They now sway around a fixed anchor and are clamped to the rails. Max enemy offset in a full test run: 1.95 (track half-width 2.0). |

## Round 4: gates (2026-10-07)
| Feedback | Change |
|---|---|
| Negative gates should be bigger | − gates now roll −18 to −60 (was −6 to −26), still scaling ×1.12 per gate. |
| 4–5 bullets per step on + / − gates | `CFG.ADD_HITS_PER_STEP` = 4 (one setting; 5 makes bad gates much harder to rescue). |
| × gates should climb visibly from 1.0 | × gates start at **×1.0** (no effect unless shot) and climb **0.1 per step** to ×3.0. Steps cost 2 hits up to ×1.5, then 3, 4 and 5 near the top (`multHitsForStep()`, about 70 hits for ×1.0→×3.0). Labels show one decimal. |

Notes: squads are still sized against the gates' current values when they come out of the fog, so a multiplier you charge up after that is a real advantage. A sweeping bot that splits its fire now dies earlier (peak about 50), so check that the early game doesn't feel too punishing when you aim properly.

## Round 5 (2026-10-07)
| Feedback | Change |
|---|---|
| Lost units should fizzle out, red then black | New `Fizzles` effect: every unit lost to a gate, an enemy hit, a blast or slipping past burns cyan → red (`COLORS.dying`) → black over 0.7s (`ANIM.fizzleTime`), flickering and shrinking, and stays where it died so the army visibly leaves its losses behind. Units falling off the edge burn the same way as they drop. |
| 80–90% of enemies should be basic units | `squadMix()` rebalanced: specials are 8–18% per squad. A full 14-squad test run came out 88% grunts. |

Also fixed: the style guide's enemy-charge card still referenced `ENEMY_STRENGTH`, a setting removed in round 2, so it showed "undefined" and its demo enemies did no damage.

## Round 6: HUD and score (2026-10-07)
| Feedback | Change |
|---|---|
| Show "+371" next to the army number at gates, and losses in battles | `#delta` beside the count. Gates flash the net change ("+21" green / "−45" red, 1.4s rise and fade). Battle, leak and fall losses build a running "−N" that stays while losses keep coming and fades 1.2s after the last. |
| Move the army number to the bottom | The count is fixed at the bottom center (`#army-hud`), 34px, and no longer floats over the army. |
| Shift the army up for thumb room | Lens shift via `camera.setViewOffset` (`CFG.CAMERA_LIFT` = 0.12): the whole view moves up about 12% without tilting the camera, so the forward view is kept. |
| Score with enemies defeated, sprites with idle animation | Score = distance × 10 + each enemy defeated × its hp × 5 (`CFG.SCORE_PER_DIST`, `SCORE_PER_HP`: grunt/drone 5, bomber 10, brute 40). "Defeated" = shot down or died hitting the army; enemies that slip past don't count. The recap shows a big score, then each type's sprite idling (grunts bob, drones sway, bombers pulse, brutes turn) with a count that ticks up and its points. Best is now stored as a score (`vector-wars-best-score`), so the old distance-only best is reset. |

Sprites are drawn by the new `src/sprites.js`, shared by the recap and the style guide. The style guide renders the real recap through `renderRecap()`.

## Round 7 (2026-10-07)
| Feedback | Change |
|---|---|
| Grid distortion should be more extreme, especially after battles and gates | Ripples dip the floor up to 1.0 × strength (was 0.35), rings are wider and fade slower. New strengths in `ANIM`: battle won 2.2 (new: fires as the track starts moving again), gate 1.6, squad wiped 1.5, blast 1.2, army lost 2.4. Dip capped at 2.5 so stacked ripples don't tear the floor. |
| × gates very rare; more ÷ and − gates | `CFG.GATE_MIX`: × 8%, + 32%, − 35%, **÷ 25%** (new). ÷ gates start at ÷2.0 / ÷2.5 / ÷3.0 and shooting walks them down 0.1 at a time toward ÷1.0 (no effect), mirroring ×. A pair never has two bad gates. |
| Enemies should start toward the player earlier and slower | Squads start charging 18 units out (was 9) at 2.2 units/s (was 3.5). The straggler catch-up is gentler (`ENEMY_CATCHUP`). Measured charge starts: about 16–17 units from the army's front. |
| Bosses go behind the diamonds, spread out | Brutes take every 3rd slot counting from the *rear* of walls and wedges: behind the grunts, with gaps between them. (The mini-boss itself is still batch D.) |
| Sound effects: unit deaths, bullet hits, gates | New `src/audio.js`: WebAudio-synthesized sounds, with no files. Death fizzle, bullet tick, enemy pop, gate up/down, gate value tick (pitch rises with value), bomber blast, battle won, army lost. Rate-limited per sound (`SFX` in config). Pitched down in slow motion. Mute button under the best score, saved per device. |

## Round 8 (2026-10-07)
- Keep all sounds except battle won. That's now a low, boomy, static-y explosion: a deep sub drop (90→28 Hz), a lowpassed noise rumble, a mid noise burst, and a crackle of short static snaps over the tail. Volume 0.6.

## Round 9 (2026-10-07)
- Battle won sound = the bomber blast + a crackly fizzle through a feedback delay (0.16s, darkening each repeat).
- ÷ gates shot down to ÷1.0 flip into ×1.0 gates and keep climbing, so a bad gate can be turned into a good one with enough fire.

## Round 10 (2026-10-07)
- **Area damage for bombers and brutes** (`aoe` in `ENEMY_TYPES`, `army.killArea()`). Each unit inside the radius dies with chance `peak × (1 − d²/r²)`, up to `max`. Bigger area, lower peak:
  - Bomber: radius 0.7, 95% at center, max 45. Tight and deadly.
  - Brute: radius 1.2, 50% at center, max 60. Wide, fewer kills per unit.
- **They feel dangerous:** both throb brighter over their last 4 units of approach. On impact: a shockwave ring of sparks at the blast radius, a big grid ripple (blast 1.6, stomp 2.0), heavy screen shake, and a new brute **stomp** sound. Lost units fizzle red into a visible crater.
- Measured in a test run: bomber hits averaged 44 kills, brute stomps 41. Squad-sizing estimates raised to match (bomber 35, brute 38).

## Round 11 (2026-10-07)
- **Enemies stay off the edges:** formations and charging enemies keep `CFG.ENEMY_EDGE_MARGIN` (0.45) in from the rails, where they were hard to hit. Measured max offset: 1.55 of 2.0.
- **Moving gates** (uncommon, about 15% of gate spots): a single 1.5-wide panel sways side to side. 65% are worth chasing (+ or ×), the rest are bad (− or ÷) to dodge. Only units that pass through it are affected; it only shatters if someone did. Shootable like any gate.
- **× gates climb more slowly:** 4 hits per step at the start (was 2), about 110 hits for ×1→×3. Reaching ×3.0 plays a loud chord (`maxMult`), bursts gold and sends a ripple.

## Round 12: 80s high scores (2026-10-07)
- **Top-10 board** (`src/scores.js`), kept in localStorage: per device, no security. Seeded with arcade CPU entries (VEC 20,000 … ACE 1,000) so it's never empty. The HUD "Hi" shows the top score.
- **Initials entry** when a score makes the board: "New high score" flashing gold/pink, the place (e.g. "6th place"), three big slots with ▲▼ (hold to repeat) cycling A–Z, 0–9 and `! ? . - * # @ & $ % + = < > / _` plus space; tap a slot to select it; keyboard typing works on desktop. ENTER saves and plays the max-multiplier chord. "Tap to retry" is hidden, and taps can't restart the game, until it's done.
- **Board** replaces the recap after entry: per-rank neon colors, dotted leaders, the new entry blinking. The game-over backdrop is darker so it reads over the scene.
- **Title attract mode:** the title alternates between the logo and the board every 5s.
- **Next step if wanted:** a *global* leaderboard shared by everyone needs a tiny online store (a free key-value service or a small serverless function). `scores.js` is the only file that would change.

## Round 13: global leaderboard (2026-10-07)
- **Supabase-backed global board** (`src/scores.js`, `CFG.LEADERBOARD`). Uses Supabase's REST API directly (no SDK): one `vector_wars_scores` table, where anyone can read or add a score and nobody can edit or delete. Setup steps and SQL are in `LEADERBOARD.md`.
- **Still works without it:** blank config = per-device board. Each device caches the last global board for instant display and offline play. Scores saved offline are queued (`vector-wars-pending-scores`), shown on your own board right away, and sent on the next successful load.
- **Game over flow:** the recap shows immediately, the board is checked (3s timeout), then the initials entry or "Tap to retry" appears.
- CPU entries fill gaps on a young board; they're never written to the database.
- Tested against a simulated Supabase server in the browser: correct GET/POST requests, merge with CPU entries, highlight of the new entry, offline queue flushed on reconnect with no duplicates.
- **Waiting on:** the project URL and public key from the Supabase project.

## Round 14 (2026-10-07)
- **Gains left, losses right:** `#gain` (green, left of the count) and `#loss` (red, right) are separate running totals. Each bumps on every change and fades 1.2s after its last change, so a split gate shows both (e.g. "+29 625 −4") and a battle right after keeps adding to the red side.

## Round 15: tidy-up (2026-10-07)
- Style guide: HUD cards and the count demo now use the `#gain` / `#loss` pair (clears the round 14 debt); restored the high score board / initials demo.
- Docs restructured: `PLAN.md` is now the design *as built* plus a single roadmap (leaderboard hookup, mini-boss + bomb, firepower rework, balance pass, parked ideas); this file (formerly `EDITS.md`) is history only.

## Round 16: global leaderboard live (2026-10-07)
- `CFG.LEADERBOARD` points at Supabase project `uxwcslorwepzrmpbqmjd` (publishable key). Read and insert verified against the live table.
- `LEADERBOARD.md`: how to find the Project URL on newer dashboards.

## Round 17: pause menu and live score (2026-10-07)
- **Pause menu:** pause button left of mute (only during a run), Esc / P, and auto-pause when the tab is hidden or loses focus. Shows "Paused", the recap so far, and the high score board with "On pace for Nth" / "N more to make the board". Continue (primary) and Restart (straight into a new run). The sim, the audio and input stop while paused.
- **Live score, top left:** the real score (distance + enemies defeated), not distance. While it's on pace for the top 3 of the board, it doubles in size with a medal badge in that rank's color; moving up a place pops it and plays the `maxMult` chord.
- Recap styles are now the `.recap` class (shared by game over and pause); `renderRecap()` takes a label.
- Style guide: HUD card (score, pause button), new top-3 badge and pause menu cards.

## Round 18: ideas added to the plan (2026-10-07)
- Planning only, no code changes. New `PLAN.md` roadmap items: 4. levels (level gates, short build-up levels first, an end-of-level menu with "Go to Level #", the army snapshot in the pause and level menus), 5. the fire enemy (burn radius plus burn over time), 6. stronger road / background parallax.

## Round 19: new gate sounds (2026-10-07)
- Auditioned six candidates (`concepts/gate-sounds.html`). The good gate (`gateUp`) is now E, "whoomp and sparkle", replacing the chiptune arpeggio; the ×3 max-out (`maxMult`) is now F, "data stream", replacing the chord. `Sfx.echo()` added. Style guide sound notes updated.

## Round 20: slow motion for breaking the high score (2026-10-07)
- When the score gets within about 0.8s of distance points of 1st place, time eases to ×0.3, holds 0.9s after passing it, then returns to full speed (3.5s cap; once per run). Settings `ANIM.record*`. Style guide slow-motion card notes it.

## Round 21: top-3 slow motion, micro-battle levels planned (2026-10-07)
- The breaking-the-record slow motion now fires for 3rd, 2nd and 1st place, once each per run (`G.recordNext` counts down from 2).
- `PLAN.md` item 4 (levels): added micro-battle levels, with sparse gates and small, evenly matched squads where target choice matters.

## Round 22: sound lab, detune and stretch (2026-10-07)
- `Sfx.play()` now applies `SFX.tune` (semitones) and `SFX.stretch` globally and per sound; slow motion is the two together (rate 0.3 ≈ −21 st, ×3.3). Defaults change nothing.
- New `sound-lab.html`: every game sound with global and per-sound detune/stretch, presets (A touch, Deeper, Heavy, Game slow-mo), a "run moment" sequence and a settings readout to paste into `SFX`. Published to the same private link as the gate-sound audition.
- Style guide sound board shows tune/stretch when set and links the lab.

## Round 23: keyboard controls planned (2026-10-07)
- Planning only. `PLAN.md` item 7: arrow / A-D steering with hold-to-sweep, Space / Enter for start, continue and retry, R restart, M mute, keyboard-only hints.

## Round 24: Sfx.attach for the synth lab (2026-10-07)
- `Sfx.unlock()` now builds its master chain through a new `Sfx.attach(ctx, dest)`, so a sound can also be rendered into an `OfflineAudioContext`. No change to how the game sounds. The new `../synthlab` experiment uses it to turn the game's sounds into keyboard samples.

## Round 24 — v0.7.0: versions, parallax, grid patterns, keyboard (2026-10-07)
- **Version numbers:** `VERSION` in `src/config.js` ("0.7.0"), shown small along the bottom of the title and pause screens. Past releases numbered after the fact (0.1.0–0.6.1); scheme and release steps in `PLAN.md` section 7; local tags `vector-wars-v*`.
- **Stronger parallax:** background grid 9 below the track (was 4), scrolling at ×0.45 and following the camera ×0.6 (`CFG.VOID_*`). "Parallax: classic" on the pause menu restores the old look for comparison.
- **Grid patterns (experiment):** grid, hex, oblique, triangles, dots, rings on the track and background (`GRID_PATTERNS`, `CFG.GRID_PATTERN`). Pick with the pause-menu Grid button, the G key or `?grid=`; remembered per device.
- **Keyboard controls:** ← → / A D steering with a ramp and Shift for fast; Space / Enter, R, M, G; hints only after a key press (`CFG.KEY_STEER_*`, `KeyInput` in `input.js`).
- `LEADERBOARD.md` stays removed (deleted on purpose in v0.6.1; setup is done). References to it updated.
- Style guide: six grid-pattern cards, a parallax card, version and keyboard hints on the title and pause cards.

## Round 25: level progression plan (2026-10-08)
- Planning only. New `LEVELS.md`: lessons vs levels; level 1 packs the first four lessons in the user's order (a few grunts, a centered half-width +1 gate, an easy wave, −10 / −1 reds, harder waves); army carries over; **bonus levels** with a forced small strike team end in a mini-boss (a giant next-enemy-type) that unleashes that type, worth more points, with survivors rejoining through a capped bonus × gate; a world boss earns the bomb. World 1 laid out as 7 levels + 3 bonus levels. Open questions: merging units at level-up, failing a level or bonus, leaderboard, stars, unleashed scoring.
- `PLAN.md` item 6 now points to it.

## Round 26 — v0.8.0: level 1 playtest build (2026-10-08)
- User: build just level 1, script the first ~90 seconds, then scale linearly, to playtest before building the rest.
- **`src/levels.js`:** `LEVEL_1`, a list of beats: 5 grunts, a centered half-width **+1 gate with a slow approach** (the track eases to ×0.35 so the value climbs; players reach about +30), 8 grunts, −10 / −1, then squads sized as a share of the best-case army between gate pairs, a first × gate, and a full-width **"LEVEL 2" gate**.
- **Level gate:** can't be shot or dodged; crossing it gives the biggest ripple (2.8), a white spark ring, the maxMult sound and a **"Level 1 complete" banner** (`hud.toast`, `#toast`). A "Level 1" banner opens each run.
- **After level 1:** the random track resumes with a **linear ramp** (`CFG.RAMP_GATE` 0.12, `RAMP_PAR` 0.15 per gate) from the army you finished with, instead of the old exponential curve; drones, bombers and brutes arrive in turn. `?classic` plays the old track.
- Gates: fixed single panels of any width (`acquire(..., { x, width, slow })`), level gates (`op: 'level'`).
- Bot runs (careful / worse side / no steering): 207 / 74 / 37 units at the level gate, about 70s.
- Style guide: fixed single gate, level gate and level banner cards. Version 0.8.0.

## Round 27 — v0.9.0: slower fire, tougher gates (2026-10-08)
- User: the fire rate is near its maximum from the start, so gates fill and numbers climb too fast. Start at about a quarter and make faster fire part of progression; make gates 20–30% more durable. Playtest locally before going live.
- **Fire rate by level** (`CFG.FIRE_LEVELS`): 25% of the full rate in level 1, then 40%, 55%, 70%, 85%, full from level 6. The level banner says "fire rate up". `?classic` keeps full fire.
- **Gate durability** (`CFG.GATE_DURABILITY` 1.25): every gate needs 25% more hits (+ / −: 5 per step; ×1→×3 about 140 hits).
- **Level gates keep coming:** after level 1, one every `CFG.LEVEL_EVERY` (8) track pieces, so the fire-rate progression continues. The random track's ramp now keeps the level 1 army as its base.
- Level 1 retuned for the slower fire: squads 0.3–0.6 of the best-case army. Bots: careful 55 at the level 2 gate, worse-side dies, no steering finishes with 6; careful survives 5 minutes, growing as fire rises.
- Fixed a style guide error (since v0.7.0): the background-parallax card passed a hex number to `css()`, stopping its animation.

## Round 28 — v0.9.0 (cont.): playtest notes, killcam, level-gate crescendo (2026-10-08)
- User playtest: feels great; a little easy since people pick it up fast and dying is inconsequential (maybe a casual roguelike); levels 5–6 got boring. Requests: zoom the camera in on the army during slow motion (especially the first brute); the level gate should soak up bullets with a quiet sound that grows, so crossing it is the crescendo; then 1–2s with no enemies, minimal text ("Attack Speed Increased"), then a single small sprite of the level's new enemy, no words.
- **Killcam:** in danger slow motion the camera moves in close on the army; the first bomber blast and first brute stomp of a run get a 1.4s killcam (time ×0.35) (`ANIM.killcam*`).
- **Level gate:** soaks up bullets (`CFG.LEVEL_CHARGE_HITS` fills its bar) with a new quiet `levelCharge` blip that rises in pitch and volume as it nears; crossing plays the new `levelUp` crescendo (louder the more it charged). `Sfx.play` takes `gain`.
- **After the gate:** `CFG.LEVEL_QUIET` (52) units of empty track; the banner reads only "Attack speed increased" (or "Level N"), then a 64px idle sprite of the enemy type that level adds, no words (`hud.levelBanner`).
- **Enemy types arrive by level** after level 1: drones at level 2, bombers at 3, brutes at 4 (`UNLOCK_AT`), instead of on consecutive squads.
- `LEVELS.md` sections 6–7: what the notes mean, a casual roguelike proposal (an upgrade choice at each level gate, one continue per run, cosmetic unlocks) and a level order where every level brings something new.
- Style guide: killcam on the slow-motion card, level gate and banner cards updated, two new sounds. Sound lab: the two new sounds.

## Round 29 — v0.9.0 (cont.): World 1 level progression (2026-10-08)
- User: likes the progression idea over upgrades (parked); a continue only after a level that introduces a damage-over-time enemy (the planned burn enemy); burn look: pulsing glow, flicker, smoke trail. Build the level progression without the burn enemy.
- **Levels 2–10 + endless** (`LEVELS` in `src/levels.js`, generated per level): normal, gauntlet, sprint and bonus shapes; ÷ gates from level 2, moving gates from 4, split setups (both sides good) from 7; the sprint runs the track ×1.5.
- **Bonus levels 3, 6, 9:** your army waits (`#parked`), a strike team of 25 / 30 / 35 plays small squads and kind gates, then a **mini-boss**: one giant drone / bomber / brute (`enemies.spawnBoss`, 4× size, slow, sways less, generous hitbox, `#boss-bar`; hp from the team's fire rate). Kill it: big burst, killcam, its points (recap "Mini-bosses" row), and survivors pass a bonus × gate and rejoin your army (max 25% of it). If it reaches the team: one big area hit. Team wiped: bonus lost, army back, run continues.
- **Enemy types unleashed by level:** drones 4, bombers 7, brutes 10 (`UNLOCK_AT`); the level banner shows the new one. `?classic` keeps the old squad-count pace.
- Fire rate now steps over 10 levels (`CFG.FIRE_LEVELS`); "World 1 complete" at level 11.
- `LEVELS.md` section 7: the decisions, burn-enemy rendering notes (flame-outline shape, shader flicker, cheap smoke via a trailing ghost point, sampled embers), and World 1 as built. Bot: careful run through all 11 levels, every boss killed.
- Style guide: mini-boss card, bonus-level HUD card.

## Round 30 — v0.9.0 (cont.): harder, bigger small armies, louder gate (2026-10-08)
- User playtest: levels too easy, make them 30–50% harder (struggle beats boredom); units 2–3× bigger below about 50; the level-gate sound is too quiet (but liked); the sound and ripple after beating a squad feel out of place, keep them for great moments like a level gate.
- **Difficulty** (`CFG.DIFFICULTY` 1.4): squad sizes (authored and random) and mini-boss hp × 1.4. Bot (careful): level 1 ends at about 30–36 (was 52), the army reaches about 230 by level 7 (was 908); one careful run died in the level 5 gauntlet.
- **Small armies grow:** below 80 units the dots and spacing scale up, to 2.5× at 20 or fewer (`CFG.SMALL_ARMY_*`, in `packing()`); area-attack radius and dimming ignore the boost.
- **Level gate louder:** `levelUp` volume 1.0 (was 0.75), gain 0.8–1.2 with charge, and the `win` blast now lands on its crescendo.
- **Squad beaten:** a small ripple (`ANIM.rippleBattle` 0.7), no sound; the big ripple and `win` are kept for level gates and mini-bosses.
- **Bonus reward floor:** survivors rejoin up to 25% of your army or 20 units, whichever is more (`CFG.BONUS_RETURN_MIN`), so a good bonus can rescue a small army.
- Style guide: ripple strengths, `win` sound note, small-army note on the player unit card.

## Round 31 — v0.9.0 (cont.): boss escorts and clusters (2026-10-08)
- User: put little versions of the boss in front of the big one; the big one shouldn't reach the player unless they did something wrong; a few clusters of the new enemy through the level to raise the danger and show their powers.
- **Escort:** the mini-boss arrives behind small units of its own type (`CFG.ESCORT_SHARE` of the team: drone 0.5, bomber 0.2, brute 0.12; 3–18 units). It hangs back `CFG.BOSS_HOLD` (12) ahead of the team, **shielded** (dim, slow pulse; shots stop with a dull tick) until the escort is gone.
- **Then** the track stops and the boss advances slowly. Bot: careful and even no-aim teams of 30–35 kill it 7–10 units out; a team cut to 8 by the escort barely wins with 4 left.
- **Clusters:** every bonus squad brings a small cluster of the boss's type (`CFG.CLUSTER_SHARE`; 2–9 units) on one side, so its power shows (the first blast or stomp gets the killcam).
- `enemies.spawnSquad` takes a type override. Style guide mini-boss card and `LEVELS.md` updated.

## Round 32 — v0.9.0 (cont.): faster start, Story / Challenge (2026-10-08)
- User: levels 1 and 2 should be one level (too slow); bigger enemies earlier; massive battles by level 5–6; more grunts in front of the new enemies so they get close enough to show their powers; two title buttons, Story mode and Challenge mode (the classic mode: fast, nearly all enemies, for high scores).
- **Levels 1 + 2 merged:** level 1 now has a first ÷ gate (+8 / ÷2) in place of +8 / −6, and the first bonus level follows it. New order: bonus at 2 / 4 / 6 (teams 30 / 35 / 40), drones from 3, bombers from 5, brutes from 7, gauntlet 7, sprint 8, finale 9, "World 1 complete" at 10 (`WORLD_END`).
- **Bigger battles:** gate values ramp ×(1 + 0.7k) (was 0.35) and fire rate climbs over 6 levels (25% → full at 6). Bot: army 56 → 224 in level 3, squads up to 83; a careful bot dies in level 5's bomber battles.
- **Grunt screens:** a wall of grunts walks in front of every cluster and boss escort (`CFG.SCREEN_SHARE` 0.25). Bonus regular squads × 0.45 (`BONUS_SQUAD_SCALE`) and a gate before the boss, so the fight is about the new type; bosses: killed 6–11 units out when the team aims.
- **Title: Story mode / Challenge mode** (`#title-modes`). Challenge = the classic random track, every enemy type from the 2nd squad, full fire, track ×1.15 (`CFG.CHALLENGE_SPEED`); Space = Story, C = Challenge; `?classic` preselects Challenge. One shared leaderboard for now.
- Style guide: title card with the buttons; mini-boss card mentions the grunt screens.

## Round 33 — v0.9.0 (cont.): Quit instead of Restart (2026-10-08)
- User: wherever there's a Restart button, make it Quit, back to the title screen.
- Pause menu: **Quit** (was Restart) ends the run and returns to the title, where you pick Story or Challenge; key **Q** (was R). Style guide and docs updated.

## Round 34 — v0.9.0 (cont.): blast scatter, roomier initials (2026-10-08)
- User: when an explosion hits, the formation should burst outward slightly and recover slower than normal so the dead units are noticeable; more space around the initials inputs and buttons (too easy to mis-tap). Then ready to go live.
- **Blast scatter** (`army.blast()`, `ANIM.blast*`): bomber blasts, brute stomps and mini-boss hits push units outward (up to 0.35 at the center, reaching 2.5× the radius, never off the track); the formation follows at ×0.12 speed easing back to normal over 1.6s, and holes don't refill meanwhile. Bot: average spread 0.32 → 0.66 at the blast, back to ~0.43 by 1.5s.
- **Initials entry:** slots 30px apart (was 14), ▲ / letter / ▼ 10px apart, buttons at least 52×44px, ENTER 22px below and centered.
- Style guide: area-attack card and initials card notes.

## Round 35 — v0.9.0 (cont.): past World 1 gets much harder (2026-10-08)
- User: once you pass World 1 there needs to be a major difficulty adjustment; it feels like you could go on forever.
- **Endless (level 10+, story):** squads ×`CFG.ENDLESS_GROWTH` (1.3) bigger every level on top of the normal ramp, the track 5% faster per level (up to ×1.4), and every third level is a gauntlet. Bot: a 1,100-unit army at level 12 met a squad at the 1,500 cap and was wiped out within about 20 seconds.

## Round 36 — v0.10.0: faster, harder (2026-10-08)
- User playtest: still too slow and too easy (10+ minutes with little effort; aim for 3–4 minutes for a really good run); end-of-level challenges; grunts should converge earlier instead of leaving holes to the power units; gates block bullets and are too close to mini-boss fights, so shatter them as the boss health bar animates in; shield and bullet enemies; Challenge mode breaks after about 12 levels' worth (max army every gate, +7,000 gates); level 8 is fun; new units should flash white; mini-bosses need their own movement and should spawn units (real skill gates); formation combos.
- Built: track speed 7.2; shorter level 1 and levels; end-of-level guard squads (`LEVEL_CHALLENGE_THREAT` 1.3) behind grunt screens; difficulty 1.7 after level 1 (`DIFFICULTY_LEVEL_1` 1.4); grunts close ranks (`ANIM.gruntConverge`); boss bar fills in and the gates before the boss shatter (`ANIM.bossGateBreak`); new units flash white (`ANIM.spawnFlash`); Challenge caps gate growth (`CHALLENGE_GATE_SCALE_MAX`), ramps speed and squads (`CHALLENGE_SPEED_*`, `CHALLENGE_SQUAD_GROWTH`); oversize squads come in waves (`OVERFLOW_SQUADS`).
- Planned (`LEVELS.md` section 9): boss personalities and spawning, shields, bullet enemies, formation combos.
- Bots: story dies in level 3 at ~2:30 (was 7+ min); challenge dies at ~2:25.

## Round 37 — v0.10.0 (cont.): user tuning, durability by level, "New enemy" (2026-10-09)
- User playtest: v0.10.0 was too hard (couldn't get past level 2; endless high score 440,000 → 24,000). User retuned: `FIRE_LEVELS` [0.25, 0.45, 0.65, 0.78, 0.90, 1], Challenge speed 1.25 + 0.04 per gate up to 3.0, level guard 0.95 (committed separately).
- `LEVEL_CHALLENGE_THREAT` renamed **`LEVEL_GUARD_THREAT`** (it's the story level-gate guard, nothing to do with Challenge mode).
- **Gate durability climbs with progress:** × (1 + `GATE_DURABILITY_STEP` 0.15 per level past the 1st), up to `GATE_DURABILITY_MAX` 2.5; Challenge counts every 8 gates as a level.
- **No more "bonus level":** a new-enemy level shows "Army level up" as the army condenses to a small team (white spark ring), then "New enemy: [name]" with its sprite. The "Army N waiting" label is removed; a wiped team shows "Regroup". `hud.levelBanner` takes a follow-up banner.
- Style guide: mini-boss HUD card, level banner note.


## Round 38 — v0.10.0 (cont.): middle-ground difficulty (2026-10-09)
- User playtest: still steep, tricky even for the user. Found: `DIFFICULTY` multiplies every squad, screen and boss hp, so the level guard (0.95 × 1.7 plus its grunt screen) was about 2× the best-case army at every level end.
- Middle ground between v0.9.0 and v0.10.0: `SPEED` 7.2 → 6.8; `DIFFICULTY` 1.7 → 1.5; `DIFFICULTY_LEVEL_1` 1.4 → 1.3; `LEVEL_GUARD_THREAT` 0.95 → 0.7; `SCREEN_SHARE` 0.25 → 0.15; `GATE_DURABILITY_STEP` / `MAX` 0.15 / 2.5 → 0.10 / 2.0; `ANIM.gruntConverge` 10 → 7; `FIRE_LEVELS[0]` 0.25 → 0.3; level 1 final squad threat 0.9 → 0.75 and beats 2 units further apart (20 / 22).
- New-enemy banner: just "New enemy:" over the sprite, no name.
- Bots: story reaches level 5 at ~3:15 (was dying in levels 1–2).

## Round 39 — v0.11.0: skill-gate bosses, shields, bullets, combos (2026-10-09)
(Rounds 37–38 were committed after PR #13 merged, so they ship in v0.11.0.)
- **Mini-boss moves** (`CFG.BOSS_MOVES`, `enemies.moveBoss`): once its escort is gone, the drone boss circles the track and darts at the team; the bomber boss hops and each landing sends a shockwave that hurts the front row when it's close; the brute boss sways and stomps forward a step at a time. Average advance unchanged (`BOSS_SPEED`).
- **Mini-boss spawning** (`CFG.BOSS_SPAWN`, `BOSS_SPAWN_GRUNTS`): while exposed it spews small units of its type with grunts in front, soaking shots. Boss hp 5 → 4 shots-seconds to compensate; bomber hp × 1 → 1.25.
- **Shield enemy** (`ENEMY_TYPES.shield`, shader shape 4, `COLORS.steel`): wide steel chevron, 6 hp, wide hitbox. A line rushes from the back of its squad to the front and holds there (`SHIELD_*`); never attacks. Joins at level 9 (Challenge: after 8 gates). Level guards always bring a line; 35% of other squads do.
- **Bullet enemy** (`ENEMY_TYPES.bolt`, shapes 5 and 6, `COLORS.bolt`): immune to fire. A blinking dotted warning line marks its lane (`BOLT_WARN` 1.1s, warn sound), then it flies at bullet speed (zap sound) and cuts through a small group. A dodge scores like a kill. Volleys every 5–9s from level 11 (Challenge: after 14 gates), never during a mini-boss.
- **Formation combos** (`spawnCombo`, `COMBO_CHANCE` 25%): bombers guarded by a shield line, or a grunt wall with brutes behind, at the strength of the squad they replace.
- Level banners: an unlock level shows its line, then "New enemy:" over the sprite (not repeated for a type its mini-boss just introduced).
- Debug: `?debug&level=N` starts just before level N's gate.
- Style guide: Shield and Bullet cards (live), Mini-boss card (moves, spew, levels 2/4/6), Formation combos and Bullet warning line cards, palette roles for steel and bolt, the 'Shield line' formation.
- Bots: story reaches level 7 at 5:19 (boss fights 13–33s; all moves fire); challenge dies at 2:06 after 20 gates with shields, bullets and dodges; endless from level 10 is still a cliff (it was before v0.11.0 too: tested with shields and combos off).

## Round 40 — v0.11.0 (cont.): debug panel (2026-10-09)
- With `?debug`, a gear button top-right (or the ` key) opens a **debug panel** (`src/debugPanel.js`): game speed 0.1–3× (faster runs in substeps, one render a frame), slow motion / killcam on or off, **Next level** and **Go to level N** (story), +100 / +1,000 units, **low graphics** (no bloom, 0.75× resolution, no adaptive changes), and live sliders for the difficulty values we've been tuning (speed, difficulty, threat range, level guard, grunt screens and convergence, endless growth, shields, combos, bullet warning, boss hp and speed, gate durability). Changed values show in green, stay in this browser until **Reset**, and **Copy values** puts a config.js snippet on the clipboard. Panel input never steers the army.
- Style guide: debug panel card.

## Round 41 — v0.11.0 (cont.): a bit harder, Challenge locked, bigger boss spew, tougher shields (2026-10-09)
- **Difficulty up a notch** (between the round 38 middle ground and v0.10.0): `SPEED` 6.8 → 7.0; `DIFFICULTY` 1.5 → 1.6; `DIFFICULTY_LEVEL_1` 1.3 → 1.35; `LEVEL_GUARD_THREAT` 0.7 → 0.8; `SCREEN_SHARE` 0.15 → 0.2; `GATE_DURABILITY_STEP` 0.10 → 0.12; `ANIM.gruntConverge` 7 → 8.5; level 1 final squad 0.75 → 0.8.
- **Challenge mode locked** until World 1 is beaten in Story mode: the button is greyed out with a lock icon and the note reads "Beat World 1 in Story mode to unlock Challenge"; clicks, the C key and `?classic` fall back to Story. Reaching level 10 stores the unlock (localStorage `vector-wars-world1`) and the banner reads "World 1 complete · Challenge mode unlocked". Always open with `?debug`.
- **Mini-bosses spew about 3× as much** (`BOSS_SPAWN` own: drone 3 → 9, bomber 1 → 3, brute 1 → 3; `BOSS_SPAWN_GRUNTS` 0.1 → 0.3, up to 30) and **advance slower** (`BOSS_SPEED` 0.45 → 0.3). Brute boss hp × 1.3 → 1.15 so the fight doesn't drag.
- **Shields:** 6 → 18 hp, and they now hold in front of a level guard's grunt screen too (they guard the frontmost squad of the group). Checked: shields in front of every other unit of their group in 182 of 182 samples.
- Style guide: title card shows the locked Challenge button.
- Bots: story alive in level 7 at 7:00; boss fights 26s (drone), 47s (bomber, 9 left), 56s (brute, 15 left).

## Round 42 — v0.11.0 (cont.): shorter level 1, boss reinforcements, shield rows, gentler slow motion (2026-10-09)
- **Level 1 about 40% shorter** (bot: 55s → 32s; the rest is fighting): no slow approach on the first gate, and the gaps are tight where they can be. A gate now sits 5 behind each squad, but a squad stays 14 past the gate before it: halving every gap put gates in front of charging squads, soaking up all the bullets, and the bot died 14s in.
- **Level 2 boss gentler:** the drone boss spews 4 drones (was 9) every 3.2s (was 2.6) with half the grunts (`BOSS_SPAWN` now has per-type `grunts`: drone 0.15, bomber and brute 0.3).
- **Boss-fight reinforcements:** a skinny green + gate rushes at the team (the track is stopped) in a random lane each time the boss loses another 25% of its hp (worth 30% of the team as the boss arrived) and whenever a spew wave is shot down (12%), at least 6. Shoot it up, then catch it (`BOSS_GIFT_*`). Based on the team at the boss's arrival so they don't compound (the first try snowballed a 35-unit team to 751).
- **Shields in rows:** 2 staggered rows in front (`SHIELD_ROWS`), plus a row through the middle of squads at least 1.5 deep (`SHIELD_MID_DEPTH`).
- **Slow motion 10–15% less slow:** `killcamScale` 0.35 → 0.45, `slowMoScale` 0.3 → 0.4.
- Style guide: mini-boss card (reinforcements, per-type spew), combos card (shield rows).
- Bots: drone boss beaten with the team growing 42 → 46 (4 gifts); bomber boss beaten from 15 units with 7 gifts (11 left); the brute boss beat the bot once (Regroup), as before it's the hardest.

## Round 43 — v0.11.0 (cont.): extra life for mini-boss fights, quit confirm, game-over Quit (2026-10-09)
- **Extra life** (one per run, `G.lives`): when the strike team is wiped on a new-enemy level, the game freezes and asks "Team down · Use your extra life?". **Continue** clears the minions and the escort (`enemies.clearMinions`), keeps the mini-boss with its hp and place (pushed at least 8 units off; one that died crashing into the team comes back at its hold distance with the hp it had), respawns the strike team, and shows "Extra life". **Retreat** (or a wipe with the life spent) is the old Regroup: your army returns, no reward. Space / Q work too; the pause menu can't open over it.
- **Pause menu Quit asks first:** "Quit this run? It won't be scored." with Quit run / Cancel (Q twice quits; Esc cancels).
- **Game over:** a **Quit** button (no confirm) goes to the title; tap / Space now **retries the same mode** at once (it used to go to the title).
- Style guide: game-over card (Quit), Quit confirm card, Extra life card, `.btn.danger`.
- Checked: prompt freezes the game; Continue keeps the boss's hp (19 → 19) and clears 8 minions; a crash wipe brings the boss back at 21/22 hp; the bot then won the fight; a second wipe regroups without asking.

## Round 44 — v0.11.1: gate fixes, shorter gates (2026-10-09)
- **Fixed: a level gate sometimes rushed at the team** (obvious at 3× debug speed). Gates are pooled, and reuse didn't clear the `rush` a boss-fight gift had set (or its `bonus` flag, which could even let a Regroup delete the level gate). `GatePool.acquire` now resets both.
- **Fixed: boss-fight gift gates never went away.** They stopped moving once crossed or missed, and with the track stopped in boss fights they sat on the team, faded, blocking the view. They now keep rushing past and are released.
- **Gates half as tall** (`GATE_H` 1.25 → 0.625) with **numbers about 2.5× smaller** (new `GATE_TEXT`: 0.5 of the panel height, 0.4 for 5+ characters; were 0.62 / 0.5 of the taller panel). The style guide's gate drawings read both.

## Round 45 — v0.11.2: burning brutes, deadly mini-bosses, level reshuffle (2026-10-09)
- **"Watch the edges!"** once per run, the first time 10% of the army falls off within 1.5s (`CFG.EDGE_WARN`).
- **Shields from level 3** (`UNLOCK_AT.shield` 9 → 3), **30 hp** (was 18). Near the army they **hover** `SHIELD_HOVER` 2.5 in front of it, still blocking, instead of charging in; `SHIELD_LINGER` 4s after their squad is gone they break off. To keep level 3 passable: a narrower hitbox (`hitW` 1.5 → 1.0, so one row has gaps), at most `SHIELD_PER_ROW` 4 a row, one row until level 5 (`SHIELD_FULL_AT`), the middle row from level 7 (`SHIELD_MID_AT`). (The first try, with up to 21 hovering 30-hp shields, killed the bot in level 3 without it scoring one shield.)
- **Level 5: sprint into gauntlet.** 8 gates at 1.5× speed, a calm stretch at normal speed (`FINALE_CALM`), then four waves `FINALE_GAP` apart (`RUSH_FINALE` in levels.js): a huge grunt wall, drone skirmishers, bombers behind shields, a mixed last stand. Each is sized as threat × the army you'd have from the best side of every gate this level (`bestCase`, `G.best`), so wrong gates leave you short. Bot: an army at 55% of the best case dies in the last wave at +25% threats; settled between the two tries.
- **Bullets from level 9** (`UNLOCK_AT.bolt` 11 → 9).
- **Burning brutes:** 14 hp (was 8; `est` 45). With their outer shell (hp above half, `BURN.shell`) and within `BURN.range` 3 of the army, they burn: an orange flicker, fire sparks, a crackle, and units within 1.3 of them catch fire every 0.35s. Shot to half, the outer hexagon breaks off (shader shape 7) and the fire goes out.
- **Mini-bosses burn** within 6 units (`BOSS_BURN`, radius 2.4), and **touching the team is game over** (no extra life; the crash-restore from round 43 is gone). The boss's own brutes arrive shell-less (no fire). Brute boss spews 2 brutes (was 3, user call) and its hp × 1.15 → 1.0: with touch = game over it beat the bot twice; now beaten in 45s, 49 → 53 units.
- New `COLORS.burn`, `burn` sound; style guide: palette, brute and shield cards (live), mini-boss and combos cards.
- Bots: full story run beat the drone and bomber bosses and cleared the level 5 finale; level 3 passed from 60 units (7 shields shot down).

## Round 46 — v0.11.3: jumping bombers, shields guard specialists (2026-10-09)
- **Bombers jump** (`CFG.BOMBER_JUMP`): once charging, a hop of 3 units toward the army (0.45s, an arc), ghosted and untouchable mid-air (bullets pass through), the first within 0.5s of charging and then about every 1.2s, until they're within 8 units (`stop` + `dist`). Bot, level 5 finale: 8 jumps from 9 bombers, first jumps 14–17 units out; all 9 still shot down. (The first try, first jump 0.5–2.1s in, saw 2 jumps from 9: most were shot before their first.)
- **Shields guard specialists, never grunts:** they hold in front of a squad's drones, bombers and brutes (`s.sp` in `enemies.bounds`), and only squads with specialists get them; a level guard's shields now guard the guard squad, not its grunt screen. Checked: in front of the specialists in 128 of 133 samples (the rest: the rush forward from the back of the squad).
- Style guide: bomber and shield notes (live), combos card.

## Round 47 — v0.11.4: level 5 finale eased (2026-10-09)
- User playtest: "feeling great"; the end of level 5 is too tough. The four finale waves are about 15% smaller (`RUSH_FINALE` threats 0.56 / 0.40 / 0.34 / 0.52 → 0.48 / 0.34 / 0.29 / 0.44 × the best-case army).
- **Debug mode starts muted** (`?debug`, which every test run uses). The mute button still works there, but only for that visit: the saved setting for normal play isn't touched (`sfx.persist`).
