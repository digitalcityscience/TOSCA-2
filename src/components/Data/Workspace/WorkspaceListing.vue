<template>
        <BaseSidebarComponent :id="sidebarID" position="left" :collapsed="props.collapsed">
            <template #header>
                <RouterLink to="/participation">
                <p>Datastores</p>
            </RouterLink>
        </template>
            <div class="w-full" v-if="props.workspaces && props.workspaces.length > 0">
                <Accordion v-model:value="activeWorkspaceValues" :multiple="true">
                    <AccordionPanel
                        v-for="(item, index) in props.workspaces"
                        :key="item.name"
                        :value="workspacePanelValue(index)"
                    >
                        <AccordionHeader>
                            <h2 class="text-xl font-semibold capitalize">{{ item.name }}</h2>
                        </AccordionHeader>
                        <AccordionContent>
                            <WorkspaceListingItem
                                v-if="isWorkspacePanelOpen(index)"
                                :workspace="item"
                            ></WorkspaceListingItem>
                        </AccordionContent>
                    </AccordionPanel>
                </Accordion>
            </div>
            <div class="w-full" v-else>
                <Message class="w-full" severity="info">No workspace found</Message>
            </div>
        </BaseSidebarComponent>
</template>

<script setup lang="ts">
// Components
import { defineAsyncComponent, onMounted, ref, watch } from "vue";
import Accordion from "primevue/accordion";
import AccordionPanel from "primevue/accordionpanel";
import AccordionHeader from "primevue/accordionheader";
import AccordionContent from "primevue/accordioncontent";
import Message from "primevue/message";
import BaseSidebarComponent from "@components/Base/BaseSidebarComponent.vue";
// JS-TS imports
import { type WorkspaceListItem } from "@store/geoserver";

import { SidebarControl } from "@helpers/sidebarControl";
import { useMapStore } from "@store/map";
import { RouterLink, useRoute } from "vue-router";
const WorkspaceListingItem = defineAsyncComponent(async () => await import("./WorkspaceListingItem.vue"));
export interface Props {
    workspaces: WorkspaceListItem[] | undefined
    collapsed?: boolean
    registerControl?: boolean
}
const props = withDefaults(defineProps<Props>(), {
    collapsed: false,
    registerControl: true,
})
const mapStore = useMapStore()
const sidebarID = "workspaceListing"
const activeWorkspaceValues = ref<string[]>([])

logWorkspaceTiming("listing:setup", {
    registerControl: props.registerControl,
    collapsed: props.collapsed,
    workspaceCount: props.workspaces?.length ?? 0,
})

const iconElement = document.createElement("span")
iconElement.classList.add("material-icons-outlined")
iconElement.textContent = "sd_storage"
const sidebarControl = new SidebarControl("", sidebarID, document.createElement("div"), iconElement, 1)
if (props.registerControl) {
    mapStore.map.addControl(sidebarControl, "top-left")
    logWorkspaceTiming("listing:control-registered")
}

const route = useRoute()
onMounted(()=>{
    logWorkspaceTiming("listing:mounted", {
        workspaceCount: props.workspaces?.length ?? 0,
    })
    setupSidebarVisibility()
})
watch(activeWorkspaceValues, (values) => {
    logWorkspaceTiming("listing:active-panels", {
        values,
        workspaces: values.map((value) => props.workspaces?.[Number(value)]?.name),
    })
})
function workspacePanelValue(index: number): string {
    return String(index)
}
function isWorkspacePanelOpen(index: number): boolean {
    return activeWorkspaceValues.value.includes(workspacePanelValue(index))
}
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
function logWorkspaceTiming(message: string, details?: Record<string, unknown>): void {
    console.log(
        `[tosca-perf ${new Date().toISOString()} +${performance.now().toFixed(1)}ms] workspace:${message}`,
        details ?? ""
    )
}
</script>
