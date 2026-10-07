# Vector Wars: design and build plan

A crowd-runner in the style of the "army through gates" mobile ads, redesigned around the things those games get wrong: fake choices, hidden numbers, no skill expression, and art that buries the numbers. One thumb, thousands of units, 60fps on a mid-range phone.

**Play it:** `index.html` (add `?debug` for an FPS/unit overlay, `?units=1000` to stress-test, `?seed=42` for a different track).

**Style guide:** `style-guide.html` shows every color, type style, element, formation and animation. Any visual or animation change must update it (see `CLAUDE.md`).

---

## 1. Why the ad games frustrate, and the fix for each

| What frustrates | Why it happens | What we do instead |
|---|---|---|
| Choices are fake: "+5 or ×3" has an obvious answer | Gates are tuned for ads, not decisions | **No gate pair has a clearly better option.** Shooting, gate order and the hazards around each gate make both sides worth considering. |
| The ad and the real game are different games | Bait for installs | The ad *is* the game. |
| You lose and don't know why | Hidden numbers, unclear collisions | **Honest numbers.** Enemy counts show from far away. The death recap breaks down where you lost units. |
| No skill: the result depends only on which gate you picked | Passive auto-runner | **Shooting adds skill.** Where you aim your fire and for how long changes the result. |
| Waiting around: slow-motion, popups, forced ads | Monetization pressure | Restarting takes under a second. No interruptions during a run. |
| The finale is passive | The crowd just walks into the castle | The finale is an active boss fight where aim and crowd size both count. |

## 2. Design pillars

1. **One thumb, always readable.** Anything that needs a second gesture or a long read is cut.
2. **Every gate is a real decision.** If playtesters always pick the same side, the gate is a bug.
3. **The crowd is both your health bar and your weapon.** More units means more firepower, but also a wider body that's harder to steer around hazards.
4. **60fps with 2,000+ units on a mid-range phone.** A feature, not a polish item.
5. **Fail fast, understand why, retry instantly.**

## 3. Core mechanics

### Control: relative drag
- The army moves by the **finger's movement**, not to where the finger is, so the thumb never covers the action.
- The army follows its target through a critically damped spring (~80ms) so it feels connected but not twitchy. No inertia after release.
- Default: dragging across 60% of the screen width moves the army across the full track (`CFG.DRAG_SPAN`). A sensitivity setting comes later.

### Auto-fire: the core addition
- The front rank fires forward constantly. Fire rate grows with **√(army size)**, so bullet count stays bounded.
- **Shooting a gate changes its value:**
  - Additive gates go up by 1 per hit: −20 → −5 → +10. You can rescue a bad gate.
  - Multiplier gates fill a charge bar: ×2 → ×3 at 100%.
  - *(Planned)* Locked gates need N hits to open at all.
- **The central tension:** fire spent on gates is fire not spent on the enemy squad coming next.

### Track elements
| Element | What it tests | Status |
|---|---|---|
| Gate pairs (+, −, ×) | Reading values and planning | Built |
| Enemy squads (numbers shown) | Losses traded one for one, softened first by your fire | Built |
| ÷ gates, order-of-operations runs | Light math mastery | Planned |
| Saws, rollers, spike strips | Steering a wide crowd | Planned |
| Crates and barrels to shoot | Weapon upgrades for that run (spread, pierce, fire rate) | Planned |
| Narrow bridges | The crowd squeezes into a line, and units that hang off the edge fall | Planned |
| Finale boss | Aim at weak points. Damage comes from surviving army plus weapon level. | Planned |

### Scoring
- 1 to 3 stars based on surviving army count and boss time.
- **Every level can be beaten with zero meta upgrades by a skilled player.** Upgrades are a cushion, not a gate.

## 4. Level progression

Levels last 30 to 60 seconds. Each world teaches **one** idea, then twists it. Difficulty rises in a sawtooth: hard, easy "power fantasy", harder.

| World | Levels | New idea | Twist by the end |
|---|---|---|---|
| 1. Basics | 1–8 | Steering, simple gates | Shooting gates to raise them |
| 2. Rescue | 9–16 | Negative gates you can shoot positive | Locked gates: charge one, or take the free gate? |
| 3. Hazards | 17–24 | Saws and rollers | A big army is harder to steer, so is the ×3 worth it? |
| 4. Contact | 25–32 | Enemy squads, crates | Fire on the enemies or on the gate? |
| 5. Math | 33–40 | Order-of-operations runs, ÷ gates | Moving gates |
| 6. Return fire | 41–50 | Enemies that shoot back | Everything combined |

- **Boss every 10 levels**, each built around that world's mechanic.
- **Meta progression:** coins buy small permanent upgrades with diminishing returns.
- **Daily seeded challenge:** the same level for everyone, compared on a leaderboard. No stamina timers.

### How levels get built
- Levels are assembled from hand-authored **chunks** (gate pair, saw corridor, enemy wave) stored as JSON, plus difficulty settings.
- **Automated level validator:** a headless simulator plays every level with bot strategies (always left, always right, greedy, optimal). It flags levels that can't be beaten, and gates where one option is always better. The `?debug` step hook (`window.vectorWars.step()`) is the first piece of this.

