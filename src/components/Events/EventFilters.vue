<template>
    <section class="mb-3 rounded-md border border-surface-200 bg-surface-0 p-3">
        <div class="grid gap-3">
            <div class="flex items-center gap-2">
                <Checkbox v-model="includePast" input-id="event-include-past" binary />
                <label for="event-include-past" class="text-sm font-medium text-surface-800">Include past events</label>
            </div>

            <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                <label class="grid gap-1 text-sm text-surface-700">
                    Start after
                    <input v-model="startAfter" class="event-filter-input" type="datetime-local">
                </label>
                <label class="grid gap-1 text-sm text-surface-700">
                    Start before
                    <input v-model="startBefore" class="event-filter-input" type="datetime-local">
                </label>
            </div>

            <label class="grid gap-1 text-sm text-surface-700">
                Event type
                <select v-model="eventTypeId" class="event-filter-input" @change="handleEventTypeChange">
                    <option value="">All event types</option>
                    <option
                        v-for="eventType in events.eventTypes"
                        :key="eventType.id"
                        :value="eventType.id"
                    >
                        {{ eventType.label }}
                    </option>
                </select>
            </label>

            <Accordion value="">
                <AccordionPanel value="taxonomy">
                    <AccordionHeader>
                        <span class="text-sm font-semibold">Category Filter</span>
                    </AccordionHeader>
                    <AccordionContent>
                        <div class="grid gap-2 pt-2">
                            <label class="grid gap-1 text-sm text-surface-700">
                                Category
                                <select v-model="dimensionCode" class="event-filter-input">
                                    <option value="">Any category</option>
                                    <option
                                        v-for="dimension in taxonomyDimensions"
                                        :key="dimension.code"
                                        :value="dimension.code"
                                    >
                                        {{ dimension.label }}
                                    </option>
                                </select>
                            </label>
                            <label class="grid gap-1 text-sm text-surface-700">
                                Value
                                <select v-model="termCode" class="event-filter-input" :disabled="taxonomyTerms.length === 0">
                                    <option value="">Any value</option>
                                    <option
                                        v-for="term in taxonomyTerms"
                                        :key="term.id"
                                        :value="term.code"
                                    >
                                        {{ term.label }}
                                    </option>
                                </select>
                            </label>
                        </div>
                    </AccordionContent>
                </AccordionPanel>
            </Accordion>

            <div class="flex justify-end gap-2">
                <Button label="Reset" icon="pi pi-filter-slash" size="small" severity="secondary" @click="resetFilters" />
                <Button label="Apply" icon="pi pi-filter" size="small" @click="applyFilters" />
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import bbox from "@turf/bbox";
import { computed, onMounted, ref, watch } from "vue";
import Accordion from "primevue/accordion";
import AccordionContent from "primevue/accordioncontent";
import AccordionHeader from "primevue/accordionheader";
import AccordionPanel from "primevue/accordionpanel";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import { useToast } from "primevue/usetoast";
import { type EventFilters, useEventsStore } from "@store/events";
import { useMapStore } from "@store/map";

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

const taxonomyRegistry = computed(() => {
    return events.taxonomyRegistriesByProfile[profileKey.value];
});

const taxonomyDimensions = computed(() => {
    return taxonomyRegistry.value?.dimensions ?? [];
});

const taxonomyTerms = computed(() => {
    if (dimensionCode.value === "") {
        return taxonomyDimensions.value.flatMap((dimension) => dimension.terms);
    }
    return taxonomyDimensions.value.find((dimension) => dimension.code === dimensionCode.value)?.terms ?? [];
});

onMounted(() => {
    Promise.all([
        events.loadEventTypes(),
        events.loadEventTaxonomy(profileKey.value),
    ]).catch(showError);
});

watch(profileKey, (nextProfileKey) => {
    events.loadEventTaxonomy(nextProfileKey).catch(showError);
});

watch(dimensionCode, () => {
    termCode.value = "";
});

function applyFilters(): void {
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
    events.loadEvents().catch(showError);
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
    } catch (error) {
        showError(error);
    }
}

function handleEventTypeChange(): void {
    const selectedEventType = events.eventTypes.find((eventType) => eventType.id === eventTypeId.value);
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
    return new Date(value).toISOString();
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

function showError(error: unknown): void {
    toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
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

<style scoped>
.event-filter-input {
    width: 100%;
    border: 1px solid var(--surface-300);
    border-radius: 6px;
    padding: 0.45rem 0.6rem;
    color: var(--surface-900);
    background: var(--surface-0);
}

.event-filter-input:focus {
    outline: 2px solid var(--primary-300);
    border-color: var(--primary-500);
}
</style>
