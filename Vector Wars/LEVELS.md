# Vector Wars: level progression

The plan for levels: how the game teaches its mechanics, how levels are structured, and what World 1 looks like. Status: **level 1 is built as a playtest (v0.8.0, retuned in v0.9.0)**: the authored opening, then the random track ramping up linearly with a level gate every 8 pieces. The rest is planned. The roadmap entry is item 6 in `PLAN.md`; history is in `CHANGELOG.md`.

---

## 1. Lessons vs levels

There are two different lists, and they shouldn't be confused.

- **Lessons** are the mechanics the game has to teach, one idea each: shooting raises gates, red gates hurt, battles, × gates, drones, and so on. There are a dozen or more.
- **Levels** are what the player plays through. A level can teach several lessons, back to back, as long as each one lands cleanly.

The early lessons are simple and fast, so the first level packs four of them. Later lessons are bigger (a new enemy type, a new gate type) and get more room.

**How a lesson lands** (no text tutorials):
1. **Meet it safely.** It shows up where it can't hurt you, so you can watch what it does.
2. **Use it for real.** Right after, it matters: the next fight is won or lost by it.
3. **Twist it** (often in a later level): the same idea, turned around.

## 2. Structure: main levels, bonus levels, unleashed enemies

### Main levels
- Your **army carries over** from level to level, with your score.
- Each main level teaches one or more lessons and ends at a **level gate**: a full-width "LEVEL 2" finish line with a big ripple and a sound. It can't be shot or dodged.
- After it comes the **level-complete menu** (a version of the pause menu): the level's recap, the board, the army snapshot at the top, and the main button **"Go to Level 2"**.

### Bonus levels
- Every couple of main levels, the player gets a **bonus level**: a fun challenge with a **forced small army**. These are the micro-battles, where both sides are small and close in size, so every target choice matters.
- Your main army waits outside. You play the bonus with a fresh **strike team** of a set size (for example 25 units).
- The bonus ends with a **mini-boss**: a giant version of the *next* enemy type. The first one is a big triangle (a giant drone).
- **Beating the mini-boss unleashes that enemy type.** From the next main level on, it appears in squads. The game says so: **"Drones unleashed! Worth ×2 points."** New enemies are framed as a reward (more points), not a punishment.
- **The reward:** the strike team's survivors join your main army. Since the team is small, they pass through a **bonus × gate** at the end of the level that you shoot up, like any × gate, to multiply them before they join. Its cap keeps it from breaking the game (for example ×5, and never more than a quarter of your main army).

### World bosses
- Each world ends with the big boss from the roadmap (Batch D): a huge wireframe that slams the ground. Beating it earns the **bomb**.
- So there are two kinds of boss: **mini-bosses** in bonus levels (one per enemy type, unleashing it) and the **world boss** (once per world, earning the bomb).

### Pacing
- Levels get longer overall, but a short, joyful level follows each hard one.
- Bonus levels are short and intense (about 40–60s).
- Each world has its own **grid pattern** (World 1: the classic grid).

## 3. World 1

| Level | Teaches | Enemies | Length |
|---|---|---|---|
| **1** | Shooting kills enemies · shooting raises gates · where you stand is what you pump · red gates hurt, and the small one can be fixed · battles | Grunts | ~45s |
| **2** | Big army = wide army (spill off the edges) · × gates | Grunts | ~50s |
| **Bonus 1** | Target choice with a small army · first mini-boss | Grunts; **giant drone** boss | ~45s |
| **3** | Drones in squads · ÷ gates (shoot down, flip to ×) | Grunts, **drones** | ~55s |
| **4** | Split gates · moving gates | Grunts, drones | ~60s |
| **Bonus 2** | Kill the dangerous one first | Grunts, drones; **giant bomber** boss (area blasts) | ~50s |
| **5** | Bombers in squads (spread, kill them early) | + **bombers** | ~60s |
| **6** | Everything so far, longer | All so far | ~75s |
| **Bonus 3** | Focus fire | **Giant brute** boss (stomps) | ~50s |
| **7** | World finale: brutes in squads, then the **world boss** | + **brutes** | ~90s |

Beating level 7 earns the bomb, and World 2 teaches using it.

### Level 1, beat by beat
The order is fixed. The numbers are drafts, to be tuned by bot play (see section 6).

