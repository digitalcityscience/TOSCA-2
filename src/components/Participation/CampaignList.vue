<template>
    <div>
        <UAccordion
            :items="campaignAccordionItems"
            type="multiple"
            :default-value="[]"
            :ui="{ label: 'text-xl font-semibold capitalize' }"
        >
            <template #body="{ item }">
                <CampaignListItem :campaign="item.campaign"></CampaignListItem>
            </template>
        </UAccordion>
    </div>
</template>

<script setup lang="ts">
import { useParticipationStore } from "@store/participation";
import { computed, onMounted } from "vue";
import CampaignListItem from "./CampaignListItem.vue";

const participation = useParticipationStore();
const campaignAccordionItems = computed(() => {
    return participation.activeCampaigns.map((campaign) => ({
        label: campaign.campaing_title,
        value: campaign.campaign_url_name,
        campaign,
    }))
})

onMounted(()=>{
    if (participation.activeCampaigns.length === 0) {
        participation.populateCampaignList();
    }
})
</script>

<style scoped>

</style>
