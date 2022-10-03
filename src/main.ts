// register vue composition api globally
import { createApp } from 'vue'
// Cannot use official router here because of the IonTab hack
// import { createRouter, createWebHistory } from '@ionic/vue-router'
import { createRouter, createWebHistory } from 'vue-router'
// import { createRouter, createWebHistory } from 'vue-router'
import generatedRoutes from 'virtual:generated-pages'
import { setupLayouts } from 'virtual:generated-layouts'
import type { Router } from 'vue-router'
import App from './App.vue'

// your custom styles here
import './styles/ionic.css'
import './styles/markdown.css'
import './styles/style.css'
/* Additional styles */
import './styles/additional-styles/utility-patterns.css'
import './styles/additional-styles/range-slider.css'
import './styles/additional-styles/toggle-switch.css'
import './styles/additional-styles/flatpickr.css'
import './styles/additional-styles/theme.css'

/* Core CSS required for Ionic components to work properly */
import '@ionic/vue/css/core.css'

/* Basic CSS for apps built with Ionic */
import '@ionic/vue/css/normalize.css'
import '@ionic/vue/css/structure.css'
import '@ionic/vue/css/typography.css'

/* Optional CSS utils that can be commented out */
import '@ionic/vue/css/padding.css'
import '@ionic/vue/css/float-elements.css'
import '@ionic/vue/css/text-alignment.css'
import '@ionic/vue/css/text-transformation.css'
import '@ionic/vue/css/flex-utils.css'
import '@ionic/vue/css/display.css'

import { initPlausible } from './services/plausible'

const app = createApp(App)
console.log(`Capgo Version : "${import.meta.env.VITE_APP_VERSION}"`)
// setup up pages with layouts
const routes = [...setupLayouts(generatedRoutes), { path: '/app', redirect: '/app/home' }, { path: '/', redirect: '/login' }]
const router = createRouter({ history: createWebHistory(import.meta.env.BASE_URL), routes })
app.use(router)
initPlausible(import.meta.env.pls_domain as string)
// install all modules under `modules/`
type UserModule = (ctx: { app: typeof app; router: Router }) => void

Object.values(import.meta.glob<{ install: UserModule }>('./modules/*.ts', { eager: true }))
  .forEach(i => i.install?.({ app, router }))

router.isReady().then(() => {
  app.mount('#app')
})
