<template>
    <BaseSidebarComponent :id="sidebarID" position="left" :collapsed=true>
        <template #header>
            <RouterLink to="/participation">
            <p>{{title}}</p>
        </RouterLink>
    </template>
        <div class="w-full">
            <div class="py-1">
                <Card>
                    <template #content>
                        <section class="mb-6">
                        <h3 class="text-lg font-medium mb-2">Air Quality and Respiratory Health</h3>
                            <p>
                                Poor air quality has significant impacts on respiratory health. High levels of pollutants such as particulate matter (PM), nitrogen dioxide (NO₂), and ozone (O₃) can cause or exacerbate respiratory conditions, including asthma, bronchitis, and other chronic respiratory diseases.
                            </p>
                        </section>
                    </template>
                </Card>
            </div>
            <div class="py-1">
                <Accordion :activeIndex="[]">
                    <AccordionPanel v-for="(scenario, index) in scenarios" :key="index" :value="index">
                        <AccordionHeader>
                            <h2 class="text-xl font-semibold capitalize">{{ scenario.title.replace(/[_-]/g, ' ') }}</h2>
                        </AccordionHeader>
                        <AccordionContent>
                            <div class="w-full flex flex-row-reverse pt-2">
                            <Button @click="startScenario(scenario)" size="small">Run Scenario</Button>
                        </div>
                            <section class="mb-6">
                            <h3 class="text-lg font-medium mb-2">Layer 1: Selected Statistical Unit's Mean PPM Values</h3>
                            <p>
                                The <strong>ppm_mean_avg</strong> layer visualizes average pollutant concentration values measured in parts per million (ppm), providing insights into pollutant distribution across different geographic areas. Higher values indicate regions with greater pollution concerns.
                            </p>
                            <canvas id="ppmMeanChart" class="my-3"></canvas>
                            <ul class="list-disc pl-5">
                                <li><strong>Max Value:</strong> 49.63 ppm</li>
                                <li><strong>Min Value:</strong> 6.93 ppm</li>
                                <li><strong>Average:</strong> 27.31 ppm</li>
                            </ul>
                            <p>
                                Use this layer to identify and monitor high-risk areas for targeted air quality improvements and policy interventions.
                            </p>
                            </section>

                            <!-- Layer 2 Information -->
                            <section>
                            <h3 class="text-lg font-medium mb-2">Layer 2: Selected Statistical Units Respiratory Illness Cases
                            </h3>
                            <p>
                                The <strong>resp_case_1k</strong> layer represents respiratory illness cases per 1,000 residents, highlighting the health impact and risk level associated with air quality. This layer helps visualize the direct health implications of poor air quality.
                            </p>
                            <canvas id="respCaseChart" class="my-3"></canvas>
                            <ul class="list-disc pl-5">
                                <li><strong>High Incidence:</strong> &gt; 15 cases/1k - High health risk</li>
                                <li><strong>Moderate Incidence:</strong> 5-15 cases/1k - Moderate health risk</li>
                                <li><strong>Low Incidence:</strong> &lt; 5 cases/1k - Low health risk</li>
                            </ul>
                            <p>
                                Utilize this layer to assess community health needs and plan interventions or healthcare resources accordingly.
                            </p>
                        </section>
                        </AccordionContent>
                    </AccordionPanel>
                </Accordion>
            </div>
        </div>
    </BaseSidebarComponent>
</template>

<script setup lang="ts">
// Components
import Accordion from "primevue/accordion";
import AccordionPanel from "primevue/accordionpanel";
import AccordionHeader from "primevue/accordionheader";
import AccordionContent from "primevue/accordioncontent";
import Card from "primevue/card";
import BaseSidebarComponent from "@components/Base/BaseSidebarComponent.vue";
import Button from "primevue/button";

import { SidebarControl } from "@helpers/sidebarControl";
import { type GeoServerSourceParams, type LayerParams, type LayerStyleOptions, useMapStore } from "@store/map";
import { RouterLink } from "vue-router";
import { type FeatureCollection } from "geojson";
import bbox from "@turf/bbox";
import { useGeoserverStore, type GeoserverRasterTypeLayerDetail, type GeoServerVectorTypeLayerDetail } from "@store/geoserver";
import bboxPolygon from "@turf/bbox-polygon";
import { isNullOrEmpty } from "@helpers/functions";
import { useToast } from "primevue/usetoast";
import { onMounted, ref } from "vue";
import { Chart, BarController, BarElement, CategoryScale, LinearScale, PieController, ArcElement, Tooltip, Legend } from "chart.js"
Chart.register(BarController, BarElement, CategoryScale, LinearScale, PieController, ArcElement, Tooltip, Legend);
const mapStore = useMapStore()
const geoserver = useGeoserverStore()
const toast = useToast()
const sidebarID = "gq-geostory-sidebar"

