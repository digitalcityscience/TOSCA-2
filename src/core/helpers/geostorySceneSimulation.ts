import type { GeoStorySceneReplay, GeoStorySceneSimulation } from "@store/geostory";
import type { SimulationVectorLayerOutput } from "@store/geosimulation";

/** A scene's replay window, clamped to the loaded replay. Times are seconds since the run's start. */
export interface ReplayWindow {
    start: number;
    end: number;
    /** Simulated seconds per real second. */
    rate: number;
    loop: boolean;
}

/** Longest real-time step a frame may advance (a tab in the background must not jump ahead). */
export const MAX_FRAME_SECONDS = 0.25;

export function replayWindow(replay: GeoStorySceneReplay, timeEnd: number): ReplayWindow {
    const end = Math.min(Math.max(replay.end_s, 0), timeEnd);
    const start = Math.min(Math.max(replay.start_s, 0), end);
    return { start, end, rate: Math.max(replay.playback_rate, 0), loop: replay.loop };
}

/** Where a new window starts playing: the current moment when it lies inside, else the window start. */
export function clampToWindow(time: number, window: ReplayWindow): number {
    return time >= window.start && time <= window.end ? time : window.start;
}

/**
 * Advance the replay clock by one frame. A looping window wraps around to its
 * start; otherwise the clock stops at the end and `finished` is true.
 */
export function advanceReplayTime(
    time: number,
    elapsedSeconds: number,
    window: ReplayWindow
): { time: number; finished: boolean } {
    const span = window.end - window.start;
    if (span <= 0) return { time: window.start, finished: !window.loop };
    const current = clampToWindow(time, window);
    const next = current + Math.min(Math.max(elapsedSeconds, 0), MAX_FRAME_SECONDS) * window.rate;
    if (next < window.end) return { time: next, finished: false };
    if (!window.loop) return { time: window.end, finished: true };
    return { time: window.start + ((next - window.start) % span), finished: false };
}

/** Map outputs bottom to top. */
export function sceneSimulationMapOutputs(simulation: GeoStorySceneSimulation | null | undefined): SimulationVectorLayerOutput[] {
    return [...(simulation?.map_outputs ?? [])].sort((a, b) => a.display_order - b.display_order);
}
