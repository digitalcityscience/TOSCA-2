/**
 * Vehicle positions for a service time, and the clock that advances it.
 * The interpolation and the `Active trips` / `Cumulative` / `Total` figures are adapted from hamburgriders
 * `AnimationManager`; the difference is that all figures follow the selected groups.
 */
import { ANIM_END_SEC, ANIM_START_SEC, DEFAULT_SPEED, DEFAULT_START } from "./ridersConfig";
import type { RidersDataset } from "./ridersData";

export interface VehicleFrame {
    /** GeoJSON features of the active, selected trips. */
    features: GeoJSON.Feature<GeoJSON.Point, { i: number; c: string; b: 0 | 1 }>[];
    active: number;
    /** Selected trips that have started by `time`. */
    cumulative: number;
    /** All selected trips of the service day. */
    total: number;
}

export function clampTime(time: number): number {
    return Math.max(ANIM_START_SEC, Math.min(ANIM_END_SEC, time));
}

/** Parses `HH:MM`, `HH:MM:SS` or seconds; hours past 24 are allowed (service day runs to 29:00). */
export function parseRidersTime(value: number | string): number | undefined {
    if (typeof value === "number") return Number.isFinite(value) ? clampTime(value) : undefined;
    const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
    if (match === null) return undefined;
    return clampTime(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0));
}

export function formatRidersTime(seconds: number): string {
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function computeVehicleFrame(dataset: RidersDataset, time: number, visibleGroups: ReadonlySet<number>): VehicleFrame {
    const { timetable: t, tripGroup, groups } = dataset;
    const colors = groups.map((group) => `#${group.color}`);
    const features: VehicleFrame["features"] = [];
    let active = 0;
    let cumulative = 0;
    let total = 0;

    for (let trip = 0; trip < t.tripCount; trip += 1) {
        const group = tripGroup[trip];
        if (!visibleGroups.has(group)) continue;
        total += 1;
        const start = t.tripStart[trip];
        if (start > time) continue;
        cumulative += 1;
        if (t.tripEnd[trip] < time) continue;
        active += 1;

        // Last segment whose start time is <= time (binary search over the trip's points).
        let low = t.tripOffset[trip];
        let high = t.tripOffset[trip + 1] - 2;
        while (low < high) {
            const mid = (low + high + 1) >> 1;
            if (t.ptTime[mid] <= time) low = mid;
            else high = mid - 1;
        }
        const duration = t.ptTime[low + 1] - t.ptTime[low];
        const fraction = duration > 0 ? (time - t.ptTime[low]) / duration : 0;
        features.push({
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [
                    t.ptLon[low] + fraction * (t.ptLon[low + 1] - t.ptLon[low]),
                    t.ptLat[low] + fraction * (t.ptLat[low + 1] - t.ptLat[low]),
                ],
            },
            properties: { i: trip, c: colors[group], b: groups[group].mode === "bus" ? 1 : 0 },
        });
    }
    return { features, active, cumulative, total };
}

export interface ClockHooks {
    request: (callback: (timestamp: number) => void) => number;
    cancel: (handle: number) => void;
}

const browserHooks: ClockHooks = {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => cancelAnimationFrame(handle),
};

/**
 * One animation loop. `start()` is idempotent, so repeated activation can never stack loops, and `stop()` cancels
 * the pending frame. The frame callback fires only when the time moved or `invalidate()` was called.
 */
export class RidersClock {
    time = DEFAULT_START;
    playing = true;
    speed = DEFAULT_SPEED;

    private handle: number | undefined;
    private lastTimestamp: number | null = null;
    private lastEmitted = Number.NaN;
    private dirty = true;

    constructor(private readonly onFrame: (time: number) => void, private readonly hooks: ClockHooks = browserHooks) {}

    get running(): boolean {
        return this.handle !== undefined;
    }

    start(): void {
        if (this.handle !== undefined) return;
        this.lastTimestamp = null;
        this.dirty = true;
        this.handle = this.hooks.request(this.tick);
    }

    stop(): void {
        if (this.handle !== undefined) this.hooks.cancel(this.handle);
        this.handle = undefined;
        this.lastTimestamp = null;
    }

    invalidate(): void {
        this.dirty = true;
    }

    setPlaying(playing: boolean): void {
        this.playing = playing;
        this.lastTimestamp = null;
    }

    seek(time: number): void {
        this.time = clampTime(time);
        this.lastTimestamp = null;
        this.dirty = true;
    }

    private readonly tick = (timestamp: number): void => {
        if (this.handle === undefined) return;
        if (this.playing) {
            if (this.lastTimestamp !== null) {
                // A hidden tab pauses requestAnimationFrame; do not jump ahead by the whole time away.
                const deltaMs = Math.min(timestamp - this.lastTimestamp, 250);
                this.time += (deltaMs / 1000) * this.speed;
                if (this.time > ANIM_END_SEC) this.time = ANIM_START_SEC;
            }
            this.lastTimestamp = timestamp;
        }
        this.time = clampTime(this.time);
        if (this.dirty || Math.abs(this.time - this.lastEmitted) >= 0.1) {
            this.dirty = false;
            this.lastEmitted = this.time;
            this.onFrame(this.time);
        }
        this.handle = this.hooks.request(this.tick);
    };
}
