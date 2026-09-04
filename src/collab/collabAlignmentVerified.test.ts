import { createPinia, setActivePinia } from "pinia";
import { describe, expect, test, vi } from "vitest";
import type { Feature, Polygon } from "geojson";

vi.mock("@helpers/toast", () => ({
    useToast: () => ({ add: vi.fn() }),
}));

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

import { useCollabSessionStore, type CollabSceneObject, type CollabTrackingObjectState } from "./stores/collabSession";
import { applyTrackingEvent, useCollabTrackingRenderStore } from "./stores/collabTrackingRender";
import {
    TrackingFeedNormalizer,
    type TrackingMarkerFeatureCollection,
} from "./stores/collabTracking";
import { draftFromStoredCalibration } from "./stores/collabBuildingCalibration";
import type { CollabSyncMessage } from "./stores/collabSync";

/**
 * D1 on the frontend: a building whose heading nobody has ever verified must be visibly different
 * from one that has been measured.
 *
 * Python registers a building by recording whatever heading its block happened to be lying at,
 * and until 2026-09-04 the whole system then treated that as the building's true-north
 * orientation without saying so anywhere. The arithmetic downstream is exact -- which is what made
 * it invisible -- so the only defence is that the unverified state travels all the way from
 * Python's `alignment_verified` to something the operator can see on the table.
 *
 * The chain under test, end to end: wire property -> tracking event -> session slice -> broadcast
 * footprint feature -> the paint expression's input.
 */

function squareFootprint(lng: number, lat: number): Polygon {
    const size = 0.0001;
    return {
        type: "Polygon",
        coordinates: [
            [
                [lng - size, lat - size],
                [lng + size, lat - size],
                [lng + size, lat + size],
                [lng - size, lat + size],
                [lng - size, lat - size],
            ],
        ],
    };
}

function snapshotFeature(markerId: number, alignmentVerified?: boolean) {
    return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [9.99, 53.55] },
        properties: {
            marker_id: markerId,
            rotation: 0,
            building_id: `B-${markerId - 200}`,
            ...(alignmentVerified === undefined ? {} : { alignment_verified: alignmentVerified }),
        },
    };
}

function snapshot(...features: ReturnType<typeof snapshotFeature>[]): TrackingMarkerFeatureCollection {
    return { type: "FeatureCollection", features };
}

describe("alignment_verified crosses the Python boundary", () => {
    test("the normalizer carries it onto the tracking event", () => {
        const normalizer = new TrackingFeedNormalizer(new Map([[200, "B-0"]]));

        const [event] = normalizer.applySnapshot(snapshot(snapshotFeature(200, false)), 0);

        expect(event.alignmentVerified).toBe(false);
    });

    test("a verified building says so rather than saying nothing", () => {
        const normalizer = new TrackingFeedNormalizer(new Map([[200, "B-0"]]));

        const [event] = normalizer.applySnapshot(snapshot(snapshotFeature(200, true)), 0);

        expect(event.alignmentVerified).toBe(true);
    });

    test("an older server that sends no such property is not reported as unverified", () => {
        // Upgrading the frontend alone must not turn a working table red; `undefined` is
        // "not stated", which is a different thing from `false`.
        const normalizer = new TrackingFeedNormalizer(new Map([[200, "B-0"]]));

        const [event] = normalizer.applySnapshot(snapshot(snapshotFeature(200)), 0);

        expect(event.alignmentVerified).toBeUndefined();
    });

    test("applyTrackingEvent keeps it on the session slice", () => {
        const tracking: Record<string, CollabTrackingObjectState> = {};

        applyTrackingEvent(tracking, {
            type: "appeared",
            objectId: "B-0",
            pose: { lng: 9.99, lat: 53.55, rotation: 0 },
            confidence: 1,
            timestamp: 0,
            alignmentVerified: false,
        });

        expect(tracking["B-0"]?.alignmentVerified).toBe(false);
    });
});

