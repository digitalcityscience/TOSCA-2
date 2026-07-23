import { createApp } from "vue"
import { createPinia } from "pinia"
import ui from "@nuxt/ui/vue-plugin"
import router from "./router"
import "./style.css"
import App from "./App.vue"
import "@material-design-icons/font";

const pinia = createPinia()

createApp(App).use(pinia).use(router).use(ui).mount("#app")
