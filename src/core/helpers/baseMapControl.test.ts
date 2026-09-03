import { describe, expect, test, vi } from "vitest";
import {
    type LayerSpecification,
    type Map as MapLibreMap,
    type SourceSpecification,
} from "maplibre-gl";
import { BaseMapControl, type BasemapOption } from "./baseMapControl";

function createMapMock(): MapLibreMap {
    const sources = new Map<string, SourceSpecification>();
    const layers: LayerSpecification[] = [];
    return {
        loaded: () => true,
        addSource: (id: string, source: SourceSpecification) => sources.set(id, source),
        getSource: (id: string) => sources.get(id),
        removeSource: (id: string) => sources.delete(id),
        addLayer: (layer: LayerSpecification) => layers.push(layer),
        getLayer: (id: string) => layers.find((layer) => layer.id === id),
        removeLayer: (id: string) => {
            const index = layers.findIndex((layer) => layer.id === id);
            if (index >= 0) layers.splice(index, 1);
        },
        setLayoutProperty: (id: string, property: string, value: unknown) => {
            const layer = layers.find((candidate) => candidate.id === id);
            if (layer !== undefined) {
                layer.layout = {
                    ...(layer.layout ?? {}),
                    [property]: value,
                } as LayerSpecification["layout"];
            }
        },
        getSprite: () => [],
        off: vi.fn(),
    } as unknown as MapLibreMap;
}

describe("BaseMapControl load feedback", () => {
    test("reports a user-selected basemap that cannot be loaded", async () => {
        const satellite: BasemapOption = {
            kind: "raster",
            id: "satellite",
            title: "Satellite",
            source: {
                type: "raster",
                tiles: ["https://tiles.example.test/{z}/{x}/{y}.jpg"],
            },
        };
        const unavailable: BasemapOption = {
            kind: "vector",
            id: "inHouse",
            title: "inHouse",
            styleUrl: "https://maps.example.test/style.json",
        };
        const onBasemapLoadError = vi.fn();
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        const control = new BaseMapControl({
            maps: [satellite, unavailable],
            initialBasemap: satellite.id,
            fetchStyle: async () => { throw new Error("Forbidden"); },
            onBasemapLoadError,
        });

        const container = control.onAdd(createMapMock());
        await vi.waitFor(() => {
            expect(container.querySelector<HTMLElement>("[data-id='satellite']")?.classList)
                .toContain("active");
            expect(consoleError).toHaveBeenCalled();
        });
        container.querySelector<HTMLElement>("[data-id='inHouse']")?.click();

        await vi.waitFor(() => {
            expect(onBasemapLoadError).toHaveBeenCalledOnce();
        });
        expect(onBasemapLoadError).toHaveBeenCalledWith(unavailable);
        expect(container.querySelector<HTMLElement>("[data-id='satellite']")?.classList)
            .toContain("active");
        consoleError.mockRestore();
    });

    test("reports a basemap whose sprite cannot be loaded", async () => {
        const satellite: BasemapOption = {
            kind: "raster",
            id: "satellite",
            title: "Satellite",
            source: {
                type: "raster",
                tiles: ["https://tiles.example.test/{z}/{x}/{y}.jpg"],
            },
        };
        const iconic: BasemapOption = {
            kind: "vector",
            id: "iconic",
            title: "Iconic",
            styleUrl: "https://maps.example.test/iconic/style.json",
        };
        const onBasemapLoadError = vi.fn();
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        const control = new BaseMapControl({
            maps: [satellite, iconic],
            initialBasemap: satellite.id,
            fetchStyle: async () => ({
                version: 8,
                sprite: "https://maps.example.test/iconic/sprite",
                sources: {},
                layers: [],
            }),
            validateSprite: async () => {
                throw new Error("sprite 404");
            },
            onBasemapLoadError,
        });

        const container = control.onAdd(createMapMock());
        await vi.waitFor(() => {
            expect(container.querySelector<HTMLElement>("[data-id='satellite']")?.classList)
                .toContain("active");
        });
        container.querySelector<HTMLElement>("[data-id='iconic']")?.click();

        await vi.waitFor(() => {
            expect(onBasemapLoadError).toHaveBeenCalledOnce();
        });
        expect(onBasemapLoadError).toHaveBeenCalledWith(iconic);
        expect(container.querySelector<HTMLElement>("[data-id='satellite']")?.classList)
            .toContain("active");
        consoleError.mockRestore();
    });
});
