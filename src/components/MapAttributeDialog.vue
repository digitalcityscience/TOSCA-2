<template>
	<div class="w-full text-base">
		<Card class="w-60 h-72 overflow-y-auto" :pt="cardPTOptions">
			<template #subtitle>Clicked features</template>
			<template  v-if="props.features !== undefined" #content>
				<Accordion :multiple="true" :activeIndex="[]" :pt="accordPTOptions">
                    <AccordionTab headerClass="rounded-lg" v-for="(source, index) in Object.entries(mergedFeatures).map(([name, value]) => ({ name, value }))" :key="index" :pt="accordPTOptions">
                        <template #header>
                            <span class="capitalize">{{ createDisplayName(source.name) }}</span>
                        </template>
                        <div class="max-h-60 overflow-y-auto divide-y-2">
							<div v-for="(feature, ind) in source.value" :key="ind" class="p-2 odd:bg-gray-100">
								<p v-for="(property,i) in Object.entries(feature.properties).map(([name, value]) => ({ name, value }))" :key="i">
									<span class="font-bold">{{ property.name }}</span>: <span>{{ property.value }}</span>
								</p>
							</div>
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
import { computed } from "vue";
import { type MapGeoJSONFeature } from "maplibre-gl";

const mapStore = useMapStore()
interface Props {
    features: MapGeoJSONFeature[]|undefined
}
type GroupedFeatures = Record<string, MapGeoJSONFeature[]>;
const props = defineProps<Props>()

const mergedFeatures = computed(()=>{
    if (props.features !== undefined){
        const groupedFeatures = props.features.reduce<GroupedFeatures>((acc, feature) => {
            const source = feature.source;
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (!acc[source]) {
                acc[source as any] = [];
            }
            acc[source as any].push(feature);
            return acc;
        }, {})
        return groupedFeatures
    }
    return []
})
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
