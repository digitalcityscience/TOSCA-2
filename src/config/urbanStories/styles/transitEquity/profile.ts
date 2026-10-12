import { FIELDS, type AgreementClass } from "./constants";
import { agreementClassOf, hasWalkOrigin, isResidentialProps, isTrue, type BuildingProps } from "./expressions";

/**
 * What the panel says about one building, read from its tile feature or its WFS record. Missing values stay
 * missing: a NULL is not encoded in a vector tile and is never read as 0.
 */
export interface BuildingProfile {
    id: string | null;
    residential: boolean;
    /** `null` when the attribute is absent. */
    inCatchment: boolean | null;
    accessClass: string | null;
    /** Modelled walking minutes to the nearest stop; `null` unless `walkState` is `minutes`. */
    walkMin: number | null;
    walkState: "minutes" | "none-within-15" | "no-origin";
    departures: number | null;
    departuresComplete: boolean;
    lines: number | null;
    stops: number | null;
    agreement: AgreementClass | "no-origin";
    heightM: number | null;
}

function numberOrNull(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    return typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
}

export function buildBuildingProfile(properties: Record<string, unknown> | null | undefined): BuildingProfile {
    const props: BuildingProps = properties ?? {};
    const walk = numberOrNull(props[FIELDS.walkMin]);
    const origin = hasWalkOrigin(props);
    const catchment = props[FIELDS.inCatchment];
    return {
        id: typeof props[FIELDS.id] === "string" ? props[FIELDS.id] as string : null,
        residential: isResidentialProps(props),
        inCatchment: catchment === undefined || catchment === null ? null : isTrue(catchment),
        accessClass: typeof props[FIELDS.accessClass] === "string" ? props[FIELDS.accessClass] as string : null,
        walkMin: origin ? walk : null,
        walkState: !origin ? "no-origin" : walk === null ? "none-within-15" : "minutes",
        departures: numberOrNull(props[FIELDS.departures]),
        departuresComplete: !(props[FIELDS.departuresComplete] === false || props[FIELDS.departuresComplete] === "false"),
        lines: numberOrNull(props[FIELDS.lines]),
        stops: numberOrNull(props[FIELDS.stops]),
        agreement: agreementClassOf(props),
        heightM: numberOrNull(props[FIELDS.height]),
    };
}
