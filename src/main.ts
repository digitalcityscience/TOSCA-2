/* eslint "@typescript-eslint/indent": "off" */
/* eslint "no-tabs": "off" */
/* eslint "@typescript-eslint/no-unsafe-argument": "off" */
import { createApp } from "vue"
import { createPinia } from "pinia"
import PrimeVue from "primevue/config"
import "./style.css"
// this is a temporary import. It should be changed after implementation of primevue components.
import "primevue/resources/themes/bootstrap4-light-purple/theme.css"
import App from "./App.vue"

const pinia = createPinia()

createApp(App).use(pinia).use(PrimeVue).mount("#app")
