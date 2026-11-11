import type { SimulationModelDetail } from "@store/geosimulation";

/**
 * Why the current visitor cannot start runs of `model`, or `undefined` when
 * they can (or the backend does not say). The backend decides (`can_run`);
 * `run_access` only picks the explanation.
 */
export type RunAccessDenial = "signIn" | "members" | "editors" | "notAllowed";

export function runAccessDenial(
    model: Pick<SimulationModelDetail, "can_run" | "run_access">,
    signedIn: boolean
): RunAccessDenial | undefined {
    if (model.can_run !== false) return undefined;
    if (!signedIn) return "signIn";
    if (model.run_access === "organization") return "members";
    if (model.run_access === "editors") return "editors";
    return "notAllowed";
}
