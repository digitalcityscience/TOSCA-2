import { acceptHMRUpdate, defineStore } from "pinia";
import { onScopeDispose, ref, watch } from "vue";
import bbox from "@turf/bbox";
import { point } from "@turf/helpers";
import transformRotate from "@turf/transform-rotate";
import transformTranslate from "@turf/transform-translate";
import type { Position } from "geojson";
import maplibre, { type Map as MapLibreMap, type Marker as MapLibreMarker } from "maplibre-gl";
import type { Feature, FeatureCollection, Polygon } from "@helpers/geojson";
import { reportDeveloperError } from "@helpers/userFacingError";
import { useToast } from "@helpers/toast";
import { resolveCollabTrackingMode, resolveCollabTrackingWsUrl } from "../helpers/collabMode";
import { markerRegistryForBuildings } from "../data/collabBuildingData";
import { i18n } from "../../core/i18n";
import { useMapStore } from "@store/map";
import { useCollabSessionStore, type CollabSceneObject, type CollabTrackingObjectState } from "./collabSession";
import { toFeature, useCollabScenarioStore, type CollabBuildingObject } from "./collabScenario";
import { calibrationMarkerSizePx, deriveTrackedFootprint, tableToAoiRotationOffsetDeg, type AOIExtent, type MapCalibrationMessage } from "./collabCalibration";
import {
    aoiCornerForMapMarker,
    buildMapCalibrationFromMarkerReadings,
    calibrationMarkerImageUrl,
    createMarkerObjectRegistry,
    MAP_CALIBRATION_MARKER_IDS,
    MAP_CALIBRATION_MARKERS,
    REFERENCE_MARKERS,
    RealTrackingSource,
    type MarkerObjectRegistry,
    type MarkerObjectRegistryEntry,
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

/**
 * Every Collab-managed layer id that can exist on the Table window (ticket 11, fix-tickets) — the
 * ones {@link syncCalibrationPresentation} hides while presenting, alongside the basemap. Control-
 * only debug-overlay layer ids (bbox/orientation/id/confidence) are deliberately excluded: they
 * are never created on Table in the first place (see `updateLayers`'s `windowKind === "control"`
 * gate below), and only exist on Control at all while the debug switch is on.
 */
const TABLE_MANAGED_LAYER_IDS: readonly string[] = [
    TRACKED_FOOTPRINT_FILL_LAYER_ID,
    TRACKED_FOOTPRINT_OUTLINE_LAYER_ID,
];

/** Control debug overlay's orientation-indicator line length (metres). */
const ORIENTATION_LINE_METERS = 5;

/**
 * How long a resent `map_calibration` payload gets to prove itself via a resumed GeoJSON
 * `FeatureCollection` before {@link useCollabTrackingRenderStore}'s reconnect handling gives up and
 * falls back to four-marker detection mode (ticket 14) — long enough to cover Python re-detecting
 * the reference markers and rebuilding its feed after a transport blip or process restart, short
 * enough that the operator isn't left assuming `calibrated_tracking` far past the point Python has
 * clearly not resumed.
 */
const RECONNECT_RESUME_TIMEOUT_MS = 8000;

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

/**
 * The `<img>` carrying the actual ArUco bitmap inside a calibration marker's wrapper element —
 * everything except position (size, quiet zone, mirroring, received color) is set on this, never on
 * the wrapper. See {@link buildCalibrationMarkerElement} for why the wrapper exists.
 */
function calibrationMarkerImage(wrapper: HTMLElement): HTMLImageElement | null {
    return wrapper.querySelector("img");
}

/**
 * Sizes one calibration marker's image from the current centre latitude and zoom, matching Vanilla's
 * `.marker-icon` metre-to-pixel sizing. The marker itself has no border; calibration presentation
 * supplies one continuous white background behind all four SVGs.
 * Also called by the same `move`/`zoom` events Vanilla uses in `markers.js:updateMarkerSizes`.
 */
function applyCalibrationMarkerSize(wrapper: HTMLElement, map: MapLibreMap): void {
    const img = calibrationMarkerImage(wrapper);
    if (img === null) {
        return;
    }
    const sizePx = calibrationMarkerSizePx(map);
    img.style.width = `${sizePx}px`;
    img.style.height = `${sizePx}px`;
    img.style.boxSizing = "border-box";
}

/** Red by default; only a Python reading accepted by the frontend turns this marker green. */
function applyCalibrationMarkerReceivedState(wrapper: HTMLElement, received: boolean): void {
    const img = calibrationMarkerImage(wrapper);
    if (img === null) {
        return;
    }
    img.style.border = received ? "5px solid #2ecc40" : "5px solid #dc2626";
}

/**
 * Builds one calibration marker's element: an `<img>` of the ArUco SVG inside a plain `div`
 * wrapper, which is what gets handed to `maplibregl.Marker`.
 *
 * The wrapper is load-bearing, not decoration. `maplibregl.Marker` *owns* `element.style.transform`
 * — it writes its own `translate(...)` there on every position update — so an `<img>` passed
 * directly as the marker element has any `scaleX(-1)` silently overwritten, and the projected
 * marker comes out unmirrored (and therefore decodes to the wrong id, or not at all). Vanilla
 * dodges this the same way: `markers.js:createMarkers` hands MapLibre a wrapper `div` and puts the
 * mirroring `.marker-icon` transform on the child `<img>`. MapLibre positions the wrapper; the
 * image keeps its own transform.
 *
 * Note this is invisible to a unit test that fakes `maplibregl.Marker` — a fake never overwrites
 * the transform, so the mirror survives in jsdom and dies in the browser. `collabCalibrationPresentation.test.ts`
 * asserts the transform sits on the child image for exactly that reason.
 */
function buildCalibrationMarkerElement(markerId: number): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("alt", String(markerId));
    wrapper.dataset.calibrationMarkerId = String(markerId);
    wrapper.style.width = "0px";
    wrapper.style.height = "0px";

    const img = document.createElement("img");
    img.src = calibrationMarkerImageUrl(markerId);
    img.alt = String(markerId);
    img.className = "marker-icon";
    img.style.cursor = "grab";
    img.style.display = "block";
    // TOSCA's Tailwind preflight applies `img { max-width: 100% }`. Vanilla deliberately uses
    // a 0px wrapper, so that global rule otherwise collapses the SVG and leaves only its border.
    img.style.maxWidth = "none";
    img.style.maxHeight = "none";
    // The projector/camera path mirrors the image. Vanilla compensates with the same transform.
    img.style.transform = "scaleX(-1)";
    wrapper.appendChild(img);

    return wrapper;
}

