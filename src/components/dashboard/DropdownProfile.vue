<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Capacitor } from '@capacitor/core'
import { useMainStore } from '~/stores/main'
import { getCurrentPlanName } from '~/services/supabase'
import { openMessenger } from '~/services/chatwoot'
import IconDown from '~icons/material-symbols/keyboard-arrow-down-rounded'

const props = defineProps({
  align: {
    type: String,
    default: 'left',
  },
})
const { t } = useI18n()

const router = useRouter()
const main = useMainStore()
const isMobile = Capacitor.isNativePlatform()
const planCurrent = ref('')
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

if (main.user?.id)
  getCurrentPlanName(main.user?.id).then(res => planCurrent.value = res)

const dropdownOpen = ref(false)

// close if the esc key is pressed
function keyHandler(keyCode: any) {
  if (!dropdownOpen.value || keyCode !== 27)
    return
  dropdownOpen.value = false
}

onMounted(() => {
  document.addEventListener('keydown', keyHandler)
})

onUnmounted(() => {
  document.removeEventListener('keydown', keyHandler)
})
</script>

<template>
  <div class="relative inline-flex">
    <button
      class="inline-flex items-center justify-center group"
      aria-haspopup="true"
      :aria-expanded="dropdownOpen"
      @click.prevent="dropdownOpen = !dropdownOpen"
    >
      <img v-if="main.user?.image_url" class="w-8 h-8 mask mask-squircle" :src="main.user?.image_url" width="32" height="32" alt="User">
      <div v-else class="flex items-center justify-center w-8 h-8 border border-black rounded-full dark:border-white">
        <p>{{ acronym }}</p>
      </div>
      <div class="items-center hidden truncate md:flex">
        <span class="ml-2 text-sm font-medium truncate dark:text-white group-hover:text-slate-800 dark:group-hover:text-slate-100">{{ `${main.user?.first_name} ${main.user?.last_name}` }}</span>
        <IconDown class="w-6 h-6 ml-1 fill-current text-slate-400" />
      </div>
    </button>
    <transition
      enter-active-class="transition duration-200 ease-out transform"
      enter-from-class="-translate-y-2 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-200 ease-out"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-show="dropdownOpen" class="absolute top-full z-30 mt-1 min-w-44 origin-top-right overflow-hidden border border-slate-200 rounded bg-gray-100 py-1.5 shadow-lg" :class="props.align === 'right' ? 'right-0' : 'left-0'">
        <div class="mb-1 border-b border-slate-200 px-3 pb-2 pt-0.5">
          <div class="font-medium text-slate-800">
            {{ `${main.user?.first_name} ${main.user?.last_name}` }}
          </div>
          <div class="text-xs font-bold text-slate-900">
            {{ planCurrent }} plan
          </div>
        </div>
        <ul
          class="space-y-2"
          @focusin="dropdownOpen = true"
          @focusout="dropdownOpen = false"
        >
          <li>
            <router-link class="flex items-center px-3 py-1 text-sm font-medium text-blue-500 hover:text-blue-600" to="/dashboard/settings/account" @click="dropdownOpen = false">
              {{ t('settings') }}
            </router-link>
          </li>
          <li v-if="isMobile">
            <router-link class="flex items-center px-3 py-1 text-sm font-medium text-blue-500 hover:text-blue-600" to="/app/modules" @click="dropdownOpen = false">
              {{ t('module-heading') }}
            </router-link>
          </li>
          <li v-if="isMobile">
            <router-link class="flex items-center px-3 py-1 text-sm font-medium text-blue-500 hover:text-blue-600" to="/app/modules_test" @click="dropdownOpen = false">
              {{ t('module-heading') }} {{ t('tests') }}
            </router-link>
          </li>
          <hr>
          <li>
            <button class="flex items-center px-3 py-1 text-sm font-medium text-blue-500 hover:text-blue-600" @click="openMessenger">
              {{ t('support') }}
            </button>
          </li>
          <hr>
          <li>
            <button class="flex items-center px-3 py-1 text-sm font-medium text-blue-500 hover:text-blue-600" @click="main.logout().then(() => router.replace('/login'))">
              {{ t('sign-out') }}
            </button>
          </li>
        </ul>
      </div>
    </transition>
  </div>
</template>
