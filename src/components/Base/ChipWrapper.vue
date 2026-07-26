<template>
	<UBadge :color="badgeColor" variant="solid" size="md" class="m-0.5">
		<span>{{ props.label }}</span>
		<UButton
			v-if="props.removable"
			icon="i-lucide-x"
			color="neutral"
			variant="link"
			size="xs"
			square
			class="-mr-1 ml-1 text-inverted hover:text-inverted/80"
			:aria-label="t('common.remove')"
			@click="$emit('remove')"
		/>
	</UBadge>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

interface Props {
    severity?: "primary" | "secondary" | "success" | "info" | "warning" | "danger",
    removable?: boolean,
    label?: string
}
const props = withDefaults(defineProps<Props>(), {
    severity: "primary",
    removable: false,
    label: undefined,
})
const badgeColor = computed(() => {
    return props.severity === "danger" ? "error" : props.severity
})
</script>

<style scoped>

</style>
