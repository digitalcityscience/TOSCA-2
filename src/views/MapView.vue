<template>
    <div class="mapview">
        <WorkspaceListing :workspaces="geoserverStore.workspaceList"></WorkspaceListing>
        <MapContainer></MapContainer>
    </div>
</template>

<script setup lang="ts">
import MapContainer from '../components/MapContainer.vue'
import WorkspaceListing from '../components/WorkspaceListing.vue';
import { useGeoserverStore } from '../store/geoserver'
import { onMounted } from 'vue';
const geoserverStore = useGeoserverStore()
onMounted(()=>{
    geoserverStore.getWorkspaceList().then((data)=>{
        geoserverStore.workspaceList = data.workspaces.workspace
        console.log(data)
    }).catch((error)=>console.error(error))
    
})
</script>

<style scoped>
.mapview{
    width:100%;
    height:100%;
}
</style>