/**
 * Reports one presented marker's actual rendered geometry to the console, once per marker as it is
 * created. This is operational output for the projector rig, not debug leftovers: whether the
 * cameras can decode a projected ArUco marker depends on numbers nobody can eyeball off the table
 * — the CSS-pixel footprint, and above all the quiet zone expressed in marker *cells* (the SVGs are
 * 6x6, and OpenCV needs roughly a full cell of white around the black ring to close the contour).
 * When markers come back undetected on site, this line is the first thing to read.
 */
function logCalibrationMarkerGeometry(markerId: number, wrapper: HTMLElement, map: MapLibreMap, aoi: AOIExtent): void {
    const img = calibrationMarkerImage(wrapper);
    if (img === null) {
        return;
    }
    // Reporting must never be able to break the presentation render itself.
    try {
        const topLeft = map.project(aoi.corners[0] as [number, number]);
        const topRight = map.project(aoi.corners[1] as [number, number]);
        const totalPx = Number.parseFloat(img.style.width);
        const canvas = map.getCanvas?.();
        console.info(`[collab] calibration marker ${markerId} rendered`, {
            totalPx,
            codeAreaPx: totalPx,
            quietZonePx: 0,
            aoiTopEdgePx: Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y),
            zoom: map.getZoom?.(),
            canvasCssPx: canvas === undefined ? undefined : [canvas.clientWidth, canvas.clientHeight],
            devicePixelRatio: window.devicePixelRatio,
            mirrored: img.style.transform,
        });
    } catch (error) {
        reportDeveloperError("collabTrackingRender.logCalibrationMarkerGeometry", error);
    }
}

