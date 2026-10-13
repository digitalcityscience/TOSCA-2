import { type RouteLocationNormalized, type RouteLocationRaw } from "vue-router";
import { isUrbanStoryKey } from "../config/urbanStories";

export const URBAN_STORIES_ROUTE_NAME = "urban-stories";

/**
 * Sends `/urban-stories/<unknown>` back to `/urban-stories` with no story selected.
 * Returns undefined when the route needs no change.
 */
export function redirectUnknownUrbanStory(
    to: Pick<RouteLocationNormalized, "name" | "params">
): RouteLocationRaw | undefined {
    if (to.name !== URBAN_STORIES_ROUTE_NAME) return undefined;
    const storyKey = to.params.storyKey;
    if (storyKey === undefined || storyKey === "" || isUrbanStoryKey(storyKey)) return undefined;
    return { name: URBAN_STORIES_ROUTE_NAME, replace: true };
}
