import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { type CatalogLayerGroupManifest, type GeoserverRasterTypeLayerDetail } from "./geoserver";
import { createMapRuntimeId, mbStyleLayerOptions, type LayerObjectWithAttributes, useMapStore } from "./map";

const toastAdd = vi.hoisted(() => vi.fn());

vi.mock("@helpers/toast", () => ({
    useToast: () => ({
        add: toastAdd,
    }),
}));

function createLayer(
    id: string,
    options: Partial<LayerObjectWithAttributes> = {}
): LayerObjectWithAttributes {
    return {
        id,
        source: id,
        sourceType: "geojson",
        type: "fill",
        showOnLayerList: true,
        ...options,
    };
}

describe("map layer feedback", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        toastAdd.mockClear();
    });

    test("uses the visible layer name and success format when removing a layer", async () => {
        const removeLayer = vi.fn();
        const mapStore = useMapStore();
        mapStore.map = {
            getLayer: () => ({}),
            removeLayer,
        };
        mapStore.layersOnMap = [createLayer("layer:districts:1", {
            displayName: "Districts",
        })];

        await mapStore.deleteMapLayer("layer:districts:1", true);

        expect(removeLayer).toHaveBeenCalledWith("layer:districts:1");
        expect(toastAdd).toHaveBeenCalledWith({
            severity: "success",
            summary: "Success",
            detail: "Layer Districts removed successfully",
            life: 3000,
        });
    });
});

describe("map store layer reordering", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    test("returns visible reorderable layers from top to bottom", () => {
        const mapStore = useMapStore();
        mapStore.layersOnMap = [
            createLayer("hidden-helper", { showOnLayerList: false }),
            createLayer("raster", { type: "raster" }),
            createLayer("roads"),
            createLayer("live-drawing", {
                showOnLayerList: false,
                keepOnTop: true,
            }),
        ];

        expect(
            mapStore.getReorderableVisibleLayersTopToBottom().map((layer) => layer.id)
        ).toEqual(["roads", "raster"]);
    });

    test("moves only the dragged layer below keep-on-top layers", () => {
        const moveLayer = vi.fn();
        const mapStore = useMapStore();
        mapStore.map = {
            getLayer: () => ({}),
            moveLayer,
        };
        mapStore.layersOnMap = [
            createLayer("hidden-helper", { showOnLayerList: false }),
            createLayer("raster", { type: "raster" }),
            createLayer("roads"),
            createLayer("buildings"),
            createLayer("live-drawing", {
                showOnLayerList: false,
                keepOnTop: true,
            }),
        ];

        mapStore.reorderVisibleMapLayer("raster", 0);

        expect(moveLayer).toHaveBeenCalledTimes(1);
        expect(moveLayer).toHaveBeenCalledWith("raster", "live-drawing");
        expect(mapStore.layersOnMap.map((layer) => layer.id)).toEqual([
            "hidden-helper",
            "roads",
            "buildings",
            "raster",
            "live-drawing",
        ]);
    });

    test("moves a top layer to the bottom of the visible stack with one MapLibre move", () => {
        const moveLayer = vi.fn();
        const mapStore = useMapStore();
        mapStore.map = {
            getLayer: () => ({}),
            moveLayer,
        };
        mapStore.layersOnMap = [
            createLayer("raster", { type: "raster" }),
            createLayer("roads"),
            createLayer("buildings"),
        ];

        mapStore.reorderVisibleMapLayer("buildings", 2);

        expect(moveLayer).toHaveBeenCalledTimes(1);
        expect(moveLayer).toHaveBeenCalledWith("buildings", "raster");
        expect(mapStore.layersOnMap.map((layer) => layer.id)).toEqual([
            "buildings",
            "raster",
            "roads",
        ]);
    });

    test("uses the catalog provider URL for raster WMS tiles", async () => {
        const addSource = vi.fn();
        const source = { type: "raster" };
        const mapStore = useMapStore();
        mapStore.map = {
            addSource,
            getSource: () => source,
        };
        const detail = {
            catalog: {
                provider: {
                    id: "provider-1",
                    name: "Primary GeoServer",
                    base_url: "https://maps.example.test/geoserver",
                },
                workspace_name: "Hamburg",
            },
            coverage: {
                name: "rainfall",
            },
        } as GeoserverRasterTypeLayerDetail;

        await mapStore.addMapDataSource({
            sourceType: "geoserver",
            sourceDataType: "raster",
            sourceProtocol: "wms",
            identifier: "rainfall",
            isFilterLayer: false,
            workspaceName: "Hamburg",
            layer: detail,
        });

        const sourceSpecification = addSource.mock.calls[0][1] as {
            tiles: string[]
        };
        expect(sourceSpecification.tiles[0]).toMatch(
            /^https:\/\/maps\.example\.test\/geoserver\/wms\?/
        );
        expect(sourceSpecification.tiles[0]).toContain("LAYERS=Hamburg%3Arainfall");
    });

    test("adds raster WMTS as 256px PNG tiles", async () => {
        const addSource = vi.fn();
        const source = { type: "raster" };
        const mapStore = useMapStore();
        mapStore.map = {
            addSource,
            getSource: () => source,
        };
        const detail = {
            catalog: {
                provider: {
                    id: "provider-1",
                    name: "Primary GeoServer",
                    base_url: "https://maps.example.test/geoserver",
                },
                workspace_name: "Hamburg",
            },
            coverage: {
                name: "rainfall",
            },
        } as GeoserverRasterTypeLayerDetail;

        await mapStore.addMapDataSource({
            sourceType: "geoserver",
            sourceDataType: "raster",
            sourceProtocol: "wmts",
            identifier: "rainfall",
            isFilterLayer: false,
            workspaceName: "Hamburg",
            layer: detail,
        });

        const sourceSpecification = addSource.mock.calls[0][1] as {
            type: string
            tileSize: number
            tiles: string[]
        };
        expect(sourceSpecification.type).toBe("raster");
        expect(sourceSpecification.tileSize).toBe(256);
        expect(sourceSpecification.tiles[0]).toMatch(
            /^https:\/\/maps\.example\.test\/geoserver\/gwc\/service\/wmts\?/
        );
        expect(sourceSpecification.tiles[0]).toContain("FORMAT=image%2Fpng");
        expect(sourceSpecification.tiles[0]).toContain("TILEMATRIX=EPSG%3A900913%3A{z}");
        expect(sourceSpecification.tiles[0]).toContain("TILECOL={x}");
        expect(sourceSpecification.tiles[0]).toContain("TILEROW={y}");
    });

    test("rejects WMS when a MapLibre vector source is requested", async () => {
        const mapStore = useMapStore();
        mapStore.map = {
            addSource: vi.fn(),
            getSource: vi.fn(),
        };

        await expect(mapStore.addMapDataSource({
            sourceType: "geoserver",
            sourceDataType: "vector",
            sourceProtocol: "wms",
            identifier: "districts",
            isFilterLayer: false,
            workspaceName: "Hamburg",
            layer: {
                featureType: {
                    name: "districts",
                },
            } as never,
        })).rejects.toThrow(
            "WMS cannot provide a MapLibre vector tile source."
        );
    });
});

