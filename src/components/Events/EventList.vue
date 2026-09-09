<template>
    <div class="grid gap-4">
        <EventFilters />

        <div class="flex items-center justify-between gap-3">
            <UTabs
                v-model="activeView"
                :items="viewItems"
                :content="false"
                color="neutral"
                variant="pill"
                size="sm"
            />
            <span v-if="events.events.length > 0" class="text-xs text-muted">
                {{ t("events.list.count", events.events.length) }}
            </span>
        </div>

        <div v-if="events.loadingList && events.events.length === 0" class="grid gap-3">
            <USkeleton v-for="index in 3" :key="index" class="h-40 w-full rounded-lg" />
        </div>

        <UAlert
            v-if="events.error !== ''"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="t('events.list.unavailableTitle')"
            :description="events.error"
        >
            <template #actions>
                <UButton
                    :label="t('events.tryAgain')"
                    icon="i-lucide-refresh-cw"
                    color="error"
                    variant="soft"
                    size="sm"
                    :loading="events.loadingList"
                    @click="loadEvents"
                />
            </template>
        </UAlert>

        <UAlert
            v-if="!events.loadingList && events.events.length === 0 && events.error === ''"
            color="info"
            variant="subtle"
            icon="i-lucide-calendar-x"
            :title="t('events.list.emptyTitle')"
            :description="t('events.list.emptyDescription')"
        />

        <div v-if="events.events.length > 0">
            <div v-if="activeView === 'list'" class="grid gap-3">
                <EventListItem
                    v-for="event in events.events"
                    :key="event.id"
                    :event="event"
                />
                <div v-if="events.canLoadMore" class="flex justify-center pt-1">
                    <UButton
                        :label="t('events.list.loadNextMonth')"
                        icon="i-lucide-calendar-plus"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        :loading="events.loadingMore"
                        @click="loadMoreEvents"
                    />
                </div>
            </div>
            <EventCalendarView v-else :events="events.events" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useEventsStore } from "@store/events";
import EventCalendarView from "./EventCalendarView.vue";
import EventFilters from "./EventFilters.vue";
import EventListItem from "./EventListItem.vue";

const events = useEventsStore();
const { t } = useI18n();
const activeView = ref<"list" | "calendar">("list");
const viewItems = computed(() => [
    { label: t("events.list.listView"), value: "list", icon: "i-lucide-list" },
    { label: t("events.list.calendarView"), value: "calendar", icon: "i-lucide-calendar-days" },
]);

onMounted(() => {
    if (events.events.length === 0) {
        loadEvents();
    }
});

function loadEvents(): void {
    events.loadEvents().catch(() => {
        // The store logs technical details and exposes user-safe alert copy.
    });
}

function loadMoreEvents(): void {
    events.loadMoreEvents().catch(() => {
        // The store logs technical details and exposes user-safe alert copy.
    });
}
</script>
