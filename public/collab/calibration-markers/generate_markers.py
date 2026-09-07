"""Regenerates this directory's `4x4_1000-{id}.svg` calibration-marker images.

Run with `python generate_markers.py <id> [<id> ...]` from this directory. Reproduces the exact
process the 204-208 seam-avoidance grid markers (and now 209-214) were produced with, documented
in README.md: `cv2.aruco.generateImageMarker` on `DICT_4X4_250` (bit-identical to `4x4_1000` for
these ids, since OpenCV's 4x4 dictionaries are nested), rasterised at 6x6 modules and re-expressed
as an SVG in the same format as the 200-203 files copied from the Vanilla reference app.

Kept here, not run ad hoc, so a future marker-id change (new seam-clearance ids, a different grid)
reproduces byte-identical output rather than a slightly different hand-rolled conversion.
"""

import sys
from pathlib import Path

import cv2
import numpy as np

DICTIONARY = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_250)
MODULES_PER_SIDE = 6  # 4x4 data bits + 1-module black border on every side


def marker_svg(marker_id: int) -> str:
    bitmap: np.ndarray = cv2.aruco.generateImageMarker(DICTIONARY, marker_id, MODULES_PER_SIDE)
    rects = [f'<rect x="0" y="0" width="{MODULES_PER_SIDE}" height="{MODULES_PER_SIDE}" fill="black"></rect>']
    for y in range(MODULES_PER_SIDE):
        for x in range(MODULES_PER_SIDE):
            if bitmap[y, x] > 127:  # white module
                rects.append(f'<rect width="1" height="1" x="{x}" y="{y}" fill="white"></rect>')
    body = "".join(rects)
    return (
        f'<svg viewBox="0 0 {MODULES_PER_SIDE} {MODULES_PER_SIDE}" xmlns="http://www.w3.org/2000/svg" '
        f'shape-rendering="crispEdges" width="20mm" height="20mm">{body}</svg>'
    )


def main(ids: list[int]) -> None:
    out_dir = Path(__file__).parent
    for marker_id in ids:
        svg = marker_svg(marker_id)
        path = out_dir / f"4x4_1000-{marker_id}.svg"
        path.write_text(svg, encoding="utf-8", newline="\n")
        print(f"wrote {path.name} ({len(svg)} bytes)")


if __name__ == "__main__":
    ids = [int(arg) for arg in sys.argv[1:]]
    if not ids:
        sys.exit("usage: python generate_markers.py <id> [<id> ...]")
    main(ids)
