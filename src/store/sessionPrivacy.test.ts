import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { authSession, type SessionChangeReason } from "../auth/session";
import { installPrivateLayerGuard, layerAccessChecks } from "../auth/privateContent";
import { rememberRun, myRuns } from "../core/helpers/simulationMyRuns";
import { useEventsStore } from "./events";
import { useGeostoryStore } from "./geostory";
import { type LayerObjectWithAttributes, useMapStore } from "./map";

const toastAdd = vi.hoisted(() => vi.fn());
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: toastAdd }) }));

/** Captures the listeners registered on the session, so a test can sign the user in or out. */
function captureSessionListeners() {
    const listeners: Array<(reason: SessionChangeReason) => void> = [];
    vi.spyOn(authSession, "onSessionChange").mockImplementation((listener) => {
        listeners.push(listener);
        return () => undefined;
    });
    return (reason: SessionChangeReason) => listeners.forEach((listener) => listener(reason));
}

const urlOf = (input: RequestInfo | URL): string => input instanceof Request ? input.url : input.toString();

const provider = { id: "p1", name: "Primary", base_url: "https://maps.test/geoserver" };

function catalogLayer(id: string, layerName: string, options: Partial<LayerObjectWithAttributes> = {}): LayerObjectWithAttributes {
    return {
        id,
        source: id,
        sourceType: "geoserver",
        type: "fill",
        showOnLayerList: true,
        addedWhileSignedIn: true,
        details: {
            catalog: { provider, workspace_name: "Hamburg" },
            featureType: { name: layerName },
        } as unknown as LayerObjectWithAttributes["details"],
        ...options,
    };
}

describe("logout removes only what an anonymous visitor may not see", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.stubEnv("VITE_BACKEND_ROOT_URL", "http://localhost:8000");
        toastAdd.mockClear();
        localStorage.clear();
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    test("knows where each kind of layer comes from", () => {
        expect(layerAccessChecks(catalogLayer("a", "rain"))).toEqual([[
            new URL("http://localhost:8000/api/v1/catalog/providers/p1/workspaces/Hamburg/resources/rain"),
        ]]);
        expect(layerAccessChecks({ ...catalogLayer("o", "x"), details: undefined, externalSource: {} as never })).toBe("keep");
        expect(layerAccessChecks({ id: "drawn", source: "drawn", sourceType: "geojson", type: "fill" })).toBe("keep");
        const run = layerAccessChecks({ ...catalogLayer("s", "x"), details: undefined, simulationOutput: { runId: "r1" } as never });
        expect((run as URL[][])[0].map(String)).toEqual([
            expect.stringContaining("/runs/r1/"),
            expect.stringContaining("/comparisons/r1/"),
        ]);
    });

    test("private layers leave the map, public ones and anonymous ones stay", async () => {
        const notify = captureSessionListeners();
        installPrivateLayerGuard();
        // The backend answers 404 for the private layer when asked anonymously.
        const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
            new Response("{}", { status: urlOf(input).includes("/resources/secret") ? 404 : 200 }));
        vi.stubGlobal("fetch", fetchMock);
        const mapStore = useMapStore();
        const removed: string[] = [];
        mapStore.map = {
            getLayer: () => ({}),
            removeLayer: (id: string) => removed.push(id),
            getSource: () => ({}),
            removeSource: (id: string) => removed.push(`source:${id}`),
        };
        mapStore.layersOnMap = [
            catalogLayer("private", "secret"),
            catalogLayer("public", "rain"),
            catalogLayer("before-login", "secret", { addedWhileSignedIn: undefined }),
        ];

        notify("logout");

        await vi.waitFor(() => expect(removed).toEqual(["private", "source:private"]));
        expect(mapStore.layersOnMap.map((layer) => layer.id)).toEqual(["public", "before-login"]);
        expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ severity: "info" }));
    });

    test("signing in changes nothing on the map", async () => {
        const notify = captureSessionListeners();
        installPrivateLayerGuard();
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const mapStore = useMapStore();
        mapStore.layersOnMap = [catalogLayer("a", "rain")];

        notify("login");
        await Promise.resolve();

        expect(fetchMock).not.toHaveBeenCalled();
        expect(mapStore.layersOnMap).toHaveLength(1);
    });

    test("event and story lists reload for the anonymous visitor with the same filters", async () => {
        const notify = captureSessionListeners();
        const urls: string[] = [];
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            urls.push(urlOf(input));
            return new Response(JSON.stringify({ results: [], next: null, previous: null }), { status: 200 });
        }));
        const events = useEventsStore();
        const stories = useGeostoryStore();
        events.setFilters({ event_type_id: "workshop" });
        await events.loadEvents();
        events.events = [{ id: "private-event" }] as never;
        stories.stories = [{ id: "private-story" }] as never;
        urls.length = 0;

        notify("logout");

        // Private entries are gone at once; the lists reload with the user's filter.
        expect(events.events).toEqual([]);
        expect(stories.stories).toEqual([]);
        expect(events.filters).toEqual({ event_type_id: "workshop" });
        await vi.waitFor(() => expect(urls.some((url) => url.includes("event_type_id=workshop"))).toBe(true));
        expect(urls.some((url) => url.includes("/stories/"))).toBe(true);
    });

    test("runs started while signed in are not remembered on the device", () => {
        vi.spyOn(authSession.status, "value", "get").mockReturnValue("authenticated");

        rememberRun({ id: "private-run", modelId: "m1", title: "Org scenario", startedAt: "2026-11-10T12:00:00Z" });

        expect(myRuns()).toEqual([]);
    });
});
