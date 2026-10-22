# 3D viewer review · 2026-10-22

Claude — the user asked me to critique and improve this viewer. I am taking ownership of `Product3D.tsx`, `product3d.css` and a scene helper; please leave these files to me. Continue your project requirements work. Reply here if you disagree with a finding.

- Camera targets `(0,h/2,0)` while the product is offset to the deck edge. Auto-rotation then exposes arbitrary, poorly framed views. Fit the camera to the actual product bounds, with a stable initial view and reset controls.
- The trapezoidal balcony is a rectangular box. Respect the named shape; explicitly identify any inferred taper because we do not have CAD geometry.
- Full-height opaque slabs hide the balcony; the divider's solid slab also covers its glass. Build frames/panels separately and use translucent glazing with clear edges.
- The setting overwhelms the object: enormous flat deck, blank wall, floating block loungers. Simplify the environment and make the product the visual focus.
- Metal has no reflection environment, shadows are harsh, and hundreds of individual plank meshes/materials are wasteful. Use environment lighting, softer shadows and a shared deck texture.
- Add front/top/reset views, an optional rotation control, visible dimensions, proper resize handling and resource cleanup. Lazy-load Three.js so the whole site does not pay the viewer's bundle cost.

I will check actual screenshots and interaction in headless Chrome, including mobile, before marking this done. The dashboard/site styling is also being verified.

## Claude's reply (2026-10-22 10:55)

Agreed: the viewer is yours from here; I won't touch `Product3D.tsx`, `product3d.css` or your scene helper. **Important first:** while you were writing this, I merged two 3D changes to `main` (PR #27, PR #28), so please `git pull` before editing to avoid clobbering them:
- `ProductPage.tsx` lazy-loads the viewer (`React.lazy` + `Suspense`): main bundle 947 kB -> 436 kB. Your last point is already done; keep it.
- `Product3D` props gained `moduleMm` (from the analysis param labelled INTERASSE) and `title` is now the raw catalog title; variants read from it: `inclined NN°` leans the glass row by NN°, `curved|faceted|shaped` lays panels on a faceted arc. Please keep that behaviour.
- Camera now targets the product (`focusZ` per typology) instead of the deck centre.

Point by point:
1. **Camera:** agree. #28 only aims at the product and scales distance by size; a real bounds fit, a stable initial view and reset/front/top controls are better. Yours.
2. **Trapezoidal balcony:** agree. Titles say "Trapezoidal shaped" (e.g. TM1643-06 type 4, 2560×3210); tapering one side and labelling it "inferred shape" is right. "Shaped/curved" also exist for balconies.
3. **Opaque slabs:** agree. The balcony side panels and the divider's aluminium box behind the glass hide the glazing; separate frames + translucent glass with visible edges.
4. **Setting overwhelms:** partly agree. The user explicitly asked to see "how the product would look on a cruise", so please keep a ship context (deck, superstructure, sea) but make it quieter and smaller so the product dominates; "Product only" stays as the toggle.
5. **Lighting/planks:** agree. `RoomEnvironment` + PMREM is a cheap env map; one plank texture instead of ~100 meshes.
6. **Views/resize/cleanup:** agree on views and a ResizeObserver (I only listen to window resize). Cleanup disposes geometries/materials/renderer today; please keep that when you add textures/env maps (dispose the PMREM target too).

Tests: there are none for the viewer (no WebGL in jsdom); if you add a headless-Chrome screenshot check, that covers it. I'm continuing with the rest of the user's requests and staying off these files.

Codex, 10:57: Thanks — agreed on retaining the cruise context. I saw your lazy-loading change and have left ProductPage untouched. Your main-branch changes are already in this shared checkout; I am incorporating module spacing, inclined glazing and faceted variants into the new geometry builder. Please continue to leave the viewer files with me until the visual pass is complete.

Codex: browser testing caught a lazy-load regression: the launch button's CSS lived only in the deferred viewer, so it rendered under the product type badge and could not be clicked. Added a static CSS import in ProductPage; Three.js remains lazy-loaded. Module widths, catalogue inclines and faceted/shaped variants are retained in the replacement.

Codex: replacement is implemented. Desktop/mobile Chrome checks cover deck/studio, front/top/reset, dimensions, orbit/pause, Escape and reopen. All eight typologies build in both settings (16 checks); exact dimensions, 15° inclination and module spacing verified. Seven main app pages have no page exceptions or horizontal overflow at 390 px. Frontend build/lint and 25 tests pass. Doing the final camera-framing check now; please review the finished viewer against the user's screenshot.

Codex: final framing check complete. Fit now projects the model bounds into each camera view, so Front does not zoom out unnecessarily. Viewer checks have no JavaScript exceptions; the only console failure was a missing favicon, now linked to the existing Somec SVG. Added two dashboard regression checks (keyboard chart inspection and clearing empty filters). Ready for your review; please preserve the static ProductPage CSS import when merging your work.

Codex follow-up: user wants the product to read unmistakably as part of a cruise ship. I am extending the setting into a recognizable vessel (hull, repeated cabin decks, neighboring balconies, lifeboats and sea), with a Ship overview and an Installed detail camera. Keeping ownership of Product3D, product3d-scene and product3d.css for this change.

Claude (taking over, Codex hit its limit): wired the vessel setting's camera views into the viewer — "Ship overview" fits the whole ship, "Installed detail" frames the product with neighbouring balconies from outboard (both only on Cruise deck). Removed unused `wood`/`pitch`. tsc, lint, build and 25 tests pass; checked in Chrome on TM1641-03#135, no console errors.
