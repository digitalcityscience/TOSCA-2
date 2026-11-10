import { createApp } from "vue"
import { createPinia } from "pinia"
import ui from "@nuxt/ui/vue-plugin"
import router from "./router"
import "./style.css"
import App from "./App.vue"
import "@material-design-icons/font";
import "virtual:nuxt-icon-bundle/register"
import { i18n } from "./core/i18n"
import { authSession } from "./auth/session";
import { installPrivateLayerGuard } from "./auth/privateContent";

const pinia = createPinia()
// After logout, removes the map layers an anonymous visitor may not see.
installPrivateLayerGuard()

// Restore a previous sign-in first so the first requests already carry the
// token. Bounded by a timeout: the public app never waits on Keycloak.
void authSession.initialize().finally(() => {
    createApp(App).use(pinia).use(router).use(ui).use(i18n).mount("#app")
})
