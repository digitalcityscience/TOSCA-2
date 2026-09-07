import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@helpers/toast", () => ({
    useToast: () => ({ add: vi.fn() }),
}));

/**
 * The Table's real projection, in miniature: the calibrated AOI (0.02° of longitude) fills a
 * 1920px-wide projected surface. That single constant is what makes this file a faithful stand-in
 * for the rig — every "is this movement or is this camera noise?" question below is asked in the
 * same screen pixels the operator is actually looking at, with no ground-scale conversion in
 * between. Two earlier attempts at this bug computed a threshold in real-world metres and had to
 * multiply by `deriveGroundScale` (~500:1) to get back here; that multiplication is exactly what
 * went wrong, twice. `map.project` already knows the answer.
 */
const AOI_MIN_LNG = 9.98;
const AOI_MAX_LNG = 10.0;
const AOI_MIN_LAT = 53.54;
const AOI_MAX_LAT = 53.56;
const SURFACE_WIDTH_PX = 1920;
const SURFACE_HEIGHT_PX = 1080;

/** Degrees of longitude per projected pixel — the unit the fixtures below are written in. */
const DEG_LNG_PER_PX = (AOI_MAX_LNG - AOI_MIN_LNG) / SURFACE_WIDTH_PX;

const { addMapDataSource, addMapLayer, addCompanionLayer, fakeSources, fakeLayerVisibility } = vi.hoisted(() => {
    const sources = new Map<string, { setData: (data: unknown) => void }>();
    const visibility = new Map<string, string>();
    return {
        fakeSources: sources,
        fakeLayerVisibility: visibility,
        addMapDataSource: vi.fn(async ({ identifier }: { identifier: string }) => {
            await Promise.resolve();
            sources.set(identifier, { setData: vi.fn() });
        }),
        addMapLayer: vi.fn(async ({ identifier }: { identifier: string }) => {
            await Promise.resolve();
            visibility.set(identifier, "visible");
        }),
        // The outline is a companion of the fill, so it must appear in the visibility map too:
        // hiding only the fill and leaving the orange outline drawn would look, on the projected
        // table, exactly like not hiding anything.
        addCompanionLayer: vi.fn((_parentId: string, layer: { id: string }) => {
            visibility.set(layer.id, "visible");
        }),
    };
});

vi.mock("@store/map", () => ({
    useMapStore: () => ({
        map: {
            getSource: (id: string) => fakeSources.get(id),
            getLayer: (id: string) => (fakeLayerVisibility.has(id) ? {} : undefined),
            getLayoutProperty: (id: string) => fakeLayerVisibility.get(id),
            setLayoutProperty: (id: string, _property: string, value: string) => {
                fakeLayerVisibility.set(id, value);
            },
            getStyle: () => ({ layers: [] }),
            isStyleLoaded: () => true,
            getCenter: () => ({ lng: (AOI_MIN_LNG + AOI_MAX_LNG) / 2, lat: (AOI_MIN_LAT + AOI_MAX_LAT) / 2 }),
            getZoom: () => 17.66,
            project: (position: [number, number]) => ({
                x: ((position[0] - AOI_MIN_LNG) / (AOI_MAX_LNG - AOI_MIN_LNG)) * SURFACE_WIDTH_PX,
                y: ((AOI_MAX_LAT - position[1]) / (AOI_MAX_LAT - AOI_MIN_LAT)) * SURFACE_HEIGHT_PX,
            }),
            on: () => {},
            off: () => {},
            once: () => {},
        },
        addMapDataSource,
        addMapLayer,
        addCompanionLayer,
    }),
}));

import type { FeatureCollection } from "geojson";
import { useCollabSessionStore } from "./collabSession";
import { useCollabTrackingRenderStore } from "./collabTrackingRender";

const FILL_LAYER_ID = "collabTrackedFootprints-fill";
const OUTLINE_LAYER_ID = "collabTrackedFootprints-outline";

/**
 * One tracked building as Control broadcasts it: a small square footprint centred on `centreLng`.
 * Size is irrelevant to every assertion here — only the centre moves — but it is a real polygon so
 * the render path is the production one.
 */
function footprintAt(buildingId: string, centreLng: number, centreLat: number): FeatureCollection {
    const half = DEG_LNG_PER_PX * 30;
    return {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                id: buildingId,
                properties: { building_id: buildingId, alignment_verified: true },
                geometry: {
                    type: "Polygon",
                    coordinates: [
                        [
                            [centreLng - half, centreLat - half],
                            [centreLng + half, centreLat - half],
                            [centreLng + half, centreLat + half],
                            [centreLng - half, centreLat + half],
                            [centreLng - half, centreLat - half],
                        ],
                    ],
                },
            },
        ],
    };
}

