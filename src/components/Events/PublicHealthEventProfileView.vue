<template>
    <section v-if="profile !== null" class="grid gap-3">
        <h3 class="text-lg font-semibold text-surface-900">More details</h3>
        <div class="grid gap-2">
            <div v-for="item in visibleItems" :key="item.label" class="flex justify-between gap-3 border-b border-surface-100 pb-2">
                <span class="text-sm text-surface-500">{{ item.label }}</span>
                <span class="text-sm font-medium text-surface-800 text-right">{{ item.value }}</span>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { type PublicHealthProfile } from "@store/events";

const props = defineProps<{
    profile: PublicHealthProfile | null
}>();

const visibleItems = computed(() => {
    if (props.profile === null) {
        return [];
    }

    const registrationLabels: Record<string, string> = {
        required: "Required",
        not_required: "Not required",
        by_arrangement: "By arrangement",
    };
    const items = [
        { label: "Target age", value: props.profile.target_age_note },
        { label: "Registration", value: registrationLabels[props.profile.registration] ?? props.profile.registration },
        { label: "Short notice", value: props.profile.short_notice_possible ? "Possible" : "Not available" },
        { label: "Cost", value: formatMoney(props.profile.cost_amount_eur) },
        { label: "Reduced cost", value: formatMoney(props.profile.reduced_amount_eur) },
        { label: "Subsidy", value: props.profile.subsidy_program },
        { label: "Transit", value: props.profile.transit_note },
        { label: "Insurance eligible", value: props.profile.insurance_eligible ? "Yes" : "No" },
        { label: "Referral required", value: props.profile.referral_required ? "Yes" : "No" },
    ];

    return items.filter((item) => item.value !== "");
});

function formatMoney(value: string | null): string {
    if (value === null || value === "") {
        return "";
    }
    return `${value} EUR`;
}
</script>
