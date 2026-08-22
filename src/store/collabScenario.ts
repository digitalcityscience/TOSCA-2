import { acceptHMRUpdate, defineStore } from "pinia";
import { computed, ref } from "vue";
import bbox from "@turf/bbox";
import booleanWithin from "@turf/boolean-within";
import distance from "@turf/distance";
import { point, polygon } from "@turf/helpers";
import type { Position } from "geojson";
import type { Feature, FeatureCollection, Polygon } from "@helpers/geojson";
import { reportDeveloperError } from "@helpers/userFacingError";
import { useToast } from "@helpers/toast";
import { i18n } from "../core/i18n";
import { useMapStore } from "./map";
import { useDrawStore } from "./draw";
import { useCollabSessionStore, type CollabSceneObject } from "./collabSession";
import {
    buildMapCalibration,
    DEFAULT_COLLAB_TABLE_CONFIG,
    type AOIExtent,
    type CollabTableConfig,
    type MapCalibrationMessage,
} from "./collabCalibration";
import { COLLAB_BUILDING_FIXTURE, type CollabBuildingFixtureProperties } from "../collab/fixtures/collabBuildingFixture";

/** A `CollabSceneObject` that carries its GeoJSON geometry/properties (this ticket's base-city shape). */
export interface CollabBuildingObject extends CollabSceneObject {
    geometry: Polygon;
    properties: CollabBuildingFixtureProperties;
}

const FOOTPRINT_SOURCE_ID = "collabFootprints";
const FOOTPRINT_FILL_LAYER_ID = "collabFootprints-fill";
const FOOTPRINT_OUTLINE_LAYER_ID = "collabFootprints-outline";