/** Drains the microtask queue so `updateLayers`' awaited `ensure*Layer` chain has fully settled. */
async function flush(): Promise<void> {
    for (let i = 0; i < 30; i++) {
        await Promise.resolve();
    }
}

/**
 * What the operator sees. The layer counts as shown only while *both* halves are drawn — see
 * `addCompanionLayer` above.
 */
function footprintLayerShown(): boolean {
    return fakeLayerVisibility.get(FILL_LAYER_ID) === "visible" && fakeLayerVisibility.get(OUTLINE_LAYER_ID) === "visible";
}

/**
 * Pushes a new broadcast collection at Table and lets the render pipeline settle — one "tick" of
 * Python's feed as Table experiences it. `revision` is bumped the way Control bumps it, because
 * reproducing the bug requires reproducing the signal Table was (wrongly) keying off.
 */
async function tick(session: ReturnType<typeof useCollabSessionStore>, collection: FeatureCollection): Promise<void> {
    session.trackedBuildings.footprints = collection;
    session.trackedBuildings.revision += 1;
    await flush();
}

describe("Table's tracked-footprint flash under live camera noise", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        fakeSources.clear();
        fakeLayerVisibility.clear();
        addMapDataSource.mockClear();
        addMapLayer.mockClear();
        addCompanionLayer.mockClear();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
    });

    /**
     * THE BUG, as reported from the rig on 2026-09-07.
     *
     * A block sitting motionless on the table still produces a different coordinate on every
     * frame, because `poseEquals` (collabTracking.ts) compares raw floats and
     * `deriveTrackedFootprint` (collabCalibration.ts) smooths only rotation — "translation always
     * applies on every call". So Control's `structurallyChanged` JSON diff is true every tick and
     * `session.trackedBuildings.revision` climbs without pause (296 -> 297 -> 298...). Anything
     * that resets a hide-timer on `revision` therefore never fires, and the Table behaves as if
     * ALWAYS_VISIBLE were "true".
     *
     * The noise here is a tenth of a pixel: far below anything the operator could see move, and
     * far above float equality.
     */
    test("a motionless block's sub-pixel jitter still lets the layer hide after VITE_COLLAB_TABLE_FOOTPRINT_VISIBLE_SECONDS", async () => {
        vi.stubEnv("VITE_COLLAB_TABLE_FOOTPRINT_ALWAYS_VISIBLE", "false");
        vi.stubEnv("VITE_COLLAB_TABLE_FOOTPRINT_VISIBLE_SECONDS", "2");

        const session = useCollabSessionStore();
        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startRendering("table");
        await flush();

        const restLng = 9.99;
        await tick(session, footprintAt("G01", restLng, 53.55));
        expect(footprintLayerShown()).toBe(true);

        // 60 ticks of camera noise over 3 seconds — past the 2s window, with the block untouched.
        for (let frame = 0; frame < 60; frame++) {
            const jitterPx = frame % 2 === 0 ? 0.1 : -0.1;
            await tick(session, footprintAt("G01", restLng + jitterPx * DEG_LNG_PER_PX, 53.55));
            vi.advanceTimersByTime(50);
            await flush();
        }

        expect(footprintLayerShown()).toBe(false);
    });

    test("a real placement change shows the layer again and restarts the window", async () => {
        vi.stubEnv("VITE_COLLAB_TABLE_FOOTPRINT_ALWAYS_VISIBLE", "false");
        vi.stubEnv("VITE_COLLAB_TABLE_FOOTPRINT_VISIBLE_SECONDS", "2");

        const session = useCollabSessionStore();
        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startRendering("table");
        await flush();

        await tick(session, footprintAt("G01", 9.99, 53.55));
        vi.advanceTimersByTime(3000);
        await flush();
        expect(footprintLayerShown()).toBe(false);

        // The operator slides the block 40px across the projected surface. This is the movement
        // users asked to keep seeing, so it must bring the layer straight back.
        await tick(session, footprintAt("G01", 9.99 + 40 * DEG_LNG_PER_PX, 53.55));
        expect(footprintLayerShown()).toBe(true);

        // Still moving at 40px/tick: the window keeps restarting, so it stays visible well past 2s.
        for (let frame = 1; frame <= 10; frame++) {
            await tick(session, footprintAt("G01", 9.99 + (40 + frame * 40) * DEG_LNG_PER_PX, 53.55));
            vi.advanceTimersByTime(300);
            await flush();
            expect(footprintLayerShown()).toBe(true);
        }

        // Hands off: it hides again once the block settles.
        vi.advanceTimersByTime(2500);
        await flush();
        expect(footprintLayerShown()).toBe(false);
    });

    test("a building appearing flashes the layer even though nothing already on the table moved", async () => {
        vi.stubEnv("VITE_COLLAB_TABLE_FOOTPRINT_ALWAYS_VISIBLE", "false");
        vi.stubEnv("VITE_COLLAB_TABLE_FOOTPRINT_VISIBLE_SECONDS", "2");

        const session = useCollabSessionStore();
        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startRendering("table");
        await flush();

        await tick(session, footprintAt("G01", 9.99, 53.55));
        vi.advanceTimersByTime(3000);
        await flush();
        expect(footprintLayerShown()).toBe(false);

        const withSecondBuilding = footprintAt("G01", 9.99, 53.55);
        withSecondBuilding.features.push(footprintAt("G02", 9.995, 53.552).features[0]);
        await tick(session, withSecondBuilding);

        expect(footprintLayerShown()).toBe(true);
    });

    /**
     * Calibration presentation ends by putting every layer it hid back to `"visible"`
     * (`restoreHiddenLayers`). A hidden footprint layer must not come back with it — on the rig
     * that reads as the flash having silently stopped working after any calibration.
     */
    test("a hidden layer stays hidden after calibration presentation restores every layer it hid", async () => {
        vi.stubEnv("VITE_COLLAB_TABLE_FOOTPRINT_ALWAYS_VISIBLE", "false");
        vi.stubEnv("VITE_COLLAB_TABLE_FOOTPRINT_VISIBLE_SECONDS", "2");

        const session = useCollabSessionStore();
        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startRendering("table");
        await flush();

        await tick(session, footprintAt("G01", 9.99, 53.55));
        vi.advanceTimersByTime(3000);
        await flush();
        expect(footprintLayerShown()).toBe(false);

        // What `restoreHiddenLayers` does on the way out of presentation mode.
        fakeLayerVisibility.set(FILL_LAYER_ID, "visible");
        fakeLayerVisibility.set(OUTLINE_LAYER_ID, "visible");

        // A tick with nothing moved: the block is still where it was.
        await tick(session, footprintAt("G01", 9.99 + 0.1 * DEG_LNG_PER_PX, 53.55));

        expect(footprintLayerShown()).toBe(false);
    });

    test("ALWAYS_VISIBLE=\"true\" keeps the layer on with no jitter and no movement at all", async () => {
        vi.stubEnv("VITE_COLLAB_TABLE_FOOTPRINT_ALWAYS_VISIBLE", "true");
        vi.stubEnv("VITE_COLLAB_TABLE_FOOTPRINT_VISIBLE_SECONDS", "2");

        const session = useCollabSessionStore();
        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startRendering("table");
        await flush();

        await tick(session, footprintAt("G01", 9.99, 53.55));
        vi.advanceTimersByTime(60_000);
        await flush();

        expect(footprintLayerShown()).toBe(true);
    });

    /**
     * ALWAYS_VISIBLE="true" means "always", including after something else on the map hid the
     * layer — `hideNonCalibrationLayers` does exactly that on the way into calibration
     * presentation, and `restoreHiddenLayers` skips any id whose layer no longer exists on the way
     * out. Table then sits there with the layer drawn as "none" while the operator's config says
     * it should be permanently on.
     *
     * The mirror of the ALWAYS_VISIBLE="false" case above: there the danger is a layer that should
     * be hidden coming back, here it is a layer that should be shown staying gone. Both come from
     * the same cause — trusting the in-memory flag instead of asking the map.
     */
    test("ALWAYS_VISIBLE=\"true\" puts the layer back after something else on the map hid it", async () => {
        vi.stubEnv("VITE_COLLAB_TABLE_FOOTPRINT_ALWAYS_VISIBLE", "true");
        vi.stubEnv("VITE_COLLAB_TABLE_FOOTPRINT_VISIBLE_SECONDS", "2");

        const session = useCollabSessionStore();
        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startRendering("table");
        await flush();

        await tick(session, footprintAt("G01", 9.99, 53.55));
        expect(footprintLayerShown()).toBe(true);

        // What `hideNonCalibrationLayers` does, without the restore that should have followed it.
        fakeLayerVisibility.set(FILL_LAYER_ID, "none");
        fakeLayerVisibility.set(OUTLINE_LAYER_ID, "none");

        await tick(session, footprintAt("G01", 9.99, 53.55));

        expect(footprintLayerShown()).toBe(true);
    });
});
