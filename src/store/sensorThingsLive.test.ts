import { createPinia, setActivePinia } from "pinia";
import { nextTick, reactive } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { LayerObjectWithAttributes } from "./map";

type Handler = (...args: unknown[]) => void;

const mqttMock = vi.hoisted(() => {
    const clients: Array<{
        url: string
        handlers: Record<string, Handler>
        subscribe: ReturnType<typeof vi.fn>
        unsubscribe: ReturnType<typeof vi.fn>
        end: ReturnType<typeof vi.fn>
        emit: (event: string, ...args: unknown[]) => void
    }> = [];
    const connect = vi.fn((url: string) => {
        const handlers: Record<string, Handler> = {};
        const client = {
            url,
            handlers,
            subscribe: vi.fn(),
            unsubscribe: vi.fn(),
            end: vi.fn(),
            on: (event: string, handler: Handler) => {
                handlers[event] = handler;
                return client;
            },
            emit: (event: string, ...args: unknown[]) => handlers[event]?.(...args),
        };
        clients.push(client);
        return client;
    });
    return { clients, connect };
});
vi.mock("mqtt", () => ({ default: { connect: mqttMock.connect } }));

const fakes = vi.hoisted(() => ({ map: undefined as unknown, sources: [] as unknown[] }));
vi.mock("./map", () => ({ useMapStore: () => fakes.map }));
vi.mock("./externalDataSources", () => ({
    useExternalDataSourcesStore: () => ({
        sources: fakes.sources,
        getSensorThingsBaseUrl: async () => "https://iot.example.test/v1.1",
    }),
}));

const { datastreamIdFromTopic, datastreamTopic, useSensorThingsLiveStore } = await import("./sensorThingsLive");

function streamFeature(id: number): GeoJSON.Feature {
    return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [10, 53] },
        properties: { datastream_id: id, latest_value: "AVAILABLE", observed_at: "2026-10-01T10:00:00Z" },
    };
}

function staLayer(id: string, streams: number[]): LayerObjectWithAttributes {
    return {
        id,
        source: id,
        sourceType: "geojson",
        type: "circle",
        layerData: { type: "FeatureCollection", features: streams.map(streamFeature) },
        externalSource: { type: "sensorthings", sourceId: "sta", sourceTitle: "STA" },
    };
}

async function settle(): Promise<void> {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
}

describe("SensorThings MQTT topics", () => {
    test("builds and parses per-datastream topics", () => {
        expect(datastreamTopic("v1.1", 18703)).toBe("v1.1/Datastreams(18703)/Observations");
        expect(datastreamTopic("v1.1", "abc")).toBe("v1.1/Datastreams('abc')/Observations");
        expect(datastreamIdFromTopic("v1.1/Datastreams(18703)/Observations")).toBe("18703");
        expect(datastreamIdFromTopic("v1.1/Datastreams('it''s')/Observations")).toBe("it's");
        expect(datastreamIdFromTopic("v1.1/Things(1)")).toBeUndefined();
    });
});

describe("SensorThings live updates", () => {
    let setData: ReturnType<typeof vi.fn>;
    let layersOnMap: LayerObjectWithAttributes[];

    beforeEach(() => {
        setActivePinia(createPinia());
        mqttMock.clients.length = 0;
        mqttMock.connect.mockClear();
        setData = vi.fn();
        layersOnMap = reactive<LayerObjectWithAttributes[]>([]);
        fakes.map = {
            layersOnMap,
            map: { getLayer: () => ({}), getSource: () => ({ setData }) },
        };
        fakes.sources = [{ id: "sta", type: "sensorthings", title: "STA", url: "https://iot.example.test", mqttUrl: "wss://iot.example.test/mqtt" }];
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test("subscribes per datastream on the map and follows layer changes", async () => {
        const live = useSensorThingsLiveStore();
        expect(mqttMock.connect).not.toHaveBeenCalled();

        layersOnMap.push(staLayer("chargers", [1, 2]));
        await settle();
        const client = mqttMock.clients[0];
        expect(client.url).toBe("wss://iot.example.test/mqtt");
        expect(client.subscribe).toHaveBeenCalledWith(
            ["v1.1/Datastreams(1)/Observations", "v1.1/Datastreams(2)/Observations"],
            { qos: 0 }
        );
        expect(live.subscribedCount.sta).toBe(2);

        layersOnMap[0].layerData = { type: "FeatureCollection", features: [streamFeature(2), streamFeature(3)] };
        await settle();
        expect(client.subscribe).toHaveBeenLastCalledWith(["v1.1/Datastreams(3)/Observations"], { qos: 0 });
        expect(client.unsubscribe).toHaveBeenCalledWith(["v1.1/Datastreams(1)/Observations"]);

        layersOnMap.splice(0, 1);
        await settle();
        expect(client.end).toHaveBeenCalled();
        expect(live.status.sta).toBeUndefined();
    });

    test("updates latest values and map features from messages, batched", async () => {
        const live = useSensorThingsLiveStore();
        layersOnMap.push(staLayer("chargers", [1, 2]));
        await settle();
        const client = mqttMock.clients[0];
        client.emit("connect");
        expect(live.status.sta).toBe("connected");

        vi.useFakeTimers();
        const message = (id: number, result: string, time: string): void => client.emit(
            "message",
            `v1.1/Datastreams(${id})/Observations`,
            new TextEncoder().encode(JSON.stringify({ phenomenonTime: time, result }))
        );
        message(1, "CHARGING", "2026-10-01T11:00:00Z");
        message(1, "FINISHING", "2026-10-01T11:01:00Z");
        expect(live.latestFor("sta", 1)).toEqual({ phenomenonTime: "2026-10-01T11:01:00Z", result: "FINISHING" });
        expect(setData).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1000);
        expect(setData).toHaveBeenCalledTimes(1);
        const features = layersOnMap[0].layerData!.features;
        expect(features[0].properties).toMatchObject({ latest_value: "FINISHING", observed_at: "2026-10-01T11:01:00Z" });
        expect(features[1].properties).toMatchObject({ latest_value: "AVAILABLE" });
    });

    test("does not connect sources without an MQTT endpoint", async () => {
        fakes.sources = [{ id: "sta", type: "sensorthings", title: "STA", url: "https://iot.example.test" }];
        const live = useSensorThingsLiveStore();
        layersOnMap.push(staLayer("chargers", [1]));
        await settle();

        expect(mqttMock.connect).not.toHaveBeenCalled();
        expect(live.isLiveEnabled("sta")).toBe(false);
    });
});
