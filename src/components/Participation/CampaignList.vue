<template>
    <div>
        <Accordion :multiple="true" :activeIndex="[]">
            <AccordionPanel v-for="(campaign, index) in participation.activeCampaigns" :key="index" :value="index">
                <AccordionHeader>
                    <h2 class="text-xl font-semibold capitalize">{{ campaign.campaing_title }}</h2>
                </AccordionHeader>
                <AccordionContent>
                    <CampaignListItem :campaign="campaign"></CampaignListItem>
                </AccordionContent>
            </AccordionPanel>
        </Accordion>
    </div>
</template>

<script setup lang="ts">
import { useParticipationStore } from "@store/participation";
import { onMounted } from "vue";
import CampaignListItem from "./CampaignListItem.vue";
import Accordion from "primevue/accordion";
import AccordionPanel from "primevue/accordionpanel";
import AccordionHeader from "primevue/accordionheader";
import AccordionContent from "primevue/accordioncontent";

const participation = useParticipationStore();

onMounted(()=>{
    if (participation.activeCampaigns.length === 0) {
        participation.populateCampaignList();
    }
})
</script>

<style scoped>

</style>
