<template>
    <UBadge
        :color="eventLocationColor(mode)"
        variant="soft"
        size="md"
        :icon="eventLocationIcon(mode)"
        class="font-semibold"
    >
        {{ t(`events.location.${mode}`) }}
    </UBadge>
</template>

<script setup lang="ts">
import { type EventLocationMode } from "@store/events";
import { useI18n } from "vue-i18n";
import {
    eventLocationColor,
    eventLocationIcon,
} from "./eventPresentation";

defineProps<{
    mode: EventLocationMode
}>();
const { t } = useI18n();
</script>
