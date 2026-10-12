import type { Localized } from "../../types";
import type { FifteenMinuteCategoryId } from "./types";

/**
 * Destination (POI) rendering, one local style per category. The nine published layers are
 * `HAMBURG-POIs:<layer>`; park is a polygon layer, the others are points.
 */
export interface PoiStyle {
    category: FifteenMinuteCategoryId;
    sourceLayer: string;
    geometry: "point" | "polygon";
    color: string;
}

export const POI_STYLES: Record<FifteenMinuteCategoryId, PoiStyle> = {
    food: { category: "food", sourceLayer: "food", geometry: "point", color: "#e6194b" },
    health: { category: "health", sourceLayer: "health", geometry: "point", color: "#f58231" },
    education: { category: "education", sourceLayer: "education", geometry: "point", color: "#4363d8" },
    restaurant: { category: "restaurant", sourceLayer: "restaurant", geometry: "point", color: "#9a6324" },
    culture: { category: "culture", sourceLayer: "culture", geometry: "point", color: "#911eb4" },
    bank_post: { category: "bank_post", sourceLayer: "bank_post", geometry: "point", color: "#469990" },
    sport: { category: "sport", sourceLayer: "sport", geometry: "point", color: "#3cb44b" },
    park: { category: "park", sourceLayer: "park", geometry: "polygon", color: "#2e7d32" },
    stop_any: { category: "stop_any", sourceLayer: "pt_stops", geometry: "point", color: "#0b6e99" },
};

export const POI_MIN_ZOOM = 10;

export const POI_POPUP_LABELS: Record<string, Localized> = {
    name: { en: "Name", de: "Name" },
    category: { en: "Category", de: "Kategorie" },
    subtype: { en: "Type", de: "Art" },
};