/** Converts a fixture/base-city feature into the flat `CollabSceneObject` shape the session slice stores. */
export function toSceneObject(feature: Feature<Polygon, CollabBuildingFixtureProperties>): CollabBuildingObject {
    return {
        id: feature.properties.id,
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

/** Fixture features whose footprint lies entirely within the chosen AOI. */
export function footprintsWithinAoi(
    features: Array<Feature<Polygon, CollabBuildingFixtureProperties>>,
    aoi: AOIExtent
): Array<Feature<Polygon, CollabBuildingFixtureProperties>> {
    const ring: Position[] = [...aoi.corners, aoi.corners[0]];
    const aoiPolygon = polygon([ring]);
    return features.filter((feature) => booleanWithin(feature, aoiPolygon));
}

/**
 * AOI selection + fixture footprint loading + scenario-delta removal for the Control View
 * (plan §8/§10/§15, ticket 07). Composes `collabSession` (state), `map` (render, public API
 * only), `draw` (Terra Draw AOI polygon) and `collabCalibration` (map_calibration handshake) —
 * it owns no state Session doesn't already model; it is the Control View's write path into it.
 */
export const useCollabScenarioStore = defineStore("collabScenario", () => {
    const session = useCollabSessionStore();
    const mapStore = useMapStore();
    const drawStore = useDrawStore();
    const toast = useToast();

    const tableConfig = ref<CollabTableConfig>(DEFAULT_COLLAB_TABLE_CONFIG);
    const aoi = ref<AOIExtent | null>(null);
    const mapCalibration = ref<MapCalibrationMessage | null>(null);
    const aoiSelectionInProgress = ref(false);

    const selectableBuildings = computed<Array<Feature<Polygon, CollabBuildingFixtureProperties>>>(() => {
        const features = COLLAB_BUILDING_FIXTURE.features;
        return aoi.value === null ? features : footprintsWithinAoi(features, aoi.value);
    });

    function currentScenarioFeatureCollection(): FeatureCollection {
        return {
            type: "FeatureCollection",
            features: session.currentScenario.map(toFeature),
        };
    }

    function updateFootprintLayerData(): void {
        const source = mapStore.map?.getSource(FOOTPRINT_SOURCE_ID);
        source?.setData(currentScenarioFeatureCollection());
    }

    /** Renders (or, if already present, updates) the selectable-footprint layer via the map store's public API. */
    async function renderFootprintLayer(): Promise<void> {
        if (mapStore.map?.getSource(FOOTPRINT_SOURCE_ID) !== undefined) {
            updateFootprintLayerData();
            return;
        }
        const data = currentScenarioFeatureCollection();
        try {
            await mapStore.addMapDataSource({
                sourceType: "geojson",
                identifier: FOOTPRINT_SOURCE_ID,
                isFilterLayer: false,
                geoJSONSrc: data,
            });
            await mapStore.addMapLayer({
                sourceType: "geojson",
                identifier: FOOTPRINT_FILL_LAYER_ID,
                layerType: "fill",
                sourceIdentifier: FOOTPRINT_SOURCE_ID,
                geoJSONSrc: data,
                isFilterLayer: false,
                displayName: "Collab · Selectable buildings",
                layerStyle: { paint: { "fill-color": "#2563eb", "fill-opacity": 0.35 } },
            });
            mapStore.addCompanionLayer(FOOTPRINT_FILL_LAYER_ID, {
                id: FOOTPRINT_OUTLINE_LAYER_ID,
                type: "line",
                source: FOOTPRINT_SOURCE_ID,
                paint: { "line-color": "#1d4ed8", "line-width": 1.5 },
            });
        } catch (error) {
            reportDeveloperError("collabScenario.renderFootprintLayer", error);
            toast.add({ severity: "error", summary: i18n.global.t("collab.control.footprints.loadFailed") });
        }
    }

    /**
     * Loads the PoC building fixture — scoped to the selected AOI (`selectableBuildings`) — into
     * the base-city slice, then renders it (OD-3). Requires an AOI: buildings are only ever
     * "selectable footprints for the AOI" (ticket 07), never the whole fixture. Re-running this
     * after re-selecting a different AOI refreshes `base` to that AOI's buildings.
     */
    async function loadFixtureFootprints(): Promise<void> {
        if (aoi.value === null) {
            toast.add({ severity: "warning", summary: i18n.global.t("collab.control.footprints.loadRequiresAoi") });
            return;
        }
        session.base.objects = selectableBuildings.value.map(toSceneObject);
        session.base.loaded = true;
        await renderFootprintLayer();
    }

    /** Starts AOI polygon drawing via the shared draw store (reused, not forked — plan §15). */
    function startAoiSelection(): void {
        if (drawStore.terraDraw === undefined) {
            reportDeveloperError("collabScenario.startAoiSelection", new Error("TerraDraw not initialized"));
            return;
        }
        drawStore.externalAppOnProgress = true;
        drawStore.clearSnapshot();
        drawStore.changeMode("polygon");
        aoiSelectionInProgress.value = true;
    }

    function cancelAoiSelection(): void {
        drawStore.stopDrawMode();
        drawStore.clearSnapshot();
        drawStore.externalAppOnProgress = false;
        aoiSelectionInProgress.value = false;
    }

    /**
     * Reads the drawn AOI polygon, validates its aspect ratio against the table config, and (if
     * valid) records it and builds the `map_calibration` correspondences (plan §6/§8, M0.5 §21).
     * Leaves the drawing active on validation failure so the operator can redraw.
     */
    function finishAoiSelection(): boolean {
        const snapshot = drawStore.getSnapshot();
        const drawnPolygon = snapshot.find((feature) => feature.geometry.type === "Polygon") as
            | Feature<Polygon>
            | undefined;
        if (drawnPolygon === undefined) {
            toast.add({ severity: "warning", summary: i18n.global.t("collab.control.aoi.drawFirst") });
            return false;
        }
        const extent = extentFromPolygon(drawnPolygon);
        if (!isAspectRatioValid(extent, tableConfig.value)) {
            toast.add({
                severity: "warning",
                summary: i18n.global.t("collab.control.aoi.aspectRatioInvalid"),
            });
            return false;
        }
        aoi.value = extent;
        mapCalibration.value = buildMapCalibration(extent, tableConfig.value);
        drawStore.stopDrawMode();
        drawStore.clearSnapshot();
        drawStore.externalAppOnProgress = false;
        aoiSelectionInProgress.value = false;
        return true;
    }

    /** Marks a building removed as a Scenario delta (never mutates `base`) and re-renders the footprint layer. */
    function removeBuilding(id: string): void {
        if (!session.scenario.removedBuildings.includes(id)) {
            session.scenario.removedBuildings.push(id);
        }
        updateFootprintLayerData();
    }

    /** Reverses `removeBuilding` — restores a building to the current scenario. */
    function restoreBuilding(id: string): void {
        const index = session.scenario.removedBuildings.indexOf(id);
        if (index !== -1) {
            session.scenario.removedBuildings.splice(index, 1);
        }
        updateFootprintLayerData();
    }

    return {
        tableConfig,
        aoi,
        mapCalibration,
        aoiSelectionInProgress,
        selectableBuildings,
        startAoiSelection,
        cancelAoiSelection,
        finishAoiSelection,
        loadFixtureFootprints,
        removeBuilding,
        restoreBuilding,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useCollabScenarioStore, import.meta.hot));
}
