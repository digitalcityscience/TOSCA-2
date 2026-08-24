import { acceptHMRUpdate, defineStore } from "pinia";
import { onScopeDispose, ref, watch } from "vue";
import bbox from "@turf/bbox";
import { point } from "@turf/helpers";
import transformRotate from "@turf/transform-rotate";
import transformTranslate from "@turf/transform-translate";
import type { Position } from "geojson";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "@helpers/geojson";
import { reportDeveloperError } from "@helpers/userFacingError";
import { resolveCollabTrackingWsUrl } from "../helpers/collabMode";
import { i18n } from "../../core/i18n";
import { useMapStore } from "@store/map";
import { useCollabSessionStore, type CollabSceneObject, type CollabTrackingObjectState } from "./collabSession";
import { toFeature, useCollabScenarioStore, type CollabBuildingObject } from "./collabScenario";
import { deriveTrackedFootprint, tableToAoiRotationOffsetDeg } from "./collabCalibration";
import { maskContextAroundPhysicalFootprints } from "./collabMasking";
import {
    createMarkerObjectRegistry,
    MockTrackingSource,
    REFERENCE_MARKERS,
    RealTrackingSource,
    type MarkerObjectRegistry,
    type MarkerObjectRegistryEntry,
    type MockTrackingSnapshot,
    type PythonConnectionState,
    type TrackingAvailability,
    type TrackingEvent,
} from "./collabTracking";

const REFERENCE_MARKER_IDS: ReadonlySet<number> = new Set(REFERENCE_MARKERS.map((marker) => marker.id));

/**
 * `RealTrackingSource`'s Python transport state, widened with `"mock"` for when
 * `MockTrackingSource` is active (marker-health-plan §1) — the Control panel's "Python" row has
 * nothing to report in that case (there is no `:8053` socket), so the UI treats `"mock"` as "hide
 * this section" rather than inventing a connected/disconnected reading for a transport that
 * doesn't exist.
 */
export type CollabPythonConnectionState = PythonConnectionState | "mock"

const TABLE_SCENARIO_SOURCE_ID = "collabTableScenario";
const TABLE_SCENARIO_FILL_LAYER_ID = "collabTableScenario-fill";
const TABLE_SCENARIO_OUTLINE_LAYER_ID = "collabTableScenario-outline";

const TRACKED_FOOTPRINT_SOURCE_ID = "collabTrackedFootprints";
const TRACKED_FOOTPRINT_FILL_LAYER_ID = "collabTrackedFootprints-fill";
const TRACKED_FOOTPRINT_OUTLINE_LAYER_ID = "collabTrackedFootprints-outline";

const TRACKED_BBOX_SOURCE_ID = "collabTrackedBbox";
const TRACKED_BBOX_LAYER_ID = "collabTrackedBbox-line";

const TRACKED_ORIENTATION_SOURCE_ID = "collabTrackedOrientation";
const TRACKED_ORIENTATION_LAYER_ID = "collabTrackedOrientation-line";

const TRACKED_ID_SOURCE_ID = "collabTrackedId";
const TRACKED_ID_LAYER_ID = "collabTrackedId-symbol";

const TRACKED_CONFIDENCE_SOURCE_ID = "collabTrackedConfidence";
const TRACKED_CONFIDENCE_LAYER_ID = "collabTrackedConfidence-symbol";

const SIMULATION_RESULT_SOURCE_ID = "collabSimulationResult";
const SIMULATION_RESULT_LAYER_ID = "collabSimulationResult-symbol";

/** Demo mock timeline's east offset (metres) for the "moved" snapshot — arbitrary but visible at map scale. */
const DEMO_MOVE_METERS = 5;
/** Demo mock timeline's orientation-indicator line length (metres). */
const ORIENTATION_LINE_METERS = 5;

/**
 * Builds a {@link MarkerObjectRegistry} from the loaded base-city objects' `marker_id` (OD-4,
 * plan §14) — data-driven from whatever AOI/fixture is currently loaded, never a hardcoded
 * mapping. Objects without a numeric `marker_id` are skipped (not every `CollabSceneObject` is a
 * trackable building).
 */
