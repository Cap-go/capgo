<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { Capacitor } from '@capacitor/core'
import { storeToRefs } from 'pinia'
import { computed, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AdminOnlyModal from '~/components/AdminOnlyModal.vue'
import CreditsCta from '~/components/CreditsCta.vue'
import { checkPermissions } from '~/services/permissions'
import { openCheckout } from '~/services/stripe'
import { getCreditUnitPricing, getCurrentPlanNameOrg } from '~/services/supabase'
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

// Check if user is super_admin
const isSuperAdmin = computed(() => {
  const orgId = organizationStore.currentOrganization?.gid
  return organizationStore.hasPermissionsInRole('super_admin', ['org_super_admin'], orgId)
})

// Modal state for non-admin access
const showAdminModal = ref(false)

const { currentOrganization } = storeToRefs(organizationStore)
const creditUnitPrices = ref<Partial<Record<Database['public']['Enums']['credit_metric_type'], number>>>({})
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
  ]

  if (creditUnitPrices.value.mau)
    features[0] += ` included, then $${creditUnitPrices.value.mau}/user`

  if (creditUnitPrices.value.storage)
    features[1] += ` included, then $${creditUnitPrices.value.storage} per GB`

  if (creditUnitPrices.value.bandwidth)
    features[2] += ` included, then $${creditUnitPrices.value.bandwidth} per GB`

  if (creditUnitPrices.value.build_time)
    features[3] += ` included, then $${creditUnitPrices.value.build_time} per minute`

  const planName = plan.name?.toLowerCase() ?? ''
  if (planName === 'solo') {
    features.push('Community support (Discord)')
  }
  else if (planName === 'maker') {
    features.push('Priority bug fixes on plugins')
  }
  else if (planName === 'team') {
    features.push('Priority bug fixes on plugins')
    features.push('Priority support by email')
  }
  else if (planName === 'enterprise') {
    features.push('Priority bug fixes on plugins')
    features.push('Priority support by email')
    features.push('Custom domain')
    features.push('Direct chat support')
    features.push('Service SLA agreement')
    features.push('SOC 2 certified')
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

// Credits-only org: has credits but no active subscription and no trial remaining.
// These orgs use pay-as-you-go credits as their primary payment method.
const isCreditsOnly = computed(() => {
  const org = currentOrganization?.value
  if (!org)
    return false
  return !org.paying && (org.trial_left ?? 0) <= 0 && (org.credit_available ?? 0) > 0
})

async function openChangePlan(plan: Database['public']['Tables']['plans']['Row'], index: number) {
  // Show admin modal for non-admins instead of blocking
  if (!isSuperAdmin.value) {
    showAdminModal.value = true
    return
  }

  // Check if user has apps in this organization
  if (currentOrganization.value?.app_count === 0) {
    // Get other organizations where user is admin and has apps
    const orgsMap = organizationStore.getAllOrgs()
    const otherOrgsWithApps = [...orgsMap]
      .map(([_, org]) => org)
      .filter(org =>
        org.gid !== currentOrganization.value?.gid
        && org.app_count > 0
        && org.role.includes('super_admin'),
      )
      .sort((a, b) => b.app_count - a.app_count)

    // Build the description with list of other orgs if any
    let description = t('no-apps-confirm-subscription')
    if (otherOrgsWithApps.length > 0) {
      description += `\n\n${t('other-orgs-with-apps')}:`
      otherOrgsWithApps.slice(0, 5).forEach((org) => {
        description += `\n• ${org.name} (${org.app_count} ${org.app_count === 1 ? t('app') : t('apps')})`
      })
    }

    // Build buttons dynamically - start with cancel button
    const buttons = [
      {
        text: t('cancel'),
        role: 'cancel' as const,
      },
      // Add switch buttons for other orgs with apps (max 3)
      ...otherOrgsWithApps.slice(0, 3).map(org => ({
        text: `${t('switch-to')} ${org.name}`,
        id: `switch-${org.gid}`,
        handler: () => {
          organizationStore.setCurrentOrganization(org.gid)
          return true
        },
      })),
      // Add the "Add app" button
      {
        text: t('add-another-app'),
        id: 'add-app-button',
        handler: () => {
          router.push('/apps')
          return true
        },
      },
      // Add "Proceed anyway" button at the end
      {
        text: t('proceed-anyway'),
        id: 'proceed-anyway-button',
        role: 'primary' as const,
        handler: () => true,
      },
    ]

    dialogStore.openDialog({
      title: t('no-apps-in-org'),
      description,
      buttons,
    })

    await dialogStore.onDialogDismiss()
    // Only proceed if user clicked "Proceed anyway"
    if (dialogStore.lastButtonRole !== 'proceed-anyway-button')
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

async function loadCreditPricing(orgId?: string) {
  creditUnitPrices.value = await getCreditUnitPricing(orgId)
}

async function loadData(initial: boolean) {
  if (!initialLoad.value && !initial)
    return

  await organizationStore.awaitInitialLoad()

  const orgToLoad = currentOrganization.value
  const orgId = orgToLoad?.gid
  if (!orgId)
    throw new Error('Cannot get current org id')

  await Promise.all([
    loadCreditPricing(orgId),
    getCurrentPlanNameOrg(orgId).then((res) => {
      console.log('getCurrentPlanNameOrg', res)
      currentPlan.value = main.plans.find(plan => plan.name === res)
    }),
  ])
  initialLoad.value = true
}

watch(currentOrganization, async (newOrg, prevOrg) => {
  if (newOrg) {
    // Check permission directly instead of relying on computedAsync default
    const hasUpdateBillingPermission = await checkPermissions('org.update_billing', { orgId: newOrg.gid })

    if (!hasUpdateBillingPermission) {
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
        router.push('/apps')
      else
        organizationStore.setCurrentOrganization(prevOrg.gid)
      return
    }
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

      // Check permission on initial load
      if (currentOrganization.value) {
        const hasUpdateBillingPermission = await checkPermissions('org.update_billing', { orgId: currentOrganization.value.gid })

        if (!hasUpdateBillingPermission) {
          const orgsMap = organizationStore.getAllOrgs()
          const newOrg = [...orgsMap]
            .map(([_, a]) => a)
            .filter(org => org.role.includes('super_admin'))
            .sort((a, b) => b.app_count - a.app_count)[0]

          if (newOrg) {
            organizationStore.setCurrentOrganization(newOrg.gid)
            return
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
          router.push('/apps')
          return
        }
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
  // Disabled if: current plan (already subscribed) or mobile
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
    return 'cursor-pointer bg-blue-600 hover:bg-blue-700 focus:ring-blue-700 text-white'
  }
  return 'cursor-pointer bg-black dark:bg-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-black'
}
</script>

<template>
  <div class="flex flex-col pb-8 bg-white border shadow-lg md:p-8 md:pb-0 md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
    <div v-if="!thankYouPage" class="flex flex-col w-full h-full">
      <!-- Header Section -->
      <div class="flex flex-col items-center justify-between gap-4 mb-6 sm:flex-row shrink-0">
        <div class="flex-1">
          <div class="flex items-center gap-3">
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
              {{ t('plan-pricing-plans') }}
            </h1>
            <!-- Custom Plan Trigger -->
            <button
              class="items-center hidden px-3 py-1 text-xs font-medium text-blue-700 transition-colors rounded-full bg-blue-50 lg:inline-flex dark:text-blue-300 hover:bg-blue-100 dark:bg-blue-900/30"
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
        <div class="flex items-center p-1 bg-gray-200 rounded-lg dark:bg-base-200">
          <button
            class="py-1.5 px-4 text-sm font-medium rounded-md transition-all duration-200"
            :class="segmentVal === 'm' ? 'bg-white dark:bg-base-100 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'"
            @click="segmentVal = 'm'"
          >
            {{ t('monthly-plan') }}
          </button>
          <button
            class="flex gap-2 items-center py-1.5 px-4 text-sm font-medium rounded-md transition-all duration-200"
            :class="segmentVal === 'y' ? 'bg-white dark:bg-base-100 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'"
            @click="segmentVal = 'y'"
          >
            {{ t('yearly') }}
            <span class="py-0.5 px-1.5 text-xs font-bold text-green-600 bg-green-100 rounded-full dark:text-green-400 dark:bg-green-900/30">-20%</span>
          </button>
        </div>
      </div>

      <!-- Error Message -->
      <div v-if="organizationStore.currentOrganizationFailed" class="px-4 py-2 mb-4 font-medium text-center text-white bg-red-500 rounded-lg shrink-0">
        {{ t('plan-failed') }}
      </div>

      <!-- Credits CTA: shows info banner for credits-only orgs, upsell CTA for others -->
      <CreditsCta class="mb-6 shrink-0" :credits-only="isCreditsOnly" />

      <!-- Expert as a Service CTA -->
      <div class="mb-6 shrink-0">
        <div class="flex flex-col gap-3 p-4 border border-amber-200 bg-amber-50 rounded-2xl text-amber-900 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-sm font-semibold">
              {{ t('expert-service-title') }}
            </p>
            <p class="text-xs text-amber-800 dark:text-amber-200">
              {{ t('expert-service-desc') }}
            </p>
          </div>
          <a
            class="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold text-white bg-amber-600 rounded-full hover:bg-amber-700"
            href="https://capgo.app/premium-support/"
            rel="noopener noreferrer"
            target="_blank"
          >
            {{ t('expert-service-cta') }}
          </a>
        </div>
      </div>

      <!-- Plans Grid -->
      <div class="grid content-start min-h-0 grid-cols-1 gap-4 p-1 overflow-y-auto md:grid-cols-2 xl:grid-cols-4 grow">
        <div
          v-for="(p, index) in mainStore.plans"
          :key="p.price_m"
          class="relative flex flex-col p-5 overflow-hidden transition-all duration-200 bg-gray-100 border rounded-2xl group dark:bg-base-200"
          :class="[
            // Don't highlight the plan card for credits-only orgs — they are not actually
            // on any plan, and highlighting Solo (the fallback) would be misleading.
            p.name === currentPlan?.name && !isCreditsOnly ? 'border-2 border-blue-500' : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700',
            isRecommended(p) ? 'shadow-lg shadow-blue-500/10' : 'shadow-sm',
          ]"
        >
          <!-- Recommended Badge -->
          <div v-if="isRecommended(p)" class="absolute inset-x-0 top-0 h-1 from-blue-500 to-indigo-500 bg-linear-to-r" />
          <div v-if="isRecommended(p)" class="absolute top-3 right-3">
            <span class="inline-flex items-center py-0.5 px-2.5 text-xs font-medium text-blue-800 bg-blue-100 rounded-full dark:text-blue-200 dark:bg-blue-900/50">
              {{ t('recommended') }}
            </span>
          </div>

          <!-- Plan Header -->
          <div class="mb-4 shrink-0">
            <h3 class="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
              {{ p.name }}
              <span v-if="isTrial && currentPlanSuggest?.name === p.name" class="py-0.5 px-2 text-xs font-medium text-white bg-blue-600 rounded-full">
                {{ t('free-trial') }}
              </span>
            </h3>
            <p class="h-8 mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
              {{ t(convertKey(p.description)) }}
            </p>
          </div>

          <!-- Price -->
          <div class="mb-6 shrink-0">
            <div class="flex items-baseline">
              <span class="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
                ${{ getPrice(p, segmentVal) }}
              </span>
              <span class="ml-1 text-sm font-medium text-gray-500 dark:text-gray-400">/{{ t('mo') }}</span>
            </div>
            <p v-if="isYearlyPlan(p, segmentVal)" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {{ p.price_m !== p.price_y ? t('billed-annually-at') : t('billed-monthly-at') }} ${{ p.price_y }}
            </p>
          </div>

          <!-- Action Button -->
          <button
            :class="buttonStyle(p)"
            class="flex items-center justify-center w-full gap-2 px-4 py-2 mb-6 text-sm font-semibold transition-all duration-200 rounded-lg shadow-sm shrink-0"
            :disabled="isDisabled(p)"
            @click="openChangePlan(p, index)"
          >
            <svg v-if="isSubscribeLoading[index]" class="w-4 h-4 text-white animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {{ buttonName(p) }}
          </button>

          <!-- Features -->
          <div class="px-2 -mx-2 overflow-y-auto grow custom-scrollbar">
            <ul class="space-y-3">
              <li v-for="(f, indexx) in planFeatures(p)" :key="indexx" class="flex items-start gap-3 text-sm">
                <svg class="w-5 h-5 text-green-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span class="leading-tight text-gray-600 dark:text-gray-300">{{ f }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Footer / Contact -->
      <div v-if="!isMobile" class="mt-4 text-xs text-center text-gray-500 dark:text-gray-400 shrink-0">
        {{ t('plan-page-warn').replace('%ORG_NAME%', currentOrganization?.name ?? '') }}
        <a class="text-blue-600 hover:underline" href="https://capgo.app/docs/docs/webapp/payment/">{{ t('plan-page-warn-2') }}</a>
      </div>
    </div>

    <!-- Thank You Page -->
    <div v-else class="flex items-center justify-center w-full h-full bg-gray-50 dark:bg-base-300">
      <div class="text-center">
        <img src="/capgo.webp" alt="logo" class="w-20 h-20 mx-auto mb-8 animate-bounce">
        <h2 class="mb-4 text-3xl font-bold text-gray-900 dark:text-white">
          {{ t('thank-you-for-sub') }}
        </h2>
        <div class="mb-8 text-6xl">
          🎉
        </div>
        <router-link to="/apps" class="inline-flex items-center px-6 py-3 text-base font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700">
          {{ t('use-capgo') }} 🚀
        </router-link>
      </div>
    </div>

    <!-- Admin-only modal for non-admin users -->
    <AdminOnlyModal v-if="showAdminModal" @click="showAdminModal = false" />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
        </route>
