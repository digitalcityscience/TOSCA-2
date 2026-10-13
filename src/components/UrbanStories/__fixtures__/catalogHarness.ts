import { vi } from "vitest";
import type { GeoserverLayerInfo } from "@store/geoserver";
import { useMapStore, type LayerObjectWithAttributes } from "@store/map";
import { RECORDED_URBAN_STORY_STYLES } from "../../../config/urbanStories/catalogStyles.fixture";
import { URBAN_STORIES, type ExploreEntry } from "../../../config/urbanStories";
import { URBAN_STORY_LAYERS } from "../../../config/urbanStories/layers";
import { fakeCameraMap } from "./runHarness";

/**
 * A mocked catalog that answers like the live one did on 2026-10-11 (third pass):
 * every layer has a `default-*` MBStyle as its default and **no alternates**, and the seven
 * `urbanstories-*` styles are registered with the provider but assigned to no layer.
 * Nothing here talks to a network.
 */

export interface FakeCatalogOptions {
    /** Layer names (not qualified) that answer 404, like a layer that is not published. */
    missingLayers?: string[];
    /** Style documents that answer with this error instead of JSON, by style name. */
    failingStyles?: Record<string, Error>;
    /** Style documents replaced by name (for example a wrong `source-layer`). */
    documents?: Record<string, Record<string, unknown>>;
    /** Assign these style names as alternates of the layers that list them (the GeoServer team's future state). */
    assignAlternates?: boolean;
}

export type FakeCatalog = ReturnType<typeof createFakeCatalog>;

const layerIds = Object.values(URBAN_STORY_LAYERS);

/** Attributes the published feature type of a layer carries: everything the configs require of it. */
export function publishedAttributes(layerName: string): string[] {
    const names = new Set<string>(["geom"]);
    for (const story of URBAN_STORIES) {
        for (const entry of story.explore) {
            if (entry.layer.layerName === layerName) entry.requiredAttributes.forEach((attribute) => names.add(attribute));
        }
    }
    return [...names];
}

function recordedStyleDocument(style: (typeof RECORDED_URBAN_STORY_STYLES)[number]): Record<string, unknown> {
    const geometry = layerIds.find((layer) => layer.ref.layerName === style.sourceLayer)?.geometry;
    return {
        version: 8,
        name: style.name,
        metadata: { "tosca:metric": style.metric, "tosca:attributes": [{ name: style.metric }], "tosca:frontend-style-driven": true },
        sources: { [style.sourceLayer]: { type: "vector", url: `mapbox://tosca.${style.sourceLayer}` } },
        layers: [{
            id: `${style.sourceLayer}-${style.metric}`,
            type: geometry === "line" ? "line" : "fill",
            source: style.sourceLayer,
            "source-layer": style.sourceLayer,
            paint: geometry === "line" ? { "line-color": "#46327e", "line-opacity": 0.9 } : { "fill-color": "#414487", "fill-opacity": 0.78 },
        }],
    };
}

export function createFakeCatalog(options: FakeCatalogOptions = {}) {
    const requests: string[] = [];
    const styleLists = layerIds.map((layer) => ({
        id: `default-${layer.ref.layerName}`,
        name: `default-${layer.ref.layerName}`,
        qualified_name: `${layer.ref.workspace}:default-${layer.ref.layerName}`,
        title: `default ${layer.ref.layerName}`,
        format: "mbstyle" as const,
        scope: "workspace" as const,
        workspace: { id: layer.ref.workspace, name: layer.ref.workspace },
        provider: { id: layer.ref.providerId },
    }));
    const recorded = RECORDED_URBAN_STORY_STYLES.map((style) => ({
        id: style.id,
        name: style.name,
        qualified_name: style.qualifiedName,
        title: style.name,
        format: style.format,
        scope: "workspace" as const,
        workspace: { id: style.qualifiedName.split(":")[0], name: style.qualifiedName.split(":")[0] },
        provider: { id: "01a11617-bb5c-75ce-bd6d-9c52d34dc20b" },
    }));
    const styleList = [...styleLists, ...recorded];
    const documents = new Map<string, Record<string, unknown>>();
    for (const layer of layerIds) {
        const name = layer.ref.layerName;
        documents.set(`default-${name}`, {
            version: 8,
            metadata: { "tosca:attributes": [{ name: "name" }] },
            layers: [{
                id: `default-${name}`,
                type: layer.geometry === "line" ? "line" : layer.geometry === "point" ? "circle" : "fill",
                source: name,
                "source-layer": name,
                paint: layer.geometry === "line" ? { "line-color": "#888", "line-opacity": 1 } : layer.geometry === "point" ? { "circle-color": "#888" } : { "fill-color": "#888", "fill-opacity": 0.6 },
            }],
        });
    }
    for (const style of RECORDED_URBAN_STORY_STYLES) documents.set(style.name, recordedStyleDocument(style));
    for (const [name, document] of Object.entries(options.documents ?? {})) documents.set(name, document);

    const layerNamed = (name: string) => layerIds.find((layer) => layer.ref.layerName === name);
    const alternatesOf = (layerName: string) => (options.assignAlternates === true
        ? RECORDED_URBAN_STORY_STYLES.filter((style) => style.sourceLayer === layerName)
        : []);

    const geoserver = {
        getLayerInformation: vi.fn(async ({ name }: { name: string }, workspace: string, providerId: string) => {
            requests.push(`layer:${workspace}:${name}`);
            if (options.missingLayers?.includes(name) === true || layerNamed(name) === undefined) {
                throw new Error(`Catalog layer ${workspace}:${name} request failed (404 Not Found): not published`);
            }
            const alternates = alternatesOf(name);
            return {
                layer: {
                    name,
                    type: "VECTOR",
                    defaultStyle: { id: `default-${name}`, name: `default-${name}`, href: `/styles/default-${name}` },
                    ...(alternates.length === 0 ? {} : { styles: alternates.map((style) => ({ name: style.qualifiedName, href: `/styles/${style.name}` })) }),
                    resource: { "@class": "featureType", name, href: `/resources/${providerId}/${workspace}/${name}` },
                } as unknown as GeoserverLayerInfo,
            };
        }),
        getLayerDetail: vi.fn(async (href: string) => {
            const name = href.split("/").pop() ?? "";
            return {
                catalog: { provider: { id: "01a11617-bb5c-75ce-bd6d-9c52d34dc20b" }, workspace_name: href.split("/")[3] },
                featureType: {
                    name,
                    title: name,
                    attributes: { attribute: publishedAttributes(name).map((attribute) => ({
                        name: attribute,
                        binding: attribute === "geom" ? "org.locationtech.jts.geom.MultiPolygon" : "java.lang.Double",
                    })) },
                },
            };
        }),
        getStyleList: vi.fn(async () => {
            requests.push("styles");
            return styleList;
        }),
        getLayerStyling: vi.fn(async (url: string) => {
            requests.push(`style:${url}`);
            const ref = url.split("/styles/")[1] ?? "";
            const item = styleList.find((candidate) => candidate.id === ref || candidate.name === ref);
            if (item === undefined) throw new Error("Catalog style request failed (404 Not Found)");
            const failure = options.failingStyles?.[item.name];
            if (failure !== undefined) throw failure;
            return structuredClone(documents.get(item.name));
        }),
    };
    return { geoserver, requests };
}

