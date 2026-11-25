import type { ParameterValue } from "./simulationParameters";
import type { LngLat } from "./sionnaRunner";

/**
 * Ready-made radio planning cases for a georeferenced Sionna scene: parameters,
 * what to compute and where devices go, chosen from the scene's own buildings.
 * Texts live in the locales under `sionna.useCases.cases.<id>`.
 */
type Building = GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown> | null>;

export interface Placement {
    kind: "transmitters" | "receivers";
    at: LngLat;
    /** Metres above the roof or ground at `at`. */
    above: number;
}

export interface UseCasePlan {
    devices: Placement[];
    /** A route for the first receiver; it starts at the receiver. */
    route?: LngLat[];
}

export interface UseCase {
    id: "macroCell" | "smallCell" | "link" | "driveTest" | "multipath";
    icon: string;
    /** Set on top of the defaults. */
    parameters: Record<string, ParameterValue>;
    radioMap: boolean;
    paths: boolean;
    /** Play the receiver route once computed. */
    play?: boolean;
    plan: (buildings: Building[]) => UseCasePlan;
}

const METRES_PER_DEGREE = 111_320;
const PATH_FEATURES = { paths_los: true, paths_specular_reflection: true, paths_diffraction: true };

function outerRings(feature: Building): number[][][] {
    const geometry = feature.geometry;
    if (geometry.type === "Polygon") return [geometry.coordinates[0]];
    if (geometry.type === "MultiPolygon") return geometry.coordinates.map((polygon) => polygon[0]);
    return [];
}

function centroid(feature: Building): LngLat {
    const points = outerRings(feature).flatMap((ring) => ring.slice(0, -1));
    return [points.reduce((sum, point) => sum + point[0], 0) / points.length, points.reduce((sum, point) => sum + point[1], 0) / points.length];
}

function inside(point: LngLat, ring: number[][]): boolean {
    let crossings = false;
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
        const [x1, y1] = ring[index];
        const [x2, y2] = ring[previous];
        if (y1 > point[1] !== y2 > point[1] && point[0] < ((x2 - x1) * (point[1] - y1)) / (y2 - y1) + x1) crossings = !crossings;
    }
    return crossings;
}

