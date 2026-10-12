# Vector Wars: levels

How Story mode is put together: the design principles, World 1 as built (v0.13), the level shapes, and what grows from level to level. Tuning lives in `src/config.js` and `src/levels.js`; the round-by-round history (every playtest note and why things changed) is in `CHANGELOG.md`. What's next is in `PLAN.md` section 4.

---

## 1. Design principles

**Lessons vs levels.** Lessons are the mechanics the game teaches, one idea each (shooting raises gates, red gates hurt, × gates, drones…). Levels are what the player plays through; a level can teach several lessons back to back, as long as each lands cleanly. Level 1 packs the simple ones; later lessons (a new enemy, a new gate type) get more room.

**How a lesson lands** (no text tutorials):
1. **Meet it safely:** it appears where it can't hurt you, so you can watch what it does.
2. **Use it for real:** right after, it matters: the next fight is won or lost by it.
3. **Twist it** (often in a later level): the same idea, turned around.

**Making people pump gates.** The squad after a gate is the exam: it's sized against the army you'd have from the best side of every gate before it, so a pumped gate wins and a skipped one struggles. Gains show live beside the army count ("+371").

**Pacing.** A really good run lasts a few minutes, not ten. Each level brings something new or changes the rhythm (levels 5–6 felt boring when nothing new arrived). A short, joyful level follows a hard one; the sprint (level 8) is a favorite, so keep that shape around.

**Rules settled by the user:**
- **Progression over upgrades:** levels are the progression (fire rate, enemies, gate types, shapes, power-ups); no pick-1-of-3 menus.
- **No level-complete screen:** levels flow straight into the next.
- **New enemies are framed as a level-up,** never as a punishment: the army "condenses" ("Army level up"), then "New enemy:" over its sprite (no name).
- **One extra life per run,** only on mini-boss levels; a mini-boss's touch is game over regardless.

## 2. Level shapes

| Shape | What it is | Levels |
|---|---|---|
| **Authored** | Hand-placed beats (`LEVEL_1` in `src/levels.js`) | 1 |
| **Normal** | Gates and squads in the pattern `gegeggee`, ending in a level guard | 3, 9, endless |
| **Gauntlet** | Squads back to back (`eeegee`), few gates, ending in a level guard | 7, every third endless level |
| **Sprint** | Gates only, track ×1.5 | 8 |
| **Sprint into gauntlet** | 8 gates at ×1.5, a calm stretch at normal speed, then four escalating waves sized against the best case through the level's gates: get the gates wrong and you won't make it | 5 |
| **New-enemy level** | The army condenses into a small strike team; small + gates, two squads each with a cluster of the coming type behind a grunt wall, then the mini-boss, a bonus × gate, and back to your army | 2, 4, 6 |

**Level guards:** every normal and gauntlet level ends with a full-strength squad (0.8× the best-case army, `LEVEL_GUARD_THREAT`) behind a grunt wall, in front of the level gate. Once shields exist, the guard's specialists bring a shield line.

**Mini-boss fights** (details in `PLAN.md` section 3): the boss waits behind a shielding escort, the gates ahead shatter, then it comes in its own way (drone circles and darts; bomber hops with landing shockwaves; brute sways and stomps), spews small units, burns close units (a fire ring warns) and ends the run on contact. Reinforcement gates rush in at each 25% of its hp lost and when a spew wave is shot down. Kill it: the survivors rejoin your army (up to 25% of it or 20 units, whichever is more), and both power-ups refill.

## 3. World 1 as built

