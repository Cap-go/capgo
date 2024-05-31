// register vue composition api globally
import { createApp } from 'vue'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
// TODO: fix this and use local import only
// import Particles from '@tsparticles/vue3'
// import { loadFull } from 'tsparticles'

import { createRouter, createWebHistory } from 'vue-router/auto'
import { setupLayouts } from 'virtual:generated-layouts'
import type { Router } from 'vue-router/auto'
import App from './App.vue'

// your custom styles here
import './styles/style.css'

import { initPlausible } from './services/plausible'
import { getRemoteConfig } from './services/supabase'

const guestPath = ['/login', '/register', '/delete_account', '/forgot_password', '/resend_email', '/onboarding']

getRemoteConfig()
const app = createApp(App)
// app.use(Particles, {
//   init: async (engine) => {
//     await loadFull(engine)
//   },
// })
CapacitorUpdater.notifyAppReady()
console.log(`Capgo Version : "${import.meta.env.VITE_APP_VERSION}"`)
// setup up pages with layouts
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  // routes,
  extendRoutes: (routes) => {
    const newRoutes = routes.map((route) => {
      if (guestPath.includes(route.path)) {
        route.meta ??= {}
        route.meta.layout = 'naked'
      }
      else {
        route.meta ??= {}
        route.meta.middleware = 'auth'
      }
      return route
    })
    // completely optional since we are modifying the routes in place
    return [...setupLayouts(newRoutes), { path: '/app', redirect: '/app/home' }, { path: '/', redirect: '/login' }]
  },
})
app.use(router)
initPlausible(import.meta.env.pls_domain as string)
// install all modules under `modules/`
type UserModule = (ctx: { app: typeof app, router: Router }) => void

Object.values(import.meta.glob<{ install: UserModule }>('./modules/*.ts', { eager: true }))
  .forEach(i => i.install?.({ app, router }))

router.isReady().then(() => {
  app.mount('#app')
})
