<template>
    <section class="grid gap-2 rounded-md border border-muted bg-elevated/40 px-3 py-2" data-testid="urban-stories-about">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">
            {{ t("urbanStories.about.title") }}
        </h3>
        <p class="text-xs text-default">{{ t("urbanStories.about.attribution") }}</p>
        <p class="text-xs text-muted">{{ t("urbanStories.about.disclaimer") }}</p>

        <div class="border-t border-muted pt-1">
            <button
                type="button"
                class="flex w-full items-center justify-between gap-2 rounded-sm py-1 text-left text-xs font-semibold text-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                data-testid="urban-stories-credits-toggle"
                :aria-expanded="open"
                :aria-controls="panelId"
                @click="open = !open"
            >
                <span>{{ t("urbanStories.credits.title") }}</span>
                <UIcon
                    name="i-lucide-chevron-down"
                    :class="['size-4 shrink-0 text-muted transition-transform', open ? 'rotate-180' : '']"
                    aria-hidden="true"
                />
            </button>

            <div v-show="open" :id="panelId" class="grid gap-3 pt-2" data-testid="urban-stories-credits-panel">
                <p class="text-xs text-muted">{{ t("urbanStories.credits.intro") }}</p>
                <div v-for="group in groups" :key="group.key" class="grid gap-1.5">
                    <h4 class="text-xs font-semibold text-default">{{ t(`urbanStories.credits.groups.${group.key}`) }}</h4>
                    <ul class="grid gap-1.5">
                        <li v-for="credit in group.items" :key="credit.id" class="text-xs text-muted" :data-credit="credit.id">
                            <a
                                v-if="credit.url"
                                :href="credit.url"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                            >{{ credit.name }}</a>
                            <span v-else class="font-medium text-default">{{ credit.name }}</span>
                            <span> — {{ t(`urbanStories.credits.items.${credit.id}`) }}. {{ credit.attribution }}.</span>
                            <template v-if="credit.license">
                                <span>{{ ` ${t("urbanStories.credits.license")}: ` }}</span>
                                <a
                                    v-if="CREDIT_LICENSES[credit.license].url"
                                    :href="CREDIT_LICENSES[credit.license].url"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                                >{{ CREDIT_LICENSES[credit.license].label }}</a>
                                <span v-else>{{ CREDIT_LICENSES[credit.license].label }}</span>.
                            </template>
                        </li>
                    </ul>
                </div>
                <p class="text-xs text-muted">{{ t("urbanStories.credits.modified") }}</p>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import { CREDIT_GROUPS, CREDIT_LICENSES, DATA_CREDITS } from "../../config/urbanStories/dataCredits";

const { t } = useI18n();
const panelId = `urban-stories-credits-${useId()}`;
// Collapsed whenever the sidebar mounts, so opening Urban Stories always starts compact.
const open = ref(false);

const groups = computed(() => CREDIT_GROUPS.map((key) => ({
    key,
    items: DATA_CREDITS.filter((credit) => credit.group === key),
})));
</script>
