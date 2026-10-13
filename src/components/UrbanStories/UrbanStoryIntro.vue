<template>
    <section class="grid gap-3" data-testid="urban-story-intro">
        <div class="grid gap-1">
            <h2 class="text-base font-semibold text-highlighted">
                {{ localize(props.story.title, locale) }}
            </h2>
            <p class="text-sm text-default">
                {{ localize(props.story.intro, locale) }}
            </p>
        </div>
        <details v-if="props.compact && props.story.caveats.length > 0" class="rounded-md border border-default border-l-4 border-l-warning bg-elevated p-3" data-testid="urban-story-caveats-compact">
            <summary class="flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-highlighted">
                <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0 text-warning" aria-hidden="true" />
                {{ t('urbanStories.intro.caveatsTitle') }}
            </summary>
            <ul class="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-default marker:text-warning">
                <li v-for="(caveat, index) in props.story.caveats" :key="index">
                    {{ localize(caveat, locale) }}
                </li>
            </ul>
        </details>
        <aside
            v-else-if="props.story.caveats.length > 0"
            class="grid gap-2 rounded-md border border-default border-l-4 border-l-warning bg-elevated p-3"
            data-testid="urban-story-caveats"
        >
            <h3 class="flex items-center gap-1.5 text-sm font-semibold text-highlighted">
                <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0 text-warning" aria-hidden="true" />
                {{ t('urbanStories.intro.caveatsTitle') }}
            </h3>
            <ul class="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-default marker:text-warning">
                <li v-for="(caveat, index) in props.story.caveats" :key="index">
                    {{ localize(caveat, locale) }}
                </li>
            </ul>
        </aside>
    </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { localize, type UrbanStoryConfig } from "../../config/urbanStories";

interface Props {
    story: UrbanStoryConfig
    /** Caveats fold away so a running scene stays in view. */
    compact?: boolean
}

const props = defineProps<Props>()
const { t, locale } = useI18n();
</script>
