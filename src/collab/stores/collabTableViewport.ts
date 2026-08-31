import { watch } from "vue";
import type { useMapStore } from "@store/map";
import { aoiBoundingBox, aoiChecksum, calibrationMarkerSizePx } from "./collabCalibration";
import type { AOIExtent } from "./collabCalibration";
import type { useCollabSessionStore } from "./collabSession";

/**
 * How far the fitted AOI may sit from the padded canvas box before the fit counts as wrong, in CSS
 * pixels. `fitBounds` lands on the box within sub-pixel rounding, and the failure this guards
 * against is measured in hundreds of pixels, so the exact value only has to be above the noise.
 */
const FIT_TOLERANCE_PX = 2;

/** Bounded synchronous re-fits per `fitThenLock` call — see the `resize()` retry's own comment. */
const MAX_FIT_ATTEMPTS = 4;

/** Bounded deferred (one-animation-frame-later) re-fits per AOI/canvas pair — see `verificationRetries`. */
const MAX_VERIFICATION_RETRIES = 6;

/**
 * Table-window viewport control (ticket 11, fix-tickets): fits the Table map exactly to the
 * Control-selected AOI and locks pan/zoom/rotate/keyboard interaction, so the projector shows the
 * operator-selected area and stays frozen *against the operator's own input* — but re-fits every
 * time Control confirms a *different* AOI (live-rig diagnosis, 2026-08-31: this used to fit only
 * the first AOI ever seen and never again, so a later AOI update left the map camera pointed at
 * the old area — calibration markers were correctly repositioned to the new AOI's geography, just
 * entirely outside what the frozen viewport could see, which read as "the whole Table view is
 * black"/broken). Extracted out of `CollabTableView.vue`'s `<script setup>` so it is unit-testable
 * against a fake map store, the way every other Collab store in this module is (this codebase has
 * no component-mount test infrastructure — see collabRegression.test.ts's `vi.mock("@store/map")`
 * pattern).
 *
 * Runs again on every `map`/`session.calibration.aoi` change (immediate), so it also covers the
 * (re)load/localStorage-recovery path: `collabSync.startAsTable` may populate `aoi` before or
 * after the map itself becomes ready. Deliberately does nothing while `aoi` is null — if Control
 * never selects an AOI, the Table stays pannable on its generic startup viewport rather than
 * freezing on the wrong one.
 *
 * Compares AOIs by {@link aoiChecksum}, not by `session.calibration.aoi`'s object identity
 * (live-rig diagnosis, 2026-08-31): `collabSync`'s patch/snapshot application rebuilds the whole
 * `calibration` slice — `aoi` included — on *any* field within it changing (ticket 11's own
 * "Table's watchers always have something to react to" design, needed so a marker-health-only
 * update still repaints red/green borders), so `aoi` gets reassigned to a structurally-identical
 * new object on every such broadcast. Re-fitting on object identity alone re-ran `fitBounds` on
 * every marker going green — with no real AOI change to justify it, that read as the whole Table
 * view jolting/"jumping" at the exact moment a marker was accepted.
 *
 * Fits with `padding: {@link calibrationMarkerSizePx}() / 2`, not `0` (live-rig diagnosis,
 * 2026-08-31, confirmed by projecting the fitted AOI's corners back to canvas pixels: with zero
 * padding, `fitBounds` seats the AOI's corners exactly on the canvas edge on whichever axis
 * constrains the fit — 0 and the full canvas width/height, pixel for pixel, no margin at all).
 * Every calibration marker's `anchor: "center"` sits exactly on one of those corners, so with no
 * padding roughly half of every marker's width was guaranteed to render past the canvas edge —
 * i.e. physically off the projected table, reported as markers "jumping outside the table" right
 * as they appeared. Padding by exactly half the marker's own size is the minimum that keeps a
 * corner-centred marker's far edge inside the canvas.
 *
 * Also re-fits whenever the map's own canvas resizes, even with the AOI unchanged (live-rig
 * diagnosis, 2026-08-31: captured logs showed the Table canvas's `clientWidth`/`clientHeight`
 * changing — same `devicePixelRatio`, no AOI change, e.g. the projector/fullscreen surface still
 * settling or `MapContainer.vue`'s own DPR-driven `map.resize()` — entirely between two AOI
 * Updates, with nothing here reacting to it because the only watch source was the AOI. The *next*
 * AOI Update then fit against whatever canvas size happened to be current at that instant; once
 * the canvas later reported a different size, that baked-in fit no longer matched it, and because
 * `fitBounds`'s padding scales all four corners outward from the same centre, the mismatch showed
 * up as every calibration marker drifting the same distance past the table's edge). Tracked
 * alongside the AOI checksum so an unchanged AOI on an unchanged canvas still skips redundant
 * `fitBounds` calls (this is exactly what the "same-value AOI reassigned to a new object" test
 * above guards against — that jolted the viewport on every marker turning green).
 *
 * Every fit is then *verified* against the map itself rather than assumed from `fitBounds` having
 * returned: the fitted bounds are projected back to canvas pixels and compared with the padded box
 * they were supposed to land on, synchronously and again one animation frame later, re-fitting
 * (via `map.resize()`, the only public API that rebuilds MapLibre's transform from the container)
 * whenever they disagree. Without it, only the *first* AOI ever selected reliably came out right:
 * the operator opens the Table window and drags it onto the projector, so that fit is followed by a
 * burst of real canvas resizes that each re-ran this sync until it converged, whereas an AOI
 * confirmed against an already-placed Table window fits exactly once against whatever the canvas
 * happened to measure at that instant — and nothing ever corrected a stale measurement, which is
 * what put the new AOI's calibration markers outside the table.
 *
 * @returns a stop function that ends the watch — call it on unmount, mirroring every other
 * `start*`/`stop` pair in the Collab stores.
 */
