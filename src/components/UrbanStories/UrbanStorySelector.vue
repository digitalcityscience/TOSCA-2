<template>
    <section class="grid gap-2" :aria-label="t('urbanStories.selector.label')">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">
            {{ t("urbanStories.selector.label") }}
        </h3>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
                v-for="story in props.stories"
                :key="story.key"
                type="button"
                :data-story-key="story.key"
                :aria-pressed="story.key === props.activeKey"
                :class="[
                    'flex min-w-0 items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                    story.key === props.activeKey
                        ? 'border-primary bg-primary/10 text-highlighted'
                        : 'border-muted bg-default hover:bg-elevated/70',
                ]"
                @click="emit('select', story.key)"
            >
                <UIcon :name="STORY_ICONS[story.key]" class="mt-0.5 size-4 shrink-0 text-primary" />
                <span class="min-w-0 font-medium">{{ localize(story.title, locale) }}</span>
            </button>
        </div>
    </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { localize, type UrbanStoryConfig, type UrbanStoryKey } from "../../config/urbanStories";

interface Props {
    stories: readonly UrbanStoryConfig[]
    activeKey?: UrbanStoryKey
}

const props = defineProps<Props>()
const emit = defineEmits<{
    select: [key: UrbanStoryKey]
}>()
const { t, locale } = useI18n();

const STORY_ICONS: Record<UrbanStoryKey, string> = {
    "fifteen-minute": "i-lucide-timer",
    "building-walking": "i-lucide-building-2",
    "walkability-safety": "i-lucide-footprints",
    "transit-equity": "i-lucide-tram-front",
    "green-spaces": "i-lucide-trees",
    "hamburg-riders": "i-lucide-train-front",
};
</script>
