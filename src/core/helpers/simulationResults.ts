import type {
    SimulationDataset,
    SimulationDatasetField,
    SimulationResultView,
    SimulationTableOutput,
} from "@store/geosimulation";

type DatasetCell = string | number | boolean | null;

export function normalizeSimulationDataset(data: SimulationTableOutput["data"]): SimulationDataset {
    const raw = data as Partial<SimulationDataset> & { columns?: string[]; rows?: DatasetCell[][] };
    const columns = raw.columns ?? raw.fields?.map((field) => field.key) ?? [];
    const fields = raw.fields?.length
        ? raw.fields
        : columns.map((key): SimulationDatasetField => ({
            key,
            label: key.replaceAll("_", " "),
            type: inferFieldType(raw.rows ?? [], columns.indexOf(key)),
        }));
    return {
        schema_version: 1,
        profile: raw.profile ?? "tabular",
        fields,
        columns,
        rows: raw.rows ?? [],
    };
}

export function resultViews(output: SimulationTableOutput): SimulationResultView[] {
    return output.views?.length ? output.views : [{ type: "table", version: 1 }];
}

export function fieldIndex(dataset: SimulationDataset, key: string): number {
    return dataset.columns.indexOf(key);
}

export function fieldByKey(dataset: SimulationDataset, key: string): SimulationDatasetField | undefined {
    return dataset.fields.find((field) => field.key === key);
}

function inferFieldType(rows: DatasetCell[][], index: number): SimulationDatasetField["type"] {
    const value = rows.find((row) => row[index] !== null)?.[index];
    if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
    if (typeof value === "boolean") return "boolean";
    return "string";
}
