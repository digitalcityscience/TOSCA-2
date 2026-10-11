import { describe, expect, test } from "vitest";
import type { SimulationRunDetail } from "@store/geosimulation";
import runFixture from "@store/__fixtures__/geosimulation-run-detail.json";
import {
    formatDuration,
    formatParameter,
    formatReplayClock,
    formatSimulatedTime,
    humanizeMetric,
    simulationKpiRows,
} from "./simulationFormat";

const run = runFixture as unknown as SimulationRunDetail;

describe("simulation formatting", () => {
    test("humanizes metric keys without their unit suffix", () => {
        expect(humanizeMetric("mean_trip_time_min")).toBe("Mean trip time");
        expect(humanizeMetric("mean_signal_wait_s")).toBe("Mean signal wait");
        expect(humanizeMetric("agents")).toBe("Agents");
    });

    test("KPI rows take units from the kpis table and round values", () => {
        const rows = simulationKpiRows(run, "en");
        const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));

        expect(byKey.agents).toMatchObject({ label: "Agents", value: "1,000", unit: "" });
        expect(byKey.mean_trip_time_min).toMatchObject({ value: "44.8", unit: "min" });
        expect(byKey.mean_distance_km.unit).toBe("km");
    });

    test("simulated time is shown in the run's own timezone", () => {
        expect(formatSimulatedTime(run.time, "en-GB")).toBe("11:00 – 14:14, 8 Sept 2026 (Europe/Berlin)");
    });

    test("parameter values are readable", () => {
        expect(formatParameter(1000, "en")).toBe("1,000");
        expect(formatParameter(true, "en")).toBe("✓");
        expect(formatParameter({ cargo: 0.05 }, "en")).toBe("{\"cargo\":0.05}");
        expect(formatParameter(null, "en")).toBe("—");
    });

    test("replay clock follows the run's timezone", () => {
        expect(formatReplayClock(run.time.start, 2400.4, "Europe/Berlin", "en-GB")).toBe("11:40:00");
        expect(formatReplayClock(run.time.start, 0, "UTC", "en-GB")).toBe("09:00:00");
        expect(formatReplayClock(null, 10, "UTC", "en-GB")).toBe("");
    });

    test("durations read as hours and minutes", () => {
        expect(formatDuration(11669)).toBe("3 h 14 min");
        expect(formatDuration(600)).toBe("10 min");
    });
});
