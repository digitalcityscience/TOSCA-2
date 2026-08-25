# Collab calibration-marker images

`4x4_1000-200.svg`..`4x4_1000-203.svg` are unchanged copies of the same-named files in
`COUP-table-web-interface/` (the Vanilla reference app). They are the four ArUco reference-marker
images the physical cameras are calibrated to recognise; Vanilla's `js/state.js::markerFiles` /
`MARKER_ID_TO_KEY` map them to corners the same way Collab's `collabTracking.ts::MAP_CALIBRATION_MARKERS`
does: `200` top-left, `201` top-right, `202` bottom-left, `203` bottom-right.

Copied here (served as static assets, not bundled) so the Collab runtime owns its own calibration
assets and never reads them from the Vanilla application — same rationale as
`src/collab/data/README.md`'s building-dataset copy.
