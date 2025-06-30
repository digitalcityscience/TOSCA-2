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
                        <p>{{information}}</p>
                    </template>
                </Card>
            </div>
            <div class="py-1">
                <Accordion :activeIndex="[]">
                    <AccordionPanel v-for="(scenario, index) in scenarios" :key="index" :value="index">
                        <AccordionHeader>
                            <h2 class="text-xl font-semibold capitalize">{{ scenario.name.replace(/[_-]/g, ' ') }}</h2>
                        </AccordionHeader>
                        <AccordionContent>
                            <p>{{ scenario.description }}</p>
                            <div class="w-full flex flex-row-reverse pt-2">
                                <Button @click="startScenario(scenario)" size="small">Run Scenario</Button>
                            </div>
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
const information: string = "This map illustrates areas in an urban setting, likely Hamburg based on  the geographic features, where rainwater can accumulate or flow during  heavy rainfall events. By leveraging detailed topographic data, the map  identifies low-lying depressions and delineates potential water flow  paths through the city. These highlighted zones indicate where rainwater  is most likely to pool and flow, marking them as high-risk for flood  accumulation."
const scenarios: Scenario[] = [
    {
        name: "Current Situation",
        description: "This map represents Hamburg's current drainage capacity  without any enhancements. It highlights areas where rainwater is likely  to accumulate or flow during heavy rainfall events, showing zones most  vulnerable to flooding. With no additional drainage improvements, these  flood-prone areas remain at high risk, as the current infrastructure may  struggle to handle significant stormwater volumes. This map underscores  the need for drainage upgrades to mitigate flood risks, improve urban  resilience, and protect infrastructure and public safety from potential  flood events.",
        layers: ["HH_Drainage_Capacity:Drainage Capacity Default"]
    },
    {
        name: "Expanded Drainage Network: 25%",
        description: "This map represents the impact of  increasing Hamburg's drainage capacity by 25%. By analyzing the drainage  data, this simulation demonstrates how enhancing the drainage  infrastructure could reduce flood-prone areas. Compared to the original  flood risk map, the highlighted water accumulation zones have visibly  decreased.",
        layers: ["HH_Drainage_Capacity:Drainage Capacity 025"]
    },
    {
        name: "Expanded Drainage Network: 50%",
        description: "This map represents the impact of  increasing Hamburg's drainage capacity by 50%. With this enhancement,  the map demonstrates a further reduction in flood-prone areas compared  to a 25% increase. By doubling the drainage improvement, more water is  effectively managed during heavy rainfall, leading to fewer areas of  water accumulation. This map highlights the benefits of a significant  upgrade, showing an even greater decrease in areas at risk of flooding.",
        layers: ["HH_Drainage_Capacity:Drainage Capacity 050"]
    },
    {
        name: "Expanded Drainage Network: 75%",
        description: "This map represents the effect of a  75% increase in Hamburg's drainage capacity. With this substantial  improvement, the map reveals a considerable reduction in flood-prone  zones, indicating that most areas can now efficiently manage stormwater  runoff. This enhanced drainage capacity offers a high level of  protection for urban infrastructure, suggesting that a threefold upgrade  in drainage could make a significant impact on flood mitigation.",
        layers: ["HH_Drainage_Capacity:Drainage Capacity 075"]
    },
    {
        name: "Expanded Drainage Network: 100%",
        description: "This map illustrates the impact of  doubling Hamburg's drainage capacity, with a 100% increase. Under this  scenario, the map shows a dramatic reduction in water accumulation  areas, as the drainage infrastructure now handles nearly all stormwater  effectively. Such an improvement nearly eliminates high-risk zones for  flooding, indicating that a complete overhaul in drainage capacity could  provide maximum protection against flood risks, securing urban  resilience even in extreme weather events.",
        layers: ["HH_Drainage_Capacity:Drainage Capacity 100"]
    }
]
</script>
