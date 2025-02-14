/* eslint "@typescript-eslint/no-unsafe-argument": "off" */
import { createApp } from "vue"
import { createPinia } from "pinia"
import PrimeVue from "primevue/config"
import router from "./router"
import "./style.css"
import ToastService from "primevue/toastservice";
import toscaPresets from "./presets/tosca"
import App from "./App.vue"
import "@material-design-icons/font";

const pinia = createPinia()

createApp(App).use(pinia).use(router).use(PrimeVue, { unstyled: true, pt: toscaPresets }).use(ToastService).mount("#app")
