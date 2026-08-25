import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick } from "vue";
import bbox from "@turf/bbox";
import bearing from "@turf/bearing";
import { point } from "@turf/helpers";
import type { Polygon, Position } from "geojson";
import type { CollabChannel } from "./helpers/collabChannel";
import type { CollabBuildingFixtureProperties } from "./fixtures/collabBuildingFixture";

vi.mock("@helpers/toast", () => ({
    useToast: () => ({ add: vi.fn() }),
}));

/**
 * Hardware-free replay/regression matrix for the TOSCA Collab PoC (final fix pass, A1-A8).
 * Everything here exercises the ACTUAL Python/server tracking contract (`FeatureCollection` of
 * `{marker_id, rotation}` Point features, `map_calibration` handshake) via the real stores/
 * adapters — never a simplified stand-in protocol.
 *
 * Coverage index (17 required scenarios). Several are already covered by focused unit tests
 * elsewhere and are only cross-referenced here (not duplicated) to keep this file about
 * integration between stores, which is what a pure-unit test can't exercise:
 *   1  AOI selection -> map_calibration ................... this file, "AOI + map_calibration"
 *   2  marker_id -> correct known building ................. this file, "20 tracked buildings"
 *   3  center update -> footprint translation .............. this file, "translation/rotation"
 *   4  rotation update -> footprint rotation ............... this file, "translation/rotation"
 *   5  ~20 simultaneous tracked objects ..................... this file, "20 tracked buildings"
 *   6  Control debug layers present ......................... this file, "layer policy"
 *   7  Table technical/debug overlays absent ................ this file, "layer policy"
 *   8  Control/Table synchronization ........................ this file, "sync"
 *   9  genuine object disappearance .......................... collabTracking.test.ts (presence+timeout);
 *                                                               collabTrackingRender.test.ts (store-level)
 *   10 Table reload/snapshot recovery ........................ this file, "sync"; collabSync.test.ts
 *   11 pre-calibration raw dict / malformed JSON ignored ..... collabTracking.test.ts
 *   12 calibration-marker suppression -> poses preserved ..... collabTracking.test.ts (A3)
 *   13 Table viewport -> selected AOI ........................ this file, "AOI + map_calibration"
 *   14 WebSocket disconnect -> poses preserved ............... collabTracking.test.ts (A3)
 *   15 +/-180 deg rotation threshold ......................... collabCalibration.test.ts (A5)
 *   16 Control orientation arrow alignment ................... this file, "orientation arrow"
 *   17 concurrent MapLibre layer/source initialization ....... this file, "concurrent layer init"
 */

const { addMapDataSource, addMapLayer, addCompanionLayer, fakeSources } = vi.hoisted(() => {
    const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
    return {
        fakeSources: sources,
        addMapDataSource: vi.fn(async ({ identifier }: { identifier: string }) => {
            await Promise.resolve();
            await Promise.resolve();
            sources.set(identifier, { setData: vi.fn() });
        }),
        addMapLayer: vi.fn(async () => {
            await Promise.resolve();
        }),
        addCompanionLayer: vi.fn(),
    };
});

vi.mock("@store/map", () => ({
    useMapStore: () => ({
        map: {
            getSource: (id: string) => fakeSources.get(id),
            getLayer: () => undefined,
            isStyleLoaded: () => true,
            on: () => {},
            off: () => {},
        },
        addMapDataSource,
        addMapLayer,
        addCompanionLayer,
    }),
}));

import { useCollabSessionStore, DEFAULT_COLLAB_LAYER_POLICY, type CollabSceneObject } from "./stores/collabSession";
import { useCollabScenarioStore, extentFromPolygon, isAspectRatioValid, toFeature } from "./stores/collabScenario";
import { useCollabSyncStore, type CollabSyncMessage } from "./stores/collabSync";
import {
    useCollabTrackingRenderStore,
    buildMarkerRegistryFromBase,
    applyTrackingEvent,
    orientationArrowTip,
} from "./stores/collabTrackingRender";
import {
    buildMapCalibration,
    aoiBoundingBox,
    deriveTrackedFootprint,
    DEFAULT_COLLAB_TABLE_CONFIG,
} from "./stores/collabCalibration";
import { TrackingFeedNormalizer, type TrackingMarkerFeatureCollection } from "./stores/collabTracking";

