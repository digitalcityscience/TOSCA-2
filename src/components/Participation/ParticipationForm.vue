<template>
    <Card>
        <template #title>
            <h2 class="text-xl font-bold flex items-center">Give Feedback <Button severity="danger" text size="small"
                    @click="resetFeedbackCycle">Reset</Button></h2>
        </template>
        <template #content>
            <div v-if="participation.feedbackOnProgress" class="w-full relative">
                <div v-if="campaign.rate_enabled && participation.feedbackStep == 'rating'" class="rating pb-2">
                    <h3 class="text-lg font-semibold ">Rate this project!</h3>
                    <p class="text-xs font-extralight italic">1-Bad, 3-Neutral 5-Excellent</p>
                    <Rating class="w-full pt-3" v-model="rating" :stars="5" :cancel="false"></Rating>
                </div>
                <div v-if="campaign.form_enabled && (participation.feedbackStep === 'feedback'||participation.feedbackStep === 'location')" class="form">
                    <div v-if="participation.feedbackStep === 'location'" class="w-full grid lg:grid-cols-1 2xl:grid-cols-2 pt-2">
                        <div class="w-full col-span-2">
                            <p class="text-sm font-light pb-4">Choose the location where you want to give your feedback.
                            </p>
                        </div>
                        <div class="w-full col-span-2">
                            <Button v-if="!participation.locationSelectionOnProgress" size="small"
                                @click="participation.startCenterSelection">
                                Start selection
                            </Button>
                            <Button v-else :disabled="!participation.isLocationSelected" size="small"
                                @click="selectCenter">
                                Finish selection
                            </Button>
                        </div>
                    </div>
                    <div v-else class="form">
                        <div class="pt-3 w-full flex flex-col">
                            <p class="text-sm font-light mb-1">Do you have a suggestion? Describe your comment.</p>
                            <Textarea class="w-full" v-model="text" rows="5"></Textarea>
                        </div>
                        <p class="text-sm font-light mb-1">Choose the category of your suggestion if applicable.</p>
                        <div class="pt-3 w-full flex flex-col relative">
                            <Dropdown v-model="category" :options="campaign.categories" class="max-w-full relative"
                                :virtual-scroller-options="{ itemSize: 35 }"></Dropdown>
                        </div>
                        <div v-if="campaign.allow_drawings" class="pt-3 w-full">
                            <ParticipationDraw></ParticipationDraw>
                        </div>
                    </div>
                </div>
                <div class="w-full grid lg:grid-cols-1 2xl:grid-cols-2 pt-2">
                    <Button v-if="campaign.rate_enabled && participation.feedbackStep === 'rating'"
                        :disabled="rating === undefined" class="" size="small" @click="rateHandler">Rate
                        Campaign</Button>
                    <Button v-if="campaign.form_enabled && participation.feedbackStep === 'feedback'"
                        :disabled="text.length === 0 || location === undefined" class="grow" size="small"
                        @click="feedbackHandler">Send Feedback</Button>
                </div>
            </div>
            <div v-else>
                <p class="pb-2">You can view all the active proposals in the map, please click on each project to view
                    information about it. Click on 'Start Submission' to give your feedback. </p>
                <div class="w-full grid lg:grid-cols-1 2xl:grid-cols-2 pt-2">
                    <Button size="small" @click="startSubmission">Start Submission</Button>
                </div>
            </div>
            <Dialog v-model:visible="detailFeedbackModalVisibility" modal header="Your Feedback Matters!"
                :style="{ width: '25rem' }">
                <span class="p-text-secondary block mb-5">Thanks for your rating! Share more details to help us make this project even better.</span>
                <div class="w-full flex justify-between">
                    <Button class="font-light" size="small" type="button" severity="secondary"
                        @click="sendFeedback('rating'); detailFeedbackModalVisibility = false">Send Only Rating</Button>
                    <Button class="font-bold" size="small" type="button" @click="giveDetailedFeedback">Give Detailed
                        Feedback</Button>
                </div>
            </Dialog>
        </template>
    </Card>
</template>

<script setup lang="ts">
import Button from "primevue/button"
import Textarea from "primevue/textarea"
import Dropdown from "primevue/dropdown"
import Card from "primevue/card"
import Rating from "primevue/rating"
import Dialog from "primevue/dialog"
import ParticipationDraw from "./ParticipationDraw.vue"
import { ref } from "vue";
import { type CampaignDetail, useParticipationStore, type CenterLocation, type PostRating, type PostFeedback, type PostFeedbackRating } from "@store/participation";
import { type Feature, type FeatureCollection } from "geojson";
import { useMapStore } from "@store/map";
import { onBeforeRouteLeave, useRouter } from "vue-router"
import { useToast } from "primevue/usetoast"

const router = useRouter()
const mapStore = useMapStore()
const participation = useParticipationStore()
const toast = useToast()
const props = defineProps<{
    campaign: CampaignDetail
}>()

const rating = ref<number>(0)
const text = ref<string>("");
const category = ref<string>(((props.campaign.categories) != null) ? props.campaign.categories[0] : "General");
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
function resetFeedbackCycle(): void {
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
        emit("cycleReset")
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
            resetFeedbackCycle()
            toast.add({ severity: "success", summary: "Feedback sent", detail: "Your feedback has been sent successfully.", life: 10000 });
            router.push({ name: "participation-home" }).then(() => { }).catch((error) => {
                console.error(error)
            })
        }).catch((error) => {
            console.error(error)
            resetFeedbackCycle()
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
            resetFeedbackCycle()
            toast.add({ severity: "success", summary: "Feedback sent", detail: "Your feedback has been sent successfully.", life: 10000 });
            router.push({ name: "participation-home" }).then(() => { }).catch((error) => {
                console.error(error)
            })
        }).catch((error) => {
            console.error(error)
            resetFeedbackCycle()
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
            resetFeedbackCycle()
            toast.add({ severity: "success", summary: "Feedback sent", detail: "Your feedback has been sent successfully.", life: 10000 });
            router.push({ name: "participation-home" }).then(() => { }).catch((error) => {
                console.error(error)
            })
        }).catch((error) => {
            console.error(error)
            resetFeedbackCycle()
            router.push({ name: "participation-home" }).then(() => { }).catch((error) => {
                console.error(error)
            })
        })
    }
}
onBeforeRouteLeave(() => {
    resetFeedbackCycle()
})
</script>

<style scoped></style>
