# Collab building data

`buildings_all.geojson` is an unchanged copy of
`COUP-table-web-interface/buildings_all.geojson` (78 building footprints). It is copied here so
the Collab runtime owns its input and never reads data from the Vanilla application.

## `marker-building-map.json`

The physical `marker_id` to `building_id` association — the one thing nothing else in the system
knows.

Python (`COUP-table-object-tracking/table_to_geojson.py`) reports **only** `{marker_id, rotation}`
plus a WGS84 point; it has no concept of a building. `buildings_all.geojson` carries `building_id`
(`G12`) and `city_scope_id` (`B-12`) but no marker id. Neither side can derive the association, so
it is declared here, as data — edit this file when a marker is re-taped to another block; never
hardcode an association in TypeScript.

### Current entries

Taken from the live `:8053` feed observed on 2026-08-31, which carried building markers
`12, 18, 24, 27, 47` (plus `193`, see below). Each of those five ids matches an existing building
number, so they are mapped `N -> G<N>`.

**This numeric correspondence is an observation, not a rule the system enforces.** It cannot be
relied on in general:

- `193` arrives in the same feed and there is no `G193`. The same was true of `182` in Vanilla's
  `startGeojson.js`, whose two entries (`182 -> G28`, `35 -> G28`) this file previously carried and
  which are now removed as stale test data.
- Lettered buildings (`G02A`, `G48B`, ...) have no plain-number form at all.
- The per-camera `REFERENCE_MARKERS` ids (`40, 48, 52, 60, 62, 63, 65, 72` — see
  `stores/collabTracking.ts`) sit in the same numeric range as building numbers and are *not*
  buildings.

So every entry here is written out explicitly rather than computed from the id.

### Adding a building

1. Put the block on the table and read Control's **Building markers** panel: every marker id
   arriving from Python appears there, labelled `tracked`, `outside AOI`, or `not mapped`.
2. Add a `{ "marker_id": N, "building_id": "G.." }` line here for each `not mapped` id.
3. Confirm the building's footprint lies inside the selected AOI — `collabFootprintsWithinAoi`
   drops anything outside it, and the panel will report such a marker as `outside AOI`.

`validateCollabBuildingDataset` rejects duplicate marker ids, unknown building ids, and any id
reserved for map calibration (`200`-`203`).