export function startTableViewportSync(
    session: ReturnType<typeof useCollabSessionStore>,
    mapStore: ReturnType<typeof useMapStore>
): () => void {
    let lastFittedAoiChecksum: string | undefined;
    let lastFittedCanvasSize: string | undefined;
    /** Re-entrancy guard: `map.resize()` below emits `"resize"`, which this same function handles. */
    let fitting = false;
    let stopped = false;
    let pendingVerification: number | undefined;
    let resizeObserver: ResizeObserver | undefined;
    /**
     * Deferred verifications spent on the current AOI/canvas pair, reset whenever either changes.
     * Bounds the frame loop for the one case the invariant can be permanently unsatisfiable rather
     * than merely stale — an AOI needing past `maxZoom`, or a non-zero bearing, under which the
     * axis-aligned box {@link fitErrorPx} measures is legitimately wider than the fitted one.
     */
    let verificationRetries = 0;

    function lock(map: NonNullable<ReturnType<typeof useMapStore>["map"]>): void {
        map.dragPan.disable();
        map.dragRotate.disable();
        map.scrollZoom.disable();
        map.doubleClickZoom.disable();
        map.touchZoomRotate.disable();
        map.keyboard.disable();
        map.boxZoom.disable();
    }

    function canvasSizeKey(map: NonNullable<ReturnType<typeof useMapStore>["map"]>): string | undefined {
        const canvas = map.getCanvas?.();
        return canvas === undefined ? undefined : `${canvas.clientWidth}x${canvas.clientHeight}`;
    }

    /**
     * How far the map's *current* camera is, in CSS pixels, from what a correct
     * `fitBounds(aoi, { padding })` against the canvas's *current* size would produce — measured
     * from the map itself (`project()` the very bounds we fit) rather than trusted from the
     * `fitBounds` call having returned.
     *
     * `undefined` when it cannot be measured (the fake map store the unit tests use implements
     * neither `project` nor `getCanvas`; a zero-sized canvas has no meaningful padded box).
     *
     * A correct fit always leaves the AOI *touching* the padded box on whichever axis constrained
     * it and inside it on the other, so both of these are errors and both are positive here:
     * - the AOI spilling past the padded box (camera fitted for a canvas *larger* than this one —
     *   the "every calibration marker landed outside the table" report), and
     * - the AOI sitting slack on *both* axes at once (fitted for a *smaller* canvas — the same
     *   desync seen from the other side, where the markers shrink toward the table's centre).
     */
    function fitErrorPx(map: NonNullable<ReturnType<typeof useMapStore>["map"]>, aoi: AOIExtent): number | undefined {
        const canvas = map.getCanvas?.();
        if (canvas === undefined || map.project === undefined) {
            return undefined;
        }
        const padding = calibrationMarkerSizePx() / 2;
        const availableWidth = canvas.clientWidth - padding * 2;
        const availableHeight = canvas.clientHeight - padding * 2;
        if (availableWidth <= 0 || availableHeight <= 0) {
            return undefined;
        }
        const [minLng, minLat, maxLng, maxLat] = aoiBoundingBox(aoi);
        let fittedWidth: number;
        let fittedHeight: number;
        try {
            const topLeft = map.project([minLng, maxLat]);
            const bottomRight = map.project([maxLng, minLat]);
            fittedWidth = Math.abs(bottomRight.x - topLeft.x);
            fittedHeight = Math.abs(bottomRight.y - topLeft.y);
        } catch {
            return undefined;
        }
        if (!Number.isFinite(fittedWidth) || !Number.isFinite(fittedHeight)) {
            return undefined;
        }
        const widthOverflow = fittedWidth - availableWidth;
        const heightOverflow = fittedHeight - availableHeight;
        return Math.max(widthOverflow, heightOverflow, Math.min(-widthOverflow, -heightOverflow));
    }

    /** Whether the camera currently satisfies {@link fitErrorPx}; unmeasurable counts as satisfied. */
    function fitIsAccurate(map: NonNullable<ReturnType<typeof useMapStore>["map"]>, aoi: AOIExtent): boolean {
        const error = fitErrorPx(map, aoi);
        return error === undefined || error <= FIT_TOLERANCE_PX;
    }

    /**
     * Re-checks the fit one animation frame after it was applied, and re-fits if the canvas has
     * moved under it since. This is the whole reason the *first* AOI ever selected always looked
     * right while a later AOI Update did not (live-rig diagnosis, 2026-08-31): the operator opens
     * the Table window and drags it onto the projector, so the first AOI's fit is followed by a
     * burst of real canvas resizes — `1950x926 → 980x931 → 1470x1483 → 1950x926 → 2944x1490` in
     * the captured logs — each one re-firing this sync until it converged. A later AOI confirmed
     * against an already-placed Table window gets no such second chance: it fits exactly once,
     * against whatever the canvas measured at that instant, and if that measurement was stale
     * (a fullscreen/DPI negotiation still settling, a `map.resize()` MapLibre had not yet applied)
     * nothing ever corrected it. Verifying makes every AOI take the first one's path.
     */
    function scheduleFitVerification(): void {
        if (typeof requestAnimationFrame !== "function" || pendingVerification !== undefined || verificationRetries >= MAX_VERIFICATION_RETRIES) {
            return;
        }
        pendingVerification = requestAnimationFrame(() => {
            pendingVerification = undefined;
            if (stopped) {
                return;
            }
            const map = mapStore.map;
            const aoi = session.calibration.aoi;
            if (map === undefined || aoi === null || fitIsAccurate(map, aoi)) {
                return;
            }
            verificationRetries++;
            fitThenLock();
        });
    }

    function fitThenLock(): void {
        const map = mapStore.map;
        const aoi = session.calibration.aoi;
        if (map === undefined || aoi === null || fitting) {
            return;
        }
        const checksum = aoiChecksum(aoi);
        const canvasSize = canvasSizeKey(map);
        // The accuracy check is what turns the AOI/canvas guard from "have we already run for this
        // input?" into "is the camera actually where this input requires?" — without it, a camera
        // left desynced by a canvas change MapLibre reported before the AOI arrived (so the sizes
        // match, and so does the checksum) is never revisited.
        if (checksum === lastFittedAoiChecksum && canvasSize === lastFittedCanvasSize && fitIsAccurate(map, aoi)) {
            return;
        }
        if (checksum !== lastFittedAoiChecksum || canvasSize !== lastFittedCanvasSize) {
            verificationRetries = 0;
        }
        fitting = true;
        try {
            const [minLng, minLat, maxLng, maxLat] = aoiBoundingBox(aoi);
            for (let attempt = 0; attempt < MAX_FIT_ATTEMPTS; attempt++) {
                map.fitBounds(
                    [
                        [minLng, minLat],
                        [maxLng, maxLat],
                    ],
                    { padding: calibrationMarkerSizePx() / 2, animate: false }
                );
                if (fitIsAccurate(map, aoi)) {
                    break;
                }
                // The camera disagrees with the canvas we just measured, which means MapLibre's own
                // transform is still on an older size than the DOM reports. `resize()` is the only
                // public API that re-reads the container and rebuilds the transform from it; fitting
                // again afterwards is then computed against the real dimensions. Bounded, so a canvas
                // that can never satisfy the invariant (an AOI needing more than `maxZoom`, say)
                // costs a fixed handful of synchronous fits rather than spinning.
                map.resize?.();
            }
            lastFittedAoiChecksum = checksum;
            lastFittedCanvasSize = canvasSizeKey(map);
            lock(map);
        } finally {
            fitting = false;
        }
        scheduleFitVerification();
    }

    const stopAoiWatch = watch(() => [mapStore.map, session.calibration.aoi] as const, fitThenLock, { immediate: true });

    // Re-arms on every `mapStore.map` change (there is only ever one, but this mirrors the AOI
    // watcher's own null-safety) and tears itself down via Vue's `onCleanup` both when the map
    // changes and when this whole sync is stopped, so it never leaks a listener onto a stale map.
    const stopResizeWatch = watch(
        () => mapStore.map,
        (map, _previousMap, onCleanup) => {
            if (map === undefined) {
                return;
            }
            // Optional-chained: the fake map store `collabTableViewport.test.ts` uses for every
            // other test doesn't implement `on`/`off` at all — only the tests that specifically
            // exercise resize behavior need to supply them.
            map.on?.("resize", fitThenLock);
            // Second, independent resize channel. MapLibre only emits `"resize"` from its own
            // `resize()`, so the container changing size without that call having run yet (or at
            // all) is invisible to the listener above — and a fit computed in that window is
            // exactly the desync this whole sync exists to prevent. Observing the container
            // directly closes it: `resize()` first, so MapLibre's transform is rebuilt from the new
            // dimensions, then the fit. Guarded because jsdom (unit tests) has no `ResizeObserver`.
            const container = map.getContainer?.();
            if (container !== undefined && typeof ResizeObserver === "function") {
                resizeObserver = new ResizeObserver(() => {
                    map.resize?.();
                    fitThenLock();
                });
                resizeObserver.observe(container);
            }
            onCleanup(() => {
                map.off?.("resize", fitThenLock);
                resizeObserver?.disconnect();
                resizeObserver = undefined;
            });
        },
        { immediate: true }
    );

    return () => {
        stopped = true;
        if (pendingVerification !== undefined) {
            cancelAnimationFrame(pendingVerification);
            pendingVerification = undefined;
        }
        stopAoiWatch();
        stopResizeWatch();
    };
}
