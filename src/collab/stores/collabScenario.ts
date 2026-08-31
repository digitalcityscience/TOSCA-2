import { acceptHMRUpdate, defineStore } from "pinia";
import { computed, ref } from "vue";
import bbox from "@turf/bbox";
import distance from "@turf/distance";
import { point } from "@turf/helpers";
import type { Position } from "geojson";
import type { Feature, FeatureCollection, Polygon } from "@helpers/geojson";
import { reportDeveloperError } from "@helpers/userFacingError";
import { useToast } from "@helpers/toast";
import { i18n } from "../../core/i18n";
import { useMapStore } from "@store/map";
import { useCollabSessionStore, type CollabSceneObject } from "./collabSession";
import {
    buildMapCalibration,
    DEFAULT_COLLAB_TABLE_CONFIG,
    deriveGroundScale,
    isAoiZoomSufficient,
    type AOIExtent,
    type CollabTableConfig,
    type MapCalibrationMessage,
} from "./collabCalibration";
import { collabDebugLog } from "../helpers/collabDebugLog"; // TEMPORARY diagnostic import — remove with the debug log calls below
import {
    collabBuildingDataset,
    collabFootprintsWithinAoi,
    type CollabBuildingFeature,
    type CollabBuildingProperties,
} from "../data/collabBuildingData";

/** A `CollabSceneObject` that carries its GeoJSON geometry/properties (this ticket's base-city shape). */
export interface CollabBuildingObject extends CollabSceneObject {
    geometry: CollabBuildingFeature["geometry"];
    properties: CollabBuildingProperties;
}

const AOI_CONFIRMED_SOURCE_ID = "collabAoi";
const AOI_CONFIRMED_OUTLINE_LAYER_ID = "collabAoi-outline";

/** Converts a fixture/base-city feature into the flat `CollabSceneObject` shape the session slice stores. */
export function toSceneObject(feature: CollabBuildingFeature): CollabBuildingObject {
    return {
        id: feature.properties.building_id ?? feature.properties.id ?? "",
        geometry: feature.geometry,
        properties: feature.properties,
    };
}

/** Converts a stored `CollabSceneObject` back into a renderable GeoJSON feature. Assumes the shape `toSceneObject` produced. */
export function toFeature(object: CollabSceneObject): Feature {
    const building = object as CollabBuildingObject;
    return { type: "Feature", id: building.id, geometry: building.geometry, properties: building.properties };
}

/**
 * The four corners (GeoJSON `[lon, lat]`) of a drawn polygon's bounding box, ordered top-left,
 * top-right, bottom-right, bottom-left — the ordering `buildMapCalibration` expects (plan §6).
 */
export function extentFromPolygon(feature: Feature<Polygon>): AOIExtent {
    const [minX, minY, maxX, maxY] = bbox(feature);
    return {
        corners: [
            [minX, maxY],
            [maxX, maxY],
            [maxX, minY],
            [minX, minY],
        ],
    };
}

/**
 * Whether a chosen AOI's geodesic width:height ratio is within `toleranceRatio` of the physical
 * table's aspect ratio (default ~2:1 for 160×80cm, but read from config — never hardcoded, B6).
 */
export function isAspectRatioValid(
    aoi: AOIExtent,
    config: CollabTableConfig,
    toleranceRatio = 0.2
): boolean {
    const [topLeft, topRight, , bottomLeft] = aoi.corners;
    const widthMeters = distance(point(topLeft), point(topRight), { units: "meters" });
    const heightMeters = distance(point(topLeft), point(bottomLeft), { units: "meters" });
    if (heightMeters === 0) {
        return false;
    }
    const actualRatio = widthMeters / heightMeters;
    const expectedRatio = config.physicalTable.widthCm / config.physicalTable.heightCm;
    return Math.abs(actualRatio - expectedRatio) / expectedRatio <= toleranceRatio;
}

