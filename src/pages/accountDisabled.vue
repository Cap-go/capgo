<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
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

// Use i18n component interpolation in the template; no HTML parsing here

// Fetch removal date and start timer
onMounted(async () => {
  try {
    if (main.auth?.id) {
      const { data: removalDateStr, error: dateError } = await supabase
        .rpc('get_account_removal_date')

      if (dateError) {
        console.error('Error fetching removal date:', dateError)
        error.value = t('error-loading-deletion-date')
      }
      else if (removalDateStr) {
        deletionDate.value = new Date(removalDateStr)
      }
    }
    else {
      error.value = t('error-no-user-id')
    }
  }
  catch (err) {
    console.error('Error fetching removal date:', err)
    error.value = t('error-loading-deletion-date')
  }
  finally {
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
  }
  else if (hours > 0) {
    return `${hours} hours, ${minutes} minutes, ${seconds} seconds`
  }
  else if (minutes > 0) {
    return `${minutes} minutes, ${seconds} seconds`
  }
  else {
    return `${seconds} seconds`
  }
})
</script>

<template>
  <section class="flex flex-col w-full h-full">
    <!-- Capgo logo at top 10% -->
    <div class="flex justify-center items-center pt-[5vh]">
      <img src="/capgo.webp" alt="Capgo logo" class="w-16 h-16 rounded-sm invert dark:invert-0">
    </div>

    <!-- Main content positioned at 20% from top (80% from bottom) -->
    <div class="flex justify-center items-start w-full pt-[12.5vh]">
      <div class="px-4 max-w-2xl text-center">
        <h1 class="mb-6 text-4xl font-bold text-gray-900 dark:text-white">
          {{ t('account-deletion-requested') }}
        </h1>
        <i18n-t keypath="account-deletion-restore" tag="p" class="mb-4 text-lg text-gray-600 dark:text-gray-300">
          <template #link>
            <a
              href="https://support.capgo.app/"
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-500 underline hover:text-blue-600"
            >Capgo support</a>
          </template>
        </i18n-t>
        <div class="p-4 mt-6 bg-red-50 rounded-lg border border-red-200 dark:border-red-800 dark:bg-red-900/20">
          <p class="font-medium text-red-800 dark:text-red-200">
            {{ timeRemaining === t('account-deletion-very-soon') ? t('account-deletion-timer') : t('account-deletion-timer-in') }}
          </p>
          <p class="mt-2 text-2xl font-bold text-red-900 dark:text-red-100">
            {{ timeRemaining }}
          </p>
        </div>
      </div>
    </div>

    <!-- Logout button positioned 4vh below the content -->
    <div class="flex justify-center pt-[35vh]">
      <button
        class="py-3 px-6 font-medium text-white bg-gray-600 rounded-lg transition-colors duration-200 dark:bg-gray-700 hover:bg-gray-700 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none dark:hover:bg-gray-600"
        @click="handleLogout"
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
