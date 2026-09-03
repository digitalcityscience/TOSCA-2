import { describe, expect, test } from "vitest";
import {
    BUILDING_CALIBRATION_NUDGE_MM,
    BUILDING_CALIBRATION_ROTATE_STEP_DEG,
    BUILDING_CALIBRATION_SCALE_STEP,
    NEUTRAL_BUILDING_CALIBRATION_DRAFT,
    TABLE_COVERAGE_GRID,
    buildBuildingCalibrationMessage,
    draftFromStoredCalibration,
    draftIsNeutral,
    draftReadout,
    localMmFromGeographicDelta,
    localMmFromTableDelta,
    nudgedDraft,
    resizedDraft,
    rotatedDraft,
    tableCoverage,
    tableCoverageCellOf,
    type BuildingCalibrationDraft,
} from "./collabBuildingCalibration";
import { DEFAULT_COLLAB_TABLE_CONFIG } from "./collabCalibration";

const NEUTRAL = NEUTRAL_BUILDING_CALIBRATION_DRAFT;

function draft(overrides: Partial<BuildingCalibrationDraft> = {}): BuildingCalibrationDraft {
    return { ...NEUTRAL, ...overrides };
}

describe("the operator's units", () => {
    test("one arrow-key tick is one table pixel is one millimetre", () => {
        // 10 px/cm is the stitching pipeline's density; one pixel is therefore a millimetre.
        expect(BUILDING_CALIBRATION_NUDGE_MM).toBe(1);
        expect(DEFAULT_COLLAB_TABLE_CONFIG.tablePixelSpace.pixelsPerCm * BUILDING_CALIBRATION_NUDGE_MM).toBe(10);
    });

    test("a neutral draft asks for nothing", () => {
        expect(NEUTRAL).toEqual({
            offsetEastMm: 0,
            offsetNorthMm: 0,
            rotationOffsetDeg: 0,
            scaleResidual: 1,
        });
        expect(draftIsNeutral(NEUTRAL)).toBe(true);
        expect(draftIsNeutral(draft({ offsetEastMm: 1 }))).toBe(false);
        expect(draftIsNeutral(draft({ scaleResidual: 1.01 }))).toBe(false);
    });
});

describe("moving in the block's own frame", () => {
    // The stored offset has to turn with the block. Everything below is that one rule, seen from
    // the two places a movement can come from: the arrow keys (table axes) and a drag (geographic).

    test("an upright block's table nudge needs no rotating at all", () => {
        expect(localMmFromTableDelta({ eastMm: 3, northMm: -2 }, 0, 0)).toEqual({
            eastMm: expect.closeTo(3, 6),
            northMm: expect.closeTo(-2, 6),
        });
    });

    test("nudging east on a block turned 90 degrees stores a southward local offset", () => {
        // The drawing is turned 90 degrees anticlockwise, so the direction the operator pushes
        // (table east) is the block's own *negative north*. Storing the raw table delta would
        // send the building sideways the next time the block was turned.
        const local = localMmFromTableDelta({ eastMm: 4, northMm: 0 }, 90, 0);

        expect(local.eastMm).toBeCloseTo(0, 6);
        expect(local.northMm).toBeCloseTo(-4, 6);
    });

    test("a 180 degree block reverses both axes", () => {
        const local = localMmFromTableDelta({ eastMm: 4, northMm: -3 }, 180, 0);

        expect(local.eastMm).toBeCloseTo(-4, 6);
        expect(local.northMm).toBeCloseTo(3, 6);
    });

    test("a rotated AOI is folded into the same single rotation", () => {
        // The table's axes are not the compass's: the AOI's top edge can run off due east.
        const viaAoi = localMmFromTableDelta({ eastMm: 5, northMm: 0 }, 30, 60);
        const combined = localMmFromTableDelta({ eastMm: 5, northMm: 0 }, 90, 0);

        expect(viaAoi.eastMm).toBeCloseTo(combined.eastMm, 6);
        expect(viaAoi.northMm).toBeCloseTo(combined.northMm, 6);
    });

    test("a nudge is reversible, so the operator can always undo an overshoot", () => {
        const there = localMmFromTableDelta({ eastMm: 7, northMm: -4 }, 37, 12);
        const back = localMmFromTableDelta({ eastMm: -7, northMm: 4 }, 37, 12);

        expect(there.eastMm).toBeCloseTo(-back.eastMm, 6);
        expect(there.northMm).toBeCloseTo(-back.northMm, 6);
    });

    test("a drag in geographic metres becomes table millimetres through the ground scale", () => {
        // 1:300 map: 3 real metres of drag is 1 table centimetre is 10 mm.
        const local = localMmFromGeographicDelta({ eastM: 3, northM: 0 }, 0, 300);

        expect(local.eastMm).toBeCloseTo(10, 6);
        expect(local.northMm).toBeCloseTo(0, 6);
    });

    test("a drag on a turned block lands in the block's frame too", () => {
        const local = localMmFromGeographicDelta({ eastM: 3, northM: 0 }, 90, 300);

        expect(local.eastMm).toBeCloseTo(0, 6);
        expect(local.northMm).toBeCloseTo(-10, 6);
    });

    test("a non-positive ground scale cannot silently produce an infinite nudge", () => {
        expect(() => localMmFromGeographicDelta({ eastM: 3, northM: 0 }, 0, 0)).toThrow(/ground scale/i);
    });
});

