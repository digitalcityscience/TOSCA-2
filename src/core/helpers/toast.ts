import { useToast as useNuxtToast } from "@nuxt/ui/composables";

type ToastSeverity = "success" | "info" | "warn" | "warning" | "error" | "secondary" | "contrast";

interface LegacyToastMessage {
    severity?: ToastSeverity;
    summary?: string;
    detail?: unknown;
    life?: number;
}

const severityColorMap = {
    success: "success",
    info: "info",
    warn: "warning",
    warning: "warning",
    error: "error",
    secondary: "secondary",
    contrast: "neutral",
} as const;

function formatToastDetail(detail: unknown): string | undefined {
    if (detail === undefined || detail === null) {
        return undefined;
    }
    if (detail instanceof Error) {
        return detail.message;
    }
    if (typeof detail === "string") {
        return detail;
    }
    try {
        return JSON.stringify(detail);
    } catch {
        return "Unable to display error details";
    }
}

export function useToast(): { add: (message: LegacyToastMessage) => void } {
    const toast = useNuxtToast();

    return {
        add(message: LegacyToastMessage): void {
            toast.add({
                title: message.summary,
                description: formatToastDetail(message.detail),
                color: severityColorMap[message.severity ?? "info"],
                duration: message.life,
            });
        },
    };
}
