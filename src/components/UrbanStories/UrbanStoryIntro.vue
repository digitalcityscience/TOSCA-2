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
        <UAlert
            v-if="props.story.caveats.length > 0"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="t('urbanStories.intro.caveatsTitle')"
        >
            <template #description>
                <ul class="list-disc space-y-1 pl-4">
                    <li v-for="(caveat, index) in props.story.caveats" :key="index">
                        {{ localize(caveat, locale) }}
                    </li>
                </ul>
            </template>
        </UAlert>
    </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { localize, type UrbanStoryConfig } from "../../config/urbanStories";

interface Props {
    story: UrbanStoryConfig
}

const props = defineProps<Props>()
const { t, locale } = useI18n();
</script>
