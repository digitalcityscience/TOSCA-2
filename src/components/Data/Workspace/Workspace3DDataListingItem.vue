<template>
    <div class="workspace-detail space-y-3 pt-1">
        <Workspace3DLayerListingItem
            v-for="item in demoTilesets"
            :key="item.identifier"
            :identifier="item.identifier"
            :title="item.title"
            :description="item.description"
            :tileset-url="item.tilesetUrl"
        />
    </div>
</template>

<script setup lang="ts">
// Mock "workspace" for 3D data: this deliberately bypasses the real catalog
// fetch (geoserver.getLayerList) that WorkspaceListingItem.vue uses, since
// there is no server-side 3D Tiles catalog entry yet. Once one exists, this
// component (and its accordion entry in WorkspaceListing.vue) can be removed
// in favor of the real catalog-driven flow.
import { useI18n } from "vue-i18n";
import { computed } from "vue";
import Workspace3DLayerListingItem from "@components/Data/Layer/Workspace3DLayerListingItem.vue";

const { t } = useI18n();
const demoTilesets = computed(() => [
    {
        identifier: "hamburg-lod3-untextured",
        title: t("workspace.demo3d.itemTitle"),
        description: t("workspace.demo3d.itemDescription"),
        tilesetUrl: "https://www.daten-hamburg.de/gdi3d/datasource-data/LoD3_untexturiert/tileset.json",
    },
])
</script>
