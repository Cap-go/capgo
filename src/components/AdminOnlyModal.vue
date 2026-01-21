<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import IconUserCircle from '~icons/heroicons/user-circle'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const organizationStore = useOrganizationStore()

const admins = ref<{ email: string, image_url: string }[]>([])
const isLoading = ref(true)

onMounted(async () => {
  try {
    const members = await organizationStore.getMembers()
    admins.value = members
      .filter(m => m.role === 'super_admin' || m.role === 'admin')
      .map(m => ({ email: m.email, image_url: m.image_url }))
  }
  catch (e) {
    console.error('Failed to fetch admins:', e)
  }
  finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="flex absolute inset-0 z-10 flex-col justify-center items-center bg-white/60 dark:bg-gray-900/60">
    <div class="p-8 text-center bg-white rounded-xl border shadow-xl dark:bg-gray-800 border-blue-200 dark:border-blue-700 max-w-md">
      <div class="flex justify-center mb-4">
        <div class="flex justify-center items-center w-16 h-16 bg-blue-100 rounded-full dark:bg-blue-900/30">
          <svg class="w-8 h-8 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
              clip-rule="evenodd"
            />
          </svg>
        </div>
      </div>
      <h2 class="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
        {{ t('admin-only-access') }}
      </h2>
      <p class="mb-4 text-gray-600 dark:text-gray-400">
        {{ t('admin-only-billing-description') }}
      </p>
      <div v-if="isLoading" class="flex justify-center py-2">
        <div class="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
      <div v-else-if="admins.length > 0" class="mt-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <p class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          {{ t('contact-your-admin') }}:
        </p>
        <div class="flex flex-wrap gap-2 justify-center">
          <div
            v-for="admin in admins"
            :key="admin.email"
            class="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-600"
          >
            <img
              v-if="admin.image_url"
              :src="admin.image_url"
              :alt="admin.email"
              class="w-5 h-5 rounded-full"
            >
            <IconUserCircle v-else class="w-5 h-5 text-gray-400" />
            <span class="text-sm text-gray-700 dark:text-gray-300">{{ admin.email }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
