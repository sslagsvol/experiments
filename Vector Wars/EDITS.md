# Vector Wars: edit plan (round 1)

Feedback from the first playtests (2026-10-07). It plays smoothly on desktop **and mobile**, and the animation and pacing feel great.

**What's working (protect these):** smoothness, the scrolling animation, the overall flow of a run, and the geometric look of the crowd.

---

## The feedback, diagnosed

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

## Build order

Grouped so each batch is playable on its own and later work doesn't redo earlier work.

| # | Batch | Items | Size | Why this order |
|---|---|---|---|---|
| **A** | **Formation system** | Tight fixed spacing, pattern library, morph on power-up, swirl, units falling off the track, per-unit count (no stand-in dots) | Medium | Fall-off and patterns both depend on how slots are generated. Build it once. |
| **B** | **Firepower** | Volleys, per-unit lanes, linear DPS, damage-per-bullet aggregation, bullet visual scaling, gate toughness | Small–medium | Needs the new formation to know where the front rank is |
| **C** | **Battles** | Track stops on contact, front-based trading, enemy strength, wall/blob/column formations, breakthrough surge | Medium | Needs linear DPS in place to balance against |
| **D** | **Mini-boss** | Boss entity, HP bar, slam telegraph and shockwave, shatter death, reward | Medium–large | Reuses the battle-stop flow from C |
| **E** | **Balance pass** | Par curve for enemy counts, ÷ gates and an adaptive gate mix, ×3 charge cap, gate toughness, track capacity, boss HP | Small (iterative) | Only meaningful once A–D exist |
| — | **Mobile check** | Retest on a phone after A and after C | — | Phase 0 runs well on mobile; recheck as entity counts change |

### Checklist
- [x] A1 Slot generator per pattern with fixed spacing
- [x] A2 Pattern library (sunflower, hex, rings, wedge, diamond, phalanx)
- [x] A3 Morph to the next pattern on positive gates, with a staggered ripple
- [x] A4 Slow swirl, with a speed burst after power-ups
- [x] A5 Units outside the rails fall and die; "fell off" added to the recap
- [x] A6 Remove the stand-in-dot compromise; dot count equals unit count
- [ ] B1 Volley fire from front-rank positions
- [ ] B2 Linear DPS with a visible-bullet cap and damage aggregation
- [ ] B3 Bullet brightness/thickness scales with damage per bullet
- [ ] B4 Gate toughness (value gained per damage)
- [x] C1 Track stops fully during battle; breakthrough surge after
- [x] C2 Front-width-based trade rate; enemy strength multiplier
- [x] C3 Enemy formations: wall, blob, column
- [ ] D1 Mini-boss entity and look, with an HP bar
- [ ] D2 Slam telegraph and radius kill with a grid shockwave
- [ ] D3 Shatter death and reward
- [~] E1 Par-curve enemy counts (first pass: projected army + par, in batch C)
- [ ] E1b ÷2/÷3 gates, more − gates, a gate mix weighted by army size, no ÷/÷ pairs
- [x] E1c Cap multiplier charging at ×3, with each step costing more hits
- [ ] E2 Tune capacity, gate toughness, boss HP
- [ ] Mobile test after C

---

## Progress notes
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

## Decisions
- **Agreed:** the formation plan (tight spacing, patterns that morph on good gates, swirl) and falling off the track (both overflow and steering spill, with the crowd's center kept inside the rails).
- **Defaults unless changed:** track capacity of about 1,200; formations are cosmetic this round; a mini-boss every 8 segments starting on the second loop.

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

### New feature plan: bomb ("Overload")
The army detonates: **half the army is lost, and every enemy in sight is destroyed.**

**What "in sight" means in code vs. how it feels:**
- Squads are only created when they come out of the fog (`CFG.ENEMY_SPAWN_AHEAD` = 38 units, roughly the visible horizon). So "every enemy that exists" is already "every enemy the player can see". The bomb clears the whole screen and nothing beyond it, with no special culling.
- Squads still in the queue past the fog are untouched, so the player can't bomb something they haven't seen.
- Gates are untouched. A mini-boss (batch D) takes heavy damage but survives.

**Earning and triggering** (decided 2026-10-07):
- **Earned by beating a mini-boss** (batch D). A bomb icon in the top-right lights up.
- **Tap to detonate.** The icon must be excluded from the drag input so tapping it doesn't nudge the army.
- **Last stand:** holding a charge and dropping below **100** during a battle auto-detonates it. This is the comeback moment.
- **One charge at a time.** A future inventory may hold more items.

**Feel:**
- A brief freeze-frame, then a white flash.
- A fast shockwave ring (about 30 units/s, so about 1.3s to the horizon) races out across the grid. Enemies shatter as the ring reaches them, staggered by distance, so it reads as a wave rather than a blink.
- The army's outer half flashes white and pops.
- Short slow-motion (0.3× for 0.5s), camera shake, and a big grid ripple.

**Performance:** up to 4,000 enemies die within about a second, so sparks are sampled (about 1 per 8 kills) and kills are processed per frame as the ring passes, not all at once.

**Decisions:** re-earned only by beating another mini-boss. The last-stand auto-trigger also costs half the army. One charge at a time.

### Checklist
- [x] R2.1 Capacity 5,000 with progressive packing
- [x] R2.2 Leaks damage the rear; "Slipped past" recap line
- [x] R2.3 Remove enemy count labels
- [x] R2.4 Enemy types: grunt, drone, bomber, brute (hp, damage, movement, shapes)
- [x] R2.5 3 hits per +1 on + / − gates, with charge bar
- [x] R2.6 Split gate crossing with primary shatter
- [ ] R2.7 Bomb: charge, button, auto last stand, shockwave clear (build with batch D: the mini-boss is what awards it)

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

## Style guide debt
Visual or animation changes that haven't been reflected in `style-guide.html` yet. See the rule in `CLAUDE.md`.
- *(none)*

## Version history workflow
- One commit per checklist batch (A, B, C…), with messages starting `Vector Wars:`.
- A **tag** at each playable milestone (`vector-wars-v0.1` = Phase 0 as shipped).
- Bigger or riskier batches go on a branch (`vw/battles`), merged once they've been playtested.
- To undo: use GitHub Desktop's History tab → right-click a commit → **Revert changes in commit**, or ask Claude to "revert batch C" (one git command).
