import { acceptHMRUpdate, defineStore } from "pinia";
import { onScopeDispose, ref, watch } from "vue";
import bbox from "@turf/bbox";
import { point } from "@turf/helpers";
import transformRotate from "@turf/transform-rotate";
import transformTranslate from "@turf/transform-translate";
import type { Position } from "geojson";
import maplibre, { type Map as MapLibreMap, type Marker as MapLibreMarker } from "maplibre-gl";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "@helpers/geojson";
import { reportDeveloperError } from "@helpers/userFacingError";
import { useToast } from "@helpers/toast";
import { isRealTableRoute, resolveCollabTrackingMode, resolveCollabTrackingWsUrl } from "../helpers/collabMode";
import { markerRegistryForBuildings } from "../data/collabBuildingData";
import { i18n } from "../../core/i18n";
import { useMapStore } from "@store/map";
import { useCollabSessionStore, type CollabSceneObject, type CollabTrackingObjectState } from "./collabSession";
import { toFeature, useCollabScenarioStore, type CollabBuildingObject } from "./collabScenario";
import { calibrationMarkerSizePx, deriveTrackedFootprint, footprintAnchorCentre, tableToAoiRotationOffsetDeg, type AOIExtent } from "./collabCalibration";
import { maskContextAroundPhysicalFootprints } from "./collabMasking";
import {
    aoiCornerForMapMarker,
    buildMapCalibrationFromMarkerReadings,
    calibrationMarkerImageUrl,
    createMarkerObjectRegistry,
    MAP_CALIBRATION_MARKER_IDS,
    MAP_CALIBRATION_MARKERS,
    MockTrackingSource,
    REFERENCE_MARKERS,
    RealTrackingSource,
    type MarkerObjectRegistry,
    type MarkerObjectRegistryEntry,
    type MockTrackingSnapshot,
    type PythonConnectionState,
    type RawMarkerReading,
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

/**
 * Every Collab-managed layer id that can exist on the Table window (ticket 11, fix-tickets) — the
 * ones {@link syncCalibrationPresentation} hides while presenting, alongside the basemap. Control-
 * only layer ids (bbox/orientation/confidence) are deliberately excluded: they are never created on
 * Table in the first place (see `updateLayers`'s `windowKind === "control"` gates below).
 */
const TABLE_MANAGED_LAYER_IDS: readonly string[] = [
    TABLE_SCENARIO_FILL_LAYER_ID,
    TABLE_SCENARIO_OUTLINE_LAYER_ID,
    TRACKED_FOOTPRINT_FILL_LAYER_ID,
    TRACKED_FOOTPRINT_OUTLINE_LAYER_ID,
    TRACKED_ID_LAYER_ID,
    SIMULATION_RESULT_LAYER_ID,
];

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
    const mapped = markerRegistryForBuildings(objects.map((object) => object.id));
    const entries: MarkerObjectRegistryEntry[] = [...mapped].map(([markerId, objectId]) => ({ markerId, objectId }));
    // Preserve the explicitly mock/fixture-only path used off the real-table route. Production
    // buildings carry no marker_id; their associations came from marker-building-map.json above.
    for (const object of objects) {
        const markerId = (object as Partial<CollabBuildingObject>).properties?.marker_id;
        if (typeof markerId === "number" && !mapped.has(markerId)) {
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
 * Hides every currently-visible raster (basemap) layer plus every already-created
 * {@link TABLE_MANAGED_LAYER_IDS} layer, and returns the ids it actually changed (ticket 11,
 * fix-tickets) — so `syncCalibrationPresentation` can restore exactly those, and only those, once
 * presentation mode ends. Idempotent: a layer already hidden (by this or anything else) is left
 * alone and not included in the returned list.
 */
export function hideNonCalibrationLayers(map: MapLibreMap): string[] {
    const hidden: string[] = [];
    const styleLayers = map.getStyle()?.layers ?? [];
    const candidateIds = [
        ...styleLayers.filter((layer) => layer.type === "raster").map((layer) => layer.id),
        ...TABLE_MANAGED_LAYER_IDS,
    ];
    for (const id of candidateIds) {
        if (map.getLayer(id) === undefined) {
            continue;
        }
        const current = map.getLayoutProperty(id, "visibility") ?? "visible";
        if (current !== "none") {
            map.setLayoutProperty(id, "visibility", "none");
            hidden.push(id);
        }
    }
    return hidden;
}

/** Reverses {@link hideNonCalibrationLayers}: sets `visibility` back to `"visible"` for every given id that still exists. */
export function restoreHiddenLayers(map: MapLibreMap, ids: readonly string[]): void {
    for (const id of ids) {
        if (map.getLayer(id) !== undefined) {
            map.setLayoutProperty(id, "visibility", "visible");
        }
    }
}

/** Builds one calibration marker's `<img>` element, sized per {@link calibrationMarkerSizePx} (ticket 11). */
function buildCalibrationMarkerElement(markerId: number): HTMLImageElement {
    const el = document.createElement("img");
    el.src = calibrationMarkerImageUrl(markerId);
    el.alt = String(markerId);
    const sizePx = calibrationMarkerSizePx();
    el.style.width = `${sizePx}px`;
    el.style.height = `${sizePx}px`;
    return el;
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
 *   orientation/id/confidence; Table gets the scenario + tracked footprints plus tracked id
 *   (building centre points), per the current M1 default.
 *
 * Pose→geometry derivation (translate/rotate + 5° jitter threshold + table→AOI rotation offset)
 * is delegated to `collabCalibration.deriveTrackedFootprint` — this store only wires events,
 * decides per-layer visibility, and pushes GeoJSON through the map store's public API.
 */
export const useCollabTrackingRenderStore = defineStore("collabTrackingRender", () => {
    const session = useCollabSessionStore();
    const scenarioStore = useCollabScenarioStore();
    const mapStore = useMapStore();
    const toast = useToast();

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
    /**
     * Latest raw reading for each of `MAP_CALIBRATION_MARKERS`' four ids (200–203) seen since
     * tracking started (ticket 08) — sticky like `detectedReferenceMarkerIds` (presence in this map
     * is "detected"; a ticket 12 calibration flow reads the held `[pixelX, pixelY]` off it). Ids
     * outside `MAP_CALIBRATION_MARKER_IDS` never enter this map. Fed only by raw pre-calibration
     * snapshots — building markers never advance it.
     */
    const mapCalibrationMarkerHealth = ref<ReadonlyMap<number, RawMarkerReading>>(new Map());
    const appliedRotationByObjectId = new Map<string, number>();
    /** Keyed by source id (A4): the in-flight create-source-and-layer promise, so concurrent render ticks await the same creation instead of both racing `addMapDataSource`. */
    const layerInitInFlight = new Map<string, Promise<void>>();

    let mockSource: MockTrackingSource | undefined;
    let realSource: RealTrackingSource | undefined;
    let stopWatch: (() => void) | undefined;
    /** Live `maplibregl.Marker` instances for the four calibration markers, keyed by marker id (ticket 11). */
    const calibrationMarkers = new Map<number, MapLibreMarker>();
    /** Layer ids {@link syncCalibrationPresentation} hid — restored verbatim once presentation mode ends. */
    let hiddenLayerIds: string[] = [];

    function knownFootprint(objectId: string): Feature<Polygon> | undefined {
        const object = session.currentScenario.find((candidate) => candidate.id === objectId);
        return object === undefined ? undefined : (toFeature(object) as Feature<Polygon>);
    }

    function scenarioFeatureCollection(): FeatureCollection {
        return { type: "FeatureCollection", features: session.currentScenario.map(toFeature) };
    }

    /** Everything `updateLayers` needs to render Collab's tracked-object layers for one window. */
    interface TrackedRenderProducts {
        footprints: FeatureCollection;
        bboxes: FeatureCollection;
        orientations: FeatureCollection;
        ids: FeatureCollection;
        confidences: FeatureCollection;
    }

    /**
     * Derives every tracked object's render products from session.tracking (plan §13) — Control
     * only; `updateLayers` never calls this for `windowKind === "table"` (ticket 13). This is the
     * one place `deriveTrackedFootprint` (translate+rotate onto the detected pose) runs; its two
     * broadcastable outputs, `footprints` and `ids`, are published into `session.trackedBuildings`
     * as a side effect so Table can render the exact same tracked-building collection Control just
     * computed instead of deriving its own (see {@link tableTrackedRenderState}). `bboxes`/
     * `orientations`/`confidences` stay Control-only debug overlays (plan §4 "on-map layers") and
     * are never broadcast.
     */
    function trackedRenderState(): TrackedRenderProducts {
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

        const footprintCollection: FeatureCollection = { type: "FeatureCollection", features: footprints };
        const idCollection: FeatureCollection = { type: "FeatureCollection", features: ids };

        // Publish the authoritative tracked-building collection (ticket 13), bumping revision only
        // when it actually changed: this derivation re-runs on every render tick, including ticks
        // triggered by unrelated state (e.g. a simulation run) where the tracked footprints are
        // unchanged — bumping unconditionally would make collabSync treat the slice as changed on
        // every tick (its diff compares by JSON, and `revision` is part of the synced shape) and
        // rebroadcast/re-persist the full tracked-building collection far more often than anything
        // on the table actually moved.
        const structurallyChanged =
            JSON.stringify(session.trackedBuildings.footprints) !== JSON.stringify(footprintCollection) ||
            JSON.stringify(session.trackedBuildings.ids) !== JSON.stringify(idCollection);
        if (structurallyChanged) {
            session.trackedBuildings.footprints = footprintCollection;
            session.trackedBuildings.ids = idCollection;
            session.trackedBuildings.revision += 1;
        }

        return {
            footprints: footprintCollection,
            bboxes: { type: "FeatureCollection", features: bboxes },
            orientations: { type: "FeatureCollection", features: orientations },
            ids: idCollection,
            confidences: { type: "FeatureCollection", features: confidences },
        };
    }

    /**
     * Table's counterpart to {@link trackedRenderState} (ticket 13): reads the tracked-building
     * collection Control already derived and broadcast via `session.trackedBuildings`, instead of
     * calling `deriveTrackedFootprint` again locally. Table has no debug overlays to render, so
     * `bboxes`/`orientations`/`confidences` are empty — `updateLayers` never reads them for
     * `windowKind === "table"`.
     */
    function tableTrackedRenderState(): TrackedRenderProducts {
        const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
        return {
            footprints: session.trackedBuildings.footprints,
            ids: session.trackedBuildings.ids,
            bboxes: empty,
            orientations: empty,
            confidences: empty,
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
            features.push({
                type: "Feature",
                id: result.objectId,
                properties: { label: String(result.metric) },
                geometry: { type: "Point", coordinates: footprintAnchorCentre(known) },
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

    /**
     * Keeps the Table window's calibration-presentation overlay in sync with
     * `session.calibration.phase` (ticket 11, fix-tickets): while `"presenting"`, ensures the four
     * `200`-`203` marker images sit at the AOI's corners and every basemap/Collab layer is hidden;
     * otherwise removes the markers and restores exactly what this function itself hid. Control
     * never calls this — the calibration overlay is Table-only, matching "Control keeps its own
     * basemap for operator context."
     */
    function syncCalibrationPresentation(): void {
        const map = mapStore.map as MapLibreMap | undefined;
        const aoi: AOIExtent | null = session.calibration.aoi;
        const presenting = session.calibration.phase === "presenting" && map !== undefined && aoi !== null;

        if (!presenting) {
            if (map !== undefined && hiddenLayerIds.length > 0) {
                restoreHiddenLayers(map, hiddenLayerIds);
            }
            hiddenLayerIds = [];
            for (const marker of calibrationMarkers.values()) {
                marker.remove();
            }
            calibrationMarkers.clear();
            return;
        }

        if (hiddenLayerIds.length === 0) {
            hiddenLayerIds = hideNonCalibrationLayers(map);
        }
        for (const config of MAP_CALIBRATION_MARKERS) {
            const corner = aoiCornerForMapMarker(aoi, config.corner);
            const existing = calibrationMarkers.get(config.id);
            if (existing === undefined) {
                const marker = new maplibre.Marker({ element: buildCalibrationMarkerElement(config.id) })
                    .setLngLat(corner as [number, number])
                    .addTo(map);
                calibrationMarkers.set(config.id, marker);
            } else {
                existing.setLngLat(corner as [number, number]);
            }
        }
    }

    /** Renders every Collab layer `windowKind` is allowed to show, per `collabSession.layerPolicy` (plan §13). */
    async function updateLayers(windowKind: "control" | "table"): Promise<void> {
        await waitForStyleLoaded();

        if (windowKind === "table") {
            syncCalibrationPresentation();
            if (session.calibration.phase === "presenting") {
                // Calibration presentation is exclusive on Table (ticket 11): none of the normal
                // scenario/tracked/simulation layers below may reach the map while it's active.
                return;
            }
        }

        let policy: typeof session.layerPolicy;
        let tracked: TrackedRenderProducts;
        try {
            policy = session.layerPolicy;
            // Tracked buildings are derived exactly once, in Control (ticket 13) — Table reads the
            // broadcast collection instead of calling deriveTrackedFootprint itself.
            tracked = windowKind === "control" ? trackedRenderState() : tableTrackedRenderState();
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

        // Simulation is a mock/dev-only affordance (ticket 09): its Control panel section isn't
        // instantiated on the real-table route, so its layer must never reach the map there either
        // — gated on the same build-level "real-table route" signal the panel itself hides on,
        // independent of `session.layerPolicy` (which defaults both windows to visible).
        if (!isRealTableRoute() && session.isLayerVisible("simulationResult", windowKind)) {
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
        }

        // trackedId (each tracked building's centre point) is policy-driven per window, not
        // Control-only like its debug-layer siblings above/below — the M1 default (plan §13,
        // updated) shows it on both Control and Table, so it uses `isLayerVisible` like
        // `trackedFootprint`/`simulationResult` above instead of the hardcoded
        // `windowKind === "control"` gate. Kept between orientation and confidence so Control's
        // on-map paint order (bbox, orientation, id, confidence) is unchanged from before.
        if (session.isLayerVisible("trackedId", windowKind)) {
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

        if (windowKind === "control" && policy.trackedConfidence.control) {
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

        // Connect-first (ticket 08): the Python transport is owned by Control's own lifecycle, not
        // by the "Start Tracking" button or by AOI/footprint selection — opening Control is enough
        // to reach "Connected". Table never owns a transport of its own.
        if (windowKind === "control") {
            connectPythonTransport();
        }

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
                        // ticket 11: bump on every write to this slice, not only when the derived
                        // values happen to change structurally (see CollabCalibrationState's doc).
                        session.calibration.revision += 1;
                    },
                    { immediate: true }
                )
            );
        }

        // Table renders `session.trackedBuildings` verbatim (ticket 13) instead of deriving it from
        // `session.tracking` itself, so it needs `trackedBuildings` as its own watch dependency — a
        // patch that changes only that slice (common: Control's `trackedRenderState` write lands one
        // microtask after the `tracking` write that caused it, so they often arrive as two separate
        // sync patches) must still trigger a re-render, or Table's rendered footprints stay one
        // revision behind Control's. Control must NOT watch `trackedBuildings` itself:
        // `updateLayers("control")` below writes it as a derived side effect of this very watcher, so
        // including it here would make every render tick re-trigger itself.
        const renderWatchSources = (): readonly unknown[] =>
            windowKind === "table"
                ? [session.currentScenario, session.tracking, session.calibration, session.trackedBuildings, session.simulation.results]
                : [session.currentScenario, session.tracking, session.calibration, session.simulation.results];

        stopFns.push(
            watch(
                renderWatchSources,
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
        const markerId = [...buildMarkerRegistryFromBase(session.base.objects)]
            .find(([, objectId]) => objectId === first.id)?.[0];
        if (markerId === undefined) {
            return undefined;
        }
        const [minX, minY, maxX, maxY] = bbox(toFeature(first));
        return { markerId, centre: [(minX + maxX) / 2, (minY + maxY) / 2] };
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
        mockSource.start();
        active.value = true;
    }

    /**
     * Wires one `RealTrackingSource` instance's events into the store (plan §5c/§14, ticket 09;
     * connect-first ticket 08) — shared by `connectPythonTransport`'s mount-time connect, so there
     * is exactly one place that knows how to hook a `RealTrackingSource` up to session state.
     */
    function wireRealSource(source: RealTrackingSource): void {
        source.onEvent((event) => applyTrackingEvent(session.tracking, event));
        source.onAvailabilityChange((availability) => {
            trackingAvailability.value = availability;
        });
        let previousConnectionState: PythonConnectionState = "disconnected";
        source.onConnectionStateChange((state) => {
            // Auto-reconnect gives up after `RealTrackingSource`'s max attempts (ticket 08): that
            // transition lands here as "reconnecting" -> "disconnected" with no explicit stop() in
            // between — surface it as a visible toast, not just the panel row, matching ticket 01's
            // established failure-reporting pattern.
            if (previousConnectionState === "reconnecting" && state === "disconnected") {
                toast.add({ severity: "error", summary: i18n.global.t("collab.control.python.connectionLost") });
            }
            previousConnectionState = state;
            pythonConnectionState.value = state;
        });
        // Sticky: an id, once seen among a snapshot's marker ids, stays "detected" (marker-health-plan §3).
        source.onMarkerSnapshot((markerIds) => {
            const newlySeen = markerIds.filter((id) => REFERENCE_MARKER_IDS.has(id) && !detectedReferenceMarkerIds.value.has(id));
            if (newlySeen.length === 0) {
                return;
            }
            detectedReferenceMarkerIds.value = new Set([...detectedReferenceMarkerIds.value, ...newlySeen]);
        });
        // Map-calibration marker health (ticket 08): only ids 200-203 ever enter this map, fed
        // exclusively from raw pre-calibration snapshots — sticky, holds each id's latest reading.
        source.onRawMarkerSnapshot((markers) => {
            let changed = false;
            const next = new Map(mapCalibrationMarkerHealth.value);
            for (const [markerId, reading] of markers) {
                if (!MAP_CALIBRATION_MARKER_IDS.has(markerId)) {
                    continue;
                }
                next.set(markerId, reading);
                changed = true;
            }
            if (changed) {
                mapCalibrationMarkerHealth.value = next;
            }
        });
    }

    /**
     * Connects to Python's `:8053` transport as soon as Collab Control mounts (ticket 08,
     * connect-first) — independent of AOI/footprints/calibration, "Connected" never implies
     * "calibrated". A no-op when tracking mode resolves to `"mock"` (ticket 03) or no WS URL is
     * configured, and idempotent if a connection is already up (safe to call again from
     * `startRealTracking`).
     */
    function connectPythonTransport(): void {
        if (resolveCollabTrackingMode() !== "real") {
            return;
        }
        const url = resolveCollabTrackingWsUrl();
        if (url === undefined || realSource !== undefined) {
            return;
        }
        const registry = buildMarkerRegistryFromBase(session.base.objects);
        realSource = new RealTrackingSource({ url, registry });
        wireRealSource(realSource);
        realSource.start();
    }

    /** Stops and clears the persistent Python transport (ticket 08). Only called on full store teardown — never by the "Stop Tracking" button, which must not disconnect an otherwise-healthy transport. */
    function disconnectPythonTransport(): void {
        realSource?.stop();
        realSource = undefined;
        pythonConnectionState.value = "mock";
        detectedReferenceMarkerIds.value = new Set();
        mapCalibrationMarkerHealth.value = new Map();
    }

    /** Manually retries the Python connection after auto-reconnect has given up (ticket 08) — a no-op if no transport exists yet (e.g. mock mode) or one is already connecting/connected. */
    function retryPythonConnection(): void {
        if (realSource === undefined) {
            connectPythonTransport();
            return;
        }
        realSource.start();
    }

    /**
     * Starts tracking (plan §14, ticket 09; explicit mode switch ticket 03; connect-first ticket
     * 08): `RealTrackingSource` when `VITE_COLLAB_TRACKING_MODE` resolves to `"real"` (the
     * default) and `VITE_COLLAB_TRACKING_WS_URL` is configured, `MockTrackingSource` otherwise —
     * the swap the operator/UI never has to know about. Mode `"mock"` forces `MockTrackingSource`
     * even when a WS URL happens to be set; an unset/empty URL still falls back to mock as a
     * safety net even in `"real"` mode. An explicit `timeline` always forces the mock, since it
     * only makes sense as a scripted demo/dev timeline. In real mode this reuses the transport
     * `connectPythonTransport` already brought up on mount (or connects now if that hasn't run
     * yet) rather than opening a second socket — no AOI/calibration is required (ticket 08: the
     * old early-return-with-no-visible-effect path is gone).
     */
    function startMockTracking(timeline?: readonly MockTrackingSnapshot[]): void {
        mockSource?.stop();
        mockSource = undefined;
        const useReal =
            timeline === undefined && resolveCollabTrackingMode() === "real" && resolveCollabTrackingWsUrl() !== undefined;
        if (useReal) {
            connectPythonTransport();
            active.value = true;
        } else {
            startMockTimeline(timeline);
        }
    }

    /**
     * Stops the active tracking display. Idempotent. Only tears down `MockTrackingSource` — the
     * real Python transport (ticket 08) is mount-owned and stays connected regardless of this
     * button, since "Connected" and "tracking actively displayed" are separate states.
     */
    function stopMockTracking(): void {
        mockSource?.stop();
        mockSource = undefined;
        active.value = false;
        // An intentional stop is not a tracking-availability problem — clear any stale
        // suppressed/disconnected banner left over from before the operator stopped tracking.
        trackingAvailability.value = "live";
    }

    /**
     * Enters calibration-presentation mode (ticket 11, fix-tickets): Control calls this — never
     * Table — typically right after opening the Table window, since Table always fits+locks to the
     * AOI before rendering anything else regardless. A no-op-safe write: idempotent to call again
     * while already presenting (e.g. refocusing an already-open Table window).
     */
    function enterCalibrationPresentation(): void {
        session.calibration.phase = "presenting";
        session.calibration.revision += 1;
    }

    /** Leaves calibration-presentation mode — a clean seam for the real four-marker calibration flow to call once calibration succeeds. */
    function exitCalibrationPresentation(): void {
        session.calibration.phase = "idle";
        session.calibration.revision += 1;
    }

    /**
     * Whether all four {@link MAP_CALIBRATION_MARKERS} ids have a reading yet (ticket 12) — gates
     * the operator's "Calibrate" action; sending a partial correspondence set to Python would be
     * worse than refusing to send at all.
     */
    function canCalibrateFromMarkers(): boolean {
        return MAP_CALIBRATION_MARKERS.every((marker) => mapCalibrationMarkerHealth.value.has(marker.id));
    }

    /**
     * The real four-marker calibration flow (ticket 12): builds `map_calibration` from the four
     * detected map-calibration marker readings and the confirmed AOI, sends it to Python over the
     * live `RealTrackingSource`, marks the AOI calibrated, and leaves calibration-presentation
     * mode — the mechanism `scenarioStore.calibrated` and `exitCalibrationPresentation`'s doc
     * comments both anticipated. Reports a developer error (never a silent no-effect click) if any
     * precondition isn't met: no AOI confirmed, not all four markers detected yet, or no real
     * transport connected — none of those are reachable from the UI once `canCalibrateFromMarkers`/
     * `isRealTableRoute` gate the button, but the store's own contract must not silently claim
     * success if called anyway.
     */
    function calibrateFromDetectedMarkers(): void {
        const aoi = scenarioStore.aoi;
        if (aoi === null) {
            reportDeveloperError("collabTrackingRender.calibrateFromDetectedMarkers", new Error("no AOI confirmed"));
            return;
        }
        const message = buildMapCalibrationFromMarkerReadings(aoi, mapCalibrationMarkerHealth.value);
        if (message === undefined) {
            reportDeveloperError(
                "collabTrackingRender.calibrateFromDetectedMarkers",
                new Error("not all four map-calibration markers have been detected yet")
            );
            return;
        }
        if (realSource === undefined) {
            reportDeveloperError(
                "collabTrackingRender.calibrateFromDetectedMarkers",
                new Error("no real tracking transport connected")
            );
            return;
        }
        realSource.sendMapCalibration(message);
        scenarioStore.calibrated = true;
        exitCalibrationPresentation();
    }

    /** Tears down every tracking source, the Python transport, and the render watch. Idempotent — safe on unmount and HMR. */
    function stop(): void {
        stopWatch?.();
        stopWatch = undefined;
        stopMockTracking();
        disconnectPythonTransport();
        appliedRotationByObjectId.clear();
        for (const marker of calibrationMarkers.values()) {
            marker.remove();
        }
        calibrationMarkers.clear();
        hiddenLayerIds = [];
    }

    onScopeDispose(stop);

    return {
        active,
        trackingAvailability,
        pythonConnectionState,
        detectedReferenceMarkerIds,
        mapCalibrationMarkerHealth,
        startRendering,
        startMockTracking,
        stopMockTracking,
        retryPythonConnection,
        enterCalibrationPresentation,
        exitCalibrationPresentation,
        canCalibrateFromMarkers,
        calibrateFromDetectedMarkers,
        stop,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useCollabTrackingRenderStore, import.meta.hot));
}
