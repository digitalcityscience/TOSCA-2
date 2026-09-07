# Collab calibration-marker images

`4x4_1000-200.svg`..`4x4_1000-203.svg` are unchanged copies of the same-named files in
`COUP-table-web-interface/` (the Vanilla reference app). They are the four ArUco reference-marker
images the physical cameras are calibrated to recognise; Vanilla's `js/state.js::markerFiles` /
`MARKER_ID_TO_KEY` map them to corners the same way Collab's `collabTracking.ts::MAP_CALIBRATION_MARKERS`
does: `200` top-left, `201` top-right, `202` bottom-left, `203` bottom-right.

Copied here (served as static assets, not bundled) so the Collab runtime owns its own calibration
assets and never reads them from the Vanilla application — same rationale as
`src/collab/data/README.md`'s building-dataset copy.

## The extra grid markers (206, 207, 209-213)

`4x4_1000-206.svg`, `4x4_1000-207.svg`, and `4x4_1000-209.svg`..`4x4_1000-213.svg` have no Vanilla
counterpart — generated with `generate_markers.py` in this directory, i.e.
`cv2.aruco.generateImageMarker(dictionary, id, 6)` against OpenCV's `DICT_4X4_250`, in exactly the
format the four copied files use: a 6x6 `viewBox`, one black backing rect, one white rect per light
module, `shape-rendering="crispEdges"`, `20mm` square. All ids in this range are bit-identical
under `DICT_4X4_250` and `4x4_1000`, since OpenCV's 4x4 dictionaries are nested — the filenames
follow the existing convention rather than claiming a different dictionary.

They are `collabTracking.ts::MAP_CALIBRATION_MARKERS`' non-corner grid (workflow step 5). Four
correspondences leave `cv2.findHomography` no freedom: it passes through all four exactly, noise
included, and every part of the table it did not sample is extrapolation off a fit that cannot even
measure its own error. More points make the solve least-squares instead. Only 200-203 are required,
so a marker landing on a stitching seam costs a correspondence rather than the session.

### Why 209-213 exist and 204/205/208/214 no longer do (2026-09-07)

The original nine-marker grid put `204` (top-mid), `205` (bottom-mid), and `208` (dead centre) at
exactly `u = 0.5` — the geometric horizontal centre of the AOI/table. On a physical table built
from two desks pushed together (the live rig: two 80x80 cm desks forming one ~160x80 cm surface),
that centre line **is** the seam between them: a marker projected there straddles the join and the
camera cannot decode it at all, so those three correspondences were never actually usable on that
hardware.

`204` and `205` are replaced by a pair each, one either side of the seam rather than on it:

| old id (removed) | replaced by                        | placement                                  |
| ----------------- | ----------------------------------- | ------------------------------------------- |
| 204 (top, mid)     | 209 (top, midLeft) / 210 (top, midRight)       | top edge, straddling the seam from a safe distance |
| 205 (bottom, mid)  | 211 (bottom, midLeft) / 212 (bottom, midRight) | bottom edge, same idea |

`208` (centre, mid) got the same treatment first — `213`/`214`, a midLeft/midRight pair on the
vertical middle row. `214` (the midRight half) was retired the same day, before it ever shipped:
`row: "mid"` is not just the seam's line horizontally, it is also the table's vertical centre, and
on the live rig that spot specifically is where the ceiling beamer's own projection is brightest. A
marker placed there is overexposed and cannot be decoded no matter how far it is offset from the
seam — clearing the seam does nothing about the beamer sitting on top of it. Table 104's
freshly-projected 213/214 pair confirmed this: `214` never registered a single read. `213`, offset
to the *other* side of the seam, reads fine — the beamer's hotspot is not centred on the seam
itself — so it stays; the centre row is one marker, not a pair.

`206` (left, mid) and `207` (right, mid) are untouched — their `column` is `min`/`max`, not `mid`,
so they were never on the seam or under the beamer's hotspot.

The `midLeft`/`midRight` bands (`collabTracking.ts::MapCalibrationMarkerBand`) sit
`seamClearanceRatio()` (`collabCalibration.ts`, env `VITE_COLLAB_CALIBRATION_SEAM_CLEARANCE_RATIO`,
default `0.1`) either side of the exact centre — far enough that a marker's own footprint clears the
seam on the reference two-desk rig, close enough that the markers still sample the full table. This
gives `cv2.findHomography` more correspondences than the nine-marker grid did (11 vs. 9),
concentrated near the seam specifically because that is where the stitched image is most likely to
disagree with a single global perspective transform — while guaranteeing none of them can ever land
on the seam itself, regardless of table width.

### The "good enough" reading threshold (2026-09-07)

Not every one of these eleven is guaranteed to come in on a given rig — a corner in a camera's weak
spot, a grid marker still catching some stray light — and the operator should not have to wait
indefinitely for the last straggler. `collabTracking.ts::isMapCalibrationMarkerHealthReady` (used
by Control's "Calibrate" button, `collabTrackingRender.ts::canCalibrateFromMarkers`) always
requires the four corners, and beyond that accepts either `mapCalibrationMarkerReadyCount()`
distinct ids total (`10` by default — env `VITE_COLLAB_CALIBRATION_MARKER_READY_COUNT`) for a
denser, less noisy fit, or, once `MAP_CALIBRATION_MARKER_READY_TIMEOUT_MS` (`20` seconds) has
passed since presentation started without reaching that count, the four corners on their own —
the same bar this gate used before the threshold existed, so one stubborn marker can delay
calibration by at most 20s, never block it outright.

Regenerate any of these files with `python generate_markers.py <id> [<id> ...]` from this directory
(requires `opencv-python`) — it reproduces the exact byte-for-byte format used here.
