<template>
	<BaseSidebarComponent :id="sidebarID" position="left" :collapsed="true" class="bg-slate-200">
		<template #header>
			<p>Citizen Participation Tool</p>
		</template>
		<Panel class="relative">
			<template #header>
				<span class="font-bold text-lg">Proposals for the new Master Plan of Manikonda</span>
			</template>
			<div class="w-full flex flex-col relative">
				<div class="info">
					This campaign invites the citizens of Manikonda to actively participate in shaping the city's proposed changes in the new upcoming Master Plan. By providing feedback on proposed land-use changes, residents can directly influence decisions that affect their city’s growth, environment, and overall quality of life. This campaign plan is designed to foster broad participation and ensure that the diverse perspectives of Manikonda's residents are considered in the city's Master Planning process.
				</div>
				<ParticipationForm></ParticipationForm>
			</div>
		</Panel>
	</BaseSidebarComponent>
</template>

<script setup lang="ts">
import BaseSidebarComponent from "@components/Base/BaseSidebarComponent.vue"
import Panel from "primevue/panel"
import ParticipationForm from "./ParticipationForm.vue"
import { SidebarControl } from "../../core/helpers/sidebarControl";
import { useMapStore } from "../../store/map";

const mapStore = useMapStore()
const sidebarID = "participation"
// add participation sidebar control to the map
const iconElement = document.createElement("span")
iconElement.classList.add("material-icons-outlined")
iconElement.textContent = "analytics"
const sidebarControl = new SidebarControl("", sidebarID, document.createElement("div"), iconElement)
mapStore.map.addControl(sidebarControl, "top-left")
</script>

<style scoped></style>
