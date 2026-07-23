<template>
	<BaseSlideoverSidebarComponent :id="sidebarID" :side="sidebarPosition" :collapsed="true">
		<template #header>
			<p>Citizen Participation Tool</p>
		</template>
		<div class="nav w-full flex justify-end py-1">
            <RouterLink v-if="$route.name === 'campaign-details'" :to="{ name: 'active-campaigns' }">
                <UButton size="sm" color="secondary">Back to Campaigns</UButton>
            </RouterLink>
        </div>
        <div class="pt-2">
            <router-view></router-view>
        </div>
	</BaseSlideoverSidebarComponent>
</template>

<script setup lang="ts">
import BaseSlideoverSidebarComponent from "@components/Base/BaseSlideoverSidebarComponent.vue"
import { SidebarControl } from "../../core/helpers/sidebarControl";
import { openSlideoverSidebar } from "@helpers/slideoverSidebarRegistry";
import { useMapStore } from "../../store/map";
import { RouterLink, useRoute } from "vue-router";
import { onMounted, watch } from "vue";

const mapStore = useMapStore()
const sidebarID = "participation"
const sidebarPosition = "left"
// add participation sidebar control to the map
const iconElement = document.createElement("span")
iconElement.classList.add("material-icons-outlined")
iconElement.textContent = "analytics"
const sidebarControl = new SidebarControl("", sidebarID, document.createElement("div"), iconElement, 2, { slideover: true })
mapStore.map.addControl(sidebarControl, "top-left")

const route = useRoute()
onMounted(()=>{
    setupSidebarVisibility()
})
watch(() => route.meta.sidebar, () => {
    setupSidebarVisibility()
})
function setupSidebarVisibility(): void {
    const routeMeta = route.meta;
    if (routeMeta !== undefined && routeMeta.sidebar === sidebarID) {
        openSlideoverSidebar(sidebarID)
    }
}
</script>

<style scoped></style>
