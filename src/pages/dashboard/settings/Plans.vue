<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref, watch, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'sonner'
import { Capacitor } from '@capacitor/core'
import { openCheckout } from '~/services/stripe'
import { useMainStore } from '~/stores/main'
import { findBestPlan, getCurrentPlanName, getPlanUsagePercent, getPlans, getTotalStats } from '~/services/supabase'
import { useLogSnag } from '~/services/logsnag'
import { openChat, sendMessage } from '~/services/crips'
import type { Database } from '~/types/supabase.types'
import type { Stat } from '~/components/comp_def'
const openSupport = () => {
  sendMessage('I need a custom plan')
  openChat()
}

const { t } = useI18n()
const plans = ref<Database['public']['Tables']['plans']['Row'][]>([])
const displayPlans = computed(() => {
  return plans.value.filter(plan => plan.stripe_id !== 'free')
})
const stats = ref({
  mau: 0,
  storage: 0,
  bandwidth: 0,
} as Database['public']['Functions']['get_total_stats_v2']['Returns'][0])
const planSuggest = ref('')
const planCurrrent = ref('')
const planPercent = ref(0)
const snag = useLogSnag()
const isLoading = ref(false)
const segmentVal = ref<'m' | 'y'>('y')
const isYearly = computed(() => segmentVal.value === 'y')
const route = useRoute()
const main = useMainStore()
const isMobile = Capacitor.isNativePlatform()

const planFeatures = (plan: Database['public']['Tables']['plans']['Row']) => [
  `${plan.mau.toLocaleString()} ${t('mau')}`,
  `${plan.storage.toLocaleString()} ${t('plan-storage')}`,
  `${plan.bandwidth.toLocaleString()} ${t('plan-bandwidth')}`,
].filter(Boolean)

const convertKey = (key: string) => {
  const keySplit = key.split('.')
  if (keySplit.length === 3)
    return `plan-${keySplit[1]}`
  return key
}
const currentPlanSuggest = computed(() => plans.value.find(plan => plan.name === planSuggest.value))
const currentPlan = computed(() => plans.value.find(plan => plan.name === planCurrrent.value))

const openChangePlan = (planId: string) => {
  // get the current url
  if (planId)
    openCheckout(planId, window.location.href, window.location.href, isYearly.value)
}

const getPrice = (plan: Database['public']['Tables']['plans']['Row'], t: 'm' | 'y'): number => {
  return plan[t === 'm' ? 'price_m' : 'price_y']
}

const getSale = (plan: Database['public']['Tables']['plans']['Row']): string => {
  return `- ${100 - Math.round(plan.price_y * 100 / (plan.price_m * 12))} %`
}

const getUsages = async () => {
  // get aapp_stats
  if (!main.user?.id)
    return
  const date_id = new Date().toISOString().slice(0, 7)
  stats.value = await getTotalStats(main.user?.id, date_id)
  await findBestPlan(stats.value).then(res => planSuggest.value = res)
}

const loadData = async () => {
  isLoading.value = true
  await getPlans().then((pls) => {
    plans.value.length = 0
    plans.value.push(...pls)
  })
  await getUsages()

  if (main.user?.id) {
    const date_id = new Date().toISOString().slice(0, 7)
    await getCurrentPlanName(main.user?.id).then(res => planCurrrent.value = res)
    await getPlanUsagePercent(main.user?.id, date_id).then(res => planPercent.value = res)
  }
  isLoading.value = false
}

watch(
  () => plans.value,
  (myPlan, prevMyPlan) => {
    if (myPlan && !prevMyPlan) {
      loadData()
      // reGenerate annotations
      isLoading.value = false
    }
    else if (prevMyPlan && !myPlan) {
      isLoading.value = true
    }
  })

watchEffect(async () => {
  if (route.path === '/dashboard/settings/plans') {
    // if session_id is in url params show modal success plan setup
    if (route.query.session_id) {
      toast.success(t('usage-success'))
    }
    else if (main.user?.id) {
      loadData()
      snag.publish({
        channel: 'usage',
        event: 'User visit',
        icon: '💳',
        tags: {
          'user-id': main.user?.id,
        },
        notify: false,
      }).catch()
    }
  }
})
const hightLights = computed<Stat[]>(() => ([
  {
    label: 'Current',
    value: currentPlan.value?.name,
  },
  {
    label: 'Usage',
    value: `${planPercent.value.toLocaleString()} %`,
  },
  {
    label: 'Best plan',
    value: currentPlanSuggest.value?.name,
  },
]))
</script>

