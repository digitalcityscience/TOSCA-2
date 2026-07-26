<template>
    <div class="map-attribute-dialog box-border min-w-0 overflow-hidden text-sm">
        <UCard
            class="map-attribute-card min-w-0 w-full overflow-hidden bg-default/95 shadow-none ring-0 dark:bg-elevated/95"
            :ui="{
                body: 'map-attribute-dialog-body min-h-0 flex-1 overflow-y-auto p-2.5 sm:p-3'
            }"
        >
            <template v-if="props.features !== undefined" #default>
                <UAccordion
                    class="min-w-0 w-full"
                    :items="attributeAccordionItems"
                    type="multiple"
                    :default-value="[]"
                    :ui="{
                        item: 'min-w-0 rounded-md border border-muted !border-b last:!border-b bg-default/70 mb-2 overflow-hidden',
                        trigger: 'px-3 py-2 rounded-none text-highlighted hover:bg-elevated/70',
                        label: 'text-sm font-semibold capitalize truncate pr-16',
                        body: 'min-w-0 overflow-hidden border-t border-muted bg-elevated/30 p-2.5'
                    }"
                    @update:model-value="emitSizeChange"
                >
                    <template #body="{ item }">
                        <div class="space-y-3">
                            <div v-for="(feature, ind) in item.features" :key="ind" class="min-w-0 overflow-hidden rounded-md border border-muted bg-default/80">
                                <div class="border-b border-muted px-2.5 py-1.5">
                                    <UBadge color="neutral" variant="soft" size="sm" :label="t('map.attributeDialog.featureLabel', { index: ind + 1 })" />
                                </div>
                                <dl v-if="getPropertyRows(feature).length > 0" class="divide-y divide-muted">
                                    <div v-for="property in getPropertyRows(feature)" :key="property.name" class="grid min-w-0 gap-1 px-2.5 py-1.5 sm:grid-cols-[minmax(7rem,12rem)_minmax(0,1fr)] sm:gap-3">
                                        <dt class="min-w-0 break-words text-[0.6875rem] font-semibold uppercase tracking-wide text-muted [overflow-wrap:anywhere]">
                                            {{ property.name }}
                                        </dt>
                                        <dd class="min-w-0 break-words text-[0.8125rem] text-default [overflow-wrap:anywhere]">
                                            {{ property.value }}
                                        </dd>
                                    </div>
                                </dl>
                                <UAlert v-else color="neutral" variant="soft" :description="t('map.attributeDialog.noAttributes')" />
                            </div>
                        </div>
                    </template>
                </UAccordion>
            </template>
        </UCard>
    </div>
</template>

<script setup lang="ts">
import { useMapStore } from "@store/map"
import { computed } from "vue";
import { type MapGeoJSONFeature } from "maplibre-gl";
import { i18n } from "../../core/i18n";

const t = i18n.global.t;
const mapStore = useMapStore()
interface Props {
    features: MapGeoJSONFeature[] | undefined
}
const emit = defineEmits<{
    sizeChange: []
}>()
type GroupedFeatures = Record<string, MapGeoJSONFeature[]>;
const props = defineProps<Props>()

const mergedFeatures = computed(() => {
    if (props.features !== undefined) {
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
const attributeAccordionItems = computed(() => {
    return Object.entries(mergedFeatures.value).map(([name, features]) => ({
        label: createDisplayName(name),
        value: name,
        features,
    }))
})
function createDisplayName(source: string): string {
    const layer = mapStore.layersOnMap.filter((layer) => { return source === layer.source })[0]
    if (layer !== undefined) {
        return (layer.displayName !== undefined && layer.displayName !== "") ? layer.displayName.replaceAll("_", " ") : layer.source.replaceAll("_", " ")
    } else {
        return "-x-x-x-"
    }
}

function getPropertyRows(feature: MapGeoJSONFeature): Array<{ name: string; value: string }> {
    return Object.entries(feature.properties ?? {})
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([name, value]) => ({
            name,
            value: String(value),
        }))
}

function emitSizeChange(): void {
    window.requestAnimationFrame(() => {
        emit("sizeChange")
    })
}

</script>

<style scoped></style>
