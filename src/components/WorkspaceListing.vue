<template>
        <BaseSidebarComponent :id="sidebarID" position="left" :collapsed=false>
            <template #header>
            <p>Datastores</p>
        </template>
            <div class="w-full" v-if="props.workspaces && props.workspaces.length > 0">
                <Accordion :multiple="true" :activeIndex="[]">
                    <AccordionTab headerClass="rounded-lg" v-for="(item, index) in props.workspaces" :key="index">
                        <template #header>
                            <h2 class="text-xl font-semibold capitalize">{{ item.name }}</h2>
                        </template>
                        <WorkspaceListingItem :workspace="item"></WorkspaceListingItem>
                    </AccordionTab>
                </Accordion>
            </div>
            <div class="w-full" v-else>
                <InlineMessage class="w-full" severity="info">No workspace found</InlineMessage>
            </div>
        </BaseSidebarComponent>
</template>

<script setup lang="ts">
// Components
import Accordion from "primevue/accordion";
import AccordionTab from "primevue/accordiontab";
import InlineMessage from "primevue/inlinemessage";
import BaseSidebarComponent from "./BaseSidebarComponent.vue";
import WorkspaceListingItem from "./WorkspaceListingItem.vue";
// JS-TS imports
import { type WorkspaceListItem } from "../store/geoserver";

import { SidebarControl } from "../core/helpers/sidebarControl";
import { useMapStore } from "../store/map";
export interface Props {
    workspaces: WorkspaceListItem[] | undefined
}
const props = defineProps<Props>()
const mapStore = useMapStore()
const sidebarID = "workspaceListing"

const sidebarControl = new SidebarControl("", sidebarID, document.createElement("div"))
mapStore.map.addControl(sidebarControl, "top-left")
</script>
