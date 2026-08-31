import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick } from "vue";
import { useCollabSessionStore } from "./collabSession";
import { startTableViewportSync } from "./collabTableViewport";

/** Just enough of `maplibregl.Map`'s interaction-handler surface for `startTableViewportSync`. */
function fakeInteractionHandler() {
    return { disable: vi.fn(), enable: vi.fn() };
}

/**
 * `canvasSize` is mutable (a plain object, not a fresh one per `getCanvas()` call) so a test can
 * simulate the Table canvas resizing mid-session — exactly like MapLibre's real `HTMLCanvasElement`,
 * whose `clientWidth`/`clientHeight` a caller reads live rather than snapshotting.
 */
function fakeMap(canvasSize = { clientWidth: 1000, clientHeight: 800 }) {
    const listeners = new Map<string, Set<() => void>>();
    return {
        fitBounds: vi.fn(),
        jumpTo: vi.fn(),
        dragPan: fakeInteractionHandler(),
        dragRotate: fakeInteractionHandler(),
        scrollZoom: fakeInteractionHandler(),
        doubleClickZoom: fakeInteractionHandler(),
        touchZoomRotate: fakeInteractionHandler(),
        keyboard: fakeInteractionHandler(),
        boxZoom: fakeInteractionHandler(),
        getCanvas: vi.fn(() => canvasSize),
        on: vi.fn((event: string, handler: () => void) => {
            const forEvent = listeners.get(event) ?? new Set();
            forEvent.add(handler);
            listeners.set(event, forEvent);
        }),
        off: vi.fn((event: string, handler: () => void) => {
            listeners.get(event)?.delete(handler);
        }),
        /** Test-only: fires every handler registered for `event`, simulating MapLibre emitting it. */
        emit(event: string): void {
            for (const handler of listeners.get(event) ?? []) {
                handler();
            }
        },
    };
}

const hamburgAoi = {
    corners: [
        [9.98, 53.56],
        [10.0, 53.56],
        [10.0, 53.54],
        [9.98, 53.54],
    ] as [[number, number], [number, number], [number, number], [number, number]],
};

