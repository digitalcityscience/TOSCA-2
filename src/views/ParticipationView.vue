<template>
    <router-view>
        <ParticipationSidebar></ParticipationSidebar>
    </router-view>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import ParticipationSidebar from "../components/Participation/ParticipationSidebar.vue"
import { useMapStore } from "../store/map"
const mapStore = useMapStore()
onMounted(() => {
    // reset all data on the map before adding demo data
    mapStore.resetMapData().then(() => { }, () => { })
})
</script>

<style scoped></style>
