<template>
    <nav :class="['map-side-frame', `map-side-frame-${props.side}`]" :aria-label="frameLabel">
        <UTooltip v-for="item in frameItems" :key="item.id" :text="item.label" :delay-duration="0">
            <UButton
                class="map-frame-button"
                :icon="item.icon"
                color="neutral"
                variant="ghost"
                square
                :aria-label="item.label"
                @click="item.action"
            />
        </UTooltip>
    </nav>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { toggleSlideoverSidebar } from "@helpers/slideoverSidebarRegistry";

interface Props {
    side: "left" | "right"
}

const props = defineProps<Props>()
const { t } = useI18n();
const route = useRoute()
const router = useRouter()

interface FrameItem {
    id: string
    label: string
    icon: string
    action: (event: MouseEvent) => void | Promise<void>
}

const frameLabel = computed(() => props.side === "left" ? t("map.sideFrame.leftLabel") : t("map.sideFrame.rightLabel"))
const frameItems = computed(() => props.side === "left" ? leftItems.value : rightItems.value)
const leftItems = computed<FrameItem[]>(() => [
    {
        id: "workspaceListing",
        label: t("map.sideFrame.datastores"),
        icon: "i-lucide-database",
        action: () => toggleSlideoverSidebar("workspaceListing"),
    },
    {
        id: "floodScenarios",
        label: t("map.sideFrame.floodScenarios"),
        icon: "i-lucide-waves",
        action: () => toggleSlideoverSidebar("floodScenarios"),
    },
    {
        id: "gq-geostory-sidebar",
        label: t("map.sideFrame.airQualityScenarios"),
        icon: "i-lucide-shield-plus",
        action: () => toggleSlideoverSidebar("gq-geostory-sidebar"),
    },
    {
        id: "participation",
        label: t("map.sideFrame.participation"),
        icon: "i-lucide-chart-column",
        action: async () => {
            if (route.name === "participation-home" || route.name === "active-campaigns" || route.name === "campaign-details") {
                toggleSlideoverSidebar("participation")
                return
            }
            await router.push({ name: "participation-home" })
        },
    },
    {
        id: "events",
        label: t("map.sideFrame.events"),
        icon: "i-lucide-calendar-days",
        action: async () => {
            if (route.name === "event-list" || route.name === "event-detail") {
                toggleSlideoverSidebar("events")
                return
            }
            await router.push({ name: "event-list" })
        },
    },
    {
        id: "geostories",
        label: t("map.sideFrame.geostories"),
        icon: "i-lucide-book-open",
        action: async () => {
            if (route.name === "geostory-list" || route.name === "geostory-detail") {
                toggleSlideoverSidebar("geostories")
                return
            }
            await router.push({ name: "geostory-list" })
        },
    },
])

const rightItems = computed<FrameItem[]>(() => [
    {
        id: "maplayerListing",
        label: t("map.sideFrame.layers"),
        icon: "i-lucide-layers",
        action: () => toggleSlideoverSidebar("maplayerListing"),
    },
    {
        id: "toolboxSidebar",
        label: t("map.toolbox.title"),
        icon: "i-lucide-wrench",
        action: () => toggleSlideoverSidebar("toolboxSidebar"),
    },
])
</script>

<style scoped>
.map-side-frame {
    position: relative;
    z-index: 60;
    width: var(--tosca-map-frame-width);
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 0;
    background: var(--tosca-map-frame-bg);
    border-color: var(--tosca-map-frame-border);
    box-shadow: 0 8px 24px var(--tosca-map-frame-shadow);
    pointer-events: auto;
}
.map-side-frame-left {
    border-right-width: 1px;
}
.map-side-frame-right {
    border-left-width: 1px;
}
.map-frame-button {
    width: 2.375rem;
    height: 2.375rem;
    padding: 0;
    flex: 0 0 auto;
}
</style>
