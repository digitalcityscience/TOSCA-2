import { beforeEach, describe, expect, test } from "vitest";
import { forgetRun, myRuns, rememberRun } from "./simulationMyRuns";

const run = (id: string, modelId = "m1") => ({ id, modelId, title: `Run ${id}`, startedAt: "2026-10-12T12:00:00Z" });

describe("my runs", () => {
    beforeEach(() => localStorage.clear());

    test("remembers runs newest first, per model, without duplicates", () => {
        rememberRun(run("a"));
        rememberRun(run("b", "m2"));
        rememberRun(run("a"));

        expect(myRuns().map((item) => item.id)).toEqual(["a", "b"]);
        expect(myRuns("m2").map((item) => item.id)).toEqual(["b"]);
    });

    test("forgets runs and survives broken storage", () => {
        rememberRun(run("a"));
        forgetRun("a");
        expect(myRuns()).toEqual([]);

        localStorage.setItem("tosca.geosimulations.myRuns.v1", "{not json");
        expect(myRuns()).toEqual([]);
    });
});
