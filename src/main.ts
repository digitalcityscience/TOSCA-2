/* eslint "@typescript-eslint/indent": "off" */
/* eslint "no-tabs": "off" */
/* eslint "@typescript-eslint/no-unsafe-argument": "off" */
import { createApp } from "vue"
import { createPinia } from "pinia"
import PrimeVue from "primevue/config"
import "./style.css"
import toscaPresets from "./presets/tosca"
import App from "./App.vue"

const pinia = createPinia()

createApp(App).use(pinia).use(PrimeVue, { unstyled: true, pt: toscaPresets }).mount("#app")