/** Deterministic in-memory {@link CollabChannel} pair (mirrors collabSync.test.ts). */
class PairedTestChannel<TMessage> implements CollabChannel<TMessage> {
    private listeners: Array<(message: TMessage) => void> = [];
    private peer: PairedTestChannel<TMessage> | undefined;

    static createPair<T>(): [PairedTestChannel<T>, PairedTestChannel<T>] {
        const a = new PairedTestChannel<T>();
        const b = new PairedTestChannel<T>();
        a.peer = b;
        b.peer = a;
        return [a, b];
    }

    publish(message: TMessage): void {
        this.peer?.deliver(message);
    }

    private deliver(message: TMessage): void {
        for (const listener of this.listeners) {
            listener(message);
        }
    }

    subscribe(listener: (message: TMessage) => void): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter((candidate) => candidate !== listener);
        };
    }

    close(): void {
        this.listeners = [];
    }
}

const BUILDING_COUNT = 18;

/** A square footprint centred at `[lng, lat]`, ~10m across — enough for bbox/translate math to be meaningful. */
function squareFootprint(lng: number, lat: number): Polygon {
    const d = 0.00005;
    return {
        type: "Polygon",
        coordinates: [
            [
                [lng - d, lat - d],
                [lng + d, lat - d],
                [lng + d, lat + d],
                [lng - d, lat + d],
                [lng - d, lat - d],
            ],
        ],
    };
}

/** `BUILDING_COUNT` distinct buildings, each with a distinct `marker_id`, spread across a small AOI. */
function makeBuildings(): CollabSceneObject[] {
    const buildings: CollabSceneObject[] = [];
    for (let i = 0; i < BUILDING_COUNT; i++) {
        const lng = 9.99 + i * 0.0002;
        const lat = 53.55;
        const properties: CollabBuildingFixtureProperties = {
            id: `B-${i}`,
            marker_id: 200 + i,
            building_height: 10,
            floor_area: 100,
            number_of_stories: 3,
            land_use_suggested: "residential",
        };
        buildings.push({ id: `B-${i}`, geometry: squareFootprint(lng, lat), properties });
    }
    return buildings;
}

function trackingFeatureCollection(
    features: readonly { markerId: number; lng: number; lat: number; rotation: number }[]
): TrackingMarkerFeatureCollection {
    return {
        type: "FeatureCollection",
        features: features.map((f) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [f.lng, f.lat] },
            properties: { marker_id: f.markerId, rotation: f.rotation },
        })),
    };
}

beforeEach(() => {
    setActivePinia(createPinia());
    fakeSources.clear();
    addMapDataSource.mockClear();
    addMapLayer.mockClear();
    addCompanionLayer.mockClear();
});

