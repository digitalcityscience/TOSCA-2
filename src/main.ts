import { createApp } from "vue"
import { createPinia } from "pinia"
import ui from "@nuxt/ui/vue-plugin"
import router from "./router"
import "./style.css"
import App from "./App.vue"
import "@material-design-icons/font";
import "virtual:nuxt-icon-bundle/register"
import { i18n } from "./core/i18n"
import { initializeKeycloak } from "./auth/keycloak";

const pinia = createPinia()

// Keycloak must process a login callback before Vue Router starts reading the URL.
void initializeKeycloak().finally(() => {
    createApp(App).use(pinia).use(router).use(ui).use(i18n).mount("#app")
})
