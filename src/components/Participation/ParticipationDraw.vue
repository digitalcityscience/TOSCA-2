<template>
	<div class="font-light text-sm">
		<p class="">{{ t('participation.draw.instructions') }}</p>
	</div>
	<div class="w-full pt-2" v-if="participation.selectedDrawnGeometry.length > 0">
		<ChipWrapper v-for="(feature, index) in participation.selectedDrawnGeometry" :key="feature.id"
			:label="t('participation.draw.itemLabel', { index })" @remove="removeFromSelectedDrawnGeometries(feature)" removable
			severity="success" />
	</div>
	<div class="w-full pt-2">
		<URadioGroup
			v-model="drawMode"
			:items="drawModeOptions"
			:disabled="drawTool.drawOnProgress || drawTool.editOnProgress"
			orientation="horizontal"
		/>
	</div>
	<div class="w-full grid lg:grid-cols-1 pt-2">
		<div class="py-1" v-if="!drawTool.drawOnProgress && !drawTool.editOnProgress">
			<UButton class="w-full" size="sm" @click="startDraw">{{ t('participation.draw.startDrawing') }}</UButton>
		</div>
		<div class="" v-if="(drawTool.drawOnProgress || drawTool.editOnProgress)">
			<div class="py-1" >
				<UButton class="w-full" size="sm" :disabled="!(drawTool.drawOnProgress || drawTool.editOnProgress)"
					@click="cancelDrawing">{{ t('participation.draw.cancelDrawing') }}</UButton>
			</div>
			<div class="py-1">
				<UButton class="w-full" size="sm" @click="addToDrawnArea">{{ t('participation.draw.addToItems') }}</UButton>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import ChipWrapper from "@components/Base/ChipWrapper.vue"
import { type DrawMode, useDrawStore } from "@store/draw"
import { useParticipationStore } from "@store/participation";
import { type Feature } from "@helpers/geojson"
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const participation = useParticipationStore()
const drawTool = useDrawStore()
const drawMode = ref<DrawMode>("polygon")
const drawModeOptions = computed(() => {
    return drawTool.drawTypes.map((draw) => ({
        label: draw.mode,
        value: draw.name,
    }))
})
function startDraw(): void{
    drawTool.drawMode = drawMode.value
    drawTool.initDrawMode()
    drawTool.externalAppOnProgress = true;
}
function addToDrawnArea(): void{
    try {
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
        drawTool.externalAppOnProgress = false;
    } catch (error) {
        console.error(error)
    }
}
function cancelDrawing(): void{
    drawTool.stopDrawMode()
    drawTool.externalAppOnProgress = false;
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