describe("1/13 AOI + map_calibration + Table viewport", () => {
    test("a valid AOI selection produces map_calibration and, once broadcast, the Table can derive its viewport bounds from it", () => {
        const scenarioStore = useCollabScenarioStore();
        const session = useCollabSessionStore();
        const trackingRender = useCollabTrackingRenderStore();

        // 160x80cm table -> 2:1 AOI. Sized so geodesic width:height is ~2:1 at this latitude
        // (a naive equal-degree box would not be, since a degree of longitude is shorter here).
        const aoiMinLng = 9.98;
        const aoiMinLat = 53.55;
        const aoiMaxLat = 53.551;
        const aoiMaxLng = aoiMinLng + 2 * (aoiMaxLat - aoiMinLat) * (111320 / 66200);
        const drawn: Position[][] = [
            [
                [aoiMinLng, aoiMaxLat],
                [aoiMaxLng, aoiMaxLat],
                [aoiMaxLng, aoiMinLat],
                [aoiMinLng, aoiMinLat],
                [aoiMinLng, aoiMaxLat],
            ],
        ];
        const extent = extentFromPolygon({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: drawn } });
        expect(isAspectRatioValid(extent, DEFAULT_COLLAB_TABLE_CONFIG)).toBe(true);

        scenarioStore.aoi = extent;
        scenarioStore.mapCalibration = buildMapCalibration(extent, DEFAULT_COLLAB_TABLE_CONFIG);

        // Scenario 1: TOSCA sent exactly the map_calibration handshake Python expects.
        expect(scenarioStore.mapCalibration.type).toBe("map_calibration");
        expect(scenarioStore.mapCalibration.points).toHaveLength(4);

        // Control mirrors the AOI into the broadcast session slice (A1/A2) — Table never selects its own.
        trackingRender.startRendering("control");
        expect(session.calibration.aoi).toEqual(extent);

        // Scenario 13: the Table window derives its viewport bounds from that same broadcast AOI.
        const [minLng, minLat, maxLng, maxLat] = aoiBoundingBox(session.calibration.aoi!);
        const [expMinLng, expMinLat, expMaxLng, expMaxLat] = bbox({
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [[...extent.corners, extent.corners[0]]] },
        });
        expect([minLng, minLat, maxLng, maxLat]).toEqual([expMinLng, expMinLat, expMaxLng, expMaxLat]);
    });
});

describe("2/5 marker_id -> known building at ~20-object scale", () => {
    test("every one of 18 simultaneous tracked markers resolves to its own known building, none dropped or cross-mapped", () => {
        const session = useCollabSessionStore();
        session.base.objects = makeBuildings();
        session.base.loaded = true;

        const registry = buildMarkerRegistryFromBase(session.base.objects);
        expect(registry.size).toBe(BUILDING_COUNT);

        const normalizer = new TrackingFeedNormalizer(registry);
        const snapshot = trackingFeatureCollection(
            session.base.objects.map((object, i) => {
                const [lng, lat] = bbox(toFeature(object));
                return { markerId: 200 + i, lng, lat, rotation: 0 };
            })
        );
        const events = normalizer.applySnapshot(snapshot, 0);

        expect(events).toHaveLength(BUILDING_COUNT);
        expect(events.every((e) => e.type === "appeared")).toBe(true);
        expect(new Set(events.map((e) => e.objectId)).size).toBe(BUILDING_COUNT);
        for (let i = 0; i < BUILDING_COUNT; i++) {
            expect(events.find((e) => e.objectId === `B-${i}`)).toBeDefined();
        }
    });
});

describe("3/4 translation + rotation from a tracked pose", () => {
    test("a center update translates the known footprint and a rotation update rotates it, via the same pipeline session.tracking feeds", () => {
        const session = useCollabSessionStore();
        session.base.objects = makeBuildings();
        const building = session.base.objects[0]!;
        const known = toFeature(building) as import("@helpers/geojson").Feature<Polygon>;

        // A nearby move (a few hundred metres) — representative of a physical object being
        // repositioned on the table, unlike a many-kilometre jump geodesic translate/rotate
        // isn't expected to invert with sub-metre precision over.
        const target: Position = [9.9915, 53.5508];
        applyTrackingEvent(session.tracking, {
            type: "appeared",
            objectId: building.id,
            pose: { lng: target[0], lat: target[1], rotation: 0 },
            confidence: 1,
            timestamp: 0,
        });
        const { feature: translated } = deriveTrackedFootprint(known, session.tracking[building.id]!.pose, undefined, 0);
        const [minX, minY, maxX, maxY] = bbox(translated);
        expect((minX + maxX) / 2).toBeCloseTo(target[0], 3);
        expect((minY + maxY) / 2).toBeCloseTo(target[1], 3);

        applyTrackingEvent(session.tracking, {
            type: "updated",
            objectId: building.id,
            pose: { lng: target[0], lat: target[1], rotation: 90 },
            confidence: 1,
            timestamp: 100,
        });
        const { appliedRotationDeg } = deriveTrackedFootprint(known, session.tracking[building.id]!.pose, undefined, 0);
        expect(appliedRotationDeg).toBe(90);
    });
});

