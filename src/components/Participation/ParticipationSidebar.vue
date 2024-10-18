<template>
	<BaseSidebarComponent :id="sidebarID" position="left" :collapsed="true">
		<template #header>
			<p>Citizen Participation Tool</p>
		</template>
		<div class="nav w-full flex justify-end py-1">
            <RouterLink v-if="$route.name === 'campaign-details'" :to="{ name: 'active-campaigns' }">
                <Button size="small" severity="secondary">Back to Campaigns</Button>
            </RouterLink>
        </div>
        <div class="pt-2">
            <router-view></router-view>
        </div>
	</BaseSidebarComponent>
</template>

<script setup lang="ts">
import BaseSidebarComponent from "@components/Base/BaseSidebarComponent.vue"
import { SidebarControl } from "../../core/helpers/sidebarControl";
import { useMapStore } from "../../store/map";
import { RouterLink } from "vue-router";
import Button from "primevue/button";

const mapStore = useMapStore()
const sidebarID = "participation"
// add participation sidebar control to the map
const iconElement = document.createElement("span")
iconElement.classList.add("material-icons-outlined")
iconElement.textContent = "analytics"
const sidebarControl = new SidebarControl("", sidebarID, document.createElement("div"), iconElement, 2)
mapStore.map.addControl(sidebarControl, "top-left")
</script>

<style scoped></style>
