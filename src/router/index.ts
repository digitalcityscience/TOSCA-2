import { createRouter, createWebHistory } from "vue-router"
import MapView from "../views/MapView.vue"
import { useParticipationStore } from "@store/participation"
import { useMapStore } from "@store/map"

const router = createRouter({
    history: createWebHistory(String(import.meta.env.VITE_BASE_URL)),
    routes: [
        {
            path: "/",
            name: "home",
            components: {
                default: MapView
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
            ]
        },
        {
            path: "/:catchAll(.*)",
            redirect: "/"
        }
    ]
})
router.beforeEach((to, _from, next) => {
    console.log("Navigation guard")
    if (to.name === "active-campaigns") {
        const participationStore = useParticipationStore()
        console.log("Active campaigns length: ", participationStore.activeCampaigns.length)
        if (participationStore.activeCampaigns.length < 1){
            console.log("Populating active campaigns from navigation guard")
            participationStore.populateCampaignList()
        }
    }
    if (to.name === "campaign-details"){
        const mapStore = useMapStore()
        mapStore.resetMapData().then(() => { }, () => { })
    }
    next()
})

export default router