1. **A couple of opponents.** Start with about 20 units. A handful of grunts (4–6) walks in. You shoot them and they pop; the ones that reach you cost a unit or two each. This is the clearest interaction in the game, so it comes first.
2. **One green gate, +1,** half the width of the road, dead center. The track slows as you approach, so your bullets visibly tick it up: +2, +3… With a good approach it reaches about +10.
3. **An easy wave.** About 8 grunts. Winnable without thinking.
4. **Two red gates: −10 and −1.** The obvious lesson: take the −1. The hidden one: shoot the −1 and it climbs past zero, turning green.
5. **Two or three more waves,** easy enough to beat but not a breeze (about 12, 16 and 22 grunts), with a **+ pair** between them so a good player keeps growing.
6. **Level gate.**

**As built (v0.8.0 playtest, `src/levels.js`):** start 20 · 5 grunts · +1 slow gate · 8 grunts · −10 / −1 · then squads sized as a share of the best-case army (0.7, 1.0, 1.2, 1.3, 1.4) between gate pairs (+5 / +12, +8 / −6, × / +10, +15 / −20) · "LEVEL 2" gate. About 70s for a bot; a person will be slower. Bot results: careful 207 units at the gate, always taking the worse side 74 (standing behind a red gate shoots it green, so the lesson works), never steering 37. After the gate the random track ramps linearly (`CFG.RAMP_*`), with drones, bombers and brutes arriving in turn. `?classic` plays the old fully random track.

**Retuned in v0.9.0:** fire rate now starts at 25% and each level gate raises it (40%, 55%, 70%, 85%, then full from level 6; `CFG.FIRE_LEVELS`), and gates are 1.25× tougher (`CFG.GATE_DURABILITY`). Level 1 squads are now 0.3, 0.4, 0.5, 0.55, 0.6 of the best-case army. Bot results: careful 55 units at the level 2 gate (+1 gate reaches about +7); always taking the worse side dies at about 68s; never steering finishes with 6. The careful bot then grows with each fire-rate step (66 at level 4, about 1,000 at level 6) and was still alive at 5 minutes. After level 1 a level gate comes every `CFG.LEVEL_EVERY` (8) track pieces, about every 40s.

**The math we want:**
- **Careful play** (pumped gates, took the −1, shot squads before contact) ends with a substantial army, about 100–150.
- **One big mistake** (the −10 gate, or a wave that got through) still finishes, smaller.
- **Two big mistakes** add up to a loss. Failing should feel like your own math, not the game being unfair.

## 4. Making people pump gates

- **The squad after a gate is the exam.** Early gates are followed by a squad sized so that a pumped gate wins and an unpumped one struggles. Players learn it by feel.
- **A slow approach** to the first gates (level 1, fading out after), so the climbing number can't be missed.
- **Show what it earned:** the "+371" beside the count already does this. The level-complete menu adds **"Best gate: ×2.6"**.
- **A "NEW" card** at the start of a level that introduces something: the sprite and a few words ("÷ GATE · shoot it down"), for about a second, then the track takes over. *(Open: words or sprite only.)*

## 5. Open questions

