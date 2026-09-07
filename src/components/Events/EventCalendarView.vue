<template>
    <section class="grid gap-3" aria-label="Event calendar">
        <div class="flex items-center justify-between gap-2">
            <UButton
                icon="i-lucide-chevron-left"
                color="neutral"
                variant="ghost"
                square
                :disabled="isAtEarliestMonth"
                aria-label="Previous month"
                @click="goToPreviousMonth"
            />
            <h3 class="text-base font-semibold text-highlighted">{{ monthLabel }}</h3>
            <UButton
                icon="i-lucide-chevron-right"
                color="neutral"
                variant="ghost"
                square
                :loading="navigatingForward"
                aria-label="Next month"
                @click="goToNextMonth"
            />
        </div>

        <div v-if="visibleLocationModes.length > 0" class="flex flex-wrap justify-center gap-1.5" aria-label="Location types">
            <UBadge
                v-for="mode in visibleLocationModes"
                :key="mode"
                :color="eventLocationColor(mode)"
                variant="soft"
                size="sm"
                :icon="eventLocationIcon(mode)"
                class="font-semibold"
            >
                {{ eventLocationLabel(mode) }}
            </UBadge>
        </div>

        <div class="overflow-x-auto pb-1">
            <div class="calendar-shell">
                <div class="calendar-grid">
                    <div v-for="day in weekdayLabels" :key="day" class="calendar-weekday">
                        {{ day }}
                    </div>
                </div>

                <div class="calendar-grid mt-1.5">
                    <div
                        v-for="day in calendarDays"
                        :key="day.key"
                        class="calendar-day"
                        :class="{ 'calendar-day-muted': !day.inMonth, 'calendar-day-today': day.isToday }"
                    >
                        <div class="calendar-day-number">{{ day.date.getDate() }}</div>
                        <div class="grid gap-1">
                            <UTooltip
                                v-for="event in eventsByDay(day.date)"
                                :key="event.id"
                                :delay-duration="150"
                                :content="{ side: 'top', sideOffset: 8, collisionPadding: 12 }"
                                :ui="{
                                    content: 'calendar-event-tooltip',
                                }"
                            >
                                <UButton
                                    :to="{ name: 'event-detail', params: { eventId: event.id } }"
                                    :color="eventLocationColor(event.location_mode)"
                                    variant="soft"
                                    size="xs"
                                    class="calendar-event w-full"
                                    :icon="eventLocationIcon(event.location_mode)"
                                    :aria-label="`${eventLocationLabel(event.location_mode)}, ${formatEventTime(event.start_datetime)} ${event.title}`"
                                >
                                    <span class="calendar-event-label">
                                        <strong>{{ formatEventTime(event.start_datetime) }}</strong>
                                        {{ event.title }}
                                    </span>
                                </UButton>

                                <template #content>
                                    <article class="grid gap-2 text-left">
                                        <UBadge
                                            :color="eventLocationColor(event.location_mode)"
                                            variant="soft"
                                            size="sm"
                                            :icon="eventLocationIcon(event.location_mode)"
                                            class="w-fit font-semibold"
                                        >
                                            {{ eventLocationLabel(event.location_mode) }}
                                        </UBadge>
                                        <h4 class="text-sm font-semibold leading-snug">{{ event.title }}</h4>
                                        <p class="flex items-center gap-1.5 text-xs font-medium text-toned">
                                            <UIcon name="i-lucide-calendar-clock" class="size-3.5 shrink-0 text-muted" />
                                            <span>{{ formatEventPreviewDate(event.start_datetime) }}</span>
                                        </p>
                                        <p v-if="event.summary !== ''" class="line-clamp-3 text-xs leading-relaxed text-toned">
                                            {{ event.summary }}
                                        </p>
                                        <p v-if="event.location_mode === 'online'" class="text-xs font-medium text-info">
                                            Online event — no physical map location
                                        </p>
                                    </article>
                                </template>
                            </UTooltip>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { type EventListItem, type EventLocationMode, useEventsStore } from "@store/events";
import {
    eventLocationColor,
    eventLocationIcon,
    eventLocationLabel,
    formatEventTime,
} from "./eventPresentation";