/**
 * Whether "Start Tracking" may be pressed (ticket 02): `startRealTracking` bails out with no
 * visible effect when `mapCalibration` is `null` (no AOI confirmed yet), so the control must stay
 * disabled until an AOI has been selected and confirmed — no click path may lead to nothing
 * happening. Footprints must also be loaded (ticket 07's existing gate) since tracking has no
 * marker→object registry to resolve against otherwise.
 */
export function canStartTracking(baseLoaded: boolean, mapCalibration: MapCalibrationMessage | null): boolean {
    return baseLoaded && mapCalibration !== null;
}

/**
 * Whether "Open Table window" may be opened (ticket 09): the Table window fits and locks to the
 * Control-selected AOI (ticket 11), so one must be confirmed first — no click path may open a
 * Table window with nothing to show it.
 */
export function canOpenTableWindow(aoi: AOIExtent | null): boolean {
    return aoi !== null;
}

/** Fixture features whose footprint lies entirely within the chosen AOI. */
export function footprintsWithinAoi(
    features: readonly CollabBuildingFeature[],
    aoi: AOIExtent
): CollabBuildingFeature[] {
    return collabFootprintsWithinAoi(features, aoi);
}

const AOI_VIEWFINDER_SOURCE_ID = "collabAoiViewfinder";
const AOI_VIEWFINDER_OUTLINE_LAYER_ID = "collabAoiViewfinder-outline";

/** Fraction of the shorter map-canvas dimension the AOI viewfinder rectangle occupies on screen. */
const VIEWFINDER_SCREEN_FRACTION = 0.6;

const VIEWFINDER_VALID_COLOR = "#16a34a";
const VIEWFINDER_INVALID_COLOR = "#dc2626";

/**
 * The AOI viewfinder's four screen-space (canvas-pixel) corners, ordered top-left, top-right,
 * bottom-right, bottom-left, for a canvas of the given size — locked to the table's physical
 * aspect ratio (from `config`, never hardcoded, B6) and centred on screen. This is the "dedicated
 * GeoJSON, not freehand draw" AOI mechanism: the operator pans/zooms the basemap under a
 * fixed-ratio rectangle instead of drawing one by hand, so the selected AOI's aspect ratio is
 * always correct by construction.
 *
 * `obscuredLeftPx` shrinks the usable region from the left before centring — the Control sidebar
 * floats over the map's west edge while AOI selection runs, so centring on the full canvas would
 * put the rectangle visually off-center in the space actually visible to the operator.
 */
export function viewfinderScreenCorners(
    canvasWidth: number,
    canvasHeight: number,
    config: CollabTableConfig,
    obscuredLeftPx = 0
): [[number, number], [number, number], [number, number], [number, number]] {
    const aspectRatio = config.physicalTable.widthCm / config.physicalTable.heightCm;
    const visibleWidth = Math.max(0, canvasWidth - obscuredLeftPx);
    const maxWidth = visibleWidth * VIEWFINDER_SCREEN_FRACTION;
    const maxHeight = canvasHeight * VIEWFINDER_SCREEN_FRACTION;
    let boxWidth = maxWidth;
    let boxHeight = boxWidth / aspectRatio;
    if (boxHeight > maxHeight) {
        boxHeight = maxHeight;
        boxWidth = boxHeight * aspectRatio;
    }
    const centerX = obscuredLeftPx + visibleWidth / 2;
    const centerY = canvasHeight / 2;
    const left = centerX - boxWidth / 2;
    const right = centerX + boxWidth / 2;
    const top = centerY - boxHeight / 2;
    const bottom = centerY + boxHeight / 2;
    return [
        [left, top],
        [right, top],
        [right, bottom],
        [left, bottom],
    ];
}

/**
 * AOI selection + fixture footprint loading + scenario-delta removal for the Control View
 * (plan §8/§10/§15, ticket 07). Composes `collabSession` (state), `map` (render, public API
 * only) and `collabCalibration` (map_calibration handshake) — it owns no state Session doesn't
 * already model; it is the Control View's write path into it.
 *
 * AOI selection is a screen-anchored "viewfinder" rectangle, not a freehand Terra Draw polygon:
 * its on-screen size is locked to the table's aspect ratio ({@link viewfinderScreenCorners}), so
 * the operator pans/zooms the basemap under it rather than tracing a shape. Its geographic extent
 * is re-derived from the current map view on every `move`/`zoom`, coloured green once
 * {@link isAoiZoomSufficient} accepts the current zoom and red while still too zoomed out — the
 * operator is always free to zoom in further (a smaller AOI never fails, B6/`isAoiZoomSufficient`).
 */
