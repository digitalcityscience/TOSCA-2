<template>
    <div v-if="loading" class="loading">Loading...</div>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="campaignDetail" class="content bg-slate-50 rounded-md p-2">
        <h1 class="text-2xl font-bold uppercase">{{ campaignDetail.campaign_name }}</h1>
        <p class="whitespace-pre-wrap py-2">{{ campaignDetail.campaing_detailed_description }}</p>
        <div v-if="campaignDetail" class="pt-2">
            <ParticipationForm :campaign="campaignDetail"></ParticipationForm>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import ParticipationForm from "./ParticipationForm.vue";
import { type CampaignDetail, useParticipationStore } from "@store/participation";
import { useRoute } from "vue-router";
import { useToast } from "primevue/usetoast";
import { useGeoserverStore } from "@store/geoserver";
import { type LayerParams, useMapStore, type GeoServerSourceParams } from "@store/map";
import { isNullOrEmpty } from "@helpers/functions";
import { type FeatureCollection } from "geojson";
import bboxPolygon from "@turf/bbox-polygon";
import bbox from "@turf/bbox";

const participation = useParticipationStore();
const geoserver = useGeoserverStore();
const mapStore = useMapStore();
const route = useRoute();
const toast = useToast()
const props = defineProps<{
    campaignURL: string
}>()

const loading = ref(true)
const error = ref("")
const campaignDetail = ref<CampaignDetail>()

const loadCampaignResources = async (): Promise<void> => {
    loading.value = true;
    try {
        await fetchCampaignDetail();
        await loadCampaignLayers();
    } catch (err) {
        error.value = String(err);
    } finally {
        loading.value = false;
    }
};

const fetchCampaignDetail = async (): Promise<void> => {
    try {
        const response = await participation.getCampaignDetail(props.campaignURL);
        campaignDetail.value = response;
    } catch (e) {
        error.value = String(e);
        throw e;
    }
};

const loadCampaignLayers = async (): Promise<void> => {
    try {
        const layerBboxPolygons: FeatureCollection = {
            type: "FeatureCollection",
            features: [],
        };
        if (campaignDetail.value?.geoserver_layers === undefined) {
            return;
        }
        for (const item of campaignDetail.value?.geoserver_layers) {
            try {
                const response = await geoserver.getLayerInformation({ name:item.split(":")[1], href:"" }, item.split(":")[0]);
                if (response.layer !== undefined) {
                    const detail = await geoserver.getLayerDetail(response.layer?.resource.href);
                    const feature = detail.featureType.attributes.attribute.filter((att) => att.name.includes("geom"));
                    const dataType = feature.length > 0 ? feature[0].binding.split(".").slice(-1)[0] : "";
                    if (!isNullOrEmpty(detail)) {
                        const sourceParams: GeoServerSourceParams = {
                            sourceType: "geoserver",
                            identifier: detail.featureType.name,
                            isFilterLayer: false,
                            workspaceName: item.split(":")[0],
                            layer: detail,
                        };
                        await mapStore.addMapDataSource(sourceParams);
                        if (!isNullOrEmpty(dataType) && !isNullOrEmpty(detail)) {
                            const layerParams: LayerParams = {
                                sourceType: "geoserver",
                                identifier: detail.featureType.name,
                                layerType: mapStore.geometryConversion(dataType),
                                geoserverLayerDetails: detail,
                                sourceLayer: `${detail.featureType.name}`,
                                displayName: detail?.featureType.title ?? undefined,
                            };
                            await mapStore.addMapLayer(layerParams);
                            const bbox = detail.featureType.latLonBoundingBox;
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
watch(() => route.params.id, loadCampaignResources, { immediate: true })
</script>

<style scoped></style>