describe("Phase 4 (ticket 13): tracked buildings computed once in Control, broadcast, structurally equal on Table", () => {
    test("Control derives the tracked-building GeoJSON once and broadcasts it; Table renders that exact collection instead of deriving its own", async () => {
        localStorage.clear();

        setActivePinia(createPinia());
        const controlSession = useCollabSessionStore();
        const controlSync = useCollabSyncStore();
        controlSession.base.objects = makeBuildings();
        controlSession.tracking["B-0"] = { pose: { lng: 9.9905, lat: 53.5502, rotation: 20 }, confidence: 1, lastSeen: 0 };
        controlSession.tracking["B-1"] = { pose: { lng: 9.9925, lat: 53.5498, rotation: -10 }, confidence: 1, lastSeen: 0 };
        const controlTrackingRender = useCollabTrackingRenderStore();
        controlTrackingRender.startRendering("control");

        for (let i = 0; i < 30; i++) {
            await Promise.resolve();
        }

        // Control derived (and published) the tracked-building collection exactly once here.
        expect(controlSession.trackedBuildings.footprints.features).toHaveLength(2);
        expect(controlSession.trackedBuildings.revision).toBeGreaterThan(0);
        const controlFootprints = JSON.parse(JSON.stringify(controlSession.trackedBuildings.footprints));
        const controlRevision = controlSession.trackedBuildings.revision;

        setActivePinia(createPinia());
        const tableSession = useCollabSessionStore();
        const tableSync = useCollabSyncStore();
        const tableTrackingRender = useCollabTrackingRenderStore();

        const [controlChannel, tableChannel] = PairedTestChannel.createPair<CollabSyncMessage>();
        controlSync.startAsControl(controlChannel);
        tableSync.startAsTable(tableChannel);
        await nextTick();

        // Same revision -> structurally equal tracked-building GeoJSON, straight off the broadcast.
        expect(tableSession.trackedBuildings.revision).toBe(controlRevision);
        expect(tableSession.trackedBuildings.footprints).toEqual(controlFootprints);

        // Isolate Table's own render pass from Control's map-mock calls before proving it renders
        // exactly the broadcast collection, without deriving anything itself.
        fakeSources.clear();
        addMapDataSource.mockClear();
        addMapLayer.mockClear();

        tableTrackingRender.startRendering("table");
        for (let i = 0; i < 60; i++) {
            await Promise.resolve();
        }

        const tableFootprintSource = fakeSources.get("collabTrackedFootprints");
        expect(tableFootprintSource?.setData).toHaveBeenCalledWith(controlFootprints);

        // Table's render pass must not have touched the broadcast slice — it only ever reads it.
        expect(tableSession.trackedBuildings.footprints).toEqual(controlFootprints);
        expect(tableSession.trackedBuildings.revision).toBe(controlRevision);

        controlTrackingRender.stop();
        tableTrackingRender.stop();
        controlSync.stop();
        tableSync.stop();
    });
});

