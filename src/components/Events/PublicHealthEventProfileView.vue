<template>
    <section v-if="profile !== null" class="grid gap-3">
        <h2 class="text-base font-semibold text-highlighted">{{ t("events.profile.moreDetails") }}</h2>
        <dl class="divide-y divide-muted">
            <div
                v-for="item in visibleItems"
                :key="item.label"
                class="grid grid-cols-[minmax(7rem,0.8fr)_minmax(0,1.2fr)] gap-3 py-2 first:pt-0 last:pb-0"
            >
                <dt class="text-sm text-muted">{{ item.label }}</dt>
                <dd class="text-right text-sm font-medium text-toned">{{ item.value }}</dd>
            </div>
        </dl>
    </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { type PublicHealthProfile } from "@store/events";

const props = defineProps<{
    profile: PublicHealthProfile | null
}>();
const { locale, t } = useI18n();

const visibleItems = computed(() => {
    if (props.profile === null) {
        return [];
    }

    const registrationLabels: Record<string, string> = {
        required: t("events.profile.required"),
        not_required: t("events.profile.notRequired"),
        by_arrangement: t("events.profile.byArrangement"),
    };
    const items = [
        { label: t("events.profile.targetAge"), value: props.profile.target_age_note },
        {
            label: t("events.profile.registration"),
            value: registrationLabels[props.profile.registration] ?? props.profile.registration,
        },
        {
            label: t("events.profile.shortNotice"),
            value: props.profile.short_notice_possible ? t("events.profile.possible") : t("events.profile.notAvailable"),
        },
        { label: t("events.profile.cost"), value: formatMoney(props.profile.cost_amount_eur) },
        { label: t("events.profile.reducedCost"), value: formatMoney(props.profile.reduced_amount_eur) },
        { label: t("events.profile.subsidy"), value: props.profile.subsidy_program },
        { label: t("events.profile.transit"), value: props.profile.transit_note },
        {
            label: t("events.profile.insuranceEligible"),
            value: props.profile.insurance_eligible ? t("events.yes") : t("events.no"),
        },
        {
            label: t("events.profile.referralRequired"),
            value: props.profile.referral_required ? t("events.yes") : t("events.no"),
        },
    ];

    return items.filter((item) => item.value !== "");
});

function formatMoney(value: string | null): string {
    if (value === null || value === "") {
        return "";
    }
    return new Intl.NumberFormat(locale.value, { style: "currency", currency: "EUR" }).format(Number(value));
}
</script>
