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

## Style guide debt
Visual or animation changes that haven't been reflected in `style-guide.html` yet. See the rule in `CLAUDE.md`.
- *(none)*

## Version history workflow
- One commit per checklist batch (A, B, C…), with messages starting `Vector Wars:`.
- A **tag** at each playable milestone (`vector-wars-v0.1` = Phase 0 as shipped).
- Bigger or riskier batches go on a branch (`vw/battles`), merged once they've been playtested.
- To undo: use GitHub Desktop's History tab → right-click a commit → **Revert changes in commit**, or ask Claude to "revert batch C" (one git command).
