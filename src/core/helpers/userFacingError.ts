export function serviceUnavailableMessage(serviceName: string): string {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return "You appear to be offline. Reconnect to the internet and try again.";
    }
    return `We couldn't reach the ${serviceName} service. Please try again in a moment.`;
}

export function reportDeveloperError(context: string, error: unknown): void {
    console.error(`[TOSCA] ${context}`, error);
}