describe("6/7 layer policy: Control debug layers present, Table only gets footprints + centre points", () => {
    test("Control sees every technical overlay; Table sees footprints and building centre points, nothing else (plan §13 M1 default)", () => {
        const session = useCollabSessionStore();
        expect(session.layerPolicy).toEqual(DEFAULT_COLLAB_LAYER_POLICY);

        for (const debugLayer of ["trackedBbox", "trackedOrientation", "trackedConfidence"] as const) {
            expect(session.isLayerVisible(debugLayer, "control")).toBe(true);
            expect(session.isLayerVisible(debugLayer, "table")).toBe(false);
        }
        // trackedId (each tracked building's centre point) is shown on both views — the Table/
        // projector displays building centroid data, not just footprints.
        expect(session.isLayerVisible("trackedId", "control")).toBe(true);
        expect(session.isLayerVisible("trackedId", "table")).toBe(true);
        expect(session.isLayerVisible("trackedFootprint", "table")).toBe(true);
        expect(session.isLayerVisible("scenarioFootprint", "table")).toBe(true);
    });

    test("startRendering('table') renders the broadcast trackedId collection into the map layer, not just the policy flag", async () => {
        const session = useCollabSessionStore();
        session.base.objects = makeBuildings();
        const building = session.base.objects[0]!;
        session.tracking[building.id] = { pose: { lng: 9.99, lat: 53.55, rotation: 0 }, confidence: 1, lastSeen: 0 };
        // Table never derives tracked-building geometry itself (ticket 13) — it renders whatever
        // Control already broadcast via session.trackedBuildings, so this test seeds that slice
        // directly (there's no Control instance here) rather than session.tracking alone, or the
        // rendered layer would silently come out empty.
        session.trackedBuildings.ids = {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    id: building.id,
                    properties: { label: building.id },
                    geometry: { type: "Point", coordinates: [9.99, 53.55] },
                },
            ],
        };
        session.trackedBuildings.revision = 1;

        const trackingRender = useCollabTrackingRenderStore();
        trackingRender.startRendering("table");

        for (let i = 0; i < 60; i++) {
            await Promise.resolve();
        }

        expect(fakeSources.has("collabTrackedId")).toBe(true);
        expect(fakeSources.get("collabTrackedId")?.setData).toHaveBeenCalledWith(session.trackedBuildings.ids);
        // Table must not pick up Control-only debug layers while it's at it.
        expect(fakeSources.has("collabTrackedBbox")).toBe(false);
        expect(fakeSources.has("collabTrackedOrientation")).toBe(false);
        expect(fakeSources.has("collabTrackedConfidence")).toBe(false);

        trackingRender.stop();
    });
});

describe("8/10 Control/Table synchronization + snapshot recovery", () => {
    test("Table mirrors Control's AOI/calibration slice live, and a reopened Table recovers it from localStorage", async () => {
        localStorage.clear();

        setActivePinia(createPinia());
        const controlSession = useCollabSessionStore();
        const controlSync = useCollabSyncStore();
        controlSession.calibration.aoi = {
            corners: [
                [9.98, 53.56],
                [10.0, 53.56],
                [10.0, 53.54],
                [9.98, 53.54],
            ],
        };
        controlSession.calibration.rotationOffsetDeg = 3.2;

        setActivePinia(createPinia());
        const tableSession = useCollabSessionStore();
        const tableSync = useCollabSyncStore();

        const [controlChannel, tableChannel] = PairedTestChannel.createPair<CollabSyncMessage>();
        controlSync.startAsControl(controlChannel);
        tableSync.startAsTable(tableChannel);
        await nextTick();

        expect(tableSession.calibration.aoi).toEqual(controlSession.calibration.aoi);
        expect(tableSession.calibration.rotationOffsetDeg).toBeCloseTo(3.2, 5);

        controlSync.stop();
        tableSync.stop();

        // Scenario 10: a freshly (re)loaded Table, with no live Control connection, recovers the
        // last broadcast AOI/calibration from localStorage before ever hearing from Control again.
        setActivePinia(createPinia());
        const reopenedSession = useCollabSessionStore();
        const reopenedSync = useCollabSyncStore();
        const disconnectedChannel = new PairedTestChannel<CollabSyncMessage>();
        reopenedSync.startAsTable(disconnectedChannel);

        expect(reopenedSession.calibration.aoi).toEqual(controlSession.calibration.aoi);
        reopenedSync.stop();
    });

    test("ticket 11: the calibration-presentation flag + revision propagate Control -> Table live, and survive a Table reopen via localStorage", async () => {
        localStorage.clear();

        setActivePinia(createPinia());
        const controlSession = useCollabSessionStore();
        const controlSync = useCollabSyncStore();
        expect(controlSession.calibration.phase).toBe("idle");

        setActivePinia(createPinia());
        const tableSession = useCollabSessionStore();
        const tableSync = useCollabSyncStore();

        const [controlChannel, tableChannel] = PairedTestChannel.createPair<CollabSyncMessage>();
        controlSync.startAsControl(controlChannel);
        tableSync.startAsTable(tableChannel);
        await nextTick();
        expect(tableSession.calibration.phase).toBe("idle");

        // Control (only) flips into presentation mode — Table never writes this itself.
        controlSession.calibration.phase = "presenting";
        controlSession.calibration.revision += 1;
        await nextTick();

        expect(tableSession.calibration.phase).toBe("presenting");
        expect(tableSession.calibration.revision).toBe(controlSession.calibration.revision);

        controlSync.stop();
        tableSync.stop();

        // A reopened Table, with no live Control connection, recovers the presenting phase from
        // localStorage rather than defaulting back to "idle".
        setActivePinia(createPinia());
        const reopenedSession = useCollabSessionStore();
        const reopenedSync = useCollabSyncStore();
        const disconnectedChannel = new PairedTestChannel<CollabSyncMessage>();
        reopenedSync.startAsTable(disconnectedChannel);

        expect(reopenedSession.calibration.phase).toBe("presenting");
        expect(reopenedSession.calibration.revision).toBe(controlSession.calibration.revision);
        reopenedSync.stop();
    });
});

