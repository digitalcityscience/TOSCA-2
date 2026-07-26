<template>
    <UCard>
        <template #header>
            <h2 class="text-xl font-bold flex items-center">{{ t('participation.form.giveFeedback') }} <UButton color="error" variant="ghost" size="sm"
                    @click="resetFeedbackCycle(false)">{{ t('participation.form.reset') }}</UButton></h2>
        </template>
        <template #default>
            <div v-if="participation.feedbackOnProgress" class="w-full relative">
                <div v-if="campaign.rate_enabled && participation.feedbackStep == 'rating'" class="rating pb-2">
                    <h3 class="text-lg font-semibold ">{{ t('participation.form.rateProject') }}</h3>
                    <p class="text-xs font-extralight italic">{{ t('participation.form.ratingScale') }}</p>
                    <UInputRating class="w-full pt-3" v-model="rating" :length="5" :clearable="false" color="warning" />
                </div>
                <div v-if="campaign.form_enabled && (participation.feedbackStep === 'feedback'||participation.feedbackStep === 'location')" class="form">
                    <div v-if="participation.feedbackStep === 'location'" class="w-full grid lg:grid-cols-1 2xl:grid-cols-2 pt-2">
                        <div class="w-full col-span-2">
                            <p class="text-sm font-light pb-4">{{ t('participation.form.chooseLocation') }}
                            </p>
                        </div>
                        <div class="w-full col-span-2">
                            <UButton v-if="!participation.locationSelectionOnProgress" size="sm"
                                @click="participation.startCenterSelection">
                                {{ t('participation.form.startSelection') }}
                            </UButton>
                            <UButton v-else :disabled="!participation.isLocationSelected" size="sm"
                                @click="selectCenter">
                                {{ t('participation.form.finishSelection') }}
                            </UButton>
                        </div>
                    </div>
                    <div v-else class="form">
                        <div class="pt-3 w-full flex flex-col">
                            <p class="text-sm font-light mb-1">{{ t('participation.form.describeComment') }}</p>
                            <UTextarea class="w-full" v-model="text" :rows="5" />
                        </div>
                        <p class="text-sm font-light mb-1">{{ t('participation.form.chooseCategory') }}</p>
                        <div class="pt-3 w-full flex flex-col relative">
                            <USelect v-model="category" :items="categoryOptions" class="max-w-full relative" />
                        </div>
                        <div v-if="campaign.allow_drawings" class="pt-3 w-full">
                            <ParticipationDraw></ParticipationDraw>
                        </div>
                    </div>
                </div>
                <div class="w-full grid lg:grid-cols-1 2xl:grid-cols-2 pt-2">
                    <UButton v-if="campaign.rate_enabled && participation.feedbackStep === 'rating'"
                        :disabled="rating === undefined" class="" size="sm" @click="rateHandler">{{ t('participation.form.rateCampaign') }}</UButton>
                    <UButton v-if="campaign.form_enabled && participation.feedbackStep === 'feedback'"
                        :disabled="text.length === 0 || location === undefined" class="grow" size="sm"
                        @click="feedbackHandler">{{ t('participation.form.sendFeedback') }}</UButton>
                </div>
            </div>
            <div v-else>
                <p class="pb-2">{{ t('participation.form.introText') }} </p>
                <div class="w-full grid lg:grid-cols-1 2xl:grid-cols-2 pt-2">
                    <UButton size="sm" @click="startSubmission">{{ t('participation.form.startSubmission') }}</UButton>
                </div>
            </div>
            <UModal v-model:open="detailFeedbackModalVisibility" :title="t('participation.form.modalTitle')" :ui="{ content: 'max-w-[25rem]' }">
                <template #body>
                <span class="text-muted block">{{ t('participation.form.modalBody') }}</span>
                </template>
                <template #footer>
                <div class="w-full flex justify-between gap-2">
                    <UButton class="font-light" size="sm" type="button" color="secondary"
                        @click="sendFeedback('rating'); detailFeedbackModalVisibility = false">{{ t('participation.form.sendOnlyRating') }}</UButton>
                    <UButton class="font-bold" size="sm" type="button" @click="giveDetailedFeedback">{{ t('participation.form.giveDetailedFeedback') }}</UButton>
                </div>
                </template>
            </UModal>
        </template>
    </UCard>
</template>

<script setup lang="ts">
import ParticipationDraw from "./ParticipationDraw.vue"
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { type CampaignDetail, useParticipationStore, type CenterLocation, type PostRating, type PostFeedback, type PostFeedbackRating } from "@store/participation";
import { type Feature, type FeatureCollection } from "@helpers/geojson";
import { useMapStore } from "@store/map";
import { onBeforeRouteLeave, useRouter } from "vue-router"
import { useToast } from "@helpers/toast"

const { t } = useI18n();
const router = useRouter()
const mapStore = useMapStore()
const participation = useParticipationStore()
const toast = useToast()
const props = defineProps<{
    campaign: CampaignDetail
}>()

const rating = ref<number>(0)
const text = ref<string>("");
const category = ref<string>(((props.campaign.categories) != null) ? props.campaign.categories[0] : t("participation.form.generalCategory"));
const categoryOptions = computed(() => {
    return props.campaign.categories?.map((campaignCategory) => ({
        label: campaignCategory,
        value: campaignCategory,
    })) ?? []
})
const location = ref<CenterLocation | undefined>();