/** West, south, east, north of all buildings. */
export function extent(buildings: Building[]): [number, number, number, number] {
    const points = buildings.flatMap(outerRings).flat();
    const lngs = points.map((point) => point[0]);
    const lats = points.map((point) => point[1]);
    return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

/** A point at a share of the extent: (0, 0) is south west, (1, 1) north east. */
function share(buildings: Building[], east: number, north: number): LngLat {
    const [west, south, eastEdge, northEdge] = extent(buildings);
    return [west + (eastEdge - west) * east, south + (northEdge - south) * north];
}

/** Above this a building is a tower or spire, not a roof a mast goes on. */
const HIGHEST_ROOF_SITE = 60;

/** The tallest building that is an ordinary roof site; the tallest of all if none is. */
export function tallest(buildings: Building[]): Building {
    const sites = buildings.filter((building) => Number(building.properties?.height) <= HIGHEST_ROOF_SITE);
    return (sites.length > 0 ? sites : buildings).reduce((best, building) => (Number(building.properties?.height) > Number(best.properties?.height) ? building : best));
}

/** The buildings whose centre lies in `area` (corners, in order); all of them if none does. */
export function inArea(buildings: Building[], area: LngLat[]): Building[] {
    const ring = [...area, area[0]];
    const within = buildings.filter((building) => inside(centroid(building), ring));
    return within.length > 0 ? within : buildings;
}

function offset([lng, lat]: LngLat, east: number, north: number): LngLat {
    return [lng + east / (METRES_PER_DEGREE * Math.cos((lat * Math.PI) / 180)), lat + north / METRES_PER_DEGREE];
}

function distance(a: LngLat, b: LngLat): number {
    return Math.hypot((a[0] - b[0]) * METRES_PER_DEGREE * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * METRES_PER_DEGREE);
}

/** The point nearest to `target`, in 3 m steps outwards, that is not inside a building: a street or open space. */
export function openPoint(buildings: Building[], target: LngLat): LngLat {
    const rings = buildings.flatMap(outerRings);
    const free = (point: LngLat): boolean => !rings.some((ring) => inside(point, ring));
    for (let radius = 0; radius <= 150; radius += 3) {
        const steps = Math.max(1, Math.round((2 * Math.PI * radius) / 3));
        for (let step = 0; step < steps; step += 1) {
            const angle = (2 * Math.PI * step) / steps;
            const point = offset(target, radius * Math.cos(angle), radius * Math.sin(angle));
            if (free(point)) return point;
        }
    }
    return target;
}

export const USE_CASES: UseCase[] = [
    {
        id: "macroCell",
        icon: "i-lucide-radio-tower",
        parameters: { frequency_ghz: 3.5, rm_cell_size_x: 2, rm_cell_size_y: 2, rm_max_depth: 3, rm_vmin: -140, rm_vmax: -60 },
        radioMap: true,
        paths: false,
        plan: (buildings) => ({ devices: [{ kind: "transmitters", at: centroid(tallest(buildings)), above: 5 }] }),
    },
    {
        id: "smallCell",
        icon: "i-lucide-lamp",
        parameters: { frequency_ghz: 28, rm_cell_size_x: 1, rm_cell_size_y: 1, rm_max_depth: 3, rm_vmin: -160, rm_vmax: -70 },
        radioMap: true,
        paths: false,
        plan: (buildings) => ({ devices: [{ kind: "transmitters", at: openPoint(buildings, share(buildings, 0.5, 0.5)), above: 6 }] }),
    },
    {
        id: "link",
        icon: "i-lucide-arrow-right-left",
        parameters: { frequency_ghz: 26, paths_max_depth: 2, ...PATH_FEATURES },
        radioMap: false,
        paths: true,
        plan: (buildings) => {
            const from = centroid(tallest(buildings));
            const to = buildings
                .filter((building) => Number(building.properties?.height) >= 6)
                .map(centroid)
                .reduce((best, point) => (distance(point, from) > distance(best, from) ? point : best), from);
            return { devices: [{ kind: "transmitters", at: from, above: 3 }, { kind: "receivers", at: to, above: 3 }] };
        },
    },
    {
        id: "driveTest",
        icon: "i-lucide-route",
        parameters: { frequency_ghz: 3.5, paths_max_depth: 3, ...PATH_FEATURES },
        radioMap: false,
        paths: true,
        play: true,
        plan: (buildings) => {
            const route = [0.15, 0.35, 0.5, 0.65, 0.85].map((east, index) => openPoint(buildings, share(buildings, east, index % 2 === 0 ? 0.45 : 0.55)));
            return {
                devices: [{ kind: "transmitters", at: centroid(tallest(buildings)), above: 5 }, { kind: "receivers", at: route[0], above: 1.5 }],
                route: route.slice(1),
            };
        },
    },
    {
        id: "multipath",
        icon: "i-lucide-git-fork",
        parameters: { frequency_ghz: 3.5, paths_max_depth: 5, ...PATH_FEATURES },
        radioMap: false,
        paths: true,
        plan: (buildings) => {
            const from = centroid(tallest(buildings));
            const [west, south, east, north] = extent(buildings);
            // The receiver 60 % of the way to the corner farthest from the transmitter, in the street.
            const corner: LngLat = [from[0] - west < east - from[0] ? east : west, from[1] - south < north - from[1] ? north : south];
            const target: LngLat = [from[0] + (corner[0] - from[0]) * 0.6, from[1] + (corner[1] - from[1]) * 0.6];
            return { devices: [{ kind: "transmitters", at: from, above: 5 }, { kind: "receivers", at: openPoint(buildings, target), above: 1.5 }] };
        },
    },
];
