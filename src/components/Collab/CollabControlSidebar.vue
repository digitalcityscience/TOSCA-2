<template>
    <BaseSlideoverSidebarComponent
        :id="sidebarID"
        side="left"
        :collapsed="route.meta.sidebar !== sidebarID"
        width-class="w-[min(24rem,calc(100vw-5rem))]"
    >
        <template #header>
            <div class="flex min-w-0 items-center gap-2">
                <UIcon name="i-lucide-table-2" class="size-4 shrink-0 text-primary" />
                <span class="truncate">{{ t("collab.control.title") }}</span>
            </div>
        </template>

        <p class="text-sm text-muted">{{ t("collab.control.placeholder") }}</p>
        <UButton
            :label="t('collab.control.openTable')"
            icon="i-lucide-monitor-play"
            color="primary"
            class="mt-3"
            @click="openTableWindow"
        />

        <div class="mt-5 flex flex-col gap-2 border-t border-muted pt-4">
            <h3 class="text-sm font-medium">{{ t("collab.control.aoi.title") }}</h3>
            <p class="text-xs text-muted">{{ t("collab.control.aoi.description") }}</p>
            <div class="flex gap-2">
                <UButton
                    v-if="!scenarioStore.aoiSelectionInProgress"
                    :label="t('collab.control.aoi.select')"
                    icon="i-lucide-square-dashed-mouse-pointer"
                    size="sm"
                    variant="soft"
                    @click="scenarioStore.startAoiSelection"
                />
                <template v-else>
                    <UButton
                        :label="t('collab.control.aoi.finish')"
                        icon="i-lucide-check"
                        size="sm"
                        color="primary"
                        @click="finishAoi"
                    />
                    <UButton
                        :label="t('collab.control.aoi.cancel')"
                        icon="i-lucide-x"
                        size="sm"
                        variant="ghost"
                        @click="scenarioStore.cancelAoiSelection"
                    />
                </template>
            </div>
            <p v-if="scenarioStore.aoi !== null" class="text-xs text-success">
                {{ t("collab.control.aoi.selected") }}
            </p>
        </div>

        <div class="mt-5 flex flex-col gap-2 border-t border-muted pt-4">
            <h3 class="text-sm font-medium">{{ t("collab.control.footprints.title") }}</h3>
            <UButton
                :label="t('collab.control.footprints.load')"
                icon="i-lucide-building-2"
                size="sm"
                variant="soft"
                :disabled="scenarioStore.aoi === null"
                @click="scenarioStore.loadFixtureFootprints"
            />
            <p v-if="scenarioStore.aoi === null" class="text-xs text-muted">
                {{ t("collab.control.footprints.loadRequiresAoi") }}
            </p>
            <ul v-if="collabSession.base.loaded" class="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto text-sm">
                <li
                    v-for="building in scenarioStore.selectableBuildings"
                    :key="building.properties.id"
                    class="flex items-center justify-between gap-2"
                >
                    <span :class="{ 'line-through text-muted': isRemoved(building.properties.id) }">
                        {{ building.properties.id }}
                    </span>
                    <UButton
                        v-if="!isRemoved(building.properties.id)"
                        :label="t('collab.control.footprints.remove')"
                        icon="i-lucide-trash-2"
                        size="xs"
                        color="error"
                        variant="ghost"
                        @click="scenarioStore.removeBuilding(building.properties.id)"
                    />
                    <UButton
                        v-else
                        :label="t('collab.control.footprints.restore')"
                        icon="i-lucide-undo-2"
                        size="xs"
                        variant="ghost"
                        @click="scenarioStore.restoreBuilding(building.properties.id)"
                    />
                </li>
            </ul>
        </div>

        <div class="mt-5 flex flex-col gap-2 border-t border-muted pt-4">
            <h3 class="text-sm font-medium">{{ t("collab.control.tracking.title") }}</h3>
            <UButton
                v-if="!trackingRenderStore.active"
                :label="t('collab.control.tracking.start')"
                icon="i-lucide-play"
                size="sm"
                color="primary"
                variant="soft"
                :disabled="!collabSession.base.loaded"
                @click="trackingRenderStore.startMockTracking()"
            />
            <UButton
                v-else
                :label="t('collab.control.tracking.stop')"
                icon="i-lucide-square"
                size="sm"
                variant="ghost"
                @click="trackingRenderStore.stopMockTracking()"
            />
            <p v-if="!collabSession.base.loaded" class="text-xs text-muted">
                {{ t("collab.control.tracking.requiresFootprints") }}
            </p>
            <p v-else-if="trackingRenderStore.active" class="text-xs text-success">
                {{ t("collab.control.tracking.active") }}
            </p>
        </div>
    </BaseSlideoverSidebarComponent>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import BaseSlideoverSidebarComponent from "@components/Base/BaseSlideoverSidebarComponent.vue";
import { useToast } from "@helpers/toast";
import { useCollabSyncStore } from "@store/collabSync";
import { useCollabSessionStore } from "@store/collabSession";
import { useCollabScenarioStore } from "@store/collabScenario";
import { useCollabTrackingRenderStore } from "@store/collabTrackingRender";

const sidebarID = "collabControl";
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const syncStore = useCollabSyncStore();
const collabSession = useCollabSessionStore();
const scenarioStore = useCollabScenarioStore();
const trackingRenderStore = useCollabTrackingRenderStore();

const TABLE_WINDOW_NAME = "toscaCollabTable";

/** Opens (or refocuses) the projector-facing `/collab/table` window (plan §11, ticket 06). */
function openTableWindow(): void {
    const { href } = router.resolve({ name: "collab-table" });
    const tableWindow = window.open(href, TABLE_WINDOW_NAME);
    if (tableWindow === null) {
        toast.add({ severity: "warning", summary: t("collab.control.popupBlocked") });
    }
}

function finishAoi(): void {
    scenarioStore.finishAoiSelection();
}

function isRemoved(id: string): boolean {
    return collabSession.scenario.removedBuildings.includes(id);
}

onMounted(() => {
    syncStore.startAsControl();
    trackingRenderStore.startRendering("control");
});
</script>
