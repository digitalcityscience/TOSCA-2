import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick } from "vue";
import { useCollabSessionStore } from "./collabSession";
import { startTableViewportSync } from "./collabTableViewport";

/** Just enough of `maplibregl.Map`'s interaction-handler surface for `startTableViewportSync`. */
function fakeInteractionHandler() {
    return { disable: vi.fn(), enable: vi.fn() };
}

function fakeMap() {
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
});