describe("16 Control orientation-arrow datum alignment", () => {
    test("the debug arrow's tip sits on the same rotation datum transformRotate applies to the tracked footprint", () => {
        const centre: Position = [10, 53.5];
        const building: CollabSceneObject = { id: "B-arrow", geometry: squareFootprint(10, 53.5), properties: { marker_id: 1 } };
        const known = toFeature(building) as import("@helpers/geojson").Feature<Polygon>;

        for (const appliedRotationDeg of [0, 37, 90, -128, 179]) {
            const { feature } = deriveTrackedFootprint(known, { lng: 10, lat: 53.5, rotation: appliedRotationDeg }, undefined, 0);
            const tip = orientationArrowTip(centre, appliedRotationDeg);

            // Rebuild the same due-east baseline point the arrow starts from, and rotate it the
            // same way `placeFootprintAt` rotates the footprint (same function, same pivot) — the
            // two must land on the same heading from `centre` for any applied rotation.
            const bearingToTip = bearing(point(centre), point(tip));
            const [minX, minY, maxX, maxY] = bbox(feature);
            const footprintCentre: Position = [(minX + maxX) / 2, (minY + maxY) / 2];
            expect(footprintCentre[0]).toBeCloseTo(centre[0], 5);
            expect(footprintCentre[1]).toBeCloseTo(centre[1], 5);
            // The arrow's heading tracks the applied rotation 1:1 (baseline = due east = +90°).
            expect(((bearingToTip - 90 - appliedRotationDeg + 540) % 360) - 180).toBeCloseTo(0, 3);
        }
    });
});