describe("startTableViewportSync (ticket 11)", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    test("does nothing while there is no map, even with an AOI already set", () => {
        const session = useCollabSessionStore();
        session.calibration.aoi = hamburgAoi;
        const mapStore = { map: undefined as ReturnType<typeof fakeMap> | undefined };

        const stop = startTableViewportSync(session, mapStore as never);
        stop();
    });

    test("does nothing while there is a map but no AOI yet — stays pannable on the generic viewport", () => {
        const session = useCollabSessionStore();
        const map = fakeMap();
        const mapStore = { map: map as ReturnType<typeof fakeMap> | undefined };

        const stop = startTableViewportSync(session, mapStore as never);

        expect(map.fitBounds).not.toHaveBeenCalled();
        expect(map.dragPan.disable).not.toHaveBeenCalled();
        stop();
    });

    test("fits to the selected AOI, then locks every interaction handler", () => {
        const session = useCollabSessionStore();
        const map = fakeMap();
        const mapStore = { map: map as ReturnType<typeof fakeMap> | undefined };
        session.calibration.aoi = hamburgAoi;

        const stop = startTableViewportSync(session, mapStore as never);

        expect(map.jumpTo).not.toHaveBeenCalled();
        expect(map.fitBounds).toHaveBeenCalledTimes(1);
        expect(map.fitBounds).toHaveBeenCalledWith(
            [
                [9.98, 53.54],
                [10.0, 53.56],
            ],
            { padding: 45, animate: false }
        );
        expect(map.dragPan.disable).toHaveBeenCalledTimes(1);
        expect(map.dragRotate.disable).toHaveBeenCalledTimes(1);
        expect(map.scrollZoom.disable).toHaveBeenCalledTimes(1);
        expect(map.doubleClickZoom.disable).toHaveBeenCalledTimes(1);
        expect(map.touchZoomRotate.disable).toHaveBeenCalledTimes(1);
        expect(map.keyboard.disable).toHaveBeenCalledTimes(1);
        expect(map.boxZoom.disable).toHaveBeenCalledTimes(1);
        stop();
    });

    test("a later AOI change re-fits and re-locks (live-rig diagnosis, 2026-08-31: a frozen viewport left calibration markers positioned outside what was visible)", async () => {
        const session = useCollabSessionStore();
        const map = fakeMap();
        const mapStore = { map: map as ReturnType<typeof fakeMap> | undefined };
        session.calibration.aoi = hamburgAoi;

        const stop = startTableViewportSync(session, mapStore as never);
        expect(map.fitBounds).toHaveBeenCalledTimes(1);

        session.calibration.aoi = {
            corners: [
                [9.5, 53.6],
                [9.6, 53.6],
                [9.6, 53.5],
                [9.5, 53.5],
            ],
        };
        await nextTick();

        expect(map.fitBounds).toHaveBeenCalledTimes(2);
        expect(map.fitBounds).toHaveBeenLastCalledWith(
            [
                [9.5, 53.5],
                [9.6, 53.6],
            ],
            { padding: 45, animate: false }
        );
        expect(map.dragPan.disable).toHaveBeenCalledTimes(2);
        stop();
    });

    test("a same-value AOI reassigned to a new object does not re-fit (live-rig diagnosis, 2026-08-31: collabSync rebuilds `aoi` as a fresh object on every calibration-slice broadcast, e.g. a marker turning green — re-fitting on object identity alone jolted the viewport with no real AOI change)", async () => {
        const session = useCollabSessionStore();
        const map = fakeMap();
        const mapStore = { map: map as ReturnType<typeof fakeMap> | undefined };
        session.calibration.aoi = hamburgAoi;

        const stop = startTableViewportSync(session, mapStore as never);
        expect(map.fitBounds).toHaveBeenCalledTimes(1);

        // A structurally-identical AOI, but a *different object* — mirrors what
        // `cloneCalibration`/`Object.assign` produces on an unrelated field change.
        session.calibration.aoi = {
            corners: hamburgAoi.corners.map((corner) => [...corner]) as typeof hamburgAoi.corners,
        };
        await nextTick();

        expect(map.fitBounds).toHaveBeenCalledTimes(1);
        expect(map.dragPan.disable).toHaveBeenCalledTimes(1);
        stop();
    });

    test("a Table opened with no AOI, then later given one once Control confirms it, still fits and locks", async () => {
        const session = useCollabSessionStore();
        const map = fakeMap();
        const mapStore = { map: map as ReturnType<typeof fakeMap> | undefined };

        const stop = startTableViewportSync(session, mapStore as never);
        expect(map.fitBounds).not.toHaveBeenCalled();

        session.calibration.aoi = hamburgAoi;
        await nextTick();

        expect(map.fitBounds).toHaveBeenCalledTimes(1);
        expect(map.dragPan.disable).toHaveBeenCalledTimes(1);
        stop();
    });

    test("a canvas resize with the AOI unchanged re-fits (live-rig diagnosis, 2026-08-31: the Table canvas's clientWidth/clientHeight changed mid-session with no AOI change — nothing here re-ran fitBounds, so the next AOI Update baked in a canvas size that no longer matched reality once the canvas settled, which read as every calibration marker drifting outside the table)", async () => {
        const session = useCollabSessionStore();
        const canvasSize = { clientWidth: 1000, clientHeight: 800 };
        const map = fakeMap(canvasSize);
        const mapStore = { map: map as ReturnType<typeof fakeMap> | undefined };
        session.calibration.aoi = hamburgAoi;

        const stop = startTableViewportSync(session, mapStore as never);
        expect(map.fitBounds).toHaveBeenCalledTimes(1);
        expect(map.on).toHaveBeenCalledWith("resize", expect.any(Function));

        // The canvas grows underneath the map with the AOI itself never changing — exactly what
        // the captured logs showed happening between two AOI Updates.
        canvasSize.clientWidth = 1950;
        canvasSize.clientHeight = 926;
        map.emit("resize");

        expect(map.fitBounds).toHaveBeenCalledTimes(2);
        expect(map.fitBounds).toHaveBeenLastCalledWith(
            [
                [9.98, 53.54],
                [10.0, 53.56],
            ],
            { padding: 45, animate: false }
        );
        expect(map.dragPan.disable).toHaveBeenCalledTimes(2);
        stop();
    });

    test("a resize event with the canvas size unchanged does not re-fit (no spurious jolt from an unrelated `resize` firing, e.g. one MapLibre emits after a same-size `map.resize()` call)", async () => {
        const session = useCollabSessionStore();
        const map = fakeMap();
        const mapStore = { map: map as ReturnType<typeof fakeMap> | undefined };
        session.calibration.aoi = hamburgAoi;

        const stop = startTableViewportSync(session, mapStore as never);
        expect(map.fitBounds).toHaveBeenCalledTimes(1);

        map.emit("resize");

        expect(map.fitBounds).toHaveBeenCalledTimes(1);
        stop();
    });

    test("stopping the sync detaches the resize listener", async () => {
        const session = useCollabSessionStore();
        const map = fakeMap();
        const mapStore = { map: map as ReturnType<typeof fakeMap> | undefined };
        session.calibration.aoi = hamburgAoi;

        const stop = startTableViewportSync(session, mapStore as never);
        expect(map.fitBounds).toHaveBeenCalledTimes(1);
        stop();

        map.getCanvas.mockReturnValue({ clientWidth: 1950, clientHeight: 926 });
        map.emit("resize");

        expect(map.fitBounds).toHaveBeenCalledTimes(1);
    });
});

