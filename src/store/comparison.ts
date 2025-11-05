import { defineStore, acceptHMRUpdate } from "pinia";
import { ref } from "vue";
import { Map, type AddLayerObject, type MapOptions, type SourceSpecification } from "maplibre-gl";
import { MapSwipeController } from "@helpers/mapSwipe";
import {
    type SourceParams,
    type LayerParams,
    type GeoServerSourceParams,
    type GeoJSONSourceParams,
    type LayerObjectWithAttributes,
    type LayerStyleOptions,
    type MapLibreLayerTypes,
    type CustomAddLayerObject,
} from "./map";
import { type GeoserverRasterTypeLayerDetail, type GeoServerVectorTypeLayerDetail } from "./geoserver";
import { getRandomHexColor, isNullOrEmpty } from "../core/helpers/functions";

type ComparisonMapConfig = Partial<Pick<MapOptions, "style" | "center" | "zoom" | "bearing" | "pitch">>;

interface StartComparisonOptions {
    mainMap: Map;
    container: MapOptions["container"];
    mapConfig?: ComparisonMapConfig;
    source: SourceParams;
    layer: LayerParams;
}

function parseEnvNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

const DEFAULT_CENTER: [number, number] = [
    parseEnvNumber(import.meta.env.VITE_MAP_START_LNG as string | undefined, 9.993163),
    parseEnvNumber(import.meta.env.VITE_MAP_START_LAT as string | undefined, 53.552123),
];

const DEFAULT_ZOOM = parseEnvNumber(import.meta.env.VITE_MAP_START_ZOOM as string | undefined, 15);

const DEFAULT_STYLE = `https://api.maptiler.com/maps/base-v4/style.json?key=${import.meta.env.VITE_MAPTILER_API_KEY}`;

