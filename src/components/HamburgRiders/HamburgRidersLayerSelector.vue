<template>
    <section class="hr-panel hr-panel-layers" :class="{ 'hr-collapsed': collapsed }" data-testid="riders-layers">
        <div class="hr-panel-header" @click="collapsed = !collapsed">
            <h3>{{ t("hamburgRiders.layers.title") }}</h3>
            <div class="hr-header-actions">
                <div class="hr-layer-controls" @click.stop>
                    <label>
                        <input
                            type="checkbox"
                            data-testid="riders-toggle-all"
                            :checked="allChecked"
                            :disabled="dataset === undefined"
                            @change="toggleAll(($event.target as HTMLInputElement).checked)"
                        >
                        {{ t("hamburgRiders.layers.all") }}
                    </label>
                </div>
                <button
                    type="button"
                    class="hr-icon-btn"
                    :aria-expanded="!collapsed"
                    :aria-label="collapsed ? t('hamburgRiders.controls.expand') : t('hamburgRiders.controls.collapse')"
                    @click.stop="collapsed = !collapsed"
                >{{ collapsed ? "⌃" : "⌄" }}</button>
            </div>
        </div>
        <div class="hr-layers-body hr-panel-body">
            <p v-if="dataset === undefined" class="hr-empty">{{ t("hamburgRiders.layers.empty") }}</p>
            <div
                v-for="section in sections"
                :key="section.mode"
                class="hr-type-group"
                :class="{ 'hr-collapsed': collapsedModes.has(section.mode) }"
                :data-testid="`riders-mode-${section.mode}`"
            >
                <div class="hr-type-header" @click="toggleCollapsed(section.mode)">
                    <input
                        type="checkbox"
                        :data-testid="`riders-mode-check-${section.mode}`"
                        :checked="section.anyVisible"
                        :aria-label="section.label"
                        @click.stop
                        @change="riders.setModeVehiclesVisible([section.mode], ($event.target as HTMLInputElement).checked)"
                    >
                    <span class="hr-type-icon" :style="{ color: MODE_STYLE[section.mode].hex }">●</span>
                    <span class="hr-type-name">{{ section.label }}</span>
                    <span class="hr-type-count">{{ section.count }}</span>
                    <span class="hr-type-arrow">▼</span>
                </div>
                <div class="hr-type-routes">
                    <label
                        v-for="group in section.groups"
                        :key="group.key"
                        class="hr-route-item"
                        :title="group.longName"
                    >
                        <input
                            type="checkbox"
                            :data-testid="`riders-route-${group.key}`"
                            :checked="visibleKeys.has(group.key)"
                            @change="riders.setGroupVisible(group.key, ($event.target as HTMLInputElement).checked)"
                        >
                        <span
                            v-if="group.kind === 'bus-type'"
                            class="hr-bus-icon"
                            :style="{ borderColor: `#${group.color}`, color: `#${group.color}` }"
                        >{{ busIcon(group.key) }}</span>
                        <span v-else class="hr-route-color" :style="{ background: `#${group.color}` }"></span>
                        <span class="hr-route-name">{{ group.label }}</span>
                        <span class="hr-route-trips">{{ group.kind === "bus-type" ? group.routeIds.length : group.tripCount }}</span>
                    </label>
                </div>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useHamburgRidersStore } from "@store/hamburgRiders";
import { BUS_TYPE_CONFIG, MODE_STYLE, RIDERS_MODES, type RidersBusType, type RidersMode } from "@helpers/hamburgRiders/ridersConfig";

const { t } = useI18n();
const riders = useHamburgRidersStore();
const collapsed = ref(typeof window !== "undefined" && window.matchMedia?.("(max-width: 700px)").matches === true);
const collapsedModes = reactive(new Set<RidersMode>(
    typeof window !== "undefined" && window.matchMedia?.("(max-width: 700px)").matches === true ? RIDERS_MODES : []
));

const dataset = computed(() => riders.dataset);
// The panel shows the same state as TOSCA's layer list: it reads the store's effective selection.
const visibleKeys = computed(() => new Set(riders.effective.vehicleGroups));

const sections = computed(() => {
    const ds = dataset.value;
    return RIDERS_MODES.map((mode) => {
        const groups = ds === undefined ? [] : ds.modeGroups[mode].map((index) => ds.groups[index]);
        return {
            mode,
            label: t(`hamburgRiders.layers.modes.${mode}`),
            groups,
            // As in the original panel: buses are counted by GTFS route, other modes by line.
            count: mode === "bus" ? groups.reduce((sum, group) => sum + group.routeIds.length, 0) : groups.length,
            anyVisible: groups.some((group) => visibleKeys.value.has(group.key)),
        };
    });
});

const allChecked = computed(() => {
    const groups = dataset.value?.groups ?? [];
    return groups.length > 0 && groups.every((group) => visibleKeys.value.has(group.key));
});

function toggleAll(checked: boolean): void {
    riders.setModeVehiclesVisible([...RIDERS_MODES], checked);
}

function toggleCollapsed(mode: RidersMode): void {
    if (collapsedModes.has(mode)) collapsedModes.delete(mode);
    else collapsedModes.add(mode);
}

function busIcon(key: string): string {
    return BUS_TYPE_CONFIG[key.split("|")[1] as RidersBusType]?.icon ?? "";
}
</script>
