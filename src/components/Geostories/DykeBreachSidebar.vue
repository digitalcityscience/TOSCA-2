<template>
    <BaseSidebarComponent :id="sidebarID" position="left" :collapsed="false">
        <template #header>
            <RouterLink to="/participation">
                <p>{{ title }}</p>
            </RouterLink>
        </template>
        <div class="w-full">
            <div class="py-1">
                <Card>
                    <template #content>
                        <section>
                            <h3 class="text-lg font-medium mb-2">Finkenwerder Dyke Breach Assessment Tool</h3>
                            <p>
                                This interactive cockpit couples high-resolution 1D/2D hydrodynamic simulations with a
                                digital-twin viewer to explore urban vulnerability under catastrophic flood defense
                                failures. Use the Time Series Slider below to navigate through the progression of the
                                flood wave and observe how water depths advance across the district.
                            </p>
                        </section>
                    </template>
                </Card>
            </div>
            <div class="py-1">
                <Accordion :activeIndex="[0]">
                    <AccordionPanel v-for="(scenario, index) in scenarios" :key="index" :value="index">
                        <AccordionHeader>
                            <h2 class="text-xl font-semibold capitalize">{{ scenario.title }}</h2>
                        </AccordionHeader>
                        <AccordionContent>
                            <div class="w-full flex flex-row-reverse pt-2 pb-3">
                                <Button @click="startScenario(scenario)" size="small">Run Scenario</Button>
                            </div>
                            <section>
                                <p v-for="(bullet, i) in scenario.bullets" :key="i" class="mb-2">
                                    <strong>{{ bullet.label }}</strong> {{ bullet.text }}
                                </p>
                            </section>
                            <section v-if="activeLayer !== undefined && legendUrl !== undefined && !legendError" class="mt-4">
                                <h3 class="text-lg font-medium mb-2">Legend</h3>
                                <div class="scenario-legend-wrapper">
                                    <img :src="legendUrl" alt="Layer legend" class="scenario-legend-image" @error="legendError = true" />
                                </div>
                            </section>
                            <section v-if="activeLayer !== undefined" class="mt-4">
                                <h3 class="text-lg font-medium mb-2">Time Series Slider</h3>
                                <RasterLayerTimeControl :layer="activeLayer" :auto-play="true" />
                            </section>
                        </AccordionContent>
                    </AccordionPanel>
                </Accordion>
            </div>
        </div>
    </BaseSidebarComponent>
</template>

<style scoped>
.scenario-legend-wrapper {
    display: inline-block;
    max-width: 100%;
    overflow-x: auto;
}
.scenario-legend-image {
    display: block;
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 200px;
    object-fit: contain;
}
</style>

<script setup lang="ts">
import Accordion from "primevue/accordion";
import AccordionPanel from "primevue/accordionpanel";
import AccordionHeader from "primevue/accordionheader";
import AccordionContent from "primevue/accordioncontent";
import Card from "primevue/card";
import BaseSidebarComponent from "@components/Base/BaseSidebarComponent.vue";
import Button from "primevue/button";
import RasterLayerTimeControl from "@components/Map/Layer/RasterLayerTimeControl.vue";

import { SidebarControl } from "@helpers/sidebarControl";
import {
    type GeoServerSourceParams,
    type LayerParams,
    type LayerObjectWithAttributes,
    useMapStore,
} from "@store/map";
import { RouterLink } from "vue-router";
import { type FeatureCollection } from "@helpers/geojson";
import bbox from "@turf/bbox";
import {
    useGeoserverStore,
    type GeoserverRasterTypeLayerDetail,
    resolveLegendUrl,
} from "@store/geoserver";
import bboxPolygon from "@turf/bbox-polygon";
import { isNullOrEmpty } from "@helpers/functions";
import { useToast } from "primevue/usetoast";
import { onMounted, ref } from "vue";

const mapStore = useMapStore();
const geoserver = useGeoserverStore();
const toast = useToast();
const sidebarID = "dyke-breach-sidebar";

const iconElement = document.createElement("span");
iconElement.classList.add("material-icons-outlined");
iconElement.textContent = "tsunami";
const sidebarControl = new SidebarControl("", sidebarID, document.createElement("div"), iconElement, 3);
mapStore.map.addControl(sidebarControl, "top-left");

const activeLayer = ref<LayerObjectWithAttributes>();
const legendUrl = ref<string>();
const legendError = ref<boolean>(false);

