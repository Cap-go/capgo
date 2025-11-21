<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const props = defineProps({
  text: { type: String, default: '' },
  color: { type: String, default: '' },
  desktop: { type: Boolean, default: false },
})

const main = useMainStore()
const { t } = useI18n()
const organizationStore = useOrganizationStore()

const route = useRoute('/app/p/[package]')
const appId = ref('')
// const organization = ref(null as null | Organization)
const isOrgOwner = ref(false)

watchEffect(async () => {
  try {
    if (route.path.includes('/app/p/')) {
      appId.value = route.params.package as string
      if (!appId.value) {
        console.error('cannot get app id. Params:', route.params)
        return
      }

      await organizationStore.awaitInitialLoad()
    }
    else if (route.path.includes('/app') && route.path.includes('home')) {
      appId.value = ''
    }

    isOrgOwner.value = !!organizationStore.currentOrganization && organizationStore.currentOrganization.created_by === main.user?.id
  }
  catch (ed) {
    console.error('Cannot figure out app_id for banner', ed)
  }
})

const isMobile = Capacitor.isNativePlatform()

const bannerLeftText = computed(() => {
  const org = organizationStore.currentOrganization
  if (org?.paying)
    return t('billing')

  return t('free-trial')
})

const bannerText = computed(() => {
  const org = organizationStore.currentOrganization
  if (!org)
    return

  if (organizationStore.currentOrganizationFailed)
    return t('subscription-required')

  if (org.is_canceled)
    return t('plan-inactive')

  else if (!org.paying && org.trial_left > 1)
    return `${org.trial_left} ${t('trial-left')}`

  else if (!org.paying && org.trial_left === 1)
    return t('one-day-left')

  else if (!org.paying && !org.can_use_more)
    return t('trial-plan-expired')

  else if (org.paying && !org.can_use_more)
    return t('you-reached-the-limi')

  return null
})
const bannerColor = computed(() => {
  const warning = 'd-btn-warning text-black'
  const success = 'd-btn-success text-black'

  const org = organizationStore.currentOrganization
  if (!org)
    return

  if (organizationStore.currentOrganizationFailed)
    return warning

  if (org.paying && org.can_use_more)
    return ''

  else if (org.is_canceled)
    return warning

  else if (!org.paying && org.trial_left > 1 && org.trial_left <= 7)
    return warning

  else if (!org.paying && org.trial_left === 1)
    return warning

  else if (!org.paying && !org.can_use_more)
    return warning

  else if (org.paying && !org.can_use_more)
    return warning

  return success
})
</script>

<template>
  <!-- Desktop inline version -->
  <div v-if="props.desktop && bannerText" class="flex items-center ml-auto space-x-2 sm:space-x-3">
    <span class="hidden text-xs font-medium sm:inline sm:text-sm text-slate-600 dark:text-slate-400">
      {{ bannerLeftText }}:
    </span>
    <span class="text-xs font-semibold sm:text-sm text-slate-800 dark:text-slate-200">
      {{ bannerText }}
    </span>
    <a href="/settings/organization/plans" class="border-none d-btn d-btn-xs sm:d-btn-sm" :class="bannerColor">
      {{ isMobile ? t('see-usage') : t('upgrade') }}
    </a>
  </div>

  <!-- Mobile/original version -->
  <div v-else-if="!props.desktop && bannerText" class="flex gap-2 justify-end items-center px-2 bg-gray-200 sm:px-4 min-h-12 sm:min-h-16 dark:bg-gray-800/90">
    <span class="text-sm font-semibold text-black sm:text-lg dark:text-white">
      {{ bannerLeftText }}:
    </span>
    <span class="text-xs font-medium text-black sm:text-base dark:text-white">{{ bannerText }}</span>
    <a href="/settings/organization/plans" class="ml-2 whitespace-nowrap border-none d-btn d-btn-xs sm:d-btn-sm" :class="bannerColor">{{ isMobile ? t('see-usage') : t('upgrade') }}</a>
  </div>
</template>
