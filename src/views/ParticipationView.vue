<template>
    <router-view>
        <ParticipationSidebar></ParticipationSidebar>
    </router-view>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import ParticipationSidebar from "../components/Participation/ParticipationSidebar.vue"
import sidebarConfig from "../configurations/sidebars"
import { useMapStore } from "../store/map"
const mapStore = useMapStore()
onMounted(() => {
    console.log("participation mounted")
    // rearrange sidebar visibility
    sidebarConfig.sidebars.forEach((sidebar) => {
        document.getElementById(sidebar.id)?.classList.toggle("collapsed")
    })
    // reset all data on the map before adding demo data
    mapStore.resetMapData().then(() => { }, () => { })
})
</script>

<style scoped></style>
