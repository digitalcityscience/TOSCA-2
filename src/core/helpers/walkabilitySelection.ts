import type { Map as MapLibreMap } from "maplibre-gl";
import type { PopupAttributeFeature } from "@store/geoserver";
import type { LayerObjectWithAttributes } from "@store/map";
import { WALK_SELECTED_STATE } from "../../config/urbanStories/styles/walkabilitySafety/cartography";

/** Highlight popup hits on the existing vector sources. State survives local metric swaps. */
export function highlightWalkabilitySelection(
    map: Pick<MapLibreMap, "setFeatureState" | "removeFeatureState" | "getSource">,
    features: PopupAttributeFeature[],
    owners: LayerObjectWithAttributes[]
): () => void {
    const targets = new Map<string, { source: string; sourceLayer: string; id: string | number }>();
    for (const feature of features) {
        const owner = owners.find((layer) => layer.source === feature.source);
        const style = owner?.availableStyles?.find((style) => style.id === owner.activeStyleId);
        if (!style?.name.startsWith("frontend:walkability:") || feature.id === undefined || feature.sourceLayer === undefined) continue;
        const target = { source: feature.source, sourceLayer: feature.sourceLayer, id: feature.id };
        targets.set(JSON.stringify(target), target);
    }
    for (const target of targets.values()) map.setFeatureState(target, { [WALK_SELECTED_STATE]: true });
    return () => {
        for (const target of targets.values()) {
            if (map.getSource(target.source) !== undefined) map.removeFeatureState(target, WALK_SELECTED_STATE);
        }
    };
}