/** A fake MapLibre map with a layer registry, enough for the real `setStandaloneLayerStyle`. */
export function fakeRegistryMap() {
    const base = fakeCameraMap();
    const specs: Array<Record<string, any>> = [];
    return Object.assign(base, {
        specs,
        getStyle: () => ({ layers: specs }),
        getLayer: (id: string) => specs.find((spec) => spec.id === id),
        moveLayer: vi.fn((id: string, before?: string) => {
            const index = specs.findIndex((spec) => spec.id === id);
            if (index < 0) throw new Error(`Missing layer ${id}`);
            const [spec] = specs.splice(index, 1);
            const destination = before === undefined ? -1 : specs.findIndex((candidate) => candidate.id === before);
            if (destination < 0) specs.push(spec);
            else specs.splice(destination, 0, spec);
        }),
        addLayer: vi.fn((spec: Record<string, any>, before?: string) => {
            const index = before === undefined ? -1 : specs.findIndex((candidate) => candidate.id === before);
            if (index === -1) specs.push(spec);
            else specs.splice(index, 0, spec);
            base.layers.set(spec.id, { visibility: spec.layout?.visibility ?? "visible" });
        }),
        removeLayer: vi.fn((id: string) => {
            const index = specs.findIndex((spec) => spec.id === id);
            if (index >= 0) specs.splice(index, 1);
            base.layers.delete(id);
        }),
        getPaintProperty: (id: string, property: string) => specs.find((spec) => spec.id === id)?.paint?.[property],
        setPaintProperty: vi.fn((id: string, property: string, value: unknown) => {
            const spec = specs.find((candidate) => candidate.id === id);
            if (spec !== undefined) spec.paint = { ...(spec.paint ?? {}), [property]: value };
        }),
    });
}

/**
 * Give the real map store's add flow a map that records what would be drawn.
 * `addMapDataSource` / `addMapLayer` are replaced; the style swap, visibility and delete paths stay real.
 */
export function wireMapStore(map: ReturnType<typeof fakeRegistryMap>) {
    const mapStore = useMapStore();
    mapStore.map = map as never;
    vi.spyOn(mapStore, "addMapDataSource").mockResolvedValue(undefined as never);
    vi.spyOn(mapStore, "acquireMapSprite").mockImplementation(async (_url: string, id: string) => id);
    vi.spyOn(mapStore, "addMapLayer").mockImplementation(async (params) => {
        const spec: Record<string, any> = {
            id: params.identifier,
            type: params.layerType,
            source: params.sourceIdentifier,
            "source-layer": (params as { sourceLayer?: string }).sourceLayer,
            ...(params.layerStyle ?? {}),
        };
        map.addLayer(spec);
        mapStore.add2MapLayerList({
            ...spec,
            sourceType: "geoserver",
            showOnLayerList: true,
            displayName: params.displayName,
        } as unknown as LayerObjectWithAttributes, undefined, { notify: false });
        return undefined;
    });
    vi.spyOn(mapStore, "deleteMapDataSource").mockImplementation(() => undefined as never);
    return mapStore;
}

/** Entries of a story whose metrics are expected to be selectable (styled and verified). */
export function styledEntries(storyKey: string): ExploreEntry[] {
    return (URBAN_STORIES.find((story) => story.key === storyKey)?.explore ?? [])
        .filter((entry) => entry.metrics.some((metric) => metric.styleName !== null));
}
