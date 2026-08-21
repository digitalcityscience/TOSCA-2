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
    </BaseSlideoverSidebarComponent>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import BaseSlideoverSidebarComponent from "@components/Base/BaseSlideoverSidebarComponent.vue";
import { useToast } from "@helpers/toast";
import { useCollabSyncStore } from "@store/collabSync";

const sidebarID = "collabControl";
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const syncStore = useCollabSyncStore();

const TABLE_WINDOW_NAME = "toscaCollabTable";

/** Opens (or refocuses) the projector-facing `/collab/table` window (plan §11, ticket 06). */
function openTableWindow(): void {
    const { href } = router.resolve({ name: "collab-table" });
    const tableWindow = window.open(href, TABLE_WINDOW_NAME);
    if (tableWindow === null) {
        toast.add({ severity: "warning", summary: t("collab.control.popupBlocked") });
    }
}

onMounted(() => {
    syncStore.startAsControl();
});
</script>
