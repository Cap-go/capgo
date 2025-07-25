<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { useI18n } from 'petite-vue-i18n'
import { computed, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'

import { urlToAppId } from '~/services/conversion'
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
      const appIdRaw = route.params.package as string
      if (!appIdRaw) {
        console.error('cannot get app id. Parms:', route.params)
        return
      }

      appId.value = urlToAppId(appIdRaw)
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
  const warning = 'd-btn-warning'
  const success = 'd-btn-success'

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
  <div v-if="props.desktop && bannerText" class="flex items-center space-x-3 ml-auto">
    <span class="text-sm font-medium text-slate-600 dark:text-slate-400">
      {{ bannerLeftText }}:
    </span>
    <span class="text-sm font-semibold text-slate-800 dark:text-slate-200">
      {{ bannerText }}
    </span>
    <a href="/settings/organization/plans" class="d-btn d-btn-sm border-none" :class="bannerColor">
      {{ t('upgrade') }}
    </a>
  </div>

  <!-- Mobile/original version -->
  <div v-else-if="!props.desktop && bannerText" class="navbar bg-gray-200 dark:bg-gray-800/90">
    <div class="text-xl navbar-start font-bold text-black dark:text-white md:pl-4 line-clamp-1">
      {{ bannerLeftText }}
    </div>
    <div class="navbar-center lg:flex">
      <a class="text-xl font-bold text-black dark:text-white normal-case ">{{ bannerText }}</a>
    </div>
    <div class="navbar-end">
      <a href="/settings/organization/plans" class="d-btn border-none" :class="bannerColor">{{ isMobile ? t('see-usage') : t('upgrade') }}</a>
    </div>
  </div>
</template>
