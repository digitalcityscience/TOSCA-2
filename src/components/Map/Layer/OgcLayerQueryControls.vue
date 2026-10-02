<template>
    <div v-if="state" class="space-y-3">
        <div class="space-y-1 text-xs">
            <p class="flex items-center gap-1.5 text-muted">
                <UIcon v-if="state.loading" name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
                <UIcon v-else :name="modeIcon" class="size-3.5" />
                <span>{{ statusLabel }}</span>
            </p>
            <UProgress
                v-if="state.mode === 'full' && state.loading"
                size="xs"
                :model-value="progressPercent"
                :max="100"
            />
            <p v-if="isViewTruncated && !state.loading" class="text-warning">{{ t('map.ogcQuery.zoomIn') }}</p>
            <p v-if="state.stopped" class="text-warning">{{ t('map.ogcQuery.loadAllStopped') }}</p>
            <div v-if="state.errorKind" class="flex items-center justify-between gap-2">
                <p class="text-error">
                    {{ state.errorKind === 'filter' ? t('map.ogcQuery.filterRejected') : t('map.ogcQuery.requestFailed') }}
                </p>
                <UButton size="xs" variant="soft" color="neutral" :label="t('workspace.external.retry')" @click="ogcLayers.refreshLayer(props.layerId)" />
            </div>
        </div>

        <div v-if="state.mode === 'viewport'" class="space-y-1 rounded-md border border-muted p-2">
            <p class="text-xs text-toned">{{ t('map.ogcQuery.loadAllHint', { pages: pageCount }) }}</p>
            <p v-if="suggestFewerAttributes" class="text-xs text-warning">{{ t('map.ogcQuery.loadAllAttributesHint') }}</p>
            <div class="flex justify-end">
                <UButton
                    size="sm"
                    icon="i-lucide-layers"
                    :disabled="state.loading"
                    :label="t('map.ogcQuery.loadAll', { total: formattedTotal })"
                    @click="requestLoadAll"
                />
            </div>
            <UModal v-model:open="confirmLoadAllOpen" :title="t('map.ogcQuery.confirmLoadAllTitle')" :ui="{ content: 'max-w-[26rem]' }">
                <template #body>
                    <div class="space-y-2 text-sm">
                        <p class="text-toned">{{ t('map.ogcQuery.confirmLoadAllBody', { total: formattedTotal, pages: pageCount, memory: estimatedMemoryLabel }) }}</p>
                        <p class="text-muted">{{ t('map.ogcQuery.confirmLoadAllRisk') }}</p>
                        <p v-if="state.properties === undefined" class="text-warning">{{ t('map.ogcQuery.loadAllAttributesHint') }}</p>
                    </div>
                </template>
                <template #footer>
                    <div class="flex w-full justify-end gap-2">
                        <UButton size="sm" color="neutral" variant="soft" :label="t('common.cancel')" @click="confirmLoadAllOpen = false" />
                        <UButton size="sm" color="warning" :label="t('map.ogcQuery.loadAll', { total: formattedTotal })" @click="startLoadAll" />
                    </div>
                </template>
            </UModal>
        </div>
        <div v-else-if="state.mode === 'full'" class="flex justify-end gap-2">
            <UButton
                v-if="state.loading"
                size="xs"
                variant="soft"
                color="neutral"
                icon="i-lucide-square"
                :label="t('common.cancel')"
                @click="ogcLayers.cancelFullLoad(props.layerId)"
            />
            <UButton
                v-else-if="state.stopped"
                size="xs"
                variant="soft"
                color="neutral"
                icon="i-lucide-rotate-cw"
                :label="t('map.ogcQuery.reloadAll')"
                @click="ogcLayers.refreshLayer(props.layerId)"
            />
        </div>

        <UAlert
            v-if="attributeQueryables.length === 0"
            color="neutral"
            variant="soft"
            :description="t('map.ogcQuery.noQueryables')"
        />
        <template v-else>
            <div class="space-y-1">
                <p class="text-xs font-medium text-toned">{{ t('map.ogcQuery.attributes') }}</p>
                <USelectMenu
                    v-model="draftProperties"
                    class="w-full"
                    size="sm"
                    multiple
                    value-key="value"
                    :items="attributeItems"
                    :placeholder="t('map.ogcQuery.allAttributes')"
                    :search-input="{ placeholder: t('workspace.external.searchPlaceholder') }"
                />
            </div>

            <div class="space-y-1">
                <p class="text-xs font-medium text-toned">{{ t('map.ogcQuery.filter') }}</p>
                <div
                    v-for="(condition, index) in draftConditions"
                    :key="index"
                    class="space-y-1 rounded-md border border-muted p-2"
                >
                    <div class="flex items-center gap-1">
                        <USelect
                            class="min-w-0 flex-1"
                            size="sm"
                            :model-value="condition.property"
                            :items="attributeItems"
                            :placeholder="t('map.ogcQuery.selectAttribute')"
                            @update:model-value="setConditionProperty(index, String($event))"
                        />
                        <UButton
                            size="xs"
                            color="neutral"
                            variant="ghost"
                            icon="i-lucide-x"
                            :aria-label="t('common.remove')"
                            @click="draftConditions.splice(index, 1)"
                        />
                    </div>
                    <div class="flex items-center gap-1">
                        <USelect
                            v-model="condition.operator"
                            class="w-32 shrink-0"
                            size="sm"
                            :items="operatorItems(condition.property)"
                        />
                        <USelect
                            v-if="queryableType(condition.property) === 'boolean'"
                            v-model="condition.value"
                            class="min-w-0 flex-1"
                            size="sm"
                            :items="booleanItems"
                        />
                        <UInput
                            v-else
                            v-model="condition.value"
                            class="min-w-0 flex-1"
                            size="sm"
                            :inputmode="isNumeric(condition.property) ? 'decimal' : 'text'"
                            :placeholder="t('map.ogcQuery.value')"
                            @keydown.enter="apply"
                        />
                    </div>
                </div>
                <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-plus"
                    :label="t('map.ogcQuery.addCondition')"
                    @click="addCondition"
                />
            </div>

            <p v-if="validationError" class="text-xs text-error">{{ validationError }}</p>
            <div class="flex justify-end gap-2">
                <UButton size="sm" variant="soft" color="neutral" :label="t('common.reset')" :disabled="state.loading" @click="reset" />
                <UButton size="sm" :label="t('common.apply')" :loading="state.loading" :disabled="!isDirty" @click="apply" />
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useOgcLayersStore } from "@store/ogcLayers";
import { OGC_API_MAX_PAGE_SIZE, type OgcQueryableType } from "@store/externalDataSources";
import {
    OgcFilterValueError,
    completeConditions,
    operatorsForType,
    type OgcFilterCondition,
    type OgcFilterOperator,
} from "@helpers/ogcCql2";

