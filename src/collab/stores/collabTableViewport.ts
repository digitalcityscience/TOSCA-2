import { watch } from "vue";
import type { useMapStore } from "@store/map";
import { aoiBoundingBox, aoiChecksum, calibrationMarkerSizePx } from "./collabCalibration";
import type { useCollabSessionStore } from "./collabSession";

/**
 * Table-window viewport control (ticket 11, fix-tickets): fits the Table map exactly to the
 * Control-selected AOI and locks pan/zoom/rotate/keyboard interaction, so the projector shows the
 * operator-selected area and stays frozen *against the operator's own input* — but re-fits every
 * time Control confirms a *different* AOI (live-rig diagnosis, 2026-08-31: this used to fit only
 * the first AOI ever seen and never again, so a later AOI update left the map camera pointed at
 * the old area — calibration markers were correctly repositioned to the new AOI's geography, just
 * entirely outside what the frozen viewport could see, which read as "the whole Table view is
 * black"/broken). Extracted out of `CollabTableView.vue`'s `<script setup>` so it is unit-testable
 * against a fake map store, the way every other Collab store in this module is (this codebase has
 * no component-mount test infrastructure — see collabRegression.test.ts's `vi.mock("@store/map")`
 * pattern).
 *
 * Runs again on every `map`/`session.calibration.aoi` change (immediate), so it also covers the
 * (re)load/localStorage-recovery path: `collabSync.startAsTable` may populate `aoi` before or
 * after the map itself becomes ready. Deliberately does nothing while `aoi` is null — if Control
 * never selects an AOI, the Table stays pannable on its generic startup viewport rather than
 * freezing on the wrong one.
 *
 * Compares AOIs by {@link aoiChecksum}, not by `session.calibration.aoi`'s object identity
 * (live-rig diagnosis, 2026-08-31): `collabSync`'s patch/snapshot application rebuilds the whole
 * `calibration` slice — `aoi` included — on *any* field within it changing (ticket 11's own
 * "Table's watchers always have something to react to" design, needed so a marker-health-only
 * update still repaints red/green borders), so `aoi` gets reassigned to a structurally-identical
 * new object on every such broadcast. Re-fitting on object identity alone re-ran `fitBounds` on
 * every marker going green — with no real AOI change to justify it, that read as the whole Table
 * view jolting/"jumping" at the exact moment a marker was accepted.
 *
 * Fits with `padding: {@link calibrationMarkerSizePx}() / 2`, not `0` (live-rig diagnosis,
 * 2026-08-31, confirmed by projecting the fitted AOI's corners back to canvas pixels: with zero
 * padding, `fitBounds` seats the AOI's corners exactly on the canvas edge on whichever axis
 * constrains the fit — 0 and the full canvas width/height, pixel for pixel, no margin at all).
 * Every calibration marker's `anchor: "center"` sits exactly on one of those corners, so with no
 * padding roughly half of every marker's width was guaranteed to render past the canvas edge —
 * i.e. physically off the projected table, reported as markers "jumping outside the table" right
 * as they appeared. Padding by exactly half the marker's own size is the minimum that keeps a
 * corner-centred marker's far edge inside the canvas.
 *
 * @returns a stop function that ends the watch — call it on unmount, mirroring every other
 * `start*`/`stop` pair in the Collab stores.
 */
export function startTableViewportSync(
    session: ReturnType<typeof useCollabSessionStore>,
    mapStore: ReturnType<typeof useMapStore>
): () => void {
    let lastFittedAoiChecksum: string | undefined;

    function lock(map: NonNullable<ReturnType<typeof useMapStore>["map"]>): void {
        map.dragPan.disable();
        map.dragRotate.disable();
        map.scrollZoom.disable();
        map.doubleClickZoom.disable();
        map.touchZoomRotate.disable();
        map.keyboard.disable();
        map.boxZoom.disable();
    }

    function fitThenLock(): void {
        const map = mapStore.map;
        const aoi = session.calibration.aoi;
        if (map === undefined || aoi === null) {
            return;
        }
        const checksum = aoiChecksum(aoi);
        if (checksum === lastFittedAoiChecksum) {
            return;
        }
        lastFittedAoiChecksum = checksum;
        const [minLng, minLat, maxLng, maxLat] = aoiBoundingBox(aoi);
        map.fitBounds(
            [
                [minLng, minLat],
                [maxLng, maxLat],
            ],
            { padding: calibrationMarkerSizePx() / 2, animate: false }
        );
        lock(map);
    }

    return watch(() => [mapStore.map, session.calibration.aoi] as const, fitThenLock, { immediate: true });
}
