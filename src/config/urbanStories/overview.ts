import type { OverviewCamera } from "./types";

/** The TOSCA start view (`VITE_MAP_START_*` in the production `.env`), used until story owners pick their own. */
export const HAMBURG_OVERVIEW_CAMERA: OverviewCamera = {
    center: [10.03668, 53.545863],
    zoom: 12,
};

/**
 * Chapter cameras never invent places: they keep the TOSCA start view's centre and only change the zoom.
 * The state-wide layers' catalog extent (green features `9.732, 53.399, 10.283, 53.716`; admin layers
 * `8.413, 53.394, 10.341, 53.966`, which includes the Neuwerk exclave) is centred on the same area,
 * so `CITY` shows the whole city. Street-level zooms show the area around the start view only; the
 * chapter texts tell users to pan to their own neighbourhood.
 *
 * Zoom floors of the heavy layers (see `layers.ts`): buildings 14, mobility 15, green features 14.
 */
function atZoom(zoom: number): OverviewCamera {
    return { center: [...HAMBURG_OVERVIEW_CAMERA.center], zoom };
}

export const CHAPTER_CAMERAS = {
    /** Whole city, below every heavy-layer floor: only light layers render. */
    CITY: atZoom(10.5),
    /** City with the neighbourhood-level layers readable. */
    DISTRICTS: atZoom(11),
    /** Neighbourhood scale, for points of interest and statistical units. */
    NEIGHBOURHOODS: atZoom(12),
    /** Above the green-features floor (14). */
    GREEN_DETAIL: atZoom(14.5),
    /** Above the buildings floor (14). */
    BUILDINGS: atZoom(15),
    /** Above the 3D zoom (buildings reach full height at 16), tilted so extruded buildings read as 3D. */
    BUILDINGS_3D: { ...atZoom(16), pitch: 55 },
    /** Above the mobility floor (15). */
    STREETS: atZoom(15.5),
    STREETS_CLOSE: atZoom(16.5),
} as const satisfies Record<string, OverviewCamera>;

/**
 * HafenCity Hamburg (Elbphilharmonie 9.984, 53.541; Überseequartier 9.997, 53.541): the opening place of the
 * 15-Minute City story, a place the user named. Only this story uses it; the other stories keep the TOSCA start view.
 */
export const HAFENCITY_CENTER: [number, number] = [9.9937, 53.541];
