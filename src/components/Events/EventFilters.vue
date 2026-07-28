<template>
    <UCard
        variant="subtle"
        :ui="{ body: 'p-3 sm:p-3' }"
    >
        <div class="grid gap-3">
            <div class="flex items-center justify-between gap-3">
                <UCheckbox
                    v-model="includePast"
                    label="Include past events"
                    description="Show events that have already started."
                />
                <UBadge v-if="hasActiveFilters" color="primary" variant="subtle">
                    Filtered
                </UBadge>
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <UFormField label="Start after">
                    <UInput v-model="startAfter" type="datetime-local" class="w-full" />
                </UFormField>
                <UFormField label="Start before">
                    <UInput v-model="startBefore" type="datetime-local" class="w-full" />
                </UFormField>
            </div>

            <UFormField label="Event type">
                <USelect
                    v-model="eventTypeId"
                    class="w-full"
                    :items="eventTypeItems"
                    placeholder="All event types"
                    @update:model-value="handleEventTypeChange"
                />
            </UFormField>

            <UCollapsible>
                <template #default="{ open }">
                    <UButton
                        block
                        color="neutral"
                        variant="ghost"
                        :trailing-icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                        class="justify-between"
                    >
                        <span class="flex items-center gap-2">
                            <UIcon name="i-lucide-tags" class="size-4" />
                            Category filter
                        </span>
                    </UButton>
                </template>
                <template #content>
                    <div class="grid gap-3 border-t border-muted pt-3 sm:grid-cols-2">
                        <UFormField label="Category">
                            <USelect
                                v-model="dimensionCode"
                                class="w-full"
                                :items="dimensionItems"
                                placeholder="Any category"
                            />
                        </UFormField>
                        <UFormField label="Value">
                            <USelect
                                v-model="termCode"
                                class="w-full"
                                :items="termItems"
                                placeholder="Any value"
                                :disabled="taxonomyTerms.length === 0"
                            />
                        </UFormField>
                    </div>
                </template>
            </UCollapsible>

            <div class="flex justify-end gap-2">
                <UButton
                    label="Reset"
                    icon="i-lucide-filter-x"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    :loading="loading"
                    @click="resetFilters"
                />
                <UButton
                    label="Apply"
                    icon="i-lucide-filter"
                    size="sm"
                    :loading="loading"
                    @click="applyFilters"
                />
            </div>
        </div>
    </UCard>
</template>

<script setup lang="ts">
import bbox from "@turf/bbox";
import { computed, onMounted, ref, watch } from "vue";
import { type EventFilters, useEventsStore } from "@store/events";
import { useMapStore } from "@store/map";
import { useToast } from "@helpers/toast";

const events = useEventsStore();
const mapStore = useMapStore();
const toast = useToast();

const includePast = ref(Boolean(events.filters.include_past));
const startAfter = ref(toDatetimeLocal(events.filters.start_after));
const startBefore = ref(toDatetimeLocal(events.filters.start_before));
const eventTypeId = ref(events.filters.event_type_id ?? "");
const profileKey = ref(events.filters.profile_key ?? "public_health");
const dimensionCode = ref(events.filters.dimension_code ?? "");
const termCode = ref(events.filters.term_code ?? "");
const loading = computed(() => events.loadingList || events.loadingMap || events.loadingRegistries);

