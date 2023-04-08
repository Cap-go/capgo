<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Capacitor } from '@capacitor/core'
import { useMainStore } from '~/stores/main'

defineProps({
  text: { type: String, default: '' },
  color: { type: String, default: '' },
})
const main = useMainStore()
const { t } = useI18n()

const isMobile = Capacitor.isNativePlatform()

const bannerText = computed(() => {
  if (main.canceled)
    return t('plan-inactive')

  else if (!main.paying && main.trialDaysLeft > 1)
    return `${main.trialDaysLeft} ${t('trial-left')}`

  else if (!main.paying && main.trialDaysLeft === 1)
    return t('one-day-left')

  else if (!main.paying && !main.canUseMore)
    return t('trial-plan-expired')

  else if (main.paying && !main.canUseMore)
    return t('you-reached-the-limi')

  return null
})
const bannerColor = computed(() => {
  const warning = 'bg-warning'
  // bg-ios-light-surface-2 dark:bg-ios-dark-surface-2
  const success = 'bg-success'
  if (main.paying && main.canUseMore)
    return ''

  else if (main.canceled)
    return warning

  else if (!main.paying && main.trialDaysLeft > 1 && main.trialDaysLeft <= 7)
    return warning

  else if (!main.paying && main.trialDaysLeft === 1)
    return warning

  else if (!main.paying && !main.canUseMore)
    return warning

  else if (main.paying && !main.canUseMore)
    return warning

  return success
})
</script>

<template>
  <div v-if="bannerText" class="navbar" :class="bannerColor">
    <div class="navbar-start" />
    <div class="navbar-center lg:flex">
      <a class="text-xl font-bold text-black normal-case">{{ bannerText }}</a>
    </div>
    <div class="navbar-end">
      <a href="/dashboard/settings/plans" class="btn">{{ isMobile ? t('see-usage') : t('upgrade') }}</a>
    </div>
  </div>
</template>