| Level | Shape | What's new |
|---|---|---|
| **1** | Authored, ~30s | Grunts; + / − / ÷ / × gates; ends in a guard (waves) |
| **2** | New enemy (team 30) | **Giant drone** |
| **3** | Normal (6 pieces) | **Drones** and **shields** join squads; ÷ and moving gates; **focus fire** unlocks |
| **4** | New enemy (team 35) | **Giant bomber** |
| **5** | Sprint into gauntlet | **Bombers** join squads; split gates; **bomb** unlocks; the finale's bombers come behind a double shield row |
| **6** | New enemy (team 55) | **Giant brute** (its own brutes and the clusters arrive shell-less: no fire) |
| **7** | Gauntlet (6) | **Brutes** join squads (burning); **formation combos** start (bombers behind shields, brutes behind a grunt wall) |
| **8** | Sprint (8 gates, ×1.5) | Pure gate pumping |
| **9** | Normal (8) | **Bullet enemies**; shields' middle row |
| **10+** | Endless | "World 1 complete", **Challenge unlocks**; squads ×1.3 a level, track +5% a level (to ×1.4), every third level a gauntlet (12, 15, 18…) |

### Level 1, beat by beat (`LEVEL_1`)
Start with 20 units. A gate sits 5 units behind each squad; each squad stays 14 past the gate before it, so you're through a gate before the next squad charges (gates soak up bullets).
1. **5 grunts:** the clearest interaction in the game comes first.
2. **+1 gate,** half the road, dead center: shooting it ticks it up.
3. **8 grunts:** an easy wave.
4. **−10 / −1:** take the −1, or shoot it green.
5. **Wall** (0.35× the best-case army), then **+5 / +12:** where you stand is what you pump.
6. **Skirmish** (0.45×), then **+8 / ÷2:** the first ÷ gate (shoot it down and it flips to ×).
7. **Wedge** (0.55×), then **× / +10:** the first × gate.
8. **Waves** (0.8×): the end-of-level skill check, then the "LEVEL 2" gate.

## 4. What grows per level

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10+ |
|---|---|---|---|---|---|---|---|---|---|---|
| **Difficulty** (`LEVEL_DIFFICULTY`) | 1.35 | 1.5 | 1.6 | 1.6 | 1.6 | 1.6 | 1.6 | 1.55 | 1.45 | 1.4 (× endless growth) |
| **Fire rate** (`FIRE_LEVELS`) | 30% | 45% | 65% | 78% | 90% | 100% | → | → | → | → |
| **Gate toughness** | 1.25× | +12% a level past the 1st, capped at 2.2× | | | | | | | | |
| **Shields** | — | — | 1 row | | 2 rows | | | | + middle row | at most 8 a squad |

Difficulty scales squad sizes, grunt walls, clusters and mini-boss hp. Clearing a level is worth 5,000 × the level cleared (`LEVEL_BONUS`). All of these have sliders in the debug panel's **Per level (story)** section.

## 5. Challenge mode, compared

No authored levels: the classic random track, every enemy from the second squad (shields after 8 gates, bullets after 14), a speed ramp (×1.25 +0.04 a gate, to ×3), capped gate values and squad growth after the 15th gate. Every 8 gates passed is a level (banner, 5,000 × level bonus, gate toughness). Both power-ups from the start. It uses `DIFFICULTY` (1.6) instead of the per-level table, and shares the one leaderboard with Story.

## 6. Open questions

1. **Merging up at level-up:** the army could merge into fewer, stronger units at a level gate (10 → 1 veteran), keeping big armies readable. Risks: the size/width tradeoff and the gate math. Needs its own design pass.
2. **World 2:** its lessons, grid pattern and new enemies, after the world boss exists.
3. **A "NEW" card** for new gate types (sprite plus a few words for a second), like "New enemy:" does for enemies.
4. **Stars per level:** only worth it if levels can be replayed one at a time.

## 7. How levels are built

- **Definitions:** `LEVEL_1` is a list of beats (`squad`, `pair`, `single`, `levelGate`, each a `gap` after the last). Levels 2+ are short descriptions in `LEVELS` (`kind`, `pieces`, `team`, `boss`, `speed`, gate types allowed, `finale` waves); `levelDef(n)` falls back to endless past 9.
- **Testing:** `?debug&level=N` starts just before level N's gate; the debug panel's Next level / Go to level skip around; the `window.vectorWars` hook (`step`, `steer`, `lose`, `world`) drives the sim without `requestAnimationFrame`, which is how bots measure levels.
