<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { useI18n } from 'petite-vue-i18n'
import { computed, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'

import { urlToAppId } from '~/services/conversion'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

defineProps({
  text: { type: String, default: '' },
  color: { type: String, default: '' },
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

const bannerText = computed(() => {
  const org = organizationStore.currentOrganization
  if (!org)
    return

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
  const warning = 'btn-warning'
  // bg-ios-light-surface-2 dark:bg-ios-dark-surface-2
  const success = 'btn-success'

  const org = organizationStore.currentOrganization
  if (!org)
    return

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
  <div v-if="bannerText" class="navbar bg-gray-100 dark:bg-gray-800/90">
    <div class="text-xl navbar-start font-bold text-black dark:text-white md:pl-4 line-clamp-1">
      {{ t('free-trial') }}
    </div>
    <div class="navbar-center lg:flex">
      <a class="text-xl font-bold text-black dark:text-white normal-case ">{{ bannerText }}</a>
    </div>
    <div class="navbar-end">
      <a href="/settings/organization/plans" class="btn" :class="bannerColor">{{ isMobile ? t('see-usage') : t('upgrade') }}</a>
    </div>
  </div>
</template>
