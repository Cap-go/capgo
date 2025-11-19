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
  <div v-if="props.desktop && bannerText" class="flex items-center space-x-2 sm:space-x-3 ml-auto">
    <span class="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 hidden sm:inline">
      {{ bannerLeftText }}:
    </span>
    <span class="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
      {{ bannerText }}
    </span>
    <a href="/settings/organization/plans" class="d-btn d-btn-xs sm:d-btn-sm border-none" :class="bannerColor">
      {{ isMobile ? t('see-usage') : t('upgrade') }}
    </a>
  </div>

  <!-- Mobile/original version -->
  <div v-else-if="!props.desktop && bannerText" class="flex items-center justify-end bg-gray-200 dark:bg-gray-800/90 min-h-[3rem] sm:min-h-[4rem] px-2 sm:px-4 gap-2">
    <span class="text-sm sm:text-lg font-semibold text-black dark:text-white">
      {{ bannerLeftText }}:
    </span>
    <span class="text-xs sm:text-base font-medium text-black dark:text-white">{{ bannerText }}</span>
    <a href="/settings/organization/plans" class="d-btn d-btn-xs sm:d-btn-sm border-none whitespace-nowrap ml-2" :class="bannerColor">{{ isMobile ? t('see-usage') : t('upgrade') }}</a>
  </div>
</template>
