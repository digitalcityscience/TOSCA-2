/**
 * Deployment configuration (the VITE_* values).
 *
 * A container writes the values into `/config.js` when it starts, which sets
 * `window.__TOSCA_CONFIG__` before the app loads, so one built image serves
 * every environment. Local development and tests have no generated config.js
 * and fall back to Vite's `import.meta.env` (.env.development, vi.stubEnv).
 *
 * Read VITE_* values only through this module, never from `import.meta.env`.
 */
declare global {
    interface Window {
        __TOSCA_CONFIG__?: Record<string, unknown>;
    }
}

/** Returns one configuration value, or undefined when it is not set. */
export function getConfig(name: string): string | undefined {
    const runtimeValue = typeof window === "undefined" ? undefined : window.__TOSCA_CONFIG__?.[name];
    if (typeof runtimeValue === "string" && runtimeValue.trim() !== "") {
        return runtimeValue;
    }
    const buildValue: unknown = (import.meta.env as Record<string, unknown>)[name];
    return typeof buildValue === "string" ? buildValue : undefined;
}

/** Returns the named configuration values as an object, for resolvers that take one. */
export function pickConfig<Name extends string>(...names: Name[]): Record<Name, string | undefined> {
    const values = {} as Record<Name, string | undefined>;
    for (const name of names) {
        values[name] = getConfig(name);
    }
    return values;
}
