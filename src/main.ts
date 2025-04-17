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

const guestPath = ['/login', '/delete_account', '/forgot_password', '/resend_email', '/onboarding', '/register', '/invitation']

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
const router = createRouter({
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/settings/plans', redirect: '/settings/organization/plans' },
    { path: '/settings/usage', redirect: '/settings/organization/usage' },
    { path: '/dashboard/settings/plans', redirect: '/settings/organization/plans' },
    { path: '/dashboard/settings/usage', redirect: '/settings/organization/usage' },
    { path: '/dashboard/apikeys', redirect: '/apikeys' },
    { path: '/dashboard/settings/account', redirect: '/settings/account' },
    { path: '/dashboard/settings/change-password', redirect: '/settings/change-password' },
    { path: '/dashboard/settings/notifications', redirect: '/settings/notifications' },
    { path: '/dashboard/settings/organization/general', redirect: '/settings/organization/' },
    { path: '/dashboard/settings/organization/members', redirect: '/settings/organization/members' },
    { path: '/dashboard/settings/organization/plans', redirect: '/settings/organization/plans' },
    { path: '/dashboard/settings/organization/usage', redirect: '/settings/organization/usage' },
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
