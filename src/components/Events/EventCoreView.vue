<template>
    <UCard :ui="{ body: 'p-4 sm:p-5', header: 'p-4 pb-0 sm:p-5 sm:pb-0' }">
        <template #header>
            <div class="grid gap-3">
                <h1 class="text-2xl font-bold leading-tight text-highlighted">{{ event.title }}</h1>
                <div class="flex flex-wrap gap-1.5">
                    <UBadge color="neutral" variant="subtle" icon="i-lucide-calendar-clock">
                        {{ dateLabel }}
                    </UBadge>
                    <UBadge :color="locationColor" variant="subtle">
                        {{ locationLabel }}
                    </UBadge>
                </div>
            </div>
        </template>

        <div class="grid gap-5">
            <p class="text-sm leading-relaxed text-toned">{{ event.summary }}</p>

            <section v-if="hasAccessInformation" class="grid gap-2">
                <h2 class="text-base font-semibold text-highlighted">Access</h2>
                <div class="grid gap-1.5 text-sm text-toned">
                    <p v-if="event.venue_address !== ''" class="flex gap-2">
                        <UIcon name="i-lucide-map-pin" class="mt-0.5 size-4 shrink-0 text-muted" />
                        <span>{{ event.venue_address }}</span>
                    </p>
                    <p v-if="event.district !== ''" class="pl-6">{{ event.district }}</p>
                    <p v-if="event.online_platform !== ''" class="flex gap-2">
                        <UIcon name="i-lucide-monitor" class="mt-0.5 size-4 shrink-0 text-muted" />
                        <span>{{ event.online_platform }}</span>
                    </p>
                    <UButton
                        v-if="event.online_url !== ''"
                        :href="event.online_url"
                        target="_blank"
                        rel="noreferrer"
                        label="Open online event"
                        trailing-icon="i-lucide-external-link"
                        variant="link"
                        class="w-fit px-0"
                    />
                    <p v-if="event.access_notes !== ''">{{ event.access_notes }}</p>
                </div>
            </section>

            <section v-if="contactItems.length > 0" class="grid gap-2">
                <h2 class="text-base font-semibold text-highlighted">Provider</h2>
                <dl class="grid gap-2 text-sm">
                    <div v-if="event.provider_name !== ''">
                        <dt class="sr-only">Provider</dt>
                        <dd class="font-semibold text-highlighted">{{ event.provider_name }}</dd>
                    </div>
                    <div
                        v-for="item in contactItems"
                        :key="item.label"
                        class="grid grid-cols-[5rem_minmax(0,1fr)] gap-2"
                    >
                        <dt class="text-muted">{{ item.label }}</dt>
                        <dd class="min-w-0 text-toned">
                            <a
                                v-if="item.href !== ''"
                                class="break-words text-primary hover:underline"
                                :href="item.href"
                                target="_blank"
                                rel="noreferrer"
                            >
                                {{ item.value }}
                            </a>
                            <span v-else class="break-words">{{ item.value }}</span>
                        </dd>
                    </div>
                </dl>
            </section>

            <EditorJsReadonly
                v-if="contextContent.blocks.length > 0"
                :data="contextContent"
            />

            <section v-if="event.taxonomy_assignments.length > 0" class="grid gap-3">
                <h2 class="text-base font-semibold text-highlighted">Attributes</h2>
                <div v-for="assignment in event.taxonomy_assignments" :key="assignment.dimension_id" class="grid gap-1.5">
                    <h3 class="text-sm font-medium text-toned">{{ assignment.dimension_label }}</h3>
                    <div class="flex flex-wrap gap-1.5">
                        <UBadge
                            v-for="term in assignment.terms"
                            :key="term.id"
                            color="neutral"
                            variant="outline"
                        >
                            {{ term.label }}
                        </UBadge>
                    </div>
                </div>
            </section>

            <section v-if="orderedLayers.length > 0" class="grid gap-2">
                <h2 class="text-base font-semibold text-highlighted">Map layers</h2>
                <ul class="grid gap-2">
                    <li
                        v-for="item in orderedLayers"
                        :key="item.layer.id"
                        class="flex items-center gap-2 rounded-md border border-muted bg-muted/40 px-3 py-2 text-sm text-toned"
                    >
                        <UIcon name="i-lucide-layers" class="size-4 shrink-0 text-muted" />
                        <span class="truncate">{{ item.layer.workspace.name }}:{{ item.layer.name }}</span>
                    </li>
                </ul>
            </section>

            <section v-if="event.feature_links.length > 0" class="grid gap-2">
                <h2 class="text-base font-semibold text-highlighted">Related content</h2>
                <div class="flex flex-wrap gap-1.5">
                    <UBadge
                        v-for="link in event.feature_links"
                        :key="link.id"
                        color="info"
                        variant="subtle"
                    >
                        {{ link.target_type }}: {{ link.link_type }}
                    </UBadge>
                </div>
            </section>
        </div>
    </UCard>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { type EventDetail } from "@store/events";
import EditorJsReadonly from "@components/Base/EditorJsReadonly.vue";
import {
    eventLocationColor,
    eventLocationLabel,
    formatEventDate,
} from "./eventPresentation";

const props = defineProps<{
    event: EventDetail
}>();

const dateLabel = computed(() => formatEventDate(props.event.start_datetime));
const locationLabel = computed(() => eventLocationLabel(props.event.location_mode));
const locationColor = computed(() => eventLocationColor(props.event.location_mode));
const contextContent = computed(() => ({
    ...props.event.context?.content,
    blocks: props.event.context?.content?.blocks ?? [],
}));
const hasAccessInformation = computed(() => {
    return [
        props.event.venue_address,
        props.event.district,
        props.event.online_platform,
        props.event.online_url,
        props.event.access_notes,
    ].some((value) => value !== "");
});
const contactItems = computed(() => {
    const items = [
        { label: "Address", value: props.event.provider_address, href: "" },
        {
            label: "Phone",
            value: props.event.provider_phone,
            href: props.event.provider_phone === "" ? "" : `tel:${props.event.provider_phone}`,
        },
        {
            label: "Email",
            value: props.event.provider_email,
            href: props.event.provider_email === "" ? "" : `mailto:${props.event.provider_email}`,
        },
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