function startSubmission(): void {
    participation.feedbackOnProgress = true
    if (props.campaign.rate_enabled) {
        participation.feedbackStep = "rating"
    } else {
        participation.feedbackStep = "location"
    }
}
const emit = defineEmits(["cycleReset"])
function resetFeedbackCycle(afterFeedback = false): void {
    participation.feedbackOnProgress = false
    participation.isLocationSelected = false
    participation.feedbackStep = "idle"
    location.value = undefined
    category.value = props.campaign.categories[0]
    text.value = ""
    rating.value = 0
    participation.deleteSelectedAreasTempLayer()
    participation.cancelCenterSelection()
    mapStore.resetMapData().then(() => {
        if (!afterFeedback) {
            emit("cycleReset")
        }
    }).catch((error) => {
        console.error(error)
    })
}
function selectCenter(): void {
    participation.finishCenterSelection(props.campaign)
    participation.isLocationSelected = true
    participation.feedbackStep = "feedback"
    location.value = participation.pointOfInterest
}

const detailFeedbackModalVisibility = ref(false)
function rateHandler(): void {
    if (rating.value !== 0) {
        if (props.campaign.form_enabled) {
            detailFeedbackModalVisibility.value = true
        } else {
            sendFeedback("rating")
        }
    }
}
function feedbackHandler(): void {
    if (text.value.length > 1 && location.value !== undefined) {
        if (props.campaign.rate_enabled) {
            sendFeedback("both")
        } else {
            sendFeedback("feedback")
        }
    }
}
function giveDetailedFeedback(): void {
    detailFeedbackModalVisibility.value = false
    participation.feedbackStep = "location"
    category.value = props.campaign.categories[0]
}
type FeedbackMode = "rating" | "feedback" | "both"
function sendFeedback(send: FeedbackMode): void {
    if (send === "rating") {
        const feedback: PostRating = {
            type: "POST1",
            rating: {
                campaign_id: props.campaign.campaign_id,
                rating: rating.value
            }
        }
        participation.sendFeedback(feedback).then(() => {
            resetFeedbackCycle(true)
            toast.add({ severity: "success", summary: t("participation.form.feedbackSentTitle"), detail: t("participation.form.feedbackSentDetail"), life: 10000 });
            router.push({ name: "participation-home" }).then(() => { }).catch((error) => {
                console.error(error)
            })
        }).catch((error) => {
            console.error(error)
            resetFeedbackCycle(true)
            toast.add({ severity: "error", summary: t("participation.form.feedbackFailedTitle"), detail: t("participation.form.feedbackFailedDetail"), life: 10000 });
            router.push({ name: "participation-home" }).then(() => { }).catch((error) => {
                console.error(error)
            })
        })
    }
    if (send === "feedback") {
        const pointFeedback: Feature = {
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [location.value!.lng, location.value!.lat]
            },
            properties: {}
        };
        const drawnGeom: FeatureCollection = {
            type: "FeatureCollection",
            features: participation.selectedDrawnGeometry
        }
        const feedback: PostFeedback = {
            type: "POST2",
            feedback: {
                campaign_id: props.campaign.campaign_id,
                feedback_text: text.value,
                feedback_category: category.value,
                feedback_location: pointFeedback,
                feedback_geometry: drawnGeom
            }
        }
        participation.sendFeedback(feedback).then(() => {
            resetFeedbackCycle(true)
            toast.add({ severity: "success", summary: t("participation.form.feedbackSentTitle"), detail: t("participation.form.feedbackSentDetail"), life: 10000 });
            router.push({ name: "participation-home" }).then(() => { }).catch((error) => {
                console.error(error)
            })
        }).catch((error) => {
            console.error(error)
            resetFeedbackCycle(true)
            router.push({ name: "participation-home" }).then(() => { }).catch((error) => {
                console.error(error)
            })
        })
    }
    if (send === "both") {
        const pointFeedback: Feature = {
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [location.value!.lng, location.value!.lat]
            },
            properties: {}
        };
        const drawnGeom: FeatureCollection = {
            type: "FeatureCollection",
            features: participation.selectedDrawnGeometry
        }
        const feedback: PostFeedbackRating = {
            type: "POST3",
            rating: {
                campaign_id: props.campaign.campaign_id,
                rating: rating.value
            },
            feedback: {
                campaign_id: props.campaign.campaign_id,
                feedback_text: text.value,
                feedback_category: category.value,
                feedback_location: pointFeedback,
                feedback_geometry: drawnGeom
            }
        }
        participation.sendFeedback(feedback).then(() => {
            resetFeedbackCycle(true)
            toast.add({ severity: "success", summary: t("participation.form.feedbackSentTitle"), detail: t("participation.form.feedbackSentDetail"), life: 10000 });
            router.push({ name: "participation-home" }).then(() => { }).catch((error) => {
                console.error(error)
            })
        }).catch((error) => {
            console.error(error)
            resetFeedbackCycle(true)
            router.push({ name: "participation-home" }).then(() => { }).catch((error) => {
                console.error(error)
            })
        })
    }
}
onBeforeRouteLeave(() => {
    resetFeedbackCycle(true)
})
</script>

<style scoped></style>