## 5. Art direction: "vector arcade"

Chosen from four options (see `concepts/art-directions.html`). Inspired by Geometry Wars, Defcon, neon arcades and old vector displays.

| Reference | What we take |
|---|---|
| Geometry Wars | Enemies are **outlined shapes, never filled**. Deaths burst into line sparks. Dense crowds glow white-hot. |
| Defcon | **One color per team** on a dark blue-black map, like a tactical display, with labels floating next to units. |
| Neon arcade | Warm neon (yellow, pink) for **things you interact with**: gates, pickups, UI. |
| Hyperspace streaks | **A sense of speed**: track lines streaking toward you, star streaks on big multipliers. |
| GW warping grid | **The grid reacts to events**, rippling out from gate passes and explosions. |

### Color rules (fixed, so players learn them)
- **Cyan / white:** you. **Magenta:** enemies and anything that hurts you.
- **Green:** add gates. **Red-pink:** subtract gates. **Gold:** multipliers and pickups.
- **Electric blue:** the world (grid, rails), always dimmer than anything interactive.
- **Lime:** HUD text, in a vector-display font (Share Tech Mono; titles in Audiowide).
- Bloom is tuned so **gate numbers stay readable**: only HDR elements (> ~0.55 luminance) glow.

### Voxel-style destruction without the unit cap
The swarm stays as points of light so it scales. **Large objects shatter like voxels:** enemy walls, barricades, gate frames and bosses are wireframe cubes that break into tumbling glowing segments. There are only ever a handful on screen, so they can be as detailed as we like.

## 6. Tech architecture

**Stack:** plain ES modules plus Three.js r170 from a CDN via an import map. **No build step**, so the folder deploys to GitHub Pages as-is. It can move to Vite + TypeScript and be wrapped with Capacitor for app stores if it grows.

| File | Responsibility |
|---|---|
| `src/config.js` | Every tunable and the HDR palette, plus seeded RNG |
| `src/world.js` | Renderer, camera fit, bloom, the warping grid floor shader, rails, horizon, stars |
| `src/crowd.js` | Player swarm and enemy squads, one `THREE.Points` draw call each |
| `src/gates.js` | Gate panels (SDF border shader plus a canvas-texture label), squad count labels, pools |
| `src/fx.js` | Bullets (one `LineSegments`) and sparks (one `Points`) |
| `src/input.js` | Relative drag, scroll/zoom/long-press blocking |
| `src/hud.js` | DOM HUD (distance, best, projected army count, recap) |
| `src/main.js` | Rules, track generation, loop, adaptive quality, debug hook |

### Performance design
| Problem | Solution |
|---|---|
| Drawing thousands of units | One `Points` draw call per team with a custom glow/diamond sprite shader |
| Crowd simulation | No boids. Units spring toward slots in one of six formation patterns (`src/formations.js`). O(N). |
| Memory churn | Preallocated typed arrays for units, bullets and sparks. No per-frame allocation in hot loops. |
| Very large armies | The track holds at most 1,200 units (`CFG.CAPACITY`); overflow falls off the edges, so every dot is exactly one unit. |
| Crowd-vs-crowd fights | Losses traded 1:1 along the contact line, with sparks |
| Bullets | Bounded fire rate (≤ 50/s), one line-segment draw call, a 1D sweep test against gates and squads |
| Gate text | Canvas texture redrawn only when the value changes |
| Frame pacing | Clamped variable dt (fixed timestep planned for the validator), DPR capped at 2, adaptive resolution drop when frames run > 19ms |

**Measured (Phase 0, desktop):** 24,000 units (4,000 drawn) plus gates and squads run at about 0.9ms of CPU per frame, with about 30 draw calls. Still to do: profile on a real iPhone 11 / Pixel 6a.

**Mobile details:** `touch-action: none`, pull-to-refresh and pinch blocked, safe-area insets, auto-pause when hidden. `navigator.vibrate` haptics on Android only; iOS needs the Capacitor wrapper.

## 7. Build phases

| Phase | Deliverable | "Done" means | Status |
|---|---|---|---|
| **0. Toy** | Running crowd, drag control, instanced rendering, bloom, warping grid; gates, shooting and squads as a bonus | 60fps on a real phone, and steering feels good with no goal | **Built.** Needs on-device testing. |
| **1. Core loop** | Hazards, ÷ gates, locked gates, finale boss, 5 hand-made levels | You want to replay level 3 to beat your score | Next |
| **2. Content pipeline** | Chunk JSON, level validator, 30 levels, juice pass, sound | Testers make different gate choices | |
| **3. Meta and polish** | Coins, upgrades, stars, save data, settings, PWA install | A full session loop works | |
| **4. Ship and tune** | Analytics, daily challenge, Capacitor builds | Decisions come from data | |

**Most important rule:** the crowd has to feel good to steer on a real phone before anything else is built.

## 8. Open decisions

1. **Platform:** web/PWA first, Capacitor later. *(Leaning yes.)*
2. **Monetization (if any):** cosmetics plus optional "double coins". Never pay-to-win, never interrupt a run.
3. **Audio direction:** synthwave or chiptune, with bullets pulsing to the beat.
