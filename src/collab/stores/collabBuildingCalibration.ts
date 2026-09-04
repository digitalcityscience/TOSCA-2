import { DEFAULT_COLLAB_TABLE_CONFIG, type CollabTableConfig } from "./collabCalibration"
import type { StoredBuildingCalibration } from "./collabTracking"

/**
 * The admin panel's side of per-building calibration (workflow step 4).
 *
 * Everything here is in the *operator's* units, because the operator is standing at the table
 * with a ruler: table millimetres and degrees. One arrow-key tick is one table pixel is one
 * millimetre, at the 10 px/cm the stitching pipeline fixes. Python converts to the catalog's
 * real-world metres on receipt (`physical_building_catalog.calibration_from_message`), which is
 * what keeps the blocks' 1:500 milling scale a number this repo never restates.
 *
 * The one rule everything below serves: an offset is stored in the *building's own* east/north
 * frame, so it turns with the block. The operator pushes "right" while looking at the projection;
 * what gets stored is that push expressed in the block's axes. An offset stored in table or world
 * axes would look correct until the block was turned, and then be wrong everywhere -- and since
 * per-building constants are meant to outlive any one placement, that failure would be silent.
 *
 * This module holds no state and touches no map. It is the arithmetic and the message shape; the
 * panel component owns the interaction and `collabTrackingRender` owns the transport.
 */

/** One in-progress calibration, as the operator has nudged it so far. Table millimetres and degrees. */
export interface BuildingCalibrationDraft {
    /** East in the BUILDING's own frame, not the table's — see this module's header. */
    offsetEastMm: number
    offsetNorthMm: number
    rotationOffsetDeg: number
    /** Multiplies the session's global scale factor for this one building. 1 = no correction. */
    scaleResidual: number
}

/** Asking for no correction at all. Also what "Reset" puts a building back to. */
export const NEUTRAL_BUILDING_CALIBRATION_DRAFT: BuildingCalibrationDraft = {
    offsetEastMm: 0,
    offsetNorthMm: 0,
    rotationOffsetDeg: 0,
    scaleResidual: 1,
}

/**
 * One arrow-key tick, in table millimetres. Exactly one table pixel at
 * `tablePixelSpace.pixelsPerCm = 10`: the finest movement the tracking pipeline can even
 * represent, so a finer step would promise the operator precision the rig cannot deliver.
 */
export const BUILDING_CALIBRATION_NUDGE_MM = 1

/**
 * One `Q`/`E` tick, in degrees. Half a degree turns a 40 m building's corner by ~17 cm on the
 * ground and ~0.6 mm on the table -- fine enough to sit inside the block's outline, coarse
 * enough that seating a building is a handful of presses rather than a hundred.
 */
export const BUILDING_CALIBRATION_ROTATE_STEP_DEG = 0.5

/** One `+`/`-` tick: half a percent, ~0.4 mm on an 8 cm block, the same order as the nudge step. */
export const BUILDING_CALIBRATION_SCALE_STEP = 0.005

/**
 * The floor `-` can drive the scale residual to. A residual at or below zero collapses the
 * footprint to a point (and Python refuses it outright), so the key stops here rather than
 * letting a held-down key quietly destroy the drawing the operator is aiming with.
 */
const MINIMUM_SCALE_RESIDUAL = 0.01

export function draftIsNeutral(draft: BuildingCalibrationDraft): boolean {
    return (
        draft.offsetEastMm === NEUTRAL_BUILDING_CALIBRATION_DRAFT.offsetEastMm &&
        draft.offsetNorthMm === NEUTRAL_BUILDING_CALIBRATION_DRAFT.offsetNorthMm &&
        draft.rotationOffsetDeg === NEUTRAL_BUILDING_CALIBRATION_DRAFT.rotationOffsetDeg &&
        draft.scaleResidual === NEUTRAL_BUILDING_CALIBRATION_DRAFT.scaleResidual
    )
}

/** An east/north pair in table millimetres. Which frame it is in is always said at the call site. */
export interface PlanarDeltaMm {
    eastMm: number
    northMm: number
}

/** An east/north pair in real-world metres, as a map drag produces. */
export interface PlanarDeltaM {
    eastM: number
    northM: number
}

/** Rotates `(east, north)` by `degrees` anticlockwise — east toward north, the sense `place_geometry` uses. */
function rotate(east: number, north: number, degrees: number): PlanarDeltaMm {
    const radians = (degrees * Math.PI) / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)
    return { eastMm: east * cosine - north * sine, northMm: east * sine + north * cosine }
}

/**
 * A movement the operator made in *table* axes, expressed in the building's own frame.
 *
 * Two rotations, folded into one: the table's axes are the AOI's axes turned by
 * `aoiRotationOffsetDeg` (`collabCalibration.tableToAoiRotationOffsetDeg` — how far the AOI's top
 * edge runs off due east), and the building's axes are the geographic ones turned by
 * `drawnRotationDeg` (the `rotation` Python publishes on the feature, which is already
 * `detected - marker_reference + rotation_offset_deg`). Going the other way is a single rotation
 * by the negated sum.
 */
