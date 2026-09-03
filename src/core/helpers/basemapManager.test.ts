import { describe, expect, test, vi } from "vitest";
import {
    type LayerSpecification,
    type Map as MapLibreMap,
    type SourceSpecification,
    type StyleSpecification,
} from "maplibre-gl";
import { BasemapManager, type BasemapOption } from "./basemapManager";

function createMapMock(initialSprites: Array<{ id: string; url: string }> = []): {
    map: MapLibreMap;
    layers: LayerSpecification[];
    sources: Map<string, SourceSpecification>;
    setStyle: ReturnType<typeof vi.fn>;
    addSprite: ReturnType<typeof vi.fn>;
    removeSprite: ReturnType<typeof vi.fn>;
} {
    const sources = new Map<string, SourceSpecification>();
    const layers: LayerSpecification[] = [{
        id: "terrain-hillshade",
        type: "raster",
        source: "terrain-hillshade",
    }];
    const sprites = new Map(initialSprites.map(({ id, url }) => [id, url]));
    const setStyle = vi.fn();
    const addSprite = vi.fn((id: string, url: string) => sprites.set(id, url));
    const removeSprite = vi.fn((id: string) => sprites.delete(id));
    const map = {
        addSource: (id: string, specification: SourceSpecification) => sources.set(id, specification),
        getSource: (id: string) => sources.get(id),
        removeSource: (id: string) => sources.delete(id),
        addLayer: (specification: LayerSpecification, beforeId?: string) => {
            const beforeIndex = beforeId === undefined
                ? -1
                : layers.findIndex(({ id }) => id === beforeId);
            if (beforeId !== undefined && beforeIndex === -1) throw new Error("missing anchor");
            if (beforeIndex === -1) layers.push(specification);
            else layers.splice(beforeIndex, 0, specification);
        },
        getLayer: (id: string) => layers.find((layer) => layer.id === id),
        getStyle: () => ({ version: 8, sources: {}, layers }),
        moveLayer: (id: string, beforeId?: string) => {
            const currentIndex = layers.findIndex((layer) => layer.id === id);
            if (currentIndex === -1) throw new Error(`missing layer ${id}`);
            const [layer] = layers.splice(currentIndex, 1);
            const beforeIndex = beforeId === undefined
                ? -1
                : layers.findIndex((candidate) => candidate.id === beforeId);
            if (beforeId !== undefined && beforeIndex === -1) throw new Error("missing anchor");
            if (beforeIndex === -1) layers.push(layer);
            else layers.splice(beforeIndex, 0, layer);
        },
        removeLayer: (id: string) => {
            const index = layers.findIndex((layer) => layer.id === id);
            if (index >= 0) layers.splice(index, 1);
        },
        setLayoutProperty: (id: string, name: string, value: unknown) => {
            const layer = layers.find((candidate) => candidate.id === id);
            if (layer === undefined) throw new Error(`missing layer ${id}`);
            layer.layout = { ...(layer.layout ?? {}), [name]: value } as LayerSpecification["layout"];
        },
        addSprite,
        getSprite: () => [...sprites].map(([id, url]) => ({ id, url })),
        removeSprite,
        setStyle,
    } as unknown as MapLibreMap;
    return { map, layers, sources, setStyle, addSprite, removeSprite };
}

const streetStyle: StyleSpecification = {
    version: 8,
    sprite: "../shared/sprite",
    sources: {
        streets: { type: "vector", tiles: ["https://tiles.example.test/{z}/{x}/{y}.pbf"] },
    },
    layers: [
        { id: "land", type: "fill", source: "streets" },
        {
            id: "optional-labels",
            type: "symbol",
            source: "streets",
            layout: { visibility: "none", "text-field": ["get", "name"] },
        },
    ],
};

const definitions: BasemapOption[] = [
    {
        kind: "vector",
        id: "streets",
        title: "Streets",
        styleUrl: "https://maps.example.test/streets/style.json",
    },
    {
        kind: "raster",
        id: "satellite",
        title: "Satellite",
        source: {
            type: "raster",
            tiles: ["https://tiles.example.test/{z}/{x}/{y}.jpg"],
        },
    },
    {
        kind: "vector",
        id: "streets-night",
        title: "Streets Night",
        styleUrl: "https://maps.example.test/night/style.json",
    },
    {
        kind: "vector",
        id: "broken",
        title: "Broken",
        styleUrl: "https://maps.example.test/broken/style.json",
    },
];

