import { describe, expect, test } from "vitest";
import type { SimulationTableOutput } from "@store/geosimulation";
import { normalizeSimulationDataset, resultViews } from "./simulationResults";

describe("simulation result contracts", () => {
    test("keeps legacy positional tables readable", () => {
        const dataset = normalizeSimulationDataset({
            columns: ["district", "trips"],
            rows: [["Altona", 120]],
        } as SimulationTableOutput["data"]);

        expect(dataset.schema_version).toBe(1);
        expect(dataset.profile).toBe("tabular");
        expect(dataset.fields).toEqual([
            { key: "district", label: "district", type: "string" },
            { key: "trips", label: "trips", type: "integer" },
        ]);
    });

    test("uses the API view list and falls back to a table", () => {
        const output = {
            id: "result",
            role: "flows",
            title: "Flows",
            display_order: 0,
            kind: "table",
            data: { columns: ["value"], rows: [[1]] },
            views: [],
        } as unknown as SimulationTableOutput;

        expect(resultViews(output)).toEqual([{ type: "table", version: 1 }]);
        output.views = [{ type: "line_chart", version: 1, x: "value", series: [{ field: "value" }] }];
        expect(resultViews(output)).toEqual(output.views);
    });
});
