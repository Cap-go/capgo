<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMainStore } from '~/stores/main'
import { getCurrentPlanName } from '~/services/supabase'
import { openChat } from '~/services/crips'

const props = defineProps({
  align: {
    type: String,
    default: 'left',
  },
})
const { t } = useI18n()

const router = useRouter()
const main = useMainStore()
const planCurrent = ref('')

if (main.auth?.id)
  getCurrentPlanName(main.auth?.id).then(res => planCurrent.value = res)

const dropdownOpen = ref(false)

// close if the esc key is pressed
const keyHandler = (keyCode: any) => {
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
      ref="trigger"
      class="inline-flex justify-center items-center group"
      aria-haspopup="true"
      :aria-expanded="dropdownOpen"
      @click.prevent="dropdownOpen = !dropdownOpen"
    >
      <img class="w-8 h-8 rounded-full" :src="main.user?.image_url" width="32" height="32" alt="User">
      <div class="flex items-center truncate">
        <span class="truncate ml-2 text-sm font-medium group-hover:text-slate-800 dark:text-white dark:group-hover:text-slate-100">{{ `${main.user?.first_name} ${main.user?.last_name}` }}</span>
        <svg class="w-3 h-3 shrink-0 ml-1 fill-current text-slate-400" viewBox="0 0 12 12">
          <path d="M5.9 11.4L.5 6l1.4-1.4 4 4 4-4L11.3 6z" />
        </svg>
      </div>
    </button>
    <transition
      enter-active-class="transition ease-out duration-200 transform"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition ease-out duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-show="dropdownOpen" class="origin-top-right z-10 absolute top-full min-w-44 bg-white border border-slate-200 py-1.5 rounded shadow-lg overflow-hidden mt-1" :class="props.align === 'right' ? 'right-0' : 'left-0'">
        <div class="pt-0.5 pb-2 px-3 mb-1 border-b border-slate-200">
          <div class="font-medium text-slate-800">
            {{ `${main.user?.first_name} ${main.user?.last_name}` }}
          </div>
          <div class="text-xs text-slate-900 font-bold">
            {{ planCurrent }} plan
          </div>
        </div>
        <ul
          ref="dropdown"
          class="space-y-2"
          @focusin="dropdownOpen = true"
          @focusout="dropdownOpen = false"
        >
          <li>
            <router-link class="font-medium text-sm text-blue-500 hover:text-blue-600 flex items-center py-1 px-3" to="/dashboard/settings/account" @click="dropdownOpen = false">
              {{ t('settings') }}
            </router-link>
          </li>
          <hr>
          <li>
            <button class="font-medium text-sm text-blue-500 hover:text-blue-600 flex items-center py-1 px-3" @click="openChat">
              {{ t('account.support') }}
            </button>
          </li>
          <hr>
          <li>
            <button class="font-medium text-sm text-blue-500 hover:text-blue-600 flex items-center py-1 px-3" @click="main.logout().then(() => router.replace('/login'))">
              {{ t('sign-out') }}
            </button>
          </li>
        </ul>
      </div>
    </transition>
  </div>
</template>
