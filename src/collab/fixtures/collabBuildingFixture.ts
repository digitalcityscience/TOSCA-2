import type { FeatureCollection, Polygon } from "@helpers/geojson";
import rawFixture from "./collabBuildingFixture.json";

/**
 * Properties every fixture feature carries. `marker_id` is what the (future) tracking adapter
 * matches a detected physical marker against (plan §5e/§13, OD-4) — kept sequential and well
 * clear of the orphaned `100-103` calibration-id gate and the ignored `500` id (plan §17.4).
 */
export interface CollabBuildingFixtureProperties {
    id: string;
    marker_id: number;
    building_height: number;
    floor_area: number;
    number_of_stories: number;
    land_use_suggested: string;
}

/**
 * PoC building footprints for the AOI/scenario slice (ticket 07, OD-3), adapted from
 * `COUP-table-web-interface/buildings_all.geojson` — real ALKIS/GeoServer catalog wiring is
 * post-PoC. Each feature carries a `marker_id` so it can later be matched against a tracking
 * event (plan §5e); this ticket only loads and renders it, it does not consume tracking data.
 */
export const COLLAB_BUILDING_FIXTURE: FeatureCollection<Polygon, CollabBuildingFixtureProperties> =
    rawFixture as unknown as FeatureCollection<Polygon, CollabBuildingFixtureProperties>;
