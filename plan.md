# Plan: fix Solscape's broken Earth night-lights texture

## Root cause (confirmed, not speculative)

`solscape/sim/bodies-data.js` sets:

```js
export const TEX = 'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/';
```

and Earth's texture set includes `lights: 'earthlights1k.jpg'` ([bodies-data.js:77](solscape/sim/bodies-data.js:77)), used in `sim/app.js` to drive an emissive "city lights on the night side" effect ([app.js:354-367](solscape/sim/app.js:354)).

I checked all 20 texture files this base URL serves directly (`curl` against each). **19 of 20 load fine (200 OK); only `earthlights1k.jpg` 404s.** I then checked the upstream `jeromeetienne/threex.planets` repo's `images/` directory via the GitHub API — **the file simply isn't there and, as far as I can tell, never has been.** This isn't a transient CDN hiccup or something today's GA4/author-line edits touched; it's been broken since Solscape was first added.

**Impact is cosmetic, not functional.** `loadTex()` passes the same `bump()` callback as both the success *and* error handler to `THREE.TextureLoader.load()` ([app.js:224-230](solscape/sim/app.js:226)), so a failed load still resolves the loading-progress counter — the sim doesn't hang or error out. The only visible effect is that Earth's dark side renders unlit instead of showing glowing city lights.

## Fix options considered

**A. Point just this one file at a different CDN.** Fastest patch, but leaves the underlying fragility in place (see below) and means Earth's textures come from two different unrelated third-party repos.

**B. Pin the existing CDN URL to a specific commit SHA instead of `@master`.** Freezes the 19 working files against future upstream changes, but does *nothing* for `earthlights1k.jpg` — pinning can't make a file exist that was never there. Would still need option A for the missing one, ending up with three sources of truth (two repos + two pin strategies) for one planet's textures.

**C. Self-host all 20 textures in this repo (recommended).** I measured the total: the 19 currently-working files are **~3 MB combined**, and I found a working replacement for the missing one from three.js's own official examples (`threejs.org/examples/textures/planets/earth_lights_2048.png`, verified 200 OK), bringing the total to **~3.4 MB**. That's smaller than `MGP-recap.html` alone (1.7 MB) already sitting in this repo. This removes *all* runtime dependency on either external repo, for good — no more risk of any of the 20 breaking if either upstream project reorganizes, renames files, or disappears.

I'm recommending C: it's roughly the same one-time effort as A, but it fixes the actual reported bug **and** eliminates the whole class of "a third party quietly moved a file" failure for every planet, not just Earth.

## Implementation (option C)

1. Download all 20 textures once:
   - The 19 working files, from the current `cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/` URLs.
   - `earthlights1k.jpg`, from `https://threejs.org/examples/textures/planets/earth_lights_2048.png` (re-encode/rename to match the existing `earthlights1k.jpg` naming convention, or keep its own name — leaning toward keeping the existing filename so `bodies-data.js` needs a smaller diff).
2. Commit them into the repo at `solscape/sim/textures/` (new directory).
3. Update `bodies-data.js`: change `TEX` from the external CDN URL to a relative path (`'./textures/'`), so `TEX + file` resolves against the page's own origin instead of jsDelivr. No other line needs to change — every `tex: {...}` entry already just uses bare filenames.
4. ~~Double check for any texture reference beyond the 20 enumerated from `bodies-data.js`~~ — confirmed: `grep -n "TEX +" sim/app.js` shows exactly two call sites (`loadTex()` and `makeClouds()`), both already covered by the 20-file list above. Nothing else to account for.

## What I'm not doing

- Not touching the other 19 textures' *content* — only relocating them. No visual change for anything except Earth, which gains the night-lights effect it was always supposed to have.
- Not vendoring `saturnringpattern.gif`/`uranusringcolour.jpg`/`uranusringtrans.gif`/`venusmap.jpg`/`venusbump.jpg` — these appeared in the upstream repo's listing but never showed up in `bodies-data.js`'s actual texture references, so Saturn/Uranus/Venus must be using the procedural-texture fallback path ([app.js:369](solscape/sim/app.js:369)) already. Worth confirming during implementation, not assuming.

## Verification

1. Load Solscape, let the sim reach "ready" (loading overlay dismissed) — confirm no console 404s at all (currently exactly one, should become zero).
2. Rotate the view so Earth's night side faces the camera and confirm city-lights glow renders (currently absent).
3. Confirm the day side / cloud layer / bump/spec lighting look unchanged from today (regression check on the 19 relocated-but-unmodified files).
4. Confirm the loading-progress bar still behaves correctly (no hang, no early/late completion) now that all 20 textures resolve successfully instead of 19 succeeding + 1 silently failing.
5. Test on a throttled/offline-simulated connection if practical, to confirm the page truly has zero external asset requests left for `solscape/`.
