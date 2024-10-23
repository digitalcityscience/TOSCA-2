<template>
	<BaseSidebarComponent :id="sidebarID" :position="sidebarPosition" :collapsed="true">
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
import { RouterLink, useRoute } from "vue-router";
import Button from "primevue/button";
import { onMounted } from "vue";

const mapStore = useMapStore()
const sidebarID = "participation"
const sidebarPosition = "left"
// add participation sidebar control to the map
const iconElement = document.createElement("span")
iconElement.classList.add("material-icons-outlined")
iconElement.textContent = "analytics"
const sidebarControl = new SidebarControl("", sidebarID, document.createElement("div"), iconElement, 2)
mapStore.map.addControl(sidebarControl, "top-left")

const route = useRoute()
onMounted(()=>{
    setupSidebarVisibility()
})
function setupSidebarVisibility(): void {
    const routeMeta = route.meta;
    if (routeMeta !== undefined && routeMeta.sidebar !== undefined && routeMeta.sidebar !== "" && routeMeta.sidebar !== null) {
        const sidebarId = routeMeta.sidebar as string;
        const position = routeMeta.sidebarPosition as string;
        const sidebars = document.getElementsByClassName(`sidebar-${position}`)
        if (sidebars.length > 0){
            for (let i = 0; i < sidebars.length; i++) {
                if (sidebars[i].id === sidebarId) {
                    sidebars[i].classList.remove("collapsed");
                } else {
                    sidebars[i].classList.add("collapsed");
                }
            }
        }
        const sidebarElement = document.getElementById(sidebarId);
        if (sidebarElement != null) {
            sidebarElement.classList.remove("collapsed");
        }
    }
}
</script>

<style scoped></style>
