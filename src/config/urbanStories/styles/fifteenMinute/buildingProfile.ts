import {
    BUILDING_SCORE_DECAY_FIELD,
    BUILDING_SCORE_FIELD,
    isValidScore15min,
    score15minColor,
} from "./buildingAccessibility";
import { accessStateOf, ACCESS_COLORS, CATEGORY_FIELDS } from "./categoryAccessibility";
import {
    FIFTEEN_MINUTE_CATEGORY_IDS,
    type AccessState,
    type FifteenMinuteCategoryId,
} from "./types";
import type { Localized } from "../../types";

export interface CategoryProfile {
    id: FifteenMinuteCategoryId;
    label: Localized;
    state: AccessState;
    color: string;
    /** Places of the category within 15 minutes; `null` when unknown. */
    places: number | null;
    /** Walking minutes to the nearest place; `null` when not published or none within 15 minutes. */
    walkMinutes: number | null;
}

export interface BuildingProfile {
    /** `score_15min`; `null` when missing or outside 0–9 (shown as "no score", never as 0). */
    score: number | null;
    scoreColor: string;
    /** `score_15min_decay` (0–100); a different measure from the count. */
    decayScore: number | null;
    confidence: string | null;
    categories: CategoryProfile[];
    /** Categories whose state is `accessible`; equals `score` when the tiles carry every category field. */
    accessibleCount: number;
}

function numberOrNull(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The 15-minute profile of one clicked building, from the properties of its tile feature.
 * Missing properties are `unknown`: a NULL is not encoded in a vector tile and is never read as 0.
 */
export function buildBuildingProfile(properties: Record<string, unknown> | null | undefined): BuildingProfile {
    const props = properties ?? {};
    const categories = FIFTEEN_MINUTE_CATEGORY_IDS.map((id): CategoryProfile => {
        const fields = CATEGORY_FIELDS[id];
        const state = accessStateOf(props[fields.accessField]);
        return {
            id,
            label: fields.label,
            state,
            color: ACCESS_COLORS[state],
            places: state === "unknown" ? null : props[fields.accessField] as number,
            walkMinutes: state === "accessible" ? numberOrNull(props[fields.walkMinField]) : null,
        };
    });
    const rawScore = props[BUILDING_SCORE_FIELD];
    return {
        score: isValidScore15min(rawScore) ? rawScore : null,
        scoreColor: score15minColor(rawScore),
        decayScore: numberOrNull(props[BUILDING_SCORE_DECAY_FIELD]),
        confidence: typeof props.score_confidence === "string" ? props.score_confidence : null,
        categories,
        accessibleCount: categories.filter((category) => category.state === "accessible").length,
    };
}
