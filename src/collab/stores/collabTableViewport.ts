import { watch } from "vue";
import type { useMapStore } from "@store/map";
import { aoiBoundingBox } from "./collabCalibration";
import type { useCollabSessionStore } from "./collabSession";

/**
 * Table-window viewport control (ticket 11, fix-tickets): fits the Table map exactly to the
 * Control-selected AOI, and only then locks pan/zoom/rotate/keyboard interaction, so the
 * projector shows the operator-selected area and stays frozen. Extracted out of
 * `CollabTableView.vue`'s `<script setup>` so it is unit-testable against a fake map store, the
 * way every other Collab store in this module is (this codebase has no component-mount test
 * infrastructure — see collabRegression.test.ts's `vi.mock("@store/map")` pattern).
 *
 * Runs again on every `map`/`session.calibration.aoi` change (immediate), so it also covers the
 * (re)load/localStorage-recovery path: `collabSync.startAsTable` may populate `aoi` before or
 * after the map itself becomes ready. Deliberately never locks while `aoi` is null — if Control
 * never selects an AOI, the Table stays pannable on its generic startup viewport rather than
 * freezing on the wrong one.
 *
 * @returns a stop function that ends the watch — call it on unmount, mirroring every other
 * `start*`/`stop` pair in the Collab stores.
 */
export function startTableViewportSync(
    session: ReturnType<typeof useCollabSessionStore>,
    mapStore: ReturnType<typeof useMapStore>
): () => void {
    let locked = false;

    function lock(): void {
        const map = mapStore.map;
        if (map === undefined || locked) {
            return;
        }
        map.dragPan.disable();
        map.dragRotate.disable();
        map.scrollZoom.disable();
        map.doubleClickZoom.disable();
        map.touchZoomRotate.disable();
        map.keyboard.disable();
        map.boxZoom.disable();
        locked = true;
    }

    function fitThenLock(): void {
        const map = mapStore.map;
        const aoi = session.calibration.aoi;
        if (map === undefined || aoi === null || locked) {
            return;
        }
        const [minLng, minLat, maxLng, maxLat] = aoiBoundingBox(aoi);
        map.fitBounds(
            [
                [minLng, minLat],
                [maxLng, maxLat],
            ],
            { padding: 0, animate: false }
        );
        lock();
    }

    return watch(() => [mapStore.map, session.calibration.aoi] as const, fitThenLock, { immediate: true });
}
