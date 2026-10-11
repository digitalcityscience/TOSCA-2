import { describe, expect, test } from "vitest";
import { isVectorLayerOutput, type SimulationRunDetail } from "@store/geosimulation";
import runFixture from "@store/__fixtures__/geosimulation-run-detail.json";
import { simulationLegendRows } from "./simulationLegend";

const run = runFixture as unknown as SimulationRunDetail;
const legendOf = (role: string) => run.outputs.filter(isVectorLayerOutput).find((output) => output.role === role)!.legend!;

describe("simulation legend rows", () => {
    test("graduated lines keep their class labels and colours", () => {
        const rows = simulationLegendRows(legendOf("bike_flow"), "en");

        expect(rows.map((row) => row.label)).toEqual(["< 5", "5 – 20", "20 – 50", "50 – 200", "≥ 200"]);
        expect(rows.every((row) => row.mark === "line")).toBe(true);
        expect(rows[4].color).toBe("#bd0026");
    });

    test("proportional circles carry their sizes and the shared colour", () => {
        const rows = simulationLegendRows(legendOf("signal_delay"), "en");

        expect(rows.map((row) => row.size)).toEqual([3, 9.2, 18]);
        expect(rows.every((row) => row.mark === "circle" && row.color === "#f03b20")).toBe(true);
    });

    test("polygons become fills and categorical labels follow the language", () => {
        expect(simulationLegendRows(legendOf("origins_by_district"), "en")[0].mark).toBe("fill");
        const categorical = simulationLegendRows({
            type: "categorical",
            title: "Infrastructure",
            geometry: "LineString",
            items: [{ color: "#4e79a7", value: "radweg", label: { en: "Cycle track", de: "Radweg" } }],
        }, "de");
        expect(categorical[0].label).toBe("Radweg");
    });

    test("heatmaps render one gradient row", () => {
        const [row] = simulationLegendRows({
            type: "heatmap",
            title: "Delay",
            geometry: "Point",
            colors: ["#67a9cf", "#b2182b"],
            items: [{ label: "Low", value: 0 }, { label: "High", value: 10 }],
        }, "en");

        expect(row).toMatchObject({ mark: "gradient", label: "Low → High" });
        expect(row.color).toBe("linear-gradient(90deg, #67a9cf, #b2182b)");
    });
});
