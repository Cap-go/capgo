import { App } from 'vue'
import { Router, RouteRecordRaw } from 'vue-router'
import { HeadClient } from '@vueuse/head'

interface AppContext<HasRouter extends boolean = true> {
  app: App<Element>
  router: HasRouter extends true ? Router : undefined
  routes: HasRouter extends true ? RouteRecordRaw[] : undefined
  head: HeadClient | undefined
}

export type UserModule = (ctx: AppContext) => void