describe("an unverified building is marked on the render products", () => {
    async function renderedProducts(alignmentVerified: boolean | undefined) {
        localStorage.clear();
        setActivePinia(createPinia());
        const session = useCollabSessionStore();
        const objects: CollabSceneObject[] = [
            { id: "B-0", geometry: squareFootprint(9.99, 53.55), properties: { marker_id: 200 } },
        ];
        session.base.objects = objects;
        session.tracking["B-0"] = {
            pose: { lng: 9.99, lat: 53.55, rotation: 0 },
            confidence: 1,
            lastSeen: 0,
            alignmentVerified,
        };
        useCollabTrackingRenderStore().startRendering("control");
        for (let i = 0; i < 30; i++) {
            await Promise.resolve();
        }
        return session.trackedBuildings;
    }

    test("the broadcast footprint carries the flag, so Table sees it too", async () => {
        // Table renders Control's broadcast collection and has no tracking slice of its own, so a
        // flag left off the feature would leave the projected surface -- the thing the operator is
        // actually looking at -- as the one place an unverified building still looked verified.
        const products = await renderedProducts(false);

        const [footprint] = products.footprints.features as Feature[];
        expect(footprint.properties?.alignment_verified).toBe(false);
    });

    test("a verified building's footprint is not flagged", async () => {
        const products = await renderedProducts(true);

        const [footprint] = products.footprints.features as Feature[];
        expect(footprint.properties?.alignment_verified).toBe(true);
    });

    test("the id label says which building is still a guess", async () => {
        const products = await renderedProducts(false);

        const [id] = products.ids.features as Feature[];
        expect(id.properties?.label).toContain("B-0");
        expect(id.properties?.label).not.toBe("B-0");
    });

    test("a verified building's label is just its id", async () => {
        const products = await renderedProducts(true);

        const [id] = products.ids.features as Feature[];
        expect(id.properties?.label).toBe("B-0");
    });

    test("an older server's silence leaves the label and footprint alone", async () => {
        const products = await renderedProducts(undefined);

        const [id] = products.ids.features as Feature[];
        const [footprint] = products.footprints.features as Feature[];
        expect(id.properties?.label).toBe("B-0");
        expect(footprint.properties?.alignment_verified).toBeUndefined();
    });
});

describe("the panel's draft survives an unmeasured rotation offset", () => {
    test("a null rotation offset opens the draft at neutral, not at NaN", () => {
        // The panel always sends all four fields, so the operator's first save is by construction
        // the measurement that makes the building aligned. What must not happen is the *catalog*
        // holding a zero nobody measured -- and that is Python's `None`, not this draft.
        const draft = draftFromStoredCalibration({
            rotation_offset_deg: null,
            offset_east_mm: 0.7,
            offset_north_mm: -0.24,
            scale_residual: 1.01,
        });

        expect(draft.rotationOffsetDeg).toBe(0);
        expect(draft.offsetEastMm).toBe(0.7);
        expect(draft.scaleResidual).toBe(1.01);
    });

    test("a measured zero is still a measured zero", () => {
        const draft = draftFromStoredCalibration({
            rotation_offset_deg: 0,
            offset_east_mm: 0,
            offset_north_mm: 0,
            scale_residual: 1,
        });

        expect(draft.rotationOffsetDeg).toBe(0);
    });
});

