<script setup lang="ts">
import {
  kNavbar,
} from 'konsta/vue'
import { computed, ref } from 'vue'
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
  const defaultColor = 'bg-neutral-focus'
  const warning = 'bg-warning'
  // bg-ios-light-surface-2 dark:bg-ios-dark-surface-2
  const success = 'bg-success'
  if (main.paying && main.canUseMore)
    return defaultColor

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
const konstaColors = ref({
  bgIos: bannerColor,
  bgMaterial: bannerColor,
  textIos: 'text-black',
  textMaterial: 'text-black',
})
</script>

<template>
  <k-navbar
    v-if="bannerText"
    :title="bannerText"
    :colors="konstaColors"
    :translucent="false"
  >
    <template #right>
      <router-link v-if="!isMobile" id="banner" slot="end" navbar to="/dashboard/settings/plans" class="px-2 py-1 text-white bg-blue-600 rounded hover:bg-blue-500">
        {{ t('upgrade') }}
      </router-link>
      <router-link v-else id="banner" slot="end" navbar to="/app/home" class="px-2 py-1 text-white bg-blue-600 rounded hover:bg-blue-500">
        {{ t('see-usage') }}
      </router-link>
    </template>
  </k-navbar>
</template>
