<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { Capacitor } from '@capacitor/core'
import { useRouter } from 'vue-router'
import { isAdmin, isSpoofed } from '~/services/supabase'
import { useMainStore } from '~/stores/main'
import IconAcount from '~icons/mdi/user'
import IconPassword from '~icons/mdi/password'
import IconPlans from '~icons/material-symbols/price-change'
import IconBilling from '~icons/mingcute/bill-fill'
import IconNotification from '~icons/mdi/message-notification'
import IconAdmin from '~icons/eos-icons/admin'
import { openPortal } from '~/services/stripe'

const router = useRouter()
const main = useMainStore()
const isMobile = ref(Capacitor.isNativePlatform())
const { t } = useI18n()
const isUserAdmin = ref(false)

if (main.user?.id) {
  isAdmin(main.user?.id).then((res) => {
    isUserAdmin.value = !!res || isSpoofed()
  })
}

const openLink = (link: string) => {
  console.log('openLink', link)
  if (link === '/billing')
    openPortal()
  else if (link !== '')
    router.push(link)
}
const isActive = (to: string) => router.currentRoute.value.path.startsWith(to)

const menu = ref([
  {
    title: t('account'),
    icon: shallowRef(IconAcount),
    to: '/dashboard/settings/account',
  },
  {
    title: t('password'),
    icon: shallowRef(IconPassword),
    to: '/dashboard/settings/changepassword',
  },
  {
    title: t('plans'),
    icon: shallowRef(IconPlans),
    to: '/dashboard/settings/plans',
  },
  {
    title: t('billing'),
    icon: shallowRef(IconBilling),
    to: '/billing',
    hidden: isMobile.value,
  },
  {
    title: t('notifications'),
    icon: shallowRef(IconNotification),
    to: '/dashboard/settings/notifications',
  },
  {
    title: t('admin'),
    icon: shallowRef(IconAdmin),
    to: '/dashboard/settings/admin',
    hidden: !isUserAdmin.value,
  },
])
</script>

<template>
  <div class="flex px-3 py-6 overflow-x-scroll border-b flex-nowrap no-scrollbar md:block md:overflow-auto md:border-b-0 md:border-r border-slate-200 min-w-60 md:space-y-3">
    <!-- Group 1 -->
    <div>
      <ul class="flex mr-3 flex-nowrap md:block md:mr-0">
        <li v-for="(m, i) in menu" :key="i" class="mr-0.5 md:mr-0 md:mb-0.5" :class="{ hidden: m.hidden }" @click="openLink(m.to)">
          <button class="flex items-center px-2.5 py-2 rounded whitespace-nowrap">
            <component :is="m.icon" class="w-4 h-4 mr-2 fill-current shrink-0" :class="{ 'text-blue-600': isActive(m.to), 'text-slate-400': !isActive(m.to) }" />
            <span class="hidden text-sm font-medium md:block" :class="{ 'text-blue-600': isActive(m.to), 'text-slate-400': !isActive(m.to) }">{{ m.title }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