/**
 * Wires the Python tracking adapter into the session (ticket 04/08) and renders both views
 * (ticket 15). Owned here rather than in `collabScenario`/`collabTracking` because it composes
 * both plus the map store and is genuinely new cross-cutting logic (plan §10 seam rule).
 *
 * - `startRendering(windowKind)` watches session state and renders "Tracked buildings (Python)" —
 *   the one Collab layer both Control and Table always show — plus, on Control only and only
 *   while {@link debugOverlaysEnabled}, the bbox/orientation/id/confidence debug overlays.
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

    const trackingAvailability = ref<TrackingAvailability>("live");
    /**
     * Whether Control's debug overlays (tracked bbox/orientation/id/confidence) are being rendered
     * (ticket 15) — off by default, off the normal layer panel entirely, and Control-only: Table
     * never has a debug switch. Toggling it off removes whatever debug layers are currently on the
     * map rather than merely hiding them, since `ensure*Layer` only ever adds/updates a layer.
     */
    const debugOverlaysEnabled = ref(false);
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

    let realSource: RealTrackingSource | undefined;
    let stopWatch: (() => void) | undefined;
    /**
     * Set only while waiting to see whether a reconnect resend's GeoJSON resumes (ticket 14) — a
     * live event clears it (resend succeeded); firing clears it too and falls back to detection
     * mode. Never more than one pending at a time: a fresh resend always clears any prior timer
     * first.
     */
    let resumeConfirmationTimer: ReturnType<typeof setTimeout> | undefined;
    /** Live `maplibregl.Marker` instances for the four calibration markers, keyed by marker id (ticket 11). */
    const calibrationMarkers = new Map<number, MapLibreMarker>();
    let calibrationResizeMap: MapLibreMap | undefined;

    function resizeCalibrationMarkers(): void {
        const map = calibrationResizeMap;
        if (map === undefined) {
            return;
        }
        for (const marker of calibrationMarkers.values()) {
            applyCalibrationMarkerSize(marker.getElement(), map);
        }
    }

    function attachCalibrationResizeListeners(map: MapLibreMap): void {
        if (calibrationResizeMap === map) {
            return;
        }
        detachCalibrationResizeListeners();
        calibrationResizeMap = map;
        map.on("zoom", resizeCalibrationMarkers);
        map.on("move", resizeCalibrationMarkers);
    }

    function detachCalibrationResizeListeners(): void {
        calibrationResizeMap?.off("zoom", resizeCalibrationMarkers);
        calibrationResizeMap?.off("move", resizeCalibrationMarkers);
        calibrationResizeMap = undefined;
    }
    /** Layer ids {@link syncCalibrationPresentation} hid — restored verbatim once presentation mode ends. */
    let hiddenLayerIds: string[] = [];

    function knownFootprint(objectId: string): Feature<Polygon> | undefined {
        const object = session.base.objects.find((candidate) => candidate.id === objectId);
        return object === undefined ? undefined : (toFeature(object) as Feature<Polygon>);
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
        // triggered by unrelated state (e.g. the debug switch) where the tracked footprints are
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
            detachCalibrationResizeListeners();
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
        attachCalibrationResizeListeners(map);
        for (const config of MAP_CALIBRATION_MARKERS) {
            const corner = aoiCornerForMapMarker(aoi, config.corner);
            const received = session.calibration.mapCalibrationMarkerIdsSeen.includes(config.id);
            const existing = calibrationMarkers.get(config.id);
            if (existing === undefined) {
                const element = buildCalibrationMarkerElement(config.id);
                applyCalibrationMarkerSize(element, map);
                applyCalibrationMarkerReceivedState(element, received);
                const marker = new maplibre.Marker({ element, draggable: true, anchor: "center" })
                    .setLngLat(corner as [number, number])
                    .addTo(map);
                marker.on("dragend", () => {
                    const pos = marker.getLngLat();
                    console.log("Marker moved:", { id: config.id, lng: pos.lng, lat: pos.lat });
                });
                calibrationMarkers.set(config.id, marker);
                logCalibrationMarkerGeometry(config.id, element, map, aoi);
            } else {
                existing.setLngLat(corner as [number, number]);
                // Re-size as well as re-position: the AOI may have changed under an existing marker.
                applyCalibrationMarkerSize(existing.getElement(), map);
                applyCalibrationMarkerReceivedState(existing.getElement(), received);
            }
        }
    }

    /**
     * Removes whatever Control debug-overlay layers/sources currently exist on the map (ticket 15)
     * — called when the debug switch turns off, since `ensure*Layer` only ever adds/updates a
     * layer and never removes one. Idempotent: a layer/source that was never created is skipped.
     */
    async function removeDebugOverlayLayers(): Promise<void> {
        const map = mapStore.map as MapLibreMap | undefined;
        if (map === undefined) {
            return;
        }
        for (const layerId of [TRACKED_BBOX_LAYER_ID, TRACKED_ORIENTATION_LAYER_ID, TRACKED_ID_LAYER_ID, TRACKED_CONFIDENCE_LAYER_ID]) {
            if (map.getLayer(layerId) !== undefined) {
                await mapStore.deleteMapLayer(layerId);
            }
        }
        for (const sourceId of [TRACKED_BBOX_SOURCE_ID, TRACKED_ORIENTATION_SOURCE_ID, TRACKED_ID_SOURCE_ID, TRACKED_CONFIDENCE_SOURCE_ID]) {
            if (map.getSource(sourceId) !== undefined) {
                mapStore.deleteMapDataSource(sourceId);
            }
        }
    }

    /**
     * Toggles Control's debug overlays (ticket 15) — Control-only, off by default, and absent
     * from the normal layer panel. Turning it off actively tears down whatever debug layers are
     * already on the map rather than leaving them stranded and merely un-refreshed.
     */
    function setDebugOverlaysEnabled(enabled: boolean): void {
        if (debugOverlaysEnabled.value === enabled) {
            return;
        }
        debugOverlaysEnabled.value = enabled;
        if (!enabled) {
            removeDebugOverlayLayers().catch((error) => reportDeveloperError("collabTrackingRender.setDebugOverlaysEnabled", error));
        }
    }

    /** Renders every Collab layer `windowKind` is allowed to show (ticket 15: "Tracked buildings (Python)" always, debug overlays only on Control while {@link debugOverlaysEnabled}). */
    async function updateLayers(windowKind: "control" | "table"): Promise<void> {
        await waitForStyleLoaded();

        if (windowKind === "table") {
            syncCalibrationPresentation();
            if (session.calibration.phase === "presenting") {
                // Calibration presentation is exclusive on Table (ticket 11): none of the normal
                // tracked layers below may reach the map while it's active.
                return;
            }
        }

        let tracked: TrackedRenderProducts;
        try {
            // Tracked buildings are derived exactly once, in Control (ticket 13) — Table reads the
            // broadcast collection instead of calling deriveTrackedFootprint itself.
            tracked = windowKind === "control" ? trackedRenderState() : tableTrackedRenderState();
        } catch (error) {
            reportDeveloperError("collabTrackingRender.updateLayers.deriveState", error);
            return;
        }

        // "Tracked buildings (Python)" (ticket 15) — the one Collab entry both windows always show.
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

        if (windowKind === "control" && debugOverlaysEnabled.value) {
            await safelyEnsure("trackedBbox", () =>
                ensureLineLayer(
                    TRACKED_BBOX_SOURCE_ID,
                    TRACKED_BBOX_LAYER_ID,
                    tracked.bboxes,
                    i18n.global.t("collab.layers.trackedBbox"),
                    "#dc2626"
                )
            );
            await safelyEnsure("trackedOrientation", () =>
                ensureLineLayer(
                    TRACKED_ORIENTATION_SOURCE_ID,
                    TRACKED_ORIENTATION_LAYER_ID,
                    tracked.orientations,
                    i18n.global.t("collab.layers.trackedOrientation"),
                    "#7c3aed"
                )
            );
            await safelyEnsure("trackedId", () =>
                ensureSymbolLayer(
                    TRACKED_ID_SOURCE_ID,
                    TRACKED_ID_LAYER_ID,
                    tracked.ids,
                    i18n.global.t("collab.layers.trackedId"),
                    -1.2
                )
            );
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
                ? [session.base, session.tracking, session.calibration, session.trackedBuildings]
                : [session.base, session.tracking, session.calibration, debugOverlaysEnabled.value];

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

    /**
     * Wires one `RealTrackingSource` instance's events into the store (plan §5c/§14, ticket 09;
     * connect-first ticket 08) — shared by `connectPythonTransport`'s mount-time connect, so there
     * is exactly one place that knows how to hook a `RealTrackingSource` up to session state.
     */
    function wireRealSource(source: RealTrackingSource): void {
        source.onEvent((event) => {
            applyTrackingEvent(session.tracking, event);
            // A live event is the only thing that counts as "GeoJSON resumed" (ticket 14) — never
            // the resend's own `socket.send()` returning. Any event received while a resend is
            // pending its confirmation window proves Python is back on the post-calibration feed.
            clearResumeConfirmationTimer();
        });
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
            if (state === "connected") {
                // Covers both a transient reconnect to the same running server and a reconnect
                // after a known Python-process restart (ticket 14) — the client observes the same
                // "connected" transition either way, and a resend is only attempted at all when a
                // measured calibration is actually cached (see `handleTransportReconnected`).
                handleTransportReconnected();
            }
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
                if (!next.has(markerId)) {
                    console.info("[collab] Python calibration marker detected; frontend accepted it", {
                        markerId,
                        reading,
                    });
                }
                next.set(markerId, reading);
                changed = true;
            }
            if (changed) {
                mapCalibrationMarkerHealth.value = next;
                // Broadcast just the id set (not the pixel readings) so Table can color its own
                // presented marker images green once read (fix-tickets), matching Vanilla's
                // `marker-received` feedback — Table is a separate document/window and never sees
                // `mapCalibrationMarkerHealth` itself (Control-local).
                session.calibration.mapCalibrationMarkerIdsSeen = [...next.keys()];
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
        session.calibration.mapCalibrationMarkerIdsSeen = [];
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
     * Enters calibration-presentation mode (ticket 11, fix-tickets): Control calls this — never
     * Table — typically right after opening the Table window, since Table always fits+locks to the
     * AOI before rendering anything else regardless. A no-op-safe write: idempotent to call again
     * while already presenting (e.g. refocusing an already-open Table window).
     */
    function enterCalibrationPresentation(): void {
        mapCalibrationMarkerHealth.value = new Map();
        session.calibration.mapCalibrationMarkerIdsSeen = [];
        session.calibration.phase = "presenting";
        session.calibration.revision += 1;
    }

    /** Leaves calibration-presentation mode — a clean seam for the real four-marker calibration flow to call once calibration succeeds. */
    function exitCalibrationPresentation(): void {
        session.calibration.phase = "idle";
        session.calibration.revision += 1;
    }

    /** Cancels any pending reconnect-resend confirmation window (ticket 14). Idempotent. */
    function clearResumeConfirmationTimer(): void {
        if (resumeConfirmationTimer === undefined) {
            return;
        }
        clearTimeout(resumeConfirmationTimer);
        resumeConfirmationTimer = undefined;
    }

    /**
     * Reconnect and recalibration policy (ticket 14): fires on every `RealTrackingSource`
     * `"connected"` transition, which a transient reconnect to the same running server and a
     * reconnect after a known Python-process restart both produce identically from the client's
     * point of view. A no-op unless there is a measured calibration cached for the currently
     * confirmed AOI (nothing to resend — covers the very first connect too) and the operator isn't
     * already mid-way through a fresh four-marker calibration (`"presenting"` — an auto-resend must
     * never race a calibration already in progress).
     *
     * Resends the cached payload, then starts a {@link RECONNECT_RESUME_TIMEOUT_MS} window judged
     * exactly like the original calibration was: by GeoJSON resuming (an `onEvent` firing clears
     * the timer — see `wireRealSource`), never by `sendMapCalibration`'s `socket.send()` returning.
     * If the window elapses with no event, the resend is treated as having failed — the stitched
     * pixel coordinate system this payload assumed no longer matches what Python is measuring — so
     * the session drops back to four-marker detection mode and the operator is told why.
     */
    function handleTransportReconnected(): void {
        const cached: MapCalibrationMessage | null = scenarioStore.lastMeasuredCalibration;
        if (cached === null || session.calibration.phase === "presenting" || realSource === undefined) {
            return;
        }
        realSource.sendMapCalibration(cached);
        clearResumeConfirmationTimer();
        resumeConfirmationTimer = setTimeout(() => {
            resumeConfirmationTimer = undefined;
            scenarioStore.calibrated = false;
            toast.add({ severity: "warning", summary: i18n.global.t("collab.control.calibration.resendFailed") });
            enterCalibrationPresentation();
        }, RECONNECT_RESUME_TIMEOUT_MS);
    }

    /**
     * Manually returns the session to four-marker detection mode (ticket 14) — available whenever
     * the physical setup changes (cameras/projector moved, so a resend's unmoved-hardware
     * assumption no longer holds) or the operator otherwise wants a fresh calibration, independent
     * of whatever triggered it. Clears the cached measured payload and calibrated status first, and
     * cancels any pending resend-confirmation window, so no stale auto-resend can fire mid-flow
     * once a fresh calibration is underway.
     */
    function recalibrate(): void {
        clearResumeConfirmationTimer();
        scenarioStore.calibrated = false;
        scenarioStore.lastMeasuredCalibration = null;
        enterCalibrationPresentation();
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
        // Cached for ticket 14's reconnect policy: the payload built from real measured pixel
        // positions, resendable as-is on a later reconnect as long as this AOI stays confirmed.
        scenarioStore.lastMeasuredCalibration = message;
        exitCalibrationPresentation();
        toast.add({
            severity: "success",
            summary: "Calibration successful",
            detail: "All four calibration markers were detected and the calibration was sent to the Python server.",
            life: 5000,
        });
    }

    /** Tears down every tracking source, the Python transport, and the render watch. Idempotent — safe on unmount and HMR. */
    function stop(): void {
        detachCalibrationResizeListeners();
        stopWatch?.();
        stopWatch = undefined;
        disconnectPythonTransport();
        clearResumeConfirmationTimer();
        appliedRotationByObjectId.clear();
        for (const marker of calibrationMarkers.values()) {
            marker.remove();
        }
        calibrationMarkers.clear();
        hiddenLayerIds = [];
    }

    onScopeDispose(stop);

    return {
        trackingAvailability,
        pythonConnectionState,
        detectedReferenceMarkerIds,
        mapCalibrationMarkerHealth,
        debugOverlaysEnabled,
        setDebugOverlaysEnabled,
        startRendering,
        retryPythonConnection,
        enterCalibrationPresentation,
        exitCalibrationPresentation,
        canCalibrateFromMarkers,
        calibrateFromDetectedMarkers,
        recalibrate,
        stop,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useCollabTrackingRenderStore, import.meta.hot));
}