const taxonomyRegistry = computed(() => {
    return events.taxonomyRegistriesByProfile[profileKey.value];
});
const taxonomyDimensions = computed(() => taxonomyRegistry.value?.dimensions ?? []);
const taxonomyTerms = computed(() => {
    if (dimensionCode.value === "") {
        return taxonomyDimensions.value.flatMap((dimension) => dimension.terms);
    }
    return taxonomyDimensions.value.find((dimension) => {
        return dimension.code === dimensionCode.value;
    })?.terms ?? [];
});
const eventTypeItems = computed(() => [
    ...events.eventTypes.map((eventType) => ({
        label: eventType.label,
        value: eventType.id,
    })),
]);
const dimensionItems = computed(() => [
    ...taxonomyDimensions.value.map((dimension) => ({
        label: dimension.label,
        value: dimension.code,
    })),
]);
const termItems = computed(() => [
    ...taxonomyTerms.value.map((term) => ({
        label: term.label,
        value: term.code,
    })),
]);
const hasActiveFilters = computed(() => {
    return includePast.value ||
        startAfter.value !== "" ||
        startBefore.value !== "" ||
        eventTypeId.value !== "" ||
        dimensionCode.value !== "" ||
        termCode.value !== "";
});

onMounted(() => {
    const registryRequests: Array<Promise<unknown>> = [events.loadEventTypes()];
    if (profileKey.value !== "") {
        registryRequests.push(events.loadEventTaxonomy(profileKey.value));
    }
    Promise.all(registryRequests).catch(showError);
});

watch(profileKey, (nextProfileKey) => {
    if (nextProfileKey !== "") {
        events.loadEventTaxonomy(nextProfileKey).catch(showError);
    }
});

watch(dimensionCode, () => {
    termCode.value = "";
});

async function applyFilters(): Promise<void> {
    const filters: EventFilters = {
        include_past: includePast.value,
        event_type_id: emptyToUndefined(eventTypeId.value),
        profile_key: emptyToUndefined(profileKey.value),
        dimension_code: emptyToUndefined(dimensionCode.value),
        term_code: emptyToUndefined(termCode.value),
        start_after: datetimeLocalToIso(startAfter.value),
        start_before: datetimeLocalToIso(startBefore.value),
    };
    events.setFilters(filters);
    try {
        await Promise.all([
            events.loadEvents(),
            events.loadEventMap(),
        ]);
        fitMapToEvents();
    } catch {
        showError();
    }
}

async function resetFilters(): Promise<void> {
    includePast.value = false;
    startAfter.value = "";
    startBefore.value = "";
    eventTypeId.value = "";
    profileKey.value = "";
    dimensionCode.value = "";
    termCode.value = "";
    events.setFilters({ include_past: false });
    try {
        await Promise.all([
            events.loadEvents(),
            events.loadEventMap(),
        ]);
        fitMapToEvents();
    } catch {
        showError();
    }
}

function handleEventTypeChange(): void {
    const selectedEventType = events.eventTypes.find((eventType) => {
        return eventType.id === eventTypeId.value;
    });
    const nextProfileKey = selectedEventType?.profile_key ?? "";
    if (nextProfileKey !== profileKey.value) {
        dimensionCode.value = "";
        termCode.value = "";
    }
    profileKey.value = nextProfileKey;
}

function emptyToUndefined(value: string): string | undefined {
    const trimmedValue = value.trim();
    return trimmedValue === "" ? undefined : trimmedValue;
}

function datetimeLocalToIso(value: string): string | undefined {
    if (value === "") {
        return undefined;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toDatetimeLocal(value?: string): string {
    if (value === undefined || value === "") {
        return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    const offsetMs = date.getTimezoneOffset() * 60 * 1000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function showError(): void {
    toast.add({
        severity: "warning",
        summary: "Event filters couldn't be updated",
        detail: "Please try again in a moment.",
        life: 4000,
    });
}

function fitMapToEvents(): void {
    if (mapStore.map === undefined || events.spatialEvents.features.length === 0) {
        return;
    }

    const bounds = bbox(events.spatialEvents);
    if (!bounds.every(Number.isFinite)) {
        return;
    }

    const [minLng, minLat, maxLng, maxLat] = bounds;
    if (minLng === maxLng && minLat === maxLat) {
        mapStore.map.flyTo({
            center: [minLng, minLat],
            zoom: 14,
            essential: true,
        });
        return;
    }

    mapStore.map.fitBounds(bounds, {
        padding: 80,
        maxZoom: 14,
    });
}
</script>
