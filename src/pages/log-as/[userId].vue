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
  <div>
    <PageLoader v-if="isLoading" label="Attempting to log you in as the requested account..." size="w-8 h-8" />
    <div v-else class="flex min-h-[calc(100dvh-8rem)] flex-col items-center justify-center space-y-2 px-4 py-16 text-center">
      <p class="text-lg font-semibold text-red-600 dark:text-red-400">
        Unable to spoof account.
      </p>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        {{ errorMessage || 'Please check your permissions or verify the link.' }}
      </p>
    </div>
  </div>
</template>