function groupManifest(): CatalogLayerGroupManifest {
    return {
        id: "group-uuid",
        name: "mobility",
        title: "Mobility network",
        description: "",
        composition: "VECTOR",
        legend: null,
        warnings: [],
        workspace: { id: "workspace-uuid", name: "Hamburg" },
        provider: {
            id: "provider-uuid",
            name: "GeoServer",
            base_url: "https://maps.example.test/geoserver",
        },
        members: [
            {
                id: "roads-member", layer_id: "roads-uuid", name: "roads", title: "Roads",
                layer_title: "Roads data", source_alias: "roads-pass", source_key: "roads", order: 0, data_type: "VECTOR", geometry_type: "LineString",
                style_assignment: { id: "roads-assignment", style_id: "style-uuid", style_layer_ids: ["roads-line"] },
                resource_href: "/roads",
            },
            {
                id: "stops-member", layer_id: "stops-uuid", name: "stops", title: "Stops",
                source_alias: "stops-pass", source_key: "stops", order: 1, data_type: "VECTOR", geometry_type: "Point",
                style_assignment: { id: "stops-assignment", style_id: "style-uuid", style_layer_ids: ["stop-icons"] },
                resource_href: "/stops",
            },
        ],
        sources: {
            roads: { type: "vector", tiles: ["https://example.test/roads/{z}/{x}/{y}.pbf"] },
            stops: { type: "vector", tiles: ["https://example.test/stops/{z}/{x}/{y}.pbf"] },
        },
        layers: [
            {
                id: "roads-line",
                type: "line",
                source: "roads",
                "source-layer": "roads",
                paint: { "line-color": "#f00", "line-pattern": "station" },
                metadata: { "tosca:member-id": "roads-member", "tosca:style-id": "style-uuid" },
            },
            {
                id: "stop-icons", type: "symbol", source: "stops", "source-layer": "stops",
                layout: { "icon-image": "station" },
                metadata: { "tosca:member-id": "stops-member", "tosca:style-id": "style-uuid" },
            },
        ],
        sprites: {
            transport: { id: "transport", url: "https://api.example.test/sprites/transport", content_hash: "abc" },
        },
        styles: {
            "style-uuid": {
                id: "style-uuid",
                name: "mobility",
                title: "Mobility",
                format: "mbstyle",
                content_hash: "def",
                sprite_id: "transport",
                href: "https://api.example.test/styles/style-uuid",
            },
        },
    };
}

