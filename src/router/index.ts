import { createRouter, createWebHistory } from "vue-router"
import MapView from "../views/MapView.vue"

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
                participation: async () => await import("../views/ParticipationView.vue")
            }
        },
        {
            path: "/:catchAll(.*)",
            redirect: "/"
        }
    ]
})

export default router