export function localMmFromTableDelta(
    delta: PlanarDeltaMm,
    drawnRotationDeg: number,
    aoiRotationOffsetDeg: number
): PlanarDeltaMm {
    return rotate(delta.eastMm, delta.northMm, -(drawnRotationDeg + aoiRotationOffsetDeg))
}

/**
 * A drag measured on the map, expressed in the building's own frame and the operator's units.
 *
 * `groundScale` is real-world centimetres per table centimetre (`collabCalibration.deriveGroundScale`
 * — the same ratio Python derives from the homography), so dividing by it turns ground metres into
 * table metres before the millimetre conversion. No AOI term here: a drag is already measured in
 * geographic east/north, so only the building's own heading remains.
 */
export function localMmFromGeographicDelta(
    delta: PlanarDeltaM,
    drawnRotationDeg: number,
    groundScale: number
): PlanarDeltaMm {
    if (!(groundScale > 0)) {
        throw new Error(`ground scale must be positive to convert a drag, got ${groundScale}`)
    }
    const eastMm = (delta.eastM / groundScale) * 1000
    const northMm = (delta.northM / groundScale) * 1000
    return rotate(eastMm, northMm, -drawnRotationDeg)
}

/** `draft` with one table-axis movement added, in the building's frame. Rotation and scale untouched. */
export function nudgedDraft(
    draft: BuildingCalibrationDraft,
    delta: PlanarDeltaMm,
    drawnRotationDeg: number,
    aoiRotationOffsetDeg: number
): BuildingCalibrationDraft {
    const local = localMmFromTableDelta(delta, drawnRotationDeg, aoiRotationOffsetDeg)
    return {
        ...draft,
        offsetEastMm: draft.offsetEastMm + local.eastMm,
        offsetNorthMm: draft.offsetNorthMm + local.northMm,
    }
}

/** `draft` with one already-local movement added — the drag path, whose delta is converted first. */
export function draggedDraft(draft: BuildingCalibrationDraft, local: PlanarDeltaMm): BuildingCalibrationDraft {
    return {
        ...draft,
        offsetEastMm: draft.offsetEastMm + local.eastMm,
        offsetNorthMm: draft.offsetNorthMm + local.northMm,
    }
}

/**
 * `draft` turned by `steps` ticks, wrapped onto `(-180, 180]`.
 *
 * The wrap matters for reading, not for maths: a correction is by nature a small angle, and an
 * operator who sees `+181` instead of `-179` reads a huge error where there is none.
 */
export function rotatedDraft(draft: BuildingCalibrationDraft, steps: number): BuildingCalibrationDraft {
    const turned = draft.rotationOffsetDeg + steps * BUILDING_CALIBRATION_ROTATE_STEP_DEG
    const wrapped = ((((turned + 180) % 360) + 360) % 360) - 180
    return { ...draft, rotationOffsetDeg: wrapped === -180 ? 180 : wrapped }
}

/** `draft` resized by `steps` ticks, never past {@link MINIMUM_SCALE_RESIDUAL}. */
export function resizedDraft(draft: BuildingCalibrationDraft, steps: number): BuildingCalibrationDraft {
    const resized = draft.scaleResidual + steps * BUILDING_CALIBRATION_SCALE_STEP
    return { ...draft, scaleResidual: Math.max(MINIMUM_SCALE_RESIDUAL, resized) }
}

/** The live numbers the panel shows: the same draft, in the units the operator measures in. */
export interface BuildingCalibrationReadout {
    /** Table centimetres — what a ruler laid on the table reads. */
    offsetEastCm: number
    offsetNorthCm: number
    rotationOffsetDeg: number
    /** How much bigger or smaller than the session's scale, as a percentage. */
    scalePercent: number
}

export function draftReadout(draft: BuildingCalibrationDraft): BuildingCalibrationReadout {
    return {
        offsetEastCm: draft.offsetEastMm / 10,
        offsetNorthCm: draft.offsetNorthMm / 10,
        rotationOffsetDeg: draft.rotationOffsetDeg,
        scalePercent: (draft.scaleResidual - 1) * 100,
    }
}

/**
 * The `building_calibration` message, exactly as `test/fixtures/frontend_contract.json` documents
 * it in the COUP repo.
 *
 * Every field is sent, even a neutral one. Python *merges* what it receives onto what it already
 * has, so omitting an untouched field would leave the previous value standing -- which is right
 * for a partial nudge but wrong for "I have put this building back to neutral", and the panel
 * cannot tell those apart after the fact. Sending all four makes the saved state exactly the
 * state the operator is looking at.
 *
 * No session id and no table position: Python generates the first from the accepted handshake and
 * owns the second (once calibrated, the frontend never sees a table pixel again).
 */
export interface BuildingCalibrationMessage {
    type: "building_calibration"
    version: 2
    building_id: string
    marker_id: number
    rotation_offset_deg: number
    offset_east_mm: number
    offset_north_mm: number
    scale_residual: number
}

