import { type RouteLocationNormalized } from "vue-router";

export type MapFeatureArea = "home" | "events" | "geostories";

/**
 * Returns the top-level map feature represented by a route.
 *
 * Child routes belong to their parent feature so opening an event or story
 * detail does not look like a feature switch.
 */
export function getMapFeatureArea(
    route: Pick<RouteLocationNormalized, "path">
): MapFeatureArea | undefined {
    if (route.path === "/") {
        return "home";
    }
    if (route.path === "/events" || route.path.startsWith("/events/")) {
        return "events";
    }
    if (route.path === "/geostories" || route.path.startsWith("/geostories/")) {
        return "geostories";
    }
    return undefined;
}

export function isMapFeatureSwitch(
    to: Pick<RouteLocationNormalized, "path">,
    from: Pick<RouteLocationNormalized, "path">
): boolean {
    const destination = getMapFeatureArea(to);
    const origin = getMapFeatureArea(from);

    return destination !== undefined && origin !== undefined && destination !== origin;
}
