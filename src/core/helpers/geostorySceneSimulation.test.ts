import { describe, expect, test } from "vitest";
import type { GeoStorySceneReplay } from "@store/geostory";
import {
    advanceReplayTime,
    clampToWindow,
    replayWindow,
    type ReplayWindow,
} from "./geostorySceneSimulation";

const window: ReplayWindow = { start: 100, end: 200, rate: 60, loop: true };

describe("replay window", () => {
    test("clamps the scene's window to the loaded replay", () => {
        const replay = { start_s: 2400, end_s: 99999, playback_rate: 30, loop: false } as GeoStorySceneReplay;
        expect(replayWindow(replay, 11669)).toEqual({ start: 2400, end: 11669, rate: 30, loop: false });
    });

    test("keeps a moment inside the window and resets one outside", () => {
        expect(clampToWindow(150, window)).toBe(150);
        expect(clampToWindow(50, window)).toBe(100);
        expect(clampToWindow(250, window)).toBe(100);
    });
});

describe("advanceReplayTime", () => {
    test("advances by elapsed real time times the playback rate", () => {
        expect(advanceReplayTime(100, 0.1, window)).toEqual({ time: 106, finished: false });
    });

    test("caps long frames so a background tab does not jump ahead", () => {
        expect(advanceReplayTime(100, 10, window)).toEqual({ time: 115, finished: false });
    });

    test("wraps a looping window around to its start", () => {
        expect(advanceReplayTime(195, 0.25, window)).toEqual({ time: 110, finished: false });
    });

    test("stops at the end of a window that does not loop", () => {
        expect(advanceReplayTime(195, 0.25, { ...window, loop: false })).toEqual({ time: 200, finished: true });
    });

    test("starts from the window when the clock is outside it", () => {
        expect(advanceReplayTime(5000, 0.1, window)).toEqual({ time: 106, finished: false });
    });
});
