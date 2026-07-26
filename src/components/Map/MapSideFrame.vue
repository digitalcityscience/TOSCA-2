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
import { useRoute, useRouter } from "vue-router";
import { toggleSlideoverSidebar } from "@helpers/slideoverSidebarRegistry";

interface Props {
    side: "left" | "right"
}

const props = defineProps<Props>()
const route = useRoute()
const router = useRouter()

interface FrameItem {
    id: string
    label: string
    icon: string
    action: (event: MouseEvent) => void | Promise<void>
}

const frameLabel = computed(() => props.side === "left" ? "Left map tools" : "Right map tools")
const frameItems = computed(() => props.side === "left" ? leftItems.value : rightItems.value)
const leftItems = computed<FrameItem[]>(() => [
    {
        id: "workspaceListing",
        label: "Datastores",
        icon: "i-lucide-database",
        action: () => toggleSlideoverSidebar("workspaceListing"),
    },
    {
        id: "floodScenarios",
        label: "Flood scenarios",
        icon: "i-lucide-waves",
        action: () => toggleSlideoverSidebar("floodScenarios"),
    },
    {
        id: "gq-geostory-sidebar",
        label: "Air quality scenarios",
        icon: "i-lucide-shield-plus",
        action: () => toggleSlideoverSidebar("gq-geostory-sidebar"),
    },
    {
        id: "participation",
        label: "Participation",
        icon: "i-lucide-chart-column",
        action: async () => {
            if (route.name === "participation-home" || route.name === "active-campaigns" || route.name === "campaign-details") {
                toggleSlideoverSidebar("participation")
                return
            }
            await router.push({ name: "participation-home" })
        },
    },
])

const rightItems = computed<FrameItem[]>(() => [
    {
        id: "maplayerListing",
        label: "Layers",
        icon: "i-lucide-layers",
        action: () => toggleSlideoverSidebar("maplayerListing"),
    },
    {
        id: "toolboxSidebar",
        label: "Toolbox",
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
