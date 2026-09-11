import { describe, expect, test } from "vitest";
import { getMapFeatureArea, isMapFeatureSwitch } from "./mapFeatureNavigation";

describe("map feature navigation", () => {
    test.each([
        ["/", "home"],
        ["/events", "events"],
        ["/events/event-1", "events"],
        ["/geostories", "geostories"],
        ["/geostories/story-1", "geostories"],
        ["/participation", undefined],
    ])("classifies %s as %s", (path, expected) => {
        expect(getMapFeatureArea({ path })).toBe(expected);
    });

    test.each([
        ["/", "/events"],
        ["/events/event-1", "/"],
        ["/events", "/geostories"],
        ["/geostories/story-1", "/events/event-1"],
        ["/", "/geostories/story-1"],
    ])("cleans the map when switching from %s to %s", (from, to) => {
        expect(isMapFeatureSwitch({ path: to }, { path: from })).toBe(true);
    });

    test.each([
        ["/events", "/events/event-1"],
        ["/geostories/story-1", "/geostories/story-2"],
        ["/", "/"],
        ["/participation", "/events"],
    ])("does not treat %s to %s as a switch between the three features", (from, to) => {
        expect(isMapFeatureSwitch({ path: to }, { path: from })).toBe(false);
    });
});
