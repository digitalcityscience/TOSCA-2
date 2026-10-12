import type { ExploreEntry, UrbanStoryLayer } from "./types";

/**
 * The published GeoServer layers used by Urban Stories. This is the only module that may
 * contain workspace or layer names (checked by `validate.test.ts`).
 *
 * Source: `SUMO-15/geoStories/planning/URBAN_STORIES_LAYER_CONTRACT.md`, UST-00 second pass
 * (2026-10-11): all 18 layers serve MVT through GWC, the admin layers are published as
 * `hamburg_*`, and the zoom floors come from measured tile weights.
 */
export const URBAN_STORIES_PROVIDER_ID = "01a11617-bb5c-75ce-bd6d-9c52d34dc20b";

function layer(
    workspace: string,
    layerName: string,
    details: Omit<UrbanStoryLayer, "ref" | "rendering" | "mvt" | "heavy"> & {
        heavy?: boolean
        mvt?: UrbanStoryLayer["mvt"]
    }
): UrbanStoryLayer {
    const { heavy = false, mvt = "verified", ...rest } = details;
    return {
        ref: { providerId: URBAN_STORIES_PROVIDER_ID, workspace, layerName },
        rendering: "vector-tiles",
        mvt,
        heavy,
        ...rest,
    };
}

function poi(layerName: string, dataset: string, geometry: UrbanStoryLayer["geometry"] = "point"): UrbanStoryLayer {
    return layer("HAMBURG-POIs", layerName, {
        geometry,
        source: { dataset, release: "R05-R08", metadataPath: `export/hamburg_pois/${dataset}/metadata.yaml` },
    });
}

function admin(layerName: string): UrbanStoryLayer {
    return layer("HAMBURG-ADMINISTRATIVE", layerName, {
        geometry: "polygon",
        source: {
            dataset: layerName,
            release: "R17",
            metadataPath: `export/hamburg_administrative/${layerName}/metadata.yaml`,
        },
    });
}

function green(layerName: string, dataset: string, geometry: UrbanStoryLayer["geometry"], minZoom: number, heavy: boolean): UrbanStoryLayer {
    return layer("HAMBURG-GREEN-SPACES", layerName, {
        geometry,
        heavy,
        minZoom,
        source: { dataset, release: "R09-R11", metadataPath: `export/hamburg_green_areas/${dataset}/metadata.yaml` },
    });
}

export const URBAN_STORY_LAYERS = {
    buildings: layer("HAMBURG-BUILDINGS", "hamburg_buildings", {
        geometry: "polygon",
        heavy: true,
        minZoom: 14,
        source: {
            dataset: "hamburg_buildings",
            release: "R17",
            metadataPath: "export/hamburg_buildings/hamburg_buildings/metadata.yaml",
        },
    }),
    mobility: layer("HAMBURG-MOBILITY", "hamburg_mobility", {
        geometry: "line",
        heavy: true,
        minZoom: 15,
        source: {
            dataset: "hamburg_mobility",
            release: "R13",
            metadataPath: "export/hamburg_mobility/hamburg_mobility/metadata.yaml",
        },
    }),
    poiBankPost: poi("bank_post", "hamburg_poi_bank_post"),
    poiCulture: poi("culture", "hamburg_poi_culture"),
    poiEducation: poi("education", "hamburg_poi_education"),
    poiFood: poi("food", "hamburg_poi_food"),
    poiHealth: poi("health", "hamburg_poi_health"),
    poiPark: poi("park", "hamburg_poi_park", "polygon"),
    poiRestaurant: poi("restaurant", "hamburg_poi_restaurant"),
    poiSport: poi("sport", "hamburg_poi_sport"),
    poiPtStops: poi("pt_stops", "hamburg_poi_stop_any"),
    greenAreas: green("green_areas", "hamburg_green_areas", "polygon", 11, false),
    greenFeaturesPoint: green("green_features_point", "hamburg_green_features_point", "point", 14, true),
    greenFeaturesLine: green("green_features_line", "hamburg_green_features_line", "line", 14, true),
    greenFeaturesPolygon: green("green_features_polygon", "hamburg_green_features_polygon", "polygon", 14, true),
    bezirke: admin("hamburg_bezirke"),
    stadtteile: admin("hamburg_stadtteile"),
    statisticalUnits: admin("hamburg_statistical_units"),
} as const satisfies Record<string, UrbanStoryLayer>;

export type UrbanStoryLayerId = keyof typeof URBAN_STORY_LAYERS;

/** The layer-derived part of an explore entry, so entries never restate names or zoom floors. */
export function entryLayerFields(
    source: UrbanStoryLayer
): Pick<ExploreEntry, "layer" | "geometry" | "rendering" | "mvt" | "minZoom" | "source"> {
    return {
        layer: { ...source.ref },
        geometry: source.geometry,
        rendering: source.rendering,
        mvt: source.mvt,
        minZoom: source.minZoom,
        source: { ...source.source },
    };
}

/** True when the entry points at one of the layers that require a zoom floor. */
export function isHeavyLayer(ref: ExploreEntry["layer"]): boolean {
    return Object.values(URBAN_STORY_LAYERS).some((candidate) => (
        candidate.heavy
        && candidate.ref.workspace === ref.workspace
        && candidate.ref.layerName === ref.layerName
    ));
}

export function isBezirkeLayer(ref: ExploreEntry["layer"]): boolean {
    const bezirke = URBAN_STORY_LAYERS.bezirke.ref;
    return ref.workspace === bezirke.workspace && ref.layerName === bezirke.layerName;
}