describe("17 concurrent MapLibre layer/source initialization", () => {
    test("overlapping render passes create each Collab source/layer at most once, and one failing layer doesn't block the rest", async () => {
        const session = useCollabSessionStore();
        session.base.objects = makeBuildings();
        session.tracking["B-0"] = { pose: { lng: 9.99, lat: 53.55, rotation: 0 }, confidence: 1, lastSeen: 0 };

        // Fail the very first bbox-source creation once, to prove a failed layer doesn't wedge the
        // rest of the same render pass (A4) — later ticks may retry it since the lock is released.
        let bboxAttempt = 0;
        addMapDataSource.mockImplementation(async ({ identifier }: { identifier: string }) => {
            if (identifier === "collabTrackedBbox" && bboxAttempt === 0) {
                bboxAttempt += 1;
                throw new Error("simulated duplicate-source failure");
            }
            await Promise.resolve();
            await Promise.resolve();
            fakeSources.set(identifier, { setData: vi.fn() });
        });

        const trackingRender = useCollabTrackingRenderStore();
        // Two overlapping starts -> two concurrent `updateLayers("control")` passes racing to
        // create the same sources before either has finished (Vue's `immediate: true` invokes the
        // watcher synchronously, so both fire before any awaits resolve).
        trackingRender.startRendering("control");
        trackingRender.startRendering("control");

        // Let every pending microtask/mocked-async step settle (six layers deep, each a few ticks).
        for (let i = 0; i < 60; i++) {
            await Promise.resolve();
        }

        const callsPerSource = new Map<string, number>();
        for (const [{ identifier }] of addMapDataSource.mock.calls as [{ identifier: string }][]) {
            callsPerSource.set(identifier, (callsPerSource.get(identifier) ?? 0) + 1);
        }
        for (const [sourceId, count] of callsPerSource) {
            expect(count, `source "${sourceId}" was created more than once by concurrent render ticks`).toBe(1);
        }

        // trackedOrientation (created after trackedBbox in updateLayers' call order) still got
        // established even though trackedBbox's first attempt failed.
        expect(callsPerSource.get("collabTrackedOrientation")).toBe(1);
        expect(fakeSources.has("collabTrackedOrientation")).toBe(true);

        trackingRender.stop();
    });
});

describe("ticket 09: confirmed AOI is a persistent, visible layer", () => {
    test("finishAoiSelection renders a real, layer-list-visible AOI layer entry, distinct from the transient viewfinder", async () => {
        const scenario = useCollabScenarioStore();
        scenario.viewfinderExtent = {
            corners: [
                [9.98, 53.56],
                [10.0114, 53.56],
                [10.0114, 53.55],
                [9.98, 53.55],
            ],
        };
        scenario.viewfinderValid = true;

        expect(scenario.finishAoiSelection()).toBe(true);

        for (let i = 0; i < 30; i++) {
            await Promise.resolve();
        }

        expect(fakeSources.has("collabAoi")).toBe(true);
        const aoiLayerCall = (addMapLayer.mock.calls as unknown as [{ identifier: string; showOnLayerList?: boolean }][]).find(
            ([params]) => params.identifier === "collabAoi-outline"
        );
        expect(aoiLayerCall).toBeDefined();
        // Not explicitly hidden (unlike the transient viewfinder, which sets `showOnLayerList: false`)
        // — defaults to visible, so it shows up as a real entry in Control's layer management.
        expect(aoiLayerCall![0].showOnLayerList).not.toBe(false);
    });
});

describe("ticket 09: no mock/simulation MapLibre layers on the real-table route", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    class FakeSocket {
        onopen: (() => void) | null = null;
        onmessage: ((event: { data: string }) => void) | null = null;
        onclose: (() => void) | null = null;
        onerror: ((event: unknown) => void) | null = null;
        send(): void {}
        close(): void {}
    }

    test("collabSimulationResult is never created on the real-table route, but is created off it", async () => {
        vi.stubEnv("VITE_COLLAB_TRACKING_WS_URL", "ws://table-host:8053");
        vi.stubGlobal("WebSocket", FakeSocket as unknown as typeof WebSocket);

        const realRouteTrackingRender = useCollabTrackingRenderStore();
        realRouteTrackingRender.startRendering("control");
        for (let i = 0; i < 30; i++) {
            await Promise.resolve();
        }
        expect(fakeSources.has("collabSimulationResult")).toBe(false);
        realRouteTrackingRender.stop();

        vi.unstubAllEnvs();
        setActivePinia(createPinia());
        fakeSources.clear();

        const mockRouteTrackingRender = useCollabTrackingRenderStore();
        mockRouteTrackingRender.startRendering("control");
        for (let i = 0; i < 30; i++) {
            await Promise.resolve();
        }
        expect(fakeSources.has("collabSimulationResult")).toBe(true);
        mockRouteTrackingRender.stop();
    });
});