describe("catalog layer group lifecycle", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    test("namespaces a group independently from an individual member layer", async () => {
        const sources = new Map<string, unknown>();
        const layers = new Map<string, unknown>();
        const addSprite = vi.fn();
        const mapStore = useMapStore();
        mapStore.map = {
            addSource: (id: string, source: unknown) => sources.set(id, source),
            getSource: (id: string) => sources.get(id),
            removeSource: (id: string) => sources.delete(id),
            addLayer: (layer: { id: string }) => layers.set(layer.id, layer),
            getLayer: (id: string) => layers.get(id),
            removeLayer: (id: string) => layers.delete(id),
            addSprite,
            removeSprite: vi.fn(),
        };

        const individualRuntimeId = createMapRuntimeId("layer", "provider:Hamburg:roads");
        sources.set(individualRuntimeId, { type: "vector" });
        layers.set(individualRuntimeId, { id: individualRuntimeId, source: individualRuntimeId });
        const group = await mapStore.addMapGroup(groupManifest());

        expect(group.id).not.toBe(individualRuntimeId);
        expect(group.managedSourceIds).toHaveLength(2);
        expect(group.managedSourceIds).not.toContain(individualRuntimeId);
        expect(layers.size).toBe(3);
        expect(addSprite).toHaveBeenCalledWith(
            expect.stringContaining("sprite-group-group-uuid"),
            "https://api.example.test/sprites/transport"
        );
        const patternedLayer = Array.from(layers.values()).find((candidate) => {
            const layer = candidate as { paint?: Record<string, unknown> };
            return layer.paint?.["line-pattern"] !== undefined;
        }) as { paint: Record<string, string> };
        expect(patternedLayer.paint["line-pattern"]).toContain(
            "sprite-group-group-uuid"
        );
        expect(patternedLayer.paint["line-pattern"]).toContain(":station");
        const symbolLayer = Array.from(layers.values()).find((candidate) => {
            const layer = candidate as { layout?: Record<string, unknown> };
            return layer.layout?.["icon-image"] !== undefined;
        }) as { layout: Record<string, string> };
        expect(symbolLayer.layout["icon-image"]).toContain(":station");
    });

    test("resolves a shared runtime source to its physical layer title", async () => {
        const sources = new Map<string, unknown>();
        const layers = new Map<string, unknown>();
        const mapStore = useMapStore();
        mapStore.map = {
            addSource: (id: string, source: unknown) => sources.set(id, source),
            getSource: (id: string) => sources.get(id),
            removeSource: (id: string) => sources.delete(id),
            addLayer: (layer: { id: string }) => layers.set(layer.id, layer),
            getLayer: (id: string) => layers.get(id),
            removeLayer: (id: string) => layers.delete(id),
            addSprite: vi.fn(),
            removeSprite: vi.fn(),
        };

        const group = await mapStore.addMapGroup(groupManifest());
        const roadsSource = group.groupSourceIds?.roads;

        expect(roadsSource).toBeDefined();
        expect(mapStore.displayNameForSource(roadsSource!)).toBe("Roads data");
    });

    test("removes every group render layer, source, and sprite together", async () => {
        const sources = new Map<string, unknown>();
        const layers = new Map<string, unknown>();
        const removeSprite = vi.fn();
        const mapStore = useMapStore();
        mapStore.map = {
            addSource: (id: string, source: unknown) => sources.set(id, source),
            getSource: (id: string) => sources.get(id),
            removeSource: (id: string) => sources.delete(id),
            addLayer: (layer: { id: string }) => layers.set(layer.id, layer),
            getLayer: (id: string) => layers.get(id),
            removeLayer: (id: string) => layers.delete(id),
            addSprite: vi.fn(),
            removeSprite,
        };
        const group = await mapStore.addMapGroup(groupManifest());

        await mapStore.deleteMapLayer(group.id);

        expect(layers.size).toBe(0);
        expect(sources.size).toBe(0);
        expect(removeSprite).toHaveBeenCalledWith(group.spriteRuntimeIds?.[0]);
        expect(mapStore.layersOnMap).toHaveLength(0);
    });

    test("shares a sprite URL until the last logical layer releases it", async () => {
        const sources = new Map<string, unknown>();
        const layers = new Map<string, unknown>();
        const addSprite = vi.fn();
        const removeSprite = vi.fn();
        const mapStore = useMapStore();
        mapStore.map = {
            addSource: (id: string, source: unknown) => sources.set(id, source),
            getSource: (id: string) => sources.get(id),
            removeSource: (id: string) => sources.delete(id),
            addLayer: (layer: { id: string }) => layers.set(layer.id, layer),
            getLayer: (id: string) => layers.get(id),
            removeLayer: (id: string) => layers.delete(id),
            addSprite,
            removeSprite,
        };

        const first = await mapStore.addMapGroup(groupManifest());
        const second = await mapStore.addMapGroup(groupManifest());
        expect(addSprite).toHaveBeenCalledTimes(1);
        expect(first.spriteRuntimeIds).toEqual(second.spriteRuntimeIds);

        await mapStore.deleteMapLayer(first.id);
        expect(removeSprite).not.toHaveBeenCalled();
        await mapStore.deleteMapLayer(second.id);
        expect(removeSprite).toHaveBeenCalledOnce();
    });

    test("shares one sprite across concurrent additions of the same URL", async () => {
        const sources = new Map<string, unknown>();
        const layers = new Map<string, unknown>();
        // addSprite resolves on a later tick so both additions overlap inside
        // the load window that used to add a duplicate sprite per caller.
        const addSprite = vi.fn(async () => await Promise.resolve());
        const removeSprite = vi.fn();
        const mapStore = useMapStore();
        mapStore.map = {
            addSource: (id: string, source: unknown) => sources.set(id, source),
            getSource: (id: string) => sources.get(id),
            removeSource: (id: string) => sources.delete(id),
            addLayer: (layer: { id: string }) => layers.set(layer.id, layer),
            getLayer: (id: string) => layers.get(id),
            removeLayer: (id: string) => layers.delete(id),
            addSprite,
            removeSprite,
        };

        const [first, second] = await Promise.all([
            mapStore.addMapGroup(groupManifest()),
            mapStore.addMapGroup(groupManifest()),
        ]);
        expect(addSprite).toHaveBeenCalledTimes(1);
        expect(first.spriteRuntimeIds).toEqual(second.spriteRuntimeIds);

        await mapStore.deleteMapLayer(first.id);
        expect(removeSprite).not.toHaveBeenCalled();
        await mapStore.deleteMapLayer(second.id);
        expect(removeSprite).toHaveBeenCalledOnce();
    });

    test("rolls back partial group additions", async () => {
        const sources = new Map<string, unknown>();
        const layers = new Map<string, unknown>();
        const mapStore = useMapStore();
        mapStore.map = {
            addSource: (id: string, source: unknown) => sources.set(id, source),
            getSource: (id: string) => sources.get(id),
            removeSource: (id: string) => sources.delete(id),
            addLayer: (layer: { id: string }) => {
                if (layers.size === 1) throw new Error("invalid style layer");
                layers.set(layer.id, layer);
            },
            getLayer: (id: string) => layers.get(id),
            removeLayer: (id: string) => layers.delete(id),
            addSprite: vi.fn(),
            removeSprite: vi.fn(),
        };

        await expect(mapStore.addMapGroup(groupManifest())).rejects.toThrow("invalid style layer");
        expect(layers.size).toBe(0);
        expect(sources.size).toBe(0);
        expect(mapStore.layersOnMap).toHaveLength(0);
    });
});

describe("standalone MBStyle conversion", () => {
    test("preserves the primary style layer filter", () => {
        const filter = ["==", ["get", "v1_SD_Text"], "sehr hoch"];

        const options = mbStyleLayerOptions({
            id: "adipositas-sehr-hoch-pattern",
            type: "fill",
            filter,
            paint: { "fill-pattern": "v1_roh_sehr_hoch" },
        }, "runtime-sprite");

        expect(options.filter).toEqual(filter);
        expect(options.paint?.["fill-pattern"]).toBe(
            "runtime-sprite:v1_roh_sehr_hoch"
        );
    });
});
