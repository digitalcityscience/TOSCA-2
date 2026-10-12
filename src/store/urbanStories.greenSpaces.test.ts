import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick } from "vue";
import { resetGreenSpacesDataCache } from "@helpers/greenSpacesData";
import { fakeCameraMap } from "../components/UrbanStories/__fixtures__/runHarness";
import { PLAYGROUND_EXAMPLES } from "../config/urbanStories/greenSpacesLocations";
import { useGreenSpacesStore } from "./urbanStories.greenSpaces";
import { useMapStore } from "./map";
import { useUrbanStoriesStore } from "./urbanStories";

vi.mock("@helpers/catalogLayerLoader", () => ({
    resolveCatalogLayer: vi.fn(), loadCatalogLayerStyling: vi.fn(), addCatalogVectorLayer: vi.fn(),
}));
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));

/** The fake camera map plus the little a GeoJSON overlay needs. */
function overlayMap() {
    const base = fakeCameraMap();
    const layers = new Set<string>();
    const sources = new Set<string>();
    return {
        ...base,
        overlayLayers: layers,
        overlaySources: sources,
        getCanvas: () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn(), style: {}, getBoundingClientRect: () => ({ left: 0 }) }),
        setPadding: vi.fn(),
        addSource: (id: string) => { sources.add(id); },
        getSource: (id: string) => (sources.has(id) ? { setData: vi.fn() } : undefined),
        removeSource: (id: string) => { sources.delete(id); },
        addLayer: (layer: { id: string }) => { layers.add(layer.id); },
        getLayer: (id: string) => (layers.has(id) ? { type: "fill" } : undefined),
        removeLayer: (id: string) => { layers.delete(id); },
        moveLayer: vi.fn(),
        hasImage: () => true,
        queryRenderedFeatures: () => [],
    };
}

const feature = (properties: Record<string, unknown>) => ({
    properties, geometry: { type: "Polygon", coordinates: [[[9.82, 53.55], [9.83, 53.55], [9.83, 53.56], [9.82, 53.55]]] },
});

let map: ReturnType<typeof overlayMap>;

function fetchStub(): ReturnType<typeof vi.fn> {
    const fn = vi.fn(async (input: string | URL) => {
        const url = new URL(input);
        const filter = url.searchParams.get("cql_filter") ?? "";
        const id = /gml_id='([^']+)'/.exec(filter)?.[1];
        const features = id === undefined
            ? []
            : [{ ...feature({ gml_id: id, is_residential: true, walk_min_dgp_park: id.endsWith("xKE") ? 4.5 : 3.6, walk_min_dgp_playground: id.endsWith("xKE") ? 2.4 : 17.2, dgp_park_status: "ok", dgp_playground_status: "ok", building_height_m: 8 }) }];
        return { ok: true, status: 200, json: async () => ({ features }) };
    });
    vi.stubGlobal("fetch", fn);
    return fn;
}

function setup() {
    setActivePinia(createPinia());
    resetGreenSpacesDataCache();
    map = overlayMap();
    useMapStore().map = map as never;
    const urban = useUrbanStoriesStore();
    const green = useGreenSpacesStore();
    return { urban, green };
}

/** Put the run on a scene without a backend: the store only reads `runState`, `runningStoryKey` and the chapter index. */
async function showScene(urban: ReturnType<typeof useUrbanStoriesStore>, index: number): Promise<void> {
    urban.runningStoryKey = "green-spaces";
    urban.runState = "running";
    urban.chapterIndex = index;
    await nextTick();
    await nextTick();
}

beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    fetchStub();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("Green Spaces scene state", () => {
    test("the scene is the active chapter of a running story, and only then", async () => {
        const { urban, green } = setup();
        expect(green.sceneKey).toBeUndefined();
        await showScene(urban, 2);
        expect(green.sceneKey).toBe("park-nearby-how-far");
        expect(green.sceneNumber).toBe(3);
        urban.runState = "idle";
        await nextTick();
        expect(green.sceneKey).toBeUndefined();
        // Another story running never counts.
        urban.runningStoryKey = "fifteen-minute";
        urban.runState = "running";
        await nextTick();
        expect(green.running).toBe(false);
    });

    test("each scene starts from its own state: the previous selection and view do not survive", async () => {
        const { urban, green } = setup();
        await showScene(urban, 4);
        green.setCompare("playground");
        await green.selectExample(PLAYGROUND_EXAMPLES[0]);
        expect(green.selection?.profile.id).toBe(PLAYGROUND_EXAMPLES[0].id);
        expect(green.plan.buildings).toBe("playground");

        await showScene(urban, 5);
        green.setTheme("park-access");
        await showScene(urban, 4);
        expect(green.selection).toBeUndefined();
        expect(green.compare).toBe("park");
        expect(green.plan.buildings).toBe("park");
        await showScene(urban, 5);
        expect(green.theme).toBe("classes");
    });

    test("park and playground are switched independently of each other and keep the same map context", async () => {
        const { urban, green } = setup();
        await showScene(urban, 4);
        await green.selectExample(PLAYGROUND_EXAMPLES[0]);
        const before = green.selection;
        green.setCompare("playground");
        expect(green.plan).toMatchObject({ buildings: "playground", admin: "playground", areas: "access-both" });
        green.setCompare("park");
        expect(green.plan).toMatchObject({ buildings: "park", admin: "park", areas: "access-both" });
        // The selected building stays selected when the metric changes.
        expect(green.selection).toBe(before);
        expect(green.selection?.profile.park.minutes).toBe(4.5);
        expect(green.selection?.profile.playground.minutes).toBe(2.4);
    });

    test("selecting an example loads the building by its published id and marks it on the map", async () => {
        const { urban, green } = setup();
        await showScene(urban, 3);
        await green.selectExample(PLAYGROUND_EXAMPLES[1], true);
        expect(green.selection?.profile.id).toBe(PLAYGROUND_EXAMPLES[1].id);
        expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: PLAYGROUND_EXAMPLES[1].center, pitch: 55 }));
        expect([...map.overlayLayers]).toEqual(expect.arrayContaining(["fm-selection-fill", "gs-markers-circle"]));
    });

    test("the explore themes pick the look of the map and the reset returns to the overview", async () => {
        const { urban, green } = setup();
        await showScene(urban, 5);
        green.setTheme("details");
        expect(green.plan.features).toBe("all");
        // Detailed objects exist from zoom 14: the story brings the reader to the example park.
        expect(map.flyTo).toHaveBeenCalled();
        green.setTheme("coverage");
        green.setCoverage("large-green");
        expect(green.adminMeasure).toBe("large-green");
        green.resetOverview();
        expect(green.theme).toBe("classes");
        expect(green.selection).toBeUndefined();
        // With reduced motion the camera jumps to the overview instead of flying.
        expect(map.jumpTo).toHaveBeenCalledWith(expect.objectContaining({ center: [10.03, 53.565] }));
    });

    test("leaving the story removes every overlay it drew, and a repeated run starts clean", async () => {
        const { urban, green } = setup();
        await showScene(urban, 3);
        await green.selectExample(PLAYGROUND_EXAMPLES[0]);
        await green.sync();
        expect(map.overlayLayers.size).toBeGreaterThan(0);

        urban.runState = "idle";
        await nextTick();
        await green.sync();
        expect(map.overlayLayers.size).toBe(0);
        expect(map.overlaySources.size).toBe(0);
        expect(map.setPadding).toHaveBeenLastCalledWith({ left: 0, right: 0, top: 0, bottom: 0 });

        await showScene(urban, 0);
        await green.sync();
        expect(green.selection).toBeUndefined();
        expect(map.overlayLayers.size).toBeGreaterThan(0);
        urban.runState = "idle";
        await nextTick();
        await green.sync();
        expect(map.overlayLayers.size).toBe(0);
    });
});
