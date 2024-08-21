<template>
	<div class="font-light text-sm">
		<p class="">Do you have a suggestion for an alternate location? Draw your suggestion on the map. You can choose to draw a point, a line or a polygon to explain your suggestion.</p>
	</div>
	<div class="w-full pt-2" v-if="participation.selectedDrawnGeometry.length > 0">
		<ChipWrapper v-for="(feature, index) in participation.selectedDrawnGeometry" :key="feature.id"
			:label="`Item-${index}`" @remove="removeFromSelectedDrawnGeometries(feature)" removable
			severity="success" />
	</div>
	<div class="w-full flex justify-between pt-2">
		<div v-for="draw in drawTool.drawTypes" :key="draw.name" class="flex align-items-center">
			<RadioButton :disabled="drawTool.drawOnProgress || drawTool.editOnProgress" v-model="drawMode"
				:inputId="draw.name" :value="draw.name" />
			<label :for="draw.name" class="ml-2">{{ draw.mode }}</label>
		</div>
	</div>
	<div class="w-full grid lg:grid-cols-1 2xl:grid-cols-2 pt-2">
		<div class="p-1" v-if="!drawTool.drawOnProgress && !drawTool.editOnProgress">
			<Button class="w-full" size="small" @click="startDraw">Start Drawing</Button>
		</div>
		<div v-if="(drawTool.drawOnProgress || drawTool.editOnProgress)">
			<div class="p-1" >
				<Button class="w-full" size="small" :disabled="!(drawTool.drawOnProgress || drawTool.editOnProgress)"
					@click="drawTool.stopDrawMode">Cancel Drawing</Button>
			</div>
			<div class="p-1">
				<Button class="w-full" size="small" @click="addToDrawnArea">Add to Items</Button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import Button from "primevue/button"
import RadioButton from "primevue/radiobutton";
import ChipWrapper from "@components/Base/ChipWrapper.vue"
import { useDrawStore } from "@store/draw"
import { useParticipationStore } from "@store/participation";
import { type Feature } from "geojson"
import { ref } from "vue";

const participation = useParticipationStore()
const drawTool = useDrawStore()
const drawMode = ref("polygon")
function startDraw(): void{
    drawTool.drawMode = drawMode.value
    drawTool.initDrawMode()
}
function addToDrawnArea(): void{
    const drawnAreas = drawTool.getSnapshot()
    if (drawnAreas.length > 0) {
        drawnAreas.forEach((feature)=> {
            try {
                participation.addToSelectedDrawnGeometry(feature)
            } catch (error) {
                console.error(error)
            }
        })
        drawTool.stopDrawMode()
    } else {
        console.error("there is no polygon to add")
    }
}
function removeFromSelectedDrawnGeometries(item: Feature): void {
    try {
        participation.removeFromSelectedDrawnGeometry(item)
        participation.updateSelectedAreasTempLayer()
    } catch (error) {
        console.error(error)
    }
}
</script>

<style scoped>

</style>
