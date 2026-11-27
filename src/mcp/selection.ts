/**
 * What the user last clicked on the map, for `getSelectedFeatures` ("this building": the one the
 * user clicked last, not the one before).
 *
 * Clicks are only recorded while the tab has an assistant connection (from "Connect AI assistant"
 * until it ends), and only in this tab: nothing is sent until the assistant asks. A click is read
 * the same way as the map's click popup (`featuresAtPoint`). Only map clicks count; the map's own
 * click handlers are not touched.
 */
import { watch } from "vue";
import { useMapStore } from "@store/map";
import { featuresAtPoint } from "./layerDisplayCommands";

/** Clicks kept, newest first. */
export const KEPT_SELECTIONS = 5;

export interface MapSelection {
    /** When the user clicked (ISO time). */
    at: string;
    point: [number, number];
    total: number;
    features: Array<Record<string, unknown>>;
}

let selections: MapSelection[] = [];
let stop: (() => void) | undefined;

function record(map: any, event: { point: { x: number, y: number }, lngLat: { lng: number, lat: number } }): void {
    try {
        const selection: MapSelection = {
            at: new Date().toISOString(),
            point: [event.lngLat.lng, event.lngLat.lat],
            ...featuresAtPoint(map, event.point),
        };
        selections = [selection, ...selections].slice(0, KEPT_SELECTIONS);
    } catch {
        // A click while the map changes style: nothing to record.
    }
}

/** Starts recording clicks (again after the map is created anew). Repeated calls do nothing. */
export function startSelectionTracking(): void {
    if (stop !== undefined) return;
    const mapStore = useMapStore();
    let attached: any;
    const onClick = (event: any): void => record(attached, event);
    const attach = (map: any): void => {
        if (map === attached) return;
        attached?.off?.("click", onClick);
        attached = map;
        attached?.on?.("click", onClick);
    };
    const unwatch = watch(() => mapStore.map, (map) => attach(map ?? undefined), { immediate: true });
    stop = () => {
        unwatch();
        attach(undefined);
    };
}

/** Stops recording and forgets the clicks. */
export function stopSelectionTracking(): void {
    stop?.();
    stop = undefined;
    selections = [];
}

/** The recorded clicks, newest first. */
export function recentSelections(): MapSelection[] {
    return selections;
}
