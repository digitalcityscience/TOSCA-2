import type { Localized } from "../../types";
import {
    CATEGORY_IDS,
    CATEGORY_LABELS,
    FIELDS,
    countField,
    walkMinField,
    type CategoryId,
} from "./constants";

/**
 * What the panel says about one building, read from its tile feature or its WFS record. A missing value stays
 * missing: a NULL is not encoded in a vector tile and is never read as 0.
 */

export type CategoryState = "within" | "none" | "unknown";

export interface CategoryProfile {
    id: CategoryId;
    label: Localized;
    state: CategoryState;
    /** Walking minutes to the nearest place; `null` unless `state` is `within`. */
    walkMinutes: number | null;
}

export interface BuildingProfile {
    id: string | null;
    residential: boolean | null;
    /** `score_15min`, the count of categories reached (0–9). */
    count: number | null;
    /** `score_15min_decay` (0–100), a different measure from the count. */
    decay: number | null;
    /** `high`, `medium`, `low` or `none`. */
    confidence: string | null;
    originQuality: string | null;
    comfort: number | null;
    comfortConfidence: number | null;
    comfortShare: number | null;
    comfortReason: string | null;
    safety: number | null;
    safetyLength: number | null;
    safetyReason: string | null;
    green: number | null;
    dgpPark: number | null;
    dgpParkStatus: string | null;
    heightM: number | null;
    categories: CategoryProfile[];
}

function numberOrNull(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    return typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
}

const stringOrNull = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

function categoryState(count: number | null): CategoryState {
    if (count === null || count < 0) return "unknown";
    return count > 0 ? "within" : "none";
}

export function buildBuildingProfile(properties: Record<string, unknown> | null | undefined): BuildingProfile {
    const props = properties ?? {};
    const residential = props[FIELDS.residential];
    return {
        id: stringOrNull(props[FIELDS.id]),
        residential: typeof residential === "boolean" ? residential : residential === "true" ? true : residential === "false" ? false : null,
        count: numberOrNull(props[FIELDS.count]),
        decay: numberOrNull(props[FIELDS.decay]),
        confidence: stringOrNull(props[FIELDS.confidence]),
        originQuality: stringOrNull(props[FIELDS.originQuality]),
        comfort: numberOrNull(props[FIELDS.comfort]),
        comfortConfidence: numberOrNull(props[FIELDS.comfortConfidence]),
        comfortShare: numberOrNull(props[FIELDS.comfortShare]),
        comfortReason: stringOrNull(props[FIELDS.comfortReason]),
        safety: numberOrNull(props[FIELDS.safety]),
        safetyLength: numberOrNull(props[FIELDS.safetyLength]),
        safetyReason: stringOrNull(props[FIELDS.safetyReason]),
        green: numberOrNull(props[FIELDS.green]),
        dgpPark: numberOrNull(props[FIELDS.dgpPark]),
        dgpParkStatus: stringOrNull(props[FIELDS.dgpParkStatus]),
        heightM: numberOrNull(props[FIELDS.height]),
        categories: CATEGORY_IDS.map((id): CategoryProfile => {
            const state = categoryState(numberOrNull(props[countField(id)]));
            return {
                id,
                label: CATEGORY_LABELS[id],
                state,
                walkMinutes: state === "within" ? numberOrNull(props[walkMinField(id)]) : null,
            };
        }),
    };
}
