<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { Capacitor } from '@capacitor/core'
import { useI18n } from 'petite-vue-i18n'
import { storeToRefs } from 'pinia'
import { computed, ref, watch, watchEffect } from 'vue'
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
  const features = [
    `${plan.mau.toLocaleString()} ${t('mau')}`,
    `${plan.storage.toLocaleString()} ${t('plan-storage')}`,
    `${plan.bandwidth.toLocaleString()} ${t('plan-bandwidth')}`,
    t('priority-support'),
  ]
  if (plan.name.toLowerCase().includes('as you go')) {
    if (plan.mau_unit)
      features[0] += ` included, then $${plan.mau_unit}/user`

    if (plan.storage_unit)
      features[1] += ` included, then $${plan.storage_unit} per GB`

    if (plan.bandwidth_unit)
      features[2] += ` included, then $${plan.bandwidth_unit} per GB`

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
  if (!organizationStore.hasPermisisonsInRole(await organizationStore.getCurrentRole(newOrg?.created_by ?? ''), ['super_admin'])) {
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
  return {
    'bg-blue-600 hover:bg-blue-700 focus:ring-blue-700': isRecommended(p),
    'bg-black dark:bg-white dark:text-black hover:bg-gray-500 focus:ring-gray-500': true,
    'cursor-not-allowed bg-gray-500 dark:bg-gray-400': isDisabled(p),
  }
}
</script>

<template>
  <div>
    <div v-if="!thankYouPage" class="h-full pb-8 overflow-y-auto max-h-fit grow md:pb-0">
      <div class="px-4 pt-6 mx-auto max-w-7xl lg:px-8 sm:px-6">
        <div class="sm:align-center sm:flex sm:flex-col">
          <h1 class="text-5xl font-extrabold text-gray-900 sm:text-center dark:text-white">
            {{ t('plan-pricing-plans') }}
          </h1>
          <p class="mt-5 text-xl text-gray-700 sm:text-center dark:text-white">
            {{ t('plan-desc') }}<br>
          </p>
        </div>
        <div v-if="organizationStore.currentOrganizationFailed" id="error-missconfig" class="mt-4 mb-0 bg-[#ef4444] text-white w-fit ml-auto mr-auto border-8 rounded-2xl border-[#ef4444]">
          {{ t('plan-failed') }}
        </div>
        <div class="flex items-center justify-center mt-8 space-x-6 sm:mt-12">
          <div class="flex items-center cursor-pointer" @click="segmentVal = 'm'">
            <input
              id="monthly" type="radio" name="pricing-plans"
              class="w-4 h-4 text-blue-300 border border-gray-200 dark:text-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600"
              :checked="segmentVal === 'm'"
            >
            <label for="monthly" class="block ml-3 text-sm font-medium sm:text-base">
              {{ t('monthly-plan') }}
            </label>
          </div>

          <div class="flex items-center cursor-pointer" @click="segmentVal = 'y'">
            <input
              id="yearly" type="radio" name="pricing-plans"
              class="w-4 h-4 text-blue-300 border border-gray-200 dark:text-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600"
              :checked="segmentVal === 'y'"
            >
            <label for="yearly" class="block ml-3 text-sm font-medium sm:text-base">
              {{ t('yearly') }}
            </label>
            <span class="ml-1 text-sm font-medium text-blue-600">
              ({{ t('save') }} 20%)
            </span>
          </div>
        </div>
        <div class="mt-6 space-y-12 sm:grid sm:grid-cols-2 xl:grid-cols-4 lg:mx-auto xl:mx-0 lg:max-w-4xl xl:max-w-none sm:gap-6 sm:space-y-0">
          <div v-for="(p, index) in mainStore.plans" :key="p.price_m" class="relative mt-12 border border-gray-200 divide-y divide-gray-200 rounded-lg shadow-xs md:mt-0 bg-gray-50 dark:bg-gray-900" :class="{ 'border-4 border-muted-blue-600': p.name === currentPlan?.name }">
            <div v-if="isRecommended(p)" class="absolute top-0 right-0 flex items-start -mt-8 border-none">
              <svg
                class="w-auto h-16 text-blue-600 dark:text-red-500" viewBox="0 0 83 64" fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M4.27758 62.7565C4.52847 63.5461 5.37189 63.9827 6.16141 63.7318L19.0274 59.6434C19.817 59.3925 20.2536 58.5491 20.0027 57.7595C19.7518 56.97 18.9084 56.5334 18.1189 56.7842L6.68242 60.4184L3.04824 48.982C2.79735 48.1924 1.95394 47.7558 1.16441 48.0067C0.374889 48.2576 -0.0617613 49.101 0.189127 49.8905L4.27758 62.7565ZM13.4871 47.8215L12.229 47.0047L13.4871 47.8215ZM39.0978 20.5925L38.1792 19.4067L39.0978 20.5925ZM7.03921 62.9919C8.03518 61.0681 13.1417 51.1083 14.7453 48.6383L12.229 47.0047C10.5197 49.6376 5.30689 59.8127 4.37507 61.6126L7.03921 62.9919ZM14.7453 48.6383C22.0755 37.3475 29.8244 29.6738 40.0164 21.7784L38.1792 19.4067C27.7862 27.4579 19.7827 35.3698 12.229 47.0047L14.7453 48.6383ZM40.0164 21.7784C52.6582 11.9851 67.634 7.57932 82.2576 3.44342L81.4412 0.556653C66.8756 4.67614 51.3456 9.20709 38.1792 19.4067L40.0164 21.7784Z"
                />
              </svg>
              <span class="ml-2 -mt-2 text-sm font-semibold text-blue-600 dark:text-red-500">
                {{ t('recommended') }}
              </span>
            </div>
            <div class="p-6 border-none">
              <div class="flex flex-row">
                <h2 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">
                  {{ p.name }}
                </h2>
                <h2 v-if="isTrial && currentPlanSuggest?.name === p.name" class="px-2 ml-auto text-white bg-blue-600 rounded-full dark:text-white">
                  {{ t('free-trial') }}
                </h2>
              </div>
              <p class="mt-4 text-sm text-gray-500 dark:text-gray-100">
                {{ t(convertKey(p.description)) }}
              </p>
              <p class="mt-8">
                <span class="text-4xl font-extrabold text-gray-900 dark:text-white">
                  ${{ getPrice(p, segmentVal) }}
                </span>
                <span class="text-base font-medium text-gray-500 dark:text-gray-100">/{{ t('mo') }}</span>
              </p>
              <button
                :class="buttonStyle(p)"
                class="cursor-pointer block w-full py-2 mt-8 text-sm font-semibold text-center text-white border border-gray-800 rounded-md"
                :disabled="isDisabled(p)" @click="openChangePlan(p, index)"
              >
                <svg v-if="isSubscribeLoading[index]" class="inline-block w-5 h-5 mr-3 -ml-1 text-white align-middle dark:text-gray-900 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {{ buttonName(p) }}
              </button>
              <p v-if="isYearlyPlan(p, segmentVal)" class="mt-8">
                <span class="text-gray-900 dark:text-white">{{ p.price_m !== p.price_y ? t('billed-annually-at') : t('billed-monthly-at') }} ${{ p.price_y }}</span>
              </p>
            </div>
            <div class="px-6 pt-6 pb-8">
              <h3 class="text-xs font-medium tracking-wide text-gray-900 uppercase dark:text-white">
                {{ t('plan-whats-included') }}
              </h3>
              <ul class="mt-6 space-y-4">
                <li v-for="(f, indexx) in planFeatures(p)" :key="indexx" class="flex space-x-3">
                  <svg class="w-5 h-5 text-green-500 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                  <span class="text-sm text-gray-500 dark:text-gray-100">{{ f }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div v-if="!isMobile" class="mt-4 text-center">
          <p class="mt-2 text-lg text-gray-700 sm:text-center dark:text-white">
            {{ t('plan-page-warn').replace('%ORG_NAME%', currentOrganization?.name ?? '') }}
            <a class="text-blue-600" href="https://capgo.app/docs/docs/webapp/payment/">{{ t('plan-page-warn-2') }}</a>
            <br>
          </p>
        </div>
        <section class="py-8 lg:py-20 sm:py-12">
          <div class="px-4 mx-auto max-w-7xl lg:px-8 sm:px-6">
            <div class="max-w-2xl mx-auto text-center">
              <h2 class="text-2xl font-bold text-white-900 font-pj sm:text-3xl xl:text-4xl dark:text-white">
                {{ t('need-more-contact-us') }}
              </h2>
            </div>

            <BlurBg background="">
              <template #default>
                <div class="w-full px-4 py-6 lg:px-16 lg:py-14 sm:px-8 bg-blue-50">
                  <div class="w-full md:flex md:items-center lg:space-x-6 md:space-x-4">
                    <div class="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:gap-x-12">
                      <div>
                        <ul class="space-y-3 text-sm sm:text-base font-medium text-black font-pj">
                          <li class="flex items-center">
                            <svg class="w-4 h-4 sm:w-5 sm:h-5 mr-2 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                            </svg>
                            {{ t('unlimited-updates') }}
                          </li>

                          <li class="flex items-center">
                            <svg class="w-4 h-4 sm:w-5 sm:h-5 mr-2 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                            </svg>
                            {{ t('bigger-app-size') }}
                          </li>

                          <li class="flex items-center">
                            <svg class="w-4 h-4 sm:w-5 sm:h-5 mr-2 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                            </svg>
                            {{ t('more-version-storage') }}
                          </li>
                        </ul>
                      </div>

                      <div>
                        <ul class="space-y-3 text-sm sm:text-base font-medium text-black font-pj">
                          <li class="flex items-center">
                            <svg class="w-4 h-4 sm:w-5 sm:h-5 mr-2 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                            </svg>
                            {{ t('custom-domain') }}
                          </li>

                          <li class="flex items-center">
                            <svg class="w-4 h-4 sm:w-5 sm:h-5 mr-2 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                            </svg>
                            {{ t('special-api-access') }}
                          </li>

                          <li class="flex items-center">
                            <svg class="w-4 h-4 sm:w-5 sm:h-5 mr-2 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                            </svg>
                            {{ t('bulk-upload') }}
                          </li>
                        </ul>
                      </div>
                    </div>

                    <div class="hidden lg:block">
                      <svg class="w-4 h-auto dark:text-gray-600" viewBox="0 0 16 123" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 11)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 46)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 81)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 116)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 18)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 53)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 88)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 123)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 25)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 60)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 95)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 32)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 67)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 102)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 39)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 74)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.83205 -0.5547 -0.5547 0.83205 15 109)" />
                      </svg>
                    </div>

                    <div class="w-full sm:w-auto mt-6 md:mt-0 text-center">
                      <button
                        class="cursor-pointer inline-flex items-center justify-center px-6 py-3 text-sm sm:text-base font-bold text-gray-300 transition-all duration-200 bg-black border font-pj rounded-xl hover:bg-black/50 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-black w-full sm:w-auto"
                        @click="openSupport()"
                      >
                        Get quote now
                      </button>
                    </div>
                  </div>
                </div>
              </template>
            </BlurBg>
          </div>
        </section>
      </div>
    </div>
    <div v-else class="relative w-full overflow-hidden ">
      <div class="absolute z-10 right-0 left-0 ml-auto mt-[5vh] text-2xl mr-auto text-center w-fit flex flex-col">
        <img src="/capgo.webp" alt="logo" class="h-16  w-16 ml-auto mr-auto mb-16">
        {{ t('thank-you-for-sub') }}
        <span class=" mt-[2.5vh] text-[3.5rem]">🎉</span>
        <router-link class="mt-[40vh]" to="/app">
          <span class="text-xl text-blue-600">{{ t('use-capgo') }} 🚀</span>
        </router-link>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
        </route>
