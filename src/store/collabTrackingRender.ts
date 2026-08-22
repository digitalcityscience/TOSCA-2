import { acceptHMRUpdate, defineStore } from "pinia";
import { onScopeDispose, ref, watch } from "vue";
import bbox from "@turf/bbox";
import { point } from "@turf/helpers";
import transformTranslate from "@turf/transform-translate";
import type { Position } from "geojson";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "@helpers/geojson";
import { reportDeveloperError } from "@helpers/userFacingError";
import { resolveCollabTrackingWsUrl } from "@helpers/collabMode";
import { i18n } from "../core/i18n";
import { useMapStore } from "./map";
import { useCollabSessionStore, type CollabSceneObject, type CollabTrackingObjectState } from "./collabSession";
import { toFeature, useCollabScenarioStore, type CollabBuildingObject } from "./collabScenario";
import { deriveTrackedFootprint, tableToAoiRotationOffsetDeg } from "./collabCalibration";
import { maskContextAroundPhysicalFootprints } from "./collabMasking";
import {
    createMarkerObjectRegistry,
    MockTrackingSource,
    RealTrackingSource,
    type MarkerObjectRegistry,
    type MarkerObjectRegistryEntry,
    type MockTrackingSnapshot,
    type TrackingEvent,
} from "./collabTracking";

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
    const appliedRotationByObjectId = new Map<string, number>();

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
            const tip = transformTranslate(point(centre), ORIENTATION_LINE_METERS, appliedRotationDeg, { units: "meters" });
            orientations.push({
                type: "Feature",
                id: objectId,
                properties: {},
                geometry: { type: "LineString", coordinates: [centre, tip.geometry.coordinates] },
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
     * Ensures `sourceId`+`layerId` exist with `layerType`/`layerStyle`, or just pushes `data`
     * via `setData` if they already do (CLAUDE.md: live updates via `setData`, map touched only
     * through the map store). Shared by the fill/line/symbol variants below — they differ only
     * in the layer type and style they pass in.
     */
    async function ensureGeojsonLayer(
        sourceId: string,
        layerId: string,
        layerType: "fill" | "line" | "symbol",
        data: FeatureCollection,
        displayName: string,
        layerStyle: { paint?: Record<string, unknown>; layout?: Record<string, unknown> }
    ): Promise<void> {
        const existing = mapStore.map?.getSource(sourceId);
        if (existing !== undefined) {
            existing.setData(data);
            return;
        }
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

    async function ensureFillLayer(
        sourceId: string,
        fillLayerId: string,
        outlineLayerId: string,
        data: FeatureCollection,
        displayName: string,
        fillColor: string,
        outlineColor: string
    ): Promise<void> {
        const isNewLayer = mapStore.map?.getSource(sourceId) === undefined;
        await ensureGeojsonLayer(sourceId, fillLayerId, "fill", data, displayName, {
            paint: { "fill-color": fillColor, "fill-opacity": 0.45 },
        });
        if (isNewLayer) {
            mapStore.addCompanionLayer(fillLayerId, {
                id: outlineLayerId,
                type: "line",
                source: sourceId,
                paint: { "line-color": outlineColor, "line-width": 1.5 },
            });
        }
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

    /** Renders every Collab layer `windowKind` is allowed to show, per `collabSession.layerPolicy` (plan §13). */
    async function updateLayers(windowKind: "control" | "table"): Promise<void> {
        try {
            const policy = session.layerPolicy;
            const tracked = trackedRenderState();

            if (windowKind === "table" && policy.scenarioFootprint.table !== false) {
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
            }

            if (session.isLayerVisible("trackedFootprint", windowKind)) {
                await ensureFillLayer(
                    TRACKED_FOOTPRINT_SOURCE_ID,
                    TRACKED_FOOTPRINT_FILL_LAYER_ID,
                    TRACKED_FOOTPRINT_OUTLINE_LAYER_ID,
                    tracked.footprints,
                    i18n.global.t("collab.layers.trackedFootprint"),
                    "#f97316",
                    "#c2410c"
                );
            }

            if (windowKind === "control") {
                if (policy.trackedBbox.control) {
                    await ensureLineLayer(
                        TRACKED_BBOX_SOURCE_ID,
                        TRACKED_BBOX_LAYER_ID,
                        tracked.bboxes,
                        i18n.global.t("collab.layers.trackedBbox"),
                        "#dc2626"
                    );
                }
                if (policy.trackedOrientation.control) {
                    await ensureLineLayer(
                        TRACKED_ORIENTATION_SOURCE_ID,
                        TRACKED_ORIENTATION_LAYER_ID,
                        tracked.orientations,
                        i18n.global.t("collab.layers.trackedOrientation"),
                        "#7c3aed"
                    );
                }
                if (policy.trackedId.control) {
                    await ensureSymbolLayer(
                        TRACKED_ID_SOURCE_ID,
                        TRACKED_ID_LAYER_ID,
                        tracked.ids,
                        i18n.global.t("collab.layers.trackedId"),
                        -1.2
                    );
                }
                if (policy.trackedConfidence.control) {
                    await ensureSymbolLayer(
                        TRACKED_CONFIDENCE_SOURCE_ID,
                        TRACKED_CONFIDENCE_LAYER_ID,
                        tracked.confidences,
                        i18n.global.t("collab.layers.trackedConfidence"),
                        0.6
                    );
                }
            }
        } catch (error) {
            reportDeveloperError("collabTrackingRender.updateLayers", error);
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
                    },
                    { immediate: true }
                )
            );
        }

        stopFns.push(
            watch(
                () => [session.currentScenario, session.tracking, session.calibration] as const,
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
        startRendering,
        startMockTracking,
        stopMockTracking,
        stop,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useCollabTrackingRenderStore, import.meta.hot));
}
