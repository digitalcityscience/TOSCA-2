import { describe, expect, test } from "vitest";
import { getMapFeatureArea, isMapFeatureSwitch } from "./mapFeatureNavigation";

describe("map feature navigation", () => {
    test.each([
        ["/", "home"],
        ["/events", "events"],
        ["/events/event-1", "events"],
        ["/geostories", "geostories"],
        ["/geostories/story-1", "geostories"],
        ["/urban-stories", "urban-stories"],
        ["/urban-stories/green-spaces", "urban-stories"],
        ["/geostories/story-1", "geostories"],
        ["/geosimulations", "geosimulations"],
        ["/geosimulations/model-1", "geosimulations"],
        ["/geosimulations/runs/run-1", "geosimulations"]
    ])("classifies %s as %s", (path, expected) => {
        expect(getMapFeatureArea({ path })).toBe(expected);
    });

    test.each([
        ["/", "/events"],
        ["/events/event-1", "/"],
        ["/events", "/geostories"],
        ["/geostories/story-1", "/events/event-1"],
        ["/", "/geostories/story-1"],
        ["/geostories", "/urban-stories"],
        ["/urban-stories/green-spaces", "/geostories/story-1"],
        ["/", "/urban-stories/transit-equity"],
        ["/geostories/story-1", "/geosimulations/runs/run-1"],
        ["/geosimulations", "/events"],
    ])("cleans the map when switching from %s to %s", (from, to) => {
        expect(isMapFeatureSwitch({ path: to }, { path: from })).toBe(true);
    });

    test.each([
        ["/events", "/events/event-1"],
        ["/geostories/story-1", "/geostories/story-2"],
        ["/", "/"],
        ["/urban-stories", "/urban-stories/green-spaces"],
        ["/urban-stories/green-spaces", "/urban-stories/transit-equity"],
        ["/geosimulations/model-1", "/geosimulations/runs/run-1"],
        ["/", "/"]
    ])("does not treat %s to %s as a switch between features", (from, to) => {
        expect(isMapFeatureSwitch({ path: to }, { path: from })).toBe(false);
    });
});
