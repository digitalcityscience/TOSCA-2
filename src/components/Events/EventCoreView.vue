<template>
    <Card>
        <template #title>
            <h1 class="text-3xl font-bold leading-tight">{{ event.title }}</h1>
        </template>
        <template #subtitle>
            <div class="flex flex-wrap gap-2">
                <Tag :value="dateLabel" severity="secondary" />
                <Tag :value="locationLabel" :severity="locationSeverity" />
            </div>
        </template>
        <template #content>
            <div class="grid gap-5">
                <p class="text-base leading-relaxed text-surface-700">{{ event.summary }}</p>

                <section class="grid gap-2">
                    <h3 class="text-lg font-semibold text-surface-900">Access</h3>
                    <div class="grid gap-1 text-sm text-surface-700">
                        <p v-if="event.venue_address !== ''">{{ event.venue_address }}</p>
                        <p v-if="event.district !== ''">{{ event.district }}</p>
                        <p v-if="event.online_platform !== ''">{{ event.online_platform }}</p>
                        <a v-if="event.online_url !== ''" class="text-primary-600 hover:underline" :href="event.online_url" target="_blank" rel="noreferrer">Online link</a>
                        <p v-if="event.access_notes !== ''">{{ event.access_notes }}</p>
                    </div>
                </section>

                <section v-if="contactItems.length > 0" class="grid gap-2">
                    <h3 class="text-lg font-semibold text-surface-900">Provider</h3>
                    <div class="grid gap-1 text-sm text-surface-700">
                        <p v-if="event.provider_name !== ''" class="font-semibold text-surface-900">{{ event.provider_name }}</p>
                        <p v-for="item in contactItems" :key="item.label">
                            <span class="text-surface-500">{{ item.label }}: </span>
                            <a v-if="item.href !== ''" class="text-primary-600 hover:underline" :href="item.href" target="_blank" rel="noreferrer">{{ item.value }}</a>
                            <span v-else>{{ item.value }}</span>
                        </p>
                    </div>
                </section>

                <EditorJsRenderer v-if="blocks.length > 0" :blocks="blocks" />

                <section v-if="event.taxonomy_assignments.length > 0" class="grid gap-2">
                    <h3 class="text-lg font-semibold text-surface-900">Attributes</h3>
                    <div class="grid gap-3">
                        <div v-for="assignment in event.taxonomy_assignments" :key="assignment.dimension_id">
                            <div class="mb-1 text-sm font-semibold text-surface-700">{{ assignment.dimension_label }}</div>
                            <div class="flex flex-wrap gap-2">
                                <Tag
                                    v-for="term in assignment.terms"
                                    :key="term.id"
                                    :value="term.label"
                                    severity="secondary"
                                />
                            </div>
                        </div>
                    </div>
                </section>

                <section v-if="event.layers.length > 0" class="grid gap-2">
                    <h3 class="text-lg font-semibold text-surface-900">Map layers</h3>
                    <div class="grid gap-2">
                        <div v-for="item in orderedLayers" :key="item.layer.id" class="rounded-md border border-surface-200 p-2 text-sm">
                            {{ item.layer.workspace.name }}:{{ item.layer.name }}
                        </div>
                    </div>
                </section>

                <section v-if="event.feature_links.length > 0" class="grid gap-2">
                    <h3 class="text-lg font-semibold text-surface-900">Related content</h3>
                    <div class="flex flex-wrap gap-2">
                        <Tag
                            v-for="link in event.feature_links"
                            :key="link.id"
                            :value="`${link.target_type}: ${link.link_type}`"
                            severity="info"
                        />
                    </div>
                </section>
            </div>
        </template>
    </Card>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Card from "primevue/card";
import Tag from "primevue/tag";
import { type EventDetail } from "@store/events";
import EditorJsRenderer from "@components/Geostories/EditorJsRenderer.vue";

const props = defineProps<{
    event: EventDetail
}>();

const dateLabel = computed(() => {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(props.event.start_datetime));
});

const locationLabel = computed(() => {
    const labels: Record<string, string> = {
        physical: "In person",
        online: "Online",
        hybrid: "Hybrid",
        by_arrangement: "By arrangement",
        home_visit: "Home visit",
    };
    return labels[props.event.location_mode] ?? props.event.location_mode;
});

const locationSeverity = computed(() => {
    if (props.event.location_mode === "online") {
        return "info";
    }
    if (props.event.location_mode === "hybrid") {
        return "warn";
    }
    return "success";
});

const blocks = computed(() => {
    return props.event.context?.content?.blocks ?? [];
});

const contactItems = computed(() => {
    const items = [
        { label: "Address", value: props.event.provider_address, href: "" },
        { label: "Phone", value: props.event.provider_phone, href: props.event.provider_phone === "" ? "" : `tel:${props.event.provider_phone}` },
        { label: "Email", value: props.event.provider_email, href: props.event.provider_email === "" ? "" : `mailto:${props.event.provider_email}` },
        { label: "Social", value: props.event.provider_social, href: "" },
        { label: "Website", value: props.event.provider_url, href: props.event.provider_url },
        { label: "External", value: props.event.external_url, href: props.event.external_url },
    ];
    return items.filter((item) => item.value !== "");
});

const orderedLayers = computed(() => {
    return [...props.event.layers].sort((a, b) => a.display_order - b.display_order);
});
</script>