<template>
  <div v-if="!isLoading" class="h-full overflow-y-scroll bg-white max-h-fit dark:bg-gray-800">
    <div class="px-4 pt-6 mx-auto max-w-7xl lg:px-8 sm:px-6">
      <div class="sm:align-center sm:flex sm:flex-col">
        <h1 class="text-5xl font-extrabold text-gray-900 sm:text-center dark:text-white">
          {{ t('plan-pricing-plans') }}
        </h1>
        <p class="mt-5 text-xl text-gray-700 sm:text-center dark:text-white">
          {{ t('plan-desc') }}<br>
        </p>
      </div>
      <BlurBg :mini="true" background="">
        <template #default>
          <StatsBar :mini="true" :stats="hightLights" />
        </template>
      </BlurBg>
      <div class="flex items-center justify-center mt-8 space-x-6 sm:mt-12">
        <div class="flex items-center" @click="segmentVal = 'm'">
          <input
            id="monthly" type="radio" name="pricing-plans"
            class="w-4 h-4 text-blue-600 border border-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-600"
            :checked="segmentVal === 'm'"
          >
          <label for="monthly" class="block ml-3 text-sm font-medium text-gray-200 sm:text-base">
            Monthly Plan
          </label>
        </div>

        <div class="flex items-center" @click="segmentVal = 'y'">
          <input
            id="yearly" type="radio" name="pricing-plans"
            class="w-4 h-4 text-blue-600 border border-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-600"
            :checked="segmentVal === 'y'"
          >
          <label for="yearly" class="block ml-3 text-sm font-medium text-gray-200 sm:text-base">
            {{ t('yearly') }}
          </label>
          <span class="ml-1 text-sm font-medium text-blue-600">
            ({{ t('save') }} 20%)
          </span>
        </div>
      </div>
      <div class="mt-12 space-y-4 sm:grid sm:grid-cols-2 xl:grid-cols-4 lg:mx-auto xl:mx-0 lg:max-w-4xl xl:max-w-none sm:gap-6 sm:space-y-0">
        <div v-for="p in displayPlans" :key="p.id" class="relative border border-gray-200 divide-y divide-gray-200 rounded-lg shadow-sm" :class="p.name === currentPlan?.name ? 'border-4 border-muted-blue-600' : ''">
          <div v-if="currentPlanSuggest?.name === p.name && currentPlan?.name !== p.name" class="absolute top-0 right-0 flex items-start -mt-8">
            <svg
              class="w-auto h-16 text-blue-600" viewBox="0 0 83 64" fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4.27758 62.7565C4.52847 63.5461 5.37189 63.9827 6.16141 63.7318L19.0274 59.6434C19.817 59.3925 20.2536 58.5491 20.0027 57.7595C19.7518 56.97 18.9084 56.5334 18.1189 56.7842L6.68242 60.4184L3.04824 48.982C2.79735 48.1924 1.95394 47.7558 1.16441 48.0067C0.374889 48.2576 -0.0617613 49.101 0.189127 49.8905L4.27758 62.7565ZM13.4871 47.8215L12.229 47.0047L13.4871 47.8215ZM39.0978 20.5925L38.1792 19.4067L39.0978 20.5925ZM7.03921 62.9919C8.03518 61.0681 13.1417 51.1083 14.7453 48.6383L12.229 47.0047C10.5197 49.6376 5.30689 59.8127 4.37507 61.6126L7.03921 62.9919ZM14.7453 48.6383C22.0755 37.3475 29.8244 29.6738 40.0164 21.7784L38.1792 19.4067C27.7862 27.4579 19.7827 35.3698 12.229 47.0047L14.7453 48.6383ZM40.0164 21.7784C52.6582 11.9851 67.634 7.57932 82.2576 3.44342L81.4412 0.556653C66.8756 4.67614 51.3456 9.20709 38.1792 19.4067L40.0164 21.7784Z"
              />
            </svg>
            <span class="ml-2 -mt-2 text-sm font-semibold text-blue-600">
              {{ t('recommended') }}
            </span>
          </div>
          <div class="p-6 border-none">
            <h2 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">
              {{ p.name }}
            </h2>
            <p class="mt-4 text-sm text-gray-500 dark:text-gray-100">
              {{ t(convertKey(p.description)) }}
              {{ t('plan-solo') }}
            </p>
            <p class="mt-8">
              <span class="text-4xl font-extrabold text-gray-900 dark:text-white">€{{ getPrice(p, segmentVal) }}</span>
              <span class="text-base font-medium text-gray-500 dark:text-gray-100">/{{ isYearly ? 'yr' : 'mo' }}</span>
            </p>
            <span v-if="isYearly" class="text-md ml-3 rounded-full bg-emerald-500 px-1.5 font-semibold text-white"> {{ getSale(p) }} </span>
            <button
              v-if="p.stripe_id !== 'free'"
              :class="{ 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-700': currentPlanSuggest?.name === p.name, 'bg-gray-400 dark:bg-white dark:text-black hover:bg-gray-500 focus:ring-gray-500': currentPlanSuggest?.name !== p.name, 'cursor-not-allowed bg-gray-500 dark:bg-gray-400': currentPlan?.name === p.name }"
              class="block w-full py-2 mt-8 text-sm font-semibold text-center text-white border border-gray-800 rounded-md"
              :disabled="currentPlan?.name === p.name || isMobile" @click="openChangePlan(p.stripe_id)"
            >
              {{ isMobile ? t('check-on-web') : t('plan-upgrade') }}
            </button>
          </div>
          <div class="px-6 pt-6 pb-8">
            <h3 class="text-xs font-medium tracking-wide text-gray-900 uppercase dark:text-white">
              {{ t('plan-whats-included') }}
            </h3>
            <ul role="list" class="mt-6 space-y-4">
              <li v-for="(f, index) in planFeatures(p)" :key="index" class="flex space-x-3">
                <svg class="flex-shrink-0 w-5 h-5 text-green-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span class="text-sm text-gray-500 dark:text-gray-100">{{ f }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <section v-if="!isMobile" class="py-12 lg:py-20 sm:py-16">
        <div class="px-4 mx-auto max-w-7xl lg:px-8 sm:px-6">
          <div class="max-w-2xl mx-auto text-center">
            <h2 class="text-3xl font-bold text-white-900 font-pj sm:text-4xl xl:text-5xl dark:text-white">
              {{ t('need-more-contact-us') }}
            </h2>
          </div>

          <BlurBg>
            <template #default>
              <div class="px-16 py-8 lg:px-16 lg:py-14 sm:px-8">
                <div class="md:flex md:items-center lg:space-x-6 md:space-x-4">
                  <div class="grid grid-cols-1 gap-x-12 gap-y-3 sm:grid-cols-2 xl:gap-x-24">
                    <div>
                      <ul class="space-y-3 text-base font-medium text-white font-pj">
                        <li class="flex items-center">
                          <svg class="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                          {{ t('unlimited-updates') }}
                        </li>

                        <li class="flex items-center">
                          <svg class="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                          {{ t('bigger-app-size') }}
                        </li>

                        <li class="flex items-center">
                          <svg class="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                          {{ t('more-version-storage') }}
                        </li>
                      </ul>
                    </div>

                    <div>
                      <ul class="space-y-3 text-base font-medium text-white font-pj">
                        <li class="flex items-center">
                          <svg class="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                          {{ t('custom-domain') }}
                        </li>

                        <li class="flex items-center">
                          <svg class="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                          {{ t('special-api-access') }}
                        </li>

                        <li class="flex items-center">
                          <svg class="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                          {{ t('bulk-upload') }}
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div class="block lg:block md:hidden">
                    <div class="hidden lg:block">
                      <svg class="w-4 h-auto text-gray-600" viewBox="0 0 16 123" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
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

                    <div class="block mt-10 md:hidden">
                      <svg class="w-auto h-4 text-gray-600" viewBox="0 0 172 16" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 11 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 46 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 81 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 116 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 151 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 18 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 53 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 88 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 123 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 158 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 25 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 60 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 95 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 130 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 165 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 32 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 67 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 102 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 137 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 172 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 39 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 74 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 109 1)" />
                        <line y1="-0.5" x2="18.0278" y2="-0.5" transform="matrix(-0.5547 0.83205 0.83205 0.5547 144 1)" />
                      </svg>
                    </div>
                  </div>

                  <div class="mt-10 md:mt-0">
                    <a
                      href="#"
                      title="Get quote now"
                      class="inline-flex items-center justify-center p-6 mt-5 text-base font-bold text-gray-900 transition-all duration-200 bg-white border border-transparent font-pj rounded-xl hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white"
                      role="button"
                      @click="openSupport()"
                    >
                      Get quote now
                    </a>
                  </div>
                </div>
              </div>
            </template>
          </BlurBg>
        </div>
      </section>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
        </route>
