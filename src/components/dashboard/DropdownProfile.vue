<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import IconDown from '~icons/material-symbols/keyboard-arrow-down-rounded'
import { useI18n } from 'petite-vue-i18n'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { openMessenger } from '~/services/bento'
import { useMainStore } from '~/stores/main'

const { t } = useI18n()
const dropdown = useTemplateRef('dropdown')
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
onClickOutside(dropdown, () => closeDropdown())
function openSupport() {
  openMessenger()
}
function closeDropdown() {
  if (dropdown.value) {
    dropdown.value.removeAttribute('open')
  }
}

function logOut() {
  main.logout().then(() => router.replace('/login'))
}
</script>

<template>
  <div class="relative">
    <details ref="dropdown" class="dropdown dropdown-top lg:hidden">
      <summary class="m-1 btn btn-outline btn-sm text-slate-800 dark:text-white">
        <img v-if="main.user?.image_url" class="w-6 h-6 mask mask-squircle" :src="main.user?.image_url" width="32" height="32" alt="User">
        <div v-else class="flex items-center justify-center w-6 h-6 border rounded-full border-slate-900 dark:border-slate-500">
          <p>{{ acronym }}</p>
        </div>
        <div class="flex items-center truncate">
          <span class="ml-2 text-sm font-medium truncate dark:text-white group-hover:text-slate-800 dark:group-hover:text-slate-100">{{ `${main.user?.first_name} ${main.user?.last_name}` }}</span>
          <IconDown class="w-6 h-6 ml-1 fill-current text-slate-400" />
        </div>
      </summary>
      <ul class="dropdown-content dark:bg-base-100 bg-white rounded-box z-[1] w-52 p-2 shadow" @click="closeDropdown()">
        <li class="text-sm text-gray-900 border-b border-gray-200 dark:text-white">
          <div class="font-medium truncate">
            {{ main.user?.email }}
          </div>
        </li>
        <li>
          <router-link to="/dashboard/settings/account" class="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white">
            {{ t('settings') }}
          </router-link>
        </li>
        <li>
          <router-link v-if="isMobile" to="/app/modules" class="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white">
            {{ t('module-heading') }}
          </router-link>
        </li>
        <li>
          <router-link v-if="isMobile" to="/app/modules_test" class="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white">
            {{ t('module-heading') }} {{ t('tests') }}
          </router-link>
        </li>
        <li>
          <div class="block px-4 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white" @click="openSupport">
            {{ t('support') }}
          </div>
        </li>
        <li class="border-t border-gray-200">
          <div class="block px-4 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white" @click="logOut">
            {{ t('sign-out') }}
          </div>
        </li>
      </ul>
    </details>

    <div class="hidden bg-gray-300 lg:flex lg:flex-col lg:space-y-2 lg:p-4 dark:bg-base-100 lg:rounded-box lg:shadow">
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
