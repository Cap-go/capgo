<script setup lang="ts">
import { useI18n } from 'petite-vue-i18n'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'

const { t } = useI18n()
const router = useRouter()
const main = useMainStore()
const supabase = useSupabase()

async function handleLogout() {
  await main.logout()
  router.replace('/login')
}

const deletionDate = ref<Date | null>(null)
const currentTime = ref(new Date())
const loading = ref(true)
const error = ref<string | null>(null)
let intervalId: NodeJS.Timeout | null = null

// Fetch removal date and start timer
onMounted(async () => {
  try {
    if (main.auth?.id) {
      const { data: removalDateStr, error: dateError } = await supabase
        .rpc('get_account_removal_date', { user_id: main.auth.id })
      
      if (dateError) {
        console.error('Error fetching removal date:', dateError)
        error.value = t('error-loading-deletion-date')
      } else if (removalDateStr) {
        deletionDate.value = new Date(removalDateStr)
      }
    } else {
      error.value = t('error-no-user-id')
    }
  } catch (err) {
    console.error('Error fetching removal date:', err)
    error.value = t('error-loading-deletion-date')
  } finally {
    loading.value = false
  }
  
  // Update current time every second
  intervalId = setInterval(() => {
    currentTime.value = new Date()
  }, 1000)
})

onUnmounted(() => {
  if (intervalId) {
    clearInterval(intervalId)
  }
})

// Calculate time remaining
const timeRemaining = computed(() => {
  if (loading.value) {
    return t('loading')
  }
  
  if (error.value || !deletionDate.value) {
    return error.value || t('error')
  }
  
  const diff = deletionDate.value.getTime() - currentTime.value.getTime()
  
  if (diff <= 0) {
    return t('account-deletion-very-soon')
  }
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)
  
  // Always show seconds
  if (days > 0) {
    return `${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds`
  } else if (hours > 0) {
    return `${hours} hours, ${minutes} minutes, ${seconds} seconds`
  } else if (minutes > 0) {
    return `${minutes} minutes, ${seconds} seconds`
  } else {
    return `${seconds} seconds`
  }
})
</script>

<template>
  <section class="flex w-full h-full flex-col">
    <!-- Capgo logo at top 10% -->
    <div class="flex justify-center items-center pt-[5vh]">
      <img src="/capgo.webp" alt="Capgo logo" class="w-16 h-16 rounded-sm invert dark:invert-0">
    </div>
    
    <!-- Main content positioned at 20% from top (80% from bottom) -->
    <div class="flex items-start justify-center w-full pt-[12.5vh]">
      <div class="text-center max-w-2xl px-4">
        <h1 class="text-4xl font-bold text-gray-900 dark:text-white mb-6">
          {{ t('account-deletion-requested') }}
        </h1>
        <p class="text-lg text-gray-600 dark:text-gray-300 mb-4" v-html="t('account-deletion-restore')">
        </p>
        <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mt-6">
          <p class="text-red-800 dark:text-red-200 font-medium">
            {{ timeRemaining === t('account-deletion-very-soon') ? t('account-deletion-timer') : t('account-deletion-timer-in') }}
          </p>
          <p class="text-2xl font-bold text-red-900 dark:text-red-100 mt-2">
            {{ timeRemaining }}
          </p>
        </div>
      </div>
    </div>
    
    <!-- Logout button positioned 4vh below the content -->
    <div class="flex justify-center pt-[35vh]">
      <button
        @click="handleLogout"
        class="px-6 py-3 text-white bg-gray-600 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
      >
        {{ t('sign-out') }}
      </button>
    </div>
  </section>
</template>

<route lang="yaml">
meta:
  layout: naked
</route>
