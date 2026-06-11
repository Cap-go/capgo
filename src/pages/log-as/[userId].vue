<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { logAsUser } from '~/services/logAs'

const route = useRoute('/log-as/[userId]')
const router = useRouter()

const isLoading = ref(true)
const errorMessage = ref('')

onMounted(async () => {
  const targetIdentifier = route.params.userId

  if (!targetIdentifier || typeof targetIdentifier !== 'string') {
    errorMessage.value = 'Missing user id, email, or org id'
    isLoading.value = false
    return
  }

  try {
    await logAsUser(targetIdentifier, router)
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to log in as the requested user'
    isLoading.value = false
  }
})
</script>

<template>
  <div class="flex flex-col items-center justify-center py-16">
    <div v-if="isLoading" class="flex flex-col items-center space-y-4">
      <Spinner class="w-8 h-8" />
      <p class="text-gray-700 dark:text-gray-300">
        Attempting to log you in as the requested account...
      </p>
    </div>
    <div v-else class="space-y-2 text-center">
      <p class="text-lg font-semibold text-red-600 dark:text-red-400">
        Unable to spoof account.
      </p>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        {{ errorMessage || 'Please check your permissions or verify the link.' }}
      </p>
    </div>
  </div>
</template>
