import { createApp } from "vue"
import { createPinia } from "pinia"
import ui from "@nuxt/ui/vue-plugin"
import router from "./router"
import "./style.css"
import App from "./App.vue"
import "@material-design-icons/font";
import { i18n } from "./core/i18n"

const pinia = createPinia()

createApp(App).use(pinia).use(router).use(ui).use(i18n).mount("#app")
