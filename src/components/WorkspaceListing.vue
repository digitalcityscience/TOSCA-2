<template>
        <BaseSidebarComponent id="workspaceListing" position="left" >
            <div v-if="props.workspaces && props.workspaces.length > 0">
                <Accordion :multiple="true" :activeIndex="[0]">
                    <AccordionTab headerClass="rounded-lg" v-for="(item, index) in props.workspaces" :key="index" :pt="{
                        root:'m-2',
                        header:'bg-primary',
                        headerAction:'bg-primary'
                        }">
                        <template #header>
                            <h2 class="text-xl font-semibold capitalize">{{ item.name }}</h2>
                        </template>
                        <WorkspaceListingItem :workspace="item"></WorkspaceListingItem>
                    </AccordionTab>
                </Accordion>
            </div>
            <div v-else>
                No workspace found!
            </div>
        </BaseSidebarComponent>
</template>

<script setup lang="ts">
// Components
import Accordion from "primevue/accordion";
import AccordionTab from "primevue/accordiontab";
import BaseSidebarComponent from "./BaseSidebarComponent.vue";
import WorkspaceListingItem from "./WorkspaceListingItem.vue";
// JS-TS imports
import { type WorkspaceListItem } from "../store/geoserver"
export interface Props {
    workspaces: WorkspaceListItem[] | undefined
}
const props = defineProps<Props>()
</script>
