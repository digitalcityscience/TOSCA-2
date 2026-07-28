import { type EventLocationMode } from "@store/events";

export type EventBadgeColor = "neutral" | "primary" | "secondary" | "success" | "info" | "warning" | "error";

export function formatEventDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}

export function formatEventTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    return new Intl.DateTimeFormat(undefined, {
        timeStyle: "short",
    }).format(date);
}

export function eventLocationLabel(mode: EventLocationMode): string {
    const labels: Record<EventLocationMode, string> = {
        physical: "In person",
        online: "Online",
        hybrid: "Hybrid",
        by_arrangement: "By arrangement",
        home_visit: "Home visit",
    };
    return labels[mode] ?? mode;
}

export function eventLocationColor(mode: EventLocationMode): EventBadgeColor {
    if (mode === "online") {
        return "info";
    }
    if (mode === "hybrid") {
        return "warning";
    }
    return "success";
}

export function eventSeriesPosition(
    occurrenceIndex?: number | null,
    totalOccurrences?: number | null
): string {
    if (occurrenceIndex == null || totalOccurrences == null) {
        return "";
    }
    return `${occurrenceIndex} / ${totalOccurrences}`;
}