export interface Props {
    layerId: string
}
const props = defineProps<Props>()
const { t, locale } = useI18n();
const ogcLayers = useOgcLayersStore()
const LOAD_ALL_ATTRIBUTE_HINT_THRESHOLD = 50000
/**
 * Rough browser memory per loaded feature (geometry, GPU-side copies and
 * properties). Measured ~2 KB per ALKIS parcel with one attribute.
 */
const BYTES_PER_FEATURE = 1800
const BYTES_PER_ATTRIBUTE = 250
/** Ask for confirmation above this estimated memory use. */
const LOAD_ALL_CONFIRM_BYTES = 300 * 1024 * 1024
const confirmLoadAllOpen = ref(false)

const state = computed(() => ogcLayers.layers[props.layerId])
const attributeQueryables = computed(() => state.value?.queryables.filter((item) => !item.isGeometry) ?? [])
const attributeItems = computed(() => attributeQueryables.value.map((item) => ({ label: item.title, value: item.name })))
const booleanItems = computed(() => [
    { label: t("map.ogcQuery.true"), value: "true" },
    { label: t("map.ogcQuery.false"), value: "false" },
])

const draftProperties = ref<string[]>([])
const draftConditions = ref<OgcFilterCondition[]>([])
const validationError = ref<string>()

function syncDraft(): void {
    draftProperties.value = [...(state.value?.properties ?? [])]
    draftConditions.value = (state.value?.conditions ?? []).map((condition) => ({ ...condition }))
    validationError.value = undefined
}
watch(() => state.value?.layerId, syncDraft, { immediate: true })

/** Empty or "everything selected" both mean: do not restrict properties. */
function normalizedProperties(selection: string[]): string[] | undefined {
    return selection.length === 0 || selection.length === attributeQueryables.value.length ? undefined : [...selection]
}

const isDirty = computed(() => {
    if (state.value === undefined) return false
    const applied = JSON.stringify([state.value.properties ?? null, completeConditions(state.value.conditions, state.value.queryables)])
    const draft = JSON.stringify([
        normalizedProperties(draftProperties.value) ?? null,
        completeConditions(draftConditions.value, state.value.queryables),
    ])
    return applied !== draft
})

