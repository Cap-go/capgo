<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { Capacitor } from '@capacitor/core'
import { storeToRefs } from 'pinia'
import { computed, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { openCheckout } from '~/services/stripe'
import { getCurrentPlanNameOrg } from '~/services/supabase'
import { openSupport } from '~/services/support'
import { sendEvent } from '~/services/tracking'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const mainStore = useMainStore()
const displayStore = useDisplayStore()
displayStore.NavTitle = t('plans')

// const isUsageLoading = ref(false)
const initialLoad = ref(false)
const thankYouPage = ref(false)
const isSubscribeLoading = ref<Array<boolean>>([])
const segmentVal = ref<'m' | 'y'>('y')
const isYearly = computed(() => segmentVal.value === 'y')
const route = useRoute()
const router = useRouter()
const main = useMainStore()
const organizationStore = useOrganizationStore()
const dialogStore = useDialogV2Store()
const isMobile = Capacitor.isNativePlatform()

const { currentOrganization } = storeToRefs(organizationStore)

function planFeatures(plan: Database['public']['Tables']['plans']['Row']) {
  // Convert build time from seconds to hours or minutes for display
  const buildTimeSeconds = plan.build_time_unit || 0
  const buildTimeHours = Math.floor(buildTimeSeconds / 3600)
  const buildTimeMinutes = Math.floor(buildTimeSeconds / 60)

  let buildTimeDisplay = ''
  if (buildTimeSeconds > 0) {
    if (buildTimeHours >= 1) {
      buildTimeDisplay = `${buildTimeHours} ${t('build-hours')}`
    }
    else {
      buildTimeDisplay = `${buildTimeMinutes} ${t('build-minutes')}`
    }
  }

  const features = [
    `${plan.mau.toLocaleString()} ${t('mau')}`,
    `${plan.storage.toLocaleString()} ${t('plan-storage')}`,
    `${plan.bandwidth.toLocaleString()} ${t('plan-bandwidth')}`,
    buildTimeDisplay, // Will be empty string if 0, filtered out below
    t('priority-support'),
  ]

  // Track the index of build time for "Pay as you go" pricing
  const buildTimeIndex = 3

  if (plan.name.toLowerCase().includes('as you go')) {
    if (plan.mau_unit)
      features[0] += ` included, then $${plan.mau_unit}/user`

    if (plan.storage_unit)
      features[1] += ` included, then $${plan.storage_unit} per GB`

    if (plan.bandwidth_unit)
      features[2] += ` included, then $${plan.bandwidth_unit} per GB`

    if (plan.build_time_unit && buildTimeDisplay)
      features[buildTimeIndex] += ` included, then $${plan.build_time_unit} per hour`

    features.push('Dedicated support')
    features.push('Custom Domain')
    features.push('SOC II')
  }
  return features.filter(Boolean)
}

function convertKey(key: string) {
  const keySplit = key.split('.')
  if (keySplit.length === 3)
    return `plan-${keySplit[1]}`
  return key
}

const currentPlan = ref<Database['public']['Tables']['plans']['Row'] | undefined>(undefined)
const currentPlanSuggest = ref<Database['public']['Tables']['plans']['Row'] | undefined>(undefined)

watch(() => main.bestPlan, (newBestPlan) => {
  currentPlanSuggest.value = mainStore.plans.find(plan => plan.name === newBestPlan)
})

const isTrial = computed(() => currentOrganization?.value ? (!currentOrganization?.value.paying && (currentOrganization?.value.trial_left ?? 0) > 0) : false)

async function openChangePlan(plan: Database['public']['Tables']['plans']['Row'], index: number) {
  // Check if user has apps in this organization
  if (currentOrganization.value?.app_count === 0) {
    dialogStore.openDialog({
      title: t('no-apps-found'),
      description: t('add-app-first-to-change-plan'),
      buttons: [
        {
          text: t('cancel'),
          role: 'cancel',
        },
        {
          text: t('add-another-app'),
          id: 'add-app-button',
          handler: () => {
            router.push('/app')
            return true
          },
        },
      ],
    })
    await dialogStore.onDialogDismiss()
    return
  }

  // get the current url
  isSubscribeLoading.value[index] = true
  if (plan.stripe_id)
    await openCheckout(plan.stripe_id, `${window.location.href}?success=1`, `${window.location.href}?cancel=1`, plan.price_y !== plan.price_m ? isYearly.value : false, currentOrganization?.value?.gid ?? '')
  isSubscribeLoading.value[index] = false
}

function getPrice(plan: Database['public']['Tables']['plans']['Row'], t: 'm' | 'y'): number {
  if (t === 'm' || plan.price_y === plan.price_m) {
    return plan.price_m
  }
  else {
    const p = plan.price_y
    return +(p / 12).toFixed(0)
  }
}

function isYearlyPlan(plan: Database['public']['Tables']['plans']['Row'], t: 'm' | 'y'): boolean {
  return t === 'y'
}

async function loadData(initial: boolean) {
  if (!initialLoad.value && !initial)
    return

  await organizationStore.awaitInitialLoad()

  const orgToLoad = currentOrganization.value
  const orgId = orgToLoad?.gid
  if (!orgId)
    throw new Error('Cannot get current org id')

  getCurrentPlanNameOrg(orgId).then((res) => {
    console.log('getCurrentPlanNameOrg', res)
    currentPlan.value = main.plans.find(plan => plan.name === res)
  })
  initialLoad.value = true
}

watch(currentOrganization, async (newOrg, prevOrg) => {
  if (!organizationStore.hasPermissionsInRole(await organizationStore.getCurrentRole(newOrg?.created_by ?? ''), ['super_admin'])) {
    if (!initialLoad.value) {
      const orgsMap = organizationStore.getAllOrgs()
      const newOrg = [...orgsMap]
        .map(([_, a]) => a)
        .filter(org => org.role.includes('super_admin'))
        .sort((a, b) => b.app_count - a.app_count)[0]

      if (newOrg) {
        organizationStore.setCurrentOrganization(newOrg.gid)
        return
      }
    }

    dialogStore.openDialog({
      title: t('cannot-view-plans'),
      description: `${t('plans-super-only')}`,
      buttons: [
        {
          text: t('ok'),
        },
      ],
    })
    await dialogStore.onDialogDismiss()
    if (!prevOrg)
      router.push('/app')
    else
      organizationStore.setCurrentOrganization(prevOrg.gid)
  }

  await loadData(false)
  segmentVal.value = currentOrganization.value?.is_yearly ? 'y' : 'm'

  // isSubscribeLoading.value.fill(false, 0, plans.value.length)
})

watchEffect(async () => {
  if (route.path === '/settings/organization/plans') {
    // if success is in url params show modal success plan setup
    if (route.query.success) {
      // toast.success(t('usage-success'))
      thankYouPage.value = true
    }
    else if (main.user?.id) {
      if (route.query.oid && typeof route.query.oid === 'string') {
        await organizationStore.awaitInitialLoad()
        organizationStore.setCurrentOrganization(route.query.oid)
      }

      loadData(true)
      sendEvent({
        channel: 'usage',
        event: 'User visit',
        icon: '💳',
        user_id: currentOrganization.value?.gid,
        notify: false,
      }).catch()
    }
  }
})
// create function to check button status
function buttonName(p: Database['public']['Tables']['plans']['Row']) {
  if (isMobile)
    return t('check-on-web')
  if (currentPlan.value?.name === p.name && currentOrganization.value?.paying && currentOrganization.value?.is_yearly === isYearly.value) {
    return t('Current')
  }
  if (isTrial.value || organizationStore.currentOrganizationFailed) {
    return t('plan-upgrade')
  }
  return p.price_m >= (currentPlan.value?.price_m ?? 0) ? (t('plan-upgrade-v2')) : (t('downgrade'))
}

function isDisabled(plan: Database['public']['Tables']['plans']['Row']) {
  return (currentPlan.value?.name === plan.name && currentOrganization.value?.paying && currentOrganization.value?.is_yearly === isYearly.value) || isMobile
}

function isRecommended(p: Database['public']['Tables']['plans']['Row']) {
  return currentPlanSuggest.value?.name === p.name && (currentPlanSuggest.value?.price_m ?? 0) > (currentPlan.value?.price_m ?? 0)
}
function buttonStyle(p: Database['public']['Tables']['plans']['Row']) {
  if (isDisabled(p)) {
    return 'cursor-not-allowed bg-gray-500 dark:bg-gray-400 text-white'
  }
  if (isRecommended(p)) {
    return 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-700 text-white'
  }
  return 'bg-black dark:bg-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-black'
}
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden bg-gray-50 dark:bg-base-300">
    <div v-if="!thankYouPage" class="flex flex-col h-full w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <!-- Header Section -->
      <div class="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 shrink-0">
        <div class="flex-1">
          <div class="flex items-center gap-3">
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
              {{ t('plan-pricing-plans') }}
            </h1>
            <!-- Custom Plan Trigger -->
            <button
              class="hidden lg:inline-flex items-center px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded-full hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 transition-colors"
              @click="openSupport()"
            >
              {{ t('need-more-contact-us') }}
            </button>
          </div>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {{ t('plan-desc') }}
          </p>
        </div>

        <!-- Toggle -->
        <div class="flex items-center p-1 bg-gray-200 dark:bg-base-200 rounded-lg">
          <button
            class="px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200"
            :class="segmentVal === 'm' ? 'bg-white dark:bg-base-100 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'"
            @click="segmentVal = 'm'"
          >
            {{ t('monthly-plan') }}
          </button>
          <button
            class="px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200 flex items-center gap-2"
            :class="segmentVal === 'y' ? 'bg-white dark:bg-base-100 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'"
            @click="segmentVal = 'y'"
          >
            {{ t('yearly') }}
            <span class="text-xs font-bold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full">-20%</span>
          </button>
        </div>
      </div>

      <!-- Error Message -->
      <div v-if="organizationStore.currentOrganizationFailed" class="mb-4 shrink-0 bg-red-500 text-white px-4 py-2 rounded-lg text-center font-medium">
        {{ t('plan-failed') }}
      </div>

      <!-- Plans Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 grow min-h-0 overflow-y-auto p-1 content-start">
        <div
          v-for="(p, index) in mainStore.plans"
          :key="p.price_m"
          class="flex flex-col p-5 rounded-2xl border transition-all duration-200 overflow-hidden relative group bg-white dark:bg-base-100"
          :class="[
            p.name === currentPlan?.name ? 'border-2 border-blue-500' : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700',
            isRecommended(p) ? 'shadow-lg shadow-blue-500/10' : 'shadow-sm',
          ]"
        >
          <!-- Recommended Badge -->
          <div v-if="isRecommended(p)" class="absolute top-0 inset-x-0 h-1 bg-linear-to-r from-blue-500 to-indigo-500" />
          <div v-if="isRecommended(p)" class="absolute top-3 right-3">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
              {{ t('recommended') }}
            </span>
          </div>

          <!-- Plan Header -->
          <div class="mb-4 shrink-0">
            <h3 class="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              {{ p.name }}
              <span v-if="isTrial && currentPlanSuggest?.name === p.name" class="px-2 py-0.5 text-xs font-medium text-white bg-blue-600 rounded-full">
                {{ t('free-trial') }}
              </span>
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 h-8 line-clamp-2">
              {{ t(convertKey(p.description)) }}
            </p>
          </div>

          <!-- Price -->
          <div class="mb-6 shrink-0">
            <div class="flex items-baseline">
              <span class="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                ${{ getPrice(p, segmentVal) }}
              </span>
              <span class="ml-1 text-sm font-medium text-gray-500 dark:text-gray-400">/{{ t('mo') }}</span>
            </div>
            <p v-if="isYearlyPlan(p, segmentVal)" class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {{ p.price_m !== p.price_y ? t('billed-annually-at') : t('billed-monthly-at') }} ${{ p.price_y }}
            </p>
          </div>

          <!-- Action Button -->
          <button
            :class="buttonStyle(p)"
            class="w-full py-2 px-4 rounded-lg text-sm font-semibold shadow-sm transition-all duration-200 mb-6 shrink-0 flex items-center justify-center gap-2"
            :disabled="isDisabled(p)"
            @click="openChangePlan(p, index)"
          >
            <svg v-if="isSubscribeLoading[index]" class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {{ buttonName(p) }}
          </button>

          <!-- Features -->
          <div class="grow overflow-y-auto -mx-2 px-2 custom-scrollbar">
            <ul class="space-y-3">
              <li v-for="(f, indexx) in planFeatures(p)" :key="indexx" class="flex items-start gap-3 text-sm">
                <svg class="w-5 h-5 text-green-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span class="text-gray-600 dark:text-gray-300 leading-tight">{{ f }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Footer / Contact -->
      <div v-if="!isMobile" class="mt-4 text-center shrink-0 text-xs text-gray-500 dark:text-gray-400">
        {{ t('plan-page-warn').replace('%ORG_NAME%', currentOrganization?.name ?? '') }}
        <a class="text-blue-600 hover:underline" href="https://capgo.app/docs/docs/webapp/payment/">{{ t('plan-page-warn-2') }}</a>
      </div>
    </div>

    <!-- Thank You Page -->
    <div v-else class="h-full w-full flex items-center justify-center bg-gray-50 dark:bg-base-300">
      <div class="text-center">
        <img src="/capgo.webp" alt="logo" class="h-20 w-20 mx-auto mb-8 animate-bounce">
        <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          {{ t('thank-you-for-sub') }}
        </h2>
        <div class="text-6xl mb-8">
          🎉
        </div>
        <router-link to="/app" class="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
          {{ t('use-capgo') }} 🚀
        </router-link>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
        </route>
