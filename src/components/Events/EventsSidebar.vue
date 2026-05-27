<template>
    <BaseSidebarComponent
        :id="sidebarID"
        position="left"
        :collapsed="true"
        width="620px"
        :style="'width: min(620px, calc(100vw - 80px)); max-width: calc(100vw - 80px);'"
    >
        <EventMapOverlay />
        <template #header>
            <p>Calendar and Citizen Information</p>
        </template>
        <div class="nav w-full flex justify-end py-1">
            <Button
                v-if="$route.name === 'event-detail'"
                icon="pi pi-arrow-left"
                label="Back to Events"
                size="small"
                severity="secondary"
                @click="goBackToEvents"
            />
        </div>
        <div class="pt-2">
            <router-view></router-view>
        </div>
    </BaseSidebarComponent>
</template>

<script setup lang="ts">
import bbox from "@turf/bbox";
import { onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import BaseSidebarComponent from "@components/Base/BaseSidebarComponent.vue";
import { SidebarControl } from "@helpers/sidebarControl";
import { useEventsStore } from "@store/events";
import { useMapStore } from "@store/map";
import EventMapOverlay from "./EventMapOverlay.vue";

const events = useEventsStore();
const mapStore = useMapStore();
const route = useRoute();
const router = useRouter();
const sidebarID = "events";

const iconElement = document.createElement("span");
iconElement.classList.add("material-icons-outlined");
iconElement.textContent = "event";
const sidebarControl = new SidebarControl("", sidebarID, document.createElement("div"), iconElement, 5);
mapStore.map.addControl(sidebarControl, "top-left");

onMounted(() => {
    setupSidebarVisibility();
});

function setupSidebarVisibility(): void {
    const routeMeta = route.meta;
    if (routeMeta.sidebar === undefined || routeMeta.sidebar === "") {
        return;
    }

    const sidebarId = routeMeta.sidebar as string;
    const position = routeMeta.sidebarPosition as string;
    const sidebars = document.getElementsByClassName(`sidebar-${position}`);
    for (let i = 0; i < sidebars.length; i++) {
        if (sidebars[i].id === sidebarId) {
            sidebars[i].classList.remove("collapsed");
        } else {
            sidebars[i].classList.add("collapsed");
        }
    }
}

async function goBackToEvents(): Promise<void> {
    await mapStore.resetMapData(false);
    await router.push({ name: "event-list" });
    await events.loadEventMap();
    fitMapToEvents();
}

function fitMapToEvents(): void {
    if (mapStore.map === undefined) {
        return;
    }

    if (events.spatialEvents.features.length === 0) {
        resetMapCamera();
        return;
    }

    const bounds = bbox(events.spatialEvents);
    if (!bounds.every(Number.isFinite)) {
        resetMapCamera();
        return;
    }

    const [minLng, minLat, maxLng, maxLat] = bounds;
    if (minLng === maxLng && minLat === maxLat) {
        mapStore.map.flyTo({
            center: [minLng, minLat],
            zoom: 14,
            essential: true,
        });
        return;
    }

    mapStore.map.fitBounds(bounds, {
        padding: 80,
        maxZoom: 14,
    });
}

function resetMapCamera(): void {
    if (mapStore.map === undefined) {
        return;
    }

    mapStore.map.flyTo({
        center: [mapStartLng(), mapStartLat()],
        zoom: mapStartZoom(),
        essential: true,
    });
}

function mapStartLng(): number {
    return mapStartNumber(import.meta.env.VITE_MAP_START_LNG, 9.993163);
}

function mapStartLat(): number {
    return mapStartNumber(import.meta.env.VITE_MAP_START_LAT, 53.552123);
}

function mapStartZoom(): number {
    return mapStartNumber(import.meta.env.VITE_MAP_START_ZOOM, 15);
}

function mapStartNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
</script>