describe("the registration target reaches the table", () => {
    async function controlStore(sessionScale: number | null) {
        localStorage.clear();
        setActivePinia(createPinia());
        const session = useCollabSessionStore();
        session.base.objects = [
            { id: "B-0", geometry: squareFootprint(9.99, 53.55), properties: { marker_id: 200 } },
        ];
        const store = useCollabTrackingRenderStore();
        store.startRendering("control");
        for (let i = 0; i < 30; i++) {
            await Promise.resolve();
        }
        // Set after `startRendering`, which resets the calibration slice -- and that is the real
        // order too: a calibration is accepted while the window is already rendering.
        session.calibration.aoi = {
            corners: [
                [10.0095, 53.573],
                [10.012, 53.573],
                [10.012, 53.5744],
                [10.0095, 53.5744],
            ],
        };
        if (sessionScale !== null) {
            store.sessionModelScaleFactor = sessionScale;
        }
        for (let i = 0; i < 30; i++) {
            await Promise.resolve();
        }
        return { store, session };
    }

    test("picking a building draws the target without any tracking activity at all", async () => {
        // The regression this exists for: Control's render watcher listed
        // [base, tracking, calibration, debugOverlays] and nothing else, so picking a building
        // changed no watched source and never redrew. Nothing else would do it either — a block
        // sitting still emits no tracking events, so `session.tracking` stops mutating exactly
        // when the operator has settled the block and gone looking for the target.
        const { store, session } = await controlStore(0.5);

        store.startBuildingRegistration("G11");
        for (let i = 0; i < 30; i++) {
            await Promise.resolve();
        }

        expect(session.trackedBuildings.registrationTarget.features).toHaveLength(1);
    });

    test("the target is the picked building, shrunk to the block's size", async () => {
        const { store, session } = await controlStore(0.5);

        store.startBuildingRegistration("G11");
        for (let i = 0; i < 30; i++) {
            await Promise.resolve();
        }

        const [target] = session.trackedBuildings.registrationTarget.features;
        expect(target.id).toBe("G11");
        expect((target.properties as { building_id?: string }).building_id).toBe("G11");
    });

    test("the target lands inside the AOI, not at the building's real coordinates", async () => {
        // G11 really sits at lat 53.5339; the rig's AOI is at 53.5737, 4.4 km north. Drawn at its
        // true location the target rendered perfectly and entirely off the table, which is exactly
        // what "the turquoise outline never appears" looked like at the rig.
        const { store, session } = await controlStore(0.5);

        store.startBuildingRegistration("G11");
        for (let i = 0; i < 30; i++) {
            await Promise.resolve();
        }

        const [target] = session.trackedBuildings.registrationTarget.features;
        const ring = (target.geometry as { coordinates: number[][][] }).coordinates[0];
        for (const [lng, lat] of ring) {
            expect(lat).toBeGreaterThan(53.573);
            expect(lat).toBeLessThan(53.575);
            expect(lng).toBeGreaterThan(10.009);
            expect(lng).toBeLessThan(10.013);
        }
    });

    test("with no AOI the target falls back to where a block is actually being tracked", async () => {
        // A target that renders correctly somewhere the operator is not looking is
        // indistinguishable from one that never rendered. If a block is on the table, that
        // block's position is guaranteed to be on the table.
        const { store, session } = await controlStore(0.5);
        session.calibration.aoi = null;
        session.tracking["B-0"] = {
            pose: { lng: 10.0107, lat: 53.5737, rotation: 0 },
            confidence: 1,
            lastSeen: 0,
        };
        store.startBuildingRegistration("G11");
        for (let i = 0; i < 30; i++) {
            await Promise.resolve();
        }

        const [target] = session.trackedBuildings.registrationTarget.features;
        const ring = (target.geometry as { coordinates: number[][][] }).coordinates[0];
        for (const [, lat] of ring) {
            expect(lat).toBeGreaterThan(53.573);
            expect(lat).toBeLessThan(53.575);
        }
    });

    test("with neither an AOI nor a tracked block there is simply no target", async () => {
        const { store, session } = await controlStore(0.5);
        session.calibration.aoi = null;
        store.startBuildingRegistration("G11");
        for (let i = 0; i < 30; i++) {
            await Promise.resolve();
        }

        expect(session.trackedBuildings.registrationTarget.features).toEqual([]);
    });

    test("cancelling clears the target off the table", async () => {
        const { store, session } = await controlStore(0.5);
        store.startBuildingRegistration("G11");
        for (let i = 0; i < 30; i++) {
            await Promise.resolve();
        }

        store.cancelBuildingRegistration();
        for (let i = 0; i < 30; i++) {
            await Promise.resolve();
        }

        expect(session.trackedBuildings.registrationTarget.features).toEqual([]);
    });

    test("with no scale known there is no target rather than a wrongly-sized one", async () => {
        // An operator will align a block to whatever is drawn, so a target at the wrong size
        // produces a wrong reference with nothing on screen to say so.
        const { store, session } = await controlStore(null);

        store.startBuildingRegistration("G11");
        for (let i = 0; i < 30; i++) {
            await Promise.resolve();
        }

        expect(store.registrationScaleFactor()).toBeNull();
        expect(session.trackedBuildings.registrationTarget.features).toEqual([]);
    });

    test("a tracked building's published factor answers the scale question too", async () => {
        // Keeps the panel working against a server that predates the `session_state` message.
        const { store, session } = await controlStore(null);
        session.tracking["B-0"] = {
            pose: { lng: 9.99, lat: 53.55, rotation: 0 },
            confidence: 1,
            lastSeen: 0,
            modelScaleFactor: 0.5632,
        };

        expect(store.registrationScaleFactor()).toBeCloseTo(0.5632, 6);
    });

    test("is not also drawn from live tracking while its target is projected", async () => {
        // Two G11s on the table at once: the cyan target the operator is aiming at, and the same
        // building drawn red at wherever Python currently thinks the block is. The red one is
        // drawn from the very reference the operator is in the middle of replacing, so it is both
        // wrong and the most eye-catching thing on the table. Reported from the rig as simply
        // confusing, which is the kindest possible reading of "the projection contradicts the
        // instructions".
        const { store, session } = await controlStore(0.5);
        const blockAt = (lng: number, lat: number): CollabTrackingObjectState => ({
            pose: { lng, lat, rotation: 0 },
            confidence: 1,
            lastSeen: 0,
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [lng - 0.0001, lat - 0.0001],
                        [lng + 0.0001, lat - 0.0001],
                        [lng + 0.0001, lat + 0.0001],
                        [lng - 0.0001, lat + 0.0001],
                        [lng - 0.0001, lat - 0.0001],
                    ],
                ],
            },
        });
        session.tracking["G11"] = blockAt(10.0107, 53.5737);
        session.tracking["G07"] = blockAt(10.0109, 53.5739);
        for (let i = 0; i < 30; i++) {
            await Promise.resolve();
        }

        store.startBuildingRegistration("G11");
        for (let i = 0; i < 30; i++) {
            await Promise.resolve();
        }

        const drawn = session.trackedBuildings.footprints.features.map((feature) => feature.id);
        expect(drawn).not.toContain("G11");
        // Every other block stays: they are not what the operator is aiming at, and hiding the
        // table wholesale would take away the context that says which way round it is.
        expect(drawn).toContain("G07");

        store.cancelBuildingRegistration();
        for (let i = 0; i < 30; i++) {
            await Promise.resolve();
        }

        expect(session.trackedBuildings.footprints.features.map((feature) => feature.id)).toContain("G11");
        store.stop();
    });
});