interface ScenarioBullet {
    label: string;
    text: string;
}
interface Scenario {
    title: string;
    bullets: ScenarioBullet[];
    layers: string[];
}
const title = "Finkenwerder Dyke Breach";
const scenarios: Scenario[] = [
    {
        title: "The 1962 Historic Benchmark",
        layers: ["HH-Dyke:depth"],
        bullets: [
            { label: "Peak Water Level (PWL):", text: "Replicates the historic 1962 Hamburg flood event, peaking at 5.70 m NHN." },
            { label: "Breach Initiation (t=09:00 – 11:00):", text: "The surge crosses the critical failure threshold at approximately 11:00, initiating the breach." },
            { label: "First Impact (t=11:50):", text: "Shallow inundation (approx. 0.20 m) enters the northern edges of the Neuenfelde residential neighborhood exactly 50 minutes post-breach." },
            { label: "Peak Inundation (t=14:00):", text: "At the tidal peak, flood depths in central Neuenfelde reach 1.70 m, submerging over half of the local residential parcels. Total flooded area is constrained to 11.3 km²." },
        ],
    },
    {
        title: " The 1976 \"Capella\" Extreme",
        layers: ["HH-Dyke:depth"],
        bullets: [
            { label: "Peak Water Level (PWL):", text: "Replicates the highest storm surge ever recorded in Hamburg, peaking at 6.45 m NHN." },
            { label: "Breach Initiation (t=09:00 – 10:40):", text: "Due to the increased velocity and volume of the rising limb, the failure threshold is crossed earlier, at 10:40." },
            { label: "First Impact (t=11:10):", text: "Water hits the Neuenfelde residential boundaries just 30 minutes after initiation. This cuts emergency response and mobile defense setup windows by 40 minutes compared to Scenario 1." },
            { label: "Peak Inundation (t=14:00):", text: "Local water depths quickly surpass 2.0 m. Floodwaters easily overtop secondary inner defenses, expanding the total flood footprint to 17.1 km²." },
        ],
    },
];

/**
 * Switch the active basemap to the satellite layer if it has been registered
 * by BaseMapControl. Driven via a synthetic click so the control's `.active`
 * highlight stays in sync; falls back to a direct visibility toggle when the
 * DOM element is not yet available.
 */
function switchToSatelliteBasemap(): void {
    const satelliteEl = document.querySelector<HTMLElement>('.maplibregl-ctrl-basemaps .basemap[data-id="satellite"]');
    if (satelliteEl !== null && !satelliteEl.classList.contains("active")) {
        satelliteEl.click();
        return;
    }
    try {
        if (mapStore.map?.getLayer("satellite") !== undefined) {
            mapStore.map.setLayoutProperty("streets-v2", "visibility", "none");
            mapStore.map.setLayoutProperty("satellite", "visibility", "visible");
        }
    } catch (err) {
        console.error(err);
    }
}

onMounted(() => {
    switchToSatelliteBasemap();
});

function startScenario(scenario: Scenario): void {
    activeLayer.value = undefined;
    legendUrl.value = undefined;
    legendError.value = false;
    mapStore.resetMapData(false).then(() => {
        switchToSatelliteBasemap();
        loadScenarioLayers(scenario).catch((error) => { console.error(error); });
    }).catch((error) => { console.error(error); });
}

const loadScenarioLayers = async (scenario: Scenario): Promise<void> => {
    try {
        const layerBboxPolygons: FeatureCollection = {
            type: "FeatureCollection",
            features: [],
        };
        for (const item of scenario.layers) {
            try {
                const workspace = item.split(":")[0];
                const layerName = item.split(":")[1];
                const response = await geoserver.getLayerInformation({ name: layerName, href: "" }, workspace);
                if (response.layer === undefined) continue;
                const detail = await geoserver.getLayerDetail(response.layer.resource.href);
                if (isNullOrEmpty(detail) || response.layer.type !== "RASTER") continue;
                const rasterDetail = detail as GeoserverRasterTypeLayerDetail;
                const sourceParams: GeoServerSourceParams = {
                    sourceType: "geoserver",
                    sourceDataType: "raster",
                    sourceProtocol: "wms",
                    identifier: rasterDetail.coverage.name,
                    isFilterLayer: false,
                    workspaceName: workspace,
                    layer: detail,
                };
                await mapStore.addMapDataSource(sourceParams);
                const layerParams: LayerParams = {
                    sourceType: "geoserver",
                    sourceDataType: "raster",
                    sourceProtocol: "wms",
                    identifier: rasterDetail.coverage.name,
                    layerType: "raster",
                    workspaceName: workspace,
                    geoserverLayerDetails: detail,
                    sourceLayer: rasterDetail.coverage.name,
                    displayName: rasterDetail.coverage.title ?? undefined,
                };
                await mapStore.addMapLayer(layerParams);
                const added = mapStore.layersOnMap.find((l) => l.id === rasterDetail.coverage.name);
                if (added !== undefined) {
                    activeLayer.value = added;
                }
                resolveLegendUrl(
                    async (ws) => await geoserver.fetchWmsCapabilities(ws),
                    workspace,
                    rasterDetail.coverage.name
                ).then((url) => { legendUrl.value = url; }).catch((err) => { console.error(err); });
                const bb = rasterDetail.coverage.latLonBoundingBox;
                layerBboxPolygons.features.push(bboxPolygon([bb.minx, bb.miny, bb.maxx, bb.maxy]));
                if (layerBboxPolygons.features.length > 0) {
                    mapStore.map.fitBounds(bbox(layerBboxPolygons), {
                        padding: { top: 40, bottom: 40, right: 40, left: 520 },
                    });
                }
            } catch (err) {
                toast.add({ severity: "error", summary: "Error", detail: err, life: 3000 });
            }
        }
    } catch (err) {
        toast.add({ severity: "error", summary: "Error", detail: err, life: 3000 });
    }
};
</script>
