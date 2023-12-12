import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import './style.css'
import App from './App.vue'

const pinia = createPinia()

createApp(App).use(pinia).use(PrimeVue).mount('#app')
