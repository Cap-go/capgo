<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const router = useRouter()
const organizationStore = useOrganizationStore()

// Password policy takes priority over subscription
const needsPasswordUpdate = computed(() => {
  const org = organizationStore.currentOrganization
  return org?.password_policy_config?.enabled && org?.password_has_access === false
})

function goToPlans() {
  router.push('/settings/organization/plans')
}

function goToChangePassword() {
  router.push('/settings/account/change-password')
}
</script>

<template>
  <!-- Password Update Required Card -->
  <div v-if="needsPasswordUpdate" class="p-8 mx-auto mt-6 mb-6 max-w-2xl bg-[#FFFBEC] rounded-xl border border-orange-200">
    <div class="flex items-start">
      <div class="shrink-0">
        <svg class="w-8 h-8 text-[#FE9A02]" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clip-rule="evenodd" />
        </svg>
      </div>
      <div class="flex-1 ml-4">
        <h3 class="text-lg font-semibold text-[#973C00]">
          {{ t('password-policy-required') }}
        </h3>
        <div class="mt-3 text-base text-[#BB4D00]">
          <p>{{ t('password-update-org-access') }}</p>
        </div>
        <div class="mt-6">
          <button
            class="py-3 px-8 text-base font-semibold text-white bg-orange-500 rounded-lg shadow-md transition-colors duration-200 hover:bg-orange-600 hover:shadow-lg focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:outline-none"
            @click="goToChangePassword"
          >
            {{ t('update-password-now') }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Error Alert for Non-paying Users (only show if no password issue) -->
  <div v-else-if="organizationStore.currentOrganizationFailed" class="p-8 mx-auto mt-6 mb-6 max-w-2xl bg-red-50 rounded-xl border border-red-200">
    <div class="flex items-start">
      <div class="shrink-0">
        <svg class="w-8 h-8 text-red-400" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
        </svg>
      </div>
      <div class="flex-1 ml-4">
        <h3 class="text-lg font-semibold text-red-800">
          {{ t('subscription-required') }}
        </h3>
        <div class="mt-3 text-base text-red-700">
          <p>{{ t('plan-failed-description') }}</p>
        </div>
        <div class="mt-6">
          <button
            class="py-3 px-8 text-base font-semibold text-white bg-red-600 rounded-lg shadow-md transition-colors duration-200 hover:bg-red-700 hover:shadow-lg focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none"
            @click="goToPlans"
          >
            {{ t('plan-upgrade-v2') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