describe("accumulating a draft", () => {
    test("nudges add up in the block's frame", () => {
        let current = NEUTRAL;
        current = nudgedDraft(current, { eastMm: 1, northMm: 0 }, 0, 0);
        current = nudgedDraft(current, { eastMm: 1, northMm: 0 }, 0, 0);
        current = nudgedDraft(current, { eastMm: 0, northMm: 2 }, 0, 0);

        expect(current.offsetEastMm).toBeCloseTo(2, 6);
        expect(current.offsetNorthMm).toBeCloseTo(2, 6);
    });

    test("nudging never disturbs the rotation or the scale", () => {
        const started = draft({ rotationOffsetDeg: -2.5, scaleResidual: 1.02 });

        const nudged = nudgedDraft(started, { eastMm: 3, northMm: 1 }, 45, 0);

        expect(nudged.rotationOffsetDeg).toBe(-2.5);
        expect(nudged.scaleResidual).toBe(1.02);
    });

    test("Q and E turn the drawing by one step each", () => {
        expect(rotatedDraft(NEUTRAL, 1).rotationOffsetDeg).toBeCloseTo(BUILDING_CALIBRATION_ROTATE_STEP_DEG, 6);
        expect(rotatedDraft(NEUTRAL, -1).rotationOffsetDeg).toBeCloseTo(-BUILDING_CALIBRATION_ROTATE_STEP_DEG, 6);
    });

    test("the rotation offset stays on the near side of the wrap", () => {
        // A correction is a small angle. Reporting -179 as +181 would read as a huge error.
        const many = rotatedDraft(NEUTRAL, 800);

        expect(many.rotationOffsetDeg).toBeGreaterThan(-180);
        expect(many.rotationOffsetDeg).toBeLessThanOrEqual(180);
    });

    test("plus and minus resize by one step each", () => {
        expect(resizedDraft(NEUTRAL, 1).scaleResidual).toBeCloseTo(1 + BUILDING_CALIBRATION_SCALE_STEP, 6);
        expect(resizedDraft(NEUTRAL, -1).scaleResidual).toBeCloseTo(1 - BUILDING_CALIBRATION_SCALE_STEP, 6);
    });

    test("the scale residual can never be driven to zero or below", () => {
        // A residual of 0 collapses the footprint to a point, and Python refuses it anyway.
        const shrunk = resizedDraft(NEUTRAL, -10_000);

        expect(shrunk.scaleResidual).toBeGreaterThan(0);
    });
});

describe("what the operator reads", () => {
    test("offsets are shown in table centimetres, the unit a ruler on the table reads", () => {
        const readout = draftReadout(draft({ offsetEastMm: 12, offsetNorthMm: -3.5 }));

        expect(readout.offsetEastCm).toBeCloseTo(1.2, 6);
        expect(readout.offsetNorthCm).toBeCloseTo(-0.35, 6);
    });

    test("the scale residual is shown as the percentage it actually is", () => {
        expect(draftReadout(draft({ scaleResidual: 1.025 })).scalePercent).toBeCloseTo(2.5, 6);
        expect(draftReadout(draft({ scaleResidual: 0.99 })).scalePercent).toBeCloseTo(-1, 6);
    });
});

