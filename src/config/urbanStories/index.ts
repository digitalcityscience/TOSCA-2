import { buildingWalkingStory } from "./buildingWalking";
import { fifteenMinuteStory } from "./fifteenMinute";
import { greenSpacesStory } from "./greenSpaces";
import { transitEquityStory } from "./transitEquity";
import { URBAN_STORY_KEYS, type Localized, type UrbanStoryConfig, type UrbanStoryKey } from "./types";
import { walkabilitySafetyStory } from "./walkabilitySafety";

export * from "./types";

/** The stories in display order. */
export const URBAN_STORIES: readonly UrbanStoryConfig[] = [
    fifteenMinuteStory,
    walkabilitySafetyStory,
    buildingWalkingStory,
    transitEquityStory,
    greenSpacesStory,
];

export function isUrbanStoryKey(value: unknown): value is UrbanStoryKey {
    return typeof value === "string" && (URBAN_STORY_KEYS as readonly string[]).includes(value);
}

export function getStoryConfig(key: string): UrbanStoryConfig | undefined {
    return URBAN_STORIES.find((story) => story.key === key);
}

/** Story texts exist in English and German; every other locale falls back to English. */
export function localize(text: Localized, locale: string): string {
    return locale === "de" ? text.de : text.en;
}

export { frontendStylingFor, isFrontendStyled } from "./frontendStyles";
