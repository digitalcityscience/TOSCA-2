import { afterAll } from "vitest";
import { URBAN_STORIES } from "../index";
import type { UrbanStoryConfig } from "../types";
import { catalogFixtureStory } from "./catalogFixtureStory";

/** Replace the shipped `green-spaces` config with the catalog-styled fixture for the tests of one file. */
export function useCatalogFixtureStory(): void {
    const stories = URBAN_STORIES as UrbanStoryConfig[];
    // Swapped at once, not in a hook: test files read the story config while they are still being set up.
    const index = stories.findIndex((story) => story.key === "green-spaces");
    const original = stories[index];
    stories[index] = catalogFixtureStory;
    afterAll(() => {
        stories[index] = original;
    });
}
