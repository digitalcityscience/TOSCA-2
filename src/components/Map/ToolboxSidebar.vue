<template>
    <BaseSlideoverSidebarComponent :id="sidebarID" side="right" :collapsed="true">
        <template #header>
            <p>{{ t('map.toolbox.title') }}</p>
        </template>
        <div class="w-full p-3">
            <UAccordion
                :items="toolboxItems"
                type="multiple"
                :default-value="['draw']"
                :unmount-on-hide="false"
                :ui="{
                    item: 'rounded-md border border-muted !border-b last:!border-b bg-default/70 mb-2 overflow-hidden',
                    trigger: 'px-3 py-2.5 rounded-none text-highlighted hover:bg-elevated/70',
                    label: 'text-sm font-semibold',
                    body: 'p-3 bg-elevated/40 border-t border-muted'
                }"
            >
                <template #body="{ item }">
                    <DrawContainer v-if="item.value === 'draw'" />
                    <BufferContainer v-if="item.value === 'buffer'" />
                </template>
            </UAccordion>
        </div>
    </BaseSlideoverSidebarComponent>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import BaseSlideoverSidebarComponent from "@components/Base/BaseSlideoverSidebarComponent.vue";
import DrawContainer from "@components/Map/Layer/Draw/DrawContainer.vue";
import BufferContainer from "@components/Map/Buffer/BufferContainer.vue";

const { t } = useI18n();
const sidebarID = "toolboxSidebar"
const toolboxItems = computed(() => [
    {
        label: t("map.toolbox.draw"),
        value: "draw",
        icon: "i-lucide-pencil-ruler",
    },
    {
        label: t("map.toolbox.buffer"),
        value: "buffer",
        icon: "i-lucide-circle-dot-dashed",
    },
])
</script>
