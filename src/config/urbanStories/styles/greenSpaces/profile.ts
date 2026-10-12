import type { Localized } from "../../types";
import {
    AREA_CLASS_INFO,
    AREA_FIELDS,
    BUILDING_FIELDS,
    FEATURE_FIELDS,
    FEATURE_GROUPS,
    isAreaClass,
    type AccessMeasure,
    type AreaClass,
} from "./constants";

/**
 * What the panel says about one building, green area or detailed object, read from its tile feature or its WFS
 * record. A missing value stays missing: a NULL is not encoded in a vector tile and is never read as 0.
 */

export function numberOrNull(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    return typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
}

export const stringOrNull = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);

// --- buildings ---------------------------------------------------------------------------------------------

/** `ok`: a time exists. `no-origin`: not computable, the building has no walking origin. `missing`: no time and no reason. */
export type AccessState = "ok" | "no-origin" | "missing";

export interface AccessValue {
    minutes: number | null;
    /** `dgp_*_status` as published (`ok`, `no_origin`), or `null`. */
    status: string | null;
    state: AccessState;
}

export function accessValue(minutes: unknown, status: unknown): AccessValue {
    const value = numberOrNull(minutes);
    const published = stringOrNull(status);
    // A published time always wins: a status other than `ok` next to a number is never read as "no value".
    const state: AccessState = value !== null ? "ok" : published === "no_origin" ? "no-origin" : "missing";
    return { minutes: value, status: published, state };
}

export interface BuildingProfile {
    id: string | null;
    residential: boolean | null;
    park: AccessValue;
    playground: AccessValue;
    heightM: number | null;
    stadtteilId: string | null;
}

export function buildBuildingProfile(properties: Record<string, unknown> | null | undefined): BuildingProfile {
    const props = properties ?? {};
    const residential = props[BUILDING_FIELDS.residential];
    return {
        id: stringOrNull(props[BUILDING_FIELDS.id]),
        residential: typeof residential === "boolean" ? residential : residential === "true" ? true : residential === "false" ? false : null,
        park: accessValue(props[BUILDING_FIELDS.park], props[BUILDING_FIELDS.parkStatus]),
        playground: accessValue(props[BUILDING_FIELDS.playground], props[BUILDING_FIELDS.playgroundStatus]),
        heightM: numberOrNull(props[BUILDING_FIELDS.height]),
        stadtteilId: stringOrNull(props[BUILDING_FIELDS.stadtteil]),
    };
}

export const accessOf = (profile: BuildingProfile, measure: AccessMeasure): AccessValue => (measure === "park" ? profile.park : profile.playground);

// --- official green areas -----------------------------------------------------------------------------------

export interface GreenAreaProfile {
    id: string | null;
    idnr: number | null;
    name: string | null;
    areaClass: AreaClass | null;
    categoryEn: string | null;
    categoryDe: string | null;
    areaM2: number | null;
    district: string | null;
    borough: string | null;
    ownership: string | null;
    administration: string | null;
    sourceVersion: string | null;
    geometryValid: boolean | null;
}

export function buildGreenAreaProfile(properties: Record<string, unknown> | null | undefined): GreenAreaProfile {
    const props = properties ?? {};
    const areaClass = props[AREA_FIELDS.class];
    const valid = props[AREA_FIELDS.valid];
    return {
        id: stringOrNull(props[AREA_FIELDS.id]),
        idnr: numberOrNull(props[AREA_FIELDS.idnr]),
        name: stringOrNull(props[AREA_FIELDS.name]),
        areaClass: isAreaClass(areaClass) ? areaClass : null,
        categoryEn: stringOrNull(props[AREA_FIELDS.categoryEn]),
        categoryDe: stringOrNull(props[AREA_FIELDS.categoryDe]),
        areaM2: numberOrNull(props[AREA_FIELDS.area]),
        district: stringOrNull(props[AREA_FIELDS.district]),
        borough: stringOrNull(props[AREA_FIELDS.borough]),
        ownership: stringOrNull(props[AREA_FIELDS.ownership]),
        administration: stringOrNull(props[AREA_FIELDS.administration]),
        sourceVersion: stringOrNull(props[AREA_FIELDS.sourceVersion]),
        geometryValid: typeof valid === "boolean" ? valid : null,
    };
}

export function areaClassLabel(profile: GreenAreaProfile): Localized {
    return profile.areaClass === null ? { en: "Unclassified", de: "Nicht klassifiziert" } : AREA_CLASS_INFO[profile.areaClass].label;
}

// --- detailed objects ---------------------------------------------------------------------------------------

export interface GreenFeatureProfile {
    id: string | null;
    idnr: number | null;
    name: string | null;
    /** English label of level 0 (`feature_group`) and 1 (`feature_type`). */
    group: string | null;
    type: string | null;
    code0: number | null;
    /** Official German labels of the four levels, as delivered. */
    labels: string[];
    parentCategory: string | null;
    duplicates: number | null;
}

export function buildGreenFeatureProfile(properties: Record<string, unknown> | null | undefined): GreenFeatureProfile {
    const props = properties ?? {};
    return {
        id: stringOrNull(props[FEATURE_FIELDS.id]),
        idnr: numberOrNull(props[FEATURE_FIELDS.idnr]),
        name: stringOrNull(props[FEATURE_FIELDS.name]),
        group: stringOrNull(props[FEATURE_FIELDS.group]),
        type: stringOrNull(props[FEATURE_FIELDS.type]),
        code0: numberOrNull(props[FEATURE_FIELDS.code0]),
        labels: [FEATURE_FIELDS.label0, FEATURE_FIELDS.label1, FEATURE_FIELDS.label2, FEATURE_FIELDS.label3]
            .map((field) => stringOrNull(props[field]))
            .filter((value): value is string => value !== null),
        parentCategory: stringOrNull(props[FEATURE_FIELDS.parentCategory]),
        duplicates: numberOrNull(props[FEATURE_FIELDS.duplicates]),
    };
}

export function featureGroupLabel(code: number | null): Localized | undefined {
    return FEATURE_GROUPS.find((group) => group.code === code)?.label;
}

// --- formatting -------------------------------------------------------------------------------------------------

export function formatMinutes(value: number | null, locale: string): string {
    return value === null ? "–" : `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)} min`;
}

/** Hectares for large areas, square metres for small ones. */
export function formatArea(areaM2: number | null, locale: string): string {
    if (areaM2 === null) return "–";
    const fmt = (value: number, digits: number): string => new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
    return areaM2 >= 10000 ? `${fmt(areaM2 / 10000, 1)} ha` : `${fmt(Math.round(areaM2), 0)} m²`;
}

export function formatShare(share: number | null, locale: string): string {
    if (share === null) return "–";
    const percent = share * 100;
    return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: percent > 0 && percent < 10 ? 1 : 0 }).format(percent)} %`;
}
