// register vue composition api globally
import type { Router } from 'vue-router'
import { CapacitorUpdater } from '@capgo/capacitor-updater'

import { setupLayouts } from 'virtual:generated-layouts'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'
import { posthogLoader } from '~/services/posthog'
import { getLocalConfig } from '~/services/supabase'

import App from './App.vue'

import { initPlausible } from './services/plausible'

import { getRemoteConfig } from './services/supabase'
// your custom styles here
import './styles/style.css'

const guestPath = ['/login', '/delete_account', '/confirm-signup', '/forgot_password', '/resend_email', '/onboarding', '/register', '/invitation', '/scan']

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
    { path: '/settings/change-password', redirect: '/settings/account/change-password' },
    { path: '/settings/changepassword', redirect: '/settings/account/change-password' },
    { path: '/settings/notifications', redirect: '/settings/account/notifications' },
    { path: '/dashboard/settings/organization/plans', redirect: '/settings/organization/plans' },
    { path: '/dashboard/settings/organization/usage', redirect: '/settings/organization/usage' },
    { path: '/p/:package', redirect: to => `/app/${(to.params as { package: string }).package}` },
    { path: '/dashboard/apikeys', redirect: '/apikeys' },
    { path: '/dashboard/settings/account', redirect: '/settings/account' },
    { path: '/dashboard/settings/change-password', redirect: '/settings/account/change-password' },
    { path: '/dashboard/settings/notifications', redirect: '/settings/notifications' },
    { path: '/dashboard/settings/organization/general', redirect: '/settings/organization/' },
    { path: '/dashboard/settings/organization/members', redirect: '/settings/organization/members' },
    { path: '/dashboard/settings/organization/plans', redirect: '/settings/organization/plans' },
    { path: '/dashboard/settings/organization/usage', redirect: '/settings/organization/usage' },
    { path: '/app/p/:package', redirect: to => `/app/${(to.params as { package: string }).package}` },
    { path: '/app/p/:package/bundles', redirect: to => `/app/${(to.params as { package: string }).package}` },
    { path: '/app/p/:package/channels', redirect: to => `/app/${(to.params as { package: string }).package}` },
    { path: '/app/p/:package/devices', redirect: to => `/app/${(to.params as { package: string }).package}` },
    { path: '/app/p/:package/logs', redirect: to => `/app/${(to.params as { package: string }).package}` },
    { path: '/app/package/:package', redirect: to => `/app/${(to.params as { package: string }).package}` },
    { path: '/app/package/:package/settings', redirect: to => `/app/${(to.params as { package: string }).package}` },
    ...setupLayouts(newRoutes),
  ],
  history: createWebHistory(import.meta.env.BASE_URL),
})
app.use(router)

router.beforeEach((to, from, next) => {
  if (to.path.startsWith('/app/') && to.query.tab) {
    const tab = to.query.tab as string
    const newPath = to.path.endsWith('/') ? `${to.path}${tab}` : `${to.path}/${tab}`
    const { tab: _, ...newQuery } = to.query
    return next({ path: newPath, query: newQuery, hash: to.hash })
  }
  next()
})

const config = getLocalConfig()
initPlausible(import.meta.env.pls_domain as string)
posthogLoader(config.supaHost)

// install all modules under `modules/`
type UserModule = (ctx: { app: typeof app, router: Router }) => void

Object.values(import.meta.glob<{ install: UserModule }>('./modules/*.ts', { eager: true }))
  .forEach(i => i.install?.({ app, router }))

router.isReady().then(() => {
  app.mount('#app')
})
