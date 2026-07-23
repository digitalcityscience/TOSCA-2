<template>
    <USlideover
        v-model:open="isOpen"
        :side="props.side"
        inset
        transition
        :overlay="false"
        :dismissible="false"
        :modal="false"
        :unmount-on-hide="true"
        :close="false"
        :ui="slideoverUi"
        @update:open="handleOpenUpdate"
        @after:enter="emit('afterOpen')"
        @after:leave="emit('afterClose')"
    >
        <template #content>
            <section :id="props.id" :data-position="props.side" class="flex h-full min-h-0 flex-col">
                <header v-if="$slots.header || props.title" class="flex min-h-9 items-center gap-2 border-b border-muted px-3 py-1.5">
                    <div class="min-w-0 flex-1 text-sm font-semibold text-highlighted">
                        <slot name="header">
                            <span class="truncate">{{ props.title }}</span>
                        </slot>
                    </div>
                    <UButton
                        class="shrink-0"
                        :icon="closeIcon"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        square
                        aria-label="Collapse sidebar"
                        @click="collapse"
                    />
                </header>
                <main class="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                    <slot />
                </main>
                <footer v-if="$slots.footer" class="min-h-8 border-t border-muted px-3 py-1.5">
                    <slot name="footer" />
                </footer>
            </section>
        </template>
    </USlideover>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
    type SlideoverSidebarSide,
    registerSlideoverSidebar,
    openSlideoverSidebar,
} from "@helpers/slideoverSidebarRegistry";

interface Props {
    id: string
    side?: SlideoverSidebarSide
    title?: string
    collapsed?: boolean
    widthClass?: string
}

const props = withDefaults(defineProps<Props>(), {
    side: "right",
    collapsed: true,
    widthClass: "w-[min(24rem,calc(100vw-5rem))]",
})
const emit = defineEmits<{
    afterOpen: []
    afterClose: []
}>()

const isOpen = ref(!props.collapsed)
const slideoverUi = computed(() => ({
    content: [
        props.widthClass,
        contentOffsetClass.value,
        "max-w-[calc(100vw-5rem)] bg-default/95 text-default shadow-xl ring ring-muted backdrop-blur",
    ].join(" "),
    header: "hidden",
    body: "p-0",
    footer: "hidden",
}))
const contentOffsetClass = computed(() => {
    if (props.side === "left") return "!top-[10px] !bottom-[10px] !left-[4.5rem]"
    if (props.side === "right") return "!top-[10px] !bottom-[10px] !right-[4.5rem]"
    return ""
})
const closeIcon = computed(() => {
    if (props.side === "left") return "i-lucide-panel-left-close"
    if (props.side === "right") return "i-lucide-panel-right-close"
    return "i-lucide-x"
})

watch(() => props.collapsed, (collapsed) => {
    if (collapsed) {
        isOpen.value = false
    } else {
        openSlideoverSidebar(props.id)
    }
})

watch(() => props.side, (side, previousSide) => {
    if (side !== previousSide && isOpen.value) {
        openSlideoverSidebar(props.id)
    }
})

function handleOpenUpdate(open: boolean): void {
    if (open) {
        openSlideoverSidebar(props.id)
    }
}

function open(): void {
    isOpen.value = true
}

function close(): void {
    isOpen.value = false
}

function toggle(): void {
    if (isOpen.value) {
        close()
    } else {
        openSlideoverSidebar(props.id)
    }
}

function collapse(): void {
    close()
}

function expand(): void {
    openSlideoverSidebar(props.id)
}

const unregister = registerSlideoverSidebar({
    id: props.id,
    side: props.side,
    open,
    close,
    toggle,
    collapse,
    expand,
    isOpen: () => isOpen.value,
})

onBeforeUnmount(() => {
    unregister()
})

defineExpose({
    open,
    close,
    toggle,
    collapse,
    expand,
})
</script>