1. **Merging up at level-up.** At the end of a level, the army could merge into fewer, stronger units (for example 10 units → 1 veteran with 10× damage and hp). Smaller numbers would make big armies easier to read and keep battles feeling like the micro-battles. Risks: it could break the size/width tradeoff (fewer units means a narrower army) and the gate math (+10 means less for an army of veterans). Options: automatic, a player choice ("Promote" or "Keep numbers"), or not at all. Needs its own design pass.
2. **Failing a level.** Recommended: you restart that level with the army you entered it with (a checkpoint), and the score goes back to what it was then. Alternative: the run ends, arcade style.
3. **Failing a bonus level.** Recommended: you lose only the reward; the enemy type is still unleashed (so progression can't stall), but without the "worth ×2" bonus.
4. **The leaderboard.** One option: the campaign is the run, and after the last authored level the track continues **endlessly** (today's procedural game), so the global board keeps working. Another: a separate Arcade mode.
5. **Stars per level** (finish; finish with N+ units; max a gate)? Good for replays, but they only make sense if levels can be replayed one at a time.
6. **How unleashed enemies score:** a flat ×2 for newly unleashed types, or permanently higher values.

## 6. Playtest notes (v0.9.0) and what they mean

**"It feels great, but a little easy: people pick it up fast, and dying is inconsequential."** Two separate problems:
- *Easy:* the opening teaches well, so the next levels have to ask more of the player sooner (see "boring" below).
- *Dying costs nothing:* a restart is instant and nothing is lost, so there are no stakes. The fix the user floated is a **roguelike** structure, kept casual.

**"Levels 5 and 6 started to feel boring."** Why, as built: after level 4 (brutes) nothing new arrives; the random track repeats the same gate/squad rhythm; levels are all 8 pieces long; and only the numbers grow. Each level needs to bring something new or change the rhythm.

## 7. Decisions (round 29) and World 1 as built

**From the user:**
- **Progression over upgrades.** The pick-1-of-3 upgrade idea is interesting but parked; levels themselves are the progression (fire rate up each level, new enemies, new gate types, new level shapes).
- **A continue only after damage over time arrives.** No continues for now. Once the burn enemy is introduced (its level ends World 1's successor, World 2's opener or similar), a run gets one continue from then on, since damage over time can snowball in a way the player can't fully control.
- **The burn enemy's look:** "something that feels like burning: a pulsing glow, a flicker, a smoke trail". What renders well at scale (hundreds of enemies, one draw call):
  - *Shape:* a new outline in the enemy shader, a teardrop / flame point (round bottom, pointed top), orange-red (a new `COLORS.burn`). Reads as fire even as a dot.
  - *Flicker:* per-unit brightness and a slight size jitter from `time + id` in the shader, with the color sliding orange → yellow at the peaks. Free: no extra geometry.
  - *Pulsing glow:* the same throb the bomber uses, faster and irregular (two sines).
  - *Smoke trail:* a full trail per unit is expensive. Cheap version: each burner draws one extra, dimmer, larger grey point a short way behind it (two points per unit, still one draw call), plus a few embers from the spark system sampled from 1 in ~8 burners.
  - *On your army:* burning units flicker orange in the crowd shader (the fizzle shader's cyan → red already exists) until they die or the burn ends.

**World 1 as built (v0.9.0):** each bonus mini-boss is the next enemy type, unleashed on the following main level.

| Level | Shape | New |
|---|---|---|
| 1 | authored | grunts; + / − / × gates |
| 2 | normal (8 pieces) | ÷ gates |
| 3 | **bonus** (team 25) | giant drone mini-boss |
| 4 | normal (8) | **drones**; moving gates |
| 5 | gauntlet (7, back-to-back squads) | |
| 6 | **bonus** (team 30) | giant bomber mini-boss |
| 7 | normal, longer (10) | **bombers**; split setups (both sides good) |
| 8 | sprint (8 gates, track ×1.5) | |
| 9 | **bonus** (team 35) | giant brute mini-boss |
| 10 | finale (12) | **brutes** |
| 11+ | endless | "World 1 complete" |

- **Bonus levels:** your army waits ("Army N waiting" above the count); a strike team plays small squads between kind + gates, then the mini-boss (health bar at the top, slow advance, sways; if it reaches the team, one big area hit), then a full-width bonus × gate, then the level gate. Kill the boss and the survivors rejoin your army (capped at 25% of it). Lose the whole team and the bonus ends at once: no reward, your army comes back, the run goes on.
- **Fire rate** rises at every level gate (`CFG.FIRE_LEVELS`, 25% → full by level 10).
- **World boss and bomb:** not built yet; level 10 is a long finale for now.
- **Bot run (careful):** all 11 transitions; bosses killed at levels 3, 6 and 9 (hp 28, 68, 138); army 52 → 66 → 174 → 329 → 908 → 870 by level 10.

## 8. How to build it

**Authored chunks.** A level is a list of short, hand-made pieces: "squad of 6 grunts, centered", "+1 gate, half width, slow approach", "red pair −10 / −1", "level gate". The game already builds the track from gates and squads; levels replace the random choices with these lists (`src/levels.js`). After the last level, the track can go back to random.

**Bot tuning.** The `?debug` hook can play levels headlessly with simple strategies (careful, sloppy, one mistake, two mistakes) and report the army at each beat. That's how the level 1 math gets tuned instead of guessed.

**In order:**
1. **Faster fire as a level reward** (v0.9.0): built. Later it could become a choice at the level-complete menu (fire rate, or something else).
2. **v0.8.0: levels, first pass.** The level framework and authored chunks; the level gate; the level-complete menu with "Go to Level N" and the army snapshot; levels 1 and 2; the slow gate approach; the "NEW" card.
3. **Next: bonus levels.** The strike team, mini-bosses (giant drone first), "unleashed" enemies and their scoring, the bonus × gate, levels 3–4 and bonus 1–2.
4. **Then: world boss and bomb** (Batch D), levels 5–7 and bonus 3. World 1 complete.
