<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { isAdmin, isSpoofed } from '~/services/supabase'
import { useMainStore } from '~/stores/main'
import IconAcount from '~icons/mdi/user'
import IconPassword from '~icons/mdi/password'
import IconPlans from '~icons/material-symbols/price-change'
import IconNotification from '~icons/mdi/message-notification'
import IconVersion from '~icons/radix-icons/update'
import IconAdmin from '~icons/eos-icons/admin'

const main = useMainStore()
const { t } = useI18n()
const version = import.meta.env.VITE_APP_VERSION
const isUserAdmin = ref(false)
if (main.user?.id) {
  isAdmin(main.user?.id).then((res) => {
    isUserAdmin.value = !!res || isSpoofed()
  })
}
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
  {
    title: `${t('version')} ${version}`,
    icon: shallowRef(IconVersion),
    to: '',
  },
])
</script>

<template>
  <div class="flex px-3 py-6 overflow-x-scroll border-b flex-nowrap no-scrollbar md:block md:overflow-auto md:border-b-0 md:border-r border-slate-200 min-w-60 md:space-y-3">
    <!-- Group 1 -->
    <div>
      <div class="mb-3 text-xs font-semibold uppercase text-slate-400 dark:text-white">
        {{ t('settings') }} <span class="block md:hidden"> {{ version }}</span>
      </div>
      <ul class="flex mr-3 flex-nowrap md:block md:mr-0">
        <router-link v-for="(m, i) in menu" :key="i" v-slot="{ href, navigate, isExactActive }" :to="m.to" custom>
          <li class="mr-0.5 md:mr-0 md:mb-0.5" :class="{ 'hidden md:block': !m.to }">
            <a class="flex items-center px-2.5 py-2 rounded whitespace-nowrap" :class="{ 'bg-blue-50 dark:bg-gray-900': isExactActive && m.to }" :href="href" @click="navigate">
              <component :is="m.icon" class="w-4 h-4 mr-2 fill-current shrink-0 text-slate-400 dark:text-white" :class="{ 'text-blue-400': isExactActive && m.to }" />
              <span class="hidden text-sm font-medium md:block text-slate-600 dark:text-white" :class="{ 'text-blue-500': isExactActive && m.to, 'hover:text-slate-700 dark:hover:text-slate-300': !isExactActive && !m.to }">{{ m.title }}</span>
            </a>
          </li>
        </router-link>
      </ul>
    </div>
  </div>
</template>
