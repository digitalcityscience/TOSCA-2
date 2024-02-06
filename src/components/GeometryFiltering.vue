<template>
	<div class="geometry-filter">
		<div class="new-filter">
			<Card>
				<template #title>Geometry Filtering</template>
				<template #subtitle>Select geometry layer to filter this layer</template>
				<template #content>
					<div v-if="filterLayerList.length>0">
						<Dropdown v-model="selectedFilterLayer" :options="filterLayerList" option-label="source" show-clear
                    placeholder="Select an filter layer"></Dropdown>
					</div>
					<div v-else>There is no layer for filter. Please draw a layer first!</div>
				</template>
				<template #footer>
					<Button :disabled="selectedFilterLayer === undefined">Add Filter</Button>
				</template>
			</Card>
		</div>
	</div>
</template>

<script setup lang="ts">
import Dropdown from "primevue/dropdown";
import Card from "primevue/card";
import Button from "primevue/button";
import { type CustomAddLayerObject, useMapStore } from "../store/map";
import { computed, ref } from "vue";

const mapStore = useMapStore()
const selectedFilterLayer = ref<CustomAddLayerObject>()
const filterLayerList = computed(() => {
    return mapStore.layersOnMap.filter((layer) => { return layer.filterLayer === true })
})
</script>

<style scoped></style>
