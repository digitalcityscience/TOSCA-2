<template>
    <div>
        <Accordion :multiple="true" :activeIndex="[]">
            <AccordionTab headerClass="rounded-lg" v-for="(campaign, index) in participation.activeCampaigns" :key="index">
                <template #header>
                    <h2 class="text-xl font-semibold capitalize">{{ campaign.campaing_title }}</h2>
                </template>
                <CampaignListItem :campaign="campaign"></CampaignListItem>
            </AccordionTab>
        </Accordion>
    </div>
</template>

<script setup lang="ts">
import { useParticipationStore } from "@store/participation";
import { onMounted } from "vue";
import CampaignListItem from "./CampaignListItem.vue";
import Accordion from "primevue/accordion";
import AccordionTab from "primevue/accordiontab";

const participation = useParticipationStore();

onMounted(()=>{
    if (participation.activeCampaigns.length === 0) {
        participation.populateCampaignList();
    }
})
</script>

<style scoped>

</style>
