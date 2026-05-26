<template>
    <div class="event-calendar">
        <div class="mb-3 flex items-center justify-between gap-2">
            <Button icon="pi pi-chevron-left" text rounded aria-label="Previous month" @click="goToPreviousMonth" />
            <h3 class="text-lg font-semibold text-surface-900">{{ monthLabel }}</h3>
            <Button icon="pi pi-chevron-right" text rounded aria-label="Next month" @click="goToNextMonth" />
        </div>

        <div class="calendar-grid mb-2">
            <div v-for="day in weekdayLabels" :key="day" class="calendar-weekday">
                {{ day }}
            </div>
        </div>

        <div class="calendar-grid">
            <div
                v-for="day in calendarDays"
                :key="day.key"
                class="calendar-day"
                :class="{ 'calendar-day-muted': !day.inMonth }"
            >
                <div class="calendar-day-number">{{ day.date.getDate() }}</div>
                <div class="grid gap-1">
                    <RouterLink
                        v-for="event in eventsByDay(day.date)"
                        :key="event.id"
                        class="calendar-event"
                        :to="{ name: 'event-detail', params: { eventId: event.id } }"
                    >
                        <span class="calendar-event-time">{{ formatTime(event.start_datetime) }}</span>
                        <span class="calendar-event-title">{{ event.title }}</span>
                    </RouterLink>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import Button from "primevue/button";
import { type EventListItem } from "@store/events";

const props = defineProps<{
    events: EventListItem[]
}>();

const visibleMonth = ref(startOfMonth(new Date()));

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

    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(gridStart);
        date.setDate(gridStart.getDate() + index);
        return {
            key: date.toISOString(),
            date,
            inMonth: date.getMonth() === visibleMonth.value.getMonth(),
        };
    });
});

function eventsByDay(date: Date): EventListItem[] {
    return props.events.filter((event) => {
        const eventDate = new Date(event.start_datetime);
        return isSameDay(eventDate, date);
    });
}

function goToPreviousMonth(): void {
    visibleMonth.value = new Date(visibleMonth.value.getFullYear(), visibleMonth.value.getMonth() - 1, 1);
}

function goToNextMonth(): void {
    visibleMonth.value = new Date(visibleMonth.value.getFullYear(), visibleMonth.value.getMonth() + 1, 1);
}

function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
}

function formatTime(value: string): string {
    return new Intl.DateTimeFormat(undefined, {
        timeStyle: "short",
    }).format(new Date(value));
}
</script>

<style scoped>
.calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 0.35rem;
}

.calendar-weekday {
    text-align: center;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--surface-500);
}

.calendar-day {
    min-height: 96px;
    border: 1px solid var(--surface-200);
    border-radius: 6px;
    background: var(--surface-0);
    padding: 0.4rem;
}

.calendar-day-muted {
    background: var(--surface-50);
    color: var(--surface-400);
}

.calendar-day-number {
    margin-bottom: 0.35rem;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--surface-600);
}

.calendar-event {
    display: grid;
    gap: 0.1rem;
    border-left: 3px solid var(--primary-500);
    border-radius: 4px;
    background: var(--primary-50);
    padding: 0.25rem 0.35rem;
    color: var(--surface-900);
}

.calendar-event-time {
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--primary-700);
}

.calendar-event-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.72rem;
    font-weight: 600;
}
</style>
