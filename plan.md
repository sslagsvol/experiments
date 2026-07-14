# Plan: author lines, index bio, MGP intro/mobile tweaks, Scoville orbit speed

## Architecture constraints (read first)

- `index.html` is plain hand-written HTML — edit directly.
- `MGP-recap.html`, `Scoville Index (Standalone).html`, and `Scoville Galaxy (Standalone).html` are **self-unpacking bundles**: page markup lives in a JSON string inside `<script type="__bundler/template">`, and the JS lives in base64(+gzip) assets inside `<script type="__bundler/manifest">`. On load the entire outer document is replaced, so nothing can be added to the outer shell — all edits must go into the template string or the manifest assets.
- Edits to bundles should be done with a small Python helper (see "Tooling" below), never by hand-editing the escaped JSON.
- Don't disturb the GA4 injection that already lives in each bundle's loader (`G-WZGPQSX3XJ`).

---

## 1. Author line on all pages — "made with ai by Slags" → index.html

A small, unobtrusive footer line on every page, linking back to `index.html`.

| Page | Where it goes |
|---|---|
| `index.html` | Footer under the nav: `made with ai by Slags` (link optional — it's already the index; can link to `#` or self) |
| `MGP-recap.html` | Intro overlay (see §3) **and** a persistent tiny line; suggested spot: bottom-right corner above the transport bar, styled with the existing `--mono` font / `--ink-faint` color so it fits the HUD look |
| `Scoville Index (Standalone).html` | Footer of the main scrollable content, matching page styling |
| `Scoville Galaxy (Standalone).html` | Bottom-right corner (opposite the MILD→REGRET legend), small uppercase mono style matching the HUD (`font-size:10px; letter-spacing:0.18em; color:rgba(190,180,240,0.55)`) |

Markup pattern (adapt styling per page):

```html
<a href="index.html" class="author-line">made with ai by Slags</a>
```

Note: link must be a plain relative `index.html` so it works both on GitHub Pages (`https://sslagsvol.github.io/experiments/`) and from `file://`.

For the bundles, inject this into the **template string** markup (body, near the end), via the tooling script.

## 2. index.html — bio + social links

Add between the `<h1>` and the experiments nav (or below the nav):

- **Short bio** — 1–3 sentences about Slags. *(⚠️ Need copy from Scott — placeholder until provided.)*
- **Social/external links** — styled as a compact horizontal row (distinct from the big experiment cards). Candidate links *(⚠️ confirm URLs)*:
  - GitHub: `https://github.com/sslagsvol`
  - X / Twitter: TBD
  - LinkedIn: TBD
  - Website / other: TBD
- Author footer line per §1.

Keep the existing minimal aesthetic (system font, #f8f7f5 background, card-style links); social links can be simple underlined text links or small pills.

## 3. MGP-recap.html (Meridian GP)

### 3a. Force the intro card on every visit

Current behavior (in manifest asset `826359f0-7527-4a21-9b8b-8258ade35094`, the MAIN playback script): `boot()` restores `{started, playT, cam, focus}` from `localStorage['meridian-gp-v1']`; when `s.started` is true it calls `UI.setIntro(false)` and skips the intro.

Change in `boot()`'s restore branch:
- Keep restoring `playT`, `focus`, `cam` (so "PLAY RECAP" resumes where the visitor left off).
- **Always** call `UI.setIntro(true)` and leave `state.started = false`, so the intro overlay shows on every page load and playback only begins on the PLAY RECAP click (or spacebar — that path already handles the not-started case).
- The existing `onIntroPlay` handler needs no changes.

This requires decoding, editing, re-gzipping, and re-base64ing that one asset in the manifest (see Tooling).

### 3b. Author line "Slags" → index.html

In the intro overlay markup (template string), under `.intro-hint`, add:

```html
<a href="index.html" class="intro-author">made with ai by Slags</a>
```

Styled in the page CSS like the hint (mono, faint, letter-spaced), with hover → `--ink`. This satisfies both the per-page author line and the intro credit. Add the persistent corner line from §1 as well.

### 3c. Mobile: hide driver names, auto-expand during highlights

Current mobile layout (`@media (max-width: 640px)`): the leaderboard is a 132px overlay on the left showing pos / bar / 3-letter driver code / gap.

Plan:
- **Collapsed state (default on mobile):** add a `lb-collapsed` class on `body` (applied on load when `matchMedia('(max-width: 640px)')` matches). CSS hides the `.lb-code` and `.lb-gap` columns and shrinks `#leaderboard` to a slim strip (~44px: position number + color bar only), so the scene isn't covered.
- **Manual toggle:** make `#lb-head` (the "CLASSIFICATION" header) a tap target that toggles the collapse, with a small ▸/▾ affordance.
- **Auto-expand on highlight:** in the UI script (`657bdf27-…` asset), `updateCaption()` already detects when a highlight event becomes active (`active !== lastCaption && active`). At that moment, if collapsed and on mobile: remove `lb-collapsed`, and when the caption window ends (`active === null` transition), restore the collapsed state after a short delay (~1s). Track whether the collapse was user-chosen so auto-expand doesn't fight a user who explicitly opened it.
- Desktop behavior unchanged (collapse CSS lives entirely inside the mobile media query; the JS class is inert on desktop).

Edits touch: template CSS + `#lb-head` markup (template string), and the UI asset `657bdf27-39ab-483f-a85c-048667f5e201`.

## 4. Scoville Galaxy — slow the planets in "Orbits" and "Giants"

Component code lives in the template string of `Scoville Galaxy (Standalone).html` (inline `<script type="text/x-dc">` — plain text inside the JSON, editable directly with the tooling script).

Two motion sources:

1. **Orbital revolution (Orbits/`solar` mode only):**
   ```js
   const speed = 0.05 + t * t * 0.42;
   const a = i * 2.39996 + now * 0.001 * speed;
   ```
   Slow to roughly a third, e.g. `now * 0.00035 * speed` (or reduce the `speed` coefficients). Pick a value that still reads as motion but is calm.

2. **Global auto-rotation (all modes):** in `tick()`:
   ```js
   if (!this.dragging && auto) this.rotY += 0.0022;
   ```
   Make it mode-aware — keep `0.0022` for Helix, drop to ~`0.0008` when `this.state.mode` is `'solar'` or `'mass'` (Giants), since Giants has no per-planet motion and its "spin" is entirely this auto-rotate.

Note: `Scoville Index (Standalone).html` has no orbits/giants view — only the Galaxy page changes for this item (plus its author line per §1).

## 5. index.html — animated mini-vignette previews on the experiment cards

**Decision: hand-built CSS/SVG vignettes** (live iframes ruled out — MGP alone is a 1.7 MB bundle unpacking ~5 MB of JS + WebGL; video loops ruled out — binary assets + a re-capture pipeline). Each vignette is a tiny inline SVG/CSS animation *evoking* its experiment, added inside the existing `<a>` cards. Everything stays inline in `index.html` — no external assets, target ≤ ~10 KB added total.

### Card structure

Each nav card becomes a preview banner + label, still a single plain `<a>` (tap target unchanged):

```html
<a href="MGP-recap.html" class="card">
  <div class="vignette vignette-mgp" aria-hidden="true">…inline svg…</div>
  <div class="card-label">Meridian GP <span class="card-sub">3D race recap</span></div>
</a>
```

- `.vignette`: fixed aspect ratio (~5:2, e.g. `aspect-ratio: 5 / 2`), `border-radius` top corners, `overflow: hidden`. Full card width on mobile (~345×138 at 375px viewport).
- `.card-label`: keeps the current card typography; optional one-line subtitle in a lighter weight.
- The vignette is purely decorative: `aria-hidden="true"`, no pointer events, card's accessible name comes from the label text.

### Vignette 1 — Meridian GP (dark HUD miniature)

- Background `#070707` matching the page.
- A closed SVG `<path>` track outline (rounded irregular circuit, ~1.5px stroke, `rgba(232,230,225,0.25)`), plus a short brighter dash for a start/finish mark.
- **3 car dots** (3px circles): one accent red `#ff2a1e`, two dim gray, each animated around the circuit with `offset-path: path('…')` (same path string as the track), `offset-distance` keyframed 0→100%. Different durations (~6s / 6.7s / 7.5s, linear, infinite) so gaps open and close like a race.
- HUD garnish, top-left, IBM-Plex-Mono-ish (`ui-monospace`): tiny `LAP 07/45` text at 9–10px, letter-spaced, `#65635e`. Static text (no JS ticker).
- Fallback: browsers without `offset-path` (~all modern ones have it) show the static track + dots via `@supports not (offset-path: path(""))` placing dots at fixed points on the line. Acceptable degradation.

### Vignette 2 — Scoville (heat galaxy miniature)

- Background: the galaxy radial gradient, `radial-gradient(120% 160% at 68% 28%, #170B33 0%, #0B0518 55%, #07030F 100%)`.
- **6 glowing orbs** sized 4–14px, colored along the heat ramp (`#38BDF8`, `#818CF8`, `#E879F9`, `#FB7185`, `#FDBA74`); glow via `box-shadow: 0 0 12px 2px <color at ~55% alpha>` (cheaper than SVG filters).
- Motion: each orb on its own slow elliptical drift — a CSS keyframe translating along a small loop (two nested elements: outer rotates, inner is offset — gives circular orbits with zero JS), durations 8–16s so the composition never visibly repeats. Biggest/hottest orb near center, echoing "hotter orbits closer."
- ~12 static 1px "stars" as a `background-image` of tiny radial-gradients (no extra elements).
- Garnish: the MILD→REGRET gradient strip (40px wide, 3px tall) bottom-left, and `SCOVILLE³` wordmark top-left in the page's gradient text style, 10px.

### Motion gating (shared, ~15 lines of JS)

Animations are CSS-only; the JS just gates play state:

```js
const io = new IntersectionObserver(entries =>
  entries.forEach(e => e.target.classList.toggle('animate', e.isIntersecting)),
  { threshold: 0.2 });
document.querySelectorAll('.vignette').forEach(v => io.observe(v));
document.addEventListener('visibilitychange', () =>
  document.body.classList.toggle('page-hidden', document.hidden));
```

- CSS: animations declared with `animation-play-state: paused`; `.vignette.animate` (and not `body.page-hidden`) flips them to `running`.
- `@media (prefers-reduced-motion: reduce)`: `animation: none` — vignettes render as attractive static compositions (they're designed to look complete when frozen).
- No `requestAnimationFrame`, no canvas — compositor-only transforms/offset-path, so scrolling stays smooth on phones.

### Layout notes

- Mobile-first: cards stay stacked full-width; vignette on top, label below (current padding preserved on the label row).
- Desktop (`min-width: 640px`): optionally show the two cards side by side in a 2-column grid so the banners don't get comically wide; label row unchanged.
- Card hover/active states (existing border/background transitions) still apply to the whole card.
- The author line + bio from §1–2 sit outside the cards and are unaffected.

## Tooling: bundle edit helper

Write a throwaway script (scratchpad is fine, or `tools/bundle_edit.py` if we want it in-repo) that can:

1. **Template edits:** parse the `__bundler/template` JSON string → apply string replacements on the decoded HTML → re-serialize with `json.dumps` → splice back into the file.
2. **Asset edits (MGP JS):** parse the manifest JSON → base64-decode + gunzip target asset → apply edit → re-gzip + base64 → write back.

Verify round-trip integrity by re-decoding after write.

## Verification

1. Serve locally (`python3 -m http.server`) and open each page — also spot-check one page via `file://` since the bundles support it.
2. `index.html`: bio + social links render, author line present, GA still fires.
   - Vignettes: MGP dots lap the track, Scoville orbs drift; animations pause when scrolled offscreen (check via DevTools) and freeze under emulated `prefers-reduced-motion`; cards still navigate on tap; page stays a single file with no new network requests; smooth scrolling on a ~375px viewport.
3. MGP: intro shows on first visit **and** on reload mid-race (with position preserved after PLAY); author links navigate to index; on a ~375px viewport the leaderboard is collapsed, expands automatically when a caption highlight fires, re-collapses after; manual toggle works.
4. Scoville Galaxy: Helix unchanged; Orbits planets revolve noticeably slower; Giants rotates slower; drag/zoom/click still work; author line links back to index.
5. Scoville Index: author line present, page otherwise unchanged.
6. Check the browser console for bundle-loader errors on every page (the loader surfaces them in a red toast).

## Open questions for Scott

1. **Bio copy** — what should the index bio say?
2. **Social links** — which platforms + URLs? (GitHub `sslagsvol` assumed; X/LinkedIn/other TBD.)
3. MGP author line: OK to show it both on the intro card and as a persistent corner line, or intro card only?
