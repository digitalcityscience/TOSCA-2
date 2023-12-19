<template>
    <div v-if="props.list">
        <div v-for="(item,index) in props.list" :key="index">
            {{ item.name }}
        </div>
    </div>
    <div v-else>
        There is no layer in this workspace
    </div>
</template>

<script setup lang="ts">
import { GeoserverLayerListItem } from '../store/geoserver';
export interface Props {
    list: Array<GeoserverLayerListItem> | undefined
    workspaceName:string
}
const props = defineProps<Props>()
</script>
<style scoped></style>