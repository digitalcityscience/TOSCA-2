import { createRouter, createWebHistory } from "vue-router"
import MapView from "../views/MapView.vue"
import { useParticipationStore } from "@store/participation"
import { useMapStore } from "@store/map"
import { isMapFeatureSwitch } from "./mapFeatureNavigation"
import { isFeatureEnabled, type FeatureId } from "../config/features"
import { redirectUnknownUrbanStory, URBAN_STORIES_ROUTE_NAME } from "./urbanStoriesRoute"

declare module "vue-router" {
    interface RouteMeta {
        feature?: FeatureId
    }
}

const router = createRouter({
    history: createWebHistory(String(import.meta.env.VITE_BASE_URL)),
    routes: [
        {
            path: "/",
            name: "home",
            components: {
                default: MapView
            },
            meta:{
                sidebar:"workspaceListing",
                sidebarPosition:"left"
            }
        },
        {
            path: "/participation",
            name: "participation",
            components: {
                default: MapView,
                participation: async () => await import("../components/Participation/ParticipationSidebar.vue")
            },
            children: [
                { path: "", name:"participation-home", component: async () => await import("../components/Participation/ParticipationHome.vue") },
                { path: "active-campaigns", name: "active-campaigns", component: async () => await import("../components/Participation/CampaignList.vue") },
                { path: "campaign-detail/:campaignURL", name:"campaign-details", component: async () => await import("../components/Participation/CampaignDetail.vue"), props: true }
            ],
            meta: {
                sidebar:"participation",
                sidebarPosition:"left"
            }
        },
        {
            path: "/events",
            name: "events",
            components: {
                default: MapView,
                events: async () => await import("../components/Events/EventsSidebar.vue")
            },
            children: [
                {
                    path: "",
                    name: "event-list",
                    component: async () => await import("../components/Events/EventList.vue")
                },
                {
                    path: ":eventId",
                    name: "event-detail",
                    component: async () => await import("../components/Events/EventDetail.vue"),
                    props: true
                }
            ],
            meta: {
                feature: "events",
                sidebar: "events",
                sidebarPosition: "left"
            }
        },
        {
            path: "/geostories",
            name: "geostories",
            components: {
                default: MapView,
                geostories: async () => await import("../components/Geostories/GeoStorySidebar.vue")
            },
            children: [
                {
                    path: "",
                    name: "geostory-list",
                    component: async () => await import("../components/Geostories/GeoStoryList.vue")
                },
                {
                    path: ":storyId",
                    name: "geostory-detail",
                    component: async () => await import("../components/Geostories/GeoStoryDetail.vue"),
                    props: true
                }
            ],
            meta: {
                feature: "geostories",
                sidebar: "geostories",
                sidebarPosition: "left"
            }
        },
        {
            path: "/urban-stories/:storyKey?",
            name: URBAN_STORIES_ROUTE_NAME,
            components: {
                default: MapView,
                urbanStories: async () => await import("../components/UrbanStories/UrbanStoriesSidebar.vue")
            },
            meta: {
                feature: "urbanStories",
                sidebar: "urbanStories",
                sidebarPosition: "left"
            }
        },
        {
            path: "/geosimulations",
            name: "geosimulations",
            components: {
                default: MapView,
                geosimulations: async () => await import("../components/Geosimulations/GeoSimulationSidebar.vue")
            },
            children: [
                {
                    path: "",
                    name: "geosimulation-list",
                    component: async () => await import("../components/Geosimulations/GeoSimulationList.vue")
                },
                {
                    // Before ":modelId", so "runs" and "comparisons" are never read as a model id.
                    path: "runs/:runId",
                    name: "geosimulation-run",
                    component: async () => await import("../components/Geosimulations/GeoSimulationRunDetail.vue"),
                    props: true
                },
                {
                    path: "comparisons/:comparisonId",
                    name: "geosimulation-comparison",
                    component: async () => await import("../components/Geosimulations/GeoSimulationComparison.vue"),
                    props: true
                },
                {
                    path: ":modelId/new",
                    name: "geosimulation-new-run",
                    component: async () => await import("../components/Geosimulations/GeoSimulationRunForm.vue"),
                    props: true
                },
                {
                    path: ":modelId",
                    name: "geosimulation-model",
                    component: async () => await import("../components/Geosimulations/GeoSimulationModel.vue"),
                    props: true
                }
            ],
            meta: {
                feature: "geosimulations",
                sidebar: "geosimulations",
                sidebarPosition: "left"
            }
        },
        {
            path: "/:footerDocumentSlug",
            name: "footer-document",
            components: {
                default: MapView
            },
            meta: {
                sidebar: "workspaceListing",
                sidebarPosition: "left"
            }
        },
        {
            path: "/:catchAll(.*)",
            redirect: "/"
        }
    ]
})
router.beforeEach(async (to, from) => {
    if (to.meta.feature !== undefined && !isFeatureEnabled(to.meta.feature)) {
        return { path: "/", replace: true }
    }
    const urbanStoryRedirect = redirectUnknownUrbanStory(to)
    if (urbanStoryRedirect !== undefined) {
        return urbanStoryRedirect
    }
    if (isMapFeatureSwitch(to, from)) {
        const mapStore = useMapStore()
        if (mapStore.map !== undefined) {
            await mapStore.resetMapData(false)
        }
    }
    if (to.name === "active-campaigns") {
        const participationStore = useParticipationStore()
        if (participationStore.activeCampaigns.length < 1){
            participationStore.populateCampaignList()
        }
    }
    if (to.name === "campaign-details"){
        const mapStore = useMapStore()
        mapStore.resetMapData().then(() => { }, () => { })
    }
})

export default router