export const useCollabScenarioStore = defineStore("collabScenario", () => {
    const session = useCollabSessionStore();
    const mapStore = useMapStore();
    const toast = useToast();

    const tableConfig = ref<CollabTableConfig>(DEFAULT_COLLAB_TABLE_CONFIG);
    const aoi = ref<AOIExtent | null>(null);
    const mapCalibration = ref<MapCalibrationMessage | null>(null);
    /**
     * Whether the confirmed AOI has been calibrated against the physical table via the real
     * four-marker flow (ticket 12, `collabTrackingRender.calibrateFromDetectedMarkers`). Distinct
     * from `mapCalibration` (the synthetic,
     * config-derived correspondence ticket 07 already computes and mock/dev tracking gates on):
     * this is what the Control panel's "Calibration status" section (ticket 09) reads, and it is
     * always invalidated the moment an AOI is (re)confirmed, since any previously-established
     * calibration no longer matches the newly confirmed extent and the table must be recalibrated.
     */
    const calibrated = ref(false);
    /**
     * The last valid *measured* `map_calibration` payload sent to Python via the real four-marker
     * flow (ticket 12, `collabTrackingRender.calibrateFromDetectedMarkers`) — cached so a transient
     * reconnect or a Python-process restart (ticket 14) can resend it without the operator having
     * to re-detect all four markers, as long as the confirmed AOI hasn't changed since. Distinct
     * from `mapCalibration` (the synthetic, config-derived correspondence): this one only ever
     * holds a payload built from real measured pixel positions. `null` whenever no measured
     * calibration has succeeded for the current AOI — invalidated, exactly like `calibrated`, the
     * moment a (re)confirmed AOI makes any previously-cached payload stale.
     */
    const lastMeasuredCalibration = ref<MapCalibrationMessage | null>(null);
    /**
     * The {@link aoiChecksum} of the AOI `lastMeasuredCalibration` was measured against (grilling
     * doc Q3) — a resend on reconnect (`collabTrackingRender.handleTransportReconnected`) is only
     * safe while the confirmed AOI's checksum still matches this one. `null` exactly when
     * `lastMeasuredCalibration` is `null`.
     */
    const lastMeasuredCalibrationAoiHash = ref<string | null>(null);
    const aoiSelectionInProgress = ref(false);
    /** The viewfinder's current geographic extent — recomputed on every map move/zoom while selecting. */
    const viewfinderExtent = ref<AOIExtent | null>(null);
    /** Whether `viewfinderExtent` currently meets `tableConfig.aoiScaleTarget` (drives the red/green outline). */
    const viewfinderValid = ref(false);

    const selectableBuildings = computed<CollabBuildingFeature[]>(() => {
        const features = collabBuildingDataset().footprints.features;
        return aoi.value === null ? features : footprintsWithinAoi(features, aoi.value);
    });

    /**
     * The confirmed AOI as an explicit GeoJSON feature (ticket 09) — the persistent, renderable
     * representation of `aoi`, rather than only the raw corner values `AOIExtent` carries. `null`
     * whenever no AOI is confirmed.
     */
    const aoiFeature = computed<Feature<Polygon> | null>(() => {
        if (aoi.value === null) {
            return null;
        }
        const ring: Position[] = [...aoi.value.corners, aoi.value.corners[0]];
        return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
    });

    function currentAoiFeatureCollection(): FeatureCollection {
        return aoiFeature.value === null ? { type: "FeatureCollection", features: [] } : { type: "FeatureCollection", features: [aoiFeature.value] };
    }

    /**
     * Renders (or, once confirmed once, updates) the confirmed-AOI layer via the map store's
     * public API — a persistent entry distinct from the transient viewfinder outline, left visible
     * in Control's layer management (default `showOnLayerList`) so the operator can see it as a
     * real layer, not just sidebar text (ticket 09).
     */
    async function renderAoiLayer(): Promise<void> {
        const data = currentAoiFeatureCollection();
        if (mapStore.map?.getSource(AOI_CONFIRMED_SOURCE_ID) !== undefined) {
            mapStore.map.getSource(AOI_CONFIRMED_SOURCE_ID)?.setData(data);
            return;
        }
        try {
            await mapStore.addMapDataSource({
                sourceType: "geojson",
                identifier: AOI_CONFIRMED_SOURCE_ID,
                isFilterLayer: false,
                geoJSONSrc: data,
            });
            await mapStore.addMapLayer({
                sourceType: "geojson",
                identifier: AOI_CONFIRMED_OUTLINE_LAYER_ID,
                layerType: "line",
                sourceIdentifier: AOI_CONFIRMED_SOURCE_ID,
                geoJSONSrc: data,
                isFilterLayer: false,
                displayName: i18n.global.t("collab.layers.aoi"),
                layerStyle: { paint: { "line-color": "#16a34a", "line-width": 2 } },
            });
        } catch (error) {
            reportDeveloperError("collabScenario.renderAoiLayer", error);
            toast.add({ severity: "error", summary: i18n.global.t("collab.control.aoi.layerFailed") });
        }
    }

    /**
     * Loads the Collab-owned building dataset — scoped to the selected AOI (`selectableBuildings`,
     * ticket 10) — into the base-city slice (OD-3). Requires an AOI: buildings are only ever
     * "selectable footprints for the AOI" (ticket 07). Re-running this after re-selecting a
     * different AOI refreshes `base` to that AOI's buildings. The base dataset itself is never
     * rendered as its own map layer — it exists only as the known-footprint reference `collabTrackingRender`
     * translates/rotates onto detected poses for the "Tracked buildings (Python)" layer.
     */
    async function loadKnownFootprints(): Promise<void> {
        if (aoi.value === null) {
            toast.add({ severity: "warning", summary: i18n.global.t("collab.control.footprints.loadRequiresAoi") });
            return;
        }
        try {
            session.base.objects = selectableBuildings.value.map(toSceneObject);
            session.base.loaded = true;
        } catch (error) {
            session.base.objects = [];
            session.base.loaded = false;
            reportDeveloperError("collabScenario.loadKnownFootprints", error);
            toast.add({
                severity: "error",
                summary: error instanceof Error ? error.message : i18n.global.t("collab.control.footprints.loadFailed"),
            });
        }
    }

    /** Builds the single-feature viewfinder `FeatureCollection` from the current `viewfinderExtent`/`viewfinderValid`. */
    function currentViewfinderFeatureCollection(): FeatureCollection {
        if (viewfinderExtent.value === null) {
            return { type: "FeatureCollection", features: [] };
        }
        const ring: Position[] = [...viewfinderExtent.value.corners, viewfinderExtent.value.corners[0]];
        const feature: Feature = {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [ring] },
            properties: { valid: viewfinderValid.value },
        };
        return { type: "FeatureCollection", features: [feature] };
    }

    function updateViewfinderLayerData(): void {
        const source = mapStore.map?.getSource(AOI_VIEWFINDER_SOURCE_ID);
        source?.setData(currentViewfinderFeatureCollection());
    }

    /**
     * Width, in canvas-pixels, that the Control sidebar (`BaseSlideoverSidebarComponent`, id
     * "collabControl") currently occludes from the map's west edge. Measured from the live DOM
     * rather than hardcoded so it tracks the sidebar's actual rendered width (`w-[min(24rem,
     * calc(100vw-5rem))]`) across breakpoints instead of drifting out of sync with its CSS.
     */
    function controlSidebarObscuredLeftPx(canvas: HTMLCanvasElement): number {
        const sidebarEl = document.getElementById("collabControl");
        if (sidebarEl === null) {
            return 0;
        }
        const sidebarRight = sidebarEl.getBoundingClientRect().right;
        const canvasLeft = canvas.getBoundingClientRect().left;
        return Math.max(0, sidebarRight - canvasLeft);
    }

    /**
     * Recomputes `viewfinderExtent`/`viewfinderValid` from the current map view — the viewfinder
     * rectangle's on-screen position/size never changes while selecting; only its geographic
     * extent does, as the operator pans/zooms the basemap under it.
     */
    function updateViewfinderExtent(): void {
        const map = mapStore.map;
        if (map === undefined) {
            return;
        }
        const canvas = map.getCanvas();
        const obscuredLeftPx = controlSidebarObscuredLeftPx(canvas);
        const screenCorners = viewfinderScreenCorners(canvas.clientWidth, canvas.clientHeight, tableConfig.value, obscuredLeftPx);
        const corners = screenCorners.map((screenPoint) => {
            const { lng, lat } = map.unproject(screenPoint);
            return [lng, lat] as Position;
        }) as AOIExtent["corners"];
        const extent: AOIExtent = { corners };
        viewfinderExtent.value = extent;
        const wasValid = viewfinderValid.value;
        viewfinderValid.value = isAoiZoomSufficient(extent, tableConfig.value);
        if (viewfinderValid.value !== wasValid) {
            // TEMPORARY — remove after AOI/marker diagnosis: only logs on red/green transitions,
            // not every map move, to stay non-spammy.
            collabDebugLog("control", "aoiZoomTransition", {
                valid: viewfinderValid.value,
                groundScale: deriveGroundScale(extent, tableConfig.value),
                targetGroundScale: tableConfig.value.aoiScaleTarget.groundScale,
            });
        }
    }

    function handleViewfinderMapMove(): void {
        updateViewfinderExtent();
        updateViewfinderLayerData();
    }

    /** Renders (or, if already present, updates) the viewfinder outline layer via the map store's public API. */
    async function renderViewfinderLayer(): Promise<void> {
        if (mapStore.map?.getSource(AOI_VIEWFINDER_SOURCE_ID) !== undefined) {
            updateViewfinderLayerData();
            return;
        }
        const data = currentViewfinderFeatureCollection();
        try {
            await mapStore.addMapDataSource({
                sourceType: "geojson",
                identifier: AOI_VIEWFINDER_SOURCE_ID,
                isFilterLayer: false,
                geoJSONSrc: data,
            });
            await mapStore.addMapLayer({
                sourceType: "geojson",
                identifier: AOI_VIEWFINDER_OUTLINE_LAYER_ID,
                layerType: "line",
                sourceIdentifier: AOI_VIEWFINDER_SOURCE_ID,
                geoJSONSrc: data,
                isFilterLayer: false,
                showOnLayerList: false,
                displayName: i18n.global.t("collab.layers.aoiViewfinder"),
                // Interior deliberately unfilled (no fill layer) so the viewfinder never covers the
                // basemap — only the outline colour communicates the red(too zoomed out)/green(ready) state.
                layerStyle: {
                    paint: {
                        "line-color": [
                            "case",
                            ["==", ["get", "valid"], true],
                            VIEWFINDER_VALID_COLOR,
                            VIEWFINDER_INVALID_COLOR,
                        ],
                        "line-width": 3,
                    },
                },
            });
        } catch (error) {
            reportDeveloperError("collabScenario.renderViewfinderLayer", error);
            toast.add({ severity: "error", summary: i18n.global.t("collab.control.aoi.viewfinderFailed") });
        }
    }

    /** Removes the viewfinder layer/source, if present (cancel or finish). */
    async function removeViewfinderLayer(): Promise<void> {
        if (mapStore.map?.getLayer(AOI_VIEWFINDER_OUTLINE_LAYER_ID) !== undefined) {
            await mapStore.deleteMapLayer(AOI_VIEWFINDER_OUTLINE_LAYER_ID);
        }
        if (mapStore.map?.getSource(AOI_VIEWFINDER_SOURCE_ID) !== undefined) {
            mapStore.deleteMapDataSource(AOI_VIEWFINDER_SOURCE_ID);
        }
    }

    /**
     * Starts AOI viewfinder selection: draws the aspect-ratio-locked rectangle centred on screen
     * and starts tracking the map's `move` event to keep its geographic extent (and red/green
     * validity) current as the operator pans/zooms underneath it.
     */
    async function startAoiSelection(): Promise<void> {
        if (mapStore.map === undefined) {
            reportDeveloperError("collabScenario.startAoiSelection", new Error("Map not initialized"));
            return;
        }
        aoiSelectionInProgress.value = true;
        updateViewfinderExtent();
        await renderViewfinderLayer();
        mapStore.map.on("move", handleViewfinderMapMove);
    }

    function cancelAoiSelection(): void {
        mapStore.map?.off("move", handleViewfinderMapMove);
        removeViewfinderLayer().catch((error) => reportDeveloperError("collabScenario.cancelAoiSelection", error));
        viewfinderExtent.value = null;
        viewfinderValid.value = false;
        aoiSelectionInProgress.value = false;
    }

    /**
     * Accepts the viewfinder's current geographic extent as the AOI and builds the
     * `map_calibration` correspondences (plan §6/§8, M0.5 §21). Refuses while the viewfinder is
     * still red (too zoomed out) — the operator must zoom in first; a smaller AOI is always fine.
     */
    function finishAoiSelection(): boolean {
        if (viewfinderExtent.value === null || !viewfinderValid.value) {
            toast.add({ severity: "warning", summary: i18n.global.t("collab.control.aoi.zoomInFirst") });
            return false;
        }
        const extent = viewfinderExtent.value;
        if (!isAspectRatioValid(extent, tableConfig.value)) {
            // Defensive only: the viewfinder is aspect-ratio-locked by construction, so this
            // should be unreachable outside of extreme projection distortion near the poles.
            toast.add({
                severity: "warning",
                summary: i18n.global.t("collab.control.aoi.aspectRatioInvalid"),
            });
            return false;
        }
        aoi.value = extent;
        mapCalibration.value = buildMapCalibration(extent, tableConfig.value);
        // TEMPORARY — remove after AOI/marker diagnosis
        collabDebugLog("control", "aoiConfirmed", {
            corners: extent.corners,
            groundScale: deriveGroundScale(extent, tableConfig.value),
            targetGroundScale: tableConfig.value.aoiScaleTarget.groundScale,
        });
        // Confirming any AOI — first time or replacing an existing one — invalidates whatever
        // calibration status was showing: a fresh/changed AOI has not been calibrated against the
        // physical table yet (ticket 09; the real four-marker flow itself is ticket 12). The cached
        // measured payload goes with it (ticket 14) — there is no path where a stale calibration,
        // built for a different AOI, may be resent against this one.
        calibrated.value = false;
        lastMeasuredCalibration.value = null;
        lastMeasuredCalibrationAoiHash.value = null;
        renderAoiLayer().catch((error) => reportDeveloperError("collabScenario.finishAoiSelection", error));
        // Ticket 10: confirming an AOI is the load action. The operator never has to press a
        // separate fixture/data button; validation and AOI filtering happen before the registry
        // can be used by tracking.
        void loadKnownFootprints();
        mapStore.map?.off("move", handleViewfinderMapMove);
        removeViewfinderLayer().catch((error) => reportDeveloperError("collabScenario.finishAoiSelection", error));
        viewfinderExtent.value = null;
        viewfinderValid.value = false;
        aoiSelectionInProgress.value = false;
        return true;
    }

    return {
        tableConfig,
        aoi,
        mapCalibration,
        calibrated,
        lastMeasuredCalibration,
        lastMeasuredCalibrationAoiHash,
        aoiFeature,
        aoiSelectionInProgress,
        viewfinderExtent,
        viewfinderValid,
        selectableBuildings,
        startAoiSelection,
        cancelAoiSelection,
        finishAoiSelection,
        loadKnownFootprints,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useCollabScenarioStore, import.meta.hot));
}