const props = defineProps<{
    events: EventListItem[]
}>();

const eventsStore = useEventsStore();
const visibleMonth = ref(startOfMonth(firstRelevantDate(props.events)));
const navigatingForward = ref(false);

const isAtEarliestMonth = computed(() => {
    return visibleMonth.value.getTime() <= startOfMonth(new Date()).getTime();
});

const visibleLocationModes = computed(() => {
    const preferredOrder: EventLocationMode[] = [
        "physical",
        "online",
        "hybrid",
        "by_arrangement",
        "home_visit",
    ];
    const modes = new Set(props.events.map((event) => event.location_mode));
    return preferredOrder.filter((mode) => modes.has(mode));
});

const monthLabel = computed(() => {
    return new Intl.DateTimeFormat(undefined, {
        month: "long",
        year: "numeric",
    }).format(visibleMonth.value);
});

const weekdayLabels = computed(() => {
    const start = new Date(2026, 0, 4);
    return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
    });
});

const calendarDays = computed(() => {
    const firstOfMonth = startOfMonth(visibleMonth.value);
    const firstDayOffset = firstOfMonth.getDay();
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - firstDayOffset);
    const today = new Date();

    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(gridStart);
        date.setDate(gridStart.getDate() + index);
        return {
            key: date.toISOString(),
            date,
            inMonth: date.getMonth() === visibleMonth.value.getMonth(),
            isToday: isSameDay(date, today),
        };
    });
});

function eventsByDay(date: Date): EventListItem[] {
    return props.events.filter((event) => {
        return isSameDay(new Date(event.start_datetime), date);
    });
}

function formatEventPreviewDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

function goToPreviousMonth(): void {
    if (isAtEarliestMonth.value) {
        return;
    }
    visibleMonth.value = new Date(visibleMonth.value.getFullYear(), visibleMonth.value.getMonth() - 1, 1);
}

async function goToNextMonth(): Promise<void> {
    const nextMonth = new Date(visibleMonth.value.getFullYear(), visibleMonth.value.getMonth() + 1, 1);
    const loadedThrough = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 1);

    navigatingForward.value = true;
    try {
        await eventsStore.ensureEventsThrough(loadedThrough);
        visibleMonth.value = nextMonth;
    } catch {
        // The store logs technical details and exposes user-safe alert copy.
    } finally {
        navigatingForward.value = false;
    }
}

function firstRelevantDate(events: EventListItem[]): Date {
    const now = new Date();
    const firstUpcoming = events
        .map((event) => new Date(event.start_datetime))
        .filter((date) => !Number.isNaN(date.getTime()) && date >= now)
        .sort((a, b) => a.getTime() - b.getTime())[0];
    return firstUpcoming ?? now;
}

function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
}
</script>

<style scoped>
.calendar-shell {
    min-width: 42rem;
}
.calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 0.375rem;
}
.calendar-weekday {
    text-align: center;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--ui-text-muted);
}
.calendar-day {
    min-height: 6.5rem;
    border: 1px solid var(--ui-border-muted);
    border-radius: 0.5rem;
    background: var(--ui-bg);
    padding: 0.375rem;
}
.calendar-day-muted {
    background: var(--ui-bg-muted);
    opacity: 0.65;
}
.calendar-day-today {
    box-shadow: inset 0 0 0 1px var(--ui-primary);
}
.calendar-day-number {
    margin-bottom: 0.25rem;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--ui-text-toned);
}
.calendar-event {
    min-width: 0;
    justify-content: flex-start;
    padding-inline: 0.375rem;
}
.calendar-event-label {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.7rem;
}
:global(.calendar-event-tooltip) {
    z-index: 90 !important;
    display: block !important;
    width: 17rem;
    max-width: calc(100vw - 1.5rem);
    height: auto !important;
    border: 1px solid var(--ui-border-accented) !important;
    border-radius: 0.625rem !important;
    background: var(--ui-bg) !important;
    color: var(--ui-text) !important;
    padding: 0.75rem !important;
    opacity: 1 !important;
    box-shadow: 0 12px 30px rgb(15 23 42 / 0.22) !important;
    backdrop-filter: none !important;
}
</style>
