<template>
	<div class="w-full text-base">
		<Card class="w-60 h-72 overflow-y-auto" :pt="cardPTOptions">
			<template #subtitle>Clicked features</template>
			<template  v-if="props.features !== undefined" #content>
				<Accordion :multiple="true" :activeIndex="[]" :pt="accordPTOptions">
                    <AccordionTab headerClass="rounded-lg" v-for="(feature, index) in props.features" :key="index" :pt="accordPTOptions">
                        <template #header>
                            <span class="capitalize">{{ createDisplayName(feature.layer.source) }}</span>
                        </template>
                        <div class="max-h-60 overflow-y-auto">
						<p v-for="(property, ind) in Object.entries(feature.properties).map(([name, value]) => ({ name, value }))" :key="ind">
							<span class="font-bold">{{ property.name }}</span>: <span>{{ property.value }}</span>
						</p>
					</div>
                    </AccordionTab>
                </Accordion>
			</template>
		</Card>
	</div>
</template>

<script setup lang="ts">
import Card from "primevue/card";
import Accordion from "primevue/accordion";
import AccordionTab from "primevue/accordiontab";
import { useMapStore } from "../store/map"
import cardPTOptions from "../presets/tosca/card/index.ts"
import accordPTOptions from "../presets/tosca/accordion/index.ts"

const mapStore = useMapStore()
interface Props {
    features: any[]|undefined
}
const props = defineProps<Props>()

function createDisplayName(source: string): string{
    const layer = mapStore.layersOnMap.filter((layer)=>{ return source === layer.source })[0]
    if (layer !== undefined){
        return (layer.displayName !== undefined && layer.displayName !== "") ? layer.displayName.replaceAll("_", " ") : layer.source.replaceAll("_", " ")
    } else {
        return "-x-x-x-"
    }
}

</script>

<style scoped>

</style>
