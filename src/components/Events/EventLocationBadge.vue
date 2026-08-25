<template>
    <UBadge
        :color="eventLocationColor(mode)"
        variant="soft"
        size="md"
        :icon="eventLocationIcon(mode)"
        class="font-semibold"
    >
        {{ eventLocationLabel(mode) }}
    </UBadge>
</template>

<script setup lang="ts">
import { type EventLocationMode } from "@store/events";
import {
    eventLocationColor,
    eventLocationIcon,
    eventLocationLabel,
} from "./eventPresentation";

defineProps<{
    mode: EventLocationMode
}>();
</script>