describe("the message Python receives", () => {
    test("it carries the operator's own units and nothing Python already owns", () => {
        const message = buildBuildingCalibrationMessage("G07", 12, draft({
            offsetEastMm: 0.7,
            offsetNorthMm: -0.24,
            rotationOffsetDeg: -2.5,
            scaleResidual: 1.01,
        }));

        expect(message).toEqual({
            type: "building_calibration",
            version: 2,
            building_id: "G07",
            marker_id: 12,
            rotation_offset_deg: -2.5,
            offset_east_mm: 0.7,
            offset_north_mm: -0.24,
            scale_residual: 1.01,
        });
        // No session id and no table position: Python generates the one and owns the other.
        expect(message).not.toHaveProperty("session_id");
        expect(message).not.toHaveProperty("table_x_px");
    });

    test("a neutral draft still sends every field, so a reset is a real reset", () => {
        // Python merges; omitting a field would leave an earlier value in place, which is the
        // opposite of what "I have put this building back to neutral" means.
        const message = buildBuildingCalibrationMessage("G07", 12, NEUTRAL);

        expect(message.rotation_offset_deg).toBe(0);
        expect(message.offset_east_mm).toBe(0);
        expect(message.offset_north_mm).toBe(0);
        expect(message.scale_residual).toBe(1);
    });

    test("the building id is normalised the way the catalog stores it", () => {
        expect(buildBuildingCalibrationMessage(" g07 ", 12, NEUTRAL).building_id).toBe("G07");
    });
});

describe("opening at what Python already stored", () => {
    test("a stored calibration round-trips through the panel unchanged", () => {
        // Python publishes the stored calibration in the message's own units, so the panel can
        // open at it and send it back untouched. Any conversion here would be a second home for
        // the 1:500 factor and a factor-of-500 error that looks plausible on screen.
        const stored = {
            rotation_offset_deg: -2.5,
            offset_east_mm: 0.7,
            offset_north_mm: -0.24,
            scale_residual: 1.01,
        };

        const message = buildBuildingCalibrationMessage("G07", 12, draftFromStoredCalibration(stored));

        expect(message).toMatchObject(stored);
    });

    test("no stored calibration means neutral, not a guess", () => {
        expect(draftFromStoredCalibration(undefined)).toEqual(NEUTRAL);
    });
});

describe("which parts of the table have been sampled", () => {
    const config = DEFAULT_COLLAB_TABLE_CONFIG;

    test("the grid is three by three, so corners, edges and centre are all distinguishable", () => {
        // Step 6.3 asks exactly this question: is the error the same everywhere, or worse at the
        // edges? A grid coarser than 3x3 cannot tell an edge from the middle.
        expect(TABLE_COVERAGE_GRID).toEqual({ columns: 3, rows: 3 });
    });

    test("a reading is placed in the cell it physically falls in", () => {
        // 1600x800 table pixels, so columns break at 533/1067 and rows at 267/533.
        expect(tableCoverageCellOf({ tableXPx: 50, tableYPx: 50 }, config)).toEqual({ column: 0, row: 0 });
        expect(tableCoverageCellOf({ tableXPx: 800, tableYPx: 400 }, config)).toEqual({ column: 1, row: 1 });
        expect(tableCoverageCellOf({ tableXPx: 1550, tableYPx: 780 }, config)).toEqual({ column: 2, row: 2 });
    });

    test("a reading outside the table image is clamped rather than dropped", () => {
        // A marker read slightly off the rectified image is still a real sample near that corner.
        expect(tableCoverageCellOf({ tableXPx: -20, tableYPx: -20 }, config)).toEqual({ column: 0, row: 0 });
        expect(tableCoverageCellOf({ tableXPx: 9999, tableYPx: 9999 }, config)).toEqual({ column: 2, row: 2 });
    });

    test("coverage counts every sample and reports the cells still empty", () => {
        const coverage = tableCoverage(
            [
                { tableXPx: 50, tableYPx: 50 },
                { tableXPx: 60, tableYPx: 60 },
                { tableXPx: 800, tableYPx: 400 },
            ],
            config
        );

        expect(coverage.cells).toHaveLength(9);
        expect(coverage.cells.find((cell) => cell.column === 0 && cell.row === 0)?.count).toBe(2);
        expect(coverage.cells.find((cell) => cell.column === 1 && cell.row === 1)?.count).toBe(1);
        expect(coverage.sampledCellCount).toBe(2);
        expect(coverage.emptyCellCount).toBe(7);
    });

    test("an untouched table reports every cell empty rather than throwing", () => {
        const coverage = tableCoverage([], config);

        expect(coverage.sampledCellCount).toBe(0);
        expect(coverage.emptyCellCount).toBe(9);
        expect(coverage.cells.every((cell) => cell.count === 0)).toBe(true);
    });
});