export const useComparisonStore = defineStore("comparison", () => {
    const comparisonMap = ref<Map | undefined>();
    const comparisonLayers = ref<LayerObjectWithAttributes[]>([]);
    let comparisonContainerElement: HTMLElement | undefined;
    let overlayMapElement: HTMLElement | undefined;
    let swipeController: MapSwipeController | undefined;
    let detachSync: (() => void) | undefined;

    function initializeComparisonMap(
        container: MapOptions["container"],
        config: ComparisonMapConfig = {}
    ): Map {
        if (container === undefined || container === null) {
            throw new Error("A container element or ID is required to initialize the comparison map");
        }

        if (comparisonMap.value !== undefined) {
            comparisonMap.value.remove();
            comparisonMap.value = undefined;
            comparisonLayers.value = [];
        }

        const mapConfig: MapOptions = {
            container,
            style: config.style ?? DEFAULT_STYLE,
            center: config.center ?? DEFAULT_CENTER,
            zoom: config.zoom ?? DEFAULT_ZOOM,
        };
        if (config.bearing !== undefined) {
            mapConfig.bearing = config.bearing;
        }
        if (config.pitch !== undefined) {
            mapConfig.pitch = config.pitch;
        }

        comparisonMap.value = new Map(mapConfig);
        return comparisonMap.value;
    }

    function teardownComparison(): void {
        swipeController?.destroy();
        swipeController = undefined;
        detachSync?.();
        detachSync = undefined;
        if (comparisonMap.value !== undefined) {
            comparisonMap.value.remove();
            comparisonMap.value = undefined;
        }
        comparisonLayers.value = [];
        if (overlayMapElement !== undefined && overlayMapElement.parentElement !== null) {
            overlayMapElement.parentElement.removeChild(overlayMapElement);
        }
        overlayMapElement = undefined;
        if (comparisonContainerElement !== undefined) {
            comparisonContainerElement.classList.remove("has-comparison");
            comparisonContainerElement = undefined;
        }
    }

    function ensureComparisonMap(): Map {
        if (comparisonMap.value === undefined) {
            throw new Error("Comparison map is not initialized");
        }
        return comparisonMap.value;
    }

    async function waitForMapReady(mapInstance: Map): Promise<void> {
        if (mapInstance.loaded()) {
            return;
        }
        await new Promise<void>((resolve) => {
            void mapInstance.once("load", () => {
                resolve();
            });
        });
    }

    function clearComparisonMap(): void {
        teardownComparison();
    }

    function createRandomPaintObj(type: MapLibreLayerTypes): Record<string, any> {
        const color = getRandomHexColor();
        switch (type) {
            case "circle":
                return {
                    "circle-color": color,
                    "circle-opacity": 1,
                    "circle-radius": 8,
                };
            case "fill":
                return {
                    "fill-color": color,
                    "fill-opacity": 0.6,
                    "fill-outline-color": "#000000",
                };
            case "line":
                return {
                    "line-color": color,
                    "line-opacity": 1,
                    "line-width": 3,
                };
            default:
                return {
                    "heatmap-color": color,
                    "heatmap-opacity": 1,
                };
        }
    }

    function generateStyling(
        layerType: MapLibreLayerTypes,
        layerStyle?: LayerStyleOptions
    ): LayerStyleOptions {
        let styling: LayerStyleOptions = {};
        if (layerType !== "raster") {
            const defaultPaint = createRandomPaintObj(layerType);
            styling = { ...layerStyle };
            if (layerStyle?.paint === undefined) {
                styling.paint = defaultPaint;
            }
        } else if (layerStyle !== undefined) {
            styling = { ...layerStyle };
        }
        return styling;
    }

    async function addSourceToComparisonMap(
        params: SourceParams
    ): Promise<SourceSpecification> {
        const mapInstance = ensureComparisonMap();
        await waitForMapReady(mapInstance);

        const { identifier, sourceType } = params;
        if (isNullOrEmpty(identifier)) {
            throw new Error("Identifier is required to add a source to the comparison map");
        }

        const existingSource = mapInstance.getSource(identifier);
        if (existingSource !== undefined) {
            return existingSource as SourceSpecification;
        }

        if (sourceType === "geoserver") {
            const geoserverParams: GeoServerSourceParams = params;
            if (geoserverParams.layer === undefined) {
                throw new Error("Layer information required to add geoserver sources");
            }
            if (
                geoserverParams.workspaceName === undefined ||
                geoserverParams.workspaceName === ""
            ) {
                throw new Error("Workspace name required to add geoserver sources");
            }
            if (geoserverParams.sourceProtocol === "wms" && geoserverParams.sourceDataType === "raster") {
                const coverage = geoserverParams.layer as GeoserverRasterTypeLayerDetail;
                mapInstance.addSource(identifier, {
                    type: "raster",
                    tiles: [
                        `${import.meta.env.VITE_GEOSERVER_BASE_URL}/wms
?REQUEST=GetMap
&SERVICE=WMS
&VERSION=1.3.0
&LAYERS=${geoserverParams.workspaceName}:${coverage.coverage.name}
&STYLES=
&CRS=EPSG:3857
&WIDTH=256
&HEIGHT=256
&BBOX={bbox-epsg-3857}
&transparent=true
&format=image/png
&TILED=true`,
                    ],
                });
            }
            if (geoserverParams.sourceProtocol === "wmts" && geoserverParams.sourceDataType === "vector") {
                const vectorDetail = geoserverParams.layer as GeoServerVectorTypeLayerDetail;
                mapInstance.addSource(identifier, {
                    type: "vector",
                    tiles: [
                        `${import.meta.env.VITE_GEOSERVER_BASE_URL}/gwc/service/wmts
?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0
&LAYER=${geoserverParams.workspaceName}:${vectorDetail.featureType.name}
&STYLE=
&TILEMATRIX=EPSG:900913:{z}
&TILEMATRIXSET=EPSG:900913
&TILECOL={x}
&TILEROW={y}
&format=application/vnd.mapbox-vector-tile`,
                    ],
                });
            }
        }

        if (sourceType === "geojson") {
            const geojsonParams: GeoJSONSourceParams = params;
            if (geojsonParams.geoJSONSrc === undefined) {
                throw new Error("GeoJSON data required to add GeoJSON sources");
            }
            mapInstance.addSource(identifier, {
                type: "geojson",
                data: geojsonParams.geoJSONSrc,
            });
        }

        const addedSource = mapInstance.getSource(identifier);
        if (addedSource !== undefined) {
            return addedSource as SourceSpecification;
        }

        throw new Error(`Couldn't add requested source to comparison map: ${identifier}`);
    }

    async function addLayerToComparisonMap(
        params: LayerParams,
        sourceParams?: SourceParams
    ): Promise<AddLayerObject | undefined> {
        const mapInstance = ensureComparisonMap();
        await waitForMapReady(mapInstance);

        if (sourceParams !== undefined) {
            await addSourceToComparisonMap(sourceParams);
        }

        const {
            identifier,
            sourceType,
            layerType,
            layerStyle,
            displayName,
            sourceIdentifier,
            showOnLayerList = true,
        } = params;

        if (identifier === "") {
            throw new Error("Identifier is required to add a layer to the comparison map");
        }

        if (sourceType === "geoserver" && !("geoserverLayerDetails" in params)) {
            throw new Error("Layer details required to add geoserver layers");
        }
        if (sourceType === "geojson" && !("geoJSONSrc" in params)) {
            throw new Error("GeoJSON data required to add GeoJSON layers");
        }

        if (mapInstance.getLayer(identifier) !== undefined) {
            await removeLayerFromComparisonMap(identifier, false);
        }

        const styling = generateStyling(layerType, layerStyle);
        const source = sourceIdentifier ?? identifier;

        const layerObject: CustomAddLayerObject = {
            id: identifier,
            source,
            sourceType,
            type: layerType,
            showOnLayerList,
            ...styling,
            ...(sourceType === "geoserver" && params.sourceLayer != null
                ? { "source-layer": params.sourceLayer }
                : {}),
            ...(sourceType === "geojson" && params.isFilterLayer
                ? { filterLayer: params.isFilterLayer }
                : {}),
            ...(sourceType === "geojson" &&
            (params.isFilterLayer || (params.isDrawnLayer !== undefined && params.isDrawnLayer))
                ? { layerData: params.geoJSONSrc }
                : {}),
            ...(displayName !== undefined && displayName !== ""
                ? { displayName }
                : {}),
        };

        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        mapInstance.addLayer(layerObject as AddLayerObject);

        if (mapInstance.getLayer(identifier) === undefined) {
            throw new Error(`Couldn't add requested layer to comparison map: ${identifier}`);
        }

        const layerWithAttributes: LayerObjectWithAttributes = {
            ...layerObject,
        };

        if (sourceType === "geoserver") {
            layerWithAttributes.details = params.geoserverLayerDetails;
            if (params.workspaceName !== undefined) {
                layerWithAttributes.workspaceName = params.workspaceName;
            }
        }

        const existingIndex = comparisonLayers.value.findIndex(
            (layer) => layer.id === identifier
        );
        if (existingIndex !== -1) {
            comparisonLayers.value.splice(existingIndex, 1, layerWithAttributes);
        } else {
            comparisonLayers.value.push(layerWithAttributes);
        }

        return mapInstance.getLayer(identifier) as AddLayerObject;
    }

    async function removeLayerFromComparisonMap(
        identifier: string,
        removeSource = true
    ): Promise<void> {
        const mapInstance = ensureComparisonMap();
        await waitForMapReady(mapInstance);

        const layer = comparisonLayers.value.find((item) => item.id === identifier);
        if (layer === undefined) {
            throw new Error(`Layer with identifier ${identifier} not found in comparison map`);
        }

        if (mapInstance.getLayer(identifier) !== undefined) {
            mapInstance.removeLayer(identifier);
        }

        if (removeSource && mapInstance.getSource(layer.source) !== undefined) {
            mapInstance.removeSource(layer.source);
        }

        comparisonLayers.value = comparisonLayers.value.filter(
            (item) => item.id !== identifier
        );
    }

    async function startComparison({
        mainMap,
        container,
        mapConfig,
        source,
        layer,
    }: StartComparisonOptions): Promise<void> {
        if (mainMap === undefined) {
            throw new Error("Main map is not available for comparison");
        }

        await waitForMapReady(mainMap);

        const containerElement =
            typeof container === "string"
                ? document.body.querySelector(container)
                : container;

        if (!(containerElement instanceof HTMLElement)) {
            throw new Error("Comparison map container not found");
        }

        teardownComparison();

        comparisonContainerElement = containerElement;
        comparisonContainerElement.classList.add("has-comparison");

        if (overlayMapElement !== undefined && overlayMapElement.parentElement !== null) {
            overlayMapElement.parentElement.removeChild(overlayMapElement);
        }

        overlayMapElement = document.createElement("div");
        overlayMapElement.className = "comparison-map";
        comparisonContainerElement.appendChild(overlayMapElement);

        const effectiveConfig: ComparisonMapConfig = { ...mapConfig };
        if (effectiveConfig.center === undefined) {
            const center = mainMap.getCenter();
            effectiveConfig.center = [center.lng, center.lat];
        }
        if (effectiveConfig.zoom === undefined) {
            effectiveConfig.zoom = mainMap.getZoom();
        }
        if (effectiveConfig.bearing === undefined) {
            effectiveConfig.bearing = mainMap.getBearing();
        }
        if (effectiveConfig.pitch === undefined) {
            effectiveConfig.pitch = mainMap.getPitch();
        }

        const comparison = initializeComparisonMap(overlayMapElement, effectiveConfig);

        await new Promise<void>((resolve, reject) => {
            const runSetup = async (): Promise<void> => {
                try {
                    await addLayerToComparisonMap(layer, source);
                    await waitForMapReady(comparison);
                    detachSync = createMapSynchronizer(mainMap, comparison);
                    if (comparisonContainerElement === undefined || overlayMapElement === undefined) {
                        throw new Error("Comparison container is not available");
                    }
                    swipeController = new MapSwipeController(comparisonContainerElement, overlayMapElement, {
                        orientation: "vertical",
                    });
                    resolve();
                } catch (error) {
                    teardownComparison();
                    reject(error);
                }
            };

            if (comparison.loaded()) {
                void runSetup();
            } else {
                void comparison.once("load", () => { void runSetup(); });
            }
        });
    }

    function createMapSynchronizer(mapA: Map, mapB: Map): () => void {
        let isSyncing = false;
        const sync = (source: Map, target: Map): void => {
            if (isSyncing) return;
            isSyncing = true;
            target.jumpTo({
                center: source.getCenter(),
                zoom: source.getZoom(),
                bearing: source.getBearing(),
                pitch: source.getPitch(),
            });
            isSyncing = false;
        };
        const onMoveA = (): void => { sync(mapA, mapB); };
        const onMoveB = (): void => { sync(mapB, mapA); };
        mapA.on("move", onMoveA);
        mapB.on("move", onMoveB);
        return () => {
            mapA.off("move", onMoveA);
            mapB.off("move", onMoveB);
        };
    }

    return {
        comparisonMap,
        comparisonLayers,
        initializeComparisonMap,
        clearComparisonMap,
        addSourceToComparisonMap,
        addLayerToComparisonMap,
        removeLayerFromComparisonMap,
        startComparison,
    };
});

/* eslint-disable */
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useComparisonStore, import.meta.hot));
}
