export function parseEventPointLocation(value: unknown): [number, number] | undefined {
    if (isGeoJsonPoint(value)) {
        return [value.coordinates[0], value.coordinates[1]];
    }
    if (typeof value !== "string") {
        return undefined;
    }
    const match = value.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i);
    if (match === null) {
        return undefined;
    }

    const longitude = Number(match[1]);
    const latitude = Number(match[2]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return undefined;
    }
    return [longitude, latitude];
}

function isGeoJsonPoint(
    value: unknown
): value is { type: "Point", coordinates: [number, number, ...number[]] } {
    if (
        typeof value !== "object" ||
        value === null ||
        !("type" in value) ||
        !("coordinates" in value)
    ) {
        return false;
    }
    const candidate = value as { type: unknown, coordinates: unknown };
    return (
        candidate.type === "Point" &&
        Array.isArray(candidate.coordinates) &&
        candidate.coordinates.length >= 2 &&
        typeof candidate.coordinates[0] === "number" &&
        typeof candidate.coordinates[1] === "number" &&
        Number.isFinite(candidate.coordinates[0]) &&
        Number.isFinite(candidate.coordinates[1])
    );
}
