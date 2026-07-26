<template>
    <BaseSlideoverSidebarComponent :id="sidebarID" side="left" :collapsed=true @after-open="setupCharts">
        <template #header>
            <RouterLink to="/participation">
            <p>{{title}}</p>
        </RouterLink>
    </template>
        <div class="w-full">
            <div class="py-1">
                <UCard>
                    <template #default>
                        <section class="mb-6">
                        <h3 class="text-lg font-medium mb-2">{{ t('geostories.gq.healthTitle') }}</h3>
                            <p>
                                {{ t('geostories.gq.healthBody') }}
                            </p>
                        </section>
                    </template>
                </UCard>
            </div>
            <div class="py-1">
                <UAccordion
                    :items="scenarioAccordionItems"
                    type="multiple"
                    :default-value="[]"
                    :unmount-on-hide="false"
                    :ui="{ label: 'text-xl font-semibold capitalize' }"
                >
                    <template #body="{ item }">
                            <div class="w-full flex flex-row-reverse pt-2">
                            <UButton @click="startScenario(item.scenario)" size="sm">{{ t('geostories.runScenario') }}</UButton>
                        </div>
                            <section class="mb-6">
                            <h3 class="text-lg font-medium mb-2">{{ t('geostories.gq.layer1Title') }}</h3>
                            <p>
                                <i18n-t keypath="geostories.gq.layer1Body" tag="span">
                                    <template #ppmMean><strong>ppm_mean_avg</strong></template>
                                </i18n-t>
                            </p>
                            <canvas id="ppmMeanChart" class="my-3"></canvas>
                            <ul class="list-disc pl-5">
                                <li><strong>{{ t('geostories.gq.layer1MaxValue') }}</strong> {{ t('geostories.gq.layer1MaxValueAmount') }}</li>
                                <li><strong>{{ t('geostories.gq.layer1MinValue') }}</strong> {{ t('geostories.gq.layer1MinValueAmount') }}</li>
                                <li><strong>{{ t('geostories.gq.layer1Average') }}</strong> {{ t('geostories.gq.layer1AverageAmount') }}</li>
                            </ul>
                            <p>
                                {{ t('geostories.gq.layer1Footer') }}
                            </p>
                            </section>

                            <!-- Layer 2 Information -->
                            <section>
                            <h3 class="text-lg font-medium mb-2">{{ t('geostories.gq.layer2Title') }}
                            </h3>
                            <p>
                                <i18n-t keypath="geostories.gq.layer2Body" tag="span">
                                    <template #respCase><strong>resp_case_1k</strong></template>
                                </i18n-t>
                            </p>
                            <canvas id="respCaseChart" class="my-3"></canvas>
                            <ul class="list-disc pl-5">
                                <li><strong>{{ t('geostories.gq.layer2HighIncidence') }}</strong> {{ t('geostories.gq.layer2HighIncidenceValue') }}</li>
                                <li><strong>{{ t('geostories.gq.layer2ModerateIncidence') }}</strong> {{ t('geostories.gq.layer2ModerateIncidenceValue') }}</li>
                                <li><strong>{{ t('geostories.gq.layer2LowIncidence') }}</strong> {{ t('geostories.gq.layer2LowIncidenceValue') }}</li>
                            </ul>
                            <p>
                                {{ t('geostories.gq.layer2Footer') }}
                            </p>
                        </section>
                    </template>
                </UAccordion>
            </div>
        </div>
    </BaseSlideoverSidebarComponent>
</template>

<script setup lang="ts">
// Components
import BaseSlideoverSidebarComponent from "@components/Base/BaseSlideoverSidebarComponent.vue";

import { type GeoServerSourceParams, type LayerParams, type LayerStyleOptions, useMapStore } from "@store/map";
import { RouterLink } from "vue-router";
import { type FeatureCollection } from "@helpers/geojson";
import bbox from "@turf/bbox";
import { useGeoserverStore, type GeoserverRasterTypeLayerDetail, type GeoServerVectorTypeLayerDetail } from "@store/geoserver";
import bboxPolygon from "@turf/bbox-polygon";
import { isNullOrEmpty } from "@helpers/functions";
import { useToast } from "@helpers/toast";
import { computed, nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Chart, BarController, BarElement, CategoryScale, LinearScale, PieController, ArcElement, Tooltip, Legend } from "chart.js"
Chart.register(BarController, BarElement, CategoryScale, LinearScale, PieController, ArcElement, Tooltip, Legend);
const { t } = useI18n();
const mapStore = useMapStore()
const geoserver = useGeoserverStore()
const toast = useToast()
const sidebarID = "gq-geostory-sidebar"

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
const ppmMeanChart = ref<Chart>()
const respCaseChart = ref<Chart>()
async function setupCharts(): Promise<void> {
    await nextTick()
    const ppmMeanCanvas = document.getElementById("ppmMeanChart") as HTMLCanvasElement | null
    const respCaseCanvas = document.getElementById("respCaseChart") as HTMLCanvasElement | null
    if (ppmMeanCanvas === null || respCaseCanvas === null) return
    ppmMeanChart.value?.destroy()
    respCaseChart.value?.destroy()
    ppmMeanChart.value = new Chart(ppmMeanCanvas, {
        type: "bar",
        data: {
            labels: [t("geostories.gq.chart.max"), t("geostories.gq.chart.min"), t("geostories.gq.chart.average")],
            datasets: [{
                label: t("geostories.gq.chart.ppmMeanLabel"),
                data: [49.63, 6.93, 27.31],
                backgroundColor: ["#ff6384", "#36a2eb", "#ffcd56"]
            }]
        },
    });

    respCaseChart.value = new Chart(respCaseCanvas, {
        type: "pie",
        data: {
            labels: [t("geostories.gq.chart.highLabel"), t("geostories.gq.chart.moderateLabel"), t("geostories.gq.chart.lowLabel")],
            datasets: [{
                data: [30, 50, 20], // replace with actual data
                backgroundColor: ["#ff6384", "#36a2eb", "#4bc0c0"]
            }]
        },
    });
}
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
                toast.add({ severity: "error", summary: t("toast.error"), detail: err, life: 3000 });
            }
        }
    } catch (err) {
        toast.add({ severity: "error", summary: t("toast.error"), detail: err, life: 3000 });
    }
};
interface Scenario {
    title: string
    abstract: string
    layers: string[]
}
const title = computed(() => t("geostories.gq.title"))
const scenarioLayers = ["GQ2:ppm_mean_point_values", "GQ2:gq_statistical_unit_all_hamburg"]
const scenarioAccordionItems = computed(() => {
    const scenario: Scenario = {
        title: t("geostories.gq.scenario.title"),
        abstract: t("geostories.gq.scenario.abstract"),
        layers: scenarioLayers,
    }
    return [{
        label: scenario.title.replace(/[_-]/g, " "),
        value: "airQualityRespiratoryIllness",
        scenario,
    }]
})
</script>
