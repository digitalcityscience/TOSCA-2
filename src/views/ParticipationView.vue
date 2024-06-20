<template>
	<ParticipationSidebar></ParticipationSidebar>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import ParticipationSidebar from "../components/Participation/ParticipationSidebar.vue"
import sidebarConfig from "../configurations/sidebars"
import { useMapStore } from "../store/map"
import { type GeoserverLayerListItem, useGeoserverStore } from "../store/geoserver";
import { useToast } from "primevue/usetoast";
import { isNullOrEmpty } from "../core/helpers/functions";

const geoserver = useGeoserverStore()
const mapStore = useMapStore()
const toast = useToast()
const item: GeoserverLayerListItem = { name: `${import.meta.env.VITE_PARTICIPATION_DEMO_LAYER}`, href: `${import.meta.env.VITE_GEOSERVER_REST_URL}/workspaces/${import.meta.env.VITE_PARTICIPATION_DEMO_WORKSPACE}/layers/${import.meta.env.VITE_PARTICIPATION_DEMO_LAYER}` }
const workspace= `${import.meta.env.VITE_PARTICIPATION_DEMO_WORKSPACE}`
onMounted(() => {
    console.log("participation mounted")
    // rearrange sidebar visibility
    sidebarConfig.sidebars.forEach((sidebar) => {
        if (sidebar.participation.collapsed) {
            document.getElementById(sidebar.id)?.classList.add("collapsed")
        } else {
            document.getElementById(sidebar.id)?.classList.remove("collapsed")
        }
    })
    // reset all data on the map before adding demo data
    mapStore.resetMapData().then(() => { }, () => { })
    // add demo kochi data to the map
    geoserver.getLayerInformation(item, workspace).then((response) => {
        if (response.layer !== undefined) {
            geoserver.getLayerDetail(response.layer?.resource.href).then((detail) => {
                const feature = detail.featureType.attributes.attribute.filter((att) => { return att.name.includes("geom") })
                const dataType = feature.length > 0 ? feature[0].binding.split(".").slice(-1)[0] : ""
                if (!isNullOrEmpty(detail)) {
                    mapStore.addMapDataSource(
                        "geoserver",
                        detail.featureType.name,
                        false,
                        workspace,
                        detail).then(() => {
                        if (!isNullOrEmpty(dataType) && !isNullOrEmpty(detail)) {
                            mapStore.addMapLayer(
                                "geoserver",
                                detail.featureType.name,
                                mapStore.geometryConversion(dataType),
                                undefined,
                                detail,
                                `${detail.featureType.name}`,
                                undefined,
                                false,
                                detail?.featureType.title ?? undefined
                            ).then(() => {
                                console.log(mapStore.map.getStyle().layers)
                            }).catch(error => {
                                toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
                            })
                        }
                    }).catch(error => {
                        toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
                    })
                }
            }).catch(err => {
                toast.add({ severity: "error", summary: "Error", detail: err, life: 3000 });
            })
        }
    }).catch(err => {
        toast.add({ severity: "error", summary: "Error", detail: err, life: 3000 });
    })
    // just in case if map is not focused on the kochi, fly to kochi
    useMapStore().map.flyTo({
        center: [import.meta.env.VITE_PARTICIPATION_DEMO_LAT, import.meta.env.VITE_PARTICIPATION_DEMO_LON],
        zoom: 13,
        speed: 1
    })
})
</script>

<style scoped></style>