export function buildMarkerRegistryFromBase(objects: readonly CollabSceneObject[]): MarkerObjectRegistry {
    const entries: MarkerObjectRegistryEntry[] = [];
    for (const object of objects) {
        const markerId = (object as Partial<CollabBuildingObject>).properties?.marker_id;
        if (typeof markerId === "number") {
            entries.push({ markerId, objectId: object.id });
        }
    }
    return createMarkerObjectRegistry(entries);
}

/**
 * Applies one {@link TrackingEvent} to the session's `tracking` slice (plan §10/§14): `appeared`/
 * `updated` record the latest pose+confidence+lastSeen, `disappeared` removes the object — the
 * wiring step between ticket 05's adapter and ticket 04's session state.
 */
export function applyTrackingEvent(
    tracking: Record<string, CollabTrackingObjectState>,
    event: TrackingEvent
): void {
    if (event.type === "disappeared") {
        delete tracking[event.objectId];
        return;
    }
    tracking[event.objectId] = { pose: event.pose, confidence: event.confidence, lastSeen: event.timestamp };
}

/**
 * A short demo mock timeline anchored at `anchor` (a known building's centre) — appear, move,
 * rotate 45°, disappear (plan §14 M1 acceptance: appeared/updated(moved)/rotated/disappeared) —
 * so "inject mock building" always lands on real loaded content instead of a hardcoded
 * coordinate.
 */
export function buildDemoMockTimeline(markerId: number, anchor: Position): MockTrackingSnapshot[] {
    const [lng, lat] = anchor;
    const moved = transformTranslate(point(anchor), DEMO_MOVE_METERS, 90, { units: "meters" });
    const [movedLng, movedLat] = moved.geometry.coordinates;
    return [
        { atMs: 0, features: [{ markerId, lng, lat, rotation: 0 }] },
        { atMs: 1000, features: [{ markerId, lng: movedLng, lat: movedLat, rotation: 0 }] },
        { atMs: 2000, features: [{ markerId, lng: movedLng, lat: movedLat, rotation: 45 }] },
        { atMs: 3000, features: [] },
    ];
}

/**
 * The Control-View debug orientation arrow's tip, `appliedRotationDeg` degrees clockwise from
 * `centre` (A6). Rotates a fixed due-east reference segment with `transformRotate` around
 * `centre` — the exact function/pivot semantics `placeFootprintAt` uses to rotate the tracked
 * footprint itself — instead of feeding `appliedRotationDeg` to `transformTranslate` as a compass
 * bearing (0 = north), which used a different rotation datum than the footprint's own transform
 * and made the debug arrow point somewhere other than the footprint's actual heading. This is a
 * Control/debug visualization correction only; it does not touch the tracking protocol or the
 * real hardware rotation sign (deferred to physical-table validation, B1).
 */
export function orientationArrowTip(centre: Position, appliedRotationDeg: number): Position {
    const eastTip = transformTranslate(point(centre), ORIENTATION_LINE_METERS, 90, { units: "meters" });
    const baseline = {
        type: "Feature" as const,
        properties: {},
        geometry: { type: "LineString" as const, coordinates: [centre, eastTip.geometry.coordinates] },
    };
    const rotated = transformRotate(baseline, appliedRotationDeg, { pivot: centre });
    return rotated.geometry.coordinates[1] as Position;
}

/**
 * Wires the mock tracking adapter (ticket 05) into the session (ticket 04) and renders both
 * views from the layer-policy matrix (plan §13, ticket 08 — the M1 tracer bullet). Owned here
 * rather than in `collabScenario`/`collabTracking` because it composes both plus the map store
 * and is genuinely new cross-cutting logic (plan §10 seam rule).
 *
 * - `startMockTracking` starts a {@link MockTrackingSource} and writes its events into
 *   `collabSession.tracking`.
 * - `startRendering(windowKind)` watches session state and renders the Collab layers each window
 *   is allowed to show, per `collabSession.layerPolicy`: Control gets tracked footprint/bbox/
 *   orientation/id/confidence; Table gets only the scenario + tracked footprints.
 *
 * Pose→geometry derivation (translate/rotate + 5° jitter threshold + table→AOI rotation offset)
 * is delegated to `collabCalibration.deriveTrackedFootprint` — this store only wires events,
 * decides per-layer visibility, and pushes GeoJSON through the map store's public API.
 */
