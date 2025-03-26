import type { Router } from 'vue-router/auto'
// register vue composition api globally
import { CapacitorUpdater } from '@capgo/capacitor-updater'

import { setupLayouts } from 'virtual:generated-layouts'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router/auto'
import { routes } from 'vue-router/auto-routes'
import App from './App.vue'

import { initPlausible } from './services/plausible'

import { getRemoteConfig } from './services/supabase'
// your custom styles here
import './styles/style.css'

const guestPath = ['/login', '/delete_account', '/forgot_password', '/resend_email', '/onboarding', '/register']

getRemoteConfig()
const app = createApp(App)
CapacitorUpdater.notifyAppReady()
console.log(`Capgo Version : "${import.meta.env.VITE_APP_VERSION}"`)
// setup up pages with layouts
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
// https://web.capgo.app/app/p/com.sourcewhere.sourcewhere/d/c8ca51a7-ab11-4b86-870e-990ea041436a
const router = createRouter({
  routes: [
    { path: '/app', redirect: '/app/home' },
    { path: '/', redirect: '/login' },
    { path: '/dashboard/settings/plans', redirect: '/dashboard/settings/organization/plans' },
    // https://web.capgo.app/app/p/ee--forgr--capacitor_go/channels
    { path: '/app/p/:package/bundles', redirect: to => `/app/p/${(to.params as { package: string }).package}?tab=bundles` },
    { path: '/app/p/:package/channels', redirect: to => `/app/p/${(to.params as { package: string }).package}?tab=channels` },
    { path: '/app/p/:package/devices', redirect: to => `/app/p/${(to.params as { package: string }).package}?tab=devices` },
    { path: '/app/p/:package/logs', redirect: to => `/app/p/${(to.params as { package: string }).package}?tab=logs` },
    { path: '/app/package/:package', redirect: to => `/app/p/${(to.params as { package: string }).package}?tab=logs` },
    ...setupLayouts(newRoutes),
  ],
  history: createWebHistory(import.meta.env.BASE_URL),
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