describe("the Table window actually draws the registration target", () => {
    test("Table renders the broadcast target, which is the surface the block is aligned against", async () => {
        // The panel lives on Control, but the projection the operator physically lays the block
        // against is the Table. A target that reaches only Control is an instruction shown to
        // nobody, which is exactly how this failed in the rig.
        localStorage.clear();
        setActivePinia(createPinia());
        const session = useCollabSessionStore();
        const target = {
            type: "FeatureCollection" as const,
            features: [
                {
                    type: "Feature" as const,
                    id: "G11",
                    properties: { building_id: "G11" },
                    geometry: squareFootprint(9.99, 53.55),
                },
            ],
        };
        session.trackedBuildings.registrationTarget = target;
        session.trackedBuildings.revision = 1;

        const store = useCollabTrackingRenderStore();
        store.startRendering("table");
        for (let i = 0; i < 60; i++) {
            await Promise.resolve();
        }

        expect(fakeSources.has("collabRegistrationTarget")).toBe(true);
        expect(fakeSources.get("collabRegistrationTarget")?.setData).toHaveBeenCalledWith(target);

        store.stop();
    });
});

describe("a Table recovering an older stored snapshot", () => {
    test("a snapshot written before registrationTarget existed does not break the Table", async () => {
        // `startAsTable` recovers from localStorage before it has heard from Control, and that
        // stored snapshot was written by whatever version last ran. Dereferencing a field an older
        // snapshot has never heard of throws inside `applySnapshot`, which `startAsTable` does not
        // catch — so the channel subscription below it is never made and the Table silently never
        // syncs again, for a reason that looks nothing like "an upgrade added a field".
        localStorage.clear();
        setActivePinia(createPinia());
        localStorage.setItem(
            "tosca-collab-session-snapshot",
            JSON.stringify({
                base: { loaded: true, objects: [] },
                tracking: {},
                calibration: {
                    rotationOffsetDeg: 0,
                    aoi: null,
                    phase: "idle",
                    revision: 0,
                    mapCalibrationMarkerIdsSeen: [],
                    resetPositionsToken: 0,
                },
                tableRender: { visibleLayerIds: [] },
                // Exactly the shape the previous release wrote: no registrationTarget.
                trackedBuildings: {
                    footprints: { type: "FeatureCollection", features: [] },
                    ids: { type: "FeatureCollection", features: [] },
                    revision: 3,
                },
            })
        );

        const { useCollabSyncStore } = await import("./stores/collabSync");
        const sync = useCollabSyncStore();
        const session = useCollabSessionStore();

        const [tableChannel] = PairedTestChannel.createPair<CollabSyncMessage>();
        expect(() => sync.startAsTable(tableChannel)).not.toThrow();
        expect(session.trackedBuildings.registrationTarget).toEqual({
            type: "FeatureCollection",
            features: [],
        });
        expect(session.trackedBuildings.revision).toBe(3);

        sync.stop();
        localStorage.clear();
    });
});

