<template>
        <BaseSidebarComponent :id="sidebarID" position="left" :collapsed=false>
            <template #header>
                <RouterLink to="/participation">
                <p>Datastores</p>
            </RouterLink>
        </template>
            <div class="w-full" v-if="props.workspaces && props.workspaces.length > 0">
                <Accordion :multiple="true" :activeIndex="[]">
                    <AccordionTab headerClass="rounded-lg" v-for="(item, index) in props.workspaces" :key="index">
                        <template #header>
                            <h2 class="text-xl font-semibold capitalize">{{ item.name.replace(/[_-]/g, ' ') }}</h2>
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
import BaseSidebarComponent from "@components/Base/BaseSidebarComponent.vue";
import WorkspaceListingItem from "./WorkspaceListingItem.vue";
// JS-TS imports
import { type WorkspaceListItem } from "@store/geoserver";

import { SidebarControl } from "@helpers/sidebarControl";
import { useMapStore } from "@store/map";
import { RouterLink, useRoute } from "vue-router";
import { onMounted } from "vue";
export interface Props {
    workspaces: WorkspaceListItem[] | undefined
}
const props = defineProps<Props>()
const mapStore = useMapStore()
const sidebarID = "workspaceListing"

const iconElement = document.createElement("span")
iconElement.classList.add("material-icons-outlined")
iconElement.textContent = "sd_storage"
const sidebarControl = new SidebarControl("", sidebarID, document.createElement("div"), iconElement, 1)
mapStore.map.addControl(sidebarControl, "top-left")

const route = useRoute()
onMounted(()=>{
    setupSidebarVisibility()
})
function setupSidebarVisibility(): void {
    const routeMeta = route.meta;
    if (routeMeta !== undefined && routeMeta.sidebar !== undefined && routeMeta.sidebar !== "" && routeMeta.sidebar !== null) {
        const sidebarId = routeMeta.sidebar as string;
        const position = routeMeta.sidebarPosition as string;
        const sidebars = document.getElementsByClassName(`sidebar-${position}`)
        if (sidebars.length > 0){
            for (let i = 0; i < sidebars.length; i++) {
                if (sidebars[i].id === sidebarId) {
                    sidebars[i].classList.remove("collapsed");
                } else {
                    sidebars[i].classList.add("collapsed");
                }
            }
        }
        const sidebarElement = document.getElementById(sidebarId);
        if (sidebarElement != null) {
            sidebarElement.classList.remove("collapsed");
        }
    }
}
</script>