describe("BasemapManager", () => {
    test("switches complete vector and raster bundles without replacing the style", async () => {
        const { map, layers, setStyle } = createMapMock();
        const fetchStyle = vi.fn(async (url: string) => {
            if (url.includes("broken")) throw new Error("network error");
            return streetStyle;
        });
        const manager = new BasemapManager(map, definitions, {
            terrainOverlayLayerId: "terrain-hillshade",
            fetchStyle,
            validateSprite: async () => {},
        });

        await manager.activate("streets");

        expect(manager.getActiveId()).toBe("streets");
        expect(layers.map(({ id }) => id)).toEqual([
            "basemap:streets:layer:0:land",
            "terrain-hillshade",
            "basemap:streets:layer:1:optional-labels",
        ]);
        expect(layers.find(({ id }) => id === "basemap:streets:layer:0:land")?.layout?.visibility)
            .toBe("visible");
        expect(layers.find(({ id }) => id === "basemap:streets:layer:1:optional-labels")?.layout?.visibility)
            .toBe("none");

        layers.push({ id: "application-data", type: "circle", source: "application-data" });
        await manager.activate("satellite");

        expect(manager.getActiveId()).toBe("satellite");
        expect(layers.find(({ id }) => id === "basemap:streets:layer:0:land")?.layout?.visibility)
            .toBe("none");
        expect(layers.find(({ id }) => id === "basemap:satellite:layer:0:raster")?.layout?.visibility)
            .toBe("visible");
        const satelliteIndex = layers.findIndex(({ id }) => id === "basemap:satellite:layer:0:raster");
        const hillshadeIndex = layers.findIndex(({ id }) => id === "terrain-hillshade");
        const applicationDataIndex = layers.findIndex(({ id }) => id === "application-data");
        expect(satelliteIndex).toBeLessThan(hillshadeIndex);
        expect(hillshadeIndex).toBeLessThan(applicationDataIndex);
        expect(setStyle).not.toHaveBeenCalled();
    });

    test("keeps the current basemap active when another basemap cannot load", async () => {
        const { map, layers } = createMapMock();
        const manager = new BasemapManager(map, definitions, {
            terrainOverlayLayerId: "terrain-hillshade",
            fetchStyle: async (url) => {
                if (url.includes("broken")) throw new Error("network error");
                return streetStyle;
            },
            validateSprite: async () => {},
        });
        await manager.activate("satellite");

        await expect(manager.activate("broken")).rejects.toThrow("network error");

        expect(manager.getActiveId()).toBe("satellite");
        expect(layers.find(({ id }) => id === "basemap:satellite:layer:0:raster")?.layout?.visibility)
            .toBe("visible");
    });

    test("shares one registered sprite when basemaps use the same sprite URL", async () => {
        const { map, addSprite, removeSprite } = createMapMock();
        const manager = new BasemapManager(map, definitions, {
            terrainOverlayLayerId: "terrain-hillshade",
            fetchStyle: async () => streetStyle,
            validateSprite: async () => {},
        });

        await manager.preload("streets");
        await manager.preload("streets-night");

        expect(addSprite).toHaveBeenCalledTimes(1);
        expect(addSprite).toHaveBeenCalledWith(
            "tosca-basemap-sprite-0",
            "https://maps.example.test/shared/sprite"
        );

        manager.destroy();
        expect(removeSprite).toHaveBeenCalledTimes(1);
        expect(removeSprite).toHaveBeenCalledWith("tosca-basemap-sprite-0");
    });

    test("registers its own sprite instead of adopting one another subsystem already added", async () => {
        // A basemap must never depend on a sprite it doesn't own: the owning
        // subsystem could remove it independently (its own refcount reaching
        // zero) with no way to notify the basemap manager, silently breaking
        // the active basemap's icons. So a URL match against `map.getSprite()`
        // must NOT be treated as reusable — the manager always registers and
        // owns its own runtime sprite.
        const sharedUrl = "https://maps.example.test/shared/sprite";
        const { map, addSprite, removeSprite } = createMapMock([
            { id: "catalog-sprite", url: sharedUrl },
        ]);
        const manager = new BasemapManager(map, definitions, {
            fetchStyle: async () => streetStyle,
            validateSprite: async () => {},
        });

        await manager.preload("streets");

        expect(addSprite).toHaveBeenCalledTimes(1);
        expect(addSprite).toHaveBeenCalledWith("tosca-basemap-sprite-0", sharedUrl);

        manager.destroy();
        expect(removeSprite).toHaveBeenCalledWith("tosca-basemap-sprite-0");
        expect(removeSprite).not.toHaveBeenCalledWith("catalog-sprite");
    });

    test("rejects the basemap when its sprite cannot be loaded, without installing it", async () => {
        const { map, layers, addSprite } = createMapMock();
        const manager = new BasemapManager(map, definitions, {
            terrainOverlayLayerId: "terrain-hillshade",
            fetchStyle: async () => streetStyle,
            validateSprite: async () => {
                throw new Error("sprite 404");
            },
        });

        await expect(manager.activate("streets")).rejects.toThrow("sprite 404");

        expect(manager.getActiveId()).toBeUndefined();
        expect(addSprite).not.toHaveBeenCalled();
        expect(layers.some(({ id }) => id.startsWith("basemap:streets:"))).toBe(false);
    });

    test("the latest selection wins when an earlier style request is still loading", async () => {
        const { map, layers } = createMapMock();
        let resolveStyle: ((style: StyleSpecification) => void) | undefined;
        const pendingStyle = new Promise<StyleSpecification>((resolve) => {
            resolveStyle = resolve;
        });
        const manager = new BasemapManager(map, definitions, {
            terrainOverlayLayerId: "terrain-hillshade",
            fetchStyle: async () => await pendingStyle,
            validateSprite: async () => {},
        });
        await manager.activate("satellite");

        const vectorActivation = manager.activate("streets");
        await manager.activate("satellite");
        resolveStyle?.(streetStyle);
        await vectorActivation;

        expect(manager.getActiveId()).toBe("satellite");
        expect(layers.find(({ id }) => id === "basemap:satellite:layer:0:raster")?.layout?.visibility)
            .toBe("visible");
        expect(layers.find(({ id }) => id === "basemap:streets:layer:0:land")?.layout?.visibility)
            .toBe("none");
    });
});