const iconElement = document.createElement("span")
iconElement.classList.add("material-icons-outlined")
iconElement.textContent = "health_and_safety"
const sidebarControl = new SidebarControl("", sidebarID, document.createElement("div"), iconElement, 3)
const statisticalUnitStyle = ref<LayerStyleOptions>(
    {
        paint: {
            "fill-color": [
                "interpolate",
                ["linear"],
                ["get", "resp_case_1k"],
                0, "#00ff00",
                10, "#ffff00",
                20, "#ff0000"
            ],
            "fill-opacity": [
                "case",
                ["has", "ppm_mean_avg"],
                0.4,
                0.1
            ],
            "fill-outline-color": "#E2F084"
        }
    }

)
const heatmapStyle = ref<LayerStyleOptions>({
    paint: {
        "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "ppm_mean"], 0],
            6.932, 0,
            49.628, 1
        ],
        "heatmap-intensity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9, 1,
            16, 3
        ],
        "heatmap-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9, 120,
            16, 240
        ],
        "heatmap-opacity": 1,
        "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0, "rgba(33,102,172,0)",
            0.2, "rgb(103,169,207)",
            0.4, "rgb(209,229,240)",
            0.6, "rgb(253,219,199)",
            0.8, "rgb(239,138,98)",
            1, "rgb(178,24,43)"
        ]
    }
})
mapStore.map.addControl(sidebarControl, "top-left")
onMounted(() => {
    // eslint-disable-next-line no-new
    new Chart(document.getElementById("ppmMeanChart")! as HTMLCanvasElement, {
        type: "bar",
        data: {
            labels: ["Max", "Min", "Average"],
            datasets: [{
                label: "ppm_mean_avg (ppm)",
                data: [49.63, 6.93, 27.31],
                backgroundColor: ["#ff6384", "#36a2eb", "#ffcd56"]
            }]
        },
    });

    // eslint-disable-next-line no-new
    new Chart(document.getElementById("respCaseChart")! as HTMLCanvasElement, {
        type: "pie",
        data: {
            labels: ["High (>15 cases/1k)", "Moderate (5–15 cases/1k)", "Low (<5 cases/1k)"],
            datasets: [{
                data: [30, 50, 20], // replace with actual data
                backgroundColor: ["#ff6384", "#36a2eb", "#4bc0c0"]
            }]
        },
    });
});
function startScenario(scenario: Scenario): void{
    mapStore.resetMapData(false).then(()=>{
        console.log("Map data reset")
        loadScenarioLayers(scenario).then(()=>{
            console.log("GQ Scenario layers loaded")
        }).catch((error)=>{
            console.error(error)
        })
    }).catch((error)=>{
        console.error(error)
    })
    console.log(scenario)
}
const loadScenarioLayers = async (scenario: Scenario): Promise<void> => {
    try {
        const layerBboxPolygons: FeatureCollection = {
            type: "FeatureCollection",
            features: [],
        };
        if (scenario.layers === undefined) {
            return;
        }
        for (const item of scenario.layers) {
            try {
                const response = await geoserver.getLayerInformation({ name:item.split(":")[1], href:"" }, item.split(":")[0]);
                if (response.layer !== undefined) {
                    const detail = await geoserver.getLayerDetail(response.layer?.resource.href);
                    if (response.layer.type === "VECTOR") {
                        const feature = (detail as GeoServerVectorTypeLayerDetail).featureType.attributes.attribute.filter((att) => att.name.includes("geom"));
                        const dataType = feature.length > 0 ? feature[0].binding.split(".").slice(-1)[0] : "";
                        if (!isNullOrEmpty(detail)) {
                            const sourceParams: GeoServerSourceParams = {
                                sourceType: "geoserver",
                                sourceDataType: "vector",
                                sourceProtocol: "wmts",
                                identifier: (detail as GeoServerVectorTypeLayerDetail).featureType.name,
                                isFilterLayer: false,
                                workspaceName: item.split(":")[0],
                                layer: detail,
                            };
                            await mapStore.addMapDataSource(sourceParams);
                            if (!isNullOrEmpty(dataType) && !isNullOrEmpty(detail)) {
                                const layerParams: LayerParams = {
                                    sourceType: "geoserver",
                                    sourceDataType: "vector",
                                    sourceProtocol: "wmts",
                                    identifier: (detail as GeoServerVectorTypeLayerDetail).featureType.name,
                                    layerType: item==="GQ2:ppm_mean_point_values"?"heatmap":mapStore.geometryConversion(dataType),
                                    layerStyle: item==="GQ2:ppm_mean_point_values"?heatmapStyle.value:statisticalUnitStyle.value,
                                    geoserverLayerDetails: detail,
                                    sourceLayer: `${(detail as GeoServerVectorTypeLayerDetail).featureType.name}`,
                                    displayName: (detail as GeoServerVectorTypeLayerDetail)?.featureType.title ?? undefined,
                                };
                                await mapStore.addMapLayer(layerParams);
                                if (item==="GQ2:ppm_mean_point_values"){
                                    const lp: LayerParams = {
                                        sourceType: "geoserver",
                                        sourceDataType: "vector",
                                        sourceProtocol: "wmts",
                                        identifier: `${(detail as GeoServerVectorTypeLayerDetail).featureType.name}_point`,
                                        layerType: "circle",
                                        showOnLayerList: false,
                                        geoserverLayerDetails: detail,
                                        sourceLayer: `${(detail as GeoServerVectorTypeLayerDetail).featureType.name}`,
                                        sourceIdentifier: `${(detail as GeoServerVectorTypeLayerDetail).featureType.name}`,
                                        displayName: (detail as GeoServerVectorTypeLayerDetail)?.featureType.title ?? undefined,
                                    }
                                    await mapStore.addMapLayer(lp)
                                }
                                const bbox = (detail as GeoServerVectorTypeLayerDetail).featureType.latLonBoundingBox;
                                layerBboxPolygons.features.push(bboxPolygon([bbox.minx, bbox.miny, bbox.maxx, bbox.maxy]))
                            }
                        }
                    }
                    if (response.layer.type === "RASTER") {
                        if (!isNullOrEmpty(detail)) {
                            const sourceParams: GeoServerSourceParams = {
                                sourceType: "geoserver",
                                sourceDataType: "raster",
                                sourceProtocol: "wms",
                                identifier: (detail as GeoserverRasterTypeLayerDetail).coverage.name,
                                isFilterLayer: false,
                                workspaceName: item.split(":")[0],
                                layer: detail,
                            };
                            await mapStore.addMapDataSource(sourceParams);
                            const layerParams: LayerParams = {
                                sourceType: "geoserver",
                                sourceDataType: "vector",
                                sourceProtocol: "wmts",
                                identifier: (detail as GeoserverRasterTypeLayerDetail).coverage.name,
                                layerType: "raster",
                                geoserverLayerDetails: detail,
                                sourceLayer: `${(detail as GeoserverRasterTypeLayerDetail).coverage.name}`,
                                displayName: (detail as GeoserverRasterTypeLayerDetail).coverage.title ?? undefined,
                            };
                            await mapStore.addMapLayer(layerParams);
                            const bbox = (detail as GeoserverRasterTypeLayerDetail).coverage.latLonBoundingBox;
                            layerBboxPolygons.features.push(bboxPolygon([bbox.minx, bbox.miny, bbox.maxx, bbox.maxy]))
                        }
                    }
                }
                mapStore.map.fitBounds(bbox(layerBboxPolygons), { padding: 20 });
            } catch (err) {
                toast.add({ severity: "error", summary: "Error", detail: err, life: 3000 });
            }
        }
    } catch (err) {
        toast.add({ severity: "error", summary: "Error", detail: err, life: 3000 });
    }
};
interface Scenario {
    title: string
    abstract: string
    layers: string[]
}
const title: string = "GQ Air Quality Scenarios"
const scenarios: Scenario[] = [
    {
        title: "Air Quality Effect on Respiratory Illness",
        abstract: "This scenario illustrates the potential impact of air quality on respiratory illness in an urban setting. The map highlights areas with high levels of air pollution, which can exacerbate respiratory conditions such as asthma and bronchitis. By identifying these high-risk zones, the map helps public health officials target interventions to improve air quality and protect vulnerable populations.",
        layers: ["GQ2:ppm_mean_point_values", "GQ2:gq_statistical_unit_all_hamburg"]
    }
]
</script>
