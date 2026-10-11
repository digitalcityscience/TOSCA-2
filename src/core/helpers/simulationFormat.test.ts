import { describe, expect, test } from "vitest";
import type { SimulationRunDetail } from "@store/geosimulation";
import runFixture from "@store/__fixtures__/geosimulation-run-detail.json";
import {
    formatDuration,
    formatParameter,
    formatReplayClock,
    formatSimulatedTime,
    humanizeMetric,
    simulationKpiChangeRows,
    simulationKpiRows,
    unitForMetric,
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

describe("comparison KPI changes", () => {
    test("units come from the metric name", () => {
        expect(unitForMetric("mean_trip_time_min")).toBe("min");
        expect(unitForMetric("mean_signal_wait_s")).toBe("s");
        expect(unitForMetric("mean_speed_kmh")).toBe("km/h");
        expect(unitForMetric("agents")).toBe("");
    });

    test("rows carry signed changes, percentages and a direction", () => {
        const rows = simulationKpiChangeRows([
            { metric: "mean_signal_red_wait_s", baseline: 59.47, candidate: 62.24, delta: 2.77, delta_percent: 4.66 },
            { metric: "mean_signal_queue_wait_s", baseline: 16.98, candidate: 16.24, delta: -0.74, delta_percent: -4.36 },
            { metric: "agents", baseline: 1000, candidate: 1000, delta: 0, delta_percent: 0 },
            { metric: "zero_based", baseline: 0, candidate: 2, delta: 2, delta_percent: null },
        ], "en");

        expect(rows[0]).toMatchObject({ label: "Mean signal red wait", unit: "s", delta: "+2.77", percent: "+4.66 %", direction: "up" });
        expect(rows[1]).toMatchObject({ delta: "−0.74", percent: "−4.36 %", direction: "down" });
        expect(rows[2]).toMatchObject({ baseline: "1,000", delta: "0", percent: "", direction: "none" });
        expect(rows[3]).toMatchObject({ delta: "+2", percent: "" });
    });
});
