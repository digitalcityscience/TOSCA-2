<template>
	<Chip @remove="$emit('remove')" :removable="props.removable" :label="props.label" :pt="ptClasses"/>
</template>

<script setup lang="ts">
import Chip from "primevue/chip"
import { computed } from "vue";

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
const ptClasses = computed(()=>{
    let colors: string[] = []
    switch (props.severity) {
        case "primary":
            colors = ["text-white dark:text-surface-900", "bg-primary-500 dark:bg-primary-400", "border border-primary-500 dark:border-primary-400"]
            break;
        case "secondary":
            colors = ["text-white dark:text-surface-900", "bg-surface-500 dark:bg-surface-400", "border border-surface-500 dark:border-surface-400"]
            break;
        case "success":
            colors = ["text-white dark:text-green-900", "bg-green-500 dark:bg-green-400", "border border-green-500 dark:border-green-400"]
            break;
        case "info":
            colors = ["text-white dark:text-surface-900", "bg-blue-500 dark:bg-blue-400", "border border-blue-500 dark:border-blue-400"]
            break;
        case "warning":
            colors = ["text-white dark:text-surface-900", "bg-orange-500 dark:bg-orange-400", "border border-orange-500 dark:border-orange-400"]
            break;
        case "danger":
            colors = ["text-white dark:text-surface-900", "bg-red-500 dark:bg-red-400", "border border-red-500 dark:border-red-400"]
            break;
        default:
            colors = ["text-white dark:text-surface-900", "bg-primary-500 dark:bg-primary-400", "border border-primary-500 dark:border-primary-400"]
            break;
    }
    return {
        root: {
            class: [
            // Flexbox
                "inline-flex items-center",

                // Spacing
                "px-2",
                "m-[2px]",
                // Shape
                "rounded-[1rem]",
                ...colors
            ]
        }
    }
})
</script>

<style scoped>

</style>
