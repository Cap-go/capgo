// register vue composition api globally
import { createApp } from 'vue'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
// Cannot use official router here because of the IonTab hack
import { createRouter, createWebHistory } from 'vue-router'
import generatedRoutes from 'virtual:generated-pages'
import { setupLayouts } from 'virtual:generated-layouts'
import type { Router } from 'vue-router'
import { defaultConfig, plugin } from '@formkit/vue'
import { generateClasses } from '@formkit/themes'
import App from './App.vue'
// your custom styles here
import './styles/markdown.css'
import './styles/style.css'

import { initPlausible } from './services/plausible'
import formkit from './styles/formkit'

const app = createApp(App)
app.use(plugin, defaultConfig({
  config: {
    classes: generateClasses(formkit),
  },
}))
CapacitorUpdater.notifyAppReady()
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