export const useCollabTrackingRenderStore = defineStore("collabTrackingRender", () => {
    const session = useCollabSessionStore();
    const scenarioStore = useCollabScenarioStore();
    const mapStore = useMapStore();

    const active = ref(false);
    const trackingAvailability = ref<TrackingAvailability>("live");
    /** Transport state to Python's `:8053` socket (marker-health-plan §1) — independent of `trackingAvailability`. `"mock"` while `MockTrackingSource` is active. */
    const pythonConnectionState = ref<CollabPythonConnectionState>("mock");
    /**
     * Which of `REFERENCE_MARKERS`' corner-marker ids have been seen at least once since tracking
     * started (marker-health-plan §3) — sticky, exactly like Vanilla's `marker-received` CSS class
     * (`COUP-table-web-interface/js/calibration.js:17-22`): once a marker lights up it stays lit for
     * the session, it never reverts on a single missed frame. Cleared back to empty only when
     * tracking (re)starts.
     */
    const detectedReferenceMarkerIds = ref<ReadonlySet<number>>(new Set());
    const appliedRotationByObjectId = new Map<string, number>();
    /** Keyed by source id (A4): the in-flight create-source-and-layer promise, so concurrent render ticks await the same creation instead of both racing `addMapDataSource`. */
    const layerInitInFlight = new Map<string, Promise<void>>();

    let mockSource: MockTrackingSource | undefined;
    let realSource: RealTrackingSource | undefined;
    let stopWatch: (() => void) | undefined;

    function knownFootprint(objectId: string): Feature<Polygon> | undefined {
        const object = session.currentScenario.find((candidate) => candidate.id === objectId);
        return object === undefined ? undefined : (toFeature(object) as Feature<Polygon>);
    }

    function scenarioFeatureCollection(): FeatureCollection {
        return { type: "FeatureCollection", features: session.currentScenario.map(toFeature) };
    }

    /** Derives every tracked object's Control-View render products from session.tracking (plan §13). */
    function trackedRenderState(): {
        footprints: FeatureCollection;
        bboxes: FeatureCollection;
        orientations: FeatureCollection;
        ids: FeatureCollection;
        confidences: FeatureCollection;
    } {
        const offset = session.calibration.rotationOffsetDeg;
        const footprints: Feature[] = [];
        const bboxes: Feature[] = [];
        const orientations: Feature[] = [];
        const ids: Feature[] = [];
        const confidences: Feature[] = [];

        for (const [objectId, tracked] of Object.entries(session.tracking)) {
            const known = knownFootprint(objectId);
            if (known === undefined) {
                continue;
            }

            const previousRotation = appliedRotationByObjectId.get(objectId);
            const { feature, appliedRotationDeg } = deriveTrackedFootprint(
                known,
                tracked.pose,
                previousRotation,
                offset
            );
            appliedRotationByObjectId.set(objectId, appliedRotationDeg);
            footprints.push({ ...feature, id: objectId });

            const [minX, minY, maxX, maxY] = bbox(feature);
            bboxes.push({
                type: "Feature",
                id: objectId,
                properties: {},
                geometry: {
                    type: "Polygon",
                    coordinates: [
                        [
                            [minX, minY],
                            [maxX, minY],
                            [maxX, maxY],
                            [minX, maxY],
                            [minX, minY],
                        ],
                    ],
                },
            });

            const centre: Position = [tracked.pose.lng, tracked.pose.lat];
            orientations.push({
                type: "Feature",
                id: objectId,
                properties: {},
                geometry: { type: "LineString", coordinates: [centre, orientationArrowTip(centre, appliedRotationDeg)] },
            });

            ids.push({
                type: "Feature",
                id: objectId,
                properties: { label: objectId },
                geometry: { type: "Point", coordinates: centre },
            });
            confidences.push({
                type: "Feature",
                id: objectId,
                properties: { label: tracked.confidence.toFixed(2) },
                geometry: { type: "Point", coordinates: centre },
            });
        }

        return {
            footprints: { type: "FeatureCollection", features: footprints },
            bboxes: { type: "FeatureCollection", features: bboxes },
            orientations: { type: "FeatureCollection", features: orientations },
            ids: { type: "FeatureCollection", features: ids },
            confidences: { type: "FeatureCollection", features: confidences },
        };
    }

    /**
     * Derives the Simulation State slice's render product (ticket 11, plan §20 M4): one label
     * point per result, anchored at its scenario object's known footprint centre. Results with no
     * matching scenario object (e.g. a stale run after the object was removed) are skipped.
     */
    function simulationResultFeatureCollection(): FeatureCollection {
        const features: Feature[] = [];
        for (const result of session.simulation.results) {
            const known = knownFootprint(result.objectId);
            if (known === undefined) {
                continue;
            }
            const [minX, minY, maxX, maxY] = bbox(known);
            features.push({
                type: "Feature",
                id: result.objectId,
                properties: { label: String(result.metric) },
                geometry: { type: "Point", coordinates: [(minX + maxX) / 2, (minY + maxY) / 2] },
            });
        }
        return { type: "FeatureCollection", features };
    }

    /**
     * Runs `create` at most once per `key` even when called concurrently (A4): if a creation for
     * `key` is already in flight, later callers await that same promise instead of also calling
     * `addMapDataSource`/`addMapLayer` and racing MapLibre's duplicate-source guard. The in-flight
     * entry is always removed afterwards (success or failure), so a failed creation can be retried
     * on the next render tick rather than wedging `key` forever.
     */
    async function withInitLock(key: string, exists: () => boolean, create: () => Promise<void>): Promise<void> {
        if (exists()) {
            return;
        }
        const pending = layerInitInFlight.get(key);
        if (pending !== undefined) {
            await pending;
            return;
        }
        const promise = create();
        layerInitInFlight.set(key, promise);
        try {
            await promise;
        } finally {
            layerInitInFlight.delete(key);
        }
    }

    async function createGeojsonSourceAndLayer(
        sourceId: string,
        layerId: string,
        layerType: "fill" | "line" | "symbol",
        data: FeatureCollection,
        displayName: string,
        layerStyle: { paint?: Record<string, unknown>; layout?: Record<string, unknown> }
    ): Promise<void> {
        await mapStore.addMapDataSource({ sourceType: "geojson", identifier: sourceId, isFilterLayer: false, geoJSONSrc: data });
        await mapStore.addMapLayer({
            sourceType: "geojson",
            identifier: layerId,
            layerType,
            sourceIdentifier: sourceId,
            geoJSONSrc: data,
            isFilterLayer: false,
            displayName,
            layerStyle,
        });
    }

    /**
     * Ensures `sourceId`+`layerId` exist with `layerType`/`layerStyle`, or just pushes `data`
     * via `setData` if they already do (CLAUDE.md: live updates via `setData`, map touched only
     * through the map store). Shared by the line/symbol variants below — they differ only in the
     * layer type and style they pass in. `ensureFillLayer` below has its own lock scope since it
     * also owns a companion outline layer that must not be added twice either (A4).
     */
    async function ensureGeojsonLayer(
        sourceId: string,
        layerId: string,
        layerType: "fill" | "line" | "symbol",
        data: FeatureCollection,
        displayName: string,
        layerStyle: { paint?: Record<string, unknown>; layout?: Record<string, unknown> }
    ): Promise<void> {
        const sourceExists = (): boolean => mapStore.map?.getSource(sourceId) !== undefined;
        if (!sourceExists()) {
            await withInitLock(sourceId, sourceExists, () =>
                createGeojsonSourceAndLayer(sourceId, layerId, layerType, data, displayName, layerStyle)
            );
        }
        mapStore.map?.getSource(sourceId)?.setData(data);
    }

    async function ensureFillLayer(
        sourceId: string,
        fillLayerId: string,
        outlineLayerId: string,
        data: FeatureCollection,
        displayName: string,
        fillColor: string,
        outlineColor: string
    ): Promise<void> {
        const sourceExists = (): boolean => mapStore.map?.getSource(sourceId) !== undefined;
        if (!sourceExists()) {
            await withInitLock(sourceId, sourceExists, async () => {
                await createGeojsonSourceAndLayer(sourceId, fillLayerId, "fill", data, displayName, {
                    paint: { "fill-color": fillColor, "fill-opacity": 0.45 },
                });
                mapStore.addCompanionLayer(fillLayerId, {
                    id: outlineLayerId,
                    type: "line",
                    source: sourceId,
                    paint: { "line-color": outlineColor, "line-width": 1.5 },
                });
            });
        }
        mapStore.map?.getSource(sourceId)?.setData(data);
    }

    async function ensureLineLayer(
        sourceId: string,
        layerId: string,
        data: FeatureCollection,
        displayName: string,
        color: string
    ): Promise<void> {
        await ensureGeojsonLayer(sourceId, layerId, "line", data, displayName, {
            paint: { "line-color": color, "line-width": 2 },
        });
    }

    async function ensureSymbolLayer(
        sourceId: string,
        layerId: string,
        data: FeatureCollection,
        displayName: string,
        textOffsetY: number
    ): Promise<void> {
        await ensureGeojsonLayer(sourceId, layerId, "symbol", data, displayName, {
            layout: {
                "text-field": ["get", "label"],
                "text-size": 12,
                "text-offset": [0, textOffsetY],
            },
            paint: { "text-color": "#111827", "text-halo-color": "#ffffff", "text-halo-width": 1 },
        });
    }

    /**
     * Runs one layer's `ensure*Layer` call, reporting (not throwing) on failure (A4): a duplicate-
     * source/layer error or any other failure establishing one Collab layer must not prevent the
     * remaining layers in the same `updateLayers` pass from being established.
     */
    async function safelyEnsure(label: string, run: () => Promise<void>): Promise<void> {
        try {
            await run();
        } catch (error) {
            reportDeveloperError(`collabTrackingRender.updateLayers.${label}`, error);
        }
    }

    /**
     * Resolves once `mapStore.map`'s style has finished loading. `updateLayers` runs from an
     * `{ immediate: true }` watcher on mount (plan §13), which can fire before MapContainer's
     * async style load completes — calling `addSource`/`addLayer`/`setData` before then throws
     * MapLibre's "Style is not done loading." Polls for the map instance itself (it's assigned
     * synchronously in `onMounted`, so this settles almost immediately) then waits on its own
     * one-time `load` event — no rival listener is left behind afterwards.
     */
    async function waitForStyleLoaded(): Promise<void> {
        while (mapStore.map === undefined) {
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        if (mapStore.map.isStyleLoaded()) {
            return;
        }
        await new Promise<void>((resolve) => mapStore.map.once("load", () => resolve()));
    }

    /** Renders every Collab layer `windowKind` is allowed to show, per `collabSession.layerPolicy` (plan §13). */
    async function updateLayers(windowKind: "control" | "table"): Promise<void> {
        await waitForStyleLoaded();
        let policy: typeof session.layerPolicy;
        let tracked: ReturnType<typeof trackedRenderState>;
        try {
            policy = session.layerPolicy;
            tracked = trackedRenderState();
        } catch (error) {
            reportDeveloperError("collabTrackingRender.updateLayers.deriveState", error);
            return;
        }

        if (windowKind === "table" && policy.scenarioFootprint.table !== false) {
            await safelyEnsure("tableScenario", async () => {
                const scenarioData =
                    policy.scenarioFootprint.table === "mask"
                        ? maskContextAroundPhysicalFootprints(
                            scenarioFeatureCollection() as FeatureCollection<Polygon | MultiPolygon>,
                            tracked.footprints as FeatureCollection<Polygon | MultiPolygon>
                        )
                        : scenarioFeatureCollection();
                await ensureFillLayer(
                    TABLE_SCENARIO_SOURCE_ID,
                    TABLE_SCENARIO_FILL_LAYER_ID,
                    TABLE_SCENARIO_OUTLINE_LAYER_ID,
                    scenarioData,
                    i18n.global.t("collab.layers.tableScenario"),
                    "#16a34a",
                    "#15803d"
                );
            });
        }

        if (session.isLayerVisible("simulationResult", windowKind)) {
            await safelyEnsure("simulationResult", () =>
                ensureSymbolLayer(
                    SIMULATION_RESULT_SOURCE_ID,
                    SIMULATION_RESULT_LAYER_ID,
                    simulationResultFeatureCollection(),
                    i18n.global.t("collab.layers.simulationResult"),
                    1.8
                )
            );
        }

        if (session.isLayerVisible("trackedFootprint", windowKind)) {
            await safelyEnsure("trackedFootprint", () =>
                ensureFillLayer(
                    TRACKED_FOOTPRINT_SOURCE_ID,
                    TRACKED_FOOTPRINT_FILL_LAYER_ID,
                    TRACKED_FOOTPRINT_OUTLINE_LAYER_ID,
                    tracked.footprints,
                    i18n.global.t("collab.layers.trackedFootprint"),
                    "#f97316",
                    "#c2410c"
                )
            );
        }

        if (windowKind === "control") {
            if (policy.trackedBbox.control) {
                await safelyEnsure("trackedBbox", () =>
                    ensureLineLayer(
                        TRACKED_BBOX_SOURCE_ID,
                        TRACKED_BBOX_LAYER_ID,
                        tracked.bboxes,
                        i18n.global.t("collab.layers.trackedBbox"),
                        "#dc2626"
                    )
                );
            }
            if (policy.trackedOrientation.control) {
                await safelyEnsure("trackedOrientation", () =>
                    ensureLineLayer(
                        TRACKED_ORIENTATION_SOURCE_ID,
                        TRACKED_ORIENTATION_LAYER_ID,
                        tracked.orientations,
                        i18n.global.t("collab.layers.trackedOrientation"),
                        "#7c3aed"
                    )
                );
            }
            if (policy.trackedId.control) {
                await safelyEnsure("trackedId", () =>
                    ensureSymbolLayer(
                        TRACKED_ID_SOURCE_ID,
                        TRACKED_ID_LAYER_ID,
                        tracked.ids,
                        i18n.global.t("collab.layers.trackedId"),
                        -1.2
                    )
                );
            }
            if (policy.trackedConfidence.control) {
                await safelyEnsure("trackedConfidence", () =>
                    ensureSymbolLayer(
                        TRACKED_CONFIDENCE_SOURCE_ID,
                        TRACKED_CONFIDENCE_LAYER_ID,
                        tracked.confidences,
                        i18n.global.t("collab.layers.trackedConfidence"),
                        0.6
                    )
                );
            }
        }
    }

    /**
     * Starts (or restarts) rendering `windowKind`'s allowed layers, re-running on every relevant
     * session change. Control additionally mirrors its locally-selected AOI's table→AOI rotation
     * offset (plan §5b) into `collabSession.calibration` — the only slice that carries it, since
     * `collabScenario.aoi` itself is per-window/local (ticket 07) and never broadcast (ticket 06).
     * This is what lets the Table window, which never runs AOI selection, apply the same offset
     * Control does (plan §13's "same tracking state, two renderings").
     */
    function startRendering(windowKind: "control" | "table"): void {
        stopWatch?.();
        const stopFns: Array<() => void> = [];

        if (windowKind === "control") {
            stopFns.push(
                watch(
                    () => scenarioStore.aoi,
                    (aoi) => {
                        session.calibration.rotationOffsetDeg = aoi === null ? 0 : tableToAoiRotationOffsetDeg(aoi);
                        // A1/A2: broadcast the selected AOI itself, not just its derived rotation
                        // offset, so the Table window can fit its viewport to it instead of an
                        // independent/generic one. Control stays authoritative — Table never sets this.
                        session.calibration.aoi = aoi === null ? null : { corners: [...aoi.corners] as typeof aoi.corners };
                    },
                    { immediate: true }
                )
            );
        }

        stopFns.push(
            watch(
                () => [session.currentScenario, session.tracking, session.calibration, session.simulation.results] as const,
                () => {
                    void updateLayers(windowKind);
                },
                { deep: true, immediate: true }
            )
        );

        stopWatch = () => {
            for (const stopFn of stopFns) {
                stopFn();
            }
        };
    }

    function firstKnownAnchor(): { markerId: number; centre: Position } | undefined {
        const first = session.currentScenario[0] as CollabBuildingObject | undefined;
        if (first === undefined) {
            return undefined;
        }
        const [minX, minY, maxX, maxY] = bbox(toFeature(first));
        return { markerId: first.properties.marker_id, centre: [(minX + maxX) / 2, (minY + maxY) / 2] };
    }

    function startMockTimeline(timeline?: readonly MockTrackingSnapshot[]): void {
        const registry = buildMarkerRegistryFromBase(session.base.objects);
        const anchor = firstKnownAnchor();
        const resolvedTimeline = timeline ?? (anchor === undefined ? undefined : buildDemoMockTimeline(anchor.markerId, anchor.centre));

        mockSource = resolvedTimeline === undefined
            ? new MockTrackingSource({ registry })
            : new MockTrackingSource({ registry, timeline: resolvedTimeline });
        mockSource.onEvent((event) => applyTrackingEvent(session.tracking, event));
        mockSource.onAvailabilityChange((availability) => {
            trackingAvailability.value = availability;
        });
        // No Python transport exists for the mock source — nothing for the Control panel's
        // Python/reference-marker rows to report (marker-health-plan §1).
        pythonConnectionState.value = "mock";
        detectedReferenceMarkerIds.value = new Set();
        mockSource.start();
        active.value = true;
    }

    /**
     * Starts the Milestone-2 real tracking loop (plan §5c/§14, ticket 09): builds the same
     * marker→object registry `startMockTracking` uses and feeds `RealTrackingSource` events into
     * `applyTrackingEvent`/`session.tracking` unchanged — a pure transport swap behind
     * `TrackingSource`. Requires the operator to have already selected an AOI
     * (`scenarioStore.mapCalibration`, ticket 07); reports a developer error and leaves tracking
     * inactive rather than connecting with a stale/absent AOI.
     */
    function startRealTracking(url: string): void {
        const calibration = scenarioStore.mapCalibration;
        if (calibration === null) {
            reportDeveloperError(
                "collabTrackingRender.startRealTracking",
                new Error("no AOI-derived map_calibration — select an AOI (ticket 07) before starting real tracking")
            );
            return;
        }
        const registry = buildMarkerRegistryFromBase(session.base.objects);

        realSource = new RealTrackingSource({ url, registry, calibration });
        realSource.onEvent((event) => applyTrackingEvent(session.tracking, event));
        realSource.onAvailabilityChange((availability) => {
            trackingAvailability.value = availability;
        });
        realSource.onConnectionStateChange((state) => {
            pythonConnectionState.value = state;
        });
        // Sticky: an id, once seen among a snapshot's marker ids, stays "detected" (marker-health-plan §3).
        realSource.onMarkerSnapshot((markerIds) => {
            const newlySeen = markerIds.filter((id) => REFERENCE_MARKER_IDS.has(id) && !detectedReferenceMarkerIds.value.has(id));
            if (newlySeen.length === 0) {
                return;
            }
            detectedReferenceMarkerIds.value = new Set([...detectedReferenceMarkerIds.value, ...newlySeen]);
        });
        realSource.start();
        active.value = true;
    }

    /**
     * Starts tracking (plan §14, ticket 09): `RealTrackingSource` when
     * `VITE_COLLAB_TRACKING_WS_URL` is configured, `MockTrackingSource` otherwise (plan §14's
     * Milestone-1 default) — the swap the operator/UI never has to know about (ticket 09 "zero
     * changes to views/stores"). An explicit `timeline` always forces the mock, since it only
     * makes sense as a scripted demo/dev timeline.
     */
    function startMockTracking(timeline?: readonly MockTrackingSnapshot[]): void {
        stopMockTracking();
        const url = timeline === undefined ? resolveCollabTrackingWsUrl() : undefined;
        if (url === undefined) {
            startMockTimeline(timeline);
        } else {
            startRealTracking(url);
        }
    }

    /** Stops whichever tracking source (mock or real) is currently active. Idempotent. */
    function stopMockTracking(): void {
        mockSource?.stop();
        mockSource = undefined;
        realSource?.stop();
        realSource = undefined;
        active.value = false;
        // An intentional stop is not a tracking-availability problem — clear any stale
        // suppressed/disconnected banner left over from before the operator stopped tracking.
        trackingAvailability.value = "live";
        pythonConnectionState.value = "mock";
        detectedReferenceMarkerIds.value = new Set();
    }

    /** Tears down the active tracking source and the render watch. Idempotent — safe on unmount and HMR. */
    function stop(): void {
        stopWatch?.();
        stopWatch = undefined;
        stopMockTracking();
        appliedRotationByObjectId.clear();
    }

    onScopeDispose(stop);

    return {
        active,
        trackingAvailability,
        pythonConnectionState,
        detectedReferenceMarkerIds,
        startRendering,
        startMockTracking,
        stopMockTracking,
        stop,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useCollabTrackingRenderStore, import.meta.hot));
}
