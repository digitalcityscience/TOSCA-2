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
    if (mode === "by_arrangement") {
        return "neutral";
    }
    return "success";
}

export function eventLocationIcon(mode: EventLocationMode): string {
    const icons: Record<EventLocationMode, string> = {
        physical: "i-lucide-map-pin",
        online: "i-lucide-monitor",
        hybrid: "i-lucide-panels-top-left",
        by_arrangement: "i-lucide-message-circle-question",
        home_visit: "i-lucide-house",
    };
    return icons[mode] ?? "i-lucide-map-pin";
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
