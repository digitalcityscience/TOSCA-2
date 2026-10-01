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
                        <Workspace3DDataListingItem v-if="item.kind === 'mock3d'" />
                        <OgcApiSourceListing v-else-if="item.kind === 'ogc-api' && item.source" :source="item.source" />
                        <SensorThingsSourceListing v-else-if="item.kind === 'sensorthings' && item.source" :source="item.source" />
                        <WorkspaceListingItem v-else-if="item.workspace" :workspace="item.workspace"></WorkspaceListingItem>
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
import OgcApiSourceListing from "@components/Data/External/OgcApiSourceListing.vue";
import SensorThingsSourceListing from "@components/Data/External/SensorThingsSourceListing.vue";
// JS-TS imports
import { type WorkspaceListItem } from "@store/geoserver";
import { useExternalDataSourcesStore } from "@store/externalDataSources";
import type { ExternalDataSourceConfig, ExternalDataSourceType } from "../../../config/externalDataSources";

import { useRoute } from "vue-router";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
export interface Props {
    workspaces: WorkspaceListItem[] | undefined
}
const { t } = useI18n();
const props = defineProps<Props>()
const sidebarID = "workspaceListing"
interface WorkspaceAccordionItem {
    label: string
    value: string
    kind: "catalog" | "mock3d" | ExternalDataSourceType
    workspace?: WorkspaceListItem
    source?: ExternalDataSourceConfig
}
const externalSources = useExternalDataSourcesStore()
const workspaceAccordionItems = computed<WorkspaceAccordionItem[]>(() => {
    const realWorkspaceItems = props.workspaces?.map((workspace): WorkspaceAccordionItem => ({
        label: `${workspace.provider.name} · ${workspace.name}`,
        value: `${workspace.provider.id}:${workspace.name}`,
        kind: "catalog",
        workspace,
    })) ?? []
    // Public third-party services (OGC API, SensorThings) configured in
    // config/externalDataSources.ts; they are fetched only when expanded.
    const externalItems = externalSources.sources.map((source): WorkspaceAccordionItem => ({
        label: source.title,
        value: `external:${source.id}`,
        kind: source.type,
        source,
    }))
    // Synthetic accordion entry for the deck.gl 3D Tiles demo — see
    // Workspace3DDataListingItem.vue for why this bypasses the real catalog.
    const mock3dItem: WorkspaceAccordionItem = {
        label: t("workspace.demo3d.accordionLabel"),
        value: "mock:3d-data",
        kind: "mock3d",
    }
    return [...realWorkspaceItems, ...externalItems, mock3dItem]
})

const route = useRoute()
</script>
