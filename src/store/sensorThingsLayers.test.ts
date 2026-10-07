import { createPinia, setActivePinia } from "pinia";
import { reactive } from "vue";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { LayerObjectWithAttributes } from "./map";

const fakes = vi.hoisted(() => ({
    getLayerDatastreams: vi.fn(),
    map: undefined as unknown,
}));
vi.mock("./externalDataSources", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./externalDataSources")>()),
    useExternalDataSourcesStore: () => ({
        getAllSensorThingsLayerDatastreams: fakes.getLayerDatastreams,
    }),
}));
vi.mock("./map", () => ({ useMapStore: () => fakes.map }));
vi.mock("./sensorThingsLive", () => ({ useSensorThingsLiveStore: vi.fn(() => ({})) }));

const { useSensorThingsLayersStore } = await import("./sensorThingsLayers");

describe("SensorThings category layers", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        fakes.getLayerDatastreams.mockReset();
        const layersOnMap = reactive<LayerObjectWithAttributes[]>([]);
        const sources = new Set<string>();
        fakes.map = {
            layersOnMap,
            map: {
                getSource: (id: string) => sources.has(id) ? {} : undefined,
                fitBounds: vi.fn(),
            },
            addMapDataSource: vi.fn(async ({ identifier }: { identifier: string }) => {
                sources.add(identifier);
            }),
            addMapLayer: vi.fn(async (params: { identifier: string, layerType: string, displayName: string }) => {
                layersOnMap.push({
                    id: params.identifier,
                    source: params.identifier,
                    sourceType: "geojson",
                    type: params.layerType as "circle",
                    displayName: params.displayName,
                });
            }),
            deleteMapDataSource: vi.fn(),
            geometryConversion: vi.fn(() => "circle"),
            setStandaloneLayerPaintColor: vi.fn(),
        };
    });

    test("adds a styled layer with category totals and live-update source metadata", async () => {
        fakes.getLayerDatastreams.mockResolvedValue([
            {
                id: 7,
                name: "Charging point",
                description: "",
                geometry: { type: "Point", coordinates: [10, 53] },
                latestObservation: { phenomenonTime: "2026-10-07T08:00:00Z", result: "AVAILABLE" },
            },
        ]);
        const store = useSensorThingsLayersStore();
        const source = {
            id: "hamburg-sta",
            type: "sensorthings" as const,
            title: "Hamburg SensorThings",
            url: "https://iot.example.test/v1.1",
            mqttUrl: "wss://iot.example.test/mqtt",
            attribution: "Hamburg",
            capabilities: {
                show_uncurated: false,
                full_load: false,
                live_updates: true,
                server_filters: false,
                max_features: null,
            },
        };
        const item = {
            id: "ev-charging",
            title: "EV charging stations",
            description: "",
            service: source.id,
            service_type: "sensorthings" as const,
            sensorthings: {
                service_name: "HH_STA_E-Ladestationen",
                layer_name: "Status_E-Ladepunkt",
            },
            style: { color: "#0288d1" },
            loading: { min_zoom: null },
            availability: { state: "OK" as const, feature_count: 2455, checked_at: null },
        };

        const record = await store.addCategoryItemLayer(item, source);

        expect(fakes.getLayerDatastreams).toHaveBeenCalledWith(
            source,
            "HH_STA_E-Ladestationen",
            "Status_E-Ladepunkt"
        );
        expect(record.id).toBe("external-sta--hamburg-sta--HH_STA_E-Ladestationen--Status_E-Ladepunkt");
        expect(record.displayName).toBe("EV charging stations");
        expect(record.layerData?.features).toHaveLength(1);
        expect(record.externalSource).toMatchObject({
            type: "sensorthings",
            sourceId: "hamburg-sta",
            totalCount: 2455,
        });
        const map = fakes.map as { setStandaloneLayerPaintColor: ReturnType<typeof vi.fn> };
        expect(map.setStandaloneLayerPaintColor).toHaveBeenCalledWith(
            record.id,
            "circle-color",
            "#0288d1"
        );
    });

    test("uses the shared service/layer path for uncurated datasets", async () => {
        fakes.getLayerDatastreams.mockResolvedValue([{
            id: 9,
            name: "Counter",
            description: "",
            geometry: { type: "Point", coordinates: [10, 53] },
        }]);
        const source = {
            id: "hamburg-sta",
            type: "sensorthings" as const,
            title: "Hamburg SensorThings",
            url: "https://iot.example.test/v1.1",
            attribution: "Hamburg",
            capabilities: {
                show_uncurated: true,
                full_load: false,
                live_updates: false,
                server_filters: false,
                max_features: null,
            },
        };
        const store = useSensorThingsLayersStore();

        const record = await store.addServiceLayer({
            source,
            serviceName: "Traffic",
            layerName: "Volume",
            displayName: "Volume",
            totalCount: 42,
        });

        expect(fakes.getLayerDatastreams).toHaveBeenCalledWith(source, "Traffic", "Volume");
        expect(record.id).toBe("external-sta--hamburg-sta--Traffic--Volume");
        expect(record.displayName).toBe("Volume");
        expect(record.externalSource?.totalCount).toBe(42);
        const map = fakes.map as { setStandaloneLayerPaintColor: ReturnType<typeof vi.fn> };
        expect(map.setStandaloneLayerPaintColor).not.toHaveBeenCalled();
    });
});
