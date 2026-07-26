<template>
    <div>
        <p class="py-2 font-light">{{ props.campaign.campaing_short_description }}</p>
        <p class="pt-1">{{ props.campaign.total_comment_count }} <span class="font-light italic text-sm">{{ t('participation.detail.feedbackSuffix') }}</span></p>
        <p class="font-light italic text-sm pt-1">{{ timeLeft(props.campaign.end_date) }}</p>
        <div class="w-full grid lg:grid-cols-1 2xl:grid-cols-2 pt-3">
            <RouterLink :to="{ name: 'campaign-details', params: { campaignURL: props.campaign.campaign_url_name } }">
                <UButton size="sm">{{ t('participation.detail.seeDetail') }}</UButton>
            </RouterLink>
        </div>
    </div>
</template>

<script setup lang="ts">
import { defineProps } from "vue";
import { useI18n } from "vue-i18n";
import { type CampaignListItem } from "@store/participation";
import { RouterLink } from "vue-router";

export interface Props {
    campaign: CampaignListItem
}
const { t } = useI18n();
const props = defineProps<Props>()
function timeLeft(endDate: string): string {
    const today = new Date();
    const end = new Date(endDate);
    const timeDiff = end.getTime() - today.getTime();
    const daysLeft = Math.ceil(timeDiff / (1000 * 3600 * 24));

    if (daysLeft < 0) {
        return t("participation.detail.endsToday");
    } else if (daysLeft < 60) {
        return t("participation.detail.endsInDays", { days: daysLeft });
    } else if (daysLeft < 365) {
        const monthsLeft = Math.floor(daysLeft / 30);
        return t("participation.detail.endsInMonths", { months: monthsLeft });
    } else {
        return "";
    }
}
</script>

<style scoped>

</style>
