<template>
    <div class="bg-slate-200 rounded-md h-full">
        <div class="w-full flex justify-center py-1 px-2">
            <h1 class="font-bold text-xl text-center">Welcome to Digital City Science Citizen Participation Portal</h1>
        </div>
        <div class="welcome-content w-full px-2">
            Join us in shaping the future of our urban spaces. This platform empowers you to share your ideas, insights, and feedback on key developments in your city. Together, we can create a smarter, greener, and more inclusive urban environment. Explore our latest campaign, contribute to discussions, and help design the urban context that works for everyone. Your voice matters—let's build the city of tomorrow, today!
        </div>
        <div class="w-full grid lg:grid-cols-1 2xl:grid-cols-2 p-2 pt-3">
            <RouterLink :to="{ name:'active-campaigns' }">
                <Button class="w-full" size="small">See Active Campaigns</Button>
            </RouterLink>
        </div>
    </div>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import Button from "primevue/button";
</script>

<style scoped>

</style>
