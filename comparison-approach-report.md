# Map Comparison Approaches – Analysis Report

## Status Of Current Implementation

- Attempted to replace the plugin-based solution with a custom MapLibre swipe flow.
- Changes introduced a second MapLibre instance, synchronized camera state, and a custom slider.
- Result: implementation is currently broken; comparison view does not render reliably (synchronization stalls before the slider is initialized).
- Pending work: revisit the startup sequencing and overall architecture; evaluate alternative approach.

## MapLibre Dual-Map Swipe (Current Attempt)

| Aspect | Notes |
| --- | --- |
| Rendering model | Two MapLibre maps stacked; top map clipped via CSS. |
| Interactions | Main map handles user input; comparison map follows via `jumpTo`. |
| Layer pipeline reuse | Full reuse of existing GeoServer/GeoJSON logic (no porting). |
| Dependencies | No new runtime deps beyond current MapLibre stack. |
| Complexity | Moderate; slider/synchronisation logic custom-built. |
| Performance considerations | Two WebGL contexts; prone to synchronization race conditions. |
| Current issues | Awaited map load prevents slider setup; comparison map remains blank. |

## Deck.gl Overlay Pattern (from `deckgl-implementation-for-comparison.md`)

| Aspect | Notes |
| --- | --- |
| Rendering model | Single MapLibre base map with Deck.gl overlay sharing container. |
| Interactions | Deck.gl (`controller: true`) controls pan/zoom/rotate; MapLibre mirrors camera. |
| Layer support | Deck.gl layers (TileLayer, BitmapLayer, etc.). Existing MapLibre layers would need to be reimplemented. |
| Dependencies | Requires `@deck.gl/core`, `@deck.gl/layers`, plus integration glue. |
| Visualization capability | High – leverage GPU shaders, large datasets, advanced rendering. |
| Swipe implementation | CSS clip-path on Deck canvas (no second map instance). |
| Cleanup & lifecycle | Must call `deck.finalize()`; manage Deck canvas stacking over MapLibre. |
| Feasibility | Higher initial effort; opens door for analytic overlays and richer visuals. |

## Summary Of Work So Far

1. Removed the previous `@maplibre/maplibre-gl-compare` dependency.
2. Added a `MapSwipeController` helper, layer payload builders, and comparison store updates to work entirely inside MapLibre.
3. Refactored raster/vector layer cards to use the new comparison flow.
4. Result is not functional; synchronization fails before slider creation.

## Recommendation

- **Short-term**: roll back or disable the broken dual-MapLibre implementation; reassess requirements for comparison mode.
- **Forward-looking**: evaluate the Deck.gl overlay pattern if we anticipate GPU-heavy analytics or need a more flexible visualization stack. It avoids running two MapLibre contexts and leverages Deck.gl’s strengths, albeit with a higher adoption cost.
- **Next steps**: clean up the current branch, produce a proof-of-concept for Deck.gl overlay (separate spike), and compare effort vs benefit based on actual visualization needs.


https://github.com/mug-jp/maplibregljs-vue-starter/compare/main...astridx:maplibregljs-vue-starter:compare?expand=1

