<template>
	<BaseSlideoverSidebarComponent
        :id="sidebarID"
        :side="sidebarPosition"
        :collapsed="route.meta.sidebar !== sidebarID"
    >
		<template #header>
			<p>{{ t('participation.sidebar.title') }}</p>
		</template>
		<div class="nav w-full flex justify-end py-1">
            <RouterLink v-if="$route.name === 'campaign-details'" :to="{ name: 'active-campaigns' }">
                <UButton size="sm" color="secondary">{{ t('participation.sidebar.backToCampaigns') }}</UButton>
            </RouterLink>
        </div>
        <div class="pt-2">
            <router-view></router-view>
        </div>
	</BaseSlideoverSidebarComponent>
</template>

<script setup lang="ts">
import BaseSlideoverSidebarComponent from "@components/Base/BaseSlideoverSidebarComponent.vue"
import { RouterLink, useRoute } from "vue-router";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const sidebarID = "participation"
const sidebarPosition = "left"

const route = useRoute()
</script>

<style scoped></style>
