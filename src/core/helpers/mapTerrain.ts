import { type Map } from "maplibre-gl";

/** Keep the visual hillshade paired with MapLibre's terrain surface. */
export function syncTerrainHillshadeVisibility(
    map: Map,
    hillshadeLayerId: string
): boolean {
    const terrainEnabled = map.getTerrain() !== null;
    if (map.getLayer(hillshadeLayerId) !== undefined) {
        map.setLayoutProperty(
            hillshadeLayerId,
            "visibility",
            terrainEnabled ? "visible" : "none"
        );
    }
    return terrainEnabled;
}
