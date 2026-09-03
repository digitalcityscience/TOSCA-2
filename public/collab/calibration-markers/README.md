# Collab calibration-marker images

`4x4_1000-200.svg`..`4x4_1000-203.svg` are unchanged copies of the same-named files in
`COUP-table-web-interface/` (the Vanilla reference app). They are the four ArUco reference-marker
images the physical cameras are calibrated to recognise; Vanilla's `js/state.js::markerFiles` /
`MARKER_ID_TO_KEY` map them to corners the same way Collab's `collabTracking.ts::MAP_CALIBRATION_MARKERS`
does: `200` top-left, `201` top-right, `202` bottom-left, `203` bottom-right.

Copied here (served as static assets, not bundled) so the Collab runtime owns its own calibration
assets and never reads them from the Vanilla application — same rationale as
`src/collab/data/README.md`'s building-dataset copy.

## The five extra grid markers (204-208)

`4x4_1000-204.svg`..`4x4_1000-208.svg` have no Vanilla counterpart — they are generated from
OpenCV's `DICT_4X4_250` (`cv2.aruco.generateImageMarker(dictionary, id, 6)`) in exactly the format
the four copied files use: a 6x6 `viewBox`, one black backing rect, one white rect per light
module, `shape-rendering="crispEdges"`, `20mm` square. Ids 200-208 are bit-identical under
`DICT_4X4_250` and `4x4_1000`, since OpenCV's 4x4 dictionaries are nested — the filenames follow
the existing convention rather than claiming a different dictionary.

They are the edge midpoints and centre of the 3x3 grid `collabTracking.ts::MAP_CALIBRATION_MARKERS`
projects (workflow step 5). Four correspondences leave `cv2.findHomography` no freedom: it passes
through all four exactly, noise included, and every part of the table it did not sample is
extrapolation off a fit that cannot even measure its own error. More points make the solve
least-squares instead. Only 200-203 are required, so a marker landing on a stitching seam costs a
correspondence rather than the session.
