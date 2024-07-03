<script setup lang="ts">
import { Dropdown, initDropdowns } from 'flowbite'
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Capacitor } from '@capacitor/core'
import { useMainStore } from '~/stores/main'
import { openMessenger } from '~/services/chatwoot'
import IconDown from '~icons/material-symbols/keyboard-arrow-down-rounded'

const { t } = useI18n()

const router = useRouter()
const main = useMainStore()
const isMobile = Capacitor.isNativePlatform()
const acronym = computed(() => {
  let res = 'MD'
  if (main.user?.first_name && main.user.last_name)
    res = main.user?.first_name[0] + main.user?.last_name[0]
  else if (main.user?.first_name)
    res = main.user?.first_name[0]
  else if (main.user?.last_name)
    res = main.user?.last_name[0]
  return res.toUpperCase()
})

let dropdown: Dropdown
onMounted(() => {
  initDropdowns()
  dropdown = new Dropdown(
    document.getElementById('dropdown-profile'),
    document.getElementById('profile-picker'),
  )
})
function openSupport() {
  openMessenger()
  dropdown.hide()
}
function logOut() {
  main.logout().then(() => router.replace('/login'))
  dropdown.hide()
}
</script>

<template>
  <div>
    <button
      id="profile-picker" data-dropdown-toggle="dropdown-profile"
      class="inline-flex items-center px-2 py-1 text-sm font-medium text-center text-gray-700 border rounded-lg dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600 focus:ring-4 focus:outline-none focus:ring-blue-300"
      type="button"
    >
      <img v-if="main.user?.image_url" class="w-8 h-8 mask mask-squircle" :src="main.user?.image_url" width="32" height="32" alt="User">
      <div v-else class="flex items-center justify-center w-8 h-8 border border-black rounded-full dark:border-white">
        <p>{{ acronym }}</p>
      </div>
      <div class="flex items-center truncate">
        <span class="hidden ml-2 text-sm font-medium truncate md:block dark:text-white group-hover:text-slate-800 dark:group-hover:text-slate-100">{{ `${main.user?.first_name} ${main.user?.last_name}` }}</span>
        <IconDown class="w-6 h-6 ml-1 fill-current text-slate-400" />
      </div>
    </button>
    <div id="dropdown-profile" class="z-10 hidden bg-white divide-y divide-gray-100 rounded-lg shadow w-44 dark:bg-gray-700 dark:divide-gray-600">
      <div class="px-4 py-3 text-sm text-gray-900 dark:text-white">
        <div>{{ `${main.user?.first_name} ${main.user?.last_name}` }}</div>
        <div class="font-medium truncate">
          {{ main.user?.email }}
        </div>
      </div>
      <ul class="py-2 text-sm text-gray-700 dark:text-gray-200" aria-labelledby="dropdownInformationButton">
        <li>
          <router-link to="/dashboard/settings/account" class="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white" @click="dropdown.hide()">
            {{ t('settings') }}
          </router-link>
        </li>
        <li v-if="isMobile">
          <router-link to="/app/modules_test" class="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white" @click="dropdown.hide()">
            {{ t('module-heading') }}
          </router-link>
        </li>
        <li v-if="isMobile">
          <router-link to="/app/modules" class="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white" @click="dropdown.hide()">
            {{ t('module-heading') }} {{ t('tests') }}
          </router-link>
        </li>
        <li>
          <a href="#" class="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white" @click="openSupport">{{ t('support') }}</a>
        </li>
      </ul>
      <div class="py-2">
        <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200 dark:hover:text-white" @click="logOut">{{ t('sign-out') }}</a>
      </div>
    </div>
  </div>
</template>
