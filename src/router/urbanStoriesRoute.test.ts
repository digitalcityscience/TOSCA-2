import { describe, expect, test } from "vitest";
import { redirectUnknownUrbanStory } from "./urbanStoriesRoute";

describe("urban stories route", () => {
    test.each([
        [undefined],
        [""],
        ["fifteen-minute"],
        ["green-spaces"],
    ])("keeps /urban-stories with story key %s", (storyKey) => {
        const params: Record<string, string> = storyKey === undefined ? {} : { storyKey };

        expect(redirectUnknownUrbanStory({ name: "urban-stories", params })).toBeUndefined();
    });

    test.each([["unknown"], ["Green-Spaces"], [["green-spaces", "x"]]])("redirects the unknown story key %s", (storyKey) => {
        expect(redirectUnknownUrbanStory({ name: "urban-stories", params: { storyKey } }))
            .toEqual({ name: "urban-stories", replace: true });
    });

    test("ignores other routes", () => {
        expect(redirectUnknownUrbanStory({ name: "geostory-detail", params: { storyId: "unknown" } })).toBeUndefined();
    });
});
