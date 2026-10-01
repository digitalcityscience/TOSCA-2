<template>
    <div class="workspace-detail space-y-3 pt-1">
        <div v-if="isLoading" class="space-y-2">
            <USkeleton class="h-8 w-full rounded-md" />
            <USkeleton class="h-24 w-full rounded-md" />
            <USkeleton class="h-24 w-full rounded-md" />
        </div>
        <UAlert v-else-if="loadError" class="w-full" color="error" variant="soft" :description="loadError" />
        <template v-else>
            <div class="flex items-center gap-2">
                <UInput
                    v-model="query"
                    class="flex-1"
                    size="sm"
                    icon="i-lucide-search"
                    :placeholder="t('workspace.external.searchPlaceholder')"
                />
                <UBadge
                    color="neutral"
                    variant="soft"
                    size="sm"
                    :label="t('workspace.external.sensorthings.propertyCount', { count: filteredProperties.length })"
                />
            </div>
            <SensorThingsPropertyListingItem
                v-for="property in filteredProperties"
                :key="String(property.id)"
                :source="props.source"
                :property="property"
            />
            <UAlert
                v-if="filteredProperties.length === 0"
                class="w-full"
                color="info"
                variant="soft"
                :description="t('workspace.external.noResults')"
            />
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { ExternalDataSourceConfig } from "../../../config/externalDataSources";
import {
    useExternalDataSourcesStore,
    type SensorThingsObservedProperty,
} from "@store/externalDataSources";
import { reportDeveloperError } from "@helpers/userFacingError";
import SensorThingsPropertyListingItem from "./SensorThingsPropertyListingItem.vue";

export interface Props {
    source: ExternalDataSourceConfig
}
const props = defineProps<Props>()
const { t } = useI18n();
const externalSources = useExternalDataSourcesStore()

const properties = ref<SensorThingsObservedProperty[]>([])
const isLoading = ref(true)
const loadError = ref<string>()
const query = ref("")

const filteredProperties = computed(() => {
    const needle = query.value.trim().toLocaleLowerCase()
    if (needle === "") return properties.value
    return properties.value.filter((property) =>
        property.name.toLocaleLowerCase().includes(needle) ||
        property.description.toLocaleLowerCase().includes(needle)
    )
})

onMounted(() => {
    externalSources.getSensorThingsObservedProperties(props.source).then((response) => {
        properties.value = response
    }).catch((error) => {
        loadError.value = t("workspace.external.loadError")
        reportDeveloperError(`Loading SensorThings observed properties from ${props.source.url}`, error)
    }).finally(() => {
        isLoading.value = false
    })
})
</script>
