<template>
    <BaseSlideoverSidebarComponent :id="sidebarID" side="left" :collapsed=true>
        <template #header>
            <RouterLink to="/participation">
            <p>{{title}}</p>
        </RouterLink>
    </template>
        <div class="w-full">
            <div class="py-1">
                <UCard>
                    <template #default>
                        <p>{{information}}</p>
                    </template>
                </UCard>
            </div>
            <div class="py-1">
                <UAccordion
                    :items="scenarioAccordionItems"
                    type="multiple"
                    :default-value="[]"
                    :ui="{ label: 'text-xl font-semibold capitalize' }"
                >
                    <template #body="{ item }">
                        <p>{{ item.scenario.description }}</p>
                        <div class="w-full flex flex-row-reverse pt-2">
                            <UButton @click="startScenario(item.scenario)" size="sm">{{ t('geostories.runScenario') }}</UButton>
                        </div>
                    </template>
                </UAccordion>
            </div>
        </div>
    </BaseSlideoverSidebarComponent>
</template>

<script setup lang="ts">
// Components
import BaseSlideoverSidebarComponent from "@components/Base/BaseSlideoverSidebarComponent.vue";

import { type GeoServerSourceParams, type LayerParams, useMapStore } from "@store/map";
import { RouterLink } from "vue-router";
import { type FeatureCollection } from "@helpers/geojson";
import bbox from "@turf/bbox";
import { useGeoserverStore, type GeoserverRasterTypeLayerDetail, type GeoServerVectorTypeLayerDetail } from "@store/geoserver";
import bboxPolygon from "@turf/bbox-polygon";
import { isNullOrEmpty } from "@helpers/functions";
import { useToast } from "@helpers/toast";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
const { t } = useI18n();
const mapStore = useMapStore()
const geoserver = useGeoserverStore()
const toast = useToast()
const sidebarID = "floodScenarios"

function startScenario(scenario: Scenario): void{
    mapStore.resetMapData(false).then(()=>{
        console.log("Map data reset")
        loadScenarioLayers(scenario).then(()=>{
            console.log("Scenario layers loaded")
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
                                    layerType: mapStore.geometryConversion(dataType),
                                    geoserverLayerDetails: detail,
                                    sourceLayer: `${(detail as GeoServerVectorTypeLayerDetail).featureType.name}`,
                                    displayName: (detail as GeoServerVectorTypeLayerDetail)?.featureType.title ?? undefined,
                                };
                                await mapStore.addMapLayer(layerParams);
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
interface ScenarioDefinition {
    id: string
    layers: string[]
}
interface Scenario {
    name: string
    description: string
    layers: string[]
}
const title = computed(() => t("geostories.flood.title"))
const information = computed(() => t("geostories.flood.information"))
const scenarioDefinitions: ScenarioDefinition[] = [
    { id: "current", layers: ["HH_Drainage_Capacity:Drainage Capacity Default"] },
    { id: "expanded25", layers: ["HH_Drainage_Capacity:Drainage Capacity 025"] },
    { id: "expanded50", layers: ["HH_Drainage_Capacity:Drainage Capacity 050"] },
    { id: "expanded75", layers: ["HH_Drainage_Capacity:Drainage Capacity 075"] },
    { id: "expanded100", layers: ["HH_Drainage_Capacity:Drainage Capacity 100"] },
]
const scenarioAccordionItems = computed(() => {
    return scenarioDefinitions.map((definition) => {
        const scenario: Scenario = {
            name: t(`geostories.flood.scenarios.${definition.id}.name`),
            description: t(`geostories.flood.scenarios.${definition.id}.description`),
            layers: definition.layers,
        }
        return {
            label: scenario.name.replace(/[_-]/g, " "),
            value: definition.id,
            scenario,
        }
    })
})
</script>
