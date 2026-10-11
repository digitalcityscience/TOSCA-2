import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ReplayData } from "@helpers/simulationReplay";
import type { SimulationRunDetail, SimulationTripsOutput, SimulationVectorLayerOutput } from "./geosimulation";
import type { GeoStoryDetail, GeoStorySceneSimulation } from "./geostory";
import { useGeostorySceneStore } from "./geostoryScenes";
import { GEOSTORY_REPLAY_LAYER_ID, useGeostorySceneSimulationStore } from "./geostorySceneSimulation";
import { useMapStore } from "./map";
import scenesDetailFixture from "./__fixtures__/geostory-scenes-detail.json";
import runDetailFixture from "./__fixtures__/geosimulation-run-detail.json";

vi.mock("@helpers/mapStyleBundle", () => ({ validateSpriteUrl: vi.fn(async () => {}) }));
vi.mock("@helpers/toast", () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock("@deck.gl/mapbox", () => ({
    MapboxOverlay: class {
        setProps(): void {}
    },
}));
const loadSimulationReplay = vi.hoisted(() => vi.fn());
vi.mock("@helpers/simulationReplayLoader", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    loadSimulationReplay,
}));

const run = runDetailFixture as unknown as SimulationRunDetail;
const [flow, delay] = run.outputs.filter((output) => output.kind === "vector_layer") as SimulationVectorLayerOutput[];
const trips = run.outputs.find((output) => output.kind === "trips") as SimulationTripsOutput;
const replayData = { timeEnd: 11669, tripCount: 0, attributeNames: [], attributeCodes: [] } as unknown as ReplayData;

function sceneSimulation(overrides: Partial<GeoStorySceneSimulation> = {}): GeoStorySceneSimulation {
    return {
        run: { id: run.id, title: run.title, model: { id: run.model.id, title: run.model.title } },
        time: run.time,
        bounds: run.bounds,
        labels: run.labels,
        map_outputs: [flow],
        replay: { output: trips, start_s: 2400, end_s: 3300, playback_rate: 30, loop: true },
        ...overrides,
    };
}

function story(simulations: Array<GeoStorySceneSimulation | null>): GeoStoryDetail {
    const detail = structuredClone(scenesDetailFixture) as unknown as GeoStoryDetail;
    detail.scenes.forEach((scene, index) => { scene.simulation = simulations[index] ?? null; });
    return detail;
}

function fakeMap() {
    const sources = new Map<string, unknown>();
    const layers = new Map<string, { id: string }>();
    const order: string[] = [];
    return {
        sources,
        order,
        isStyleLoaded: () => true,
        addControl: vi.fn(),
        addSource: (id: string, source: unknown) => sources.set(id, source),
        getSource: (id: string) => sources.get(id),
        removeSource: (id: string) => sources.delete(id),
        addLayer: (layer: { id: string }) => {
            layers.set(layer.id, layer);
            order.push(layer.id);
        },
        getLayer: (id: string) => layers.get(id),
        removeLayer: (id: string) => {
            layers.delete(id);
            order.splice(order.indexOf(id), 1);
        },
        moveLayer: (id: string, beforeId?: string) => {
            order.splice(order.indexOf(id), 1);
            order.splice(beforeId === undefined ? order.length : order.indexOf(beforeId), 0, id);
        },
        getStyle: () => ({ layers: order.map((id) => layers.get(id)) }),
        addSprite: vi.fn(),
        removeSprite: vi.fn(),
        flyTo: vi.fn(),
        easeTo: vi.fn(),
        jumpTo: vi.fn(),
        fitBounds: vi.fn(),
    };
}

