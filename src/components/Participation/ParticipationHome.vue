<template>
    <div class="bg-slate-200 rounded-md h-full">
        <div class="w-full flex justify-center py-1 px-2">
            <h1 class="font-bold text-xl text-center">{{ t('participation.home.welcomeTitle') }}</h1>
        </div>
        <div class="welcome-content w-full px-2">
            {{ t('participation.home.welcomeBody') }}
        </div>
        <div class="w-full grid lg:grid-cols-1 2xl:grid-cols-2 p-2 pt-3">
            <RouterLink :to="{ name:'active-campaigns' }">
                <UButton class="w-full" size="sm">{{ t('participation.home.seeActiveCampaigns') }}</UButton>
            </RouterLink>
        </div>
    </div>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useI18n } from "vue-i18n";
const { t } = useI18n();
</script>

<style scoped>

</style>
