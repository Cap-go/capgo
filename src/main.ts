// register vue composition api globally
import { createApp } from 'vue'
// Cannot use official router here because of the IonTab hack
import { createRouter, createWebHistory } from '@ionic/vue-router'
// import { createRouter, createWebHistory } from 'vue-router'
import generatedRoutes from 'virtual:generated-pages'
import { setupLayouts } from 'virtual:generated-layouts'
import App from './App.vue'

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

// windicss layers
import 'virtual:windi-base.css'
import 'virtual:windi-components.css'
// your custom styles here
import './styles/main.css'
// windicss utilities should be the last style import
import 'virtual:windi-utilities.css'
// windicss devtools support (dev only)
import 'virtual:windi-devtools'
import { initPlausible } from './services/plausible'

const app = createApp(App)

// setup up pages with layouts

const routes = [...setupLayouts(generatedRoutes), { path: '/app', redirect: '/app/home' }, { path: '/', redirect: '/login' }]
const router = createRouter({ history: createWebHistory(import.meta.env.BASE_URL), routes })
app.use(router)
initPlausible(import.meta.env.domain as string)
// install all modules under `modules/`
Object.values(import.meta.globEager('./modules/*.ts')).map(i => i.install?.({ app, router, routes }))

router.isReady().then(() => {
  app.mount('#app')
})