describe("geostory scene simulations", () => {
    let fake: ReturnType<typeof fakeMap>;

    beforeEach(() => {
        setActivePinia(createPinia());
        vi.stubEnv("VITE_BACKEND_ROOT_URL", "http://localhost:8000");
        vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
        vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
        loadSimulationReplay.mockReset().mockResolvedValue(replayData);
        fake = fakeMap();
        useMapStore().map = fake as never;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function listedIds(): string[] {
        return useMapStore().layersOnMap.filter((layer) => layer.showOnLayerList).map((layer) => layer.id);
    }

    /** Let the simulation's map layers and replay finish (scene switches do not wait for them). */
    async function settle(): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 0));
        await vi.waitFor(() => expect(useGeostorySceneSimulationStore().loading).toBe(false));
    }

    test("draws the scene's map outputs and replay above its catalog layers", async () => {
        const detail = story([sceneSimulation()]);
        await useGeostorySceneStore().openStory(detail);
        await settle();

        const simulation = useGeostorySceneSimulationStore();
        expect(loadSimulationReplay).toHaveBeenCalledWith(trips.url, expect.anything());
        expect(simulation.playWindow).toEqual({ start: 2400, end: 3300, rate: 30, loop: true });
        expect(simulation.time).toBe(2400);
        expect(simulation.playing).toBe(true);
        // layersOnMap is bottom to top: the scene group, then the output, then the replay.
        const listed = listedIds();
        expect(listed).toHaveLength(3);
        expect(listed[1]).toBe(`geosim:${run.id}:${flow.id}:${flow.style[0].id}`);
        expect(listed[2]).toBe(GEOSTORY_REPLAY_LAYER_ID);
        expect(fake.order.at(-1)).toBe(listed[1]);
    });

    test("keeps loaded replay data across scenes on the same run", async () => {
        const detail = story([
            sceneSimulation(),
            sceneSimulation({ map_outputs: [delay], replay: { output: trips, start_s: 5000, end_s: 6000, playback_rate: 60, loop: false } }),
        ]);
        const scenes = useGeostorySceneStore();
        await scenes.openStory(detail);
        await settle();

        await scenes.showScene(detail.scenes[1].id);

        const simulation = useGeostorySceneSimulationStore();
        expect(loadSimulationReplay).toHaveBeenCalledTimes(1);
        expect(simulation.playWindow).toEqual({ start: 5000, end: 6000, rate: 60, loop: false });
        expect(simulation.time).toBe(5000);
        expect(fake.sources.has(`geosim:${run.id}:${flow.id}`)).toBe(false);
        expect(fake.sources.has(`geosim:${run.id}:${delay.id}`)).toBe(true);
        expect(listedIds().at(-1)).toBe(GEOSTORY_REPLAY_LAYER_ID);
    });

    test("removes the simulation when the next scene has none", async () => {
        const detail = story([sceneSimulation(), null]);
        const scenes = useGeostorySceneStore();
        await scenes.openStory(detail);
        await settle();

        await scenes.showScene(detail.scenes[1].id);

        const simulation = useGeostorySceneSimulationStore();
        expect(simulation.simulation).toBeNull();
        expect(simulation.playing).toBe(false);
        expect(listedIds()).toHaveLength(1);
        expect([...fake.sources.keys()].some((id) => id.startsWith("geosim:"))).toBe(false);
    });

    test("starts a returning replay at its window start", async () => {
        const detail = story([sceneSimulation(), null]);
        const scenes = useGeostorySceneStore();
        await scenes.openStory(detail);
        await settle();
        const simulation = useGeostorySceneSimulationStore();
        simulation.time = 3000;

        await scenes.showScene(detail.scenes[1].id);
        await scenes.showScene(detail.scenes[0].id);

        expect(loadSimulationReplay).toHaveBeenCalledTimes(1);
        expect(simulation.time).toBe(2400);
        expect(simulation.playing).toBe(true);
    });

    test("waits paused at the window start with reduced motion", async () => {
        vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
        await useGeostorySceneStore().openStory(story([sceneSimulation()]));
        await settle();

        const simulation = useGeostorySceneSimulationStore();
        expect(simulation.playing).toBe(false);
        expect(simulation.time).toBe(2400);
    });

    test("fits a scene with only a simulation to the run's extent", async () => {
        const detail = story([sceneSimulation({ replay: null })]);
        detail.scenes[0].layers = [];
        detail.scenes[0].render_layers = [];

        await useGeostorySceneStore().openStory(detail);
        await settle();

        const [west, south, east, north] = run.bounds!;
        expect(fake.fitBounds).toHaveBeenCalledWith([[west, south], [east, north]], expect.anything());
        expect(listedIds()).toHaveLength(1);
    });

    test("switches scenes while the map style is still loading", async () => {
        fake.isStyleLoaded = () => false;
        Object.assign(fake, { once: vi.fn(), off: vi.fn() });
        const detail = story([sceneSimulation(), null]);
        const scenes = useGeostorySceneStore();

        await scenes.openStory(detail);
        await scenes.showScene(detail.scenes[1].id);

        expect(scenes.activeSceneId).toBe(detail.scenes[1].id);
        expect([...fake.sources.keys()].some((id) => id.startsWith("geosim:"))).toBe(false);
    });

    test("closing the story removes the simulation", async () => {
        const scenes = useGeostorySceneStore();
        await scenes.openStory(story([sceneSimulation()]));
        await settle();

        await scenes.closeStory({ removeLayers: true });

        expect(listedIds()).toHaveLength(0);
        expect(useGeostorySceneSimulationStore().hasReplay).toBe(false);
    });
});