const formattedTotal = computed(() => state.value?.totalMatched?.toLocaleString(locale.value) ?? "?")
const pageCount = computed(() => Math.max(1, Math.ceil((state.value?.totalMatched ?? 0) / OGC_API_MAX_PAGE_SIZE)))
const progressPercent = computed(() => {
    const total = state.value?.totalMatched
    if (total === undefined || total === 0) return undefined
    return Math.min(100, Math.round((state.value!.loadedCount / total) * 100))
})
/** Large downloads are mostly attribute payload; nudge towards selecting fewer. */
const suggestFewerAttributes = computed(() =>
    state.value?.properties === undefined &&
    (state.value?.totalMatched ?? 0) > LOAD_ALL_ATTRIBUTE_HINT_THRESHOLD &&
    attributeQueryables.value.length > 3
)
const estimatedMemoryBytes = computed(() => {
    const current = state.value
    if (current?.totalMatched === undefined) return 0
    const attributeCount = current.properties?.length ?? attributeQueryables.value.length
    return current.totalMatched * (BYTES_PER_FEATURE + BYTES_PER_ATTRIBUTE * attributeCount)
})
const estimatedMemoryLabel = computed(() =>
    Math.round(estimatedMemoryBytes.value / (1024 * 1024)).toLocaleString(locale.value)
)

/** Large loads can exhaust memory on small devices, so they need a confirmation. */
function requestLoadAll(): void {
    if (estimatedMemoryBytes.value > LOAD_ALL_CONFIRM_BYTES) {
        confirmLoadAllOpen.value = true
        return
    }
    void ogcLayers.loadAll(props.layerId)
}

function startLoadAll(): void {
    confirmLoadAllOpen.value = false
    void ogcLayers.loadAll(props.layerId)
}

const modeIcon = computed(() => ({
    all: "i-lucide-database",
    viewport: "i-lucide-scan",
    full: "i-lucide-layers",
})[state.value?.mode ?? "all"])

const isViewTruncated = computed(() =>
    state.value?.mode === "viewport" &&
    state.value.viewMatched !== undefined &&
    state.value.viewMatched > state.value.loadedCount
)

const statusLabel = computed(() => {
    const current = state.value
    if (current === undefined) return ""
    const loaded = current.loadedCount.toLocaleString(locale.value)
    const total = current.totalMatched?.toLocaleString(locale.value) ?? "?"
    if (current.mode === "all") {
        return t("map.ogcQuery.statusAll", { loaded, total })
    }
    if (current.mode === "full") {
        return t("map.ogcQuery.statusFull", { loaded, total })
    }
    return t("map.ogcQuery.statusViewport", {
        loaded,
        inView: current.viewMatched?.toLocaleString(locale.value) ?? loaded,
        total,
    })
})

function queryableType(property: string): OgcQueryableType {
    return attributeQueryables.value.find((item) => item.name === property)?.type ?? "other"
}

function isNumeric(property: string): boolean {
    const type = queryableType(property)
    return type === "number" || type === "integer"
}

function operatorItems(property: string): Array<{ label: string, value: OgcFilterOperator }> {
    return operatorsForType(queryableType(property)).map((operator) => ({
        label: t(`map.ogcQuery.operators.${operator}`),
        value: operator,
    }))
}

function setConditionProperty(index: number, property: string): void {
    const condition = draftConditions.value[index]
    condition.property = property
    condition.operator = operatorsForType(queryableType(property))[0]
    condition.value = queryableType(property) === "boolean" ? "true" : ""
}

function addCondition(): void {
    draftConditions.value.push({ property: "", operator: "eq", value: "" })
}

async function apply(): Promise<void> {
    if (!isDirty.value || state.value?.loading === true) return
    validationError.value = undefined
    try {
        await ogcLayers.updateLayerQuery(props.layerId, {
            properties: normalizedProperties(draftProperties.value),
            conditions: draftConditions.value.map((condition) => ({ ...condition })),
        })
    } catch (error) {
        if (error instanceof OgcFilterValueError) {
            const title = attributeQueryables.value.find((item) => item.name === error.property)?.title ?? error.property
            validationError.value = t("map.ogcQuery.invalidValue", { property: title })
            return
        }
        throw error
    }
}

async function reset(): Promise<void> {
    draftProperties.value = []
    draftConditions.value = []
    validationError.value = undefined
    if (isDirty.value) await apply()
}
</script>
