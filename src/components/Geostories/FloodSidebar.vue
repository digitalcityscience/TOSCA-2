<template>
    <BaseSidebarComponent :id="sidebarID" position="left" :collapsed=false>
        <template #header>
            <RouterLink to="/participation">
            <p>{{title}}</p>
        </RouterLink>
    </template>
        <div class="w-full">
            <div class="py-1">
                <Card>
                    <template #content>
                        <p>{{information}}</p>
                    </template>
                </Card>
            </div>
            <div class="py-1">
                <Accordion :activeIndex="[]">
                    <AccordionTab headerClass="rounded-lg" v-for="(scenario, index) in scenarios" :key="index">
                        <template #header>
                            <h2 class="text-xl font-semibold capitalize">{{ scenario.name.replace(/[_-]/g, ' ') }}</h2>
                        </template>
                        <p>{{ scenario.description }}</p>
                        <div class="w-full flex flex-row-reverse pt-2">
                            <Button @click="startScenario(scenario)" size="small">Run Scenario</Button>
                        </div>
                    </AccordionTab>
                </Accordion>
            </div>
        </div>
    </BaseSidebarComponent>
</template>

<script setup lang="ts">
// Components
import Accordion from "primevue/accordion";
import AccordionTab from "primevue/accordiontab";
import Card from "primevue/card";
import BaseSidebarComponent from "@components/Base/BaseSidebarComponent.vue";
import Button from "primevue/button";

import { SidebarControl } from "@helpers/sidebarControl";
import { type GeoServerSourceParams, type LayerParams, useMapStore } from "@store/map";
import { RouterLink } from "vue-router";
import { type FeatureCollection } from "geojson";
import bbox from "@turf/bbox";
import { useGeoserverStore, type GeoserverRasterTypeLayerDetail, type GeoServerVectorTypeLayerDetail } from "@store/geoserver";
import bboxPolygon from "@turf/bbox-polygon";
import { isNullOrEmpty } from "@helpers/functions";
import { useToast } from "primevue/usetoast";
const mapStore = useMapStore()
const geoserver = useGeoserverStore()
const toast = useToast()
const sidebarID = "floodScenarios"

const iconElement = document.createElement("span")
iconElement.classList.add("material-icons-outlined")
iconElement.textContent = "water"
const sidebarControl = new SidebarControl("", sidebarID, document.createElement("div"), iconElement, 3)
mapStore.map.addControl(sidebarControl, "top-left")

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
                toast.add({ severity: "error", summary: "Error", detail: err, life: 3000 });
            }
        }
    } catch (err) {
        toast.add({ severity: "error", summary: "Error", detail: err, life: 3000 });
    }
};
interface Scenario {
    name: string
    description: string
    layers: string[]
}
const title: string = "Flood Scenarios"
const information: string = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
const scenarios: Scenario[] = [
    {
        name: "Scenario 1",
        description: "This is a description of scenario 1",
        layers: ["Hamburg:Hamburg_SRTM_Elevation", "Hamburg:apotheken"]
    },
    {
        name: "Scenario 2",
        description: "This is a description of scenario 2",
        layers: ["Hamburg:Hamburg_Sentinel2-RGB", "Hamburg:apotheken"]
    },
    {
        name: "Scenario 3",
        description: "This is a description of scenario 3",
        layers: ["Hamburg:Hamburg_SRTM_Elevation", "Hamburg:Hamburg_Sentinel2-RGB", "Hamburg:apotheken"]
    }
]
</script>
