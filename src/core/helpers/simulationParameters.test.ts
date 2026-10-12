import { describe, expect, test } from "vitest";
import fixture from "@store/__fixtures__/geosimulation-parameter-schema.json";
import {
    initialParameterValues,
    parameterFields,
    serverParameterErrors,
    submittedParameters,
    validateParameterValues,
} from "./simulationParameters";

// The bike runner's real schema and defaults, synced into the dev backend.
const schema = fixture.parameter_schema as Record<string, unknown>;
const defaults = fixture.default_parameters as Record<string, unknown>;

describe("run form fields", () => {
    test("follow the schema's properties in order, with titles and ranges", () => {
        const fields = parameterFields(schema);

        expect(fields.map((field) => [field.name, field.kind])).toEqual([
            ["agents", "integer"],
            ["origin_method", "enum"],
            ["departure_window_minutes", "number"],
            ["simulation_date", "date"],
            ["simulation_start_hour", "integer"],
            ["signal_mode", "enum"],
            ["signal_queues", "boolean"],
            ["turn_aware_signals", "boolean"],
            ["surface_speeds", "boolean"],
            ["construction", "boolean"],
        ]);
        expect(fields[0]).toMatchObject({ title: "Cyclists", minimum: 1, maximum: 5000, required: false });
        expect(fields[1].options).toEqual(["population", "uniform"]);
    });

    test("skip property types the form cannot show and humanize missing titles", () => {
        const fields = parameterFields({
            properties: { agent_mix: { type: "object" }, start_hour: { type: ["integer", "null"] } },
            required: ["start_hour"],
        });
        expect(fields).toEqual([{ name: "start_hour", title: "Start hour", description: "", kind: "integer", required: true }]);
        expect(parameterFields(null)).toEqual([]);
    });

    test("start from the model's defaults", () => {
        const values = initialParameterValues(parameterFields(schema), defaults);
        expect(values).toMatchObject({ agents: 100, signal_mode: "schedule", construction: true, simulation_date: "2026-09-08" });
    });
});

describe("run form validation", () => {
    const fields = parameterFields(schema);

    test("flags out-of-range, fractional, unknown-option and bad-date values", () => {
        const values = {
            ...initialParameterValues(fields, defaults),
            agents: 9000,
            simulation_start_hour: 7.5,
            origin_method: "everywhere",
            simulation_date: "8.9.2026",
            departure_window_minutes: 0,
        };

        expect(validateParameterValues(fields, values)).toEqual({
            agents: { code: "maximum", limit: 5000 },
            simulation_start_hour: { code: "integer" },
            origin_method: { code: "option" },
            simulation_date: { code: "date" },
            departure_window_minutes: { code: "minimum", limit: 1 },
        });
    });

    test("accept the defaults and leave empty optional fields to the backend", () => {
        const values = { ...initialParameterValues(fields, defaults), agents: null };
        expect(validateParameterValues(fields, values)).toEqual({});
        expect(submittedParameters(values)).not.toHaveProperty("agents");
    });

    test("map backend messages to fields", () => {
        const split = serverParameterErrors(
            ["agents: 0 is less than the minimum of 1", "parameters: Additional properties are not allowed"],
            fields
        );
        expect(split).toEqual({
            byField: { agents: "0 is less than the minimum of 1" },
            other: ["parameters: Additional properties are not allowed"],
        });
    });
});
