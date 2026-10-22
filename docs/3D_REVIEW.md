# 3D product viewer: design notes for Codex's critique (Claude, 2026-10-22)

The user asked you to critique the 3D generation; please append your review below "## Updates since writing (Claude)
- Variants from the title: "inclined NN°" leans the glass row outboard by that angle; "curved/faceted/shaped" lays panels on a faceted arc.
- Panel spacing uses the analysis module width (param labelled INTERASSE) when present, else ~1.3 m.
- Camera now targets the product (deck edge / superstructure / mid-deck) instead of the deck centre.
- Materials: steel/aluminium lower metalness (no env map) and glass as transparent standard material.

## Codex review" and I'll answer point by point.

## What it does
- `frontend/src/components/Product3D.tsx` (three.js 0.180 + OrbitControls), opened from "View in 3D on a cruise deck" on the product page.
- **Parametric, not CAD:** geometry is built from the product's typology (`typologyOf`) and dimensions (L × H in mm, falling back to typical sizes per typology), so a customized spec (pencil edits on the product page) changes the model.
- Typologies: windscreen (glass panels + posts + bottom rail), balustrade (glass + posts + handrail), handrail (tubes on posts), divider (framed glass panel across the balcony), sliding door (frame + two leaves in the superstructure), prefab balcony (platform + teak + glass balustrade + side panels), flooring (teak planks), other (plain slab).
- Scene: teak deck with plank lines, white superstructure with windows, sea plane with fog, two loungers for scale, dimension line; or a "Product only" studio floor. Auto-rotates until the user drags; respects prefers-reduced-motion; disposes geometries/materials on close.

## My own critique (known weaknesses)
1. **Fidelity:** shapes are generic boxes; no profiles, glass clamps, curved/faceted/inclined variants (e.g. "H2200 inclined 35°", "curved as faceted elements") even though the title often says so.
2. **Panel count** is a heuristic (`round(L / 1.3 m)`), not the real module spacing from the analysis (e.g. N3 "interasse" for balconies).
3. **Materials:** no environment map, so metals look flat and glass is a plain transparent material (I dropped MeshPhysical transmission because it rendered brown without an env map).
4. **Dimensions semantics:** `H` means height for windscreens/balustrades but depth for balconies/flooring; the code clamps depth to 3–4 m.
5. **Bundle size:** fixed after writing this: `Product3D` is now lazy-loaded (main bundle 947 kB -> 436 kB; three.js chunk 513 kB loads on open).
6. **No tests** for the component (WebGL in jsdom is not available).

## Questions for you
- Worth lazy-loading `Product3D` with `React.lazy` to keep three.js out of the main bundle?
- Better way to derive panel spacing / variants (curved, inclined) from the catalog data we already have?
- Any correctness or leak issue you see in the effect cleanup?

## Updates since writing (Claude)
- Variants from the title: "inclined NN°" leans the glass row outboard by that angle; "curved/faceted/shaped" lays panels on a faceted arc.
- Panel spacing uses the analysis module width (param labelled INTERASSE) when present, else ~1.3 m.
- Camera now targets the product (deck edge / superstructure / mid-deck) instead of the deck centre.
- Materials: steel/aluminium lower metalness (no env map) and glass as transparent standard material.

## Codex review
