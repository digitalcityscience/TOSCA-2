<template>
    <div class="event-list">
        <EventMapOverlay />
        <EventFilters />

        <div v-if="events.loadingList && events.events.length === 0" class="flex justify-center py-8">
            <ProgressSpinner />
        </div>

        <Message v-if="events.error" severity="error" class="mb-3">
            {{ events.error }}
        </Message>

        <Message
            v-if="!events.loadingList && events.events.length === 0 && !events.error"
            severity="info"
        >
            No events are available.
        </Message>

        <Tabs value="list">
            <TabList>
                <Tab value="list">List</Tab>
                <Tab value="calendar">Calendar</Tab>
            </TabList>
            <TabPanels>
                <TabPanel value="list">
                    <div class="grid gap-3 pt-3">
                        <EventListItem
                            v-for="event in events.events"
                            :key="event.id"
                            :event="event"
                        />
                    </div>
                </TabPanel>
                <TabPanel value="calendar">
                    <div class="pt-3">
                        <EventCalendarView :events="events.events" />
                    </div>
                </TabPanel>
            </TabPanels>
        </Tabs>
    </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import Message from "primevue/message";
import ProgressSpinner from "primevue/progressspinner";
import Tab from "primevue/tab";
import TabList from "primevue/tablist";
import TabPanel from "primevue/tabpanel";
import TabPanels from "primevue/tabpanels";
import Tabs from "primevue/tabs";
import { useToast } from "primevue/usetoast";
import { useEventsStore } from "@store/events";
import EventCalendarView from "./EventCalendarView.vue";
import EventFilters from "./EventFilters.vue";
import EventListItem from "./EventListItem.vue";
import EventMapOverlay from "./EventMapOverlay.vue";

const events = useEventsStore();
const toast = useToast();

onMounted(() => {
    if (events.events.length === 0) {
        events.loadEvents().catch(showError);
    }
});

function showError(error: unknown): void {
    toast.add({ severity: "error", summary: "Error", detail: error, life: 3000 });
}
</script>
