<template>
    <section class="grid gap-3" aria-label="Event calendar">
        <div class="flex items-center justify-between gap-2">
            <UButton
                icon="i-lucide-chevron-left"
                color="neutral"
                variant="ghost"
                square
                aria-label="Previous month"
                @click="goToPreviousMonth"
            />
            <h3 class="text-base font-semibold text-highlighted">{{ monthLabel }}</h3>
            <UButton
                icon="i-lucide-chevron-right"
                color="neutral"
                variant="ghost"
                square
                aria-label="Next month"
                @click="goToNextMonth"
            />
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
                            <UButton
                                v-for="event in eventsByDay(day.date)"
                                :key="event.id"
                                :to="{ name: 'event-detail', params: { eventId: event.id } }"
                                color="primary"
                                variant="soft"
                                size="xs"
                                class="calendar-event"
                                :aria-label="`${formatEventTime(event.start_datetime)} ${event.title}`"
                            >
                                <span class="calendar-event-label">
                                    <strong>{{ formatEventTime(event.start_datetime) }}</strong>
                                    {{ event.title }}
                                </span>
                            </UButton>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { type EventListItem } from "@store/events";
import { formatEventTime } from "./eventPresentation";

const props = defineProps<{
    events: EventListItem[]
}>();

const visibleMonth = ref(startOfMonth(firstRelevantDate(props.events)));

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

function goToPreviousMonth(): void {
    visibleMonth.value = new Date(visibleMonth.value.getFullYear(), visibleMonth.value.getMonth() - 1, 1);
}

function goToNextMonth(): void {
    visibleMonth.value = new Date(visibleMonth.value.getFullYear(), visibleMonth.value.getMonth() + 1, 1);
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
</style>
