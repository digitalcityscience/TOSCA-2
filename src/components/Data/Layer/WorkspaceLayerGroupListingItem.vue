<template>
    <UCard
        class="group-layer-card overflow-hidden bg-default/95 dark:bg-elevated/80"
        :ui="{ header: 'p-3 pb-2', body: 'p-3 pt-1', footer: 'p-3 pt-2' }"
    >
        <template #header>
            <div class="flex min-w-0 items-start gap-3">
                <div class="group-layer-mark" aria-hidden="true">
                    <span></span><span></span><span></span>
                </div>
                <div class="min-w-0 flex-1 space-y-1">
                    <p class="layer-card-title font-semibold text-highlighted">{{ item.title }}</p>
                    <div class="flex flex-wrap items-center gap-2">
                        <UBadge color="primary" variant="soft" size="sm" :label="t('workspace.groupItem.group')" />
                        <UBadge
                            color="neutral"
                            variant="soft"
                            size="sm"
                            :label="compositionLabel"
                        />
                    </div>
                    <p class="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted">
                        {{ t('workspace.groupItem.memberCount', { count: item.member_count }) }}
                    </p>
                </div>
            </div>
        </template>
        <div v-if="item.description" class="space-y-1">
            <RichDescription
                ref="descriptionElement"
                :content="item.description_content"
                :fallback="item.description"
                :clamp-lines="isDescriptionExpanded ? undefined : 3"
            />
            <UButton
                v-if="isDescriptionTruncated || isDescriptionExpanded"
                size="xs"
                color="neutral"
                variant="link"
                class="h-auto justify-start p-0"
                @click="isDescriptionExpanded = !isDescriptionExpanded"
            >
                {{ isDescriptionExpanded ? t('workspace.layerItem.showLess') : t('workspace.layerItem.readMore') }}
            </UButton>
        </div>
        <p v-else class="text-sm italic text-dimmed">{{ t('workspace.groupItem.noDescription') }}</p>
        <template #footer>
            <div class="flex justify-end">
                <UButton
                    size="sm"
                    icon="i-lucide-layers-3"
                    :loading="isAdding"
                    :disabled="isAdding"
                    @click="addGroupToMap"
                >
                    {{ t('workspace.groupItem.addToMap') }}
                </UButton>
            </div>
        </template>
    </UCard>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { type CatalogLayerGroupListItem, useGeoserverStore } from "@store/geoserver";
import { useMapStore } from "@store/map";
import { useToast } from "@helpers/toast";
import RichDescription from "@components/Base/RichDescription.vue";

const props = defineProps<{ item: CatalogLayerGroupListItem }>();
const compositionLabel = computed(() => {
    if (props.item.composition === "VECTOR") return t("workspace.layerItem.vector");
    if (props.item.composition === "RASTER") return t("workspace.layerItem.raster");
    return t("workspace.layerItem.mixed");
});
const { t } = useI18n();
const catalog = useGeoserverStore();
const mapStore = useMapStore();
const toast = useToast();
const isAdding = ref(false);
const isDescriptionExpanded = ref(false);
const isDescriptionTruncated = ref(false);
const descriptionElement = ref<InstanceType<typeof RichDescription>>();

const handleResize = (): void => {
    void updateDescriptionTruncation();
};

onMounted(() => {
    window.addEventListener("resize", handleResize);
    void updateDescriptionTruncation();
});

onBeforeUnmount(() => {
    window.removeEventListener("resize", handleResize);
});

watch(() => props.item.description, () => {
    isDescriptionExpanded.value = false;
    void nextTick(updateDescriptionTruncation);
});

async function updateDescriptionTruncation(): Promise<void> {
    await nextTick();
    isDescriptionTruncated.value = descriptionElement.value?.isTruncated() ?? false;
}

async function addGroupToMap(): Promise<void> {
    isAdding.value = true;
    try {
        const manifest = await catalog.getLayerGroup(props.item);
        await mapStore.addMapGroup(manifest);
    } catch (error) {
        toast.add({ severity: "error", summary: t("toast.error"), detail: error, life: 4000 });
    } finally {
        isAdding.value = false;
    }
}
</script>

<style scoped>
.group-layer-card {
    border-left: 3px solid color-mix(in srgb, var(--ui-primary) 68%, transparent);
}

.layer-card-title {
    min-width: 0;
    overflow-wrap: anywhere;
    line-height: 1.35;
}

.group-layer-mark {
    position: relative;
    width: 2rem;
    height: 2rem;
    flex: 0 0 auto;
}

.group-layer-mark span {
    position: absolute;
    width: 1.25rem;
    height: 0.82rem;
    border: 1px solid color-mix(in srgb, var(--ui-primary) 75%, transparent);
    border-radius: 0.18rem;
    background: color-mix(in srgb, var(--ui-primary) 13%, var(--ui-bg));
    transform: skewX(-14deg);
}

.group-layer-mark span:nth-child(1) { top: 0.15rem; left: 0.45rem; }
.group-layer-mark span:nth-child(2) { top: 0.58rem; left: 0.3rem; }
.group-layer-mark span:nth-child(3) { top: 1.02rem; left: 0.15rem; }
</style>