/** Minimal in-memory channel pair (mirrors collabSync.test.ts / collabRegression.test.ts). */
class PairedTestChannel<TMessage> {
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
        for (const listener of this.peer?.listeners ?? []) {
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

describe("a registration that gets no answer", () => {
    test("stops waiting and says why, instead of spinning forever", async () => {
        // The failure this exists for: a server that does not know `register_building` logs
        // "unknown message type" to its own console and replies nothing at all. From the
        // operator's side that is indistinguishable from a button that does not work — which is
        // exactly how it was reported. Waiting is a state that has to be able to end.
        vi.useFakeTimers();
        try {
            localStorage.clear();
            setActivePinia(createPinia());
            const store = useCollabTrackingRenderStore();
            store.startRendering("control");
            for (let i = 0; i < 30; i++) {
                await Promise.resolve();
            }

            store.startBuildingRegistration("G11");
            store.confirmBuildingRegistration();

            // Offline in this harness (no socket), so it refuses immediately and names that.
            expect(store.buildingRegistration.phase).toBe("refused");
            expect(store.buildingRegistration.message).toBeTruthy();

            store.stop();
        } finally {
            vi.useRealTimers();
        }
    });

    test("confirming with no building picked does nothing at all", async () => {
        localStorage.clear();
        setActivePinia(createPinia());
        const store = useCollabTrackingRenderStore();
        store.startRendering("control");
        for (let i = 0; i < 30; i++) {
            await Promise.resolve();
        }

        store.confirmBuildingRegistration();

        expect(store.buildingRegistration.phase).toBe("idle");
        store.stop();
    });
});

describe("naming the block instead of aiming at it", () => {
    // The 2026-09-04 rig failure: the block sat dead centre on the turquoise and Python still
    // said "the nearest (marker 182) is 37.4 cm away". Proximity runs through the AOI-centre ->
    // projector -> table -> camera -> pixel chain, and when any link is off the refusal is
    // identical and unactionable. Naming the id is the way out of a stuck table.
    test("markers_on_table starts unheard, so an empty list can mean an empty table", async () => {
        localStorage.clear();
        setActivePinia(createPinia());
        const store = useCollabTrackingRenderStore();
        store.startRendering("control");
        for (let i = 0; i < 30; i++) {
            await Promise.resolve();
        }

        expect(store.markersOnTable).toBeNull();

        store.stop();
    });

    test("the chosen marker survives being picked, and clears with the panel", async () => {
        localStorage.clear();
        setActivePinia(createPinia());
        const store = useCollabTrackingRenderStore();
        store.startRendering("control");
        for (let i = 0; i < 30; i++) {
            await Promise.resolve();
        }

        store.startBuildingRegistration("G11");
        store.chooseRegistrationMarker(18);
        expect(store.buildingRegistration.chosenMarkerId).toBe(18);

        // Re-opening on another building must not carry the previous block's id across: that
        // would file one block's heading as a different building's true-north reference.
        store.startBuildingRegistration("G07");
        expect(store.buildingRegistration.chosenMarkerId).toBeNull();

        store.cancelBuildingRegistration();
        expect(store.buildingRegistration.chosenMarkerId).toBeNull();

        store.stop();
    });
});