/**
 * The draft the panel should open at, given what Python is already drawing the building with.
 *
 * Python publishes the stored calibration in exactly the message's units, so this is a rename
 * rather than a conversion -- deliberately, because a unit conversion here would be a second
 * place for the 1:500 factor to live and a factor-of-500 error that looks plausible on screen.
 *
 * `undefined` (an older server, or a feature without the property) means "nothing is stored", so
 * neutral is the honest answer rather than a guess.
 *
 * A `null` `rotation_offset_deg` means the building's heading has never been verified. The draft
 * opens at neutral, which is not a claim: this panel always sends all four fields, so the
 * operator's first save is by construction the measurement that makes the building aligned. What
 * must not happen is the *catalog* holding a zero nobody measured, and that is Python's `None`.
 */
export function draftFromStoredCalibration(
    stored: StoredBuildingCalibration | undefined
): BuildingCalibrationDraft {
    if (stored === undefined) {
        return { ...NEUTRAL_BUILDING_CALIBRATION_DRAFT }
    }
    return {
        offsetEastMm: stored.offset_east_mm,
        offsetNorthMm: stored.offset_north_mm,
        rotationOffsetDeg:
            stored.rotation_offset_deg ?? NEUTRAL_BUILDING_CALIBRATION_DRAFT.rotationOffsetDeg,
        scaleResidual: stored.scale_residual,
    }
}

export function buildBuildingCalibrationMessage(
    buildingId: string,
    markerId: number,
    draft: BuildingCalibrationDraft
): BuildingCalibrationMessage {
    return {
        type: "building_calibration",
        version: 2,
        // The catalog stores building ids upper-cased and trimmed; sending anything else would be
        // refused by Python's `building_id` check for a reason the operator could not act on.
        building_id: buildingId.trim().toUpperCase(),
        marker_id: markerId,
        rotation_offset_deg: draft.rotationOffsetDeg,
        offset_east_mm: draft.offsetEastMm,
        offset_north_mm: draft.offsetNorthMm,
        scale_residual: draft.scaleResidual,
    }
}

/**
 * The coverage grid the panel draws above the controls: three by three over the table image.
 *
 * Three, because step 6.3's whole question is whether the residual error is the same everywhere
 * or grows toward the edges, and a grid coarser than this cannot tell an edge cell from the
 * middle one. Finer would split a table this size into cells smaller than a block.
 */
export const TABLE_COVERAGE_GRID = { columns: 3, rows: 3 } as const

/** Where a building was seen on the table, in the pixel space Python publishes on every feature. */
export interface TableSample {
    tableXPx: number
    tableYPx: number
}

export interface TableCoverageCell {
    column: number
    row: number
    count: number
}

export interface TableCoverage {
    cells: readonly TableCoverageCell[]
    sampledCellCount: number
    emptyCellCount: number
}

function tablePixelExtent(config: CollabTableConfig): { widthPx: number; heightPx: number } {
    const { pixelsPerCm } = config.tablePixelSpace
    return {
        widthPx: config.physicalTable.widthCm * pixelsPerCm,
        heightPx: config.physicalTable.heightCm * pixelsPerCm,
    }
}

/**
 * Which grid cell a reading falls in, clamped to the grid.
 *
 * Clamped rather than rejected: a marker read a little outside the rectified image is still a
 * real sample taken near that corner, and dropping it would make the emptiest, most interesting
 * part of the table look unsampled precisely when it is being sampled.
 */
export function tableCoverageCellOf(
    sample: TableSample,
    config: CollabTableConfig = DEFAULT_COLLAB_TABLE_CONFIG
): { column: number; row: number } {
    const { widthPx, heightPx } = tablePixelExtent(config)
    const clamp = (value: number, limit: number): number => Math.min(Math.max(value, 0), limit - 1)
    return {
        column: clamp(Math.floor((sample.tableXPx / widthPx) * TABLE_COVERAGE_GRID.columns), TABLE_COVERAGE_GRID.columns),
        row: clamp(Math.floor((sample.tableYPx / heightPx) * TABLE_COVERAGE_GRID.rows), TABLE_COVERAGE_GRID.rows),
    }
}

/** Every grid cell with how many samples landed in it — the panel's "which edges are still empty" view. */
export function tableCoverage(
    samples: readonly TableSample[],
    config: CollabTableConfig = DEFAULT_COLLAB_TABLE_CONFIG
): TableCoverage {
    const cells: TableCoverageCell[] = []
    for (let row = 0; row < TABLE_COVERAGE_GRID.rows; row++) {
        for (let column = 0; column < TABLE_COVERAGE_GRID.columns; column++) {
            cells.push({ column, row, count: 0 })
        }
    }
    for (const sample of samples) {
        const { column, row } = tableCoverageCellOf(sample, config)
        const cell = cells.find((candidate) => candidate.column === column && candidate.row === row)
        if (cell !== undefined) {
            cell.count += 1
        }
    }
    const sampledCellCount = cells.filter((cell) => cell.count > 0).length
    return { cells, sampledCellCount, emptyCellCount: cells.length - sampledCellCount }
}
