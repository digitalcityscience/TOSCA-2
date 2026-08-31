import booleanWithin from "@turf/boolean-within";
import { polygon } from "@turf/helpers";
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import rawBuildingsText from "./buildings_all.geojson?raw";
import rawMarkerBuildingMap from "./marker-building-map.json";
import type { AOIExtent } from "../stores/collabCalibration";
import {
    MAP_CALIBRATION_MARKER_IDS,
    createMarkerObjectRegistry,
    reservedMarkerRole,
    type MarkerObjectRegistry,
} from "../stores/collabTracking";

export interface CollabBuildingProperties {
    building_id: string;
    /** Legacy mock/fixture compatibility; real Collab data is keyed by `building_id`. */
    id?: string;
    /** Legacy mock/fixture compatibility; real associations live in marker-building-map.json. */
    marker_id?: number;
    city_scope_id: string;
    building_height?: number;
    floor_area?: number;
    number_of_stories?: number;
    land_use_suggested?: string;
    [key: string]: unknown;
}

export type CollabBuildingFeature = Feature<Polygon | MultiPolygon, CollabBuildingProperties>;

export interface MarkerBuildingMapping {
    marker_id: number;
    building_id: string;
}

export interface CollabBuildingDataset {
    footprints: FeatureCollection<Polygon | MultiPolygon, CollabBuildingProperties>;
    markerMappings: readonly MarkerBuildingMapping[];
}

function record(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

/** Validates Collab-owned footprints and the separately editable physical marker mapping. */
export function validateCollabBuildingDataset(footprintsValue: unknown, mappingsValue: unknown): CollabBuildingDataset {
    const collection = record(footprintsValue);
    if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
        throw new Error("Building dataset is not a GeoJSON FeatureCollection");
    }

    const buildingIds = new Set<string>();
    const footprints: CollabBuildingFeature[] = collection.features.map((value, index) => {
        const feature = record(value);
        const properties = record(feature?.properties);
        const rawBuildingId = properties?.building_id;
        const label = typeof rawBuildingId === "string" && rawBuildingId.trim() !== "" ? rawBuildingId : `feature ${index}`;
        const geometry = record(feature?.geometry);
        if (geometry?.type !== "Polygon" && geometry?.type !== "MultiPolygon") {
            throw new Error(`Building ${label}: geometry must be Polygon or MultiPolygon`);
        }
        if (typeof rawBuildingId !== "string" || rawBuildingId.trim() === "") {
            throw new Error(`Building feature ${index}: missing building_id`);
        }
        if (buildingIds.has(rawBuildingId)) {
            throw new Error(`Building ${rawBuildingId}: duplicate building_id`);
        }
        buildingIds.add(rawBuildingId);
        return value as CollabBuildingFeature;
    });

    if (!Array.isArray(mappingsValue)) {
        throw new Error("Marker-building mapping must be an array");
    }
    const markerIds = new Set<number>();
    const markerMappings = mappingsValue.map((value, index) => {
        const mapping = record(value);
        const markerId = mapping?.marker_id;
        const buildingId = mapping?.building_id;
        const label = typeof buildingId === "string" ? buildingId : `mapping ${index}`;
        if (typeof markerId !== "number" || !Number.isFinite(markerId)) {
            throw new Error(`Marker mapping ${label}: marker_id must be numeric`);
        }
        if (markerIds.has(markerId)) {
            throw new Error(`Marker mapping ${label}: duplicate marker_id ${markerId}`);
        }
        if (MAP_CALIBRATION_MARKER_IDS.has(markerId)) {
            throw new Error(`Marker mapping ${label}: marker_id ${markerId} is reserved for map calibration`);
        }
        if (typeof buildingId !== "string" || buildingId.trim() === "") {
            throw new Error(`Marker mapping ${index}: missing building_id`);
        }
        if (!buildingIds.has(buildingId)) {
            throw new Error(`Marker mapping ${markerId}: unknown building_id ${buildingId}`);
        }
        markerIds.add(markerId);
        return { marker_id: markerId, building_id: buildingId };
    });

    return {
        footprints: { type: "FeatureCollection", features: footprints },
        markerMappings,
    };
}

let validatedDataset: CollabBuildingDataset | undefined;

export function collabBuildingDataset(): CollabBuildingDataset {
    validatedDataset ??= validateCollabBuildingDataset(JSON.parse(rawBuildingsText) as unknown, rawMarkerBuildingMap);
    return validatedDataset;
}

/** Keeps only complete footprints inside the confirmed AOI; out-of-scope buildings are valid data. */
export function collabFootprintsWithinAoi(features: readonly CollabBuildingFeature[], aoi: AOIExtent): CollabBuildingFeature[] {
    const ring: Position[] = [...aoi.corners, aoi.corners[0]];
    const aoiPolygon = polygon([ring]);
    return features.filter((feature) => booleanWithin(feature, aoiPolygon));
}

/** Builds the tracking registry only for buildings active in the confirmed AOI. */
export function markerRegistryForBuildings(buildingIds: readonly string[]): MarkerObjectRegistry {
    const activeIds = new Set(buildingIds);
    return createMarkerObjectRegistry(
        collabBuildingDataset().markerMappings
            .filter((mapping) => activeIds.has(mapping.building_id))
            .map((mapping) => ({ markerId: mapping.marker_id, objectId: mapping.building_id }))
    );
}

/**
 * What one `marker_id` arriving from Python means for the building layer:
 *
 * - `reserved` — a camera-reference/map-calibration/ignored id (see `RESERVED_MARKER_REGISTRY`).
 *   Python streams these in the same feed; they are never buildings.
 * - `tracked` — mapped here *and* active in the confirmed AOI: its building follows the marker.
 * - `outside-aoi` — mapped here, but its building's footprint is not inside the confirmed AOI, so
 *   `collabFootprintsWithinAoi` dropped it and nothing will move.
 * - `unmapped` — Python is reporting this marker and `marker-building-map.json` says nothing about
 *   it. The block on the table has no building behind it.
 *
 * The last two are the states worth surfacing: both look identical from the map (nothing moves),
 * and `TrackingFeedNormalizer` discards both silently by design.
 */
export type BuildingMarkerStatus = "reserved" | "tracked" | "outside-aoi" | "unmapped";

export interface BuildingMarkerClassification {
    status: BuildingMarkerStatus;
    /** The building the marker is mapped to, for `tracked`/`outside-aoi`; absent otherwise. */
    buildingId?: string;
}

/**
 * Classifies one incoming `marker_id` against the declared mappings and the AOI-filtered registry
 * the tracking feed is actually running with. Pure: both inputs are passed in rather than read off
 * the module-level dataset, so a test can describe any table/AOI combination directly.
 */
export function classifyBuildingMarker(
    markerId: number,
    mappings: readonly MarkerBuildingMapping[],
    activeRegistry: MarkerObjectRegistry
): BuildingMarkerClassification {
    if (reservedMarkerRole(markerId) !== undefined) {
        return { status: "reserved" };
    }
    const trackedBuildingId = activeRegistry.get(markerId);
    if (trackedBuildingId !== undefined) {
        return { status: "tracked", buildingId: trackedBuildingId };
    }
    const mapping = mappings.find((candidate) => candidate.marker_id === markerId);
    return mapping === undefined ? { status: "unmapped" } : { status: "outside-aoi", buildingId: mapping.building_id };
}
