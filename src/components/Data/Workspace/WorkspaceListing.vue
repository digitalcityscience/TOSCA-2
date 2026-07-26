<template>
        <BaseSlideoverSidebarComponent :id="sidebarID" side="left" :collapsed=false>
            <template #header>
                <p>Datastores</p>
        </template>
            <div class="w-full p-3" v-if="props.workspaces && props.workspaces.length > 0">
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
                        <WorkspaceListingItem :workspace="item.workspace"></WorkspaceListingItem>
                    </template>
                </UAccordion>
            </div>
            <div class="w-full p-3" v-else>
                <UAlert class="w-full" color="info" variant="soft" description="No workspace found" />
            </div>
        </BaseSlideoverSidebarComponent>
</template>

<script setup lang="ts">
// Components
import BaseSlideoverSidebarComponent from "@components/Base/BaseSlideoverSidebarComponent.vue";
import WorkspaceListingItem from "./WorkspaceListingItem.vue";
// JS-TS imports
import { type WorkspaceListItem } from "@store/geoserver";

import { openSlideoverSidebar } from "@helpers/slideoverSidebarRegistry";
import { useRoute } from "vue-router";
import { computed, onMounted, watch } from "vue";
export interface Props {
    workspaces: WorkspaceListItem[] | undefined
}
const props = defineProps<Props>()
const sidebarID = "workspaceListing"
const workspaceAccordionItems = computed(() => {
    return props.workspaces?.map((workspace) => ({
        label: workspace.name,
        value: workspace.name,
        workspace,
    })) ?? []
})

const route = useRoute()
onMounted(()=>{
    setupSidebarVisibility()
})
watch(() => route.meta.sidebar, () => {
    setupSidebarVisibility()
})
function setupSidebarVisibility(): void {
    const routeMeta = route.meta;
    if (routeMeta !== undefined && routeMeta.sidebar === sidebarID) {
        openSlideoverSidebar(sidebarID)
    }
}
</script>
