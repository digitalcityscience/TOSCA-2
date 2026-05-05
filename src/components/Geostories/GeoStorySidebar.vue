<template>
    <BaseSidebarComponent
        :id="sidebarID"
        position="left"
        :collapsed="true"
        width="620px"
        :style="'width: min(620px, calc(100vw - 80px)); max-width: calc(100vw - 80px);'"
    >
        <template #header>
            <p>GeoStories</p>
        </template>
        <div class="nav w-full flex justify-end py-1">
            <Button
                v-if="$route.name === 'geostory-detail'"
                icon="pi pi-arrow-left"
                label="Back to Stories"
                size="small"
                severity="secondary"
                @click="goBackToStories"
            />
        </div>
        <div class="pt-2">
            <router-view></router-view>
        </div>
    </BaseSidebarComponent>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import BaseSidebarComponent from "@components/Base/BaseSidebarComponent.vue";
import { SidebarControl } from "@helpers/sidebarControl";
import { useMapStore } from "@store/map";

const mapStore = useMapStore();
const route = useRoute();
const router = useRouter();
const sidebarID = "geostories";

const iconElement = document.createElement("span");
iconElement.classList.add("material-icons-outlined");
iconElement.textContent = "auto_stories";
const sidebarControl = new SidebarControl("", sidebarID, document.createElement("div"), iconElement, 4);
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

async function goBackToStories(): Promise<void> {
    await mapStore.resetMapData(false);
    await router.push({ name: "geostory-list" });
}
</script>