/**
 * A fake map that reproduces MapLibre's actual split between the *canvas* (live CSS size, read via
 * `getCanvas()`) and the *transform* (MapLibre's own idea of that size, only ever refreshed by
 * `resize()`): `fitBounds` and `project` both work off the transform, so letting the canvas grow
 * without firing `resize()` recreates precisely the desync the live rig hit — a camera fitted for
 * one canvas size while a differently-sized canvas is what actually paints.
 *
 * The projection is deliberately flat (pixels-per-degree) rather than Web Mercator: the fit and the
 * verification both go through it, so what is under test is the fit/verify/re-fit control flow, not
 * MapLibre's projection maths.
 */
function fakeProjectingMap(canvas: { clientWidth: number; clientHeight: number }) {
    const listeners = new Map<string, Set<() => void>>();
    const transform = { width: canvas.clientWidth, height: canvas.clientHeight };
    const camera = { lng: 0, lat: 0, scale: 1 };
    const map = {
        dragPan: fakeInteractionHandler(),
        dragRotate: fakeInteractionHandler(),
        scrollZoom: fakeInteractionHandler(),
        doubleClickZoom: fakeInteractionHandler(),
        touchZoomRotate: fakeInteractionHandler(),
        keyboard: fakeInteractionHandler(),
        boxZoom: fakeInteractionHandler(),
        getCanvas: () => canvas,
        fitBounds: vi.fn(
            ([[minLng, minLat], [maxLng, maxLat]]: [[number, number], [number, number]], { padding }: { padding: number }) => {
                const available = { width: transform.width - padding * 2, height: transform.height - padding * 2 };
                camera.scale = Math.min(available.width / (maxLng - minLng), available.height / (maxLat - minLat));
                camera.lng = (minLng + maxLng) / 2;
                camera.lat = (minLat + maxLat) / 2;
            }
        ),
        project: ([lng, lat]: [number, number]) => ({
            x: transform.width / 2 + (lng - camera.lng) * camera.scale,
            y: transform.height / 2 - (lat - camera.lat) * camera.scale,
        }),
        resize: vi.fn(() => {
            transform.width = canvas.clientWidth;
            transform.height = canvas.clientHeight;
            map.emit("resize");
        }),
        on: (event: string, handler: () => void) => {
            const forEvent = listeners.get(event) ?? new Set<() => void>();
            forEvent.add(handler);
            listeners.set(event, forEvent);
        },
        off: (event: string, handler: () => void) => {
            listeners.get(event)?.delete(handler);
        },
        emit(event: string): void {
            for (const handler of [...(listeners.get(event) ?? [])]) {
                handler();
            }
        },
    };
    return map;
}

/** Half of `calibrationMarkerSizePx()`'s default 90 — the padding `fitThenLock` fits with. */
const PADDING_PX = 45;

