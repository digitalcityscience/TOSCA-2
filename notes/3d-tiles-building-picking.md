# Per-building attribute picking for 3D Tiles (deck.gl / Tile3DLayer)

Why clicking a building in the deck.gl `Tile3DLayer` 3D layers (e.g. Hamburg LoD3 demo)
now shows that building's own attributes, and what didn't work along the way.

Code: [`src/store/map.ts`](../src/store/map.ts) — `PickableTile3DLayer`,
`findNearestVertexBatchId`, `buildDeckPopupFeature`, `pickDeckObjects`. Entry point:
`showAttributePopup` in [`MapContainer.vue`](../src/components/Map/MapContainer.vue).

## Background

`.b3dm` tiles merge many buildings into one mesh, distinguished only by a per-vertex
`_BATCHID` that maps into a **batch table** (per-building properties: address, type,
footprint area, …). Correct picking = click → find which building's `_BATCHID` owns the
vertex under the cursor → look up that id in the batch table.

## Problem 1: clicks silently missed geometry

`Tile3DLayer.filterSubLayer` skips a tile from the *picking* pass whenever its content
origin projects more than a quarter-viewport away from the click — a performance
heuristic, not configurable. With our 60° auto-tilt camera and tall buildings, clicking a
facade is often screen-far from its tile's ground-level origin, so it failed this check.

**Fix:** `PickableTile3DLayer` overrides `filterSubLayer` to keep the real
tile-selection/LOD gate but skip the picking-only distance cull. Stable throughout.

## Problem 2: every click resolved to the same building

**Cause:** `.b3dm` is unconditionally typed `TILE_TYPE.SCENEGRAPH` by file extension in
`@loaders.gl/3d-tiles` — never `TILE_TYPE.MESH`. Tile3DLayer renders `SCENEGRAPH` via
`ScenegraphLayer`, which treats a tile's whole merged mesh as one pickable "instance" —
no per-vertex picking-color concept. Only the `MESH` path (`MeshLayer`) supports
feature-level picking, and b3dm never reaches it. Confirmed two independent ways: our own
picks and deck.gl's native `onClick` both always returned `index: 0`.

**Reverted attempt:** forcing tiles onto the `MESH` path by hand-building
`content.attributes`/`indices` and flipping `tileHeader.type`. This **broke rendering**
(buildings became flat, oversimplified boxes) because it skipped things `ScenegraphLayer`
handles correctly (materials, and the node transform from Problem 3). Reverted immediately.

**Fix that stuck — CPU-side nearest-vertex matching, no rendering changes:**
1. `pickable: "3d"` + `unproject3D: true` → pick's `coordinate` is a real 3D point on the
   clicked surface, not a flat-plane approximation.
2. `findNearestVertexBatchId` reads the tile's raw glTF vertex data
   (`content.gltf.meshes[0].primitives[0].attributes.POSITION` / `._BATCHID`), finds the
   nearest vertex to that coordinate, returns its `_BATCHID`.
3. Comparison happens in Web Mercator world space using the same math
   (`@math.gl/web-mercator`) deck.gl's own `METER_OFFSETS` system uses — consistent with
   the real render transform. Read-only, so a wrong result can't break the display.

## Problem 3: nearest vertex found *something* close, but usually the wrong building

Distances were consistently small (1–6m) and vertex/batch-id array alignment checked out,
yet the resolved building was often wrong, deterministically.

Ruled out: interleaved-mode depth-buffer sharing (tested overlaid mode, no change);
`pixel` vs `devicePixel` mismatch (turned out to be the normal top-down/bottom-up Y-flip
between CSS and WebGL, not a bug); batch table indexing (array length matched batch id
count exactly).

**Actual cause:** the glTF's own node transform. `content.gltf.nodes[0].matrix` is a
non-identity rotation, and `ScenegraphLayer` (the real renderer) applies it. Loaders.gl
only "absorbs" a node's matrix into `content.modelMatrix` when it has an earth-scale
(>100km) translation — ours is a pure rotation, so it's never absorbed, and
`findNearestVertexBatchId` was silently skipping it.

**Fix:** combine node matrix and `content.modelMatrix` before transforming each candidate
vertex: `new Matrix4(modelMatrix).multiplyRight(new Matrix4(nodeMatrixArray))`. Confirmed
working — attributes now match the clicked building.

## Aside: nested `ATTRIBUTES` object

This tileset's batch table wraps the real fields (Adresse, Gebaeudefunktion, …) inside a
nested `ATTRIBUTES` object per building, alongside structural fields (`ID`, `CLASSID`,
etc.) from the export pipeline. `buildDeckPopupFeature` surfaces the nested object instead
of the wrapper — otherwise the popup would show `ATTRIBUTES: [object Object]`.

## Known limitations

- Assumes one mesh/primitive/node per tile (true here, confirmed by inspection) — a
  tileset with multiple primitives or a deeper node hierarchy would need generalizing.
- Linear vertex scan per click (tens of thousands to ~500k vertices per tile in this
  dataset). Fine for a one-off click; would need spatial indexing for heavier use.
- No attribute/geometry filtering yet for 3D layers (2D's `AttributeFiltering`/
  `GeometryFiltering` equivalent) — deck.gl's nearest analog is `@deck.gl/extensions`'
  `DataFilterExtension`, not yet wired up.
