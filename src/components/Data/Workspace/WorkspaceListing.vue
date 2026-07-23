<template>
        <BaseSlideoverSidebarComponent :id="sidebarID" side="left" :collapsed=false>
            <template #header>
                <RouterLink to="/participation">
                    <p>Datastores</p>
            </RouterLink>
        </template>
            <div class="w-full" v-if="props.workspaces && props.workspaces.length > 0">
                <UAccordion
                    :items="workspaceAccordionItems"
                    type="multiple"
                    :default-value="[]"
                    :ui="{
                        item: 'rounded-md border border-muted bg-default/70 mb-2 overflow-hidden last:mb-0',
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
            <div class="w-full" v-else>
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

import { SidebarControl } from "@helpers/sidebarControl";
import { openSlideoverSidebar } from "@helpers/slideoverSidebarRegistry";
import { useMapStore } from "@store/map";
import { RouterLink, useRoute } from "vue-router";
import { computed, onMounted, watch } from "vue";
export interface Props {
    workspaces: WorkspaceListItem[] | undefined
}
const props = defineProps<Props>()
const mapStore = useMapStore()
const sidebarID = "workspaceListing"
const workspaceAccordionItems = computed(() => {
    return props.workspaces?.map((workspace) => ({
        label: workspace.name,
        value: workspace.name,
        workspace,
    })) ?? []
})

const iconElement = document.createElement("span")
iconElement.classList.add("material-icons-outlined")
iconElement.textContent = "sd_storage"
const sidebarControl = new SidebarControl("", sidebarID, document.createElement("div"), iconElement, 1, { slideover: true })
mapStore.map.addControl(sidebarControl, "top-left")

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