/** Where the AOI's bounding box actually lands on the canvas, in the canvas's own live pixels. */
function projectedAoiBox(map: ReturnType<typeof fakeProjectingMap>, aoi: typeof hamburgAoi) {
    const lngs = aoi.corners.map(([lng]) => lng);
    const lats = aoi.corners.map(([, lat]) => lat);
    const topLeft = map.project([Math.min(...lngs), Math.max(...lats)]);
    const bottomRight = map.project([Math.max(...lngs), Math.min(...lats)]);
    return { width: Math.abs(bottomRight.x - topLeft.x), height: Math.abs(bottomRight.y - topLeft.y) };
}

describe("startTableViewportSync — fit verification (live-rig diagnosis, 2026-08-31)", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    test("a second AOI confirmed while MapLibre's transform is behind the canvas still fits the canvas that actually paints (this is the AOI-Update regression: the first AOI always looked right because dragging the Table window onto the projector re-fired this sync until it converged, while a later AOI got exactly one fit against a stale measurement and nothing ever corrected it — its calibration markers landed outside the table)", async () => {
        const session = useCollabSessionStore();
        const canvas = { clientWidth: 1950, clientHeight: 926 };
        const map = fakeProjectingMap(canvas);
        const mapStore = { map: map as ReturnType<typeof fakeProjectingMap> | undefined };
        session.calibration.aoi = hamburgAoi;

        const stop = startTableViewportSync(session, mapStore as never);
        expect(projectedAoiBox(map, hamburgAoi).height).toBeCloseTo(926 - PADDING_PX * 2, 6);

        // The canvas grows with no `resize` event behind it — a fullscreen/DPI negotiation still
        // settling, or a `map.resize()` MapLibre has not applied yet. MapLibre's transform, and so
        // every fit computed from it, is now on the old size.
        canvas.clientWidth = 2944;
        canvas.clientHeight = 1490;

        const secondAoi = {
            corners: [
                [10.48, 53.56],
                [10.5, 53.56],
                [10.5, 53.54],
                [10.48, 53.54],
            ] as typeof hamburgAoi.corners,
        };
        session.calibration.aoi = secondAoi;
        await nextTick();

        expect(map.resize).toHaveBeenCalled();
        const box = projectedAoiBox(map, secondAoi);
        expect(box.height).toBeCloseTo(1490 - PADDING_PX * 2, 6);
        expect(box.width).toBeLessThanOrEqual(2944 - PADDING_PX * 2 + 1);
        stop();
    });

    test("an AOI update on a canvas MapLibre is already in sync with fits in one pass — no corrective resize", async () => {
        const session = useCollabSessionStore();
        const canvas = { clientWidth: 1950, clientHeight: 926 };
        const map = fakeProjectingMap(canvas);
        const mapStore = { map: map as ReturnType<typeof fakeProjectingMap> | undefined };
        session.calibration.aoi = hamburgAoi;

        const stop = startTableViewportSync(session, mapStore as never);
        session.calibration.aoi = {
            corners: [
                [10.48, 53.56],
                [10.5, 53.56],
                [10.5, 53.54],
                [10.48, 53.54],
            ] as typeof hamburgAoi.corners,
        };
        await nextTick();

        expect(map.fitBounds).toHaveBeenCalledTimes(2);
        expect(map.resize).not.toHaveBeenCalled();
        stop();
    });

    test("re-broadcasting the same AOI against an unchanged, already-correct canvas does not re-fit (the jolt-on-marker-green guard still holds now that the guard also checks fit accuracy)", async () => {
        const session = useCollabSessionStore();
        const canvas = { clientWidth: 1950, clientHeight: 926 };
        const map = fakeProjectingMap(canvas);
        const mapStore = { map: map as ReturnType<typeof fakeProjectingMap> | undefined };
        session.calibration.aoi = hamburgAoi;

        const stop = startTableViewportSync(session, mapStore as never);
        expect(map.fitBounds).toHaveBeenCalledTimes(1);

        session.calibration.aoi = { corners: [...hamburgAoi.corners] as typeof hamburgAoi.corners };
        await nextTick();

        expect(map.fitBounds).toHaveBeenCalledTimes(1);
        stop();
    });
});
