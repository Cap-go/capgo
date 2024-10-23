<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { useI18n } from 'petite-vue-i18n'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { openMessenger } from '~/services/bento'
import { useMainStore } from '~/stores/main'

const { t } = useI18n()
const router = useRouter()
const main = useMainStore()
const isMobile = ref(Capacitor.isNativePlatform())
const acronym = computed(() => {
  let res = 'MD'
  if (main.user?.first_name && main.user?.last_name)
    res = main.user?.first_name[0] + main.user?.last_name[0]
  else if (main.user?.first_name)
    res = main.user?.first_name[0]
  else if (main.user?.last_name)
    res = main.user?.last_name[0]
  return res.toUpperCase()
})
function openSupport() {
  openMessenger()
}

function logOut() {
  main.logout().then(() => router.replace('/login'))
}
</script>

<template>
  <div class="relative">
    <div class="flex flex-col p-4 space-y-2 bg-gray-300 shadow dark:bg-base-100 rounded-box">
      <div class="flex items-center mb-4">
        <img v-if="main.user?.image_url" class="w-10 h-10 mr-3 mask mask-squircle" :src="main.user?.image_url" alt="User">
        <div v-else class="flex items-center justify-center w-10 h-10 mr-3 border rounded-full border-slate-900 dark:border-slate-500">
          <p>{{ acronym }}</p>
        </div>
        <div class="min-w-0">
          <p class="font-medium truncate">
            {{ `${main.user?.first_name} ${main.user?.last_name}` }}
          </p>
          <p class="text-sm text-gray-600 truncate dark:text-gray-400">
            {{ main.user?.email }}
          </p>
        </div>
      </div>
      <router-link to="/dashboard/settings/account" class="block px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white">
        {{ t('settings') }}
      </router-link>
      <router-link v-if="isMobile" to="/app/modules" class="block px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white">
        {{ t('module-heading') }}
      </router-link>
      <router-link v-if="isMobile" to="/app/modules_test" class="block px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white">
        {{ t('module-heading') }} {{ t('tests') }}
      </router-link>
      <div class="block px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white" @click="openSupport">
        {{ t('support') }}
      </div>
      <div class="block px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white" @click="logOut">
        {{ t('sign-out') }}
      </div>
    </div>
  </div>
</template>
