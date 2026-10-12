/**
 * Shared camera framing for Urban Stories.
 *
 * @remarks
 * TOSCA's sidebars cover the map instead of shrinking it, so a camera must be computed against the part of the
 * map the reader can actually see. Every story frames areas and points through this module instead of calling
 * `fitBounds` / `flyTo` with its own padding maths.
 *
 * The centre is always set explicitly and the left inset is applied as map padding, so the target sits in the middle
 * of the visible region. `fitBounds` is deliberately avoided: it also shifts the computed centre by the padding,
 * which pushes the area too far right once the sidebar padding is applied a second time.
 */

export const STORY_VIEW_MARGIN_PX = 40;
const MAX_INSET_SHARE = 0.6;

export interface CameraMap {
    getCanvas(): HTMLCanvasElement;
    cameraForBounds(
        bounds: [number, number, number, number],
        options: { padding: { left: number; right: number; top: number; bottom: number }; maxZoom?: number },
    ): { zoom?: number } | undefined;
    flyTo(options: Record<string, unknown>): unknown;
}

export interface Insets {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

export const reducedMotion = (): boolean => (
    typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
);

/** Width of the open left sidebar over the map; ignored when it would cover most of the map (narrow screens). */
export function leftInset(map: Pick<CameraMap, "getCanvas">): number {
    const canvas = map.getCanvas().getBoundingClientRect();
    let left = 0;
    document.querySelectorAll<HTMLElement>("section[data-position='left']").forEach((section) => {
        const rect = section.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) left = Math.max(left, rect.right - canvas.left);
    });
    const inset = Math.max(0, Math.round(left));
    return canvas.width > 0 && inset > canvas.width * MAX_INSET_SHARE ? 0 : inset;
}

export function viewInsets(map: Pick<CameraMap, "getCanvas">): Insets {
    return { left: leftInset(map), right: 0, top: 0, bottom: 0 };
}

/**
 * Camera standard per administrative level.
 *
 * - `bezirk`: fitted to the bounds (they are big enough that fitting gives a good view).
 * - `stadtteil`: fixed zoom 14, the level that frames Langenbek well, so every Stadtteil reads at the same scale
 *   regardless of its size (a fitted Wilhelmsburg would be zoomed far out).
 * - `statisticalUnit`: one zoom level closer than a Stadtteil.
 */
export type AdminLevel = "bezirk" | "stadtteil" | "statisticalUnit";

export const ADMIN_LEVEL_ZOOM: Record<Exclude<AdminLevel, "bezirk">, number> = {
    stadtteil: 14,
    statisticalUnit: 15,
};

/** Frames an administrative area at the standard scale of its level, centred in the visible part of the map. */
export function flyToAdminArea(
    map: CameraMap,
    bounds: [number, number, number, number],
    level: AdminLevel,
    options: Omit<FlyToBoundsOptions, "maxZoom"> = {},
): void {
    if (level === "bezirk") {
        flyToBounds(map, bounds, options);
        return;
    }
    flyToPoint(map, [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2], { zoom: ADMIN_LEVEL_ZOOM[level], ...options });
}

export interface FlyToBoundsOptions {
    margin?: number;
    maxZoom?: number;
    pitch?: number;
    duration?: number;
}

/** Fits `[west, south, east, north]` inside the visible part of the map and centres it there. */
export function flyToBounds(map: CameraMap, bounds: [number, number, number, number], options: FlyToBoundsOptions = {}): void {
    const margin = options.margin ?? STORY_VIEW_MARGIN_PX;
    const maxZoom = options.maxZoom ?? 14;
    const insets = viewInsets(map);
    const fit = map.cameraForBounds(bounds, {
        padding: { left: insets.left + margin, right: margin, top: margin, bottom: margin },
        maxZoom,
    });
    const zoom = Math.min(fit?.zoom ?? maxZoom, maxZoom);
    map.flyTo({
        center: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2],
        zoom,
        pitch: options.pitch ?? 0,
        bearing: 0,
        padding: insets,
        duration: options.duration ?? (reducedMotion() ? 0 : 1400),
    });
}

/** Flies to a point, centred in the visible part of the map. */
export function flyToPoint(
    map: CameraMap,
    center: [number, number],
    options: { zoom: number; pitch?: number; duration?: number },
): void {
    map.flyTo({
        center,
        zoom: options.zoom,
        pitch: options.pitch ?? 0,
        padding: viewInsets(map),
        duration: options.duration ?? (reducedMotion() ? 0 : 1400),
    });
}
