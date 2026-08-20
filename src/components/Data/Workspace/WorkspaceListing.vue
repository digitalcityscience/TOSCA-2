<template>
        <BaseSlideoverSidebarComponent
            :id="sidebarID"
            side="left"
            :collapsed="route.meta.sidebar !== sidebarID"
        >
            <template #header>
                <p>{{ t('workspace.listing.title') }}</p>
        </template>
            <div class="w-full p-3">
                <UAccordion
                    :items="workspaceAccordionItems"
                    type="multiple"
                    :default-value="[]"
                    :ui="{
                        item: 'rounded-md border border-muted !border-b last:!border-b bg-default/70 mb-2 overflow-hidden',
                        trigger: 'px-3 py-2.5 rounded-none text-highlighted hover:bg-elevated/70',
                        label: 'text-base font-semibold capitalize truncate',
                        body: 'p-3 bg-elevated/40 border-t border-muted'
                    }"
                >
                    <template #body="{ item }">
                        <Workspace3DDataListingItem v-if="item.mock3d" />
                        <WorkspaceListingItem v-else :workspace="item.workspace"></WorkspaceListingItem>
                    </template>
                </UAccordion>
                <UAlert v-if="!props.workspaces || props.workspaces.length === 0" class="w-full mt-2" color="info" variant="soft" :description="t('workspace.listing.noWorkspace')" />
            </div>
        </BaseSlideoverSidebarComponent>
</template>

<script setup lang="ts">
// Components
import BaseSlideoverSidebarComponent from "@components/Base/BaseSlideoverSidebarComponent.vue";
import WorkspaceListingItem from "./WorkspaceListingItem.vue";
import Workspace3DDataListingItem from "./Workspace3DDataListingItem.vue";
// JS-TS imports
import { type WorkspaceListItem } from "@store/geoserver";

import { useRoute } from "vue-router";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
export interface Props {
    workspaces: WorkspaceListItem[] | undefined
}
const { t } = useI18n();
const props = defineProps<Props>()
const sidebarID = "workspaceListing"
const workspaceAccordionItems = computed(() => {
    const realWorkspaceItems = props.workspaces?.map((workspace) => ({
        label: `${workspace.provider.name} · ${workspace.name}`,
        value: `${workspace.provider.id}:${workspace.name}`,
        workspace,
        mock3d: false,
    })) ?? []
    // Synthetic accordion entry for the deck.gl 3D Tiles demo — see
    // Workspace3DDataListingItem.vue for why this bypasses the real catalog.
    const mock3dItem = {
        label: t("workspace.demo3d.accordionLabel"),
        value: "mock:3d-data",
        workspace: undefined as unknown as WorkspaceListItem,
        mock3d: true,
    }
    return [...realWorkspaceItems, mock3dItem]
})

const route = useRoute()
</script>
