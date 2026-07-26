<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { SUPPORTED_LOCALES, setLocale, type SupportedLocale } from "../../core/i18n";

const { t, locale } = useI18n();

const items = computed(() => SUPPORTED_LOCALES.map((code) => ({
    label: t(`locale.${code}`),
    value: code,
})));

const selected = computed({
    get: () => locale.value,
    set: (value: SupportedLocale) => setLocale(value),
});
</script>

<template>
  <USelect
    v-model="selected"
    :items="items"
    value-key="value"
    :aria-label="t('locale.label')"
    class="w-28"
  />
</template>
