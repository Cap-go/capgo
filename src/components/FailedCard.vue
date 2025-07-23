<script setup lang="ts">
import { useI18n } from 'petite-vue-i18n'
import { useRouter } from 'vue-router'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const router = useRouter()
const organizationStore = useOrganizationStore()

function goToPlans() {
  router.push('/settings/organization/plans')
}
</script>

<template>
  <!-- Error Alert for Non-paying Users -->
  <div v-if="organizationStore.currentOrganizationFailed" class="mt-6 mb-6 bg-red-50 border border-red-200 rounded-xl p-8 mx-auto max-w-2xl">
    <div class="flex items-start">
      <div class="flex-shrink-0">
        <svg class="h-8 w-8 text-red-400" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
        </svg>
      </div>
      <div class="ml-4 flex-1">
        <h3 class="text-lg font-semibold text-red-800">
          {{ t('subscription-required') }}
        </h3>
        <div class="mt-3 text-base text-red-700">
          <p>{{ t('plan-failed-description') }}</p>
        </div>
        <div class="mt-6">
          <button
            class="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-lg text-base font-semibold transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 shadow-md hover:shadow-lg"
            @click="goToPlans"
          >
            {{ t('plan-upgrade-v2') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
